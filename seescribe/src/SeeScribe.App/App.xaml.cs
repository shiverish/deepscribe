using System.Windows;
using Microsoft.Extensions.DependencyInjection;
using SeeScribe.App.Services;
using SeeScribe.App.ViewModels;
using SeeScribe.App.Views;
using SeeScribe.Core.Interfaces;
using SeeScribe.Core.Models;
using SeeScribe.DeepScribe;
using SeeScribe.Storage;

namespace SeeScribe.App;

public partial class App : System.Windows.Application
{
    private IServiceProvider _serviceProvider = null!;
    private ISettingsService _settingsService = null!;
    private IScreenCaptureService _screenCaptureService = null!;
    private IHotkeyService _hotkeyService = null!;
    private OverlayWindow? _activeOverlayWindow;
    private SingleInstanceService _singleInstance = null!;
    private DeepScribeCaptureWriter _captureWriter = null!;
    private DeepScribeWatcher _deepScribeWatcher = null!;

    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        // Een tweede start geeft zijn opdracht door aan de draaiende instantie en stopt.
        // Zo kan DeepScribe SeeScribe zowel starten als aansturen met dezelfde aanroep.
        _singleInstance = new SingleInstanceService();
        if (!_singleInstance.IsFirstInstance)
        {
            SingleInstanceService.SendCommand(SingleInstanceService.ParseCommand(e.Args));
            _singleInstance.Dispose();
            Shutdown();
            return;
        }

        _singleInstance.CommandReceived += (s, command) => Dispatcher.Invoke(() => HandleCommand(command));
        _singleInstance.StartListening();

        _captureWriter = new DeepScribeCaptureWriter();

        var services = new ServiceCollection();
        ConfigureServices(services);
        _serviceProvider = services.BuildServiceProvider();

        _settingsService = _serviceProvider.GetRequiredService<ISettingsService>();
        _screenCaptureService = _serviceProvider.GetRequiredService<IScreenCaptureService>();
        _hotkeyService = _serviceProvider.GetRequiredService<IHotkeyService>();

        RegisterHotkeys();

        // SeeScribe kan zonder DeepScribe niets bewaren, dus het heeft geen zin
        // om achter te blijven wanneer DeepScribe wordt afgesloten.
        _deepScribeWatcher = new DeepScribeWatcher();
        _deepScribeWatcher.DeepScribeClosed += (s, ev) => Dispatcher.Invoke(ShutdownWhenOverlayIsDone);
        _deepScribeWatcher.Start();

