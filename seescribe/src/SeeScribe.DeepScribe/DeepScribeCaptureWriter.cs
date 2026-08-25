using System.Text.Json;
using SeeScribe.Core.Models;

namespace SeeScribe.DeepScribe;

/// <summary>
/// Schrijft een vastlegging weg naar DeepScribe. Dit vervangt de route naar
/// een AI-aanbieder: SeeScribe levert aan, een agent pakt het daar op.
/// </summary>
public class DeepScribeCaptureWriter
{
    private static readonly JsonSerializerOptions AnnotationJsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull,
        WriteIndented = false,
        // Het gereedschap als naam wegschrijven en niet als getal. Een lezer die de
        // enum niet kent, kan met "Rectangle" wel iets en met 2 niets.
        Converters = { new System.Text.Json.Serialization.JsonStringEnumConverter() }
    };

    private readonly DeepScribeBridgeClient _client;

    public DeepScribeCaptureWriter(DeepScribeBridgeClient? client = null)
    {
        _client = client ?? new DeepScribeBridgeClient();
    }

    /// <summary>
    /// Maakt een blok of taak in DeepScribe met de afbeelding als bijlage en de
    /// annotaties als gestructureerde gegevens.
    /// </summary>
    public async Task<CaptureWriteResult> WriteAsync(
        CaptureResult capture,
        CaptureDestination destination,
        CancellationToken cancellationToken = default)
    {
        destination = destination with { RequestId = destination.RequestId ?? capture.Id.ToString("N") };

        var title = BuildTitle(capture);
        var content = AnnotationMarkdown.Describe(capture, title);

        var blockId = await CreateCaptureAsync(destination, title, content, cancellationToken).ConfigureAwait(false);

        await AttachImageAsync(blockId, capture, cancellationToken).ConfigureAwait(false);
        await AttachAnnotationDataAsync(blockId, capture, cancellationToken).ConfigureAwait(false);
        await AttachAudioAsync(blockId, capture, cancellationToken).ConfigureAwait(false);

        return new CaptureWriteResult(blockId, title);
    }

    /// <summary>
    /// Naam waaronder SeeScribe zich bij DeepScribe meldt. De takenstroom van DeepScribe
    /// verwacht een claimant; SeeScribe is er formeel een, ook al drukt een mens op de knop.
    /// </summary>
    private const string ClaimantId = "seescribe";

    private const string ClaimantName = "SeeScribe";

    private async Task<string> CreateCaptureAsync(
        CaptureDestination destination, string title, string content, CancellationToken cancellationToken)
    {
        var result = await _client.CallAsync("create_capture", new
        {
            title,
            content,
            // Leeg betekent de inbox. Een vastlegging hoeft niet bij een project te horen.
            projectId = destination.ProjectId,
            // Direct oppakbaar door welke agent dan ook.
            assignTo = destination.AssignTo,
            agentId = ClaimantId,
            agentTarget = "custom",
            customAgentName = ClaimantName,
            // Het id van de vastlegging dient tegelijk als sleutel tegen dubbel aanmaken
            // wanneer een verzoek opnieuw wordt gedaan.
            requestId = destination.RequestId,
            tags = new[] { "seescribe", "schermvastlegging" }
        }, cancellationToken).ConfigureAwait(false);

        return ExtractId(result);
    }

    private async Task AttachImageAsync(string blockId, CaptureResult capture, CancellationToken cancellationToken)
    {
        var image = capture.AnnotatedImageData;
        if (image is null || image.Length == 0) return;

        await _client.CallAsync("create_attachment", new
        {
            blockId,
            fileName = $"seescribe-{capture.Timestamp:yyyyMMdd-HHmmss}.png",
            fileType = "image/png",
            base64 = Convert.ToBase64String(image)
        }, cancellationToken).ConfigureAwait(false);
    }

    /// <summary>
    /// Zet de annotaties als JSON naast de afbeelding. Een agent kan daarmee
    /// exact bepalen wat waar is aangewezen zonder de pixels te hoeven lezen.
    /// </summary>
    /// <summary>
    /// Voegt een ingesproken toelichting toe. Een agent kan die uitluisteren of
    /// laten transcriberen; SeeScribe doet dat zelf niet.
    /// </summary>
    private async Task AttachAudioAsync(string blockId, CaptureResult capture, CancellationToken cancellationToken)
    {
        var audio = capture.AudioData;
        if (audio is null || audio.Length == 0) return;

        await _client.CallAsync("create_attachment", new
        {
            blockId,
            fileName = $"seescribe-spraak-{capture.Timestamp:yyyyMMdd-HHmmss}.wav",
            fileType = "audio/wav",
            base64 = Convert.ToBase64String(audio)
        }, cancellationToken).ConfigureAwait(false);
    }

    private async Task AttachAnnotationDataAsync(string blockId, CaptureResult capture, CancellationToken cancellationToken)
    {
        if (capture.Annotations.Count == 0) return;

        var payload = JsonSerializer.SerializeToUtf8Bytes(new
        {
            capture.ScreenWidth,
            capture.ScreenHeight,
            capture.ScreenScalingFactor,
            window = capture.Window,
            annotations = capture.Annotations
        }, AnnotationJsonOptions);

        await _client.CallAsync("create_attachment", new
        {
            blockId,
            fileName = $"seescribe-annotaties-{capture.Timestamp:yyyyMMdd-HHmmss}.json",
            fileType = "application/json",
            base64 = Convert.ToBase64String(payload)
        }, cancellationToken).ConfigureAwait(false);
    }

    private static string BuildTitle(CaptureResult capture)
    {
        // Wie alleen een beschrijving typt en de titelregel leeg laat, krijgt liever
        // de eerste regel daarvan boven "Schermvastlegging — Chrome".
        if (FirstLineOf(capture.PromptText) is { } prompt) return prompt;
        if (FirstLineOf(capture.DescriptionText) is { } description) return description;

        var window = capture.Window?.WindowTitle;
        if (!string.IsNullOrWhiteSpace(window))
            return $"Schermvastlegging — {(window.Length > 50 ? window[..47] + "..." : window)}";

        return $"Schermvastlegging {capture.Timestamp:dd-MM-yyyy HH:mm}";
    }

    /// <summary>
    /// De eerste regel, ingekort tot een lengte die als titel leesbaar blijft.
    /// Geeft null terug wanneer er niets staat.
    /// </summary>
    private static string? FirstLineOf(string? text)
    {
        var trimmed = text?.Trim();
        if (string.IsNullOrWhiteSpace(trimmed)) return null;

        var firstLine = trimmed.Split('\n')[0].Trim();
        return firstLine.Length > 70 ? firstLine[..67] + "..." : firstLine;
    }

    private static string ExtractId(JsonElement result)
    {
        if (result.ValueKind == JsonValueKind.Object && result.TryGetProperty("id", out var id) && id.GetString() is { } value)
            return value;

        throw new DeepScribeException("DeepScribe gaf geen blok-id terug.");
    }
}

/// <summary>
/// Waar een vastlegging naartoe gaat. Een lege <see cref="ProjectId"/> betekent de inbox;
/// een vastlegging hoeft niet bij een project te horen.
/// </summary>
public record CaptureDestination(
    string? ProjectId = null,
    string AssignTo = "any",
    string? RequestId = null)
{
    /// <summary>
    /// De standaardbestemming: de inbox, meteen oppakbaar door welke agent dan ook.
    /// <see cref="RequestId"/> blijft leeg zodat het id van de vastlegging de sleutel
    /// wordt en opnieuw versturen geen tweede taak oplevert.
    /// </summary>
    public static CaptureDestination Inbox => new(null, "any", null);

    /// <summary>
    /// Dezelfde vastlegging, maar opgehangen aan een project.
    /// </summary>
    public static CaptureDestination InProject(string projectId) => new(projectId, "any", null);
}

public record CaptureWriteResult(string BlockId, string Title);
