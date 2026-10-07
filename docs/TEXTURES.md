# Texture + Material Qualification — Rung 9

Rung 9 qualifies the **material/texture delivery side** of a PhiForm asset without pretending that observation equals compression.

## Receipt schema

Texture qualification emits:

```text
phiform.texture-receipt.v1
```

Project persistence advances to:

```text
phiform.project.v6
```

## Texture policies

### Archive Textures

Observation-oriented policy.

- no hard maximum dimension
- no GPU-memory budget warning
- preserves findings without pressuring optimization

### Web Textures

- maximum recommended dimension: 2048
- estimated decoded texture budget: 256 MiB
- non-power-of-two is allowed

### Game Textures

- maximum recommended dimension: 4096
- estimated decoded texture budget: 512 MiB
- non-power-of-two is allowed

These are PhiForm policies, not engine laws.

## PBR role inventory

The auditor recognizes texture bindings used for:

- base color
- emissive
- normal
- roughness
- metalness
- ambient occlusion
- alpha
- bump
- displacement
- light maps

A texture is counted once even when reused by several material slots.

## Color-space expectations

PhiForm expects:

```text
sRGB
  base color
  emissive

linear / no color-space transform
  normal
  roughness
  metalness
  occlusion
  alpha
  bump
  displacement
  light
```

If the same Three.js texture object is assigned to both sRGB and linear-data roles, Rung 9 reports **FAIL** because one texture object's color-space state cannot satisfy both expectations at once.

A simple mismatch produces a warning.

## Packed metallic / roughness / occlusion

PhiForm recognizes a material as packed when its roughness and metallic slots reuse the same texture object, with AO optionally sharing it as well.

This prevents one packed texture from being counted as three separate GPU allocations.

## GPU-memory estimate

Rung 9 estimates decoded texture memory as RGBA8:

```text
width × height × 4 bytes
```

and includes the usual ~4/3 factor when mipmaps are expected.

This is an **estimate**, not a measurement of driver-specific compressed GPU residency.

## Dimension availability

Texture dimensions are read from the Three.js texture source/image when the browser exposes them.

If dimensions are unavailable, the audit records a warning rather than inventing dimensions.

## KTX2 / Basis Universal plan

Khronos defines KTX 2.0 as a GPU-friendly texture container for glTF, with Basis Universal supercompression available through `KHR_texture_basisu`.

Rung 9 creates a **plan only**:

```text
target: ktx2-basisu
status: planned-not-executed
```

Current recommendation policy:

- normal, bump, displacement → UASTC
- color/scalar maps → ETC1S

This follows the broad quality/size tradeoff expected from those Basis modes, but no compressed bytes are claimed in Rung 9.

A later rung must actually run an encoder, emit bytes, and hash them before PhiForm may claim KTX2 compression completed.

## Qualification severity

### PASS

No policy violation or color-space issue is detected.

### WARNING

Examples:

- texture exceeds profile dimension budget
- estimated decoded GPU memory exceeds profile budget
- texture dimensions unavailable
- role color space does not match expectation

### FAIL

Currently used when one texture object is reused across incompatible sRGB and linear-data roles.

## What Rung 9 does not claim

PhiForm does not yet claim:

- actual Basis Universal encoding
- KTX2 byte generation
- mipmap quality analysis
- UV overlap detection
- texel-density measurement
- normal-map tangent-basis validation
- channel-content inspection
- lossy visual-quality scoring
- texture atlas generation
- engine-native texture resource creation

Those require separate qualified operations.

## CI qualification

`npm run texture:contract` verifies:

- unique texture deduplication
- packed ORM recognition
- game-policy pass behavior
- web dimension warning behavior
- conflicting sRGB/linear reuse failure
- UASTC planning for normal maps
- ETC1S planning for color/scalar maps
- receipt state remains `compressionExecuted: false`
