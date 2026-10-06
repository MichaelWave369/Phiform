# PhiForm

**PhiForm** is an AI-native 3D creation workbench built around a simple rule:

> Neural systems may propose geometry. The workspace keeps the editable state, provenance, and export authority.

PhiForm is intended to accept text, images, sketches, depth, multi-view captures, and existing meshes, then route those inputs through swappable 3D-generation backends without welding the editor to one model.

## Rung 1

This first rung establishes the product shell and the contracts beneath it:

- React + TypeScript + Vite studio shell
- Three.js interactive 3D viewport
- prompt + image input rail
- deterministic proof adapter for end-to-end generation flow
- swappable `Neural3DAdapter` interface
- artifact inspector
- generation receipts and local prototype checksums
- responsive layout
- CI build/typecheck
- GitHub Pages deployment workflow

**Important:** Rung 1 does not pretend the proof adapter is a neural model. It generates deterministic procedural geometry so the editor, receipts, and adapter boundary can be qualified before a heavyweight model is attached.

## Run locally

```bash
npm install
npm run dev
```

Build and type-check:

```bash
npm run build
npm run check
```

## Architecture

```text
Text / Image / Sketch / Mesh
            |
            v
      Input Envelope
            |
            v
   Neural3DAdapter contract
      |      |       |
      |      |       +-- future remote adapter
      |      +---------- future TRELLIS adapter
      +----------------- future SF3D/local adapter
            |
            v
       ModelArtifact
            |
      +-----+------+
      |            |
      v            v
  3D Viewport   Receipt Ledger
      |
      v
 future mesh/edit/export pipeline
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/ADAPTERS.md](docs/ADAPTERS.md).

## Planned rungs

1. **Workbench foundation**: viewport, adapter contract, receipts, qualification shell.
2. **Local image-to-3D**: local service bridge, first real neural backend, GLB ingestion.
3. **Editable geometry**: selection, transform gizmos, materials, mesh inspection, save/load.
4. **Neural edit graph**: non-destructive branches, masks, localized edit requests, version lineage.
5. **Agent interface**: deterministic commands and capability-scoped modeling operations.
6. **Production path**: retopo/LOD, texture pipeline, export qualification, game-engine packages.

## License

MIT. Model weights and third-party neural backends may carry their own licenses and are not automatically relicensed by this repository.
