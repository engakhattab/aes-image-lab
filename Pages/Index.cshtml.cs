using System.Diagnostics;
using System.Security.Cryptography;
using AesImageWeb.Crypto;
using AesImageWeb.Imaging;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;

namespace AesImageWeb.Pages;

public sealed record EncryptOutcome(
    string Mode,
    int KeySizeBits,
    int Rounds,
    int Width,
    int Height,
    int Blocks,
    double ElapsedMs,
    double RepeatedBlockPercent,
    double PlaintextRepeatedBlockPercent,
    string CipherPreview,
    string CiphertextBase64,
    string FileName,
    string KeyHex,
    string? IvOrNonceHex,
    string? IvLabel);

public sealed record DecryptOutcome(
    string Mode,
    int Width,
    int Height,
    double ElapsedMs,
    string DecryptedPreview,
    bool? Match);

/// <summary>
/// The page is a single-page UI: handlers return JSON and the browser drives
/// the animations while the server does the actual AES work.
/// </summary>
public class IndexModel : PageModel
{
    private static readonly string[] Modes = ["ECB", "CBC", "CTR"];
    private static readonly int[] KeySizes = [128, 192, 256];
    private const long MaxPixels = 4_000_000;

    public void OnGet()
    {
    }

    public async Task<IActionResult> OnPostEncryptAsync(IFormFile? plaintextImage, string mode = "ECB", int keySizeBits = 256)
    {
        if (!Modes.Contains(mode)) return Fail($"Unknown mode '{mode}'.");
        if (!KeySizes.Contains(keySizeBits)) return Fail("Key size must be 128, 192 or 256 bits.");

        try
        {
            var (pixels, width, height) = await LoadPixelsAsync(plaintextImage);
            var key = AesModes.GenerateKey(keySizeBits);
            var result = Encrypt(pixels, width, height, mode, key, BlockStats.RepeatedBlockPercent(pixels));
            return new JsonResult(new { ok = true, result });
        }
        catch (InvalidDataException ex)
        {
            return Fail(ex.Message);
        }
        catch (Exception ex)
        {
            return Fail($"Encryption failed: {ex.Message}");
        }
    }

    public async Task<IActionResult> OnPostCompareAsync(IFormFile? plaintextImage, int keySizeBits = 256)
    {
        if (!KeySizes.Contains(keySizeBits)) return Fail("Key size must be 128, 192 or 256 bits.");

        try
        {
            var (pixels, width, height) = await LoadPixelsAsync(plaintextImage);
            var key = AesModes.GenerateKey(keySizeBits);
            var plaintextRepeated = BlockStats.RepeatedBlockPercent(pixels);
            var results = Modes.Select(m => Encrypt(pixels, width, height, m, key, plaintextRepeated)).ToArray();

            return new JsonResult(new
            {
                ok = true,
                width,
                height,
                plaintextRepeatedBlockPercent = plaintextRepeated,
                keyHex = Convert.ToHexString(key),
                results,
            });
        }
        catch (InvalidDataException ex)
        {
            return Fail(ex.Message);
        }
        catch (Exception ex)
        {
            return Fail($"Encryption failed: {ex.Message}");
        }
    }

    public async Task<IActionResult> OnPostDecryptAsync(
        IFormFile? ciphertextFile,
        string mode = "ECB",
        string? keyHex = null,
        string? ivOrNonceHex = null,
        IFormFile? originalForVerification = null)
    {
        if (ciphertextFile is not { Length: > 0 }) return Fail("Choose the ciphertext .bin file first.");
        if (!Modes.Contains(mode)) return Fail($"Unknown mode '{mode}'.");
        if (!TryParseHex(keyHex, out var key) || key.Length is not (16 or 24 or 32))
            return Fail("The key must be 32, 48 or 64 hex characters (a 128-, 192- or 256-bit AES key).");

        var iv = Array.Empty<byte>();
        if (mode != "ECB" && (!TryParseHex(ivOrNonceHex, out iv) || iv.Length != AesModes.BlockSizeBytes))
            return Fail($"The {(mode == "CBC" ? "IV" : "nonce")} must be exactly 32 hex characters (16 bytes).");

        try
        {
            var (width, height, ciphertext) = CiphertextContainer.Unpack(await ReadAllBytesAsync(ciphertextFile));

            var stopwatch = Stopwatch.StartNew();
            var pixels = mode switch
            {
                "ECB" => AesModes.DecryptEcb(ciphertext, key),
                "CBC" => AesModes.DecryptCbc(ciphertext, key, iv),
                _ => AesModes.DecryptCtr(ciphertext, key, iv),
            };
            stopwatch.Stop();

            using var image = RawImage.BuildImageFromRawPixels(pixels, width, height);

            bool? match = null;
            if (originalForVerification is { Length: > 0 })
            {
                var (original, _, _) = await LoadPixelsAsync(originalForVerification);
                match = original.AsSpan().SequenceEqual(pixels);
            }

            var result = new DecryptOutcome(
                mode,
                width,
                height,
                stopwatch.Elapsed.TotalMilliseconds,
                ToDataUrl(RawImage.SavePngToBytes(image), "image/png"),
                match);

            return new JsonResult(new { ok = true, result });
        }
        catch (CryptographicException)
        {
            // ECB/CBC fail the PKCS7 padding check (or the block-length check) when
            // the key, IV or mode is wrong. CTR has no padding, so it never lands here.
            return Fail("Decryption failed: the key, IV/nonce or mode doesn't match the ones this file was encrypted with.");
        }
        catch (InvalidDataException ex)
        {
            return Fail(ex.Message);
        }
        catch (Exception ex)
        {
            return Fail($"Decryption failed: {ex.Message}");
        }
    }

