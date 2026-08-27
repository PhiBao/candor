# Security & Failure Modes

## Privacy guarantees (and limits)

- **What is hidden:** secret (32 bytes), exact salary, issuer key. Only cutKey (Bytes<32>) and bucket (0..9) are disclosed.
- **What is visible in Wave 1:** leaf (hash of secret) is disclosed for Set membership check → observer can see which enrolled member submitted that transaction's leaf. Salary remains bucketed, but member index is linkable to issuer's email→leaf map via timing. Documented as residual risk.
- **Wave 2 fix:** HistoricMerkleTree + merkleTreePathRoot, leaf never disclosed.
- **Differential leak:** histogram buckets, not sum. Sum deltas reveal exact salaries (e.g. consecutive totals 100k, 250k → second salary is exactly 150k). Buckets reveal only bucket index. Circuit test `differential-leak regression` enforces delta = exactly one bucket increment by 1.
- **k-anonymity:** cuts hidden until ≥5 contributors (UI-enforced in Wave 1; the histogram itself is on-chain). Coarse cuts (role×level×region, no company) help.
- **Proof server must be user-local:** witness is salary; hosted proving would hand us the salary. Rejected permanently.

## Integrity

- **Enrollment is issuer-gated on-chain:** `enroll` hashes the caller's private `issuerKey` witness and asserts the commitment equals the public `issuer` value — a random wallet cannot mint members. Residual trust: the issuer (off-chain service) still decides which leaves get submitted for enrollment.
- **Epoch-scoped nullifier:** nullifier = `persistentHash([pad(32,"candor:nf:v1"), epoch, secret])` with `epoch` read from ledger state — callers cannot lie about the epoch to evade the one-submission rule. `nextEpoch` (issuer-gated) re-opens submissions for a fresh epoch.
- **Employer stuffing:** blocked by verified membership + one nullifier per member per epoch (Glassdoor weakness fixed).
- **Issuer compromise:** the issuer key can mint fake members and stuff the histogram. Mitigations: append-only leaf log (`GET /log`, `GET /leaves`), per-epoch per-email rate limit, public audit. Key rotation and decentralized issuance are Wave 2 priorities.
- **Truthfulness:** ZK proves bucket range, not honesty. Guarantee is one submission per verified person per epoch, not true salary. Outlier detection later.

## Failure states (UX)

- Proof server down: show `docker compose -f packages/contract/proof-server.yml up`
- Insufficient DUST: explain faucet + registration wait
- Wrong network: detect address prefix, prompt switch to Preprod
- Indexer lag: show staleness indicator rather than wrong numbers
- Nullifier spent: "already submitted this epoch" distinct from generic error
- Secret loss: unrecoverable by design (recovery would require issuer custody). Surfaced before contribution.
