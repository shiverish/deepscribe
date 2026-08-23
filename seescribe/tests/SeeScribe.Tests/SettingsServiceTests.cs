using System.IO;
using FluentAssertions;
using SeeScribe.Storage;
using Xunit;

namespace SeeScribe.Tests;

/// <summary>
/// Werkt in een eigen tijdelijke map. Deze tests mogen nooit in de echte instellingen
/// van de gebruiker schrijven, en ook niet met elkaar om hetzelfde bestand vechten.
/// </summary>
public class SettingsServiceTests : IDisposable
{
    private readonly string _directory;

    public SettingsServiceTests()
    {
        _directory = Path.Combine(Path.GetTempPath(), $"seescribe-settings-{Guid.NewGuid():N}");
    }

    public void Dispose()
    {
        if (Directory.Exists(_directory)) Directory.Delete(_directory, recursive: true);
    }

    [Fact]
    public async Task Settings_survive_a_save_and_reload()
    {
        var service = new SettingsService(_directory);
        var settings = service.Current;
        settings.Hotkeys.SnapshotHotkey = "Ctrl+Shift+F9";
        settings.General.MaxVideoSeconds = 42;

        await service.SaveSettingsAsync(settings);

        var reloaded = new SettingsService(_directory).Current;

        reloaded.Hotkeys.SnapshotHotkey.Should().Be("Ctrl+Shift+F9");
        reloaded.General.MaxVideoSeconds.Should().Be(42);
    }

    [Fact]
    public void Settings_start_from_defaults_when_there_is_no_file_yet()
    {
        var settings = new SettingsService(_directory).Current;

        settings.Hotkeys.SnapshotHotkey.Should().Be("Ctrl+Alt+S");
    }

    [Fact]
    public void Settings_fall_back_to_defaults_when_the_file_is_unreadable()
    {
        // Een beschadigd instellingenbestand mag het starten niet blokkeren.
        Directory.CreateDirectory(_directory);
        File.WriteAllText(Path.Combine(_directory, "settings.json"), "dit is geen geldige json");

        var settings = new SettingsService(_directory).Current;

        settings.Hotkeys.SnapshotHotkey.Should().Be("Ctrl+Alt+S");
    }

    [Fact]
    public void Opening_settings_does_not_create_a_file_before_anything_is_saved()
    {
        _ = new SettingsService(_directory);

        File.Exists(Path.Combine(_directory, "settings.json")).Should().BeFalse();
    }
}
