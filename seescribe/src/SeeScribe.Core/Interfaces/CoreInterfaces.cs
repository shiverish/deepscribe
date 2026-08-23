using System.Drawing;
using SeeScribe.Core.Models;

namespace SeeScribe.Core.Interfaces;

public interface IScreenCaptureService
{
    Bitmap CaptureActiveScreen();
    Bitmap CaptureScreenAtPoint(int x, int y);
    Bitmap CaptureRegion(Rectangle region);
    List<ScreenInfo> GetAvailableScreens();
    ScreenInfo GetScreenContainingPoint(int x, int y);
}

public interface IHotkeyService : IDisposable
{
    bool RegisterHotKey(string actionName, string keyCombination, Action callback);
    void UnregisterAll();
}

public interface IAudioRecordingService : IDisposable
{
    bool IsRecording { get; }
    void StartRecording();
    Task<byte[]> StopRecordingAsync();
}

public interface ISettingsService
{
    AppSettings LoadSettings();
    Task SaveSettingsAsync(AppSettings settings);
    AppSettings Current { get; }
}
