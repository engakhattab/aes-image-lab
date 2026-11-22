namespace AesImageWeb.Imaging;

/// <summary>
/// Raw ciphertext bytes alone don't carry the image's width/height, unlike a
/// real image file. The downloaded .bin prepends an 8-byte header (width,
/// height as little-endian Int32) so the decrypt side can rebuild the image
/// without the user having to retype the dimensions by hand.
/// </summary>
public static class CiphertextContainer
{
    private const int HeaderBytes = 8;

    public static byte[] Pack(int width, int height, byte[] ciphertext)
    {
        var result = new byte[HeaderBytes + ciphertext.Length];
        BitConverter.GetBytes(width).CopyTo(result, 0);
        BitConverter.GetBytes(height).CopyTo(result, 4);
        ciphertext.CopyTo(result, HeaderBytes);
        return result;
    }

    public static (int Width, int Height, byte[] Ciphertext) Unpack(byte[] container)
    {
        if (container.Length < HeaderBytes)
            throw new InvalidDataException("That file is too small to be a ciphertext produced by this app.");

        var width = BitConverter.ToInt32(container, 0);
        var height = BitConverter.ToInt32(container, 4);

        const int maxDimension = 20_000; // sanity bound; real photos never get close to this
        if (width <= 0 || height <= 0 || width > maxDimension || height > maxDimension)
            throw new InvalidDataException(
                $"That file doesn't look like a .bin from this app's Encrypt step (header says {width}×{height}).");

        var ciphertext = new byte[container.Length - HeaderBytes];
        Array.Copy(container, HeaderBytes, ciphertext, 0, ciphertext.Length);
        return (width, height, ciphertext);
    }
}
