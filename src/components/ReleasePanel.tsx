import type {
  BasisuCompactReceipt,
  BasisuDerivedReceipt,
  GltfValidationReceipt,
  ReleaseAttestation,
  ReleaseCandidateReceipt,
  ReleasePolicyId,
  ReleaseSignerDescriptor,
  ReleaseTarget,
} from '../core/types'
import { releasePolicyAllows } from '../release/pack'

interface ReleasePanelProps {
  target: ReleaseTarget
  policyId: ReleasePolicyId
  busy: boolean
  fallbackReceipt?: BasisuDerivedReceipt
  compactReceipt?: BasisuCompactReceipt
  validationReceipts: readonly GltfValidationReceipt[]
  releaseReceipts: readonly ReleaseCandidateReceipt[]
  signer?: ReleaseSignerDescriptor
  signerStatus: 'idle' | 'checking' | 'online' | 'error'
  signingToken: string
  attestationBusy: boolean
  attestations: readonly ReleaseAttestation[]
  releaseSessionReady: boolean
  fallbackSessionReady: boolean
  compactSessionReady: boolean
  onTargetChange: (target: ReleaseTarget) => void
  onPolicyChange: (policy: ReleasePolicyId) => void
  onBuild: () => void
  onSigningTokenChange: (token: string) => void
  onProbeSigner: () => void
  onAttest: () => void
}

