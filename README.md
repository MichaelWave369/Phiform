# PhiForm

**PhiForm** is an AI-native 3D creation workbench built around one rule:

> Neural systems may propose geometry. The workspace keeps editable state, provenance, and export authority.

## Current state — v0.9 / Rung 9

PhiForm now qualifies the texture/material side of those assets too: PBR roles, color-space expectations, dimension budgets, packed maps, and estimated GPU memory.

### Rung 1 — workbench foundation ✅
React/TypeScript studio, Three.js viewport, adapter contract, proof generation, receipts.

### Rung 2 — local inference bridge ✅
Backend discovery, async jobs, GLB ingestion, SHA-256-bound artifacts.

### Rung 3 — first neural backend ✅
Optional Stable Fast 3D integration through an operator-installed upstream checkout.

### Rung 4 — editable workspace ✅
Orbit/select/transform/material editing, mesh inspection, browser persistence, portable projects, edited GLB export.

### Rung 5 — neural edit graph ✅
Branchable history, committed snapshots, mesh targeting, recorded-only neural intent, edit receipts, and SHA-256 derived-export lineage.

### Rung 6 — governed agent command API ✅
Capability-scoped commands, stale-state protection, replay protection, mesh discovery, agent receipts, and `window.PhiFormAgent`.

### Rung 7 — production geometry path ✅
Topology/attribute audit, conservative repair, Meshopt-backed LOD generation, production profiles, SHA-256 production receipts.

### Rung 8 — engine asset packs ✅
- Godot-oriented ZIP pack
- Unreal-oriented ZIP pack
- combined engine import GLB
- per-render-mesh box collision proxies
- Godot `-convcolonly` collision naming
- Unreal `UBX_<RenderMeshName>_00` collision naming
- Godot Game / Unreal Game production LOD policy reuse
- separate LOD GLBs under `models/`
- target-specific `IMPORT.md`
- `phiform.engine-pack.v1` manifest
- glTF coordinate/unit declaration
- SHA-256 for every packaged file
- SHA-256 for the final ZIP bytes
- `phiform.engine-pack-receipt.v1`
- deterministic package file ordering and fixed ZIP timestamps
- project v5 persistence of engine-pack receipts
- CI qualification for collision naming, package structure, embedded manifest, and deterministic ZIP output

### Rung 9 — texture + material qualification ✅
- archive, web, and game texture policies
- unique texture inventory across materials
- PBR role detection for base color, emissive, normal, metallic, roughness, AO, alpha, bump, displacement, and light maps
- sRGB vs linear-data expectation checks
- impossible mixed-role color-space reuse detection
- width / height / maximum-dimension checks
- estimated decoded RGBA8 + mipmap GPU memory
- oversized-texture warnings
- material-without-texture observation
- packed metallic/roughness/AO reuse recognition
- KTX2/Basis Universal compression planning
- UASTC recommendation for normal/height detail
- ETC1S recommendation for color/scalar maps
- explicit `planned-not-executed` compression status
- `phiform.texture-receipt.v1`
- project v6 persistence of texture receipts
- CI qualification for deduplication, ORM packing, policy warnings, color-space conflicts, and compression-plan semantics

## Engine pack structure

A typical pack looks like:

```text
my-asset-godot-engine-pack.zip
├── IMPORT.md
├── import/
│   └── asset-godot.glb
├── models/
│   ├── lod0.glb
│   ├── lod1.glb
│   └── lod2.glb
└── phiform-engine-manifest.json
```

The Unreal pack uses `import/asset-unreal.glb`.

The combined import scene contains:

- the production LOD0 visual geometry
- one simple box collision proxy per render mesh
- target-engine collision names

The separate LOD files are included and fully hashed, but PhiForm does **not** claim the target engine will automatically associate them without engine-side import configuration.

## Collision conventions

### Godot

Collision proxy meshes are named:

```text
<RenderMeshName>-convcolonly
```

This is designed for Godot's scene-import name-suffix workflow.

### Unreal Engine

Collision proxy meshes are named:

```text
UBX_<RenderMeshName>_00
```

This is designed for Unreal's collision-by-mesh-name import workflow.

Rung 8 uses **box proxies only**. It does not claim convex decomposition, per-poly collision optimization, or semantic collision authoring.

## Coordinates

The manifest explicitly records the glTF 2.0 source convention:

```text
handedness: right
up: +Y
forward: +Z
linear unit: meter
```

Target engines remain responsible for their import-space conversion.

## Package receipt

Each build emits an external receipt:

```text
phiform.engine-pack-receipt.v1
```

It binds:

- target engine
- source artifact ID
- exact source edit-graph node
- production profile
- collision node names
- LOD paths and triangle counts
- every packaged file's byte length + SHA-256
- package filename
- final ZIP byte length + SHA-256

The receipt is stored in the PhiForm project and downloaded beside the ZIP.

## Run

```bash
npm install
npm run dev
```

Local inference bridge:

```bash
npm run bridge
```

## Qualification

```bash
npm run contract
npm run graph:contract
npm run agent:contract
npm run production:contract
npm run engine:contract
npm run texture:contract
npm run check
npm run build
```

## Project files

New saves use:

```text
phiform.project.v6
```

Project v6 preserves generation evidence, workspace state, edit lineage, agent receipts, production receipts, engine-pack receipts, texture receipts, and embedded source GLB bytes.

Project v1 through v5 remain importable. Migration never invents history for capabilities that did not exist yet.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Adapter contract](docs/ADAPTERS.md)
- [Local bridge protocol](docs/BRIDGE.md)
- [Stable Fast 3D backend](docs/SF3D.md)
- [Editable workspace](docs/WORKSPACE.md)
- [Neural edit graph](docs/EDIT_GRAPH.md)
- [Agent command API](docs/AGENT_API.md)
- [Production geometry](docs/PRODUCTION.md)
- [Engine asset packs](docs/ENGINE_PACKS.md)
- [Texture + material qualification](docs/TEXTURES.md)

## Next

Likely next production rungs are actual KTX2/Basis encoding, qualified manifold repair, better collision proxies, and semantic retopology.

## License

PhiForm code is MIT licensed.

Third-party model code, weights, dependencies, model outputs, and services may be governed by separate terms. Stable Fast 3D is not relicensed by PhiForm.
