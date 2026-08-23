using System.IO;
using System.Text.Json;
using SeeScribe.Core.Interfaces;
using SeeScribe.Core.Models;

namespace SeeScribe.Storage;

/// <summary>
/// Bewaart de instellingen van SeeScribe naast de applicatiegegevens van de gebruiker.
/// Sinds vastleggingen naar DeepScribe gaan in plaats van naar een AI-aanbieder,
/// staan er geen sleutels of tokens meer in en is versleuteling niet meer nodig.
/// </summary>
public class SettingsService : ISettingsService
{
    private static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = true };

    private readonly string _settingsFilePath;
    private AppSettings _currentSettings;

    public AppSettings Current => _currentSettings;

    public SettingsService()
    {
        var appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
        var dir = Path.Combine(appData, "SeeScribe");
        Directory.CreateDirectory(dir);
        _settingsFilePath = Path.Combine(dir, "settings.json");
        _currentSettings = LoadSettings();
    }

    public AppSettings LoadSettings()
    {
        if (!File.Exists(_settingsFilePath))
        {
            _currentSettings = new AppSettings();
            _ = SaveSettingsAsync(_currentSettings);
            return _currentSettings;
        }

        try
        {
            var settings = JsonSerializer.Deserialize<AppSettings>(File.ReadAllText(_settingsFilePath));
            if (settings != null)
            {
                _currentSettings = settings;
                return _currentSettings;
            }
        }
        catch (Exception ex) when (ex is IOException or JsonException or UnauthorizedAccessException)
        {
            // Een onleesbaar bestand mag het starten niet blokkeren; val terug op standaarden.
        }

        _currentSettings = new AppSettings();
        return _currentSettings;
    }

    public async Task SaveSettingsAsync(AppSettings settings)
    {
        _currentSettings = settings;
        var json = JsonSerializer.Serialize(settings, JsonOptions);
        await File.WriteAllTextAsync(_settingsFilePath, json).ConfigureAwait(false);
    }
}
