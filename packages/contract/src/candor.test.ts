import { describe, it, expect } from "vitest";
import { Contract } from "./managed/candor/contract/index.js";
import { witnesses, type CandorPrivateState, createPrivateState } from "./witnesses.js";
import { createMockLedger, assertNoExactLeak } from "../../shared/src/mockLedger.js";

// Helper to run submit via generated Contract's impureCircuits for off-chain unit coverage.
// Falls back to mockLedger if managed code not yet compiled (e.g. in CI without compact).

function hasManagedContract(): boolean {
  try {
    const c = new Contract(witnesses);
    return typeof (c as any).impureCircuits?.submit === "function";
  } catch {
    return false;
  }
}

describe("Candor circuits (off-chain)", () => {
  it("mock ledger: happy path increments histogram", async () => {
    const { createMockLedger, enrollMember, submitContribution, histogramForCut } = await import("../../shared/src/mockLedger.js");
    const { bucketForSalary } = await import("../../shared/src/index.js");
    const ledger = createMockLedger();
    const secret = new Uint8Array(32).fill(7);
    await enrollMember(ledger, secret);
    const cut = { family: "engineering" as const, level: "L5" as const, region: "remote-us" as const };
    const bucket = bucketForSalary(160_000);
    const r = await submitContribution(ledger, secret, cut, bucket);
    expect(r.ok).toBe(true);
    const hist = histogramForCut(ledger, cut);
    expect(hist[bucket]).toBe(1);
  });

  it("rejects double-submit in same epoch (nullifier)", async () => {
    const { createMockLedger, enrollMember, submitContribution } = await import("../../shared/src/mockLedger.js");
    const ledger = createMockLedger();
    const secret = new Uint8Array(32).fill(11);
    await enrollMember(ledger, secret);
    const cut = { family: "engineering" as const, level: "L5" as const, region: "remote-us" as const };
    const first = await submitContribution(ledger, secret, cut, 5);
    expect(first.ok).toBe(true);
    const second = await submitContribution(ledger, secret, cut, 6);
    expect(second.ok).toBe(false);
    if (!second.ok) expect((second as any).reason).toMatch(/already submitted/);
  });

  it("rejects non-member", async () => {
    const { createMockLedger, submitContribution } = await import("../../shared/src/mockLedger.js");
    const ledger = createMockLedger();
    const secret = new Uint8Array(32).fill(99);
    const cut = { family: "engineering" as const, level: "L5" as const, region: "remote-us" as const };
    const r = await submitContribution(ledger, secret, cut, 5);
    expect(r.ok).toBe(false);
  });

  it("rejects out-of-range bucket", async () => {
    const { createMockLedger, enrollMember, submitContribution } = await import("../../shared/src/mockLedger.js");
    const ledger = createMockLedger();
    const secret = new Uint8Array(32).fill(13);
    await enrollMember(ledger, secret);
    const cut = { family: "engineering" as const, level: "L5" as const, region: "remote-us" as const };
    const r = await submitContribution(ledger, secret, cut, 10 as any);
    expect(r.ok).toBe(false);
  });

  it("differential-leak regression: histogram delta reveals only bucket index, never exact salary", async () => {
    const { createMockLedger, enrollMember, submitContribution } = await import("../../shared/src/mockLedger.js");
    const ledger = createMockLedger();
    // enroll two distinct members
    const s1 = new Uint8Array(32).fill(21);
    const s2 = new Uint8Array(32).fill(22);
    await enrollMember(ledger, s1);
    await enrollMember(ledger, s2);
    const cut = { family: "engineering" as const, level: "L5" as const, region: "remote-us" as const };
    const before = new Map(ledger.histogram);
    await submitContribution(ledger, s1, cut, 5);
    const after = new Map(ledger.histogram);
    expect(assertNoExactLeak(before, after)).toBe(true);
    // second submit increments a different bucket
    const before2 = new Map(ledger.histogram);
    await submitContribution(ledger, s2, cut, 7);
    const after2 = new Map(ledger.histogram);
    expect(assertNoExactLeak(before2, after2)).toBe(true);
    // total increments are bucket counts, not salary sums — cannot recover exact values
  });

  // If managed contract is available, smoke-test the impureCircuit path
  it.skipIf(!hasManagedContract())("generated Contract impureCircuits.submit enforces same rules", async () => {
    const c = new Contract(witnesses);
    const ps: CandorPrivateState = createPrivateState(new Uint8Array(32).fill(42));
    const cutKey = new Uint8Array(32).fill(1);
    // initial ledger state mirrors empty on-chain state
    const ctx: any = {
      privateState: ps,
      ledgerState: {
        members: new Set(),
        nullifiers: new Set(),
        histogram: new Map(),
        epoch: 1n,
        issuer: new Uint8Array(32),
      },
    };
    // This will fail membership check and throw — which is the expected behavior for non-member
    expect(() => (c as any).impureCircuits.submit(ctx, cutKey, 5)).toThrow();
  });
});
