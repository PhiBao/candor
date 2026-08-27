import { describe, it, expect } from "vitest";
import {
  createConstructorContext,
  createCircuitContext,
  dummyContractAddress,
} from "@midnight-ntwrk/compact-runtime";
import { Contract } from "./managed/candor/contract/index.js";
import { witnesses, createPrivateState, type CandorPrivateState } from "./witnesses.js";
import { memberLeaf, issuerCommitment, cutKeyBytes, bytesToHex } from "@candor/shared/hash";
import {
  createMockLedger,
  enrollMember,
  submitContribution,
  nextEpoch,
  histogramForCut,
  assertNoExactLeak,
} from "@candor/shared/mockLedger";
import { bucketForSalary, cutKeyString, type Cut } from "@candor/shared";

// ---- harness ---------------------------------------------------------------
// Runs the GENERATED contract circuits against a simulated ContractState — no
// proof server, no node, but exact circuit semantics (the same ledger program
// the chain executes, minus the zk proof).

const COIN_PK = { bytes: new Uint8Array(32) }; // EncodedCoinPublicKey
const CUT: Cut = { family: "engineering", level: "L5", region: "remote-us" };
const KEY = cutKeyBytes(cutKeyString(CUT));

function secret32(n: number): Uint8Array {
  return new Uint8Array(32).fill(n);
}

function nextCtx(ps: CandorPrivateState, prev: { context: { currentQueryContext: { state: unknown } } }) {
  return createCircuitContext(dummyContractAddress(), COIN_PK, prev.context.currentQueryContext.state as any, ps);
}

/**
 * Impure circuit calls do NOT mutate the input state in place — the updated
 * ledger state is returned inside `results.context`. The harness therefore
 * threads the returned state through every call.
 */
function deployCandor(userSecret: Uint8Array, issuerKey: Uint8Array) {
  const ps = createPrivateState(userSecret);
  const issuerPs = createPrivateState(userSecret, issuerKey);
  const contract = new Contract<CandorPrivateState>(witnesses);
  const res = contract.initialState(createConstructorContext(ps, COIN_PK), issuerCommitment(issuerKey));
  let state = res.currentContractState;

  const run = (fn: (ctx: any) => any, who: "user" | "issuer") => {
    const ctx = createCircuitContext(dummyContractAddress(), COIN_PK, state, who === "issuer" ? issuerPs : ps);
    const r = fn(ctx);
    state = r.context.currentQueryContext.state;
    return r;
  };

  return {
    contract,
    asIssuer: (fn: Parameters<typeof run>[0]) => run(fn, "issuer"),
    asUser: (fn: Parameters<typeof run>[0]) => run(fn, "user"),
    state: () => state,
  };
}

// ---- generated-circuit tests ----------------------------------------------

