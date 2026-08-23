using SeeScribe.Core.Enums;

namespace SeeScribe.Core.Models;

/// <summary>
/// Eén annotatie als gestructureerde gegevens in plaats van als pixels.
/// Dit is wat een agent nodig heeft om te weten wat er is aangewezen:
/// zonder deze laag moet er uit een platgeslagen afbeelding worden afgeleid
/// waar pijl 1 naartoe wijst.
/// </summary>
public class Annotation
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public DrawingTool Tool { get; set; }

    /// <summary>
    /// Volgorde waarin de annotatie is geplaatst, beginnend bij 1.
    /// </summary>
    public int Order { get; set; }

    /// <summary>
    /// Het nummer op een stappenbadge. Alleen gevuld bij <see cref="DrawingTool.TextBadge"/>.
    /// </summary>
    public int? BadgeNumber { get; set; }

    /// <summary>
    /// Bijbehorende tekst, bijvoorbeeld een label bij een badge.
    /// </summary>
    public string? Text { get; set; }

    public string ColorHex { get; set; } = "#FF3B30";

    public double Thickness { get; set; }

    /// <summary>
    /// Omhullende rechthoek in schermcoördinaten van het vastgelegde beeld.
    /// Bij een pijl is dit het gebied tussen begin- en eindpunt.
    /// </summary>
    public AnnotationRect Bounds { get; set; } = new();

    /// <summary>
    /// Begin- en eindpunt voor gerichte vormen zoals de pijl. De pijlpunt ligt op <see cref="End"/>.
    /// </summary>
    public AnnotationPoint? Start { get; set; }

    public AnnotationPoint? End { get; set; }

    /// <summary>
    /// Vereenvoudigd pad voor pen- en markeerstiftlijnen. Bewust afgevlakt,
    /// want de exacte punten voegen voor een agent niets toe.
    /// </summary>
    public List<AnnotationPoint>? Path { get; set; }

    /// <summary>
    /// Tijdstip binnen een opname waar deze annotatie bij hoort.
    /// Blijft leeg bij een momentopname.
    /// </summary>
    public double? TimestampSeconds { get; set; }
}

public class AnnotationPoint
{
    public double X { get; set; }
    public double Y { get; set; }

    public AnnotationPoint() { }

    public AnnotationPoint(double x, double y)
    {
        X = x;
        Y = y;
    }
}

public class AnnotationRect
{
    public double X { get; set; }
    public double Y { get; set; }
    public double Width { get; set; }
    public double Height { get; set; }

    public AnnotationRect() { }

    public AnnotationRect(double x, double y, double width, double height)
    {
        X = x;
        Y = y;
        Width = width;
        Height = height;
    }

    public static AnnotationRect FromCorners(double x1, double y1, double x2, double y2) =>
        new(Math.Min(x1, x2), Math.Min(y1, y2), Math.Abs(x2 - x1), Math.Abs(y2 - y1));
}
