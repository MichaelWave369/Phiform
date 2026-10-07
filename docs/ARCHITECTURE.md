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


## Rung 3 — first neural backend

Stable Fast 3D is integrated as an optional bridge backend rather than a browser dependency.

```text
PhiForm browser
    |
    v
LocalBridgeAdapter
    |
    v
bridge/dev-server.mjs
    |
    +-- dev.glb-proof.v1
    |
    +-- stability.sf3d.v1
            |
            v
      operator-installed
      Stable Fast 3D
      official run.py
            |
            v
      output/0/mesh.glb
            |
      validate framing
      SHA-256 exact bytes
            |
            v
      workspace candidate
```

The bridge reports SF3D as unavailable when its local checkout is not configured. This keeps model installation, gated access, native dependencies, and third-party license terms outside PhiForm's MIT distribution.

CI qualifies the external process and GLB handoff using a CLI-shape fixture. It does not claim a neural model run.


## Rung 6 — governed agent command boundary

Agent access terminates at a command registry.

```text
agent
  |
  v
command envelope
  |
  +-- replay gate
  +-- capability gate
  +-- optimistic state gate
  |
  v
deterministic command executor
  |
  +-- workspace edit state
  +-- edit graph
  +-- target inventory
  +-- export dispatch
  |
  v
agent receipt
```

The browser publishes the same boundary at `window.PhiFormAgent` that the built-in Agent Command Rail uses.

An agent does not receive generic application authority by being able to call the API. Each verb maps to one declared capability, and capability grants are operator-controlled.


## Rung 7 — production qualification boundary

Production export is another derived-artifact boundary rather than an overwrite of the source.

```text
editable workspace
      |
      v
production audit
      |
      +-- invalid vertices
      +-- degenerate triangles
      +-- boundary edges
      +-- non-manifold edges
      +-- normals / UVs
      |
      v
profile policy
      |
      +-- conservative repair
      +-- triangle budget
      +-- LOD ratios
      |
      v
LOD GLB candidates
      |
      +-- post-export audit
      +-- byte length
      +-- SHA-256
      |
      v
phiform.production-receipt.v1
```

The source artifact and edit graph remain unchanged. Production packs are derived outputs with their own qualification evidence.

Native engine package formats are not implied by the Godot/Unreal profile names; those profiles currently define GLB-oriented budgets and LOD policies for downstream import.


## Rung 8 — engine pack boundary

Engine packs sit downstream of production qualification.

```text
editable source
      |
      v
production profile
      |
      v
qualified LOD candidates
      |
      +--> LOD GLBs
      |
      +--> LOD0 + collision proxies
      |          |
      |          +--> Godot -convcolonly names
      |          +--> Unreal UBX_ names
      |
      v
engine manifest + IMPORT.md
      |
      v
deterministic ZIP structure
      |
      +--> per-file SHA-256
      +--> package SHA-256
      |
      v
phiform.engine-pack-receipt.v1
```

The engine package is a derived downstream artifact. It does not mutate the source artifact, edit graph, or production receipts.

Native engine resources remain outside PhiForm's authority boundary in Rung 8.


## Rung 9 — texture qualification boundary

Texture/material qualification observes loaded scene state without modifying the source artifact.

```text
loaded materials
      |
      v
texture-role inventory
      |
      +-- dimensions
      +-- color-space expectation
      +-- unique texture identity
      +-- packed ORM reuse
      +-- estimated GPU memory
      |
      v
texture policy
      |
      +-- archive
      +-- web
      +-- game
      |
      v
phiform.texture-receipt.v1
      |
      +-- qualification
      +-- KTX2/Basis compression plan
      +-- compressionExecuted: false
```

The compression plan is evidence of intended downstream work, not evidence that encoding occurred. A future encoder must return real bytes and hashes before the authority boundary can advance from planned to executed.


## Rung 10 — executed texture encoding boundary

Rung 10 keeps native encoder authority behind localhost.

```text
audited texture
      |
      v
normalized PNG + source hash
      |
      v
localhost texture job
      |
      +-- codec allowlist
      +-- fresh temp directory
      +-- no shell interpolation
      |
      v
Khronos ktx create
      |
      v
KTX2 identifier + bridge SHA-256
      |
      v
browser artifact fetch
      |
      +-- length check
      +-- KTX2 identifier check
      +-- independent SHA-256
      |
      v
phiform.texture-encode-receipt.v1
```

The project does not grant the native KTX process access to arbitrary paths supplied by browser commands. The bridge creates and owns temporary input/output paths and removes them after execution.

A completed encoding receipt proves standalone KTX2 output bytes. It does not imply that the source GLB was rewritten to reference those textures.


## Rung 11 — BasisU GLB derivation boundary

Rung 11 does not mutate the source artifact.

```text
current editable scene
      |
      +-- temporary texture identity tags
      |
      v
Three.js GLB export
      |
      v
source GLB bytes + SHA-256
      |
      +---------------------------+
      |                           |
      | verified in-session KTX2 |
      | bytes from Rung 10        |
      +-------------+-------------+
                    |
                    v
pure GLB rewriter
      |
      +-- append aligned KTX2 bufferViews
      +-- add image/ktx2 entries
      +-- attach KHR_texture_basisu
      +-- retain fallback texture.source
      |
      v
derived fallback-bearing GLB
      |
      +-- SHA-256
      +-- full / partial binding coverage
      |
      v
phiform.basisu-derived-receipt.v1
```

Hashes establish identity but do not substitute for binary payloads. For that reason, persisted Rung 10 receipts alone cannot authorize a Rung 11 rewrite after reload; verified KTX2 bytes must be available again.


## Rung 12 — compact required-BasisU boundary

Compaction consumes a full-coverage Rung 11 derived GLB, not the editable workspace.

```text
FULL fallback-bearing BasisU GLB
      |
      +-- receipt hash/length verification
      |
      v
remove core texture.source
      |
      +-- remove fallback image objects
      +-- remap KTX2 image indices
      +-- require KHR_texture_basisu
      |
      v
reference reachability scan
      |
      +-- collect surviving bufferViews
      +-- remove unreachable fallback views
      +-- remap bufferView references
      |
      v
repacked BIN chunk
      |
      +-- 4-byte aligned ranges
      +-- updated buffer byteLength
      |
      v
compact required-BasisU GLB
      |
      +-- SHA-256
      +-- byte savings
      +-- removal evidence
      |
      v
phiform.basisu-compact-receipt.v1
```

The compact file is a new derived artifact. Rung 12 never rewrites the editable source or destroys the fallback-bearing Rung 11 output.


## Rung 13 — validation evidence boundary

Derived GLB validation terminates at a localhost wrapper around the official Khronos glTF Validator.

```text
derived GLB bytes
      |
      +-- browser SHA-256
      |
      v
localhost validation endpoint
      |
      +-- recompute SHA-256
      +-- Khronos glTF-Validator
      |
      v
official report
      |
      +-- errors / warnings / infos / hints
      +-- issue codes + pointers
      +-- validator version
      +-- extensions observed
      |
      +-----------------------------+
      |                             |
      | PhiForm BasisU checks      |
      | for fallback/compact form  |
      +-------------+---------------+
                    |
                    v
phiform.gltf-validation-receipt.v1
```

The upstream report and PhiForm extension-specific checks remain distinguishable in the receipt. PhiForm does not claim Khronos certification or extension semantics that the upstream validator does not advertise.
