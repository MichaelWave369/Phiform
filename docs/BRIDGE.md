# Local Bridge Protocol v1

The PhiForm local bridge is a narrow localhost contract between the browser studio and model-specific inference runtimes.

Default endpoint:

```text
http://127.0.0.1:8787
```

## Health

`GET /v1/health`

Current bridge version: `0.6.0`.

## Backend discovery

`GET /v1/backends`

Backends report:

- stable ID and label
- `proof` or `neural` classification
- availability
- optional unavailability reason
- model identity
- source URL
- license label
- text/image/multi-view/GLB capabilities

An installed model may be listed with `available: false`. This is deliberate: the UI should expose missing prerequisites instead of pretending the backend does not exist.

Current IDs:

- `dev.glb-proof.v1`
- `stability.sf3d.v1`

## Submit job

`POST /v1/jobs`

```json
{
  "backendId": "stability.sf3d.v1",
  "prompt": "optional PhiForm metadata",
  "image": {
    "name": "object.png",
    "type": "image/png",
    "size": 12345,
    "dataBase64": "..."
  }
}
```

The SF3D backend requires one image. It declares `textTo3D: false`, so a prompt alone is rejected.

## Job lifecycle

`GET /v1/jobs/:id`

```text
queued -> running -> succeeded
                   -> failed
```

Failed jobs return an error string. Successful jobs expose a GLB artifact descriptor.

## Seed semantics

Bridge jobs currently expose a numeric `seed` field for compatibility with Rung 1 receipts plus a `seedKind`.

For SF3D:

```json
{
  "seedKind": "request-fingerprint"
}
```

The value is a deterministic request trace fingerprint. It is **not** claimed to be the model's random seed.

## Artifact requirements

Bridge-backed outputs must:

- be GLB 2.0
- have a valid GLB header length
- be served with `model/gltf-binary`
- include byte length
- include SHA-256 over the exact served bytes

## Stable Fast 3D

The bridge does not import or redistribute SF3D.

When `PHIFORM_SF3D_DIR` points to an installed checkout, `stability.sf3d.v1` becomes available. The backend:

1. decodes the browser-provided image into a temporary job directory,
2. invokes the checkout's official `run.py`,
3. waits for process completion,
4. reads `output/0/mesh.glb`,
5. validates GLB framing,
6. loads the GLB into bridge-owned memory,
7. removes the temporary job directory,
8. publishes the GLB through the standard artifact endpoint.

See [SF3D.md](SF3D.md).

## Qualification boundary

CI always qualifies the proof backend.

For SF3D integration, CI supplies a small external CLI fixture that reproduces the output contract only. This proves process orchestration and artifact handling. It does **not** claim neural inference, model installation, CUDA availability, Hugging Face authorization, or visual quality.


## Texture encoder API — Rung 10

The local bridge also exposes an optional Khronos KTX encoder boundary.

```text
GET  /v1/texture-encoder
POST /v1/texture-jobs
GET  /v1/texture-jobs/:id
GET  /texture-artifacts/:id.ktx2
```

The encoder defaults to the executable name `ktx`.

Override it with:

```text
PHIFORM_KTX_BIN
```

The browser submits one normalized PNG per job with:

- texture ID
- codec allowlisted as `basis-lz` or `uastc-ldr-4x4`
- `srgb` or `linear` transfer semantics
- source SHA-256
- PNG bytes

The bridge recomputes the source hash before execution.

Texture request bodies allow up to 128 MiB because a lossless 4K RGBA PNG can be substantially larger than the generation bridge's ordinary request envelope.

Successful jobs expose immutable in-memory KTX2 bytes until the bridge restarts. The project receipt stores hashes and downloaded outputs; the localhost artifact URL is not treated as durable project identity.


## Official glTF validation — Rung 13

The bridge exposes:

```text
POST /v1/gltf-validate
```

Input:

- `filename`
- optional expected `sha256`
- `glbBase64`
- optional `maxIssues` between 1 and 2000

The bridge recomputes SHA-256 before invoking the official KhronosGroup `gltf-validator` NPM package.

A mismatched submitted hash returns HTTP 400.

The response normalizes:

- validator name/version
- MIME type
- issue counts
- issue messages
- truncated state
- glTF version/generator when available
- extensions used/required
- exact GLB SHA-256 and byte length

Bridge protocol version is `0.6.0`.


## Release signer — Rung 15

Optional signer endpoints:

```text
GET  /v1/release-signer
POST /v1/release-attest
```

Configuration:

```text
PHIFORM_RELEASE_SIGNING_KEY
PHIFORM_RELEASE_SIGNING_TOKEN
```

Both must be present for the signer to be available.

The key must be an Ed25519 private key readable by Node's crypto subsystem.

The signing route requires:

```http
Authorization: Bearer <token>
```

The bridge accepts the exact release ZIP bytes plus the matching release receipt, recomputes the ZIP SHA-256 and byte length, signs a canonical release statement, and verifies the signature locally before returning it.

The descriptor exposes the public-key SHA-256 fingerprint but does not expose the private-key path or bearer token.

CORS permits the `authorization` header because signing requires explicit bearer authorization.