        var startupCommand = SingleInstanceService.ParseCommand(e.Args);
        if (startupCommand != SingleInstanceService.CommandShow)
        {
            // Geef het venster de kans te tekenen voordat het scherm wordt bevroren.
            Dispatcher.BeginInvoke(new Action(() => HandleCommand(startupCommand)),
                System.Windows.Threading.DispatcherPriority.ApplicationIdle);
        }
    }

    /// <summary>
    /// Voert een opdracht uit die via de opstartargumenten of vanuit DeepScribe binnenkomt.
    /// </summary>
    private void HandleCommand(string command)
    {
        switch (command)
        {
            case SingleInstanceService.CommandCapture:
            case SingleInstanceService.CommandRecord:
                TriggerSnapshotCapture();
                break;
            case SingleInstanceService.CommandQuit:
                ShutdownWhenOverlayIsDone();
                break;
            default:
                OpenSettings();
                break;
        }
    }

    /// <summary>
    /// Sluit af, maar niet ten koste van werk dat nog op het scherm staat.
    /// Is er een overlay open, dan mag de gebruiker eerst afmaken waar hij mee bezig is.
    /// </summary>
    private void ShutdownWhenOverlayIsDone()
    {
        if (_activeOverlayWindow is { IsVisible: true })
        {
            _activeOverlayWindow.Closed += (s, e) => Dispatcher.BeginInvoke(new Action(ShutdownApp));
            return;
        }

        ShutdownApp();
    }

    private void ConfigureServices(IServiceCollection services)
    {
        services.AddSingleton<ISettingsService, SettingsService>();
        services.AddSingleton<IScreenCaptureService, ScreenCaptureService>();
        services.AddSingleton<IHotkeyService, HotkeyService>();
        services.AddSingleton<IAudioRecordingService, AudioRecordingService>();

        services.AddTransient<OverlayViewModel>();
        services.AddTransient<SettingsViewModel>();
    }

    public void RegisterHotkeys()
    {
        _hotkeyService.UnregisterAll();

        var hotkeys = _settingsService.Current.Hotkeys;

        if (!string.IsNullOrWhiteSpace(hotkeys.SnapshotHotkey))
        {
            _hotkeyService.RegisterHotKey("Snapshot", hotkeys.SnapshotHotkey, () =>
            {
                Dispatcher.Invoke(TriggerSnapshotCapture);
            });
        }
    }

    public void TriggerSnapshotCapture()
    {
        try
        {
            if (_activeOverlayWindow != null && _activeOverlayWindow.IsVisible)
            {
                _activeOverlayWindow.Activate();
                return;
            }

            // Lees eerst af wat er op de voorgrond stond; daarna neemt de overlay het over.
            var windowContext = ForegroundWindowService.Capture();

            var cursorPos = System.Windows.Forms.Cursor.Position;
            var screenInfo = _screenCaptureService.GetScreenContainingPoint(cursorPos.X, cursorPos.Y);
            var screenBitmap = _screenCaptureService.CaptureScreenAtPoint(cursorPos.X, cursorPos.Y);

            var overlayVm = _serviceProvider.GetRequiredService<OverlayViewModel>();
            _activeOverlayWindow = new OverlayWindow(overlayVm);

            overlayVm.SaveHandler = SendCaptureToDeepScribeAsync;

            _activeOverlayWindow.Closed += (s, e) =>
            {
                _activeOverlayWindow = null;
            };

            _activeOverlayWindow.SetWindowContext(windowContext);
            _activeOverlayWindow.SetupForScreen(screenBitmap, screenInfo);
            _activeOverlayWindow.Show();
            _activeOverlayWindow.Activate();
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"Failed to trigger snapshot: {ex.Message}");
        }
    }

    /// <summary>
    /// Schrijft de vastlegging weg naar DeepScribe. De annotaties gaan als gegevens mee,
    /// niet alleen als platgeslagen afbeelding, zodat een agent weet wat er is aangewezen.
    /// </summary>
    private async Task<CaptureSaveOutcome> SendCaptureToDeepScribeAsync(CaptureResult capture)
    {
        try
        {
            var destination = string.IsNullOrWhiteSpace(capture.TargetProjectId)
                ? CaptureDestination.Inbox
                : CaptureDestination.InProject(capture.TargetProjectId);

            var result = await _captureWriter.WriteAsync(capture, destination);
            return CaptureSaveOutcome.Saved(result.Title);
        }
        catch (DeepScribeUnavailableException)
        {
            return CaptureSaveOutcome.Failed("DeepScribe draait niet. Start DeepScribe en probeer opnieuw.");
        }
        catch (DeepScribeTransportException ex)
        {
            return CaptureSaveOutcome.Failed(ex.Message);
        }
        catch (DeepScribeException ex)
        {
            return CaptureSaveOutcome.Failed(ex.Message);
        }
    }

    public void OpenSettings()
    {
        var settingsVm = _serviceProvider.GetRequiredService<SettingsViewModel>();
        var settingsWindow = new SettingsWindow(settingsVm);
        settingsWindow.Closed += (s, e) => RegisterHotkeys();
        settingsWindow.ShowDialog();
    }

    private void ShutdownApp()
    {
        _deepScribeWatcher?.Dispose();
        _hotkeyService?.Dispose();
        Shutdown();
    }

    protected override void OnExit(ExitEventArgs e)
    {
        _deepScribeWatcher?.Dispose();
        _hotkeyService?.Dispose();
        _singleInstance?.Dispose();
        base.OnExit(e);
    }
}
