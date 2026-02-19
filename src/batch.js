#!/usr/bin/env node

/**
 * Batch FOV Estimation
 *
 * Iterates over every image in the ./assets directory and prints the
 * FOV estimation results for each file.
 */

import { readdir } from "node:fs/promises";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { analyze } from "./index.js";
import { shutdown } from "./exif.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ASSETS_DIR = join(__dirname, "..", "assets");

const SUPPORTED_EXTENSIONS = new Set([
    ".jpg",
    ".jpeg",
    ".png",
    ".tiff",
    ".tif",
    ".heic",
    ".heif",
    ".avif",
    ".webp",
    ".dng",
    ".cr2",
    ".nef",
    ".arw",
]);

async function main() {
    const entries = await readdir(ASSETS_DIR);

    const imageFiles = entries
        .filter((f) => SUPPORTED_EXTENSIONS.has(extname(f).toLowerCase()))
        .sort();

    console.log(`\nFound ${imageFiles.length} image(s) in assets/\n`);

    let successes = 0;
    let failures = 0;

    for (const file of imageFiles) {
        const filePath = join(ASSETS_DIR, file);

        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`  ${file}`);
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

        try {
            const r = await analyze(filePath);

            console.log(`  Dimensions:      ${r.rawWidth} × ${r.rawHeight} px`);
            console.log(
                `  Orientation:     ${r.orientation}${r.orientation >= 5 ? " (rotated → " + r.visualWidth + " × " + r.visualHeight + ")" : ""}`
            );
            console.log(
                `  Focal length:    ${r.focalLength?.toFixed(2) ?? "N/A"} mm  (35mm eq: ${r.focalLengthIn35mm.toFixed(2)} mm)`
            );
            console.log(
                `  Scale Factor:    ${r.scaleFactor35efl?.toFixed(2) ?? "N/A"}`
            );
            console.log(
                `  f_pixel (diag):  ${r.fPixelDiagonal.toFixed(2)} px`
            );
            console.log(
                `  HFOV / VFOV:     ${r.hfov.toFixed(2)}° / ${r.vfov.toFixed(2)}°`
            );
            console.log(`  DFOV:            ${r.dfov.toFixed(2)}°`);

            successes++;
        } catch (err) {
            console.log(`  ⚠ Error: ${err.message}`);
            failures++;
        }

        console.log();
    }

    console.log(`── Summary: ${successes} succeeded, ${failures} failed ──\n`);

    await shutdown();
}

main();
