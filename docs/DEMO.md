# Demo Guide — Wave 1

## One-command demo (no chain, no wallet)

```bash
pnpm install
pnpm build
pnpm --filter @candor/web preview --port 5173
# or
pnpm dev
```

Open http://localhost:5173

**Flow to show (2 minutes):**

1. **Browse cuts** — 3 unlocked (green), 2 locked. Click any unlocked cut → see histogram, verified count.
2. **Click Contribute** (or locked cut's "Unlock by contributing")
   - Step 1: enter any email (e.g. you@example.com) → "Send code" → code appears on-screen (demo mode, no email infra)
   - Step 2: paste 6-digit code → Verify
   - Step 3: pick Level (L5), Region (remote-us), enter salary (e.g. 162000) → shows bucket `$150–175k`
   - Step 4: Review cut + bucket → "Submit — generate ZK proof locally" → ~900ms simulated proving → success
3. **Percentile moment** — "You're in the 61st percentile for Engineering · Senior · Remote · US" with histogram highlighting your bucket, total count incremented by 1.
4. **Return to cut** — now histogram has one more in that bucket. Try submitting again with same identity → "already submitted this epoch" (nullifier).

**Reset:** header "Reset demo" clears ledger.

## With issuer backend

```bash
pnpm --filter @candor/issuer dev
# issuer at http://localhost:8787
# web dev server proxies /issuer → :8787, so same flow but issuer log is real
curl http://localhost:8787/health
curl http://localhost:8787/log  # append-only, domains redacted
```

## Midnight Preprod deployment

```bash
# 1. proof server (user-local, witness is salary)
docker compose -f packages/contract/proof-server.yml up

# 2. ensure Lace wallet on Preprod, funded with tDUST (faucet + registration wait)
# 3. deploy
pnpm --filter @candor/contract compile
pnpm --filter @candor/contract build
# configure .env from .env.example, then run deploy script
node --loader ts-node/esm packages/contract/src/deploy.ts preprod
```

Contract is `packages/contract/src/candor.compact`, compiled with compact 0.31.1. Ledger state is observable via `packages/contract/src/deploy.ts`'s `publicDataProvider.queryContractState`.

## Video checklist

- Show public cut pages are readable with no wallet
- Show locked cut + contribution unlocks it
- Show verification step (email → code, issuer log)
- Show bucketing (salary → bucket, coarse is privacy dial)
- Show percentile moment (activation) + share
- Show second submit rejected (nullifier) and note "one per epoch per verified person"
- Mention trust boundary: issuer sees member, not submission link
- Mention histogram-not-sum guarantee (differential-leak regression exists in tests)
