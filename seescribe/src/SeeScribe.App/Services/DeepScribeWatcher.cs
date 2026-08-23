using SeeScribe.DeepScribe;

namespace SeeScribe.App.Services;

/// <summary>
/// Let op of DeepScribe nog draait. SeeScribe kan zonder DeepScribe niets bewaren,
/// dus achterblijven als losse systeemvakicoon heeft geen zin.
///
/// De bridge wordt daadwerkelijk aangesproken. Alleen kijken of het bridge-bestand
/// bestaat is onvoldoende: bij netjes afsluiten wordt dat opgeruimd, maar na een crash
/// blijft het achter en zou SeeScribe blijven denken dat DeepScribe nog leeft.
/// </summary>
public sealed class DeepScribeWatcher : IDisposable
{
    /// <summary>
    /// Hoe vaak er gekeken wordt. Ruim genoeg om niet in de weg te zitten,
    /// kort genoeg om SeeScribe niet minutenlang te laten rondhangen.
    /// </summary>
    private static readonly TimeSpan Interval = TimeSpan.FromSeconds(5);

    /// <summary>
    /// Aantal opeenvolgende keren dat DeepScribe weg moet zijn voordat er wordt
    /// afgesloten. Voorkomt dat een herstart van DeepScribe SeeScribe meesleept.
    /// </summary>
    private const int MissesBeforeClosing = 3;

    private readonly DeepScribeBridgeClient _client = new();
    private readonly System.Timers.Timer _timer;
    private int _consecutiveMisses;
    private bool _hasSeenDeepScribe;
    private bool _reported;

    /// <summary>
    /// Wordt eenmalig gemeld zodra DeepScribe weg blijkt. Draait niet op de UI-draad.
    /// </summary>
    public event EventHandler? DeepScribeClosed;

    public DeepScribeWatcher()
    {
        _timer = new System.Timers.Timer(Interval.TotalMilliseconds) { AutoReset = true };
        _timer.Elapsed += async (s, e) => await CheckAsync().ConfigureAwait(false);
    }

    public void Start()
    {
        _ = CheckAsync();
        _timer.Start();
    }

    private async Task CheckAsync()
    {
        if (_reported) return;

        if (await _client.IsReachableAsync().ConfigureAwait(false))
        {
            _hasSeenDeepScribe = true;
            _consecutiveMisses = 0;
            return;
        }

        // Is DeepScribe nooit gezien, dan is SeeScribe waarschijnlijk los gestart.
        // Dan is afsluiten ongepast; de gebruiker start DeepScribe misschien zo meteen.
        if (!_hasSeenDeepScribe) return;

        if (++_consecutiveMisses < MissesBeforeClosing) return;

        _reported = true;
        _timer.Stop();
        DeepScribeClosed?.Invoke(this, EventArgs.Empty);
    }

    public void Dispose()
    {
        _timer.Stop();
        _timer.Dispose();
    }
}
