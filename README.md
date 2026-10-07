# PhiForm

**PhiForm** is an AI-native 3D creation workbench built around one rule:

> Neural systems may propose geometry. The workspace keeps editable state, provenance, and export authority.

## Current state — v0.7 / Rung 7

PhiForm now includes a measurable production-geometry qualification and export path.

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
- topology and attribute audit per mesh
- invalid/non-finite vertex detection
- degenerate triangle detection
- open boundary-edge detection
- non-manifold edge detection
- normal and UV readiness checks
- explicit pass / warning / fail qualification
- conservative indexed-degenerate removal
- vertex-normal recomputation
- Meshopt-backed LOD generation through Three.js `SimplifyModifier`
- preservation skips for skinned, morph-target, and multi-material meshes
- production profiles for Archive GLB, Web Balanced, Godot Game, and Unreal Game
- profile triangle budgets and LOD ratios
- SHA-256 over every exported LOD GLB
- `phiform.production-receipt.v1` manifest
- project v4 persistence of production receipts
- CI contract for geometry diagnostics and conservative repair

## Production profiles

| Profile | LOD ratios | LOD0 triangle budget | Conservative repair |
| --- | --- | ---: | --- |
| Archive GLB | 1.00 | preserve | off |
| Web Balanced | 1.00 / 0.50 / 0.20 | 60,000 | on |
| Godot Game | 1.00 / 0.50 / 0.25 | 80,000 | on |
| Unreal Game | 1.00 / 0.50 / 0.25 | 120,000 | on |

A profile is a reproducible PhiForm export policy, not a claim that every resulting mesh is automatically ideal for that engine.

## Qualification semantics

```text
PASS
  no audited defects for the selected profile

WARNING
  usable candidate with findings such as open boundaries,
  degenerates, missing UVs/normals, or budget pressure

FAIL
  invalid vertex positions or non-manifold edges remain
```

PhiForm does **not** claim that an open mesh is invalid. Open boundaries are reported because watertightness is not proven.

Non-manifold topology is currently reported as a failure because the production pipeline does not yet have a qualified manifold reconstruction algorithm.

## Production pack

A production build generates:

```text
<form>-<profile>-lod0.glb
<form>-<profile>-lod1.glb
<form>-<profile>-lod2.glb
<form>-<profile>-production.json
```

Profiles with one LOD generate only LOD0.

Every GLB receives a SHA-256 in the production receipt. The receipt also binds:

- source artifact ID
- source edit-graph node
- selected profile
- pre-export audit
- post-export audit for every LOD
- operations and skips
- triangle counts
- byte lengths
- SHA-256 hashes

See [docs/PRODUCTION.md](docs/PRODUCTION.md).

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
npm run check
npm run build
```

## Project files

New saves use:

```text
phiform.project.v4
```

Project v4 preserves:

- source artifact metadata
- current workspace edit state
- generation receipt
- edit graph + edit receipts
- agent audit receipts
- production receipts
- embedded source GLB bytes for portable projects

Project v1, v2, and v3 files remain importable. Migration creates empty histories for capabilities that did not exist in the older schema rather than inventing evidence.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Adapter contract](docs/ADAPTERS.md)
- [Local bridge protocol](docs/BRIDGE.md)
- [Stable Fast 3D backend](docs/SF3D.md)
- [Editable workspace](docs/WORKSPACE.md)
- [Neural edit graph](docs/EDIT_GRAPH.md)
- [Agent command API](docs/AGENT_API.md)
- [Production geometry](docs/PRODUCTION.md)

## Next

The next production layers can add qualified manifold repair, texture qualification/compression, richer engine manifests, collision generation, and eventually retopology backends.

## License

PhiForm code is MIT licensed.

Third-party model code, weights, dependencies, model outputs, and services may be governed by separate terms. Stable Fast 3D is not relicensed by PhiForm.
