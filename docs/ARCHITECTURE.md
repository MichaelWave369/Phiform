# PhiForm Architecture

## Governing idea

PhiForm separates **generation capability** from **project authority**.

A neural backend can return a candidate artifact, but it does not own the workspace, mutate unrelated project state, silently replace source material, or manufacture provenance. The editor decides what becomes part of a project.

## Core boundaries

### Input envelope

A generation request is an explicit data structure. Rung 1 binds text and optional image metadata. Later rungs will add source hashes, image bytes/URLs, masks, depth maps, camera poses, multi-view groups, and imported mesh references.

### Adapter contract

`Neural3DAdapter` is the boundary between the editor and a model/backend. An adapter declares capabilities and returns a `GenerationResult`.

This lets PhiForm support:

- in-browser experimental models
- localhost inference services
- workstation GPU workers
- remote APIs
- queued render/inference farms

without teaching the UI model-specific details.

### Model artifact

The artifact is editor-owned state. Rung 1 uses a small procedural representation to qualify the path. A real geometry rung will add mesh buffers, materials, textures, units, bounds, topology metadata, and imported/exported asset references.

### Receipt

Every generation returns a receipt that states:

- which adapter acted
- which request was bound
- which artifact resulted
- which seed was used
- when the event happened
- caveats or limitations

Rung 1 uses a non-cryptographic FNV-1a checksum only as a visible integrity placeholder. Production receipts should bind source and output assets with cryptographic hashes.

## Planned local inference bridge

The preferred first real-model integration is a local service with a narrow interface:

```text
PhiForm Web UI
     |
     | POST /v1/generate
     v
Local PhiForm Bridge
     |
     +-- adapter: sf3d
     +-- adapter: trellis
     +-- adapter: hunyuan
     |
     v
job directory / artifact store
     |
     +-- result.glb
     +-- textures/*
     +-- receipt.json
```

The bridge should expose model/license metadata and never imply that all attached backends share PhiForm's MIT license.
