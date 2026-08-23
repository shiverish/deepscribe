using System.IO;
using System.Net;
using System.Net.Http;
using System.Text.Json;
using FluentAssertions;
using SeeScribe.Core.Models;
using SeeScribe.DeepScribe;
using Xunit;

namespace SeeScribe.Tests;

/// <summary>
/// Vangt de aanroepen naar de bridge op zodat getoetst kan worden wat er verstuurd wordt.
/// </summary>
internal sealed class RecordingHandler : HttpMessageHandler
{
    public List<(string Method, JsonElement Params)> Calls { get; } = new();

    protected override async Task<HttpResponseMessage> SendAsync(
        HttpRequestMessage request, CancellationToken cancellationToken)
    {
        var body = await request.Content!.ReadAsStringAsync(cancellationToken);
        using var document = JsonDocument.Parse(body);
        var root = document.RootElement;

        Calls.Add((
            root.GetProperty("method").GetString()!,
            root.GetProperty("params").Clone()));

        return new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent("""{"ok":true,"result":{"id":"block-test"}}""")
        };
    }
}

internal sealed class FailingHandler : HttpMessageHandler
{
    protected override Task<HttpResponseMessage> SendAsync(
        HttpRequestMessage request, CancellationToken cancellationToken) =>
        throw new HttpRequestException("verbinding verbroken");
}

[Collection(BridgeCollection.Name)]
public class CaptureWriterTests : IDisposable
{
    private readonly string _bridgeFile;
    private readonly string? _previous;

    public CaptureWriterTests()
    {
        _previous = Environment.GetEnvironmentVariable("DEEPSCRIBE_BRIDGE_FILE");
        _bridgeFile = Path.Combine(Path.GetTempPath(), $"seescribe-test-{Guid.NewGuid():N}.json");
        File.WriteAllText(_bridgeFile, """{"port":49999,"token":"test"}""");
        Environment.SetEnvironmentVariable("DEEPSCRIBE_BRIDGE_FILE", _bridgeFile);
    }

    public void Dispose()
    {
        Environment.SetEnvironmentVariable("DEEPSCRIBE_BRIDGE_FILE", _previous);
        File.Delete(_bridgeFile);
    }

    private static CaptureResult SampleCapture() => new()
    {
        PromptText = "Deze knop reageert niet",
        AnnotatedImageData = new byte[] { 1, 2, 3, 4 },
        ScreenWidth = 1920,
        ScreenHeight = 1080,
        Annotations =
        {
            new Annotation { Tool = Core.Enums.DrawingTool.Arrow, Order = 1, End = new AnnotationPoint(10, 20) }
        }
    };

    private static (RecordingHandler Handler, DeepScribeCaptureWriter Writer) Build()
    {
        var handler = new RecordingHandler();
        var writer = new DeepScribeCaptureWriter(new DeepScribeBridgeClient(new HttpClient(handler)));
        return (handler, writer);
    }

    [Fact]
    public async Task WriteAsync_identifies_SeeScribe_as_the_claimant()
    {
        var (handler, writer) = Build();

        await writer.WriteAsync(SampleCapture(), CaptureDestination.Inbox);

        var task = handler.Calls.Single(call => call.Method == "create_capture").Params;
        task.GetProperty("agentId").GetString().Should().Be("seescribe");
        task.GetProperty("agentTarget").GetString().Should().Be("custom");
        task.GetProperty("customAgentName").GetString().Should().Be("SeeScribe");
        task.GetProperty("requestId").GetString().Should().NotBeNullOrWhiteSpace();
    }

    [Fact]
    public async Task WriteAsync_reuses_the_capture_id_so_a_retry_makes_no_second_task()
    {
        var capture = SampleCapture();

        var (firstHandler, firstWriter) = Build();
        await firstWriter.WriteAsync(capture, CaptureDestination.Inbox);

        var (secondHandler, secondWriter) = Build();
        await secondWriter.WriteAsync(capture, CaptureDestination.Inbox);

        var first = firstHandler.Calls.Single(c => c.Method == "create_capture").Params.GetProperty("requestId").GetString();
        var second = secondHandler.Calls.Single(c => c.Method == "create_capture").Params.GetProperty("requestId").GetString();

        second.Should().Be(first);
    }

    [Fact]
    public async Task WriteAsync_makes_a_capture_claimable_by_any_agent()
    {
        var (handler, writer) = Build();

        await writer.WriteAsync(SampleCapture(), CaptureDestination.Inbox);

        var capture = handler.Calls.Single(call => call.Method == "create_capture").Params;
        capture.GetProperty("assignTo").GetString().Should().Be("any");
    }

