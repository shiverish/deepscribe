using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using SeeScribe.Core.Enums;
using SeeScribe.Core.Interfaces;
using SeeScribe.Core.Models;
using SeeScribe.DeepScribe;
using System.Collections.ObjectModel;
using Color = System.Windows.Media.Color;
using ColorConverter = System.Windows.Media.ColorConverter;

namespace SeeScribe.App.ViewModels;

public partial class OverlayViewModel : ObservableObject
{
    private readonly IAudioRecordingService _audioService;
    private readonly ISettingsService _settingsService;

    [ObservableProperty]
    private DrawingTool _activeTool = DrawingTool.Arrow;

    [ObservableProperty]
    private Color _selectedColor = Color.FromRgb(239, 68, 68); // Vibrant Red #EF4444

    [ObservableProperty]
    private double _strokeThickness = 4.0;

    [ObservableProperty]
    private string _promptText = string.Empty;

    /// <summary>
    /// De optionele beschrijving. Meerdere regels, en alleen in beeld wanneer
    /// erom gevraagd wordt: de snelle weg blijft titel typen en Enter.
    /// </summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasDescription))]
    private string _descriptionText = string.Empty;

    [ObservableProperty]
    private bool _isDescriptionVisible;

    /// <summary>
    /// Of er een beschrijving klaarstaat. Het knopje laat dat zien, zodat een
    /// dichtgeklapt veld met tekst erin geen verborgen inhoud wordt.
    /// </summary>
    public bool HasDescription => !string.IsNullOrWhiteSpace(DescriptionText);

    [ObservableProperty]
    private bool _isRecordingAudio;

    [ObservableProperty]
    private string _recordingStatusText = "Inspreken";

    [ObservableProperty]
    private CaptureMode _currentMode = CaptureMode.Snapshot;

    [ObservableProperty]
    private int _stepBadgeCounter = 1;

    [ObservableProperty]
    private bool _isVideoRecordingActive;

    /// <summary>
    /// De projecten waaruit gekozen kan worden. Het eerste item staat voor de inbox:
    /// een vastlegging hoeft niet bij een project te horen.
    /// </summary>
    public ObservableCollection<CaptureTarget> Targets { get; } = new();

    [ObservableProperty]
    private CaptureTarget _selectedTarget = CaptureTarget.Inbox;

    /// <summary>
    /// De opgenomen spraakinstructie. Werd eerder weggegooid; gaat nu als bijlage mee
    /// zodat een agent hem kan uitluisteren of transcriberen.
    /// </summary>
    public byte[]? RecordedAudio { get; private set; }

    [ObservableProperty]
    private bool _isSaving;

    /// <summary>
    /// Terugkoppeling over het opslaan, getoond in de werkbalk. Zonder systeemvakicoon
    /// is dit de enige plek waar de gebruiker ziet of het gelukt is.
    /// </summary>
    [ObservableProperty]
    private string _saveMessage = string.Empty;

    /// <summary>
    /// Bewaart de vastlegging. Wordt door de applicatie ingevuld.
    /// </summary>
    public Func<CaptureResult, Task<CaptureSaveOutcome>>? SaveHandler { get; set; }

    /// <summary>
    /// Haalt de projectenlijst op bij DeepScribe. Mislukt dat, dan blijft alleen de inbox over;
    /// vastleggen moet nooit stuklopen op een lijst die niet geladen kan worden.
    /// </summary>
    public async Task LoadTargetsAsync()
    {
        Targets.Clear();
        Targets.Add(CaptureTarget.Inbox);
        SelectedTarget = CaptureTarget.Inbox;

        try
        {
            var projects = await new DeepScribeBridgeClient().ListProjectsAsync().ConfigureAwait(true);
            foreach (var project in projects.OrderBy(p => p.Title, StringComparer.CurrentCultureIgnoreCase))
            {
                Targets.Add(new CaptureTarget(project.Id, project.Title));
            }
        }
        catch (DeepScribeException)
        {
            // Alleen de inbox aanbieden is een werkbare uitkomst.
        }
    }

    public event EventHandler? RequestClose;
    public event EventHandler? RequestUndo;
    public event EventHandler? RequestClear;

    public OverlayViewModel(IAudioRecordingService audioService, ISettingsService settingsService)
    {
        _audioService = audioService;
        _settingsService = settingsService;
    }

    [RelayCommand]
    public void SelectTool(DrawingTool tool)
    {
        ActiveTool = tool;
    }

    [RelayCommand]
    public void SelectColor(string colorHex)
    {
        try
        {
            var color = (Color)ColorConverter.ConvertFromString(colorHex);
            SelectedColor = color;
        }
        catch { }
    }

    [RelayCommand]
    public async Task ToggleVoiceRecordingAsync()
    {
        if (!IsRecordingAudio)
        {
            IsRecordingAudio = true;
            RecordingStatusText = "Opnemen...";
            _audioService.StartRecording();
        }
        else
        {
            RecordingStatusText = "Verwerken...";
            var audioBytes = await _audioService.StopRecordingAsync();
            IsRecordingAudio = false;

            RecordedAudio = audioBytes.Length > 0 ? audioBytes : null;
            RecordingStatusText = RecordedAudio is null ? "Inspreken" : "Opname bijgevoegd";
        }
    }

    /// <summary>
    /// Klapt het beschrijvingsveld open of dicht. Een lege beschrijving wordt bij
    /// het dichtklappen opgeruimd, zodat een spatie die per ongeluk is blijven
    /// staan het knopje niet als "er staat iets" laat oplichten.
    /// </summary>
    [RelayCommand]
    public void ToggleDescription()
    {
        IsDescriptionVisible = !IsDescriptionVisible;

        if (!IsDescriptionVisible && !HasDescription)
            DescriptionText = string.Empty;
    }

    [RelayCommand]
    public void Undo()
    {
        RequestUndo?.Invoke(this, EventArgs.Empty);
    }

    [RelayCommand]
    public void Clear()
    {
        RequestClear?.Invoke(this, EventArgs.Empty);
        StepBadgeCounter = 1;
    }

    [RelayCommand]
    public void Close()
    {
        if (IsRecordingAudio)
        {
            _ = _audioService.StopRecordingAsync();
            IsRecordingAudio = false;
        }
        RequestClose?.Invoke(this, EventArgs.Empty);
    }

    /// <summary>
    /// Bewaart de vastlegging en meldt of dat gelukt is. Bij een fout blijft de overlay
    /// open, zodat de annotatie niet verloren gaat en opnieuw geprobeerd kan worden.
    /// </summary>
    public async Task<bool> SubmitAsync(CaptureResult result)
    {
        if (IsSaving || SaveHandler is null) return false;

        IsSaving = true;
        SaveMessage = "Opslaan...";

        try
        {
            var outcome = await SaveHandler(result).ConfigureAwait(true);
            SaveMessage = outcome.Message;
            return outcome.Success;
        }
        finally
        {
            IsSaving = false;
        }
    }
}
