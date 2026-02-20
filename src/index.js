#!/usr/bin/env node

/**
 * FOV Estimation CLI
 *
 * Usage:   node src/index.js <image-path>
 *
 * Extracts EXIF metadata from the supplied image and prints:
 *   • Diagonal pixel focal length (f_pixel)
 *   • Horizontal, Vertical, and Diagonal FOV in degrees
 */

import { extractExif, shutdown } from "./exif.js";
import {
    getF35mm,
    adjustForOrientation,
    computeFov,
    computeDiagonalPixelFocalLength,
    closeFocusCorrectionFactor,
} from "./compute.js";

/**
 * Analyse an image and return all FOV / focal-length metrics.
 *
 * FOV is computed using the 35 mm full-frame model (36 × 24 mm sensor),
 * matching ExifTool's approach.  An optional close-focus correction can
 * be applied to account for the effective focal length increase when the
 * subject is at a finite distance (thin-lens equation).
 *
 * @param {string}  filePath – path to an image file
 * @param {{ applyCloseFocusCorrection?: boolean }} [options]
 * @returns {Promise<object>} – result object with all computed values
 */
export async function analyze(filePath, { applyCloseFocusCorrection = false } = {}) {
    const meta = await extractExif(filePath);

    const f35mm = getF35mm(meta);

    // Raw pixel dimensions (as stored in the file)
    const rawWidth = meta.width;
    const rawHeight = meta.height;

    // Visual dimensions after correcting for EXIF orientation
    const { width, height } = adjustForOrientation(
        rawWidth,
        rawHeight,
        meta.orientation
    );

    const isRotated = meta.orientation >= 5 && meta.orientation <= 8;

    // Close-focus correction: when subject is at finite distance the
    // effective focal length increases, narrowing the FOV (thin-lens eq).
    const corr = applyCloseFocusCorrection
        ? closeFocusCorrectionFactor(meta.focalLength, meta.focusDistance)
        : 1;

    let { hfov, vfov, dfov } = computeFov(f35mm * corr);

    // Swap HFOV/VFOV for portrait orientations so the labels match the
    // visual on-screen directions.
    if (isRotated) {
        [hfov, vfov] = [vfov, hfov];
    }

    // Diagonal pixel focal length (invariant under rotation)
    const fPixel = computeDiagonalPixelFocalLength(f35mm, rawWidth, rawHeight);

    return {
        file: filePath,
        rawWidth,
        rawHeight,
        visualWidth: width,
        visualHeight: height,
        orientation: meta.orientation,
        focalLength: meta.focalLength,
        focalLengthIn35mm: f35mm,
        scaleFactor35efl: meta.scaleFactor35efl,
        fPixelDiagonal: fPixel,
        hfov,
        vfov,
        dfov,
        focusDistance: meta.focusDistance,
    };
}

// ── CLI ──────────────────────────────────────────────────────────────────────

async function main() {
    const filePath = process.argv[2];

    if (!filePath) {
        console.error("Usage: node src/index.js <image-path>");
        process.exit(1);
    }

    try {
        const result = await analyze(filePath);

        console.log();
        console.log("┌─────────────────────────────────────────────────┐");
        console.log("│           FOV Estimation Results                │");
        console.log("├─────────────────────────────────────────────────┤");
        console.log(`│  File:               ${result.file}`);
        console.log(
            `│  Raw dimensions:     ${result.rawWidth} × ${result.rawHeight} px`
        );
        console.log(`│  Orientation:        ${result.orientation}`);
        console.log(
            `│  Visual dimensions:  ${result.visualWidth} × ${result.visualHeight} px`
        );
        console.log(
            `│  Focal length:       ${result.focalLength?.toFixed(2) ?? "N/A"} mm`
        );
        console.log(
            `│  Focal length (35mm):${result.focalLengthIn35mm.toFixed(2)} mm`
        );
        console.log(
            `│  Scale Factor:      ${result.scaleFactor35efl?.toFixed(2) ?? "N/A"}`
        );
        console.log("├─────────────────────────────────────────────────┤");
        console.log(
            `│  f_pixel (diagonal): ${result.fPixelDiagonal.toFixed(2)} px`
        );
        console.log("├─────────────────────────────────────────────────┤");
        console.log(`│  HFOV:               ${result.hfov.toFixed(2)}°`);
        console.log(`│  VFOV:               ${result.vfov.toFixed(2)}°`);
        console.log(`│  DFOV:               ${result.dfov.toFixed(2)}°`);
        console.log("└─────────────────────────────────────────────────┘");
        console.log();
    } catch (err) {
        console.error(`Error: ${err.message}`);
        process.exit(1);
    } finally {
        await shutdown();
    }
}

// Only run CLI when executed directly (not when imported)
const isDirectRun =
    process.argv[1] &&
    import.meta.url.endsWith(process.argv[1].replace(/.*\//, ""));
if (isDirectRun) {
    main();
}
