using System.Globalization;
using FluentAssertions;
using Moq;
using SeeScribe.App.Converters;
using SeeScribe.App.ViewModels;
using SeeScribe.Core.Enums;
using SeeScribe.Core.Interfaces;
using Xunit;

namespace SeeScribe.Tests;

public class OverlayViewModelTests
{
    private readonly Mock<IAudioRecordingService> _audioServiceMock = new();
    private readonly Mock<ISettingsService> _settingsServiceMock = new();

    private OverlayViewModel CreateViewModel()
    {
        return new OverlayViewModel(_audioServiceMock.Object, _settingsServiceMock.Object);
    }

    [Theory]
    [InlineData(DrawingTool.Arrow)]
    [InlineData(DrawingTool.Pen)]
    [InlineData(DrawingTool.Rectangle)]
    [InlineData(DrawingTool.Ellipse)]
    [InlineData(DrawingTool.TextBadge)]
    [InlineData(DrawingTool.Highlighter)]
    public void SelectTool_updates_active_tool(DrawingTool tool)
    {
        var vm = CreateViewModel();

        vm.SelectTool(tool);

        vm.ActiveTool.Should().Be(tool);
    }

    [Fact]
    public void EnumToBooleanConverter_converts_matching_enum_to_true()
    {
        var converter = new EnumToBooleanConverter();

        var resultMatch = converter.Convert(DrawingTool.Pen, typeof(bool), DrawingTool.Pen, CultureInfo.InvariantCulture);
        var resultMismatch = converter.Convert(DrawingTool.Pen, typeof(bool), DrawingTool.Arrow, CultureInfo.InvariantCulture);

        resultMatch.Should().Be(true);
        resultMismatch.Should().Be(false);
    }

    [Fact]
    public void EnumToBooleanConverter_converts_back_when_checked()
    {
        var converter = new EnumToBooleanConverter();

        var result = converter.ConvertBack(true, typeof(DrawingTool), DrawingTool.Rectangle, CultureInfo.InvariantCulture);

        result.Should().Be(DrawingTool.Rectangle);
    }
}
