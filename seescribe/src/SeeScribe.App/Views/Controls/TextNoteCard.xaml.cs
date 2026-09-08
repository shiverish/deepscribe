using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Threading;
using SeeScribe.Core.Models;
using Color = System.Windows.Media.Color;
using KeyEventArgs = System.Windows.Input.KeyEventArgs;
using MouseEventArgs = System.Windows.Input.MouseEventArgs;
using Point = System.Windows.Point;
using UserControl = System.Windows.Controls.UserControl;

namespace SeeScribe.App.Views.Controls;

public partial class TextNoteCard : UserControl
{
    private bool _isDragging;
    private Point _dragStartPoint;
    private double _initialLeft;
    private double _initialTop;
    private bool _hasBeenCommitted;

    public Annotation? Annotation { get; set; }

    public string Text { get; private set; } = string.Empty;

    public bool IsEditing => EditGrid.Visibility == Visibility.Visible;

    public event EventHandler<string>? Committed;
    public event EventHandler? Cancelled;
    public event EventHandler? DeleteRequested;
    public event EventHandler? DragMoved;

    public TextNoteCard()
    {
        InitializeComponent();

        MouseEnter += (s, e) =>
        {
            if (!IsEditing)
            {
                DeleteButton.Visibility = Visibility.Visible;
            }
        };

        MouseLeave += (s, e) =>
        {
            DeleteButton.Visibility = Visibility.Collapsed;
        };

        PreviewMouseLeftButtonDown += TextNoteCard_PreviewMouseLeftButtonDown;
        PreviewMouseMove += TextNoteCard_PreviewMouseMove;
        PreviewMouseLeftButtonUp += TextNoteCard_PreviewMouseLeftButtonUp;
    }

    public void SetAccentColor(Color color)
    {
        CardBorder.BorderBrush = new SolidColorBrush(color);
    }

    public void BeginEdit()
    {
        EditGrid.Visibility = Visibility.Visible;
        DisplayTextBlock.Visibility = Visibility.Collapsed;
        DeleteButton.Visibility = Visibility.Collapsed;

        InputBox.Text = Text;
        UpdatePlaceholder();

        Dispatcher.BeginInvoke(new Action(() =>
        {
            InputBox.Focus();
            InputBox.SelectAll();
        }), DispatcherPriority.Input);
    }

    public void CommitEdit()
    {
        if (!IsEditing) return;

        var newText = InputBox.Text.Trim();

        if (string.IsNullOrWhiteSpace(newText))
        {
            if (!_hasBeenCommitted)
            {
                Cancelled?.Invoke(this, EventArgs.Empty);
            }
            else
            {
                DeleteRequested?.Invoke(this, EventArgs.Empty);
            }
            return;
        }

        _hasBeenCommitted = true;
        Text = newText;
        DisplayTextBlock.Text = Text;

        EditGrid.Visibility = Visibility.Collapsed;
        DisplayTextBlock.Visibility = Visibility.Visible;

        UpdateAnnotationBounds();

        Committed?.Invoke(this, Text);
    }

    public void CancelEdit()
    {
        if (!_hasBeenCommitted && string.IsNullOrWhiteSpace(InputBox.Text))
        {
            Cancelled?.Invoke(this, EventArgs.Empty);
            return;
        }

        InputBox.Text = Text;
        EditGrid.Visibility = Visibility.Collapsed;
        DisplayTextBlock.Visibility = Visibility.Visible;
    }

    public void PrepareForExport()
    {
        if (IsEditing)
        {
            CommitEdit();
        }
        DeleteButton.Visibility = Visibility.Collapsed;
        UpdateLayout();
    }

    public void UpdateAnnotationBounds()
    {
        if (Annotation == null) return;

        UpdateLayout();

        var left = double.IsNaN(Canvas.GetLeft(this)) ? 0 : Canvas.GetLeft(this);
        var top = double.IsNaN(Canvas.GetTop(this)) ? 0 : Canvas.GetTop(this);
        var width = ActualWidth > 0 ? ActualWidth : MinWidth;
        var height = ActualHeight > 0 ? ActualHeight : 32;

        Annotation.Text = Text;
        Annotation.Start = new AnnotationPoint(left, top);
        Annotation.Bounds = new AnnotationRect(left, top, width, height);
    }

    private void UpdatePlaceholder()
    {
        PlaceholderBlock.Visibility = string.IsNullOrEmpty(InputBox.Text)
            ? Visibility.Visible
            : Visibility.Collapsed;
    }

    private void InputBox_TextChanged(object sender, TextChangedEventArgs e)
    {
        UpdatePlaceholder();
    }

    private void InputBox_PreviewKeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key == Key.Enter && (Keyboard.Modifiers & ModifierKeys.Control) == ModifierKeys.Control)
        {
            e.Handled = true;
            CommitEdit();
        }
        else if (e.Key == Key.Escape)
        {
            e.Handled = true;
            CancelEdit();
        }
    }

    private void InputBox_LostFocus(object sender, RoutedEventArgs e)
    {
        if (IsEditing)
        {
            CommitEdit();
        }
    }

    private void DeleteButton_Click(object sender, RoutedEventArgs e)
    {
        DeleteRequested?.Invoke(this, EventArgs.Empty);
    }

    private void TextNoteCard_PreviewMouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (IsEditing) return;

        if (e.ClickCount == 2)
        {
            e.Handled = true;
            BeginEdit();
            return;
        }

        if (Parent is IInputElement parent)
        {
            _isDragging = true;
            _dragStartPoint = e.GetPosition(parent);
            _initialLeft = double.IsNaN(Canvas.GetLeft(this)) ? 0 : Canvas.GetLeft(this);
            _initialTop = double.IsNaN(Canvas.GetTop(this)) ? 0 : Canvas.GetTop(this);
            CaptureMouse();
            e.Handled = true;
        }
    }

    private void TextNoteCard_PreviewMouseMove(object sender, MouseEventArgs e)
    {
        if (!_isDragging || Parent is not IInputElement parent) return;

        var currentPoint = e.GetPosition(parent);
        var delta = currentPoint - _dragStartPoint;

        var newLeft = Math.Max(0, _initialLeft + delta.X);
        var newTop = Math.Max(0, _initialTop + delta.Y);

        Canvas.SetLeft(this, newLeft);
        Canvas.SetTop(this, newTop);

        UpdateAnnotationBounds();
        DragMoved?.Invoke(this, EventArgs.Empty);
    }

    private void TextNoteCard_PreviewMouseLeftButtonUp(object sender, MouseButtonEventArgs e)
    {
        if (_isDragging)
        {
            _isDragging = false;
            ReleaseMouseCapture();
        }
    }
}
