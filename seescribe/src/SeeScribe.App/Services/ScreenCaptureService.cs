using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using SeeScribe.Core.Interfaces;
using SeeScribe.Core.Models;

namespace SeeScribe.App.Services;

public class ScreenCaptureService : IScreenCaptureService
{
    [DllImport("user32.dll")]
    private static extern bool GetCursorPos(out POINT lpPoint);

    [DllImport("user32.dll")]
    private static extern IntPtr MonitorFromPoint(POINT pt, uint dwFlags);

    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    private static extern bool GetMonitorInfo(IntPtr hMonitor, ref MONITORINFOEX lpmi);

    [DllImport("user32.dll")]
    private static extern bool EnumDisplayMonitors(IntPtr hdc, IntPtr lprcClip, MonitorEnumDelegate lpfnEnum, IntPtr dwData);

    private delegate bool MonitorEnumDelegate(IntPtr hMonitor, IntPtr hdcMonitor, ref RECT lprcMonitor, IntPtr dwData);

    private const uint MONITOR_DEFAULTTONEAREST = 2;

    [StructLayout(LayoutKind.Sequential)]
    private struct POINT
    {
        public int X;
        public int Y;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct RECT
    {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
    private struct MONITORINFOEX
    {
        public int cbSize;
        public RECT rcMonitor;
        public RECT rcWork;
        public uint dwFlags;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)]
        public string szDevice;
    }

    public Bitmap CaptureActiveScreen()
    {
        GetCursorPos(out var cursorPos);
        return CaptureScreenAtPoint(cursorPos.X, cursorPos.Y);
    }

    public Bitmap CaptureScreenAtPoint(int x, int y)
    {
        var screenInfo = GetScreenContainingPoint(x, y);
        return CaptureRegion(new Rectangle(screenInfo.X, screenInfo.Y, screenInfo.Width, screenInfo.Height));
    }

    public Bitmap CaptureRegion(Rectangle region)
    {
        if (region.Width <= 0 || region.Height <= 0)
        {
            region = new Rectangle(0, 0, 1920, 1080);
        }

        var bitmap = new Bitmap(region.Width, region.Height, PixelFormat.Format32bppArgb);
        using (var g = Graphics.FromImage(bitmap))
        {
            g.CopyFromScreen(region.X, region.Y, 0, 0, region.Size, CopyPixelOperation.SourceCopy);
        }
        return bitmap;
    }

    public ScreenInfo GetScreenContainingPoint(int x, int y)
    {
        var pt = new POINT { X = x, Y = y };
        var hMonitor = MonitorFromPoint(pt, MONITOR_DEFAULTTONEAREST);

        var mi = new MONITORINFOEX();
        mi.cbSize = Marshal.SizeOf(typeof(MONITORINFOEX));

        if (GetMonitorInfo(hMonitor, ref mi))
        {
            return new ScreenInfo
            {
                DeviceName = mi.szDevice,
                X = mi.rcMonitor.Left,
                Y = mi.rcMonitor.Top,
                Width = mi.rcMonitor.Right - mi.rcMonitor.Left,
                Height = mi.rcMonitor.Bottom - mi.rcMonitor.Top,
                IsPrimary = (mi.dwFlags & 1) != 0
            };
        }

        // Fallback to primary screen
        return new ScreenInfo
        {
            DeviceName = "Primary",
            X = 0,
            Y = 0,
            Width = (int)System.Windows.SystemParameters.PrimaryScreenWidth,
            Height = (int)System.Windows.SystemParameters.PrimaryScreenHeight,
            IsPrimary = true
        };
    }

    public List<ScreenInfo> GetAvailableScreens()
    {
        var screens = new List<ScreenInfo>();

        EnumDisplayMonitors(IntPtr.Zero, IntPtr.Zero, (IntPtr hMonitor, IntPtr hdcMonitor, ref RECT lprcMonitor, IntPtr dwData) =>
        {
            var mi = new MONITORINFOEX();
            mi.cbSize = Marshal.SizeOf(typeof(MONITORINFOEX));
            if (GetMonitorInfo(hMonitor, ref mi))
            {
                screens.Add(new ScreenInfo
                {
                    DeviceName = mi.szDevice,
                    X = mi.rcMonitor.Left,
                    Y = mi.rcMonitor.Top,
                    Width = mi.rcMonitor.Right - mi.rcMonitor.Left,
                    Height = mi.rcMonitor.Bottom - mi.rcMonitor.Top,
                    IsPrimary = (mi.dwFlags & 1) != 0
                });
            }
            return true;
        }, IntPtr.Zero);

        if (screens.Count == 0)
        {
            screens.Add(new ScreenInfo
            {
                DeviceName = "Primary",
                X = 0,
                Y = 0,
                Width = (int)System.Windows.SystemParameters.PrimaryScreenWidth,
                Height = (int)System.Windows.SystemParameters.PrimaryScreenHeight,
                IsPrimary = true
            });
        }

        return screens;
    }
}
