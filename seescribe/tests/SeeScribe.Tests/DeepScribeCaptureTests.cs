using System.IO;
using FluentAssertions;
using SeeScribe.App.Services;
using SeeScribe.Core.Enums;
using SeeScribe.Core.Models;
using SeeScribe.DeepScribe;
using Xunit;

namespace SeeScribe.Tests;

public class AnnotationMarkdownTests
{
    private static CaptureResult BuildCapture(params Annotation[] annotations) => new()
    {
        PromptText = "De knop staat verkeerd uitgelijnd",
        ScreenWidth = 2560,
        ScreenHeight = 1440,
        ScreenDeviceName = @"\.\DISPLAY1",
        Timestamp = new DateTime(2026, 8, 23, 14, 5, 0),
        Window = new WindowContext { ProcessName = "chrome", WindowTitle = "Moxxi — Instellingen" },
        Annotations = annotations.ToList()
    };

    [Fact]
    public void Describe_begins_with_the_typed_prompt()
    {
        var markdown = AnnotationMarkdown.Describe(BuildCapture());

        markdown.Should().StartWith("De knop staat verkeerd uitgelijnd");
    }

    [Fact]
    public void Describe_records_the_window_underneath()
    {
        var markdown = AnnotationMarkdown.Describe(BuildCapture());

        markdown.Should().Contain("Moxxi — Instellingen");
        markdown.Should().Contain("chrome");
    }

    [Fact]
    public void Describe_states_where_an_arrow_points()
    {
        var arrow = new Annotation
        {
            Tool = DrawingTool.Arrow,
            Order = 1,
            Start = new AnnotationPoint(100, 100),
            End = new AnnotationPoint(420, 260),
            Bounds = AnnotationRect.FromCorners(100, 100, 420, 260)
        };

        var markdown = AnnotationMarkdown.Describe(BuildCapture(arrow));

        markdown.Should().Contain("Pijl");
        markdown.Should().Contain("(420, 260)");
    }

    [Fact]
    public void Describe_numbers_step_badges_and_keeps_their_order()
    {
        var second = new Annotation
        {
            Tool = DrawingTool.TextBadge,
            Order = 2,
            BadgeNumber = 2,
            Start = new AnnotationPoint(800, 640)
        };
        var first = new Annotation
        {
            Tool = DrawingTool.TextBadge,
            Order = 1,
            BadgeNumber = 1,
            Start = new AnnotationPoint(300, 220)
        };

        var markdown = AnnotationMarkdown.Describe(BuildCapture(second, first));

        markdown.IndexOf("Stap 1", StringComparison.Ordinal)
            .Should().BeLessThan(markdown.IndexOf("Stap 2", StringComparison.Ordinal));
    }

    [Fact]
    public void Describe_notes_the_moment_within_a_recording()
    {
        var marked = new Annotation
        {
            Tool = DrawingTool.Rectangle,
            Order = 1,
            Bounds = new AnnotationRect(10, 20, 100, 50),
            TimestampSeconds = 4.5
        };

        var markdown = AnnotationMarkdown.Describe(BuildCapture(marked));

        markdown.Should().Contain("4.5 seconden");
    }

    [Fact]
    public void Describe_omits_the_annotation_section_when_nothing_was_drawn()
    {
        var markdown = AnnotationMarkdown.Describe(BuildCapture());

        markdown.Should().NotContain("Aangewezen op het scherm");
    }
}

public class SingleInstanceCommandTests
{
    [Theory]
    [InlineData("--capture", SingleInstanceService.CommandCapture)]
    [InlineData("/capture", SingleInstanceService.CommandCapture)]
    [InlineData("--RECORD", SingleInstanceService.CommandRecord)]
    [InlineData("--show", SingleInstanceService.CommandShow)]
    public void ParseCommand_reads_the_launch_argument(string argument, string expected)
    {
        SingleInstanceService.ParseCommand(new[] { argument }).Should().Be(expected);
    }

    [Fact]
    public void ParseCommand_falls_back_to_show_without_a_known_argument()
    {
        SingleInstanceService.ParseCommand(new[] { "--onbekend" })
            .Should().Be(SingleInstanceService.CommandShow);

        SingleInstanceService.ParseCommand(Array.Empty<string>())
            .Should().Be(SingleInstanceService.CommandShow);
    }
}

[Collection(BridgeCollection.Name)]
public class DeepScribeBridgeClientTests
{
    [Fact]
    public void ReadBridgeInfo_returns_null_when_the_bridge_file_is_absent()
    {
        var previous = Environment.GetEnvironmentVariable("DEEPSCRIBE_BRIDGE_FILE");
        try
        {
            Environment.SetEnvironmentVariable(
                "DEEPSCRIBE_BRIDGE_FILE",
                Path.Combine(Path.GetTempPath(), $"seescribe-afwezig-{Guid.NewGuid():N}.json"));

            DeepScribeBridgeClient.ReadBridgeInfo().Should().BeNull();
        }
        finally
        {
            Environment.SetEnvironmentVariable("DEEPSCRIBE_BRIDGE_FILE", previous);
        }
    }

    [Fact]
    public void ReadBridgeInfo_reads_port_and_token_from_the_bridge_file()
    {
        var previous = Environment.GetEnvironmentVariable("DEEPSCRIBE_BRIDGE_FILE");
        var path = Path.Combine(Path.GetTempPath(), $"seescribe-bridge-{Guid.NewGuid():N}.json");
        try
        {
            File.WriteAllText(path, """{"port":51234,"token":"geheim"}""");
            Environment.SetEnvironmentVariable("DEEPSCRIBE_BRIDGE_FILE", path);

            var info = DeepScribeBridgeClient.ReadBridgeInfo();

            info.Should().NotBeNull();
            info!.Port.Should().Be(51234);
            info.Token.Should().Be("geheim");
        }
        finally
        {
            Environment.SetEnvironmentVariable("DEEPSCRIBE_BRIDGE_FILE", previous);
            File.Delete(path);
        }
    }
}
