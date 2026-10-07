import type {
  TextureAudit,
  TextureProfileId,
  TextureReceipt,
} from '../core/types'
import { TEXTURE_PROFILES } from '../texture/profiles'

interface TexturePanelProps {
  profileId: TextureProfileId
  audit?: TextureAudit
  receipts: readonly TextureReceipt[]
  onProfileChange: (profileId: TextureProfileId) => void
  onRecord: () => void
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
  onProfileChange,
  onRecord,
}: TexturePanelProps) {
  const profile = TEXTURE_PROFILES[profileId]
  const latest = receipts.at(-1)

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
        RECORD TEXTURE RECEIPT + KTX2 PLAN
      </button>

      <p className="texture-caveat">
        KTX2/Basis entries are a compression plan only in Rung 9. PhiForm does
        not claim compressed bytes until an encoder actually produces them.
      </p>

      {latest && (
        <div className="texture-receipt">
          <span>LATEST TEXTURE RECEIPT</span>
          <strong>{latest.profileId} · {latest.audit.qualification}</strong>
          <small>
            {latest.audit.totals.textures} textures · {latest.compressionPlan.length} planned encodes
          </small>
          <p>{latest.id}</p>
        </div>
      )}
    </div>
  )
}
