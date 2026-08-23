namespace SeeScribe.App.ViewModels;

/// <summary>
/// De uitkomst van het bewaren van een vastlegging. SeeScribe heeft geen
/// systeemvakicoon meer, dus deze melding wordt in de werkbalk van de overlay getoond.
/// </summary>
public record CaptureSaveOutcome(bool Success, string Message)
{
    public static CaptureSaveOutcome Saved(string title) => new(true, $"Opgeslagen: {title}");

    public static CaptureSaveOutcome Failed(string reason) => new(false, reason);
}
