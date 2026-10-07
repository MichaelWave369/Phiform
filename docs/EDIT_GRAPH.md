# Neural Edit Graph — Rung 5

The edit graph is PhiForm's non-destructive history and lineage layer.

It exists so generation, manual editing, requested neural editing, and derived exports can be distinguished rather than collapsed into one mutable object.

## Graph schema

```text
phiform.edit-graph.v1
```

The graph records:

- root node
- current node
- current branch
- branch heads
- nodes
- edit receipts

## Node kinds

### source

The root of the edit graph.

It binds the graph to one source artifact and optionally references the generation receipt in its notes.

Execution state:

```text
source
```

### workspace-snapshot

A user-committed copy of the current transform/material workspace state.

Execution state:

```text
manual
```

Ordinary pointer movement and slider changes do not create graph nodes automatically. They remain working-tree state until committed.

### neural-intent

A request describing a desired neural edit.

It records:

- instruction text
- parent node
- branch
- workspace edit state
- target scope

Execution state in Rung 5:

```text
recorded-only
```

This is intentional. PhiForm does not claim that recording an instruction changes geometry.

### derived-export

A GLB exported from the current workspace state.

The lineage record includes:

- derived artifact ID
- filename
- byte length
- SHA-256
- creation time

Execution state:

```text
exported
```

## Targets

Rung 5 supports two target scopes.

### Whole artifact

```json
{
  "kind": "artifact"
}
```

### Mesh target

Viewport mesh selection assigns stable traversal IDs for the current artifact load:

```json
{
  "kind": "mesh",
  "mesh": {
    "id": "mesh-003",
    "name": "Handle",
    "vertices": 128,
    "triangles": 240
  }
}
```

This is a useful localization primitive, not a claim of vertex painting, semantic segmentation, or volumetric masking.

Later edit backends can translate this target into backend-specific masks or selections.

## Branches

Creating a branch points the new branch at the current node and makes it active.

Example:

```text
main
  |
  A
  |
  B
   \
    handle-variant
          |
          C
```

Checkout restores the committed workspace state and target stored on the selected node.

## Working tree

The current workspace can differ from the checked-out graph node.

PhiForm reports:

```text
CLEAN
```

when current edit state exactly matches the current node snapshot, otherwise:

```text
DIRTY
```

This deliberately mirrors source-control semantics without pretending the edit graph is Git.

## Edit receipts

Every graph node creation produces:

```text
phiform.edit-receipt.v1
```

Receipts record:

- operation
- node ID
- parent node IDs
- branch
- source artifact ID
- target
- instruction when applicable
- execution state
- derived artifact when applicable
- notes

The receipt for a neural-intent node explicitly states that no localized neural backend executed.

## Project migration

Rung 6 saves use:

```text
phiform.project.v3
```

Project v1 and v2 files remain importable.

A v1 project receives a source edit graph during migration. A v2 project retains its existing edit graph. Both migrate with an empty agent audit trail because PhiForm does not invent commands or receipts that never occurred.

## Qualification

`npm run graph:contract` verifies:

- source graph creation
- dirty-state detection
- workspace snapshot lineage
- branch creation
- mesh-target neural intent recording
- recorded-only execution semantics
- checkout
- derived-export lineage
- retention of sibling branch nodes

## Not yet claimed

Rung 5 does not yet provide:

- painted texture masks
- vertex/face masks
- volumetric masks
- semantic segmentation masks
- neural geometry replacement
- automatic branch merge
- geometric diff/merge
- conflict resolution
- cryptographic signing of edit receipts

Those are future capabilities, not hidden placeholders.
