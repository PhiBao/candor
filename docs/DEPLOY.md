# Deploying GotIt to Midnight Preprod

Status: the contract is **compiled, tested and live on Preprod** at
`e7cf6ffc48ebeb450813104e6a5ab3d585f7e275bcd32e5ea82eb7a8c21dd53d`. The browser Operator
console in `apps/web` is the working deployment path; the CLI script is a stub. Follow this doc
top to bottom for a fresh environment, or §8 to resume the paused hosted deployment.

> The contract source is `packages/contract/src/candor.compact`. The name is **frozen** — its
> `candor:*` domain strings are inputs to the deployed contract's hash derivations. The product
> was renamed Candor → GotIt; the contract identifiers were not.

## 0. Prerequisites

- Node ≥ 20, pnpm 9
- Docker (proof server)
- [Lace browser extension](https://www.lace.io/) with a Midnight account (Preprod)
- Compact toolchain: `compact update` (0.31.1) — only needed to recompile; compiled artifacts are committed

## 1. Build the contract

```bash
pnpm install
pnpm contract:compile        # compact compile src/candor.compact src/managed/candor
pnpm contract:build
pnpm --filter @gotit/contract test   # circuit tests must pass before deploy
```

## 2. Start the proof server (user-local)

The witness contains the salary, so proving must happen on the contributor's own machine — never on a hosted server.

```bash
docker compose -f packages/contract/proof-server.yml up
# listens on http://localhost:6300
```

## 3. Fund the deployer wallet (tNIGHT → tDUST)

On Preprod the faucet does NOT dispense tDUST — you generate it from tNIGHT:

1. Create/recover a Midnight account in Lace (Preprod network).
2. Copy your **unshielded** address (`mn_addr_preprod1...`) and request tNIGHT from the
   [Preprod faucet](https://midnight-tmnight-preprod.nethermind.dev/) — 1000 tNIGHT per request.
3. In Lace, open the Midnight wallet and click **Generate tDUST** → Review → Confirm.
   This registers your tNIGHT for DUST generation (an on-chain transaction).
4. Wait 1–2 minutes: tDUST accrues continuously into the tDUST tank, up to a cap
   set by your registered tNIGHT. Deploy once you see a tDUST balance.

See [Funding a wallet](https://docs.midnight.network/guides/acquire-tokens) for the
full guide and troubleshooting.

## 4. Configure

```bash
cp packages/contract/.env.example packages/contract/.env
```

| Variable | Meaning |
|---|---|
| `MIDNIGHT_NETWORK` | `preprod` |
| `MIDNIGHT_INDEXER` / `MIDNIGHT_INDEXER_WS` | Preprod indexer GraphQL endpoints |
| `PROOF_SERVER` | `http://localhost:6300` |
| `MIDNIGHT_WALLET_SEED` | deployer seed — **never commit the real value** |
| `GOTIT_ISSUER_KEY` | 32-byte hex issuer secret key used by `enroll`/`nextEpoch` |

The deploy script derives `issuerCommit = persistentHash([pad(32,"candor:issuer:v1"), issuerKey])` via `@gotit/shared/hash` (bit-identical to the circuit) and passes it to the constructor.

## 5. Deploy

```bash
pnpm --filter @gotit/contract deploy:preprod
```

The script prints the contract address. Store it in `CONTRACT_ADDRESS` (same `.env`) — the web app and issuer read it from there.

## 6. Verify

```bash
# read epoch (should be 1)
# read a histogram bucket via the indexer public data provider
pnpm --filter @gotit/contract verify:preprod
```

## 7. Run the issuer + web app

```bash
pnpm --filter @gotit/issuer dev   # :8787
pnpm dev                           # :5173, proxies /issuer
```

## 8. Hosted environment on Fly.io (pause / resume)

Three Fly apps back the hosted demo: `candor-midnight-prover` (own proof server,
`midnightntwrk/proof-server:8.1.0`), `candor-midnight-issuer` (Express), `candor-midnight-web`
(Caddy serving the built app plus same-origin `/issuer`, `/indexer`, `/proof-server` proxies).

**Pause (stop all compute spend)**

```bash
set -a; source .env; set +a          # FLY_ACCESS_TOKEN lives in .env
fly scale count 0 -a candor-midnight-prover --yes
fly scale count 0 -a candor-midnight-issuer --yes
fly scale count 0 -a candor-midnight-web    --yes
```

`fly machine stop` is **not** enough: all three `fly.*.toml` files set
`min_machines_running = 1`, so the platform restarts a stopped Machine. `scale count 0`
removes the Machines (images, releases and the deployed contract stay intact). The three
public URLs then return 503 — expected while paused.

**Resume**

```bash
set -a; source .env; set +a
fly deploy -c fly.prover.toml        # first: web proxies /proof-server and fails without it
fly deploy -c fly.issuer.toml
fly deploy -c fly.web.toml
curl -s https://candor-midnight-issuer.fly.dev/health   # {"ok":true,...}
```

Notes:
- `fly.web.toml` bakes `VITE_CONTRACT_ADDRESS` and `VITE_ISSUER_KEY` as build args, so a
  web deploy always targets the current contract.
- The prover machine must stay `auto_stop = "suspend"` (never `stop`/`destroy`): a cold start
  returns 403 on `/proof-server/prove`.
- The issuer keeps verification leaves in memory, so a redeploy resets them; that is fine for
  demos (codes are issued in-band).

## Troubleshooting

| Symptom | Fix |
|---|---|
| Proof server connection refused | `docker compose -f packages/contract/proof-server.yml up` not running, or wrong `PROOF_SERVER` |
| `Insufficient Funds: could not balance dust` | tNIGHT not registered for DUST generation yet — run **Generate tDUST** in Lace and wait for the tank to fill |
| `wrong network` | Lace is on a different network than `MIDNIGHT_NETWORK` |
| `enroll: caller is not the issuer` | `GOTIT_ISSUER_KEY` in the issuer service ≠ key committed at deployment |
| `already submitted this epoch` | expected — one submission per member per epoch; issuer must call `nextEpoch` |
