using System.IO;
using NAudio.Wave;
using SeeScribe.Core.Interfaces;

namespace SeeScribe.App.Services;

public class AudioRecordingService : IAudioRecordingService
{
    private WaveInEvent? _waveIn;
    private MemoryStream? _memoryStream;
    private WaveFileWriter? _writer;
    private bool _isRecording;
    private bool _disposed;

    public bool IsRecording => _isRecording;

    public void StartRecording()
    {
        if (_isRecording) return;

        try
        {
            _memoryStream = new MemoryStream();
            _waveIn = new WaveInEvent
            {
                WaveFormat = new WaveFormat(16000, 16, 1) // 16kHz, 16-bit, Mono
            };

            _writer = new WaveFileWriter(_memoryStream, _waveIn.WaveFormat);

            _waveIn.DataAvailable += (s, a) =>
            {
                _writer?.Write(a.Buffer, 0, a.BytesRecorded);
            };

            _waveIn.RecordingStopped += (s, a) =>
            {
                _writer?.Flush();
            };

            _waveIn.StartRecording();
            _isRecording = true;
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"Failed to start audio recording: {ex.Message}");
            _isRecording = false;
        }
    }

    public async Task<byte[]> StopRecordingAsync()
    {
        if (!_isRecording || _waveIn == null)
        {
            return Array.Empty<byte>();
        }

        try
        {
            _waveIn.StopRecording();
            _isRecording = false;

            await Task.Delay(100); // Allow buffers to flush

            _writer?.Dispose();
            _writer = null;

            _waveIn.Dispose();
            _waveIn = null;

            var bytes = _memoryStream?.ToArray() ?? Array.Empty<byte>();
            _memoryStream?.Dispose();
            _memoryStream = null;

            return bytes;
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"Failed to stop audio recording: {ex.Message}");
            return Array.Empty<byte>();
        }
    }

    public void Dispose()
    {
        if (!_disposed)
        {
            try
            {
                if (_isRecording)
                {
                    _waveIn?.StopRecording();
                }
                _writer?.Dispose();
                _waveIn?.Dispose();
                _memoryStream?.Dispose();
            }
            catch { }

            _disposed = true;
        }
        GC.SuppressFinalize(this);
    }
}
