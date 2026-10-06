# Local Bridge Protocol v1

The PhiForm local bridge is a deliberately narrow localhost contract between the browser studio and model-specific inference runtimes.

Default development endpoint:

```text
http://127.0.0.1:8787
```

## Health

`GET /v1/health`

```json
{
  "schema": "phiform.bridge.health.v1",
  "status": "ok",
  "bridgeVersion": "0.2.0"
}
```

## Backend discovery

`GET /v1/backends`

Every backend must explicitly report whether it is a `proof` or `neural` backend and declare capabilities.

A backend that merely accepts image bytes but does not interpret them must **not** claim `imageTo3D: true`.

## Submit job

`POST /v1/jobs`

Current Rung 2 request body:

```json
{
  "backendId": "some.backend.v1",
  "prompt": "weathered ceramic robot",
  "image": {
    "name": "robot.png",
    "type": "image/png",
    "size": 12345,
    "dataBase64": "..."
  }
}
```

The image member is optional and should only be sent to a backend that declares image-to-3D support.

Rung 2 uses base64 JSON for simplicity and qualification. A later bridge revision may add multipart/blob transport for very large inputs without changing the editor's adapter semantics.

## Poll job

`GET /v1/jobs/:id`

Status values:

- `queued`
- `running`
- `succeeded`
- `failed`

Successful jobs expose:

```json
{
  "artifact": {
    "url": "/artifacts/<job>.glb",
    "format": "glb",
    "mimeType": "model/gltf-binary",
    "sha256": "<64 hex chars>",
    "byteLength": 123456
  }
}
```

## Artifact requirements

Rung 2 requires GLB output for bridge-backed generation.

Recommended backend behavior:

- produce GLB 2.0
- expose CORS to the PhiForm origin
- return SHA-256 over the exact served bytes
- report byte length
- avoid mutating existing workspace files
- surface model/version/license identity through backend discovery

## Included development backend

`dev.glb-proof.v1` creates a small procedural GLB cube.

It exists only to prove:

```text
discover -> submit -> poll -> GLB -> SHA-256 -> viewport -> receipt
```

It declares `kind: proof` and `imageTo3D: false`. No neural inference is performed.

## Adding a real neural backend

The next backend should implement the same bridge contract and can internally invoke Python, CUDA, model weights, worker queues, or another local process.

That keeps PhiForm's browser code independent from the inference framework.
