import type {
  BasisuCompactReceipt,
  BasisuDerivedReceipt,
  TextureAudit,
  TextureEncoderDescriptor,
  TextureEncodingReceipt,
  TextureProfileId,
  TextureReceipt,
} from '../core/types'
import { TEXTURE_PROFILES } from '../texture/profiles'

interface TexturePanelProps {
  profileId: TextureProfileId
  audit?: TextureAudit
  receipts: readonly TextureReceipt[]
  encodingReceipts: readonly TextureEncodingReceipt[]
  encoder?: TextureEncoderDescriptor
  encoderStatus: 'idle' | 'checking' | 'online' | 'error'
  encodingBusy: boolean
  basisuBusy: boolean
  basisuReceipts: readonly BasisuDerivedReceipt[]
  compactReceipts: readonly BasisuCompactReceipt[]
  compactBusy: boolean
  compactSessionReady: boolean
  basisuSessionReady: boolean
  onProfileChange: (profileId: TextureProfileId) => void
  onRecord: () => void
  onProbeEncoder: () => void
  onExecuteEncoding: () => void
  onBuildBasisuGlb: () => void
  onCompactBasisuGlb: () => void
}

function bytes(value: number): string {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

export function TexturePanel({
  profileId,
  audit,
  receipts,
  encodingReceipts,
  encoder,
  encoderStatus,
  encodingBusy,
  basisuBusy,
  basisuReceipts,
  compactReceipts,
  compactBusy,
  compactSessionReady,
  basisuSessionReady,
  onProfileChange,
  onRecord,
  onProbeEncoder,
  onExecuteEncoding,
  onBuildBasisuGlb,
  onCompactBasisuGlb,
}: TexturePanelProps) {
  const profile = TEXTURE_PROFILES[profileId]
  const latest = receipts.at(-1)
  const latestEncoding = encodingReceipts.at(-1)
  const latestBasisu = basisuReceipts.at(-1)
  const latestCompact = compactReceipts.at(-1)
  const canExecute =
    Boolean(audit) &&
    audit?.qualification !== 'fail' &&
    (audit?.totals.textures ?? 0) > 0 &&
    encoder?.available === true &&
    !encodingBusy

  return (
    <div className="texture-card">
      <div className="texture-head">
        <div>
          <span className="eyebrow">TEXTURE + MATERIAL QUALIFICATION</span>
          <strong>{profile.label}</strong>
        </div>
        <span className={audit?.qualification ?? 'none'}>
          {audit?.qualification.toUpperCase() ?? 'NO AUDIT'}
        </span>
      </div>

      <label className="field-label" htmlFor="texture-profile">
        TEXTURE POLICY
      </label>
      <select
        id="texture-profile"
        value={profileId}
        onChange={(event) =>
          onProfileChange(event.target.value as TextureProfileId)
        }
      >
        {Object.values(TEXTURE_PROFILES).map((candidate) => (
          <option key={candidate.id} value={candidate.id}>
            {candidate.label}
          </option>
        ))}
      </select>

      <div className="texture-profile-meta">
        <span>
          MAX DIM · {profile.maxDimension === null ? 'OBSERVE' : profile.maxDimension}
        </span>
        <span>
          GPU EST · {profile.maxEstimatedGpuBytes === null
            ? 'OBSERVE'
            : bytes(profile.maxEstimatedGpuBytes)}
        </span>
      </div>

      {audit && (
        <>
          <div className="texture-metrics">
            <div><span>TEXTURES</span><strong>{audit.totals.textures}</strong></div>
            <div><span>MATERIALS</span><strong>{audit.totals.materials}</strong></div>
            <div><span>GPU EST</span><strong>{bytes(audit.totals.estimatedGpuBytes)}</strong></div>
            <div><span>OVERSIZED</span><strong>{audit.totals.oversizedTextures}</strong></div>
            <div><span>COLORSPACE</span><strong>{audit.totals.colorSpaceMismatches}</strong></div>
            <div><span>PACKED ORM</span><strong>{audit.totals.packedOrmMaterials}</strong></div>
          </div>

          <div className="texture-notes">
            {audit.notes.slice(0, 5).map((note) => (
              <p key={note}>{note}</p>
            ))}
          </div>

          <div className="texture-list">
            {audit.textures.slice(0, 8).map((texture) => (
              <div key={texture.id}>
                <strong>{texture.name}</strong>
                <span>
                  {texture.width}×{texture.height} · {texture.roles.join(' / ')}
                </span>
                <small>
                  {texture.colorSpace} · {bytes(texture.estimatedGpuBytes)}
                </small>
              </div>
            ))}
          </div>
        </>
      )}

      <button className="texture-record" disabled={!audit} onClick={onRecord}>
        RECORD QUALIFICATION + KTX2 PLAN
      </button>

      <div className="texture-encoder">
        <div className="texture-encoder-head">
          <div>
            <span>EXECUTION BACKEND</span>
            <strong>{encoder?.label ?? 'Khronos KTX Software'}</strong>
          </div>
          <i className={encoderStatus}>{encoderStatus.toUpperCase()}</i>
        </div>

        <p>
          {encoder?.available
            ? `${encoder.version ?? 'version unknown'} · ${encoder.codecs.join(' / ')}`
            : encoder?.statusReason ?? 'Probe the localhost bridge for the ktx executable.'}
        </p>

        <div className="texture-encoder-actions">
          <button
            disabled={encoderStatus === 'checking' || encodingBusy}
            onClick={onProbeEncoder}
          >
            {encoderStatus === 'checking' ? 'PROBING…' : 'CHECK KTX ENCODER'}
          </button>
          <button
            className="execute"
            disabled={!canExecute}
            onClick={onExecuteEncoding}
          >
            {encodingBusy ? 'ENCODING BASIS KTX2…' : 'EXECUTE BASIS KTX2'}
          </button>
        </div>
      </div>

      <div className="basisu-derived">
        <div className="basisu-derived-head">
          <div>
            <span>KHR_TEXTURE_BASISU GLB</span>
            <strong>Fallback-bearing derived asset</strong>
          </div>
          <i>{basisuSessionReady ? 'BYTES READY' : 'RE-ENCODE NEEDED'}</i>
        </div>

        <button
          disabled={
            basisuBusy ||
            !basisuSessionReady ||
            !latestEncoding ||
            latestEncoding.sourceArtifactId === ''
          }
          onClick={onBuildBasisuGlb}
        >
          {basisuBusy
            ? 'BUILDING BASISU GLB…'
            : 'BUILD KHR_TEXTURE_BASISU GLB'}
        </button>

        <p>
          Original PNG/JPEG fallbacks stay embedded. Verified KTX2 images are
          added as extension alternatives; the editable source asset is not mutated.
        </p>
      </div>

      <div className="basisu-compact">
        <div className="basisu-derived-head">
          <div>
            <span>COMPACT REQUIRED-BASISU GLB</span>
            <strong>Strip fallbacks + repack BIN</strong>
          </div>
          <i>{compactSessionReady ? 'FULL READY' : 'FULL GLB NEEDED'}</i>
        </div>

        <button
          disabled={compactBusy || !compactSessionReady}
          onClick={onCompactBasisuGlb}
        >
          {compactBusy
            ? 'REPACKING BASISU GLB…'
            : 'BUILD COMPACT BASISU GLB'}
        </button>

        <p>
          Only FULL-coverage Rung 11 assets qualify. Fallback image objects and
          their now-unreferenced bufferViews are removed; KHR_texture_basisu becomes required.
        </p>
      </div>

      <p className="texture-caveat">
        Rung 10 proves KTX2 bytes. Rung 11 binds them with fallbacks. Rung 12
        strips those fallbacks only after full coverage and reference validation.
      </p>

      {latest && (
        <div className="texture-receipt">
          <span>LATEST QUALIFICATION RECEIPT</span>
          <strong>{latest.profileId} · {latest.audit.qualification}</strong>
          <small>
            {latest.audit.totals.textures} textures · {latest.compressionPlan.length} planned encodes
          </small>
          <p>{latest.id}</p>
        </div>
      )}

      {latestEncoding && (
        <div className="texture-execution-receipt">
          <span>LATEST EXECUTED ENCODING</span>
          <strong>
            {latestEncoding.artifacts.length} KTX2 · {latestEncoding.encoderVersion}
          </strong>
          <small>
            {bytes(latestEncoding.totalSourcePngBytes)} PNG → {bytes(latestEncoding.totalOutputBytes)} KTX2
          </small>
          <p>
            ratio {latestEncoding.aggregateCompressionRatio.toFixed(2)}× · hashes browser-verified
          </p>
        </div>
      )}

      {latestBasisu && (
        <div className="basisu-receipt">
          <span>LATEST BASISU GLB</span>
          <strong>
            {latestBasisu.bindingCoverage} · {latestBasisu.boundTextureCount} bound
          </strong>
          <small>
            {bytes(latestBasisu.sourceGlbByteLength)} → {bytes(latestBasisu.outputGlbByteLength)}
          </small>
          <p>
            {latestBasisu.fallbackOnlyTextureCount} fallback-only · {latestBasisu.unboundExecutedTextureCount} unbound executed
          </p>
        </div>
      )}

      {latestCompact && (
        <div className="basisu-compact-receipt">
          <span>LATEST COMPACT BASISU GLB</span>
          <strong>
            {latestCompact.textureCount} textures · required extension
          </strong>
          <small>
            {bytes(latestCompact.sourceGlbByteLength)} → {bytes(latestCompact.outputGlbByteLength)}
          </small>
          <p>
            {bytes(Math.max(latestCompact.byteSavings, 0))} saved · {latestCompact.removedFallbackImageCount} fallback images removed
          </p>
        </div>
      )}
    </div>
  )
}
