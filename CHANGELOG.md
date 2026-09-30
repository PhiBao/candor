# Changelog

What's new in GotIt, organized by Buildathon wave. Written for everyone — judges,
contributors, and future team members.

> **Renamed from *Candor* to *GotIt* for Wave 2.** A different Wave 1 project was also
> called "Candor" (a proof-of-reserves product), so neither was findable. The old name
> survives in git history, in the deployed contract's `candor:*` hash domain strings
> (frozen — see README), and in the Fly app names (renaming an app destroys its URLs).

## Wave 2 · v0.4.0 — A new name, a new buyer, a real deliverable (2026-09-30)

- **Renamed Candor → GotIt.** A different Wave 1 project was also called "Candor", so neither
  was findable. Package scope, user-facing copy and storage keys renamed. The deployed
  contract's `candor:*` hash domain strings are **frozen** — they are inputs to contract
  `e7cf6ffc…dd53d`, so changing them would reject every prior member as "not a member".
- **The indexer moved under us and we caught it before the judges did.** The upstream we had
  been proxying (`blockfrost.lw.iog.io`) now answers `410 Gone — Midnight endpoints have been
  removed from this proxy`. Moved to the official `indexer.preprod.midnight.network` API v4 and
  verified end to end: the deployed contract reads back epoch 1 with 2 real submissions, no
  wallet required. If we had not restored the environment and clicked our own link, the app
  would have silently shown sample data while claiming to be live.
- **Restored the hosted environment** (all three Fly apps, 1 machine each) so the deliverable
  URL resolves for the first time since Wave 1 judging closed.

- **Repositioned to a named buyer with a deadline.** We were pitching "private comp data to
  crypto workers". Now: the Head of Total Rewards at a 150–2,500 person European company
  who must publish gender pay gap statistics by **7 June 2027** under Directive (EU) 2023/970,
  where an unjustified 5% gap triggers a joint pay assessment and the burden of proof shifts
  to the employer.
- **Built the Art. 9 report engine** (`packages/shared/src/paygap.ts`). Pure functions, no
  I/O, so a third party can re-run them against on-chain state and get byte-identical output.
  Emits the statistics the Directive actually names: mean and median gap, base versus
  variable pay, proportion receiving variable pay, and quartile distribution.
- **Means and gaps are intervals, not point estimates.** Bucketed data only bounds the truth.
  Quartiles and counts are exact. The report says so on its face.
- **The 5% materiality flag uses the bound nearest zero, not the midpoint.** A range of
  [−33%, +50%] has midpoint +8.3%, but its sign is not even provable — flagging it would
  trigger a joint pay assessment on a category that may be perfectly compliant.
- **Suppression is enforced on both sides of every comparison.** Publishing one side of a
  pay gap reveals the other by subtraction, so a one-sided row is a disclosure just as much
  as a small cell.
- **Shipped the compliance surface.** A report page and a public verification page, both
  reading live on-chain state. Every report carries a fingerprint over the exact bucket counts it
  was built from, and anyone can paste that fingerprint into the verify page to check the report
  against the chain — no wallet, no account. Neither page substitutes sample data for a failed
  read; they say so instead. On the current chain (2 submissions, 1 per group) the report
  correctly publishes nothing and states that nothing is publishable.
- **14 tests on the report data layer**, including that a fingerprint is order-independent, that
  it changes when any published count changes, and that the report can never emit a comparison
  the ledger does not support.
- **A pre-submission gate** (`pnpm check:submission`) that fails on empty or headings-only
  sections, a jargon tagline, too few tags, and missing links or community fields. It
  reports 21 errors against the real Wave 1 submission.
- **Published the Wave 1 post-mortem** (`docs/WAVE1-POSTMORTEM.md`), including the recovered
  judge data and the three self-inflicted defects that cost us the round.

### Fixed on the way

