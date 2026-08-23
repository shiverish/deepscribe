using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using SeeScribe.Core.Interfaces;
using SeeScribe.DeepScribe;

namespace SeeScribe.App.ViewModels;

/// <summary>
/// Instellingen van SeeScribe. Sinds vastleggingen naar DeepScribe gaan in plaats van
/// naar een AI-aanbieder, is hier geen sleutel- of modelbeheer meer nodig.
/// </summary>
public partial class SettingsViewModel : ObservableObject
{
    private readonly ISettingsService _settingsService;

    [ObservableProperty]
    private string _snapshotHotkey = "Ctrl+Alt+S";

    [ObservableProperty]
    private bool _playNotificationSound = true;

    [ObservableProperty]
    private int _maxVideoSeconds = 15;

    [ObservableProperty]
    private string _deepScribeStatus = string.Empty;

    [ObservableProperty]
    private string _statusMessage = string.Empty;

    public event EventHandler? RequestClose;

    public SettingsViewModel(ISettingsService settingsService)
    {
        _settingsService = settingsService;

        var settings = _settingsService.Current;
        SnapshotHotkey = settings.Hotkeys.SnapshotHotkey;
        PlayNotificationSound = settings.General.PlayNotificationSound;
        MaxVideoSeconds = settings.General.MaxVideoSeconds;

        _ = RefreshDeepScribeStatusAsync();
    }

    [RelayCommand]
    public async Task RefreshDeepScribeStatusAsync()
    {
        DeepScribeStatus = "Bezig met controleren...";
        DeepScribeStatus = await new DeepScribeBridgeClient().IsReachableAsync().ConfigureAwait(true)
            ? "DeepScribe draait en is bereikbaar."
            : "DeepScribe draait niet. Vastleggingen kunnen nu niet worden bewaard.";
    }

    [RelayCommand]
    public async Task SaveAsync()
    {
        var settings = _settingsService.Current;
        settings.Hotkeys.SnapshotHotkey = SnapshotHotkey.Trim();
        settings.General.PlayNotificationSound = PlayNotificationSound;
        settings.General.MaxVideoSeconds = MaxVideoSeconds;

        await _settingsService.SaveSettingsAsync(settings);
        StatusMessage = "Opgeslagen.";
        RequestClose?.Invoke(this, EventArgs.Empty);
    }

    [RelayCommand]
    public void Cancel() => RequestClose?.Invoke(this, EventArgs.Empty);
}
