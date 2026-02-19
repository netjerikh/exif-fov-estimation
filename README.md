# FOV Estimation

Extract **field of view** and **diagonal pixel focal length** from image EXIF metadata.

Supports JPEG, HEIC, TIFF, PNG, DNG, CR2, NEF, ARW, and more — powered by [exiftool-vendored](https://github.com/photostructure/exiftool-vendored.js).

## Install

```bash
npm install
```

## Usage

### Single image

```bash
node src/index.js <image-path>
```

```
┌─────────────────────────────────────────────────┐
│           FOV Estimation Results                │
├─────────────────────────────────────────────────┤
│  File:               photo.jpg
│  Raw dimensions:     6000 × 4000 px
│  Orientation:        1
│  Visual dimensions:  6000 × 4000 px
│  Focal length:       90.00 mm
│  Focal length (35mm):90.00 mm
│  Scale Factor:       1.00
├─────────────────────────────────────────────────┤
│  f_pixel (diagonal): 15000.00 px
├─────────────────────────────────────────────────┤
│  HFOV:               22.62°
│  VFOV:               15.19°
│  DFOV:               27.03°
└─────────────────────────────────────────────────┘
```

### Batch (all images in `assets/`)

```bash
node src/batch.js
```

### Programmatic

```js
import { analyze } from "./src/index.js";

// FOV at infinity (default)
const result = await analyze("photo.jpg");
console.log(result.fPixelDiagonal); // focal length in pixels
console.log(result.hfov);           // horizontal FOV in degrees

// With close-focus correction (accounts for finite subject distance)
const corrected = await analyze("photo.jpg", { applyCloseFocusCorrection: true });
```

## Computed metrics

| Metric | Formula | Description |
|---|---|---|
| **HFOV** | `2 × atan(36 / (2 × f₃₅))` | Horizontal field of view (degrees) |
| **VFOV** | `2 × atan(24 / (2 × f₃₅))` | Vertical field of view (degrees) |
| **DFOV** | `2 × atan(43.266 / (2 × f₃₅))` | Diagonal field of view (degrees) |
| **f_pixel** | `(f₃₅ / 43.266) × √(W² + H²)` | Diagonal pixel focal length |

Where `f₃₅` = `FocalLengthIn35mmFormat` from EXIF (or computed via `FocalLength × ScaleFactor`).

FOV uses the hardcoded 36 × 24 mm (full-frame) sensor model, matching ExifTool's approach.

### Close-focus correction

When `applyCloseFocusCorrection` is enabled, the effective focal length is adjusted using the thin-lens equation:

```
correction = 1 + focalLength / (focusDistance × 1000 − focalLength)
```

This accounts for the fact that at finite subject distances the effective focal length increases, slightly narrowing the FOV. The focus distance is read from EXIF tags (`FocusDistance`, `SubjectDistance`, or `ApproximateFocusDistance`). When disabled (default), FOV is computed at infinity — the standard convention for photography and computer vision.

## Orientation handling

EXIF orientations 5–8 (90°/270° rotations) swap the visual width and height:
- **HFOV / VFOV** are swapped so labels match the on-screen visual direction
- **f_pixel (diagonal)** is unchanged — the diagonal is rotation-invariant

## Tests

```bash
npm test
```
