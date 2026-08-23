using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.IO.Compression;

namespace SeeScribe.App.Services;

public class VideoRecordingService : IDisposable
{
    private readonly System.Timers.Timer _timer;
    private readonly List<byte[]> _frames = new();
    private Rectangle _captureRegion;
    private bool _isRecording;
    private readonly object _lock = new();

    public bool IsRecording => _isRecording;
    public int FrameCount => _frames.Count;

    public VideoRecordingService()
    {
        // ~15 FPS
        _timer = new System.Timers.Timer(66);
        _timer.Elapsed += OnTimerElapsed;
        _timer.AutoReset = true;
    }

    public void StartRecording(Rectangle region)
    {
        lock (_lock)
        {
            _captureRegion = region;
            _frames.Clear();
            _isRecording = true;
            _timer.Start();
        }
    }

    private void OnTimerElapsed(object? sender, System.Timers.ElapsedEventArgs e)
    {
        if (!_isRecording) return;

        try
        {
            using var bmp = new Bitmap(_captureRegion.Width, _captureRegion.Height, PixelFormat.Format32bppArgb);
            using (var g = Graphics.FromImage(bmp))
            {
                g.CopyFromScreen(_captureRegion.X, _captureRegion.Y, 0, 0, _captureRegion.Size, CopyPixelOperation.SourceCopy);
            }

            using var ms = new MemoryStream();
            bmp.Save(ms, ImageFormat.Jpeg);
            lock (_lock)
            {
                // Cap at 200 frames (approx 13 seconds) to maintain fast API payload
                if (_frames.Count < 200)
                {
                    _frames.Add(ms.ToArray());
                }
            }
        }
        catch { }
    }

    public Task<byte[]> StopRecordingAsync()
    {
        lock (_lock)
        {
            _isRecording = false;
            _timer.Stop();

            if (_frames.Count == 0)
            {
                return Task.FromResult(Array.Empty<byte>());
            }

            using var outMs = new MemoryStream();
            using (var archive = new ZipArchive(outMs, ZipArchiveMode.Create, true))
            {
                for (int i = 0; i < _frames.Count; i++)
                {
                    var entry = archive.CreateEntry($"frame_{i:D4}.jpg", CompressionLevel.Fastest);
                    using var entryStream = entry.Open();
                    entryStream.Write(_frames[i], 0, _frames[i].Length);
                }
            }

            return Task.FromResult(outMs.ToArray());
        }
    }

    public void Dispose()
    {
        _timer?.Dispose();
        _frames.Clear();
        GC.SuppressFinalize(this);
    }
}
