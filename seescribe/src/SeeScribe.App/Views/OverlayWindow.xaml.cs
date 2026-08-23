using System.IO;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Ink;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Shapes;
using SeeScribe.App.ViewModels;
using SeeScribe.Core.Enums;
using SeeScribe.Core.Models;
using Bitmap = System.Drawing.Bitmap;
using Brushes = System.Windows.Media.Brushes;
using CaptureMode = SeeScribe.Core.Enums.CaptureMode;
using Color = System.Windows.Media.Color;
using HorizontalAlignment = System.Windows.HorizontalAlignment;
using KeyEventArgs = System.Windows.Input.KeyEventArgs;
using MouseEventArgs = System.Windows.Input.MouseEventArgs;
using Point = System.Windows.Point;
using Rectangle = System.Windows.Shapes.Rectangle;

namespace SeeScribe.App.Views;

public partial class OverlayWindow : Window
{
    private readonly OverlayViewModel _viewModel;
    private Point _startPoint;
    private bool _isDrawingShape;
    private UIElement? _currentPreviewShape;
    private readonly List<object> _actionHistory = new();
    private readonly List<Annotation> _annotations = new();
    private Point _lastPoint;
    private BitmapSource? _frozenBitmapSource;
    private byte[]? _rawImageBytes;
    private int _screenX;
    private int _screenY;
    private string _screenDeviceName = string.Empty;
    private WindowContext? _windowContext;

    /// <summary>
    /// Het venster dat onder de overlay zat. Moet gezet worden vóór <see cref="Show"/>,
    /// omdat de overlay daarna zelf de voorgrond overneemt.
    /// </summary>
    public void SetWindowContext(WindowContext? context) => _windowContext = context;

    public OverlayWindow(OverlayViewModel viewModel)
    {
        InitializeComponent();
        _viewModel = viewModel;
        DataContext = _viewModel;

        _viewModel.RequestClose += (s, e) => Close();
        _viewModel.RequestUndo += (s, e) => UndoLastAction();
        _viewModel.RequestClear += (s, e) => ClearCanvas();
        _viewModel.PropertyChanged += ViewModel_PropertyChanged;

        Toolbar.SubmitRequested += Toolbar_SubmitRequested;

        MainInkCanvas.StrokeCollected += MainInkCanvas_StrokeCollected;
        UpdateDrawingMode();
    }

    public void SetupForScreen(Bitmap screenBitmap, ScreenInfo screenInfo)
    {
        _screenX = screenInfo.X;
        _screenY = screenInfo.Y;
        _screenDeviceName = screenInfo.DeviceName;

        Left = screenInfo.X;
        Top = screenInfo.Y;
        Width = screenInfo.Width;
        Height = screenInfo.Height;

        using (var ms = new MemoryStream())
        {
            screenBitmap.Save(ms, System.Drawing.Imaging.ImageFormat.Png);
            _rawImageBytes = ms.ToArray();

            ms.Position = 0;
            var bi = new BitmapImage();
            bi.BeginInit();
            bi.CacheOption = BitmapCacheOption.OnLoad;
            bi.StreamSource = ms;
            bi.EndInit();
            bi.Freeze();
            _frozenBitmapSource = bi;
            BackgroundImage.Source = _frozenBitmapSource;
        }

        ClearCanvas();
        Toolbar.FocusPromptInput();

        // De lijst met projecten mag het openen niet ophouden.
        _ = _viewModel.LoadTargetsAsync();
    }

    private void ViewModel_PropertyChanged(object? sender, System.ComponentModel.PropertyChangedEventArgs e)
    {
        if (e.PropertyName == nameof(OverlayViewModel.ActiveTool) ||
            e.PropertyName == nameof(OverlayViewModel.SelectedColor) ||
            e.PropertyName == nameof(OverlayViewModel.StrokeThickness))
        {
            UpdateDrawingMode();
        }
    }

