# Governed Release Candidates — Rung 14

Rung 14 introduces the first explicit **release authority gate** in PhiForm.

A validated derived GLB is not automatically a release candidate.

PhiForm only emits a release ZIP when the exact bytes, derived-artifact receipt, validation receipt, current workspace identity, and selected release policy all agree.

## Release targets

PhiForm supports two derived targets:

```text
basisu-fallback
basisu-compact
```

The fallback target is the Rung 11 GLB.

The compact target is the Rung 12 GLB.

The compact target is the default release target.

## Policies

### strict-pass

Accepted validation qualifications:

```text
PASS
```

WARNING is blocked.

FAIL is always blocked.

### allow-warning

Accepted validation qualifications:

```text
PASS
WARNING
```

FAIL is always blocked.

A warning release requires an explicit policy choice. PhiForm does not silently downgrade the release threshold.

## Byte custody

The release gate requires the actual derived GLB bytes to remain available in the current browser session.

Persisted receipts are not sufficient.

This prevents a hash from being mistaken for the binary artifact it identifies.

## Lineage checks

Before packaging, PhiForm verifies:

1. the derived target receipt belongs to the current artifact
2. the derived target receipt belongs to the current edit-graph node
3. a validation receipt exists for that exact derived receipt
4. the validation receipt belongs to the current artifact/node
5. the validation target type matches the selected release target
6. the validation receipt binds the selected target receipt ID
7. PhiForm BasisU checks passed
8. Khronos validator error count is zero
9. the selected policy accepts the validation qualification
10. the current GLB bytes hash to the derived receipt SHA-256
11. the current GLB byte length matches the derived receipt
12. the same bytes hash to the validation receipt SHA-256
13. the same byte length matches the validation receipt

Any mismatch blocks release.

## Release package

A successful package contains:

```text
asset/
  <validated-derived-asset>.glb

receipts/
  target-derived-receipt.json
  gltf-validation-receipt.json

phiform-release-manifest.json
RELEASE.md
```

The ZIP is deterministic for identical inputs:

- stable file ordering
- fixed ZIP timestamps
- GLB stored without recompression
- text evidence compressed consistently

## Manifest

```text
phiform.release-candidate.v1
```

The manifest records:

- release ID
- source artifact ID
- source edit-graph node
- release target
- target receipt ID
- validation receipt ID
- policy
- accepted validation qualifications
- asset filename/path
- asset SHA-256 and byte length
- validator name/version
- validation qualification
- official error/warning counts
- PhiForm BasisU status
- hashes and byte lengths of packaged evidence files

## External release receipt

```text
phiform.release-receipt.v1
```

The release receipt is downloaded beside the ZIP.

It records:

- final package filename
- final ZIP byte length
- final ZIP SHA-256
- release manifest
- packaged file records
- release policy
- release decision

The receipt is intentionally external to the ZIP so the ZIP can be hashed without a recursive self-reference problem.

## Persistence

New projects use:

```text
phiform.project.v11
```

Release receipts persist in the project.

Release ZIP bytes do not become the editable source artifact.

## What Rung 14 does not claim

Rung 14 does not:

- digitally sign release receipts
- publish releases to GitHub, stores, engines, or CDNs
- override validation failures
- silently accept warnings
- recreate missing derived GLB bytes from hashes
- certify visual quality
- prove an engine accepts the released GLB

## CI qualification

`npm run release:contract` verifies:

- strict policy accepts PASS
- strict policy rejects WARNING
- allow-warning accepts WARNING
- FAIL is never released
- exact derived/validation hash matching
- forged bytes are rejected
- stale graph-node validation is rejected
- mismatched target receipt is rejected
- deterministic ZIP hashing
- release package contains asset + evidence + manifest
