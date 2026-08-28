# Candor — Verified, Unlinkable Compensation Truth

> **For crypto-native tech workers who need to know what “people like me” actually earn — without exposing themselves.**

Candor is a privacy-first compensation benchmarking product built on **Midnight Network (Compact)**. Only verified members can contribute, no one — including the team — can link a number back to a person, and the public output is a distribution, never a record.

## Why this exists

| Option | Verified? | Unlinkable? | Worker-facing? |
|---|---|---|---|
| Levels.fyi / Glassdoor | No (self-report) | Partly | Yes |
| Blind | Yes (work email) | No (persistent handle) | Yes |
| Pave / OpenComp | Yes | No | No (employer-owned) |
| **Candor** | **Yes** | **Yes** | **Yes** |

Without ZK you cannot have “verified” and “unlinkable” at once. Midnight makes it possible.

- **Proof server must be user-local** — the witness is the salary, so hosted proving is permanently rejected. This is a deliberate trust boundary.
- **Wave 1 uses a trusted issuer** that learns *who is a member* but cannot link a *submission* to a member (it never sees the secret that derives the nullifier).

## Product in one sentence

*Verified, unlinkable, aggregate-only comp truth — one epoch, one submission per verified person.*

## Architecture

```
packages/contract   Compact source (candor.compact) + generated TS + vitest circuit suite
packages/shared     Cuts, buckets, hashing, k-gate logic
packages/issuer     Email verification → leaf insertion (only trusted component)
apps/web            Next.js-style public cut pages + guided contribute wizard (Vite + React)
```

**Ledger (Wave 1)**

- `members: Set<Bytes<32>>` — leaf = `persistentHash([pad(32,"candor:member:v1"), secret])`, insertion issuer-gated on-chain
- `nullifiers: Set<Bytes<32>>` — **epoch-scoped**: `persistentHash([pad(32,"candor:nf:v1"), epoch, secret])` — one per member per epoch
- `histogram: Map<Bytes<32>, Uint<64>>` — key = `persistentHash([cutKey, bucket])`
- `epochCount: Map<Bytes<1>, Uint<64>>` — readable epoch cell (issuer advances via `nextEpoch`)
- `issuer: Bytes<32>` — public commitment to the issuer's secret key

**Circuit `submit(cutKey, bucket)`**

1. Derive leaf from `secret()` witness, check `members.member(disclose(leaf))`
2. Read epoch from ledger, derive epoch nullifier, check not in `nullifiers`, insert
3. Bucket range check (`bucket < 10`), derive `bKey = persistentHash([cutKey, bucket])`, increment histogram
4. Only `cutKey` and `bucket` are disclosed; secret and exact salary stay private

**Circuit `enroll(memberLeaf)`** — issuer-gated: asserts `persistentHash([pad(32,"candor:issuer:v1"), issuerKey()]) == issuer` before inserting, so only the issuer key holder can mint members.

**Trust boundary (stated plainly)**

The issuer learns who is a member. It cannot compute nullifiers (never sees `secret`), so it cannot link a submission to a member. Wave 1 discloses the leaf to check membership — the specific member index is visible on-chain, but not the salary. Wave 2 replaces `Set` with `HistoricMerkleTree` + `merkleTreePathRoot` for fully private membership.

## Quick start

```bash
# install
pnpm install

# compile contract (requires compact 0.31.1, language 0.23)
pnpm contract:compile

# build all
pnpm build

# run web app (mock ledger demo, no chain required)
pnpm dev
# → http://localhost:5173

# run contract circuit tests (no network)
pnpm --filter @candor/contract test
```

### Midnight deployment (Preprod)

```bash
# 1. ensure local proof server is running
docker compose -f packages/contract/proof-server.yml up

# 2. configure wallet + deploy (uses Lace on Preprod)
pnpm --filter @candor/contract deploy:preprod
```

See `packages/contract/README.md` and `docs/DEPLOY.md`.

## Live on Preprod

Contract deployed and verified end-to-end:
`e7cf6ffc48ebeb450813104e6a5ab3d585f7e275bcd32e5ea82eb7a8c21dd53d`

Flow: connect Lace → issuer enrolls your membership leaf on-chain → you contribute a bucketed salary (ZK proof generated on your device) → the aggregate updates. See [docs/DEPLOY.md](docs/DEPLOY.md) and [CHANGELOG.md](CHANGELOG.md).

