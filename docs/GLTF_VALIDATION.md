# glTF Validation Receipts — Rung 13

Rung 13 binds standards-validation evidence to the exact bytes of PhiForm's derived GLB outputs.

## Official validator

PhiForm uses the official KhronosGroup `gltf-validator` NPM package through the localhost bridge.

The validator's own documentation states that it validates glTF 2.0 structure, references, buffers, accessors, images, and supported extension rules, and returns a JSON validation report.

Bridge endpoint:

```text
POST /v1/gltf-validate
```

The browser submits:

- GLB filename
- expected SHA-256
- base64 GLB bytes
- issue limit

The bridge recomputes SHA-256 before validation. A forged hash is rejected.

## Report evidence

PhiForm preserves:

- validator name
- validator version
- MIME type
- error count
- warning count
- info count
- hint count
- truncated flag
- issue messages
- issue code
- severity
- JSON pointer or byte offset
- glTF version
- generator when available
- extensions used
- extensions required

The validation report is bound to:

- source artifact ID
- exact edit-graph node
- target derived receipt ID
- target filename
- exact GLB SHA-256
- exact byte length

## BasisU-specific supplementation

The official validator's published implemented-extension list does not currently claim full semantic validation for `KHR_texture_basisu`.

PhiForm therefore adds its own narrow checks.

### Fallback-bearing target

Checks include:

- `KHR_texture_basisu` appears in `extensionsUsed`
- extension is not required
- at least one BasisU texture binding exists
- every BasisU binding points to an `image/ktx2`
- every BasisU-bound texture retains a core fallback source

Partial Rung 11 coverage remains legal. A texture without a BasisU alternative is not automatically a semantic failure as long as its ordinary fallback source remains valid.

### Compact target

Checks include:

- `KHR_texture_basisu` appears in `extensionsUsed`
- extension appears in `extensionsRequired`
- every texture has a BasisU source
- every BasisU source points to `image/ktx2`
- no texture retains a core fallback source
- no PNG/JPEG fallback image object remains

## Qualification policy

### PASS

- Khronos errors: 0
- Khronos warnings: 0
- PhiForm BasisU checks: PASS

Information and hints are preserved but do not lower PASS.

### WARNING

- Khronos errors: 0
- one or more Khronos warnings
- PhiForm BasisU checks: PASS

### FAIL

Either:

- Khronos reports one or more errors
- PhiForm BasisU checks fail

## Why this is not called certification

A validation receipt proves what validator version tested what exact bytes and what findings were returned.

It does not mean Khronos certified the asset, and it does not expand the upstream validator's implemented extension coverage.

## Receipt

```text
phiform.gltf-validation-receipt.v1
```

Rung 13 validates the fallback-bearing Rung 11 GLB and the compact Rung 12 GLB as they are created.

## Project persistence

New projects use:

```text
phiform.project.v10
```

Validation receipts persist, but derived GLB binary payloads remain session/download artifacts unless separately embedded by an earlier project feature.

## CI

Two layers are tested:

### Bridge contract

The existing bridge contract submits a real proof GLB to the official validator endpoint and verifies:

- official validator identity
- validator version
- zero errors for the proof GLB
- exact hash/length echo
- forged-hash rejection

### Validation policy contract

`npm run gltf:validation:contract` verifies:

- fallback BasisU semantic PASS
- compact BasisU semantic PASS
- fallback/compact semantic mismatch FAIL
- info-only official report remains PASS
- warning report becomes WARNING
- official error becomes FAIL
- PhiForm semantic failure becomes FAIL
