namespace SeeScribe.Core.Models;

public class AppSettings
{
    public HotkeySettings Hotkeys { get; set; } = new();
    public GeneralSettings General { get; set; } = new();
}

public class HotkeySettings
{
    public string SnapshotHotkey { get; set; } = "Ctrl+Alt+S";
    public string VideoHotkey { get; set; } = "Ctrl+Alt+V";
}

public class GeneralSettings
{
    public bool PlayNotificationSound { get; set; } = true;
    public string PrimaryColorHex { get; set; } = "#3B82F6";
    public int MaxVideoSeconds { get; set; } = 15;

    /// <summary>
    /// Het project waar een vastlegging standaard naartoe gaat. Leeg betekent de inbox.
    /// </summary>
    public string? DefaultProjectId { get; set; }
}
