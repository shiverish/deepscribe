using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

namespace SeeScribe.DeepScribe;

/// <summary>
/// Praat met de lokale bridge die DeepScribe opent zodra de app draait.
/// DeepScribe schrijft poort en token weg in een bestand in zijn gebruikersmap;
/// dezelfde bridge wordt door de MCP-server gebruikt.
/// </summary>
public class DeepScribeBridgeClient
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull
    };

    private readonly HttpClient _http;

    public DeepScribeBridgeClient(HttpClient? httpClient = null)
    {
        _http = httpClient ?? new HttpClient { Timeout = TimeSpan.FromSeconds(20) };
    }

    /// <summary>
    /// Zoekt het bridge-bestand op de plaatsen waar Electron zijn gebruikersmap kan aanmaken.
    /// Levert null wanneer DeepScribe niet draait.
    /// </summary>
    public static BridgeInfo? ReadBridgeInfo()
    {
        foreach (var candidate in BridgeFileCandidates())
        {
            try
            {
                if (!File.Exists(candidate)) continue;
                var parsed = JsonSerializer.Deserialize<BridgeInfo>(File.ReadAllText(candidate), JsonOptions);
                if (parsed is { Port: > 0 } && !string.IsNullOrWhiteSpace(parsed.Token)) return parsed;
            }
            catch (Exception ex) when (ex is IOException or JsonException or UnauthorizedAccessException)
            {
                // Probeer de volgende locatie.
            }
        }

        return null;
    }

    private static IEnumerable<string> BridgeFileCandidates()
    {
        var overridePath = Environment.GetEnvironmentVariable("DEEPSCRIBE_BRIDGE_FILE");
        if (!string.IsNullOrWhiteSpace(overridePath))
        {
            yield return overridePath;
            yield break;
        }

        var appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
        yield return Path.Combine(appData, "deepscribe", "deepscribe-mcp-bridge.json");
        yield return Path.Combine(appData, "DeepScribe", "deepscribe-mcp-bridge.json");
    }

    /// <summary>
    /// Controleert of DeepScribe daadwerkelijk bereikbaar is.
    ///
    /// Alleen kijken of het bridge-bestand bestaat is niet genoeg: DeepScribe ruimt dat
    /// bestand op bij netjes afsluiten, maar bij een crash blijft het achter. Er wordt
    /// daarom een health-verzoek gedaan; dat vraagt niets van de gebruikersinterface.
    /// </summary>
    public async Task<bool> IsReachableAsync(CancellationToken cancellationToken = default)
    {
        var bridge = ReadBridgeInfo();
        if (bridge is null) return false;

        try
        {
            using var probe = new HttpRequestMessage(HttpMethod.Get, $"http://127.0.0.1:{bridge.Port}/health");
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            timeout.CancelAfter(TimeSpan.FromSeconds(3));

            using var response = await _http.SendAsync(probe, timeout.Token).ConfigureAwait(false);
            return response.IsSuccessStatusCode;
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or OperationCanceledException)
        {
            return false;
        }
    }

    /// <summary>
    /// Roept een methode aan op de DeepScribe-bridge en levert het ruwe resultaat terug.
    /// </summary>
    public async Task<JsonElement> CallAsync(string method, object? parameters = null, CancellationToken cancellationToken = default)
    {
        var bridge = ReadBridgeInfo()
            ?? throw new DeepScribeUnavailableException("DeepScribe draait niet. Start DeepScribe en probeer opnieuw.");

        var body = JsonSerializer.Serialize(new { method, @params = parameters ?? new { } }, JsonOptions);

        using var request = new HttpRequestMessage(HttpMethod.Post, $"http://127.0.0.1:{bridge.Port}/rpc")
        {
            Content = new StringContent(body, Encoding.UTF8, "application/json")
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", bridge.Token);

        HttpResponseMessage response;
        try
        {
            response = await _http.SendAsync(request, cancellationToken).ConfigureAwait(false);
        }
        catch (HttpRequestException ex)
        {
            // Een geweigerde verbinding betekent dat er niets meer luistert op de poort.
            // Dat is een afwezige DeepScribe, geen haperende verbinding.
            if (ex.InnerException is System.Net.Sockets.SocketException
                {
                    SocketErrorCode: System.Net.Sockets.SocketError.ConnectionRefused
                        or System.Net.Sockets.SocketError.HostUnreachable
                })
            {
                throw new DeepScribeUnavailableException(
                    "DeepScribe draait niet meer. Start DeepScribe en probeer opnieuw.", ex);
            }

            throw new DeepScribeTransportException(
                $"De verbinding met DeepScribe brak af tijdens '{method}'.", ex);
        }
        catch (TaskCanceledException ex)
        {
            throw new DeepScribeTransportException(
                $"DeepScribe reageerde niet op tijd tijdens '{method}'.", ex);
        }

        using var stream = await response.Content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false);
        using var document = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken).ConfigureAwait(false);
        var root = document.RootElement;

        var ok = root.TryGetProperty("ok", out var okElement) && okElement.ValueKind == JsonValueKind.True;
        if (!ok)
        {
            var message = root.TryGetProperty("error", out var errorElement) && errorElement.ValueKind == JsonValueKind.String
                ? errorElement.GetString()
                : $"DeepScribe gaf HTTP {(int)response.StatusCode}.";
            throw new DeepScribeException(message ?? "Onbekende fout uit DeepScribe.");
        }

        return root.TryGetProperty("result", out var result) ? result.Clone() : default;
    }

    public async Task<List<DeepScribeProject>> ListProjectsAsync(CancellationToken cancellationToken = default)
    {
        var result = await CallAsync("list_projects", cancellationToken: cancellationToken).ConfigureAwait(false);
        var projects = new List<DeepScribeProject>();
        if (result.ValueKind != JsonValueKind.Array) return projects;

        foreach (var item in result.EnumerateArray())
        {
            var id = item.TryGetProperty("id", out var idElement) ? idElement.GetString() : null;
            var title = item.TryGetProperty("title", out var titleElement) ? titleElement.GetString() : null;
            if (string.IsNullOrWhiteSpace(id)) continue;
            projects.Add(new DeepScribeProject(id, title ?? "Naamloos project"));
        }

        return projects;
    }

    /// <summary>
    /// Opent DeepScribe en brengt het naar de voorgrond, voor zover het proces bereikbaar is.
    /// </summary>
    public static void FocusDeepScribe()
    {
        try
        {
            var process = Process.GetProcessesByName("DeepScribe").FirstOrDefault();
            if (process is null) return;
            NativeMethods.SetForegroundWindow(process.MainWindowHandle);
        }
        catch (Exception ex) when (ex is InvalidOperationException or System.ComponentModel.Win32Exception)
        {
            // Focus is een gemak, geen voorwaarde.
        }
    }
}

public record BridgeInfo
{
    public int Port { get; init; }
    public string Token { get; init; } = string.Empty;
}

public record DeepScribeProject(string Id, string Title);

public class DeepScribeException : Exception
{
    public DeepScribeException(string message, Exception? inner = null) : base(message, inner) { }
}

/// <summary>
/// DeepScribe draait niet: er is geen bridge-bestand, dus er valt niets te bereiken.
/// </summary>
public class DeepScribeUnavailableException : DeepScribeException
{
    public DeepScribeUnavailableException(string message, Exception? inner = null) : base(message, inner) { }
}

/// <summary>
/// DeepScribe draait wél, maar de aanroep kwam niet aan of niet terug. Bewust een eigen
/// soort fout: dit als "DeepScribe draait niet" melden verbergt de echte oorzaak.
/// </summary>
public class DeepScribeTransportException : DeepScribeException
{
    public DeepScribeTransportException(string message, Exception? inner = null) : base(message, inner) { }
}

internal static class NativeMethods
{
    [System.Runtime.InteropServices.DllImport("user32.dll")]
    internal static extern bool SetForegroundWindow(IntPtr hWnd);
}