    private void UpdateDrawingMode()
    {
        var color = _viewModel.SelectedColor;
        var thickness = _viewModel.StrokeThickness;

        switch (_viewModel.ActiveTool)
        {
            case DrawingTool.Pen:
                MainInkCanvas.EditingMode = InkCanvasEditingMode.Ink;
                MainInkCanvas.DefaultDrawingAttributes = new DrawingAttributes
                {
                    Color = color,
                    Width = thickness,
                    Height = thickness,
                    IsHighlighter = false,
                    FitToCurve = true
                };
                VectorCanvas.IsHitTestVisible = false;
                MainInkCanvas.IsHitTestVisible = true;
                break;

            case DrawingTool.Highlighter:
                MainInkCanvas.EditingMode = InkCanvasEditingMode.Ink;
                var highlightColor = Color.FromArgb(120, color.R, color.G, color.B);
                MainInkCanvas.DefaultDrawingAttributes = new DrawingAttributes
                {
                    Color = highlightColor,
                    Width = 16,
                    Height = 28,
                    IsHighlighter = true,
                    FitToCurve = true
                };
                VectorCanvas.IsHitTestVisible = false;
                MainInkCanvas.IsHitTestVisible = true;
                break;

            case DrawingTool.Eraser:
                MainInkCanvas.EditingMode = InkCanvasEditingMode.EraseByStroke;
                VectorCanvas.IsHitTestVisible = false;
                MainInkCanvas.IsHitTestVisible = true;
                break;

            default: // Vector shapes: Arrow, Rectangle, Ellipse, TextBadge
                MainInkCanvas.EditingMode = InkCanvasEditingMode.None;
                MainInkCanvas.IsHitTestVisible = false;
                VectorCanvas.IsHitTestVisible = true;
                break;
        }
    }

    private void MainInkCanvas_StrokeCollected(object sender, InkCanvasStrokeCollectedEventArgs e)
    {
        _actionHistory.Add(e.Stroke);

        var bounds = e.Stroke.GetBounds();
        var annotation = NewAnnotation(_viewModel.ActiveTool);
        annotation.Bounds = new AnnotationRect(bounds.X, bounds.Y, bounds.Width, bounds.Height);
        annotation.Path = SimplifyPath(e.Stroke);
        _annotations.Add(annotation);
    }

    /// <summary>
    /// Vlakt een inktlijn af tot hooguit een handvol punten. De exacte lijn zit al in
    /// de afbeelding; voor een agent telt alleen het verloop.
    /// </summary>
    private static List<AnnotationPoint> SimplifyPath(Stroke stroke)
    {
        const int maxPoints = 12;
        var points = stroke.StylusPoints;
        var step = Math.Max(1, points.Count / maxPoints);

        var simplified = new List<AnnotationPoint>();
        for (var i = 0; i < points.Count; i += step)
        {
            simplified.Add(new AnnotationPoint(points[i].X, points[i].Y));
        }

        if (points.Count > 0)
        {
            var last = points[points.Count - 1];
            simplified.Add(new AnnotationPoint(last.X, last.Y));
        }

        return simplified;
    }

    private Annotation NewAnnotation(DrawingTool tool) => new()
    {
        Tool = tool,
        Order = _annotations.Count + 1,
        ColorHex = ToHex(_viewModel.SelectedColor),
        Thickness = _viewModel.StrokeThickness
    };

    private static string ToHex(Color color) =>
        string.Format("#{0:X2}{1:X2}{2:X2}", color.R, color.G, color.B);

    private void VectorCanvas_MouseDown(object sender, MouseButtonEventArgs e)
    {
        if (e.LeftButton != MouseButtonState.Pressed) return;

        _startPoint = e.GetPosition(VectorCanvas);

        if (_viewModel.ActiveTool == DrawingTool.TextBadge)
        {
            // Place step badge at click point
            PlaceStepBadge(_startPoint);
            return;
        }

        _isDrawingShape = true;
        VectorCanvas.CaptureMouse();
    }

    private void VectorCanvas_MouseMove(object sender, MouseEventArgs e)
    {
        if (!_isDrawingShape) return;

        var currentPoint = e.GetPosition(VectorCanvas);
        _lastPoint = currentPoint;

        if (_currentPreviewShape != null)
        {
            VectorCanvas.Children.Remove(_currentPreviewShape);
            _currentPreviewShape = null;
        }

        switch (_viewModel.ActiveTool)
        {
            case DrawingTool.Arrow:
                _currentPreviewShape = CreateArrowElement(_startPoint, currentPoint);
                break;

            case DrawingTool.Rectangle:
                _currentPreviewShape = CreateRectangleElement(_startPoint, currentPoint);
                break;

            case DrawingTool.Ellipse:
                _currentPreviewShape = CreateEllipseElement(_startPoint, currentPoint);
                break;
        }

        if (_currentPreviewShape != null)
        {
            VectorCanvas.Children.Add(_currentPreviewShape);
        }
    }

