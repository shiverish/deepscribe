using System.IO;
using System.IO.Pipes;
using System.Text;

namespace SeeScribe.App.Services;

/// <summary>
/// Zorgt dat er maar één SeeScribe draait en dat een tweede start zijn opdracht
/// doorgeeft aan de al draaiende instantie. Dit is wat DeepScribe gebruikt om
/// SeeScribe te starten én om een bestaande instantie een vastlegging te laten openen.
/// </summary>
public sealed class SingleInstanceService : IDisposable
{
    private const string MutexName = @"Global\SeeScribe.SingleInstance";
    private const string PipeName = "SeeScribe.Command";

    /// <summary>Opdracht om een momentopname te starten.</summary>
    public const string CommandCapture = "capture";

    /// <summary>Opdracht om een schermopname te starten.</summary>
    public const string CommandRecord = "record";

    /// <summary>Opdracht om het venster naar voren te halen zonder vast te leggen.</summary>
    public const string CommandShow = "show";

    /// <summary>Opdracht om SeeScribe af te sluiten. Gebruikt door DeepScribe bij afsluiten.</summary>
    public const string CommandQuit = "quit";

    private readonly Mutex _mutex;
    private CancellationTokenSource? _listenerCancellation;

    public bool IsFirstInstance { get; }

    /// <summary>
    /// Wordt aangeroepen wanneer een tweede start een opdracht doorgeeft.
    /// Draait niet op de UI-draad.
    /// </summary>
    public event EventHandler<string>? CommandReceived;

    public SingleInstanceService()
    {
        _mutex = new Mutex(true, MutexName, out var createdNew);
        IsFirstInstance = createdNew;
    }

    /// <summary>
    /// Stuurt een opdracht naar de draaiende instantie. Levert false wanneer die
    /// niet bereikbaar is, bijvoorbeeld omdat hij net wordt afgesloten.
    /// </summary>
    public static bool SendCommand(string command, int timeoutMs = 2000)
    {
        try
        {
            using var client = new NamedPipeClientStream(".", PipeName, PipeDirection.Out);
            client.Connect(timeoutMs);
            var payload = Encoding.UTF8.GetBytes(command);
            client.Write(payload, 0, payload.Length);
            client.Flush();
            return true;
        }
        catch (Exception ex) when (ex is TimeoutException or IOException or UnauthorizedAccessException)
        {
            return false;
        }
    }

    /// <summary>
    /// Begint te luisteren naar opdrachten van latere starts.
    /// </summary>
    public void StartListening()
    {
        if (!IsFirstInstance) return;

        _listenerCancellation = new CancellationTokenSource();
        _ = Task.Run(() => ListenLoopAsync(_listenerCancellation.Token));
    }

    private async Task ListenLoopAsync(CancellationToken cancellationToken)
    {
        while (!cancellationToken.IsCancellationRequested)
        {
            try
            {
                using var server = new NamedPipeServerStream(
                    PipeName, PipeDirection.In, 1, PipeTransmissionMode.Byte, PipeOptions.Asynchronous);

                await server.WaitForConnectionAsync(cancellationToken).ConfigureAwait(false);

                using var reader = new StreamReader(server, Encoding.UTF8);
                var command = (await reader.ReadToEndAsync(cancellationToken).ConfigureAwait(false)).Trim();

                if (!string.IsNullOrWhiteSpace(command))
                {
                    CommandReceived?.Invoke(this, command);
                }
            }
            catch (OperationCanceledException)
            {
                return;
            }
            catch (IOException)
            {
                // De verbinding brak af; de volgende ronde opent een nieuwe pipe.
            }
        }
    }

    /// <summary>
    /// Leest de opdracht uit de opstartargumenten. Levert <see cref="CommandShow"/>
    /// wanneer er niets bruikbaars is meegegeven.
    /// </summary>
    public static string ParseCommand(string[] args)
    {
        foreach (var arg in args)
        {
            var normalized = arg.TrimStart('-', '/').ToLowerInvariant();
            if (normalized is CommandCapture or CommandRecord or CommandShow or CommandQuit) return normalized;
        }

        return CommandShow;
    }

    public void Dispose()
    {
        _listenerCancellation?.Cancel();
        _listenerCancellation?.Dispose();

        if (IsFirstInstance)
        {
            try { _mutex.ReleaseMutex(); } catch (ApplicationException) { /* Al vrijgegeven. */ }
        }

        _mutex.Dispose();
    }
}
