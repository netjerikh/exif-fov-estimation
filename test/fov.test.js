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

describe("computeFov portrait swap", () => {
    it("computeFov always returns landscape-oriented values (hfov > vfov)", () => {
        const { hfov, vfov } = computeFov(30);
        assert.ok(hfov > vfov, `expected hfov (${hfov}) > vfov (${vfov})`);
    });

    it("should swap HFOV/VFOV for a portrait image regardless of orientation tag", () => {
        // Simulates the logic in analyze(): computeFov gives landscape angles,
        // then we swap when visual width < height.
        const f35mm = 30;
        let { hfov, vfov, dfov } = computeFov(f35mm);

        // Case 1: HEIC with orientation=5 (raw 3088×2316 → visual 2316×3088)
        const heic = adjustForOrientation(3088, 2316, 5);
        let hfov1 = hfov, vfov1 = vfov;
        if (heic.width < heic.height) [hfov1, vfov1] = [vfov1, hfov1];

        // Case 2: JPG with orientation=1 (already stored as 2316×3088)
        const jpg = adjustForOrientation(2316, 3088, 1);
        let hfov2 = hfov, vfov2 = vfov;
        if (jpg.width < jpg.height) [hfov2, vfov2] = [vfov2, hfov2];

        // Both should produce the same portrait FOV
        assert.equal(hfov1, hfov2);
        assert.equal(vfov1, vfov2);

        // Portrait: HFOV should be the narrower angle
        assert.ok(hfov1 < vfov1, `portrait: expected hfov (${hfov1}) < vfov (${vfov1})`);
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
