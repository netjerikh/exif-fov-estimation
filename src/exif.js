import { exiftool } from "exiftool-vendored";

/**
 * Extract EXIF metadata relevant to FOV computation from an image file.
 *
 * Uses exiftool-vendored which wraps the real ExifTool binary and supports
 * virtually every image format (JPEG, HEIC, TIFF, PNG, DNG, CR2, NEF, ARW, …).
 *
 * @param {string} filePath – absolute or relative path to an image file
 * @returns {Promise<object>} – cleaned metadata object
 */
/**
 * exiftool-vendored may return values as strings with units (e.g. "78 mm")
 * or as plain numbers. This helper extracts the numeric value in either case.
 */
function parseNum(val) {
    if (val == null) return null;
    if (typeof val === "number") return val;
    const n = parseFloat(String(val));
    return isNaN(n) ? null : n;
}

export async function extractExif(filePath) {
    const raw = await exiftool.read(filePath);

    if (!raw) {
        throw new Error(`No EXIF data found in "${filePath}".`);
    }

    // ── Normalise image dimensions ──────────────────────────────────────
    const width =
        parseNum(raw.ImageWidth) ?? parseNum(raw.ExifImageWidth) ?? parseNum(raw.PixelXDimension) ?? null;
    const height =
        parseNum(raw.ImageHeight) ?? parseNum(raw.ExifImageHeight) ?? parseNum(raw.PixelYDimension) ?? null;

    if (!width || !height) {
        throw new Error(
            "Could not determine image pixel dimensions from EXIF data."
        );
    }

    // ── Orientation (default 1 = normal) ────────────────────────────────
    let orientation = 1;
    if (raw.Orientation != null) {
        const val = raw.Orientation;
        if (typeof val === "number") {
            orientation = val;
        } else {
            // exiftool-vendored returns descriptive strings like
            // "Horizontal (normal)", "Rotate 90 CW", "Rotate 270 CW", etc.
            const str = String(val);
            if (/90/.test(str)) orientation = 6;
            else if (/270/.test(str)) orientation = 8;
            else if (/180/.test(str)) orientation = 3;
            else orientation = 1;
        }
    }

    // ── Focal lengths ───────────────────────────────────────────────────
    const focalLength = parseNum(raw.FocalLength);
    const focalLengthIn35mm = parseNum(raw.FocalLengthIn35mmFormat);

    // ── Crop-factor helpers ─────────────────────────────────────────────
    const scaleFactor35efl = parseNum(raw.ScaleFactor35efl);

    // Focal-plane resolution (fallback for computing sensor size)
    const focalPlaneXRes = parseNum(raw.FocalPlaneXResolution);
    const focalPlaneYRes = parseNum(raw.FocalPlaneYResolution);
    const focalPlaneUnit = parseNum(raw.FocalPlaneResolutionUnit);

    const digitalZoomRatio = parseNum(raw.DigitalZoomRatio);

    // Focus / subject distance (metres) — used for close-focus FOV correction
    const focusDistance =
        parseNum(raw.FocusDistance) ??
        parseNum(raw.SubjectDistance) ??
        parseNum(raw.ApproximateFocusDistance) ??
        null;

    return {
        width,
        height,
        orientation,
        focalLength,
        focalLengthIn35mm,
        scaleFactor35efl,
        focalPlaneXRes,
        focalPlaneYRes,
        focalPlaneUnit,
        digitalZoomRatio,
        focusDistance,
    };
}

/**
 * Shut down the exiftool child process.
 * Call this when you're done processing to allow the Node process to exit cleanly.
 */
export async function shutdown() {
    await exiftool.end();
}
