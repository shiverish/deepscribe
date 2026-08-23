namespace SeeScribe.Core.Models;

/// <summary>
/// Wat er onder de overlay zat op het moment van vastleggen.
/// Dit is voor een agent het verschil tussen "ergens op het scherm" en
/// "in dit venster van deze applicatie".
/// </summary>
public class WindowContext
{
    public string ProcessName { get; set; } = string.Empty;

    public string WindowTitle { get; set; } = string.Empty;

    /// <summary>
    /// Volledig pad naar het uitvoerbare bestand, voor zover leesbaar.
    /// </summary>
    public string? ExecutablePath { get; set; }

    /// <summary>
    /// Positie en afmeting van het venster in schermcoördinaten.
    /// </summary>
    public AnnotationRect? Bounds { get; set; }
}
