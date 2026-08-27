# @candor/contract

Compact 0.31.1 · Language 0.23.0

## Contract overview

`src/candor.compact` — Wave 1 Candor ledger.

- `members: Set<Bytes<32>>` — leaf = `persistentHash([pad(32,"candor:member:v1"), secret])`, insertion issuer-gated
- `nullifiers: Set<Bytes<32>>` — **epoch-scoped**: `persistentHash([pad(32,"candor:nf:v1"), epoch, secret])` — one submission per member per epoch; `nextEpoch` re-opens
- `histogram: Map<Bytes<32>, Uint<64>>` — key = `persistentHash([cutKey, bucket])`
- `epochCount: Map<Bytes<1>, Uint<64>>` — readable epoch cell (`Counter` is not readable inside circuits in lang 0.23)
- `issuer: Bytes<32>` — public commitment `persistentHash([pad(32,"candor:issuer:v1"), issuerKey])`

### Circuits

- `submit(cutKey: Bytes<32>, bucket: Uint<8>)` — membership check → epoch-nullifier check → histogram increment. Only `cutKey` and `bucket` are disclosed.
- `enroll(memberLeaf: Bytes<32>)` — **issuer-gated on-chain**: the circuit hashes the caller's private `issuerKey` witness and asserts the commitment equals the public `issuer` value before inserting.
- `nextEpoch()` — issuer-gated; increments the epoch cell so spent nullifiers become stale and every member may submit once more.
- `getHistogram(cutKey, bucket) -> Uint<64>` / `readEpoch() -> Uint<64>` — read-only views for the indexer.

### Trust note

Wave 1 discloses the leaf to check `members.member(disclose(leaf))`. The member index is visible on-chain, but the salary is not — only the bucket is disclosed. Wave 2 replaces `Set` with `HistoricMerkleTree` + `merkleTreePathRoot` for fully private membership. The nullifier is epoch-scoped and unlinkable (the issuer never sees the user secret).

### Hash parity

`@candor/shared/hash` derives `memberLeaf`, `epochNullifier`, `bucketKeyBytes`, `issuerCommitment`, and `cutKeyBytes` with the same runtime primitives (`persistentHash` + identical type descriptors) as the compiled circuits. The circuit test suite asserts parity — if TS and circuit hashing ever drift, tests fail with `not a member`.

## Compile

```bash
pnpm --filter @candor/contract compile
# or with proving keys (slower)
pnpm --filter @candor/contract compile:zk
```

Output: `src/managed/candor/` with `contract/`, `keys/`, `zkir/`, `compiler/contract-info.json`. Compiled artifacts (including proving keys) are committed so evaluators can run without installing the Compact toolchain.

## Test (no chain required)

The suite runs the **generated contract circuits** off-chain (same ledger program the chain executes, minus the zk proof) plus a mock ledger mirroring the same semantics:

```bash
pnpm --filter @candor/contract test
```

Covers: happy path (enroll → submit → histogram read), double-submit rejected + `nextEpoch` re-opens, non-member rejected, out-of-range bucket rejected, non-issuer `enroll`/`nextEpoch` rejected, TS↔circuit hash parity, differential-leak regression (histogram delta reveals only bucket index).

## Deploy to Preprod (requires local proof server + Lace)

```bash
# 1. proof server (always user-local — witness is the salary)
docker compose -f proof-server.yml up

# 2. configure .env (see .env.example)
cp .env.example .env
# edit MIDNIGHT_WALLET_SEED, CANDOR_ISSUER_KEY, etc.

# 3. deploy
pnpm --filter @candor/contract deploy:preprod
```

See `docs/DEPLOY.md` for the full walkthrough and `src/deploy.ts` for provider wiring. The web app's `src/lib/midnight.ts` contains the browser-side equivalent using `FetchZkConfigProvider` + Lace DApp Connector.
