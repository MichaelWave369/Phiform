# Engine Asset Packs — Rung 8

Rung 8 turns PhiForm's production geometry outputs into portable, hashed bundles for downstream Godot and Unreal Engine import.

It does not generate proprietary native engine asset formats.

## Pack schema

Manifest:

```text
phiform.engine-pack.v1
```

External receipt:

```text
phiform.engine-pack-receipt.v1
```

Project persistence:

```text
phiform.project.v5
```

## Why GLB remains the boundary

PhiForm's current production boundary is glTF 2.0 / GLB.

Godot supports glTF/GLB scene import, and Unreal's current Interchange pipeline supports GLB import.

This keeps PhiForm's generated artifacts open and inspectable while leaving proprietary native resource generation to the target engine.

## Coordinate declaration

The engine manifest records the glTF 2.0 convention:

```json
{
  "standard": "glTF 2.0",
  "handedness": "right",
  "upAxis": "+Y",
  "forwardAxis": "+Z",
  "linearUnit": "meter"
}
```

PhiForm does not pre-rotate assets into an engine-specific coordinate basis.

The target importer remains responsible for conversion.

## Package structure

Godot example:

```text
IMPORT.md
import/asset-godot.glb
models/lod0.glb
models/lod1.glb
models/lod2.glb
phiform-engine-manifest.json
```

Unreal example:

```text
IMPORT.md
import/asset-unreal.glb
models/lod0.glb
models/lod1.glb
models/lod2.glb
phiform-engine-manifest.json
```

## Combined import scene

The file under `import/` contains:

- the production LOD0 visual candidate
- simple collision proxy geometry
- target-specific collision names

This is intentionally separate from the standalone LOD files so the primary import scene can carry collision conventions without duplicating those proxies into every LOD.

## Collision proxy policy

Rung 8 creates one **axis-aligned box proxy** per render mesh.

This is conservative and fast, but it is not semantically optimal for every asset.

### Godot

Each proxy uses:

```text
<RenderMeshName>-convcolonly
```

Godot's scene import can interpret this suffix as collision-only convex geometry when name-suffix processing is enabled.

### Unreal Engine

Each proxy uses:

```text
UBX_<RenderMeshName>_00
```

Unreal's import tooling recognizes `UBX_` as box-collision naming when collision import by mesh name is enabled.

### Current collision limitations

PhiForm does not yet claim:

- capsule fitting
- sphere fitting
- convex decomposition
- compound semantic collision
- skeletal collision bodies
- per-engine physics-material creation
- optimal collision complexity

Those are future qualified operations.

## LOD policy

Godot packs reuse:

```text
godot-game
```

Unreal packs reuse:

```text
unreal-game
```

The LOD GLBs are packaged under `models/`.

The manifest binds each LOD to:

- level
- requested simplification ratio
- measured triangle count
- exact SHA-256

PhiForm does not claim external LOD files are automatically associated by either engine.

## Deterministic ZIP structure

The ZIP builder:

- sorts package paths
- uses fixed ZIP modification timestamps
- stores already-compressed GLB files without additional DEFLATE compression
- compresses text/JSON files
- emits one manifest at the root

For identical input bytes and metadata, the engine-pack contract verifies identical ZIP bytes.

The package receipt then hashes those exact ZIP bytes.

## Import instructions

Every ZIP includes `IMPORT.md`.

The instructions explain:

- primary import-scene path
- collision naming convention
- LOD location
- scope limitations
- glTF coordinate convention

The notes are intentionally explicit that PhiForm does not produce native `.uasset`, `.tscn`, or `.scn` files.

## Receipt semantics

The external receipt records:

- engine target
- source artifact ID
- exact edit-graph node
- embedded manifest
- all packaged file records
- package filename
- package byte length
- package SHA-256

The receipt lives outside the ZIP because a ZIP cannot contain a stable hash of its own final bytes without creating a recursive self-hash problem.

## CI qualification

`npm run engine:contract` verifies:

- asset-name sanitization
- Godot collision suffixes
- Unreal UBX prefixes
- one collision proxy per render mesh
- target production-profile mapping
- deterministic ZIP bytes
- expected package paths
- embedded engine manifest
- glTF coordinate/unit declaration
- per-LOD SHA-256
- package SHA-256
- target-specific import instructions
