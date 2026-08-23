using System.Windows;
using System.Windows.Controls;
using KeyEventArgs = System.Windows.Input.KeyEventArgs;
using UserControl = System.Windows.Controls.UserControl;

namespace SeeScribe.App.Views.Controls;

public partial class AnnotationToolbar : UserControl
{
    public event RoutedEventHandler? SubmitRequested;

    public AnnotationToolbar()
    {
        InitializeComponent();
        PromptInputBox.KeyDown += PromptInputBox_KeyDown;
    }

    private void PromptInputBox_KeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key == System.Windows.Input.Key.Enter)
        {
            e.Handled = true;
            SubmitRequested?.Invoke(this, new RoutedEventArgs());
        }
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