    private void VectorCanvas_MouseUp(object sender, MouseButtonEventArgs e)
    {
        if (!_isDrawingShape) return;

        _isDrawingShape = false;
        VectorCanvas.ReleaseMouseCapture();

        if (_currentPreviewShape != null)
        {
            _actionHistory.Add(_currentPreviewShape);
            _currentPreviewShape = null;

            var annotation = NewAnnotation(_viewModel.ActiveTool);
            annotation.Bounds = AnnotationRect.FromCorners(_startPoint.X, _startPoint.Y, _lastPoint.X, _lastPoint.Y);
            annotation.Start = new AnnotationPoint(_startPoint.X, _startPoint.Y);
            annotation.End = new AnnotationPoint(_lastPoint.X, _lastPoint.Y);
            _annotations.Add(annotation);
        }
    }

    private UIElement CreateArrowElement(Point start, Point end)
    {
        var group = new Grid();
        var brush = new SolidColorBrush(_viewModel.SelectedColor);
        var thickness = _viewModel.StrokeThickness;

        // Line
        var line = new Line
        {
            X1 = start.X,
            Y1 = start.Y,
            X2 = end.X,
            Y2 = end.Y,
            Stroke = brush,
            StrokeThickness = thickness,
            StrokeStartLineCap = PenLineCap.Round,
            StrokeEndLineCap = PenLineCap.Round
        };
        group.Children.Add(line);

        // Arrow head
        var theta = Math.Atan2(end.Y - start.Y, end.X - start.X);
        var headLen = Math.Max(16.0, thickness * 4);
        var arrowAngle = Math.PI / 6.0;

        var p1 = end;
        var p2 = new Point(
            end.X - headLen * Math.Cos(theta - arrowAngle),
            end.Y - headLen * Math.Sin(theta - arrowAngle));
        var p3 = new Point(
            end.X - headLen * Math.Cos(theta + arrowAngle),
            end.Y - headLen * Math.Sin(theta + arrowAngle));

        var head = new Polygon
        {
            Fill = brush,
            Stroke = brush,
            StrokeThickness = 1,
            Points = new PointCollection { p1, p2, p3 }
        };
        group.Children.Add(head);

        return group;
    }

    private UIElement CreateRectangleElement(Point start, Point end)
    {
        var x = Math.Min(start.X, end.X);
        var y = Math.Min(start.Y, end.Y);
        var w = Math.Abs(end.X - start.X);
        var h = Math.Abs(end.Y - start.Y);

        var rect = new Rectangle
        {
            Width = Math.Max(w, 2),
            Height = Math.Max(h, 2),
            Stroke = new SolidColorBrush(_viewModel.SelectedColor),
            StrokeThickness = _viewModel.StrokeThickness,
            RadiusX = 6,
            RadiusY = 6
        };

        Canvas.SetLeft(rect, x);
        Canvas.SetTop(rect, y);
        return rect;
    }

    private UIElement CreateEllipseElement(Point start, Point end)
    {
        var x = Math.Min(start.X, end.X);
        var y = Math.Min(start.Y, end.Y);
        var w = Math.Abs(end.X - start.X);
        var h = Math.Abs(end.Y - start.Y);

        var ellipse = new System.Windows.Shapes.Ellipse
        {
            Width = Math.Max(w, 2),
            Height = Math.Max(h, 2),
            Stroke = new SolidColorBrush(_viewModel.SelectedColor),
            StrokeThickness = _viewModel.StrokeThickness
        };

        Canvas.SetLeft(ellipse, x);
        Canvas.SetTop(ellipse, y);
        return ellipse;
    }

