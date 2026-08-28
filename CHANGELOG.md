# Changelog

What's new in Candor, organized by Buildathon wave. Written for everyone — judges,
contributors, and future team members.

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
