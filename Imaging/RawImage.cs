using System.Drawing;
using System.Drawing.Imaging;

namespace AesImageWeb.Imaging;

/// <summary>
/// Converts between an image file and the raw, uncompressed pixel bytes AES
/// actually operates on. Encryption/decryption must happen on these raw bytes,
/// not on the compressed PNG file bytes: PNG compression destroys the repeating
/// byte patterns that make ECB visibly leak shapes, which is the whole point of
/// this demo.
/// </summary>
public static class RawImage
{
    public const int BytesPerPixel = 4; // 32bppArgb: B,G,R,A per pixel, no row padding since width*4 is always a multiple of 4

    public static (byte[] PixelBytes, int Width, int Height) LoadRawPixels(string path)
    {
        using var stream = File.OpenRead(path);
        return LoadRawPixels(stream);
    }

    public static (byte[] PixelBytes, int Width, int Height) LoadRawPixels(Stream stream)
    {
        using var bitmap = new Bitmap(stream);
        using var argbBitmap = ToArgb32(bitmap);
        return (ExtractRawPixels(argbBitmap), argbBitmap.Width, argbBitmap.Height);
    }

    public static byte[] ExtractRawPixels(Bitmap bitmap)
    {
        var rect = new Rectangle(0, 0, bitmap.Width, bitmap.Height);
        var data = bitmap.LockBits(rect, ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
        try
        {
            var bytes = new byte[bitmap.Width * bitmap.Height * BytesPerPixel];
            System.Runtime.InteropServices.Marshal.Copy(data.Scan0, bytes, 0, bytes.Length);
            return bytes;
        }
        finally
        {
            bitmap.UnlockBits(data);
        }
    }

    /// <summary>
    /// Rebuilds a viewable image from a raw byte buffer and known dimensions.
    /// Used both for the real decrypted image (buffer length matches exactly)
    /// and for the "what does the ciphertext look like as an image" visualization
    /// (buffer may be a few bytes longer, from PKCS7 padding on ECB/CBC — those
    /// extra bytes are simply dropped; they don't affect the real ciphertext,
    /// which is kept intact separately for actual decryption).
    /// forceOpaque is for that visualization: the alpha bytes of ciphertext are
    /// random too, which would make the picture see-through and wash out the
    /// pattern, so they are pinned to 255 for display only.
    /// </summary>
    public static Bitmap BuildImageFromRawPixels(byte[] pixelBytes, int width, int height, bool forceOpaque = false)
    {
        var required = width * height * BytesPerPixel;
        var buffer = pixelBytes;
        if (buffer.Length != required || forceOpaque)
        {
            buffer = new byte[required];
            Array.Copy(pixelBytes, buffer, Math.Min(pixelBytes.Length, required));
        }

        if (forceOpaque)
        {
            for (var i = 3; i < buffer.Length; i += BytesPerPixel) buffer[i] = 255;
        }

        var bitmap = new Bitmap(width, height, PixelFormat.Format32bppArgb);
        var rect = new Rectangle(0, 0, width, height);
        var data = bitmap.LockBits(rect, ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
        try
        {
            System.Runtime.InteropServices.Marshal.Copy(buffer, 0, data.Scan0, buffer.Length);
        }
        finally
        {
            bitmap.UnlockBits(data);
        }

        return bitmap;
    }

    public static void SavePng(Bitmap bitmap, string path) => bitmap.Save(path, ImageFormat.Png);

    public static byte[] SavePngToBytes(Bitmap bitmap)
    {
        using var ms = new MemoryStream();
        bitmap.Save(ms, ImageFormat.Png);
        return ms.ToArray();
    }

    private static Bitmap ToArgb32(Bitmap source)
    {
        if (source.PixelFormat == PixelFormat.Format32bppArgb) return (Bitmap)source.Clone();

        var converted = new Bitmap(source.Width, source.Height, PixelFormat.Format32bppArgb);
        using var g = Graphics.FromImage(converted);
        g.DrawImage(source, 0, 0, source.Width, source.Height);
        return converted;
    }
}