- `deploy/issuer.Dockerfile` still filtered the old `@candor/issuer` scope, so an image rebuild
  installed nothing and the issuer image failed its health check with an opaque
  "request canceled". The brand rename is now consistent across deploy files.

## Wave 1 · v0.3.1 — Hosting paused after judging (2026-09-30)

- **Zero compute cost.** The three hosted apps (web, issuer, proof server) were scaled to
  0 machines once Wave 1 judging closed. The public URLs return 503 until they are brought
  back; nothing else changed.
- **Nothing was lost.** The contract on Midnight Preprod
  (`e7cf6ffc…dd53d`) and all contributions made during the wave are untouched — only the
  servers that display them are off. Resume commands: `docs/DEPLOY.md` §8.
- **Pitch deck shipped:** `docs/GotIt-Pitch-Deck.pptx` (renamed to GotIt branding in Wave 2).

## Wave 1 · v0.3.0 — Live on Midnight Preprod (2026-08-28)

### 🎉 Headline

**Candor is live.** The full journey now runs on Midnight's public Preprod network with a
real wallet: deploy → verify → contribute anonymously → see your percentile. Every step
below shipped and was tested end-to-end with real transactions.

### New — what you can do now

- **Contribute for real.** Connect your Lace wallet, verify your work email, and submit a
  bucketed salary to a live on-chain contract. Your proof is generated on your own device.
- **Deploy & operate from the browser.** A new built-in Issuer Console lets the operator
  deploy the contract, enroll verified members, and start a new epoch — no command line.
- **Pick up where you left off.** Your secret key and session persist across page reloads;
  the app shows clear connection status (connected wallet, network, contract).
- **One-command local run.** `pnpm dev:all` starts the app and the verification service
  together; a full deployment walkthrough is in `docs/DEPLOY.md`.

### Fixed — trust & reliability

- **One contribution per person per epoch is now truly enforced** — previously a member
  could theoretically bypass the limit; the rule is now airtight and resets each epoch.
- **Only the issuer can add members** — a bug that would have allowed anyone to mint
  fake memberships was closed; minting now requires the issuer's cryptographic approval.
- **Smoother wallet connection** — Lace is now detected reliably (including when the
  extension loads late), with clear status feedback at every step and simple recovery
  when a wallet is missing.
- **Fewer dead ends.** Fixed a series of browser-environment issues (missing browser
  compatibility shims, stale cached data, misconfigured endpoints) that could cause a
  blank page or a failed transaction; the app now guides you past each one.
- **Clearer errors.** When something fails (for example, not enough tDUST), the message
  now tells you what to do instead of showing a raw technical error.

### For evaluators

- Compiled contract artifacts are committed — run the demo without installing Midnight's compiler.
- `docs/DEPLOY.md` covers the full Preprod path, including generating tDUST from tNIGHT.

## Wave 1 · v0.2.0 — Hardened foundations (2026-08-27)

### New

- **A 13-test verification suite** that exercises the real contract logic (the same
  program the chain runs) without needing a network — covering the happy path, and
  proving that the system rejects double submissions, unverified members, and invalid inputs.
- **A privacy regression test** that watches the public data after every contribution and
  confirms it never reveals an individual salary — only a bucket index.

### Fixed

- The project is licensed **Apache-2.0** (per Buildathon requirements) with a clean,
  reviewable commit history and an honest README status table.

## Wave 1 · v0.1.0 — First working product (2026-08-27)

### New

- **The Candor concept, working end-to-end in demo mode**: browse salary distributions by
  role, level, and region (15 cuts) — no wallet needed to read.
- **Anonymous contribution flow** in four steps: verify email → describe your role → see
  your bucket → submit. Locked cuts unlock when the community contributes — give-to-get.
- **The percentile moment**: after contributing, you see where you stand in your cut,
  designed to be shared.
- **Verification service** with an append-only, privacy-preserving audit log
  (emails are never stored in full) and rate limits per email per epoch.
- Product documentation: specification, security model, and demo guide.