    private void PlaceStepBadge(Point position)
    {
        var number = _viewModel.StepBadgeCounter;
        _viewModel.StepBadgeCounter++;

        var badge = new Grid
        {
            Width = 28,
            Height = 28
        };

        var circle = new System.Windows.Shapes.Ellipse
        {
            Fill = new SolidColorBrush(_viewModel.SelectedColor),
            Stroke = Brushes.White,
            StrokeThickness = 2
        };
        badge.Children.Add(circle);

        var text = new TextBlock
        {
            Text = number.ToString(),
            Foreground = Brushes.White,
            FontWeight = FontWeights.Bold,
            FontSize = 13,
            HorizontalAlignment = HorizontalAlignment.Center,
            VerticalAlignment = VerticalAlignment.Center
        };
        badge.Children.Add(text);

        Canvas.SetLeft(badge, position.X - 14);
        Canvas.SetTop(badge, position.Y - 14);

        VectorCanvas.Children.Add(badge);
        _actionHistory.Add(badge);

        var annotation = NewAnnotation(DrawingTool.TextBadge);
        annotation.BadgeNumber = number;
        annotation.Start = new AnnotationPoint(position.X, position.Y);
        annotation.Bounds = new AnnotationRect(position.X - 14, position.Y - 14, 28, 28);
        _annotations.Add(annotation);
    }

    private void UndoLastAction()
    {
        if (_actionHistory.Count == 0) return;

        var last = _actionHistory[_actionHistory.Count - 1];
        _actionHistory.RemoveAt(_actionHistory.Count - 1);

        if (_annotations.Count > 0)
        {
            _annotations.RemoveAt(_annotations.Count - 1);
        }

        if (last is Stroke stroke)
        {
            MainInkCanvas.Strokes.Remove(stroke);
        }
        else if (last is UIElement element)
        {
            VectorCanvas.Children.Remove(element);
            if (_viewModel.StepBadgeCounter > 1)
            {
                _viewModel.StepBadgeCounter--;
            }
        }
    }

    private void ClearCanvas()
    {
        MainInkCanvas.Strokes.Clear();
        VectorCanvas.Children.Clear();
        _actionHistory.Clear();
        _annotations.Clear();
        _currentPreviewShape = null;
    }

    private void Window_KeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key == Key.Escape)
        {
            _viewModel.Close();
            e.Handled = true;
        }
        else if (e.Key == Key.Z && (Keyboard.Modifiers & ModifierKeys.Control) == ModifierKeys.Control)
        {
            UndoLastAction();
            e.Handled = true;
        }
        else if (e.Key == Key.Enter && !Toolbar.IsFocused)
        {
            Toolbar_SubmitRequested(this, new RoutedEventArgs());
            e.Handled = true;
        }
    }

    private async void Toolbar_SubmitRequested(object sender, RoutedEventArgs e)
    {
        if (_viewModel.IsSaving) return;

        var composedBytes = GenerateComposedImage();

        var captureResult = new CaptureResult
        {
            Mode = CaptureMode.Snapshot,
            AnnotatedImageData = composedBytes,
            RawImageData = _rawImageBytes,
            PromptText = _viewModel.PromptText,
            ScreenWidth = (int)ActualWidth,
            ScreenHeight = (int)ActualHeight,
            ScreenDeviceName = _screenDeviceName,
            Timestamp = DateTime.Now,
            Annotations = new List<Annotation>(_annotations),
            Window = _windowContext,
            TargetProjectId = _viewModel.SelectedTarget?.ProjectId,
            AudioData = _viewModel.RecordedAudio
        };

        // Pas sluiten wanneer het bewaard is. Mislukt het, dan blijft de annotatie staan
        // met de reden in beeld, zodat opnieuw proberen mogelijk blijft.
        if (await _viewModel.SubmitAsync(captureResult))
        {
            Close();
        }
    }

    private byte[] GenerateComposedImage()
    {
        Toolbar.Visibility = Visibility.Hidden;
        UpdateLayout();

        var width = (int)ActualWidth;
        var height = (int)ActualHeight;

        if (width <= 0 || height <= 0)
        {
            width = 1920;
            height = 1080;
        }

        var rtb = new RenderTargetBitmap(width, height, 96, 96, PixelFormats.Pbgra32);
        rtb.Render(RootGrid);

        Toolbar.Visibility = Visibility.Visible;

        var encoder = new PngBitmapEncoder();
        encoder.Frames.Add(BitmapFrame.Create(rtb));

        using var ms = new MemoryStream();
        encoder.Save(ms);
        return ms.ToArray();
    }
}
