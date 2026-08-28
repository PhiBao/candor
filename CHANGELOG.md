# Changelog

All notable changes to Candor. This project follows the [Midnight Buildathon](https://app.akindo.io/wave-hacks/jaMZjqPOBsLXvjdG) three-wave program.

## [0.3.0] — 2026-08-28 — Wave 1: live on Midnight Preprod

### 🎉 End-to-end verified

The complete pipeline runs against Midnight Preprod with a real Lace wallet:

**deploy → enroll → prove (on-device) → signed transaction → aggregate updates.**

- Deployed contract: `e7cf6ffc48ebeb450813104e6a5ab3d585f7e275bcd32e5ea82eb7a8c21dd53d`
- Proof generation runs on the contributor's own machine (local proof server, same-origin proxy) — the salary witness never leaves the device.

### Added
- **Browser chain path** — full Midnight.js 4.1.1 provider bundle: wallet-config-driven endpoints, `httpClientProofProvider` via a same-origin `/proof-server` proxy, in-memory private state seeded from the persistent user secret.
- **Issuer console (operator UI)** — deploy the contract, enroll member leaves on-chain, advance the epoch. The issuer key witness never leaves the operator's browser.
- **Contribute wizard chain branch** — real `submit` transactions from the UI; the mock-ledger demo path remains for zero-setup evaluation.
- `nextEpoch` / `readEpoch` circuits; `GET /leaf` issuer endpoint; `pnpm dev:all` (web + issuer).
- Docs: full `docs/DEPLOY.md` (Preprod walkthrough incl. tNIGHT→tDUST generation), demo script, this changelog.

### Fixed
- Nullifier is now **epoch-scoped** (hashes the ledger epoch) — one-submission-per-epoch is actually enforceable; `nextEpoch` re-opens submissions.
- `enroll`/`nextEpoch` are **issuer-gated on-chain** (private `issuerKey` witness checked against the public commitment) — random wallets can no longer mint members.
- Replaced unreadable `Counter` with a readable map cell (language 0.23 limitation).
- Canonical TS↔circuit hashing (`@candor/shared/hash`) — bit-identical to `persistentHash`, asserted by tests.
- Wallet detection follows the official example pattern (generic `window.midnight` scan, apiVersion 4.x) — Lace is found however it injects.
- Deduped Midnight runtime via pnpm overrides (`onchain-runtime-v3@3.1.0`, `ledger-v8@8.1.1`) — two `_LedgerParameters` classes previously broke transcript partitioning.
- Browser polyfills: `Buffer`, `events` builtin (dep pre-bundling alias), `isomorphic-ws` shim, absolute URLs for ZK config assets.
- Stale compiled-contract assets: build script cleans `dist/managed` before copying; the web app serves the full managed dir (keys, zkir, contract metadata).

## [0.2.0] — 2026-08-27 — Contract v2 + circuit test suite

### Added
- **13-test suite running the generated Compact circuits off-chain** (same ledger program the chain executes, minus proofs): happy path, double-submit rejected + `nextEpoch` re-opens, non-member rejected, out-of-range bucket, non-issuer rejection, TS↔circuit hash parity, differential-leak regression.
- Compiled artifacts committed (5 circuits with proving keys) so evaluators run without the Compact toolchain.

### Changed
- Apache-2.0 license (Buildathon requirement); clean commit history; honest README status table.

## [0.1.0] — 2026-08-27 — Initial Wave 1 skeleton

- Compact 0.31.1 contract (`candor.compact`): members, nullifiers, histogram, epoch cell, issuer commitment.
- Shared domain model: role × level × region cuts (15), 10 USD buckets, k≥5 gate, mock ledger mirroring circuit semantics.
- Issuer service (demo verification codes, append-only leaf log, per-epoch rate limits).
- Web app: public cut pages, 4-step contribute wizard, percentile moment (mock ledger demo).
- Docs: SPEC, SECURITY, DEMO guides.