function bytes(value: number): string {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

export function ReleasePanel({
  target,
  policyId,
  busy,
  fallbackReceipt,
  compactReceipt,
  validationReceipts,
  releaseReceipts,
  signer,
  signerStatus,
  signingToken,
  attestationBusy,
  attestations,
  releaseSessionReady,
  fallbackSessionReady,
  compactSessionReady,
  onTargetChange,
  onPolicyChange,
  onBuild,
  onSigningTokenChange,
  onProbeSigner,
  onAttest,
}: ReleasePanelProps) {
  const targetReceipt =
    target === 'basisu-compact'
      ? compactReceipt
      : fallbackReceipt
  const validation = targetReceipt
    ? [...validationReceipts].reverse().find(
        (entry) =>
          entry.target === target &&
          entry.targetReceiptId === targetReceipt.id,
      )
    : undefined
  const sessionReady =
    target === 'basisu-compact'
      ? compactSessionReady
      : fallbackSessionReady

  let gate = 'NO DERIVED TARGET'
  let gateClass = 'blocked'
  let canRelease = false

  if (targetReceipt && !sessionReady) {
    gate = 'BYTES NOT IN SESSION'
  } else if (targetReceipt && sessionReady && !validation) {
    gate = 'VALIDATION MISSING'
  } else if (targetReceipt && sessionReady && validation) {
    if (
      validation.phiformBasisu.status !== 'pass' ||
      validation.official.numErrors > 0 ||
      validation.qualification === 'fail'
    ) {
      gate = 'VALIDATION FAIL'
    } else if (!releasePolicyAllows(policyId, validation.qualification)) {
      gate = 'POLICY BLOCKED'
    } else {
      gate = `READY · ${validation.qualification.toUpperCase()}`
      gateClass = 'ready'
      canRelease = true
    }
  }

  const latest = releaseReceipts.at(-1)
  const latestAttestation = attestations.at(-1)

  return (
    <div className="release-card">
      <div className="release-head">
        <div>
          <span className="eyebrow">GOVERNED RELEASE GATE</span>
          <strong>Qualified release candidate</strong>
        </div>
        <span className={gateClass}>{gate}</span>
      </div>

      <label className="field-label" htmlFor="release-target">
        RELEASE TARGET
      </label>
      <select
        id="release-target"
        value={target}
        onChange={(event) =>
          onTargetChange(event.target.value as ReleaseTarget)
        }
      >
        <option value="basisu-compact">Compact required-BasisU GLB</option>
        <option value="basisu-fallback">Fallback-bearing BasisU GLB</option>
      </select>

      <label className="field-label" htmlFor="release-policy">
        VALIDATION POLICY
      </label>
      <select
        id="release-policy"
        value={policyId}
        onChange={(event) =>
          onPolicyChange(event.target.value as ReleasePolicyId)
        }
      >
        <option value="strict-pass">Strict · PASS only</option>
        <option value="allow-warning">Allow Warning · PASS/WARNING</option>
      </select>

      <div className="release-facts">
        <div>
          <span>TARGET RECEIPT</span>
          <strong>{targetReceipt?.id ?? '—'}</strong>
        </div>
        <div>
          <span>VALIDATION</span>
          <strong>{validation?.qualification.toUpperCase() ?? '—'}</strong>
        </div>
        <div>
          <span>KHRONOS ERRORS</span>
          <strong>{validation?.official.numErrors ?? '—'}</strong>
        </div>
        <div>
          <span>BASISU CHECK</span>
          <strong>{validation?.phiformBasisu.status.toUpperCase() ?? '—'}</strong>
        </div>
      </div>

      <button
        className="release-build"
        disabled={!canRelease || busy}
        onClick={onBuild}
      >
        {busy ? 'PACKAGING RELEASE CANDIDATE…' : 'BUILD RELEASE CANDIDATE'}
      </button>

      <p className="release-caveat">
        The release ZIP is emitted only when the exact in-session GLB bytes
        match both the derived receipt and validation receipt under the selected policy.
      </p>

      <div className="release-attestation">
        <div className="release-attestation-head">
          <div>
            <span>OPERATOR ATTESTATION</span>
            <strong>Ed25519 detached signature</strong>
          </div>
          <i className={signerStatus}>
            {signerStatus.toUpperCase()}
          </i>
        </div>

        <p>
          {signer?.available
            ? `key ${signer.publicKeyFingerprintSha256?.slice(0, 18) ?? 'unknown'}…`
            : signer?.statusReason ?? 'Probe the local bridge signer.'}
        </p>

        <label className="field-label" htmlFor="release-signing-token">
          SESSION SIGNING TOKEN
        </label>
        <input
          id="release-signing-token"
          type="password"
          autoComplete="off"
          value={signingToken}
          placeholder="Bearer token from signer init"
          onChange={(event) =>
            onSigningTokenChange(event.target.value)
          }
        />

        <div className="release-attestation-actions">
          <button
            disabled={signerStatus === 'checking' || attestationBusy}
            onClick={onProbeSigner}
          >
            {signerStatus === 'checking' ? 'PROBING…' : 'CHECK SIGNER'}
          </button>
          <button
            className="attest"
            disabled={
              !releaseSessionReady ||
              !latest ||
              !signer?.available ||
              !signingToken.trim() ||
              attestationBusy
            }
            onClick={onAttest}
          >
            {attestationBusy
              ? 'SIGNING ATTESTATION…'
              : 'ATTEST LATEST RELEASE'}
          </button>
        </div>

        <small>
          Token is session-only and is not written to PhiForm project data.
        </small>
      </div>

      {latest && (
        <div className="release-receipt">
          <span>LATEST RELEASE RECEIPT</span>
          <strong>
            {latest.target} · {latest.policyId}
          </strong>
          <small>
            {bytes(latest.packageByteLength)} · {latest.decision}
          </small>
          <p>{latest.packageSha256}</p>
        </div>
      )}

      {latestAttestation && (
        <div className="release-attestation-receipt">
          <span>LATEST RELEASE ATTESTATION</span>
          <strong>
            {latestAttestation.algorithm} · VERIFIED
          </strong>
          <small>
            signer {latestAttestation.publicKeyFingerprintSha256.slice(0, 20)}…
          </small>
          <p>{latestAttestation.signatureBase64}</p>
        </div>
      )}
    </div>
  )
}
