# GotIt — Product Specification (Wave 2)

> Supersedes the Wave 1 spec, which targeted crypto-native workers. That positioning lost
> Wave 1 (0 of 159) for want of a named buyer — see [WAVE1-POSTMORTEM.md](WAVE1-POSTMOSTEM.md).
> The technical core is unchanged and still live; the buyer, the surface and the reporting
> model are what moved.

## 1. Core user

**The Head of Total Rewards (or People Analytics / Compliance) at a 150–2,500 person
European company.** They own the gender pay gap filing that lands on their desk every June,
they are measured on it, and today they produce it by exporting a spreadsheet and deleting
the rows with three people in them.

Secondary user, and the one who supplies the data: **the employee**, who is legally
individually identifiable in any small enough group and has every reason to refuse.

The employee is not a "beachhead segment" to be courted. They are a counterparty whose
consent we cannot manufacture, and the whole product has to be designed around the fact that
participation is voluntary.

## 2. Job-to-be-done

> "When the pay gap report is due, I want to publish a number I can defend to a works council,
> an equality body and eventually a court, without exposing any individual employee — because
> the burden of proof is now mine, and a spreadsheet is not evidence."

Functional: a filing that survives scrutiny. Emotional: not being the person who signed it.
Social: not being the person who leaked someone's salary.

## 3. Why ZK, specifically

The regulation creates a genuine conflict: **publish group statistics** (Art. 9) versus
**protect individuals** (GDPR data minimisation, Art. 5(1)(c)). Aggregate statistics
re-identify people at small group sizes — the well-known failure of the "anonymised" CSV, and
the reason a published quartile table for a 12-person team is a privacy incident, not a
compliance win.

Three things must be simultaneously true, and no spreadsheet satisfies more than one:

| | Proves the data came from real employees | Proves nobody was double-counted | No individual is identifiable |
|---|---|---|---|
| Payroll export | ✗ | ✗ | ✗ (it *is* the records) |
| HR survey | ✗ gameable | ✗ | ✗ uneven participation |
| Employer attestation | ✗ it's a promise | ✗ | depends on trust |
| **GotIt** | **✓** | **✓** | **✓ enforced in-circuit** |

Critically, the employee must also be able to verify *their own* input was included and
counted exactly once, without the employer learning who they are. That last property is what
makes voluntary participation rational, and it is the thing only ZK gives us.

## 4. Main user journey

**Employee (contributor):** verify work email → code confirmation (32-byte secret generated
and stored on their device; the issuer inserts a leaf and never sees the secret) → connect
Lace → enter job category, gender, base pay, variable pay (one question per screen) → the
client derives buckets, builds the membership proof and epoch nullifier, proves locally →
submit → "Recorded. Nobody can link this to you."

**Compliance officer (reader):** open the report for a period → see each job category's
headcount, mean/median gap, base-vs-variable split, quartile boundaries, and any gap flagged
at the 5% Art. 9(4) threshold → download the markdown/JSON artifact with its disclosure notes
→ send the verification link to a works council or auditor.

**Third party (verifier):** open the verification page with the report hash → see that it
matches chain state, that every participant was an attested employee, and that no cell below
the anonymity threshold was published — without learning any individual's pay.

## 5. Activation moment

**"Your report is ready, and here's the link you can send to your works council."** The
employee-side activation is secondary: *"Your number is in. Here's what it says about your
category."*

The primary moment moved deliberately. In Wave 1 it was a percentile — a personal payoff for a
worker. In Wave 2 it is a *defensible artifact*, because that is what the buyer is measured
on.

## 6. Retention loop

Cryptographic, not cosmetic: the epoch-scoped nullifier is one submission per verified person
per reporting period. A new period makes everyone re-eligible.

- Natural triggers align with the calendar: annual reporting, compensation review cycles
- Pull: "a gap in Support crossed 5% — a joint pay assessment may be triggered"
- Give-to-get: contributing keeps your category publishable; a category that drops below the
  anonymity threshold goes dark for everyone in it
- Compounding: more employees → more categories clear the threshold → more useful report

## 7. Product differentiation

- Equilux (Wave 1, funded): same problem, framed as EU compliance, 12 circuits. Its judge
  wrote that it *"has to become a plugin for [Workday, Personio, Big Four] rather than a
  standalone app."* Wave 3 answers that with a read-only payroll connector.
- Existing payroll / survey tools: unauthenticated or gameable, and they publish or protect,
  never both.
- **GotIt: proven, unlinkable, and suppressible** — the suppression is enforced on-chain, so
  the employer cannot leak a small cell even by accident or by policy override.

## 8. Interface model

Not a dashboard. Three surfaces, each with a single dominant object:

- **Report surface:** one page per period. The object is the report — the thing that gets
  filed. Shareable, linkable, indexable.
- **Verification surface:** one page per report hash. The object is the proof. No wallet.
- **Contribute surface:** 4-step wizard, one question per screen, plain-language privacy note
  at each cryptographic step.

No accounts by design — no identity to leak.

## 9. Reporting model (the Wave 2 deliverable)

