# Compact Required-BasisU GLB — Rung 12

Rung 12 removes fallback texture payloads only after Rung 11 has proven **FULL** `KHR_texture_basisu` coverage.

The output is a new derived GLB. The editable source and the fallback-bearing Rung 11 GLB remain unchanged.

## Khronos rule

A texture using `KHR_texture_basisu` without a PNG/JPEG fallback omits the core `texture.source` property and lists `KHR_texture_basisu` in both:

```text
extensionsUsed
extensionsRequired
```

Rung 12 follows that form.

## Preconditions

Compaction refuses unless:

- the latest Rung 11 receipt has `bindingCoverage: full`
- its artifact ID matches the current artifact
- its edit-graph node matches the current node
- the exact fallback-bearing GLB bytes are still present in the browser session
- those bytes still match the Rung 11 SHA-256 and byte length

Receipts prove identity. They do not recreate binary payloads after reload.

## Compaction algorithm

Given a fallback-bearing Rung 11 GLB:

1. validate GLB v2 framing
2. require every glTF texture to have both a core fallback `source` and a `KHR_texture_basisu.source`
3. require every BasisU source image to be `image/ktx2`
4. collect fallback image indices
5. remove every core texture `source`
6. remove those fallback image objects
7. remap the remaining image indices
8. update each `KHR_texture_basisu.source`
9. add `KHR_texture_basisu` to `extensionsRequired`
10. recursively collect all still-referenced `bufferView` indices
11. drop unreferenced bufferViews
12. copy each surviving bufferView payload into a new BIN chunk
13. align every destination bufferView offset to 4 bytes
14. remap every surviving `bufferView` JSON reference
15. update `buffers[0].byteLength`
16. rebuild GLB JSON/BIN chunk lengths and the final GLB header

## Why repack the BIN

Deleting image JSON alone does not reclaim the old PNG/JPEG bytes.

Rung 12 rebuilds the binary buffer from only the bufferViews that remain referenced after fallback removal.

This may also remove other already-unreferenced bufferViews. The receipt therefore records both:

- removed fallback image count
- total removed bufferView count
- total binary bytes reclaimed

## Reference remapping

The compactor recursively updates properties named `bufferView`, covering core glTF references and extension objects that follow glTF's standard bufferView-reference convention.

If a remaining object references a bufferView that cannot be remapped, compaction fails.

## Receipt

Successful output emits:

```text
phiform.basisu-compact-receipt.v1
```

It binds:

- source artifact ID
- exact edit-graph node
- source Rung 11 receipt ID
- source filename
- compact filename
- source GLB SHA-256 + byte length
- compact GLB SHA-256 + byte length
- texture count
- removed fallback image count
- removed bufferView count
- reclaimed binary bytes
- total byte savings
- byte savings ratio
- `extensionRequired: true`

## What Rung 12 does not claim

Rung 12 does not:

- compact partial-coverage assets
- invent missing KTX2 alternatives
- resize nonconforming textures
- regenerate KTX2 payloads
- visually compare Basis output against source pixels
- prove a specific game engine accepts the compact file
- mutate the editable source artifact
- overwrite the fallback-bearing Rung 11 derived GLB

## CI qualification

`npm run basisu:compact:contract` creates a synthetic GLB containing:

- geometry data
- a PNG fallback image payload
- one texture

The Rung 11 rewriter adds a verified KTX2 payload, then Rung 12 compacts it.

CI proves:

- the core texture source is removed
- `KHR_texture_basisu` becomes required
- the PNG image is removed
- the KTX2 image survives
- the PNG bufferView is removed
- geometry bufferView data survives
- the BIN chunk physically shrinks
- reclaimed binary bytes are measured
- partial/non-BasisU input is refused
