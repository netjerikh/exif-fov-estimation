/**
 * FOV and focal-length computation based on the 35 mm full-frame model.
 *
 * The 35 mm full-frame sensor is 36 mm × 24 mm with a diagonal of 43.266 mm.
 * All FOV formulas assume a rectilinear (non-fisheye) lens.
 */

// ── Constants ─────────────────────────────────────────────────────────────────
const SENSOR_WIDTH_35MM = 36; // mm
const SENSOR_HEIGHT_35MM = 24; // mm
const SENSOR_DIAG_35MM = Math.sqrt(
    SENSOR_WIDTH_35MM ** 2 + SENSOR_HEIGHT_35MM ** 2
); // ≈ 43.266 mm

// Focal-plane resolution-unit multipliers (EXIF spec + common extensions)
const FOCAL_PLANE_UNIT_MM = {
    // Unit 1 ("no unit") is intentionally omitted — cannot be converted to mm
    2: 25.4,   // inch → mm
    3: 10,     // cm   → mm
    4: 1,      // mm   → mm
    5: 0.001,  // µm   → mm
};

/**
 * Resolve the mm-per-unit multiplier from the FocalPlaneResolutionUnit tag.
 * Returns null if the unit is 1 ("no absolute unit") or unrecognised.
 */
function focalPlaneUnitMul(unitTag) {
    if (unitTag === 1) return null; // no absolute unit
    return FOCAL_PLANE_UNIT_MM[unitTag] ?? FOCAL_PLANE_UNIT_MM[2]; // default inch
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function rad2deg(r) {
    return (r * 180) / Math.PI;
}

/**
 * Compute the close-focus correction factor.
 *
 * When the subject is at a finite distance, the effective focal length
 * increases according to the thin-lens equation, slightly narrowing the FOV.
 * At infinity the correction is 1.0 (no change).
 *
 * @param {number} focalLengthMm  – focal length in mm
 * @param {number|null} focusDistM – focus/subject distance in metres (null = infinity)
 * @returns {number} correction multiplier (≥ 1.0)
 */
export function closeFocusCorrectionFactor(focalLengthMm, focusDistM) {
    if (!focusDistM || focusDistM <= 0) return 1;
    const d = 1000 * focusDistM - focalLengthMm; // image-side distance in mm
    if (d <= 0) return 1;
    return 1 + focalLengthMm / d;
}

/**
 * Swap width and height when the EXIF Orientation tag indicates a 90° or 270°
 * rotation (values 5, 6, 7, 8).
 *
 * This is necessary because the stored pixel dimensions reflect the raw sensor
 * readout, but the *visual* width/height are transposed for portrait shots.
 *
 * NOTE: The diagonal length is invariant under rotation, so f_pixel (diagonal)
 * does not change — only HFOV and VFOV are affected.
 */
export function adjustForOrientation(width, height, orientation) {
    const rotated = orientation >= 5 && orientation <= 8;
    return rotated ? { width: height, height: width } : { width, height };
}

// ── 35 mm-equivalent focal length resolution ─────────────────────────────────

/**
 * Attempt to derive f_35mm from focal-plane resolution tags.
 * These tags describe how many resolution-units fit across the sensor, letting
 * us back-calculate the physical sensor dimensions.
 *
 * Falls back to using Y-resolution / height if X-resolution / width is
 * unavailable, and cross-checks both axes when both are present.
 *
 * @returns {number|null} f_35mm in mm, or null if insufficient data
 */
function f35mmFromFocalPlane(meta) {
    const { focalLength } = meta;
    if (!focalLength) return null;

    const sensor = computeActualSensorDimensions(meta);
    if (!sensor) return null;

    let cropFactor = null;

    if (sensor.sensorWidth) {
        cropFactor = SENSOR_WIDTH_35MM / sensor.sensorWidth;
    }

    if (sensor.sensorHeight) {
        const cropFactorY = SENSOR_HEIGHT_35MM / sensor.sensorHeight;
        if (cropFactor === null) {
            cropFactor = cropFactorY;
        } else {
            cropFactor = (cropFactor + cropFactorY) / 2;
        }
    }

    if (cropFactor === null) return null;

    return focalLength * cropFactor;
}

/**
 * Resolve the 35 mm-equivalent focal length from available metadata.
 *
 * Priority:
 *   1. Direct `FocalLengthIn35mmFormat` tag
 *   2. `FocalLength × ScaleFactor35efl`  (ExifTool-computed, non-standard EXIF)
 *   3. Focal-plane resolution fallback
 */
export function getF35mm(meta) {
    // 1. Direct tag
    if (meta.focalLengthIn35mm) {
        return meta.focalLengthIn35mm;
    }

    // 2. Scale factor (ExifTool-computed composite tag — not a native EXIF field)
    if (meta.focalLength && meta.scaleFactor35efl) {
        return meta.focalLength * meta.scaleFactor35efl;
    }

    // 3. Focal-plane resolution fallback
    const fromPlane = f35mmFromFocalPlane(meta);
    if (fromPlane !== null) return fromPlane;

    throw new Error(
        "Cannot determine 35 mm-equivalent focal length. " +
        "The image must contain either FocalLengthIn35mmFormat, " +
        "FocalLength + ScaleFactor35efl, or FocalLength + FocalPlaneResolution tags. " +
        "FocalPlaneResolutionUnit must not be 1 (no-unit)."
    );
}

// ── FOV computation ──────────────────────────────────────────────────────────

/**
 * Compute horizontal, vertical, and diagonal field of view in degrees.
 *
 * @param {number} f35mm – 35 mm-equivalent focal length (mm)
 * @returns {{ hfov: number, vfov: number, dfov: number }}
 */
export function computeFov(f35mm) {
    const hfov = rad2deg(2 * Math.atan(SENSOR_WIDTH_35MM / (2 * f35mm)));
    const vfov = rad2deg(2 * Math.atan(SENSOR_HEIGHT_35MM / (2 * f35mm)));
    const dfov = rad2deg(2 * Math.atan(SENSOR_DIAG_35MM / (2 * f35mm)));
    return { hfov, vfov, dfov };
}

// ── Sensor dimensions (private, used by f35mmFromFocalPlane) ─────────────────

/**
 * Derive physical sensor dimensions (mm) from focal plane resolution EXIF tags.
 * @private
 */
function computeActualSensorDimensions(meta) {
    const { focalPlaneXRes, focalPlaneYRes, focalPlaneUnit, width, height } = meta;

    const unitMul = focalPlaneUnitMul(focalPlaneUnit);
    if (unitMul === null) return null;

    let sensorWidth = null;
    let sensorHeight = null;

    if (focalPlaneXRes && width) {
        sensorWidth = (width / focalPlaneXRes) * unitMul;
    }

    if (focalPlaneYRes && height) {
        sensorHeight = (height / focalPlaneYRes) * unitMul;
    }

    if (sensorWidth === null && sensorHeight === null) return null;

    return { sensorWidth, sensorHeight };
}

// ── Diagonal pixel focal length ──────────────────────────────────────────────

/**
 * Compute the diagonal focal length in pixel units.
 *
 * This is the metric used by SfM / SLAM / camera-calibration pipelines and
 * represents how many pixels correspond to one radian of view along the
 * image diagonal.
 *
 * Formula:  f_pixel = (f_35mm / 43.266) × √(W² + H²)
 *
 * @param {number} f35mm  – 35 mm-equivalent focal length (mm)
 * @param {number} width  – image width in pixels (visual, post-orientation)
 * @param {number} height – image height in pixels (visual, post-orientation)
 * @returns {number} focal length in pixels (diagonal)
 */
export function computeDiagonalPixelFocalLength(f35mm, width, height) {
    const diagPixels = Math.sqrt(width ** 2 + height ** 2);
    return (f35mm / SENSOR_DIAG_35MM) * diagPixels;
}
