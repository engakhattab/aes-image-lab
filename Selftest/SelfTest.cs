using System.Security.Cryptography;
using AesImageWeb.Crypto;
using AesImageWeb.Imaging;

namespace AesImageWeb.Selftest;

/// <summary>
/// Console-only correctness checks for Phase 1 (AES core, no images yet).
/// Run with: dotnet run -- --selftest
/// </summary>
public static class SelfTest
{
    public static int Run()
    {
        var failures = 0;

        failures += CheckFips197Aes256Vector();
        failures += CheckRoundTrips();
        failures += CheckSampleImages();

        Console.WriteLine();
        if (failures == 0)
            Console.WriteLine("ALL PHASE 1 SELF-TESTS PASSED.");
        else
            Console.WriteLine($"{failures} SELF-TEST(S) FAILED.");

        return failures;
    }

    // FIPS-197 Appendix C.3: official AES-256 single-block test vector.
    private static int CheckFips197Aes256Vector()
    {
        var key = Convert.FromHexString("000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f");
        var plaintext = Convert.FromHexString("00112233445566778899aabbccddeeff");
        var expectedCipher = Convert.FromHexString("8ea2b7ca516745bfeafc49904b496089");

        // Single full block with PKCS7 padding adds an extra padding block, so
        // compare only the first 16 bytes (the real ciphertext block) before padding.
        using var aes = Aes.Create();
        aes.Key = key;
        aes.Mode = CipherMode.ECB;
        aes.Padding = PaddingMode.None;
        using var encryptor = aes.CreateEncryptor();
        var actual = new byte[16];
        encryptor.TransformBlock(plaintext, 0, 16, actual, 0);

        var ok = actual.AsSpan().SequenceEqual(expectedCipher);
        Report("FIPS-197 AES-256 known-answer test (ECB, no padding)", ok);
        return ok ? 0 : 1;
    }

    private static int CheckRoundTrips()
    {
        var failures = 0;
        var rng = RandomNumberGenerator.Create();
        int[] sizes = [0, 1, 15, 16, 17, 100, 1000];
        int[] keySizes = [128, 192, 256];

        foreach (var keySize in keySizes)
        {
            var key = AesModes.GenerateKey(keySize);

            foreach (var size in sizes)
            {
                var plaintext = new byte[size];
                rng.GetBytes(plaintext);

                failures += RoundTrip($"ECB  key={keySize} size={size}", plaintext,
                    pt => (AesModes.EncryptEcb(pt, key), (byte[]?)null),
                    (ct, _) => AesModes.DecryptEcb(ct, key));

                failures += RoundTrip($"CBC  key={keySize} size={size}", plaintext,
                    pt =>
                    {
                        var (ct, iv) = AesModes.EncryptCbc(pt, key);
                        return (ct, iv);
                    },
                    (ct, iv) => AesModes.DecryptCbc(ct, key, iv!));

                failures += RoundTrip($"CTR  key={keySize} size={size}", plaintext,
                    pt =>
                    {
                        var (ct, nonce) = AesModes.EncryptCtr(pt, key);
                        return (ct, nonce);
                    },
                    (ct, nonce) => AesModes.DecryptCtr(ct, key, nonce!));
            }
        }

        return failures;
    }

    private static int RoundTrip(
        string label,
        byte[] plaintext,
        Func<byte[], (byte[] Ciphertext, byte[]? Extra)> encrypt,
        Func<byte[], byte[]?, byte[]> decrypt)
    {
        var (ciphertext, extra) = encrypt(plaintext);
        var decrypted = decrypt(ciphertext, extra);
        var ok = decrypted.AsSpan().SequenceEqual(plaintext);
        Report(label, ok);
        return ok ? 0 : 1;
    }

    private static void Report(string label, bool ok) =>
        Console.WriteLine($"[{(ok ? "PASS" : "FAIL")}] {label}");

    // Phase 2: run both sample images through all 3 modes end-to-end and write
    // the outputs to disk so they can be opened and looked at (ECB should visibly
    // leak the Tux shape; CBC/CTR should look like noise; decrypted must match
    // the original exactly).
    private static int CheckSampleImages()
    {
        var failures = 0;
        var outputDir = Path.Combine(Directory.GetCurrentDirectory(), "SelftestOutput");
        Directory.CreateDirectory(outputDir);

        var samples = new (string Name, string Path)[]
        {
            ("tux", @"D:\study\SIS\sample_image1.png"),
            ("alice", @"D:\study\SIS\sample_image2.png"),
        };

        var key = AesModes.GenerateKey(256);
        Console.WriteLine();
        Console.WriteLine($"Phase 2 sample-image outputs written to: {outputDir}");
        Console.WriteLine($"(single AES-256 key used for all of them: {Convert.ToHexString(key)})");

        foreach (var (name, path) in samples)
        {
            if (!File.Exists(path))
            {
                Report($"sample image found: {path}", false);
                failures++;
                continue;
            }

            var (originalPixels, width, height) = RawImage.LoadRawPixels(path);

            failures += RunMode(name, "ECB", originalPixels, width, height, outputDir,
                pt => (AesModes.EncryptEcb(pt, key), Array.Empty<byte>()),
                (ct, _) => AesModes.DecryptEcb(ct, key));

            failures += RunMode(name, "CBC", originalPixels, width, height, outputDir,
                pt =>
                {
                    var (ct, iv) = AesModes.EncryptCbc(pt, key);
                    return (ct, iv);
                },
                (ct, iv) => AesModes.DecryptCbc(ct, key, iv));

            failures += RunMode(name, "CTR", originalPixels, width, height, outputDir,
                pt =>
                {
                    var (ct, nonce) = AesModes.EncryptCtr(pt, key);
                    return (ct, nonce);
                },
                (ct, nonce) => AesModes.DecryptCtr(ct, key, nonce));
        }

        return failures;
    }

    private static int RunMode(
        string imageName,
        string modeName,
        byte[] originalPixels,
        int width,
        int height,
        string outputDir,
        Func<byte[], (byte[] Ciphertext, byte[] Extra)> encrypt,
        Func<byte[], byte[], byte[]> decrypt)
    {
        var (ciphertext, extra) = encrypt(originalPixels);

        using var cipherVisual = RawImage.BuildImageFromRawPixels(ciphertext, width, height, forceOpaque: true);
        RawImage.SavePng(cipherVisual, Path.Combine(outputDir, $"cipher_{imageName}_{modeName}.png"));

        var decryptedPixels = decrypt(ciphertext, extra);
        using var decryptedImage = RawImage.BuildImageFromRawPixels(decryptedPixels, width, height);
        RawImage.SavePng(decryptedImage, Path.Combine(outputDir, $"decrypted_{imageName}_{modeName}.png"));

        var ok = decryptedPixels.AsSpan().SequenceEqual(originalPixels);
        Report($"{imageName} / {modeName}: decrypted == original pixels", ok);
        return ok ? 0 : 1;
    }
}
