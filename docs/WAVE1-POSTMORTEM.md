# Wave 1 Post-Mortem — how we scored 0 of 159

**Date:** 30 September 2026 · **Result:** 0 points, no funding, 7 winners from 159 submissions.

This document exists because the failure was not obvious and we intend not to repeat it. It is
also the evidence base for the Wave 2 repositioning.

## What the field looked like

Data below is read from the AKINDO public API for the Midnight Buildathon, not from memory.

| | |
|---|---|
| Wave 1 submissions | **159** |
| Funded | **7** (4.4%) |
| Points awarded | 30, 23, 16, 10, 9, 6, 6 = **100** total |
| Grant pool | $3,500 → **$35 per point** |
| Winning score range | 6–30 points |

Judges' feedback is only published for funded teams, so our own score is unknowable. The
recovered data shows what the winners did differently.

## It was not duplication

24 of 159 submissions sat in salary / comp / payroll territory, 41 in privacy-preserving
data, 106 mentioned identity or credentials. Crowded — but **not closed**:

> **Equilux — "Prove the pay gap. Reveal no one's salary." — funded, 6 points.**

That is the *lowest* score of any funded team, in our exact problem space. The judge's note:

> "The EU pay-transparency law forces companies with 250+ employees to publish verifiable
> pay-gap figures starting 7 June 2027, a hard deadline with fines, and the pitch fits in one
> sentence."

A named buyer, a dated legal deadline, and eight words.

Separately: **a second Wave 1 project was also called "Candor"** (a proof-of-reserves
product). Two identical names, neither findable. That is why the product was renamed to
**GotIt** for Wave 2.

## It was not the build

The judges' feedback contains machine-worded lines that read as automated repository
analysis. Our repo satisfied every one:

| Automated judge line | Our repo |
|---|---|
| "Your contract compiled cleanly … and defines N circuits" | `candor.compact`, 5 circuits, zkir + keys committed |
| "You implemented genuine private state with a witnesses.ts and a commitment/hash" | `packages/contract/src/witnesses.ts` |
| "Your tests exercise the contract through a simulator and assert real state" | `candor.test.ts` runs the generated contract |
| "A react frontend is present … calls the contract and reads on-chain state back" | `apps/web` + `chainRead.ts` |
| "A deployed contract address is documented" | `e7cf6ffc…dd53d` in the submission |

Two *funded* teams had no runnable frontend and no contract tests (PollPower, 30 pts;
GYOTAK, 16 pts). The build bar was not the discriminator.

## What actually cost us

### 1. The "Challenges I ran into" section shipped empty

120 of 159 submissions had a Challenges section. **Ours was the only one where the section was
headings with no explanation under any of them:**

```
1. **Verified + unlinkable + one-per-epoch on Compact 0.31.1.**
2. **Hash parity between TS and circuit.**
3. **Browser wiring for Midnight.js 4.1.1.**
4. **Hosted vs. local proving.**
5. **Credibility under failure.**
```

Not a paste error — the source file at HEAD was missing the bodies too. In the one section
where a judge looks for evidence that you hit real walls, we shipped five empty promises.

### 2. The community profile was a placeholder

| Field | Us | 7 winners | Other 152 |
|---|---|---|---|
| Community website | **none** | 7/7 | 105/152 |
| Social links | **none** | 6/7 | 88/152 |
| Name / bio | *"chill but cool."* | real companies & teams | — |
| Members | 1 | 2/7 multi | 9/152 multi |

Every funded team had a real presence: a registered company already trading on mainnet, an
industry team already inside its customers' workflow, a foundation with Discord and X, work
formally submitted to a regulator.

### 3. One tag, filed in the wrong bucket

Field median was 5 tags; winners' median was 6. We tagged only `TypeScript` — no `Midnight`,
no `Compact`, no `Zero-Knowledge Proofs` — so we were not discoverable as a ZK project, and
we were filed under `Privacy` (the most crowded category) plus a category that did not exist.

### 4. Jargon instead of a promise

| | Tagline |
|---|---|
| Us | *"Verified, unlinkable, aggregate-only comp truth. One epoch, one submission per verified person."* (95 chars, four abstract nouns) |
| Equilux | *"Prove the pay gap. Reveal no one's salary."* (42 chars) |

### 5. A changelog submitted as a pitch

Our wave comment led with `epochCount` readable cell, `POST /enroll` idempotent
(`409 → 200 already:true`), `pnpm overrides` for runtime dedupe, wasm bundle 909→614KB. The
Communication points in this wave went to submissions where the judge wrote *"I truly felt
your sense of mission"*.

### 6. Channels where a buyer should have been

Our GTM paragraph listed *channels* — "Midnight/Cardano Discords, Farcaster, crypto Twitter".
Every funded team named a *buyer, regulator, or existing business*. One judge wrote: *"The
presentation would be even better if it made it clearer who stands to benefit."*

## Hygiene scorecard (our proxy, not the judges' score)

We scored all 159 submissions on 15 things visible on the AKINDO page (website, socials, tag
count, Midnight/Compact/ZK tags, video, deck, deployed address, description length, team
size). We got **5/15, proxy rank 95/159**; the top-30 proxy cut was 9/15.

**Caveat, and it matters:** this proxy does not predict winning. Gyotak was funded with a
proxy of 6, Equilux with 5, PollPower with 7 — while 20+ unfunded teams scored 10–12. Page
hygiene gets a submission *seen*. The points came from Product, Communication and Business,
judged by a human on positioning.

## What we changed

| Defect | Fix |
|---|---|
| Empty Challenges section | `scripts/check-submission.mjs` fails any headings-only section, empty section, or under-length section. Verified against the real Wave 1 draft: 21 errors. |
| Placeholder community | `community_name` / `community_site` / `community_x` / `community_discord` are now required frontmatter. |
| One tag, wrong category | Tag and category checks are enforced; `Midnight`, `Compact`, `Zero-Knowledge Proofs` are mandatory. |
| Jargon tagline | Tagline capped at 70 characters with a jargon blocklist and a concreteness check. |
| Changelog as pitch | Engineering detail moved to an appendix; the surface leads with user, problem, proof, ask. |
| Unnamed buyer | Repositioned to a named buyer with a dated legal deadline: Art. 9, first reports 7 June 2027. |
| Name collision | Renamed **Candor → GotIt**. |
| No real deliverable | Built the Art. 9 report engine (38 tests) instead of another mock. |

Run the check before any submission:

```bash
pnpm check:submission
```

## What we would tell our Wave 1 selves

The product was roughly right and the pitch was not. We spent the wave proving we could build
a ZK contract and left the part judges actually score — a named buyer, a one-sentence promise,
a profile that looks like a company — until the last day, then submitted it unfinished. Build
first is correct advice for week one. It is not an excuse for week three.