## Project status (honest, Wave 1 in progress)

| Piece | State |
|---|---|
| Compact contract (`candor.compact`, 0.31.1 / lang 0.23) | **Compiled** — circuits `submit`, `enroll`, `getHistogram`; proving keys in `src/managed/candor/` |
| Off-chain circuit + invariant tests | **Passing** (happy path, double-submit, non-member, bad bucket, histogram-not-sum leak regression) |
| Web app, mock ledger mode | **Working** — full browse → verify → contribute → percentile flow, no chain needed (`pnpm dev`) |
| Issuer service | **Demo mode** — verification codes returned in-band, no email infra, does not call `enroll` on-chain yet |
| Browser chain path (Lace + Midnight.js 4.1.1) | ✅ **End-to-end verified on Preprod** — deploy, enroll, submit all executed with real transactions; proofs generated on-device |
| CLI deploy (`deploy.ts`) | Stub — the browser Operator console is the Wave 1 deployment path |
| Demo video / pitch deck | **Not yet** — planned before the Sep 16 deadline |

- **In scope for Wave 1**: one epoch, USD only, engineering levels L3–L7, role × level × region cuts (no company), histogram buckets, epoch nullifier, k≥5 gate (UI-enforced), issuer service, web wizard, Preprod deployment.
- **Out of scope for Wave 1**: multi-issuer / zkEmail, employer product, monetization, equity valuation, multi-currency, mobile.

## Vision

Compensation is the last taboo number on the internet. The systems that answer it are
either gameable (self-reported), de-anonymizing (persistent handles), or employer-owned
(compliance tools workers never see). As work moves on-chain — salaries in stablecoins,
grants in tokens, DAOs hiring globally — the gap widens: **the on-chain workforce has no
truthful picture of what people like them earn.**

Candor is building that picture: compensation truth as a public good, produced by
verified workers, protected by zero-knowledge proofs, owned by no one. Workers free
forever; the data layer monetizes on the company side.

## Roadmap

**Wave 1 — the trusted slice (current, live on Preprod)**

- ✅ Compact contract deployed (`e7cf6f…53d`): verified membership, epoch nullifiers, aggregate-only histograms
- ✅ Full flow with real transactions: connect Lace → enroll → prove on-device → submit
- ✅ 15 cuts (engineering L3–L7 × 3 regions), k≥5 gate, percentile moment
- ✅ Circuit test suite incl. differential-leak regression; deploy walkthrough for evaluators
- ▶ Seeding sprint: one real community, one real epoch

**Wave 2 — trustless membership**

- ZK Merkle membership (`HistoricMerkleTree`) — no leaf disclosure on-chain at all
- Issuer federation — no single party controls enrollment; public leaf-log audit
- Historical epochs (trend lines: "how did this cut move in 6 months?")
- Company dimension once volume supports k-anonymity; percentiles + richer aggregates

**Wave 3 — scale**

- Mobile (Kuira SDK candidate) — prove and contribute from a phone
- zkEmail verification — remove the single trusted issuer entirely
- Employer-side surface — pay-band analytics with compliance-grade aggregates
- Token-comp modeling: grants, vesting, multi-currency

## Go-to-market

**Beachhead:** crypto-native ICs (1–10 yrs, remote, fiat + token comp). They already run
Lace, they negotiate in public markets, and every existing comp tool is blind to their
comp structure.

**Channels (in order):**

1. Midnight & Cardano Discords — the proving-required design is a feature for this crowd, not friction
2. Farcaster / crypto X — percentile moments are designed to be shared ("I'm in the 61st percentile, verified, anonymously")
3. DAO & protocol communities — one seeded community per epoch beats broad-and-empty

**Growth loop (cryptographic, not cosmetic):** one nullifier per verified person per epoch →
data goes stale quarterly → natural re-contribution triggers (reviews, offers, raises) →
give-to-get: contributing unlocks deeper cuts → more contributors → more cuts clear k → more value.

**Seeding plan (Wave 1):** a single community (one Discord/DAO), ~30 verified contributors,
one epoch, target: 3+ cuts clearing k≥5. The falsifier we're testing: verification starts
but nobody submits → proof friction is fatal; heavy reads and no contributions → the
unlinkability claim isn't believed.

## License

Apache-2.0
