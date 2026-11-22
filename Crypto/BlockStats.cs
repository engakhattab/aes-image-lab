using System.Buffers.Binary;

namespace AesImageWeb.Crypto;

public static class BlockStats
{
    /// <summary>
    /// Share of 16-byte blocks that repeat an earlier block. ECB carries the
    /// plaintext's repetition straight into the ciphertext; CBC and CTR should
    /// land at ~0%.
    /// </summary>
    public static double RepeatedBlockPercent(ReadOnlySpan<byte> data)
    {
        var blocks = data.Length / AesModes.BlockSizeBytes;
        if (blocks == 0) return 0;

        var seen = new HashSet<UInt128>(blocks);
        var repeats = 0;
        for (var i = 0; i < blocks; i++)
        {
            var block = BinaryPrimitives.ReadUInt128LittleEndian(data.Slice(i * AesModes.BlockSizeBytes, AesModes.BlockSizeBytes));
            if (!seen.Add(block)) repeats++;
        }

        return 100.0 * repeats / blocks;
    }
}
