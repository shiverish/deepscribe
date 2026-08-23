namespace SeeScribe.App.ViewModels;

/// <summary>
/// Een keuzemogelijkheid voor waar een vastlegging naartoe gaat. Een lege
/// <see cref="ProjectId"/> betekent de inbox.
/// </summary>
public record CaptureTarget(string? ProjectId, string Title)
{
    public static CaptureTarget Inbox { get; } = new(null, "📥 Inbox (geen project)");

    public override string ToString() => Title;
}
