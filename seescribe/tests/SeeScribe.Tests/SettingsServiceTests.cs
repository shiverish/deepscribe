using System.IO;
using FluentAssertions;
using SeeScribe.Storage;
using Xunit;

namespace SeeScribe.Tests;

public class SettingsServiceTests
{
    [Fact]
    public void Settings_survive_a_save_and_reload()
    {
        var service = new SettingsService();
        var original = service.Current.Hotkeys.SnapshotHotkey;

        try
        {
            var settings = service.Current;
            settings.Hotkeys.SnapshotHotkey = "Ctrl+Shift+F9";
            settings.General.MaxVideoSeconds = 42;
            service.SaveSettingsAsync(settings).GetAwaiter().GetResult();

            var reloaded = new SettingsService().Current;

            reloaded.Hotkeys.SnapshotHotkey.Should().Be("Ctrl+Shift+F9");
            reloaded.General.MaxVideoSeconds.Should().Be(42);
        }
        finally
        {
            var settings = service.Current;
            settings.Hotkeys.SnapshotHotkey = original;
            settings.General.MaxVideoSeconds = 15;
            service.SaveSettingsAsync(settings).GetAwaiter().GetResult();
        }
    }

    [Fact]
    public void Settings_fall_back_to_defaults_when_the_file_is_unreadable()
    {
        // Een beschadigd instellingenbestand mag het starten niet blokkeren.
        var path = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "SeeScribe", "settings.json");
        var backup = File.Exists(path) ? File.ReadAllText(path) : null;

        try
        {
            File.WriteAllText(path, "dit is geen geldige json");

            var settings = new SettingsService().Current;

            settings.Hotkeys.SnapshotHotkey.Should().Be("Ctrl+Alt+S");
        }
        finally
        {
            if (backup is not null) File.WriteAllText(path, backup);
        }
    }
}
