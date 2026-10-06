# PhiForm Architecture

## Governing idea

PhiForm separates **generation capability** from **project authority**.

A backend can return a candidate artifact, but it does not own the workspace, mutate unrelated project state, silently replace source material, or manufacture provenance. The editor decides what becomes part of a project.

## Rung boundaries

### Input envelope

A generation request contains durable, receipt-safe metadata such as the prompt and image name/type/size.

Runtime-only material, such as browser `File` objects, is passed separately. This prevents receipts from accidentally embedding megabytes of opaque binary input.

### Adapter contract

`Neural3DAdapter` is the editor/backend boundary. It declares capabilities and accepts both a durable request and optional runtime inputs.

The current implementations are:

- `proof.procedural.v1`: in-browser procedural qualification
- `LocalBridgeAdapter`: transport adapter for localhost model services

### Local bridge

The browser speaks a small model-neutral protocol:

```text
GET  /v1/health
GET  /v1/backends
POST /v1/jobs
GET  /v1/jobs/:id
GET  /artifacts/:id.glb
```

The browser does not need SF3D-, TRELLIS-, or Hunyuan-specific code. A bridge implementation owns that translation.

### Backend registry

Each backend declares:

- stable backend ID
- human-readable label
- proof vs neural classification
- availability
- model identity
- license metadata
- text-to-3D support
- image-to-3D support
- multi-view support
- GLB output support

PhiForm may refuse a request when a backend does not declare the necessary capability.

### Job lifecycle

Generation is asynchronous:

```text
queued -> running -> succeeded
                   -> failed
```

A successful job returns a GLB artifact descriptor with URL, byte length, and optional SHA-256.

### Model artifact

PhiForm currently supports two editor-owned artifact forms:

- `primitive`: local proof geometry
- `glb`: bridge-returned GLB asset

GLB artifacts are loaded with Three.js, centered, normalized, and displayed without granting the backend control over unrelated project state.

### Receipt

A bridge generation receipt binds:

- adapter identity
- backend identity
- bridge job ID
- durable request metadata
- output artifact ID
- seed
- output format
- SHA-256 when supplied
- byte length
- backend caveats and license metadata

The local receipt checksum remains a lightweight UI integrity marker. It is not a replacement for the SHA-256 over artifact bytes.

## Trust boundary

The localhost bridge is a capability boundary, not an authority transfer.

A real backend may run native code, large model weights, CUDA workloads, or Python environments. Keeping that machinery behind the bridge lets the web studio remain small and auditable while preserving explicit backend identity.