    [Fact]
    public async Task WriteAsync_leaves_the_project_empty_for_an_inbox_capture()
    {
        var (handler, writer) = Build();

        await writer.WriteAsync(SampleCapture(), CaptureDestination.Inbox);

        // Een leeg project wordt weggelaten in plaats van als null verstuurd;
        // voor de bridge betekent een ontbrekende sleutel hetzelfde als geen project.
        var capture = handler.Calls.Single(call => call.Method == "create_capture").Params;
        capture.TryGetProperty("projectId", out _).Should().BeFalse();
    }

    [Fact]
    public async Task WriteAsync_passes_the_chosen_project_along()
    {
        var (handler, writer) = Build();

        await writer.WriteAsync(SampleCapture(), CaptureDestination.InProject("proj-moxxi"));

        var capture = handler.Calls.Single(call => call.Method == "create_capture").Params;
        capture.GetProperty("projectId").GetString().Should().Be("proj-moxxi");
    }

    [Fact]
    public async Task WriteAsync_does_not_repeat_the_prompt_below_an_identical_title()
    {
        var (handler, writer) = Build();

        await writer.WriteAsync(SampleCapture(), CaptureDestination.Inbox);

        var capture = handler.Calls.Single(call => call.Method == "create_capture").Params;
        var title = capture.GetProperty("title").GetString()!;
        var content = capture.GetProperty("content").GetString()!;

        title.Should().Be("Deze knop reageert niet");
        content.Should().NotStartWith(title);
    }

    [Fact]
    public async Task WriteAsync_attaches_the_image_and_the_annotation_data()
    {
        var (handler, writer) = Build();

        await writer.WriteAsync(SampleCapture(), CaptureDestination.Inbox);

        var attachments = handler.Calls.Where(call => call.Method == "create_attachment").ToList();
        attachments.Should().HaveCount(2);
        attachments.Select(a => a.Params.GetProperty("fileType").GetString())
            .Should().BeEquivalentTo(new[] { "image/png", "application/json" });
    }

    [Fact]
    public async Task WriteAsync_separates_a_broken_connection_from_a_closed_DeepScribe()
    {
        // DeepScribe draait wél; de aanroep zelf loopt stuk. Dat mag niet als
        // "DeepScribe draait niet" naar boven komen, want dan is de echte oorzaak zoek.
        var writer = new DeepScribeCaptureWriter(
            new DeepScribeBridgeClient(new HttpClient(new FailingHandler())));

        var act = async () => await writer.WriteAsync(SampleCapture(), CaptureDestination.Inbox);

        await act.Should().ThrowAsync<DeepScribeTransportException>();
    }

    [Fact]
    public async Task WriteAsync_reports_plainly_when_DeepScribe_is_closed()
    {
        File.Delete(_bridgeFile);
        var (_, writer) = Build();

        var act = async () => await writer.WriteAsync(SampleCapture(), CaptureDestination.Inbox);

        await act.Should().ThrowAsync<DeepScribeUnavailableException>();
    }
}

[Collection(BridgeCollection.Name)]
public class AnnotationPayloadTests : IDisposable
{
    private readonly string _bridgeFile;
    private readonly string? _previous;

    public AnnotationPayloadTests()
    {
        _previous = Environment.GetEnvironmentVariable("DEEPSCRIBE_BRIDGE_FILE");
        _bridgeFile = Path.Combine(Path.GetTempPath(), $"seescribe-payload-{Guid.NewGuid():N}.json");
        File.WriteAllText(_bridgeFile, """{"port":49999,"token":"test"}""");
        Environment.SetEnvironmentVariable("DEEPSCRIBE_BRIDGE_FILE", _bridgeFile);
    }

    public void Dispose()
    {
        Environment.SetEnvironmentVariable("DEEPSCRIBE_BRIDGE_FILE", _previous);
        File.Delete(_bridgeFile);
    }

    [Fact]
    public async Task Annotation_data_names_the_tool_instead_of_numbering_it()
    {
        var handler = new RecordingHandler();
        var writer = new DeepScribeCaptureWriter(new DeepScribeBridgeClient(new HttpClient(handler)));

        var capture = new CaptureResult
        {
            PromptText = "test",
            Annotations =
            {
                new Annotation { Tool = Core.Enums.DrawingTool.Rectangle, Order = 1 }
            }
        };

        await writer.WriteAsync(capture, CaptureDestination.Inbox);

        var json = handler.Calls
            .Single(call => call.Method == "create_attachment"
                && call.Params.GetProperty("fileType").GetString() == "application/json")
            .Params.GetProperty("base64").GetString()!;

        var decoded = System.Text.Encoding.UTF8.GetString(Convert.FromBase64String(json));

        decoded.Should().Contain("\"Rectangle\"");
        decoded.Should().NotContain("\"tool\":2");
    }
}
