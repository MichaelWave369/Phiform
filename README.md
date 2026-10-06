# PhiForm

**PhiForm** is an AI-native 3D creation workbench built around one rule:

> Neural systems may propose geometry. The workspace keeps the editable state, provenance, and export authority.

PhiForm accepts model intent through text, images, sketches, depth, multi-view captures, and existing meshes, then routes that intent through swappable generation backends without welding the editor to one model.

## Current state — v0.3 / Rung 3

PhiForm now has its first real neural backend integration.

### Rung 1 — workbench foundation ✅
- React + TypeScript studio
- Three.js viewport
- adapter contract
- procedural proof generation
- receipts and provenance surfaces

### Rung 2 — local inference bridge ✅
- localhost bridge discovery
- capability-declared backends
- queued generation jobs
- GLB ingestion
- SHA-256-bound output receipts
- end-to-end bridge CI

### Rung 3 — Stable Fast 3D neural backend ✅
- optional discovery of an operator-installed Stable Fast 3D checkout
- real single-image neural reconstruction path through upstream `run.py`
- no bundled weights and no license laundering into PhiForm's MIT codebase
- explicit unavailable/backend setup state in the UI
- image byte handoff to the local model process
- capture of upstream `output/0/mesh.glb`
- GLB framing validation before publication
- model/source/license metadata bound into receipts
- request fingerprints explicitly distinguished from inference RNG seeds
- Windows bridge launcher and environment checker
- CI qualification of the external-runner contract without pretending the model itself ran

See [docs/SF3D.md](docs/SF3D.md) for installation and local qualification.

## Run the studio

```bash
npm install
npm run dev
```

## Run the bridge

Proof-only bridge:

```bash
npm run bridge
```

With Stable Fast 3D configured:

```powershell
.\scripts\start-sf3d-bridge.ps1 `
  -Sf3dDir "C:\path\to\stable-fast-3d" `
  -Python "C:\path\to\python.exe"
```

The default bridge endpoint is:

```text
http://127.0.0.1:8787
```

## Qualification

```bash
npm run contract
npm run check
npm run build
```

Optional local SF3D environment check:

```bash
npm run sf3d:check
```

## Architecture

```text
Image
  |
  v
PhiForm web studio
  |
  v
LocalBridgeAdapter
  |
  v
PhiForm bridge
  |
  +---------------------------+
  |                           |
  v                           v
proof.glb              stability.sf3d.v1
                            |
                            v
                   operator-installed run.py
                            |
                            v
                     output/0/mesh.glb
                            |
                            v
                  validate + SHA-256
                            |
             +--------------+--------------+
             v                             v
        3D viewport                  receipt ledger
```

Documentation:

- [Architecture](docs/ARCHITECTURE.md)
- [Adapter contract](docs/ADAPTERS.md)
- [Local bridge protocol](docs/BRIDGE.md)
- [Stable Fast 3D backend](docs/SF3D.md)

## Planned rungs

1. **Workbench foundation** ✅
2. **Local inference bridge** ✅
3. **First neural backend / SF3D** ✅
4. **Editable geometry**: selection, transform gizmos, materials, mesh inspection, save/load.
5. **Neural edit graph**: non-destructive branches, masks, localized edits, version lineage.
6. **Agent interface**: deterministic commands and capability-scoped modeling operations.
7. **Production path**: retopo/LOD, texture pipeline, export qualification, game-engine packages.

## License

PhiForm code is MIT licensed.

Third-party model code, weights, dependencies, model outputs, and services may be governed by separate terms. In particular, Stable Fast 3D is not relicensed by PhiForm. Operators must review and comply with Stability AI's current license and model-access terms.
