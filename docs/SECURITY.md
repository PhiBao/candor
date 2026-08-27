# Security & Failure Modes

## Privacy guarantees (and limits)

- **What is hidden:** secret (32 bytes), exact salary. Only cutKey (Bytes<32>) and bucket (0..9) are disclosed.
- **What is visible in Wave 1:** leaf (hash of secret) is disclosed for Set membership check → observer can see which enrolled member submitted that transaction's leaf. Salary remains bucketed, but member index is linkable to issuer's email→leaf map via timing. Documented as residual risk.
- **Wave 2 fix:** HistoricMerkleTree + merkleTreePathRoot, leaf never disclosed.
- **Differential leak:** histogram buckets, not sum. Sum deltas reveal exact salaries (e.g. consecutive totals 100k, 250k → second salary is exactly 150k). Buckets reveal only bucket index. Regression test `assertNoExactLeak` enforces delta = exactly one bucket increment by 1.
- **k-anonymity:** cuts hidden until ≥5 contributors. Coarse cuts (role×level×region, no company) help.
- **Proof server must be user-local:** witness is salary; hosted proving would hand us the salary. Rejected permanently.

## Integrity

- **Employer stuffing:** blocked by verified membership + one nullifier per epoch globally. Without this, Glassdoor-style astroturf is trivial.
- **Issuer compromise:** issuer can mint fake leaves and stuff histogram. Mitigations: append-only leaf log (`GET /log`, `GET /leaves`), per-epoch per-email rate limit, public audit. Decentralization is Wave 2 priority.
- **Truthfulness:** ZK proves bucket range, not honesty. Guarantee is one submission per verified person, not true salary. Outlier detection later.

## Failure states (UX)

- Proof server down: show `docker compose -f packages/contract/proof-server.yml up`
- Insufficient DUST: explain faucet + registration wait
- Wrong network: detect address prefix, prompt switch to Preprod
- Indexer lag: show staleness indicator rather than wrong numbers
- Nullifier spent: "already submitted this epoch" distinct from generic error
- Secret loss: unrecoverable by design (recovery would require issuer custody). Surfaced before contribution.
