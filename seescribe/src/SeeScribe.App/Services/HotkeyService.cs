using System.Runtime.InteropServices;
using System.Windows.Input;
using System.Windows.Interop;
using SeeScribe.Core.Interfaces;

namespace SeeScribe.App.Services;

public class HotkeyService : IHotkeyService
{
    [DllImport("user32.dll")]
    private static extern bool RegisterHotKey(IntPtr hWnd, int id, uint fsModifiers, uint vk);

    [DllImport("user32.dll")]
    private static extern bool UnregisterHotKey(IntPtr hWnd, int id);

    private const int WM_HOTKEY = 0x0312;

    private const uint MOD_NONE = 0x0000;
    private const uint MOD_ALT = 0x0001;
    private const uint MOD_CONTROL = 0x0002;
    private const uint MOD_SHIFT = 0x0004;
    private const uint MOD_WIN = 0x0008;
    private const uint MOD_NOREPEAT = 0x4000;

    private readonly HwndSource _hwndSource;
    private readonly Dictionary<int, Action> _callbacks = new();
    private int _currentId = 9000;
    private bool _disposed;

    public HotkeyService()
    {
        var parameters = new HwndSourceParameters("SeeScribe_HotkeyReceiver")
        {
            Width = 0,
            Height = 0,
            PositionX = 0,
            PositionY = 0,
            WindowStyle = 0
        };

        _hwndSource = new HwndSource(parameters);
        _hwndSource.AddHook(HwndHook);
    }

    public bool RegisterHotKey(string actionName, string keyCombination, Action callback)
    {
        if (string.IsNullOrWhiteSpace(keyCombination)) return false;

        if (!TryParseKeyCombination(keyCombination, out var modifiers, out var vk))
        {
            return false;
        }

        var id = Interlocked.Increment(ref _currentId);
        var success = RegisterHotKey(_hwndSource.Handle, id, modifiers | MOD_NOREPEAT, vk);

        if (success)
        {
            _callbacks[id] = callback;
        }

        return success;
    }

    public void UnregisterAll()
    {
        foreach (var id in _callbacks.Keys.ToList())
        {
            UnregisterHotKey(_hwndSource.Handle, id);
        }
        _callbacks.Clear();
    }

    private IntPtr HwndHook(IntPtr hwnd, int msg, IntPtr wParam, IntPtr lParam, ref bool handled)
    {
        if (msg == WM_HOTKEY)
        {
            var id = wParam.ToInt32();
            if (_callbacks.TryGetValue(id, out var callback))
            {
                callback?.Invoke();
                handled = true;
            }
        }
        return IntPtr.Zero;
    }

    private static bool TryParseKeyCombination(string combination, out uint modifiers, out uint vk)
    {
        modifiers = MOD_NONE;
        vk = 0;

        var parts = combination.Split(new[] { '+', ' ' }, StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length == 0) return false;

        Key key = Key.None;

        foreach (var rawPart in parts)
        {
            var part = rawPart.Trim().ToLowerInvariant();
            if (part == "ctrl" || part == "control")
            {
                modifiers |= MOD_CONTROL;
            }
            else if (part == "alt")
            {
                modifiers |= MOD_ALT;
            }
            else if (part == "shift")
            {
                modifiers |= MOD_SHIFT;
            }
            else if (part == "win" || part == "windows" || part == "cmd")
            {
                modifiers |= MOD_WIN;
            }
            else
            {
                if (Enum.TryParse<Key>(rawPart, true, out var parsedKey))
                {
                    key = parsedKey;
                }
                else if (rawPart.Length == 1 && char.IsLetterOrDigit(rawPart[0]))
                {
                    var c = char.ToUpperInvariant(rawPart[0]);
                    key = (Key)KeyInterop.KeyFromVirtualKey((int)c);
                }
            }
        }

        if (key == Key.None) return false;

        vk = (uint)KeyInterop.VirtualKeyFromKey(key);
        return vk > 0;
    }

    public void Dispose()
    {
        if (!_disposed)
        {
            UnregisterAll();
            _hwndSource?.RemoveHook(HwndHook);
            _hwndSource?.Dispose();
            _disposed = true;
        }
        GC.SuppressFinalize(this);
    }
}
