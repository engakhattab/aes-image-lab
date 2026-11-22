using System.Security.Cryptography;

namespace AesImageWeb.Crypto;

/// <summary>
/// AES encryption/decryption in ECB, CBC and CTR modes.
/// ECB and CBC use the built-in System.Security.Cryptography.Aes modes.
/// CTR is not available in .NET's CipherMode enum, so it is built manually
/// on top of AES-ECB: each 16-byte counter block is AES-encrypted and XORed
/// with the data, turning the block cipher into a stream cipher.
/// </summary>
public static class AesModes
{
    public const int BlockSizeBytes = 16;

    public static byte[] GenerateKey(int keySizeBits)
    {
        using var aes = Aes.Create();
        aes.KeySize = keySizeBits;
        aes.GenerateKey();
        return aes.Key;
    }

    public static byte[] GenerateRandomBlock() => RandomNumberGenerator.GetBytes(BlockSizeBytes);

    // ---------- ECB ----------

    public static byte[] EncryptEcb(byte[] plaintext, byte[] key)
    {
        using var aes = CreateAes(key, CipherMode.ECB, PaddingMode.PKCS7);
        using var encryptor = aes.CreateEncryptor();
        return encryptor.TransformFinalBlock(plaintext, 0, plaintext.Length);
    }

    public static byte[] DecryptEcb(byte[] ciphertext, byte[] key)
    {
        using var aes = CreateAes(key, CipherMode.ECB, PaddingMode.PKCS7);
        using var decryptor = aes.CreateDecryptor();
        return decryptor.TransformFinalBlock(ciphertext, 0, ciphertext.Length);
    }

    // ---------- CBC ----------

    public static (byte[] Ciphertext, byte[] Iv) EncryptCbc(byte[] plaintext, byte[] key, byte[]? iv = null)
    {
        using var aes = CreateAes(key, CipherMode.CBC, PaddingMode.PKCS7);
        if (iv is not null) aes.IV = iv;
        else aes.GenerateIV();

        using var encryptor = aes.CreateEncryptor();
        var ciphertext = encryptor.TransformFinalBlock(plaintext, 0, plaintext.Length);
        return (ciphertext, aes.IV);
    }

    public static byte[] DecryptCbc(byte[] ciphertext, byte[] key, byte[] iv)
    {
        using var aes = CreateAes(key, CipherMode.CBC, PaddingMode.PKCS7);
        aes.IV = iv;
        using var decryptor = aes.CreateDecryptor();
        return decryptor.TransformFinalBlock(ciphertext, 0, ciphertext.Length);
    }

    // ---------- CTR (manual, built on AES-ECB) ----------

    public static (byte[] Ciphertext, byte[] Nonce) EncryptCtr(byte[] plaintext, byte[] key, byte[]? nonce = null)
    {
        nonce ??= GenerateRandomBlock();
        return (CtrTransform(plaintext, key, nonce), nonce);
    }

    public static byte[] DecryptCtr(byte[] ciphertext, byte[] key, byte[] nonce) =>
        // CTR encryption and decryption are the identical XOR-with-keystream operation.
        CtrTransform(ciphertext, key, nonce);

    private static byte[] CtrTransform(byte[] data, byte[] key, byte[] nonce)
    {
        if (nonce.Length != BlockSizeBytes)
            throw new ArgumentException($"CTR nonce/counter block must be {BlockSizeBytes} bytes.", nameof(nonce));

        using var aes = CreateAes(key, CipherMode.ECB, PaddingMode.None);
        using var encryptor = aes.CreateEncryptor();

        var output = new byte[data.Length];
        var counterBlock = (byte[])nonce.Clone();
        var keystream = new byte[BlockSizeBytes];

        for (var offset = 0; offset < data.Length; offset += BlockSizeBytes)
        {
            encryptor.TransformBlock(counterBlock, 0, BlockSizeBytes, keystream, 0);

            var chunkLength = Math.Min(BlockSizeBytes, data.Length - offset);
            for (var i = 0; i < chunkLength; i++)
                output[offset + i] = (byte)(data[offset + i] ^ keystream[i]);

            IncrementCounter(counterBlock);
        }

        return output;
    }

    private static void IncrementCounter(byte[] counterBlock)
    {
        for (var i = counterBlock.Length - 1; i >= 0; i--)
        {
            if (++counterBlock[i] != 0) break;
        }
    }

    private static Aes CreateAes(byte[] key, CipherMode mode, PaddingMode padding)
    {
        var aes = Aes.Create();
        aes.Key = key;
        aes.Mode = mode;
        aes.Padding = padding;
        return aes;
    }
}
