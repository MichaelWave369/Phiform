# Production Geometry — Rung 7

Rung 7 turns "production ready" into a set of measurable observations and explicit export transformations.

## Audit schema

Production receipts use:

```text
phiform.production-receipt.v1
```

Each mesh audit records:

- vertex count
- triangle count
- indexed vs non-indexed geometry
- normal presence and finiteness
- UV presence and finiteness
- non-finite vertex count
- degenerate triangle count
- open boundary-edge count
- non-manifold edge count

The object-level audit aggregates those values and produces:

```text
pass | warning | fail
```

## Edge analysis

Topology checks use quantized vertex positions rather than raw index identity.

This matters because GLB/game meshes often duplicate vertices at UV or hard-normal seams. Counting raw index edges would incorrectly report those seams as open topology.

Current quantization is intended for diagnostic robustness, not CAD-grade geometric proof.

## Degenerate triangles

A triangle is classified as degenerate when:

- two or more of its quantized positions coincide, or
- its cross-product area falls below the current epsilon

The conservative repair path removes detected degenerates only when the geometry is indexed.

Non-indexed geometry is left unchanged and the skip is written to the operation log.

## Normal repair

Profiles may request:

```text
computeVertexNormals()
```

This is an explicit shading repair. It does not claim preservation of authored custom normals.

Archive GLB does not recompute normals.

## LOD generation

PhiForm uses Three.js `SimplifyModifier`, currently backed upstream by meshoptimizer.

The modifier interprets its count parameter as an approximate number of vertices to remove. PhiForm converts each profile's requested ratio into that removal count.

Simplification is deliberately skipped for:

- `SkinnedMesh`
- geometry with morph targets
- geometry with more than one material group

Those skips are recorded in the production receipt.

This prevents the first LOD implementation from silently destroying animation/morph data or flattening multi-material assignments.

## Profiles

### Archive GLB

Purpose: preserve the current edited scene as closely as possible.

- one LOD
- no triangle budget
- no automatic degenerate removal
- no normal recomputation
- UVs not required

### Web Balanced

- 60k LOD0 triangle budget
- LOD ratios: 1.00 / 0.50 / 0.20
- conservative repair enabled
- valid UVs expected

### Godot Game

- 80k LOD0 triangle budget
- LOD ratios: 1.00 / 0.50 / 0.25
- conservative repair enabled
- valid UVs expected

This is a GLB-oriented export policy suitable for a Godot asset pipeline. Rung 7 does not claim to emit a native Godot scene/resource package.

### Unreal Game

- 120k LOD0 triangle budget
- LOD ratios: 1.00 / 0.50 / 0.25
- conservative repair enabled
- valid UVs expected

This is a GLB-oriented export policy suitable for downstream Unreal import. Rung 7 does not claim to emit a native Unreal `.uasset` package.

## Triangle budgets

If the source exceeds the selected LOD0 budget, PhiForm derives a base simplification ratio from:

```text
maxTriangles / sourceTriangles
```

Each profile LOD ratio is multiplied by that base ratio.

The simplifier is approximate. Post-export audits are authoritative; a profile name does not override measured output.

## Production pack

A completed pack downloads all LOD GLBs plus a JSON receipt manifest.

Example:

```text
robot-godot-game-lod0.glb
robot-godot-game-lod1.glb
robot-godot-game-lod2.glb
robot-godot-game-production.json
```

The receipt records SHA-256 over the exact browser-exported GLB bytes.

## Qualification severity

### fail

Currently triggered by:

- non-finite vertex positions
- non-manifold edges

### warning

May be triggered by:

- degenerate triangles
- boundary edges
- missing/invalid normals
- missing/invalid UVs when the selected profile expects UVs
- LOD0 still exceeding the selected profile budget

### pass

No audited issue relevant to the selected profile remains.

## What Rung 7 does not claim

PhiForm does not yet claim:

- manifold reconstruction
- automatic hole filling
- self-intersection detection
- UV overlap detection
- texel-density qualification
- texture compression/transcoding
- baked normal-map preservation after aggressive retopo
- skeleton-aware LOD reduction
- collision mesh generation
- native Godot resource generation
- native Unreal asset generation
- semantic retopology

Those require their own qualified algorithms and receipts.

## CI qualification

`npm run production:contract` creates controlled synthetic geometries and verifies:

- closed-box topology reports no boundary/non-manifold edges
- open triangle reports exactly three boundary edges
- degenerate triangle is detected
- a three-face shared edge reports non-manifold topology
- conservative indexed-degenerate removal succeeds
- normal recomputation succeeds
- non-manifold geometry produces fail severity
- production profile generates the expected number of LOD variants
