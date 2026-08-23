using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using SeeScribe.Core.Models;

namespace SeeScribe.App.Services;

/// <summary>
/// Leest af welk venster op de voorgrond stond. Moet worden aangeroepen vóórdat
/// de overlay verschijnt, want daarna is SeeScribe zelf het actieve venster.
/// </summary>
public static class ForegroundWindowService
{
    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetWindowTextW(IntPtr hWnd, StringBuilder text, int count);

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

    [DllImport("user32.dll")]
    private static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);

    [StructLayout(LayoutKind.Sequential)]
    private struct RECT
    {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    public static WindowContext? Capture()
    {
        var handle = GetForegroundWindow();
        if (handle == IntPtr.Zero) return null;

        var context = new WindowContext
        {
            WindowTitle = ReadTitle(handle)
        };

        if (GetWindowRect(handle, out var rect))
        {
            context.Bounds = new AnnotationRect(
                rect.Left, rect.Top, rect.Right - rect.Left, rect.Bottom - rect.Top);
        }

        GetWindowThreadProcessId(handle, out var processId);
        if (processId == 0) return context;

        try
        {
            using var process = Process.GetProcessById((int)processId);
            context.ProcessName = process.ProcessName;
            context.ExecutablePath = process.MainModule?.FileName;
        }
        catch (Exception ex) when (ex is ArgumentException or InvalidOperationException or System.ComponentModel.Win32Exception)
        {
            // Een beschermd proces geeft zijn pad niet vrij; de titel is dan genoeg.
        }

        return context;
    }

    private static string ReadTitle(IntPtr handle)
    {
        var buffer = new StringBuilder(512);
        var length = GetWindowTextW(handle, buffer, buffer.Capacity);
        return length > 0 ? buffer.ToString() : string.Empty;
    }
}
