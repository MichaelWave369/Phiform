# KHR_texture_basisu Derived GLB — Rung 11

Rung 11 turns verified standalone KTX2 outputs into a **derived glTF Binary asset** using the ratified Khronos `KHR_texture_basisu` extension.

The editable PhiForm source remains unchanged.

## Standards shape

For each successfully rebound glTF texture, PhiForm preserves the core fallback:

```json
{
  "source": 0,
  "extensions": {
    "KHR_texture_basisu": {
      "source": 1
    }
  }
}
```

The KTX2 image is embedded in the GLB and declared:

```json
{
  "bufferView": 12,
  "mimeType": "image/ktx2"
}
```

The document lists:

```text
extensionsUsed: ["KHR_texture_basisu"]
```

but does **not** list `KHR_texture_basisu` in `extensionsRequired` because the original PNG/JPEG fallback remains available.

This follows the ratified Khronos extension contract.

## Why fallbacks remain in Rung 11

Keeping the original texture source makes the derived GLB usable by:

- extension-aware runtimes, which may select the KTX2 path
- older runtimes, which may keep using the PNG/JPEG fallback

This is safer than deleting fallback image data in the first rewrite rung.

The tradeoff is file size: Rung 11 adds KTX2 payloads without removing the original encoded image bytes, so the derived GLB may be larger than the source.

A later compaction rung can remove superseded fallbacks only after buffer-view reachability and material references are independently qualified.

## Texture identity

Three.js `GLTFExporter` does not expose a native BasisU export path.

PhiForm temporarily marks audited Three.js textures with a stable name:

```text
__PHIFORM_TEXTURE__<texture UUID>::<encoded original name>
```

The live Three.js texture names are restored immediately after export.

The pure GLB rewriter parses those temporary names and binds only the KTX2 payload whose receipt texture ID matches the exact UUID.

The marker is removed from the derived GLB and the original human-readable texture name is restored.

## Metalness / roughness safety gate

Three's exporter may merge different metalness and roughness textures into a synthetic glTF metallic-roughness texture.

That synthetic texture does not have a one-to-one identity with either original KTX2 output.

Rung 11 therefore refuses export when:

```text
metalnessMap !== roughnessMap
```

and both maps exist.

A shared packed ORM texture is supported.

A single metalness-only or roughness-only map is also traceable because Three clones the one source texture and preserves the temporary identity marker.

## 4×4 dimension gate

The Khronos `KHR_texture_basisu` specification requires KTX2 image width and height to be multiples of 4.

Rung 11 checks the audited dimensions of every executed texture before deriving the GLB.

Nonconforming textures are refused rather than silently resized.

## Binary rewrite

The GLB rewriter:

1. validates GLB magic, version 2, and header length
2. parses the JSON and BIN chunks
3. supports one embedded glTF buffer
4. aligns each KTX2 payload to a 4-byte BIN offset
5. appends the exact verified KTX2 bytes
6. creates one bufferView per appended KTX2
7. creates one `image/ktx2` image per bound payload
8. attaches `KHR_texture_basisu` to the matching glTF texture
9. preserves the texture's existing fallback `source`
10. updates `buffers[0].byteLength`
11. rebuilds JSON/BIN chunk lengths and the GLB header

## Receipt

A successful derived export emits:

```text
phiform.basisu-derived-receipt.v1
```

It records:

- source artifact ID
- exact edit-graph node
- source executed-encoding receipt ID
- source GLB SHA-256 + byte length
- derived GLB SHA-256 + byte length
- extension used / required state
- per-texture glTF texture index
- fallback image index
- KTX2 image index
- KTX2 SHA-256 + byte length
- fallback-only exported textures
- executed KTX2 textures with no glTF binding target
- full vs partial binding coverage

## Full vs partial coverage

### full

All verified KTX2 payloads used by the export were bound, and the exported glTF contained no additional fallback-only texture objects.

### partial

At least one of these is true:

- an exported texture has no verified KTX2 alternative
- an executed KTX2 output has no standard glTF binding target

Partial output is still a valid fallback-bearing GLB; the receipt simply refuses to call it fully compressed.

## Session-local KTX2 bytes

Project v8 stores **receipts**, not the KTX2 binary payloads.

After a project reload, PhiForm can prove which KTX2 files were produced, but it cannot reconstruct the bytes from their hashes.

The operator must re-run executed compression before deriving another BasisU GLB.

This prevents portable project files from silently embedding potentially large duplicate texture payloads.

## What Rung 11 does not claim

Rung 11 does not:

- remove PNG/JPEG fallback image payloads
- mark `KHR_texture_basisu` as required
- rewrite unsupported bump/displacement semantics into glTF
- synthesize a new ORM map from independently encoded metalness/roughness textures
- persist KTX2 binary payloads inside project v8
- prove engine-native import behavior
- guarantee visual equivalence between fallback and lossy Basis output

## CI qualification

`npm run basisu:contract` verifies:

- texture marker round-trip
- GLB v2 header reconstruction
- fallback source preservation
- optional `KHR_texture_basisu` extension semantics
- `image/ktx2` insertion
- 4-byte KTX2 buffer alignment
- logical buffer-length update
- fallback-only texture accounting
- unreferenced payloads do not invent bindings


## Rung 12 compaction handoff

A Rung 11 asset with `bindingCoverage: full` may be compacted by Rung 12.

Rung 12 removes the core PNG/JPEG fallback sources, marks `KHR_texture_basisu` required, removes the fallback image objects, and rebuilds the embedded BIN chunk from still-referenced bufferViews.

Partial-coverage Rung 11 assets are deliberately not eligible.

See [Compact Required-BasisU GLB](BASISU_COMPACTION.md).
