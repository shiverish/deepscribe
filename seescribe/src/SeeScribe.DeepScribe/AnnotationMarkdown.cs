using System.Globalization;
using System.Text;
using SeeScribe.Core.Enums;
using SeeScribe.Core.Models;

namespace SeeScribe.DeepScribe;

/// <summary>
/// Zet annotaties om in leesbare Markdown. Dit is het verschil tussen een blok
/// waarin staat "bekijk het plaatje" en een blok waarin staat wat er precies
/// is aangewezen, in welke volgorde, en waar op het scherm.
/// </summary>
public static class AnnotationMarkdown
{
    /// <param name="title">
    /// De titel die het item krijgt. Staat de toelichting daar al volledig in, dan wordt
    /// die niet nog eens als eerste regel herhaald.
    /// </param>
    public static string Describe(CaptureResult capture, string? title = null)
    {
        var builder = new StringBuilder();

        var prompt = capture.PromptText?.Trim();
        if (!string.IsNullOrWhiteSpace(prompt) && !string.Equals(prompt, title?.Trim(), StringComparison.Ordinal))
        {
            builder.AppendLine(prompt);
            builder.AppendLine();
        }

        AppendContext(builder, capture);
        AppendAnnotations(builder, capture);

        return builder.ToString().TrimEnd();
    }

    private static void AppendContext(StringBuilder builder, CaptureResult capture)
    {
        builder.AppendLine("## Context");
        builder.AppendLine();

        if (capture.Window is { } window)
        {
            if (!string.IsNullOrWhiteSpace(window.WindowTitle))
                builder.AppendLine($"- Venster: {window.WindowTitle}");
            if (!string.IsNullOrWhiteSpace(window.ProcessName))
                builder.AppendLine($"- Applicatie: {window.ProcessName}");
        }

        builder.AppendLine($"- Scherm: {capture.ScreenWidth} bij {capture.ScreenHeight} pixels op {capture.ScreenDeviceName}");
        builder.AppendLine($"- Vastgelegd: {capture.Timestamp.ToString("dd-MM-yyyy HH:mm", CultureInfo.GetCultureInfo("nl-NL"))}");
        builder.AppendLine($"- Modus: {(capture.Mode == CaptureMode.LiveVideo ? "schermopname" : "momentopname")}");
        builder.AppendLine();
    }

    private static void AppendAnnotations(StringBuilder builder, CaptureResult capture)
    {
        if (capture.Annotations.Count == 0) return;

        builder.AppendLine("## Aangewezen op het scherm");
        builder.AppendLine();

        foreach (var annotation in capture.Annotations.OrderBy(a => a.Order))
        {
            builder.AppendLine($"- {DescribeOne(annotation)}");
        }

        builder.AppendLine();
        builder.AppendLine("De coördinaten zijn pixels, geteld vanaf de linkerbovenhoek van het vastgelegde scherm.");
        builder.AppendLine();
    }

    private static string DescribeOne(Annotation annotation)
    {
        var label = annotation.Tool switch
        {
            DrawingTool.Arrow => "Pijl",
            DrawingTool.Rectangle => "Kader",
            DrawingTool.Ellipse => "Cirkel",
            DrawingTool.Pen => "Penlijn",
            DrawingTool.Highlighter => "Markering",
            DrawingTool.TextBadge => annotation.BadgeNumber is { } number ? $"Stap {number}" : "Badge",
            _ => "Annotatie"
        };

        var where = annotation.Tool switch
        {
            DrawingTool.Arrow when annotation.End is { } end =>
                $"wijst naar ({Round(end.X)}, {Round(end.Y)})",
            DrawingTool.TextBadge when annotation.Start is { } start =>
                $"op ({Round(start.X)}, {Round(start.Y)})",
            _ => $"over het gebied ({Round(annotation.Bounds.X)}, {Round(annotation.Bounds.Y)}) tot " +
                 $"({Round(annotation.Bounds.X + annotation.Bounds.Width)}, {Round(annotation.Bounds.Y + annotation.Bounds.Height)})"
        };

        var line = $"**{label}** {where}";

        if (!string.IsNullOrWhiteSpace(annotation.Text))
            line += $" — {annotation.Text.Trim()}";

        if (annotation.TimestampSeconds is { } seconds)
            line += $" (op {seconds.ToString("0.0", CultureInfo.InvariantCulture)} seconden)";

        return line;
    }

    private static string Round(double value) =>
        Math.Round(value).ToString("0", CultureInfo.InvariantCulture);
}