Directive (EU) 2023/970 Art. 9, first reports due **7 June 2027** for employers with 150+
workers (250+ annually; 150–249 every three years; 100–149 from 2031):

| Art. 9(1) requirement | GotIt output | Exactness |
|---|---|---|
| (a) gender pay gap | interval | bounded |
| (b) gap in complementary/variable components | interval, per component | bounded |
| (c) median gender pay gap | interval | bounded |
| (d) median gap, variable components | interval | bounded |
| (e) proportion receiving variable pay | exact | exact |
| quartile distribution | exact boundaries | exact |
| headcounts | exact | exact |

Two honesty rules that the code enforces rather than the docs:

- **Means and gaps are intervals.** Bucketed data only bounds the true value. Reporting a
  point estimate would be a rounding error dressed as a statistic.
- **Materiality uses the bound nearest zero, not the midpoint.** A range of [−33%, +50%] has
  midpoint +8.3%, but the sign is not provable. Flagging it would trigger a joint pay
  assessment on a category that may be compliant, so only a *proven* disparity of 5% counts.

**Disclosure control is two-sided.** Publishing one side of a comparison reveals the other by
subtraction, so a row is withheld unless *both* groups clear the threshold.

## 10. MVP scope and non-goals

**In (Wave 2):** the report engine (`packages/shared/src/paygap.ts`, done — 38 tests), the
report surface, the verification page, suppression tuned to the Directive's category model,
employer-facing flow, hosted environment restored so the deliverable URL resolves.

**Out (Wave 2):** HRIS integration, zkEmail, multi-entity federation, mobile, direct filing
with the authority, equity/vesting valuation, non-EU regimes (US EO 14173 and state laws are
Wave 3 — note EO 14173 is back in force after the Fourth Circuit vacated its injunction in
Feb 2026, so that market re-opened).

## 11. Architecture

```
packages/contract   Compact source + generated TS + vitest circuit suite (13 tests)
packages/shared     cuts, buckets, hashing, k-gate, Art. 9 report engine (38 tests)
packages/issuer     email code → leaf insertion, append-only log, rate limits
apps/web            Vite + React: report surface + verification page + wizard
```

**Ledger (unchanged, live on Preprod at `e7cf6ffc…dd53d`):** `members: Set<Bytes<32>>`,
`nullifiers: Set<Bytes<32>>` (epoch-scoped), `histogram: Map<Bytes<32>, Uint<64>>`,
`epochCount: Map<Bytes<1>, Uint<64>>`, `issuer: Bytes<32>`.

> The `candor:*` domain strings are **frozen** — they are inputs to the deployed contract's
> hash derivations. The product was renamed to GotIt; these move only on redeploy.

**Trust boundary:** the issuer learns who is a member and cannot link a submission to a
member, because it never sees the secret that derives the nullifier. Wave 1 discloses the leaf
for `Set` membership; Wave 3 replaces that with `HistoricMerkleTree` + `merkleTreePathRoot`
so no company learns its own employees' salaries even to verify them.

## 12. Validation metrics

Thesis: a compliance officer will prefer a report they can defend to one they can produce.

- **Report generated without a manual spreadsheet step** — the primary success signal
- **Categories cleared by participation** — is voluntary coverage enough to be publishable?
- **Verification page used by a third party** — does anyone outside the company actually check?
- **Verbatim: would you file this instead of your spreadsheet?** — the question that matters
- **Pilot LOIs signed** — 3–5 European companies by 19 Oct

Falsifiers: officers like the concept but won't move a payroll process for it → the HRIS
connector is the whole product, not a Wave 3 nice-to-have; coverage too low to clear
thresholds → the category model is wrong, not the cryptography; verifiers find the artifact
insufficient evidence → the report needs a regulator-accepted format.

## 13. Security and failure considerations

**Privacy:** suppression enforced on both sides of every comparison; the differential-leak
regression test asserts that summing published buckets never reveals an exact salary
(the histogram is not a sum); participation is voluntary and participation counts are shown
on the report's face so incomplete coverage is visible rather than hidden; secret loss is
unrecoverable by design and must surface in the UI; proof server must be user-local, hosted
proving permanently rejected as a privacy guarantee.

**Integrity:** the issuer is the residual trusted component and can mint fake members —
mitigated by a public append-only leaf log and per-period caps; full removal is Wave 3. ZK
proves a bucket range, not honesty, so the guarantee is *one submission per verified person
per period*, not truth.

**Legal:** GotIt produces the auditable artifact a filing is built from. It does not file, and
it is not legal advice. Member States transpose the Directive independently and several have
delayed to 1 January 2027, so thresholds and formats vary by country — the report labels which
regime it targets.

---

### Wave plan

**Wave 1 (done, 0 points):** narrow worker-facing flow, live on Preprod, 7 of 159 funded.
Full analysis in [WAVE1-POSTMORTEM.md](WAVE1-POSTMORTEM.md).

**Wave 2 (current, due 19 Oct 2026):** the Art. 9 report, the verification page, the
employer-facing surface, and named pilots.

**Wave 3:** trustless membership (`HistoricMerkleTree`), a read-only payroll connector for
the exports companies already have, and US coverage (EO 14173 + state laws).
