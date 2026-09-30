# Demo Guide

> **Wave 2 note:** the product was renamed Candor → GotIt. The contract file is still
> `candor.compact` because its `candor:*` domain strings are frozen against the deployed
> contract `e7cf6ffc…dd53d`. The Wave 1 flow below still works; the Wave 2 report surface is
> described in [SPEC.md](SPEC.md) §9.

## The report engine (no chain, no wallet — the Wave 2 deliverable)

```bash
pnpm --filter @gotit/shared exec tsx src/paygap.cli.ts --demo
```

Prints a full Art. 9 report from sample data, clearly labelled as not a filing. Highlights to
show a judge:

- **Intervals, not point estimates** — "Mean pay: $162,500–$187,500". Bucketed data only bounds
  the truth, and the report says so.
- **Suppression** — a 5-person category is withheld entirely, listed under "Suppressed
  categories" with its reason.
- **The 5% materiality call-out** — when a proven gap crosses the Art. 9(4) threshold, the
  report states that a joint pay assessment may be triggered.
- **Disclosure notes** travel with the output, including that participation is voluntary.

## One-command demo (no chain, no wallet) — the Wave 1 flow

```bash
pnpm install
pnpm build
pnpm --filter @gotit/web preview --port 5173
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
pnpm --filter @gotit/issuer dev
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
pnpm --filter @gotit/contract compile
pnpm --filter @gotit/contract build
# configure .env from .env.example, then run deploy script
node --loader ts-node/esm packages/contract/src/deploy.ts preprod
```

Contract is `packages/contract/src/candor.compact`, compiled with compact 0.31.1. Ledger state is observable via `packages/contract/src/deploy.ts`'s `publicDataProvider.queryContractState`.

## Video checklist

Lead with the report engine — it is the Wave 2 deliverable and needs no wallet:

1. The Art. 9 report from sample data, and the interval-vs-point-estimate honesty
2. A suppressed category and its stated reason
3. The 5% materiality call-out
4. Then the chain path: public pages readable with no wallet → contribute → proof generated
   locally → histogram increments
5. Second submit rejected (nullifier) — "one per period per verified person"
6. Trust boundary: the issuer sees membership, never a submission linked to a person
7. Histogram-not-sum guarantee (differential-leak regression exists in the tests)
