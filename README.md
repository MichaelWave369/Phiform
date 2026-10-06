# PhiForm

**PhiForm** is an AI-native 3D creation workbench built around one rule:

> Neural systems may propose geometry. The workspace keeps editable state, provenance, and export authority.

## Current state — v0.4 / Rung 4

PhiForm has crossed the line from neural generator into an editable 3D workbench.

### Rung 1 — workbench foundation ✅
React/TypeScript studio, Three.js viewport, adapter contract, proof generation, receipts.

### Rung 2 — local inference bridge ✅
Backend discovery, async jobs, GLB ingestion, SHA-256-bound artifacts.

### Rung 3 — first neural backend ✅
Optional Stable Fast 3D integration through an operator-installed upstream checkout.

### Rung 4 — editable workspace ✅
- orbit camera controls
- click selection
- translate / rotate / scale transform gizmos
- numeric transform editing
- non-destructive edit layer over the source artifact
- optional material color / metalness / roughness override
- live mesh, vertex, triangle, material, and bounds inspection
- browser-local project persistence in IndexedDB
- GLB bytes persisted with the project rather than relying on an old bridge URL
- portable `.phiform.json` project files with embedded GLB bytes
- portable project import
- edited/baked GLB export through Three.js GLTFExporter
- source-generation receipts kept separate from workspace edit revisions

## Run

```bash
npm install
npm run dev
```

Bridge:

```bash
npm run bridge
```

Stable Fast 3D setup is documented in [docs/SF3D.md](docs/SF3D.md).

## Workspace model

```text
source artifact
(GLB / proof geometry)
        |
        | immutable provenance
        v
+-------------------------+
| PhiForm workspace layer |
| position                |
| rotation                |
| scale                   |
| material override       |
| edit revision           |
+-------------------------+
        |
        +--------> browser project save
        |          manifest + GLB bytes
        |
        +--------> portable .phiform.json
        |          manifest + embedded GLB
        |
        +--------> edited GLB export
                   baked current state
```

The source generation receipt is not rewritten when you move, recolor, or scale an object. Those operations belong to the workspace edit layer. Exporting an edited GLB creates a derived artifact without pretending the neural source changed retroactively.

## Qualification

```bash
npm run contract
npm run check
npm run build
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Adapter contract](docs/ADAPTERS.md)
- [Local bridge protocol](docs/BRIDGE.md)
- [Stable Fast 3D backend](docs/SF3D.md)
- [Editable workspace](docs/WORKSPACE.md)

## Planned rungs

1. Workbench foundation ✅
2. Local inference bridge ✅
3. First neural backend / SF3D ✅
4. Editable geometry workspace ✅
5. **Neural edit graph**: non-destructive branches, masks, localized edits, version lineage.
6. **Agent interface**: deterministic commands and capability-scoped modeling operations.
7. **Production path**: retopo/LOD, texture pipeline, export qualification, game-engine packages.

## License

PhiForm code is MIT licensed.

Third-party model code, weights, dependencies, model outputs, and services may be governed by separate terms. Stable Fast 3D is not relicensed by PhiForm.
