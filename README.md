# PhiForm

**PhiForm** is an AI-native 3D creation workbench built around one rule:

> Neural systems may propose geometry. The workspace keeps editable state, provenance, and export authority.

## Current state — v0.5 / Rung 5

PhiForm now has a branchable edit graph on top of its neural generation and 3D editing stack.

### Rung 1 — workbench foundation ✅
React/TypeScript studio, Three.js viewport, adapter contract, proof generation, receipts.

### Rung 2 — local inference bridge ✅
Backend discovery, async jobs, GLB ingestion, SHA-256-bound artifacts.

### Rung 3 — first neural backend ✅
Optional Stable Fast 3D integration through an operator-installed upstream checkout.

### Rung 4 — editable workspace ✅
Orbit/select/transform/material editing, mesh inspection, browser persistence, portable projects, edited GLB export.

### Rung 5 — neural edit graph ✅
- branchable edit history
- explicit working-tree dirty/clean state
- committed workspace snapshots
- checkout of prior graph nodes
- stable per-mesh targeting from viewport clicks
- whole-artifact targeting
- mesh-target metadata with vertex/triangle counts
- neural edit intent nodes
- explicit `recorded-only` execution state when no edit backend ran
- formal `phiform.edit-receipt.v1` receipts
- derived GLB export lineage with browser-computed SHA-256
- project format v2 carrying the edit graph
- automatic import migration from Rung 4 `phiform.project.v1`
- CI contract for branch/intent/export lineage behavior

## Core history model

```text
source artifact
      |
      v
[source node]  main
      |
      v
[workspace snapshot]
      |\
      | \________________
      |                  \
      v                   v
main                 handle-variant
  |                       |
  v                       v
snapshot             neural edit intent
                          |
                          | execution: recorded-only
                          | target: mesh-003
                          v
                    future edit backend
                          |
                          v
                    derived artifact
```

An edit intent is **not** an edit result.

PhiForm can now record:

- what should change
- which mesh or artifact should change
- which graph node the request descends from
- which branch owns the request
- what workspace state existed when it was requested

Until a capable backend returns a changed artifact, that node remains `execution: recorded-only`.

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

## Qualification

```bash
npm run contract
npm run graph:contract
npm run check
npm run build
```

## Project files

New saves use:

```text
phiform.project.v2
```

Project v2 stores:

- source artifact metadata
- current working edit state
- generation receipt
- `phiform.edit-graph.v1`
- edit receipts
- embedded GLB bytes for portable GLB projects

Rung 4 `phiform.project.v1` files are migrated on import by creating a new source edit graph from their saved artifact/edit state.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Adapter contract](docs/ADAPTERS.md)
- [Local bridge protocol](docs/BRIDGE.md)
- [Stable Fast 3D backend](docs/SF3D.md)
- [Editable workspace](docs/WORKSPACE.md)
- [Neural edit graph](docs/EDIT_GRAPH.md)

## Planned rungs

1. Workbench foundation ✅
2. Local inference bridge ✅
3. First neural backend / SF3D ✅
4. Editable geometry workspace ✅
5. Neural edit graph ✅
6. **Agent interface**: deterministic commands and capability-scoped modeling operations.
7. **Production path**: retopo/LOD, texture pipeline, export qualification, game-engine packages.

## License

PhiForm code is MIT licensed.

Third-party model code, weights, dependencies, model outputs, and services may be governed by separate terms. Stable Fast 3D is not relicensed by PhiForm.
