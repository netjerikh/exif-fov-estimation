import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
    adjustForOrientation,
    computeFov,
    computeDiagonalPixelFocalLength,
    closeFocusCorrectionFactor,
} from "../src/compute.js";

/**
 * Helper: assert a value is within ±tolerance of expected.
 */
function assertClose(actual, expected, tolerance, label) {
    assert.ok(
        Math.abs(actual - expected) <= tolerance,
        `${label}: expected ~${expected} ±${tolerance}, got ${actual}`
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Unit tests for pure computation functions
// ─────────────────────────────────────────────────────────────────────────────

describe("adjustForOrientation", () => {
    it("should not swap for orientations 1–4", () => {
        for (const o of [1, 2, 3, 4]) {
            const { width, height } = adjustForOrientation(4000, 3000, o);
            assert.equal(width, 4000);
            assert.equal(height, 3000);
        }
    });

    it("should swap width/height for orientations 5–8", () => {
        for (const o of [5, 6, 7, 8]) {
            const { width, height } = adjustForOrientation(4000, 3000, o);
            assert.equal(width, 3000);
            assert.equal(height, 4000);
        }
    });
});

describe("computeFov", () => {
    it("should compute correct FOV for 50mm full-frame equivalent", () => {
        const { hfov, vfov, dfov } = computeFov(50);
        assertClose(hfov, 39.6, 0.1, "HFOV@50mm");
        assertClose(vfov, 26.99, 0.1, "VFOV@50mm");
        assertClose(dfov, 46.79, 0.1, "DFOV@50mm");
    });

    it("should compute correct FOV for 24mm full-frame equivalent", () => {
        const { hfov } = computeFov(24);
        assertClose(hfov, 73.74, 0.1, "HFOV@24mm");
    });
});

describe("computeDiagonalPixelFocalLength", () => {
    it("should be rotation-invariant", () => {
        const f1 = computeDiagonalPixelFocalLength(90, 6000, 4000);
        const f2 = computeDiagonalPixelFocalLength(90, 4000, 6000);
        assert.equal(f1, f2);
    });
});

describe("closeFocusCorrectionFactor", () => {
    it("should return 1 at infinity (null distance)", () => {
        assert.equal(closeFocusCorrectionFactor(100, null), 1);
    });

    it("should return 1 at infinity (0 distance)", () => {
        assert.equal(closeFocusCorrectionFactor(100, 0), 1);
    });

    it("should increase effective focal length for close subjects", () => {
        // 100mm lens focused at ~1.18m → corr ≈ 1.0926 → FOV ≈ 18.7°
        const corr = closeFocusCorrectionFactor(100, 1.18);
        assertClose(corr, 1.0926, 0.001, "correction at 1.18m");
    });

    it("should approach 1 for distant subjects", () => {
        const corr = closeFocusCorrectionFactor(100, 100); // 100m away
        assertClose(corr, 1.001, 0.001, "correction at 100m");
    });
});
