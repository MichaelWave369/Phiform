# Release Attestations — Rung 15

Rung 15 adds a cryptographic authorization layer **after** the governed release candidate gate.

A release receipt proves that one exact ZIP satisfied PhiForm's release policy.

A release attestation proves that an operator-controlled Ed25519 key authorized a statement binding that exact ZIP hash and release lineage.

## Authority separation

```text
qualified release ZIP
      |
      +-- phiform.release-receipt.v1
      |
      v
localhost signer
      |
      +-- private Ed25519 key on disk
      +-- session bearer token
      +-- recompute ZIP SHA-256
      |
      v
canonical signed statement
      |
      +-- release ID
      +-- release receipt ID
      +-- ZIP filename
      +-- ZIP SHA-256
      +-- ZIP byte length
      +-- source artifact ID
      +-- source graph node
      +-- release target
      +-- target receipt ID
      +-- validation receipt ID
      +-- policy ID
      |
      v
Ed25519 detached signature
      |
      v
phiform.release-attestation.v1
```

The signer never grants source-edit authority and never mutates the release ZIP.

## Initialize the signer

Run:

```bash
npm run signer:init
```

Optional custom private-key path:

```bash
npm run signer:init -- ./secrets/my-release.private.pem
```

The initializer creates:

- an Ed25519 PKCS#8 private key
- a matching SPKI public key
- a fresh random bearer token printed to the terminal

Private-key paths matching PhiForm's local secret patterns are ignored by Git.

The token is intentionally **not stored by PhiForm**.

## Windows / PowerShell

The initializer prints commands equivalent to:

```powershell
$env:PHIFORM_RELEASE_SIGNING_KEY = "C:\path\to\phiform-release-ed25519.private.pem"
$env:PHIFORM_RELEASE_SIGNING_TOKEN = "<random session token>"
npm run bridge
```

The environment variables apply to the shell process that launches the bridge.

## Bridge endpoints

```text
GET  /v1/release-signer
POST /v1/release-attest
```

### Discovery

The signer descriptor exposes only public information:

- availability
- algorithm
- signer ID
- SHA-256 public-key fingerprint

It does not expose the private-key path or token.

### Signing

The signing endpoint requires:

```http
Authorization: Bearer <session token>
```

The browser submits:

- exact release ZIP bytes
- the matching `phiform.release-receipt.v1`

The bridge recomputes the ZIP SHA-256 and byte length before signing.

A release receipt whose package hash or length does not match the submitted bytes is rejected.

## CORS and authorization

Ordinary PhiForm localhost bridge endpoints remain browser-accessible.

The release signing endpoint additionally requires the bearer token.

The token comparison is performed with constant-time byte comparison when lengths match.

This prevents another arbitrary webpage from using the signer merely because the bridge is running on localhost.

The token is not a substitute for operating-system account security. Anyone who can read the private key or bridge process environment already has stronger local access.

## Signed payload

The attestation carries the exact signed bytes as:

```text
signedPayloadBase64
```

and also includes:

```text
signedPayloadSha256
```

The decoded statement is included for readability.

Independent verification should verify the signature against the exact payload bytes, not rebuild JSON and assume an object serialization order.

## Public-key identity

The attestation includes:

- SPKI PEM public key
- SHA-256 fingerprint over the DER SPKI bytes

This makes the attestation self-verifiable.

Trusting the key is a separate policy question.

Rung 15 proves **which key signed the release**. It does not claim that every public key is trusted merely because it is cryptographically valid.

## Determinism

Ed25519 signing is deterministic for identical key + message bytes.

The Rung 15 CI contract signs the same statement twice and requires identical signatures.

The attestation's outer `createdAt` may differ, but the signed canonical statement is stable for a fixed release receipt.

## Receipt

```text
phiform.release-attestation.v1
```

It records:

- signer ID
- algorithm
- public-key fingerprint
- public key
- exact signed payload bytes
- signed payload SHA-256
- detached signature
- bridge local-verification result
- decoded release statement

The project persists this public evidence.

The private key and bearer token are never project fields.

## Independent verification

Verify signature only:

```bash
npm run attestation:verify -- release-attestation.json
```

Verify signature plus release ZIP identity:

```bash
npm run attestation:verify -- release-attestation.json release.zip
```

The verifier checks:

- Ed25519 signature
- signed payload SHA-256
- public-key fingerprint
- optional release ZIP SHA-256
- optional release ZIP byte length

## What Rung 15 does not claim

Rung 15 does not:

- establish a global certificate authority
- prove the public key belongs to a particular legal person
- upload public keys to a transparency log
- rotate or revoke keys
- use hardware-backed key storage
- use a cloud KMS/HSM
- timestamp signatures through an external trusted timestamp authority
- publish releases automatically

Those are possible later trust-policy rungs.

## CI qualification

`npm run attestation:contract` launches the real PhiForm bridge with a temporary Ed25519 key and token.

It verifies:

- signer discovery
- missing-token HTTP 401
- wrong-token HTTP 401
- release ZIP hash recomputation
- Ed25519 detached signature
- public-key fingerprint
- local signature verification
- deterministic signature for the same statement
- forged package refusal
- tampered signature refusal

The CI key is generated for the test and deleted afterward.
