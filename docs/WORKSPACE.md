# Editable Workspace — Rung 4

Rung 4 separates a generated/imported **source artifact** from mutable **workspace edits**.

## Edit state

A workspace edit layer contains:

```text
position [x, y, z]
rotation [x, y, z] radians
scale    [x, y, z]

material override
  enabled
  color
  metalness
  roughness

revision
```

Transform controls manipulate the workspace root object. Source artifact metadata and source-generation receipts are not rewritten.

## Selection and transforms

The viewport uses Three.js:

- `OrbitControls` for camera navigation
- `TransformControls` for translate / rotate / scale
- raycasting for click selection
- `BoxHelper` for selection bounds

Numeric transform fields and viewport gizmos write to the same edit state.

## Mesh inspection

PhiForm reports:

- mesh count
- vertex count
- triangle count
- unique material count
- current world-space bounds

These are observational statistics. They do not imply manifoldness, watertightness, UV quality, topology quality, or printability. Those require later qualification tools.

## Material override

Material editing is currently a workspace-wide override for `MeshStandardMaterial` instances.

When disabled, PhiForm restores the material's captured base color, metalness, and roughness. Texture maps remain attached.

This is intentionally narrower than a full material graph.

## Browser save

**Save Local** stores a project record in IndexedDB.

For GLB artifacts, PhiForm fetches and stores the actual GLB bytes. Reloading does not depend on the original localhost bridge job still being alive.

The browser store currently keeps one `last` project slot.

## Portable project

**Export .PHIFORM** creates a JSON document with schema:

```text
phiform.project.v1
```

For GLB projects, the file carries the GLB bytes as base64. This has storage overhead but makes the Rung 4 format self-contained and deliberately simple.

Future versions can replace base64 JSON with a zip/container format while retaining the manifest semantics.

## Edited GLB export

**Export Edited GLB** passes the current workspace root to Three.js `GLTFExporter` with binary output enabled.

The resulting GLB is a derived export with transforms/material overrides baked into the exported scene graph.

The original source receipt remains source evidence. Rung 5 will add formal derived-artifact/edit receipts and branch lineage.

## Current limitations

Rung 4 intentionally does not yet claim:

- per-face or per-mesh selection
- vertex/edge/face modeling
- sculpting
- mesh repair
- retopology
- UV editing
- rigging
- animation
- branch/version graph
- cryptographic receipt for the edited export

Those belong to later rungs rather than being hidden behind buttons that do nothing useful.


## Rung 5 history integration

Workspace edits now behave like a working tree over the current edit-graph node.

Transform/material changes do not automatically become history. Use **Commit** in the Edit Graph panel to create a `workspace-snapshot` node.

Browser and portable project saves now use `phiform.project.v2` and include the edit graph. Rung 4 project v1 files are migrated during load.

Edited GLB export now creates a `derived-export` lineage node with SHA-256 over the exported bytes.
