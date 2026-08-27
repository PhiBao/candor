# Candor — Product Specification (Wave 1)

## 1. Core user

**Crypto-native engineers, designers, and PMs** — 1–10 years experience, remote, compensated in fiat + tokens. They already use wallets and can tolerate a local proof server, which converts Midnight's hardest constraint into a beachhead filter. Their comp data is most poorly served by Levels.fyi/Glassdoor (token grants, vesting, global remote). Reachable via Midnight/Cardano communities, crypto Twitter, Farcaster, DAO forums. Expansion to broader remote tech in Wave 3 as proving UX improves.

## 2. Job-to-be-done

> "When I'm about to negotiate — offer, review, raise, or deciding to leave — I want to know what people like me actually earn, from data I can trust, without exposing myself, so I can ask for the right number."

Functional: defensible number. Emotional: stop feeling quietly exploited. Social: don't become the person who leaked comp.

## 3. Main user journey

**Reader (no wallet, no proof server, free):** lands on cut page `engineering:L5:remote-us` via search/shared link → sees verified distribution with “N verified” badge → if cut is locked (k<5), prompted to contribute.

**Contributor (ZK flow):** Verify work email → code confirmation (client generates 32-byte secret, stores locally; issuer inserts leaf, never sees secret) → Connect Lace (Preprod) → Describe: level, region, comp (one question per screen) → Submit: client derives bucket, builds membership proof + epoch nullifier, proves locally (Docker proof server :6300), submits tx → Result: “Recorded. Nobody can link this to you.” + percentile.

## 4. Activation moment

**“You’re paid in the 34th percentile for your cut”** — delivered instantly after submission. Personal, emotional, actionable, obtainable only by contributing. Resolves the anxiety that drove the visit at peak attention. Secondary activation for readers: first time they see a verified distribution for their own cut with enough contributors to believe it.

## 5. Retention loop

Cryptographic, not cosmetic: epoch-scoped nullifier = one submission per verified person per epoch (quarter). Next epoch data is stale, re-eligible.

- Natural triggers align with epochs: reviews, raises, offers, job changes
- Pull: “7 new verified submissions in your cut — your percentile moved 62nd → 48th”
- Give-to-get: contributing unlocks deeper cuts for that epoch
- Compounding: more contributors → more cuts clear k → more value → more reason to return

## 6. Product differentiation

- Levels.fyi/Glassdoor: unverifiable self-report, astroturfable
- Blind: verifies work email but ties posts to persistent handle
- Pave/OpenComp: verified but employer-owned, not worker-facing
- **Candor: verified + unlinkable + worker-facing**

Gap is verified and unlinkable together — without ZK they are mutually exclusive. Secondary edge: real crypto-comp modeling (token grants, vesting, stablecoin salaries) in later waves.

## 7. Interface model

Not a dashboard. Behavior-driven:

- **Public read surface: one page per cut.** Single dominant object — distribution. Shareable, linkable, indexable. (Vite + React, static rendering ready for Next.js ISR)
- **Contribute surface: 4-step wizard, one question per screen**, progressive disclosure, plain-language privacy note at each cryptographic step
- **Percentile result: full-screen moment**, designed to screenshot/share
- No sidebar, settings page, data tables, charts wall, admin panel, accounts

No accounts by design — no identity to leak.

## 8. MVP scope and non-goals

**In:** one epoch (Q1-2026), USD only, engineering family L3–L7, cuts = role × level × region (no company, coarse for k≥5), histogram buckets (10), epoch nullifier, k-gate, issuer service, Vite read pages + wizard + percentile moment, Lace on Preprod, off-chain circuit tests including negative + differential-leak regression, Preprod deployment, demo video, seed plan for one community.

**Out:** multi-issuer/decentralized attestation, zkEmail, employer product, monetization, equity/vesting valuation, multi-currency, non-engineering roles, mobile (Kuira candidate for Wave 3), notifications infra, user accounts.

## 9. Architecture

```
packages/contract   Compact candor.compact → managed/contract + keys + zkir (0.31.1 / lang 0.23)
packages/shared     cuts, buckets, hashing, k-gate, mockLedger
packages/issuer     email code → leaf insertion, append-only log, rate limits
apps/web            Vite + React: public cut grid + wizard + percentile
```

**Ledger:** `members: Set<Bytes<32>>`, `nullifiers: Set<Bytes<32>>`, `histogram: Map<Bytes<32>, Uint<64>>` (key = persistentHash([cutKey, bucket])), `epoch: Counter`, `issuer: Bytes<32>`.

**Circuit submit:** leaf = persistentHash([pad(32,"candor:member:v1"), secret]), check members, nf = persistentHash([pad(32,"candor:nf:v1"), secret]), check nullifiers, bKey = persistentHash([cutKey, bucket]), histogram increment. Only cutKey, bucket disclosed.

**Trust boundary:** issuer learns who is a member, cannot link submission to member (never sees secret). Wave 1 discloses leaf for Set membership; Wave 2 replaces with HistoricMerkleTree + merkleTreePathRoot for private membership.

**Read path:** indexer GraphQL → ledger(state.data) → static cut pages. No wallet.

## 10. Validation metrics

Thesis: workers will contribute verified comp data if unlinkability is credible and will return.

- **Contribution conversion** (verify started → on-chain submit): target >40% — the number that matters for ZK friction + trust story
- **Cuts clearing k≥5** — cold-start beatable?
- **Epoch-2 return rate** target >30%
- **Locked-cut read→contribute rate** — give-to-get
- **Organic shares** of percentile moments

Falsifiers: verification starts but no submits → proof-server friction fatal; heavy reads no contributions → unlinkability claim not believed; no cut reaches k → beachhead too broad.

Qualitative: 10 interviews — “do you believe we can’t link this to you, and why?”

## 11. Security and failure considerations

**Privacy:** histogram buckets not sum (differential leak: sum deltas reveal exact salaries — regression test asserts delta is exactly one bucket increment); k-anonymity gate; timing correlation (verification and submission decoupled, documented residual risk); nullifier domain separation (epoch + contract id; Wave 1 epoch is static, Wave 2 adds contract id); secret loss is unrecoverable by design (must surface in UI); proof server must be user-local, hosted proving permanently rejected.

**Integrity:** employer astroturfing blocked by verified membership + one nullifier per epoch (Glassdoor weakness fixed); issuer compromise can mint fake members and stuff histogram — mitigate with public append-only leaf log + per-epoch caps, decentralization is Wave 2/3 primary goal; truthfulness — ZK proves bucket range, not honesty — guarantee is one submission per verified person, not truth (still stronger than incumbents), outlier detection over time.

**Failure states:** proof server down (show docker command), insufficient DUST (explain faucet + registration wait), wrong network (detect prefix, prompt switch to Preprod), indexer lag (staleness indicator), nullifier already spent (distinguish “already submitted this epoch” vs error).

---

### Wave plan

**Wave 1:** narrow complete flow above, deployed to Preprod, demo video, seeded community.

**Wave 2:** richer cuts + percentiles, historical roots, maybe company dimension when volume supports it, stronger histogram queries.

**Wave 3:** decentralized issuance, Kuira mobile, payer-side surface.