    private static EncryptOutcome Encrypt(byte[] pixels, int width, int height, string mode, byte[] key, double plaintextRepeated)
    {
        var stopwatch = Stopwatch.StartNew();
        var (ciphertext, ivOrNonce) = mode switch
        {
            "ECB" => (AesModes.EncryptEcb(pixels, key), (byte[]?)null),
            "CBC" => AesModes.EncryptCbc(pixels, key),
            _ => AesModes.EncryptCtr(pixels, key),
        };
        stopwatch.Stop();

        using var visual = RawImage.BuildImageFromRawPixels(ciphertext, width, height, forceOpaque: true);

        return new EncryptOutcome(
            Mode: mode,
            KeySizeBits: key.Length * 8,
            Rounds: key.Length / 4 + 6,
            Width: width,
            Height: height,
            Blocks: (ciphertext.Length + AesModes.BlockSizeBytes - 1) / AesModes.BlockSizeBytes,
            ElapsedMs: stopwatch.Elapsed.TotalMilliseconds,
            RepeatedBlockPercent: BlockStats.RepeatedBlockPercent(ciphertext),
            PlaintextRepeatedBlockPercent: plaintextRepeated,
            CipherPreview: ToDataUrl(RawImage.SavePngToBytes(visual), "image/png"),
            // The .bin carries width/height ahead of the ciphertext so decryption
            // only needs the key and IV/nonce, not the dimensions retyped by hand.
            CiphertextBase64: Convert.ToBase64String(CiphertextContainer.Pack(width, height, ciphertext)),
            FileName: $"ciphertext_{mode}.bin",
            KeyHex: Convert.ToHexString(key),
            IvOrNonceHex: ivOrNonce is null ? null : Convert.ToHexString(ivOrNonce),
            IvLabel: mode switch { "CBC" => "IV", "CTR" => "Nonce", _ => null });
    }

    private static async Task<(byte[] Pixels, int Width, int Height)> LoadPixelsAsync(IFormFile? file)
    {
        if (file is not { Length: > 0 }) throw new InvalidDataException("Choose an image first.");

        var bytes = await ReadAllBytesAsync(file);
        (byte[] Pixels, int Width, int Height) image;
        try
        {
            using var stream = new MemoryStream(bytes);
            image = RawImage.LoadRawPixels(stream);
        }
        catch (ArgumentException)
        {
            throw new InvalidDataException($"\"{file.FileName}\" isn't an image this app can read. Try PNG, JPG, BMP or GIF.");
        }

        if ((long)image.Width * image.Height > MaxPixels)
            throw new InvalidDataException($"That image is {image.Width}×{image.Height}. Keep it under about 4 megapixels for this demo.");

        return image;
    }

    private static bool TryParseHex(string? hex, out byte[] bytes)
    {
        bytes = [];
        if (string.IsNullOrWhiteSpace(hex)) return false;

        try
        {
            bytes = Convert.FromHexString(string.Concat(hex.Where(c => !char.IsWhiteSpace(c))));
            return true;
        }
        catch (FormatException)
        {
            return false;
        }
    }

    private static async Task<byte[]> ReadAllBytesAsync(IFormFile file)
    {
        using var stream = file.OpenReadStream();
        using var ms = new MemoryStream();
        await stream.CopyToAsync(ms);
        return ms.ToArray();
    }

    private static string ToDataUrl(byte[] bytes, string contentType) =>
        $"data:{contentType};base64,{Convert.ToBase64String(bytes)}";

    private static JsonResult Fail(string error) =>
        new(new { ok = false, error }) { StatusCode = StatusCodes.Status400BadRequest };
}
