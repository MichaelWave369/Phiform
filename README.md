# PhiForm

**PhiForm** is an AI-native 3D creation workbench built around one rule:

> Neural systems may propose geometry. The workspace keeps editable state, provenance, and export authority.

## Current state — v0.13 / Rung 13

PhiForm now binds official Khronos glTF validation reports to exact derived GLB hashes and supplements them with PhiForm-specific BasisU semantic checks.

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

### Rung 10 — executed KTX2 / Basis compression ✅
- operator-probed Khronos KTX Software backend
- `PHIFORM_KTX_BIN` override with PATH fallback to `ktx`
- browser-normalized PNG sources from audited 8-bit LDR textures
- role-derived sRGB / linear transfer semantics
- ETC1S / BasisLZ execution for compact color/scalar maps
- UASTC LDR 4x4 + RDO + Zstd execution for normal/height-detail maps
- full mip pyramid requested during KTX creation
- guarded temp-directory execution with fixed codec allowlist
- source PNG SHA-256 verified by the bridge
- KTX2 output identifier validation before hashing
- bridge SHA-256 over exact returned KTX2 bytes
- independent browser SHA-256 verification
- batch receipt emitted only after every texture validates
- `phiform.texture-encode-receipt.v1`
- project v7 persistence of executed texture receipts
- CI fixture verifies CLI arguments and bridge lifecycle without claiming a real codec run

### Rung 11 — `KHR_texture_basisu` derived GLB ✅
- texture-identity tags during Three.js GLB export
- explicit refusal when Three would synthesize a metalness/roughness composite from two different source textures
- pure GLB v2 parser/rewriter
- verified KTX2 bytes appended to the embedded BIN chunk
- 4-byte-aligned KTX2 bufferViews
- `image/ktx2` image entries
- `textures[*].extensions.KHR_texture_basisu.source` bindings
- original PNG/JPEG `texture.source` fallback preserved
- `extensionsUsed` includes `KHR_texture_basisu`
- extension intentionally remains optional while fallback images exist
- 4×4 dimension gate for `KHR_texture_basisu` compatibility
- full vs partial binding coverage
- fallback-only exported texture accounting
- executed-but-unbound KTX2 accounting
- source and derived GLB SHA-256
- `phiform.basisu-derived-receipt.v1`
- project v8 persistence of derived receipts
- session-local KTX2 payload requirement prevents hashes from being mistaken for bytes

### Rung 12 — compact required-BasisU GLB ✅
- accepts only FULL-coverage Rung 11 assets
- verifies in-session fallback-bearing GLB bytes against their receipt
- removes core `texture.source` fallbacks
- promotes `KHR_texture_basisu` into `extensionsRequired`
- removes superseded PNG/JPEG image objects
- remaps surviving KTX2 image indices
- recursively discovers still-referenced bufferViews
- drops unreferenced fallback image bufferViews
- rebuilds the BIN chunk from surviving referenced ranges
- preserves bufferView payload bytes and metadata
- re-aligns compacted bufferViews on 4-byte offsets
- updates all surviving `bufferView` references
- records physically reclaimed binary bytes
- source/compact GLB SHA-256 lineage
- `phiform.basisu-compact-receipt.v1`
- project v9 persistence
- CI proves real GLB byte savings, not JSON-only cleanup

### Rung 13 — official glTF validation receipts ✅
- official `gltf-validator` NPM package from KhronosGroup
- localhost `POST /v1/gltf-validate` bridge boundary
- validator version captured from the report
- exact submitted GLB SHA-256 + byte length echoed and verified
- Khronos errors / warnings / infos / hints preserved
- issue code, severity, pointer/offset, and message preserved
- `extensionsUsed` / `extensionsRequired` observed from the report
- PhiForm-specific `KHR_texture_basisu` semantic checks
- fallback-bearing and compact BasisU validation profiles
- PASS / WARNING / FAIL policy
- informational-only reports remain PASS
- warnings become WARNING
- official errors or PhiForm BasisU failures become FAIL
- `phiform.gltf-validation-receipt.v1`
- project v10 persistence of validation receipts
- Rung 11 and Rung 12 outputs validated against the exact bytes before final status

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
npm run texture:encode:contract
npm run basisu:contract
npm run basisu:compact:contract
npm run gltf:validation:contract
npm run check
npm run build
```

## Project files

New saves use:

```text
phiform.project.v10
```

Project v10 preserves generation evidence, workspace state, edit lineage, agent receipts, production receipts, engine-pack receipts, texture qualification receipts, executed KTX2 receipts, BasisU-derived GLB receipts, compact BasisU receipts, glTF validation receipts, and embedded source GLB bytes.

Project v1 through v9 remain importable. Migration never invents history for capabilities that did not exist yet.

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
- [Executed KTX2 / Basis encoding](docs/KTX2_ENCODING.md)
- [KHR_texture_basisu derived GLB](docs/BASISU_GLB.md)
- [Compact required-BasisU GLB](docs/BASISU_COMPACTION.md)
- [glTF validation receipts](docs/GLTF_VALIDATION.md)

## Next

Likely next production work includes release gating on validation receipts, visual texture error metrics, qualified manifold repair, better collision proxies, semantic retopology, and engine-side validation of compact BasisU imports.

## License

PhiForm code is MIT licensed.

Third-party model code, weights, dependencies, model outputs, and services may be governed by separate terms. Stable Fast 3D is not relicensed by PhiForm.
