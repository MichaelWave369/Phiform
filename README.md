# PhiForm

**PhiForm** is an AI-native 3D creation workbench built around one rule:

> Neural systems may propose geometry. The workspace keeps the editable state, provenance, and export authority.

PhiForm accepts model intent through text, images, sketches, depth, multi-view captures, and existing meshes, then routes that intent through swappable generation backends without welding the editor to one model.

## Current state — v0.2 / Rung 2

Rung 1 established the studio shell, Three.js viewport, adapter contract, procedural proof path, and generation receipts.

Rung 2 adds the first real **artifact transport path**:

- localhost bridge discovery and health check
- backend registry with explicit capability declarations
- asynchronous generation jobs
- browser image-byte transport for backends that declare image-to-3D support
- GLB result ingestion through Three.js `GLTFLoader`
- viewport normalization for returned meshes
- backend/job/SHA-256 binding in generation receipts
- bundled procedural GLB proof backend
- end-to-end bridge contract qualification in CI

The bundled development backend is intentionally **not a neural model**. It returns a real GLB and cryptographic hash so the bridge protocol can be qualified without pretending procedural geometry is AI inference.

## Run the studio

```bash
npm install
npm run dev
```

## Run the local bridge

In another terminal:

```bash
npm run bridge
```

The default bridge endpoint is:

```text
http://127.0.0.1:8787
```

Open PhiForm, switch **Inference Path** to **Local Bridge**, then choose **Connect / Refresh**.

The included backend, `dev.glb-proof.v1`, supports text input and GLB output. It deliberately reports `imageTo3D: false` because it does not interpret image pixels.

## Qualification

```bash
npm run contract
npm run check
npm run build
```

The contract test boots the bridge, discovers its backend, submits a job, polls to completion, downloads the GLB, verifies the GLB header/version/length, and checks that the served bytes match the advertised SHA-256.

## Architecture

```text
Text / Image / Sketch / Mesh
            |
            v
      Input Envelope
            |
            v
    Neural3DAdapter
      |          |
      |          +-------------------+
      v                              v
Proof Adapter                 Local Bridge Adapter
                                     |
                                     v
                           GET /v1/backends
                           POST /v1/jobs
                           GET /v1/jobs/:id
                                     |
                                     v
                            backend-owned inference
                                     |
                                     v
                              result.glb + SHA-256
                                     |
                    +----------------+----------------+
                    v                                 v
              3D Viewport                       Receipt Ledger
```

See:

- [Architecture](docs/ARCHITECTURE.md)
- [Adapter contract](docs/ADAPTERS.md)
- [Local bridge protocol](docs/BRIDGE.md)

## Planned rungs

1. **Workbench foundation**: viewport, adapter contract, receipts, qualification shell. ✅
2. **Local inference bridge**: backend discovery, jobs, GLB ingestion, hash-bound receipts. ✅
3. **First neural backend**: connect a real local image-to-3D model behind the qualified bridge.
4. **Editable geometry**: selection, transform gizmos, materials, mesh inspection, save/load.
5. **Neural edit graph**: non-destructive branches, masks, localized edits, version lineage.
6. **Agent interface**: deterministic commands and capability-scoped modeling operations.
7. **Production path**: retopo/LOD, texture pipeline, export qualification, game-engine packages.

## License

PhiForm code is MIT licensed. Model weights, neural backends, and their dependencies may carry separate licenses. A bridge backend must report its own model/license metadata; attaching it to PhiForm does not relicense it.