describe("candor circuits (generated Compact, off-chain simulation)", () => {
  it("happy path: enroll → submit increments exactly one bucket by 1", () => {
    const c = deployCandor(secret32(42), secret32(1));

    c.asIssuer((ctx) => c.contract.impureCircuits.enroll(ctx, memberLeaf(secret32(42))));
    c.asUser((ctx) => c.contract.impureCircuits.submit(ctx, KEY, 5n));

    expect(
      c.asUser((ctx) => c.contract.impureCircuits.getHistogram(ctx, KEY, 5n)).result,
    ).toBe(1n);
    expect(
      c.asUser((ctx) => c.contract.impureCircuits.getHistogram(ctx, KEY, 6n)).result,
    ).toBe(0n);
  });

  it("rejects double-submit in same epoch, allows again after nextEpoch", () => {
    const c = deployCandor(secret32(42), secret32(1));

    c.asIssuer((ctx) => c.contract.impureCircuits.enroll(ctx, memberLeaf(secret32(42))));
    c.asUser((ctx) => c.contract.impureCircuits.submit(ctx, KEY, 5n));

    // same epoch, different bucket → epoch nullifier collides
    expect(() => c.asUser((ctx) => c.contract.impureCircuits.submit(ctx, KEY, 6n))).toThrow(
      /already submitted/,
    );

    // issuer advances epoch → member is eligible again
    c.asIssuer((ctx) => c.contract.impureCircuits.nextEpoch(ctx));
    c.asUser((ctx) => c.contract.impureCircuits.submit(ctx, KEY, 7n));

    expect(
      c.asUser((ctx) => c.contract.impureCircuits.getHistogram(ctx, KEY, 5n)).result,
    ).toBe(1n);
    expect(
      c.asUser((ctx) => c.contract.impureCircuits.getHistogram(ctx, KEY, 7n)).result,
    ).toBe(1n);
  });

  it("rejects non-member submit", () => {
    const c = deployCandor(secret32(42), secret32(1));
    c.asIssuer((ctx) => c.contract.impureCircuits.enroll(ctx, memberLeaf(secret32(42))));

    const outsiderPs = createPrivateState(secret32(99));
    expect(() =>
      c.asUser((ctx) => {
        const outsiderCtx = createCircuitContext(
          dummyContractAddress(),
          COIN_PK,
          ctx.currentQueryContext.state,
          outsiderPs,
        );
        return c.contract.impureCircuits.submit(outsiderCtx, KEY, 5n);
      }),
    ).toThrow(/not a member/);
  });

  it("rejects out-of-range bucket", () => {
    const c = deployCandor(secret32(42), secret32(1));
    c.asIssuer((ctx) => c.contract.impureCircuits.enroll(ctx, memberLeaf(secret32(42))));
    expect(() => c.asUser((ctx) => c.contract.impureCircuits.submit(ctx, KEY, 10n))).toThrow(
      /bucket out of range/,
    );
  });

  it("rejects enroll and nextEpoch from a non-issuer key", () => {
    const c = deployCandor(secret32(42), secret32(1));

    const fakePs = createPrivateState(secret32(42), secret32(77)); // wrong issuer key
    expect(() =>
      c.asIssuer((ctx) => {
        const fakeCtx = createCircuitContext(
          dummyContractAddress(),
          COIN_PK,
          ctx.currentQueryContext.state,
          fakePs,
        );
        return c.contract.impureCircuits.enroll(fakeCtx, memberLeaf(secret32(42)));
      }),
    ).toThrow(/not the issuer/);
    expect(() =>
      c.asIssuer((ctx) => {
        const fakeCtx = createCircuitContext(
          dummyContractAddress(),
          COIN_PK,
          ctx.currentQueryContext.state,
          fakePs,
        );
        return c.contract.impureCircuits.nextEpoch(fakeCtx);
      }),
    ).toThrow(/not the issuer/);
  });

  it("hash parity: TS-derived leaf/commit must match circuit-derived values", () => {
    // If shared/src/hash.ts pad/hash semantics drift from the circuit, the
    // enroll leaf won't be recognized and submit will fail with "not a member".
    const c = deployCandor(secret32(42), secret32(1));
    c.asIssuer((ctx) => c.contract.impureCircuits.enroll(ctx, memberLeaf(secret32(42))));
    expect(() => c.asUser((ctx) => c.contract.impureCircuits.submit(ctx, KEY, 5n))).not.toThrow();
  });

  it("hash parity: TS issuerCommitment is accepted as the constructor commit", () => {
    // deployCandor itself passes issuerCommitment(issuerKey) to initialState and
    // enroll authenticates against it — reaching here without "not the issuer"
    // proves TS and circuit issuer-commit derivations agree.
    const c = deployCandor(secret32(42), secret32(1));
    c.asIssuer((ctx) => c.contract.impureCircuits.enroll(ctx, memberLeaf(secret32(42))));
    expect(bytesToHex(memberLeaf(secret32(42))).length).toBe(64);
  });
});

// ---- mock-ledger tests (mirror v2 semantics) --------------------------------

describe("candor mock ledger", () => {
  it("happy path increments histogram", () => {
    const ledger = createMockLedger();
    const secret = secret32(7);
    enrollMember(ledger, secret);
    const bucket = bucketForSalary(160_000);
    const r = submitContribution(ledger, secret, CUT, bucket);
    expect(r.ok).toBe(true);
    const hist = histogramForCut(ledger, CUT);
    expect(hist[bucket]).toBe(1);
  });

  it("rejects double-submit in same epoch, allows after nextEpoch", () => {
    const ledger = createMockLedger();
    const secret = secret32(11);
    enrollMember(ledger, secret);
    expect(submitContribution(ledger, secret, CUT, 5).ok).toBe(true);
    const second = submitContribution(ledger, secret, CUT, 6);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toMatch(/already submitted/);
    nextEpoch(ledger);
    expect(submitContribution(ledger, secret, CUT, 6).ok).toBe(true);
  });

  it("rejects non-member", () => {
    const ledger = createMockLedger();
    const r = submitContribution(ledger, secret32(99), CUT, 5);
    expect(r.ok).toBe(false);
  });

  it("rejects out-of-range bucket", () => {
    const ledger = createMockLedger();
    const secret = secret32(13);
    enrollMember(ledger, secret);
    expect(submitContribution(ledger, secret, CUT, 10).ok).toBe(false);
    expect(submitContribution(ledger, secret, CUT, -1).ok).toBe(false);
  });

  it("differential-leak regression: delta reveals only bucket index", () => {
    const ledger = createMockLedger();
    enrollMember(ledger, secret32(21));
    enrollMember(ledger, secret32(22));
    const before = new Map(ledger.histogram);
    submitContribution(ledger, secret32(21), CUT, 5);
    expect(assertNoExactLeak(before, new Map(ledger.histogram))).toBe(true);
    const before2 = new Map(ledger.histogram);
    submitContribution(ledger, secret32(22), CUT, 7);
    expect(assertNoExactLeak(before2, new Map(ledger.histogram))).toBe(true);
  });

  it("canonical hashing is deterministic and cut keys are distinct", () => {
    const ck1 = bytesToHex(cutKeyBytes("engineering:L5:remote-us"));
    expect(ck1).toBe(bytesToHex(cutKeyBytes("engineering:L5:remote-us")));
    expect(ck1).not.toBe(bytesToHex(cutKeyBytes("engineering:L5:remote-eu")));
  });
});
