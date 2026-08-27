# @candor/contract

Compact 0.31.1 · Language 0.23.0

## Contract overview

`src/candor.compact` — Wave 1 Candor ledger.

- `members: Set<Bytes<32>>` — leaf = `persistentHash([pad(32,"candor:member:v1"), secret])`
- `nullifiers: Set<Bytes<32>>` — `persistentHash([pad(32,"candor:nf:v1"), secret])` — one per epoch
- `histogram: Map<Bytes<32>, Uint<64>>` — key = `persistentHash([cutKey, bucket])`
- `epoch: Counter`
- `issuer: Bytes<32>`

### Circuits

- `submit(cutKey: Bytes<32>, bucket: Uint<8>)` — membership check → nullifier check → histogram increment. Only `cutKey` and `bucket` are disclosed.
- `enroll(memberLeaf: Bytes<32>)` — issuer inserts leaf
- `getHistogram(cutKey, bucket) -> Uint<64>` — read-only view for indexer

### Trust note

Wave 1 discloses the leaf to check `members.member(disclose(leaf))`. The member index is visible on-chain, but the salary is not — only the bucket is disclosed. Wave 2 replaces `Set` with `HistoricMerkleTree<32, Bytes<32>>` + `merkleTreePathRoot` for fully private membership (membership proof without leaf disclosure). Nullifier is already unlinkable (issuer never sees secret).

## Compile

```bash
pnpm --filter @candor/contract compile
# or with proving keys (slower)
pnpm --filter @candor/contract compile:zk
```

Output: `src/managed/candor/` with `contract/`, `keys/`, `zkir/`, `compiler/contract-info.json`.

## Test (no chain required)

Off-chain circuit simulation + mock ledger invariants:

```bash
pnpm --filter @candor/contract test
```

Covers: happy path, double-submit rejected, non-member rejected, out-of-range bucket rejected, differential-leak regression (histogram delta reveals only bucket index).

## Deploy to Preprod (requires local proof server + Lace)

```bash
# 1. proof server (always user-local — witness is the salary)
docker compose -f proof-server.yml up

# 2. configure .env (see .env.example)
cp .env.example .env
# edit MIDNIGHT_WALLET_SEED, etc.

# 3. deploy
pnpm --filter @candor/contract deploy:preprod
```

See `src/deploy.ts` for provider wiring (Midnight.js `levelPrivateStateProvider`, `indexerPublicDataProvider`, `NodeZkConfigProvider`, `httpClientProofProvider`, wallet provider). The web app's `src/lib/midnight.ts` contains the browser-side equivalent using `FetchZkConfigProvider` + Lace DApp Connector.
