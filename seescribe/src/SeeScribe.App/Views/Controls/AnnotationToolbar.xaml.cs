using System.Windows;
using System.Windows.Controls;
using System.Windows.Threading;
using Key = System.Windows.Input.Key;
using KeyEventArgs = System.Windows.Input.KeyEventArgs;
using Keyboard = System.Windows.Input.Keyboard;
using ModifierKeys = System.Windows.Input.ModifierKeys;
using UserControl = System.Windows.Controls.UserControl;

namespace SeeScribe.App.Views.Controls;

public partial class AnnotationToolbar : UserControl
{
    public event RoutedEventHandler? SubmitRequested;

    public AnnotationToolbar()
    {
        InitializeComponent();
        PromptInputBox.PreviewKeyDown += PromptInputBox_PreviewKeyDown;
    }

    private void PromptInputBox_PreviewKeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key == Key.Enter)
        {
            e.Handled = true;
            SubmitRequested?.Invoke(this, new RoutedEventArgs());
        }
        else if (e.Key == Key.Escape)
        {
            e.Handled = true;
            Keyboard.ClearFocus();
        }
    }

    /// <summary>
    /// In de beschrijving maakt Enter een nieuwe regel — daar is het veld voor.
    /// Opslaan gaat daar met Ctrl+Enter. Escape haalt de focus van het veld af.
    /// </summary>
    private void DescriptionInputBox_PreviewKeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key == Key.Enter && (Keyboard.Modifiers & ModifierKeys.Control) == ModifierKeys.Control)
        {
            e.Handled = true;
            SubmitRequested?.Invoke(this, new RoutedEventArgs());
        }
        else if (e.Key == Key.Escape)
        {
            e.Handled = true;
            Keyboard.ClearFocus();
        }
    }

    /// <summary>
    /// Het veld openklappen betekent dat er getypt gaat worden. De cursor gaat
    /// erheen, en bij dichtklappen terug naar de titelregel.
    /// </summary>
    private void DescriptionInputBox_IsVisibleChanged(object sender, DependencyPropertyChangedEventArgs e)
    {
        var opened = DescriptionInputBox.IsVisible;

        // Pas focussen wanneer de nieuwe indeling er staat; een veld dat nog niet
        // zichtbaar is neemt de focus niet aan.
        Dispatcher.BeginInvoke(new Action(() =>
        {
            var box = opened ? DescriptionInputBox : PromptInputBox;
            box.Focus();
            box.CaretIndex = box.Text.Length;
        }), DispatcherPriority.Input);
    }

    private void OnSubmitClicked(object sender, RoutedEventArgs e)
    {
        SubmitRequested?.Invoke(this, new RoutedEventArgs());
    }

    public void FocusPromptInput()
    {
        PromptInputBox.Focus();
    }
}
