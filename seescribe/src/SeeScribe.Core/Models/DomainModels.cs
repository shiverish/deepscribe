using SeeScribe.Core.Enums;

namespace SeeScribe.Core.Models;

public class CaptureResult
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public DateTime Timestamp { get; set; } = DateTime.Now;
    public CaptureMode Mode { get; set; } = CaptureMode.Snapshot;

    /// <summary>
    /// De samengestelde PNG-afbeelding (achtergrond + alle annotaties).
    /// </summary>
    public byte[]? AnnotatedImageData { get; set; }

    /// <summary>
    /// De schone originele achtergrond screenshot zonder annotaties.
    /// </summary>
    public byte[]? RawImageData { get; set; }

    /// <summary>
    /// Optionele video data bij live video capture.
    /// </summary>
    public byte[]? VideoData { get; set; }

    /// <summary>
    /// Opgenomen spraakinstructie als WAV. Gaat als bijlage mee, zodat een agent
    /// hem kan uitluisteren of transcriberen.
    /// </summary>
    public byte[]? AudioData { get; set; }

    /// <summary>
    /// De getypte toelichting.
    /// </summary>
    public string PromptText { get; set; } = string.Empty;

    public int ScreenWidth { get; set; }
    public int ScreenHeight { get; set; }
    public string ScreenDeviceName { get; set; } = string.Empty;

    public double ScreenScalingFactor { get; set; } = 1.0;

    /// <summary>
    /// De annotaties als gestructureerde gegevens. Blijft naast de samengestelde
    /// afbeelding bestaan, zodat een agent niet uit pixels hoeft af te leiden
    /// wat er is aangewezen.
    /// </summary>
    public List<Annotation> Annotations { get; set; } = new();

    /// <summary>
    /// Het venster en de applicatie die onder de overlay zaten.
    /// </summary>
    public WindowContext? Window { get; set; }

    /// <summary>
    /// Het gekozen project. Blijft leeg wanneer de vastlegging naar de inbox gaat;
    /// niet elke aantekening hoort bij een project.
    /// </summary>
    public string? TargetProjectId { get; set; }
}

public class ScreenInfo
{
    public string DeviceName { get; set; } = string.Empty;
    public int X { get; set; }
    public int Y { get; set; }
    public int Width { get; set; }
    public int Height { get; set; }
    public bool IsPrimary { get; set; }
    public double ScalingFactor { get; set; } = 1.0;
}
