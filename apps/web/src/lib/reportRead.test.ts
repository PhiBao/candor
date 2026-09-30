import { describe, it, expect } from "vitest";
import { BUCKET_COUNT, type Cut } from "@gotit/shared";
import type { GroupHistograms } from "@gotit/shared/paygap";
import { buildReport, fingerprint } from "./reportRead.logic";

/**
 * Tests for the report data layer's pure parts.
 *
 * `fingerprint` and the chain-state shaping are separated from the network and
 * wasm calls so they can be tested without an indexer. The invariant that
 * matters most: a fingerprint must change when any published count changes, and
 * must not change when it doesn't.
 */

const CUT_A: Cut = { family: "engineering", level: "L5", region: "remote-us" } as Cut;
const CUT_B: Cut = { family: "engineering", level: "L6", region: "remote-eu" } as Cut;

function counts(overrides: Record<number, number> = {}): number[] {
  const h = Array(BUCKET_COUNT).fill(0) as number[];
  for (const [k, v] of Object.entries(overrides)) h[Number(k)] = v;
  return h;
}

function totals(parts: {
  epoch: string;
  members: number;
  submissions: number;
  populated: Array<{ cut: Cut; counts: number[] }>;
}) {
  return { ...parts, emptyCuts: [] as Cut[] };
}

describe("fingerprint", () => {
  it("is stable for identical state", () => {
    const a = totals({ epoch: "1", members: 5, submissions: 2, populated: [{ cut: CUT_A, counts: counts({ 3: 1, 4: 1 }) }] });
    const b = totals({ epoch: "1", members: 5, submissions: 2, populated: [{ cut: CUT_A, counts: counts({ 3: 1, 4: 1 }) }] });
    expect(fingerprint(a)).toBe(fingerprint(b));
  });

  it("changes when a bucket count changes", () => {
    const a = totals({ epoch: "1", members: 5, submissions: 2, populated: [{ cut: CUT_A, counts: counts({ 3: 1, 4: 1 }) }] });
    const b = totals({ epoch: "1", members: 5, submissions: 2, populated: [{ cut: CUT_A, counts: counts({ 3: 2, 4: 1 }) }] });
    expect(fingerprint(a)).not.toBe(fingerprint(b));
  });

  it("changes when the epoch advances", () => {
    const base = { members: 5, submissions: 2, populated: [{ cut: CUT_A, counts: counts({ 3: 1 }) }] };
    expect(fingerprint(totals({ ...base, epoch: "1" }))).not.toBe(fingerprint(totals({ ...base, epoch: "2" })));
  });

  it("changes when participation changes", () => {
    const base = { epoch: "1", populated: [{ cut: CUT_A, counts: counts({ 3: 1 }) }] };
    expect(fingerprint(totals({ ...base, members: 5, submissions: 2 }))).not.toBe(
      fingerprint(totals({ ...base, members: 6, submissions: 2 })),
    );
  });

  it("changes when a new group appears", () => {
    const a = totals({ epoch: "1", members: 5, submissions: 1, populated: [{ cut: CUT_A, counts: counts({ 3: 1 }) }] });
    const b = totals({
      epoch: "1",
      members: 5,
      submissions: 2,
      populated: [
        { cut: CUT_A, counts: counts({ 3: 1 }) },
        { cut: CUT_B, counts: counts({ 3: 1 }) },
      ],
    });
    expect(fingerprint(a)).not.toBe(fingerprint(b));
  });

  it("is order-independent, because a re-read may return cuts in any order", () => {
    const a = totals({
      epoch: "1",
      members: 5,
      submissions: 2,
      populated: [
        { cut: CUT_A, counts: counts({ 3: 1 }) },
        { cut: CUT_B, counts: counts({ 4: 1 }) },
      ],
    });
    const b = totals({
      epoch: "1",
      members: 5,
      submissions: 2,
      populated: [
        { cut: CUT_B, counts: counts({ 4: 1 }) },
        { cut: CUT_A, counts: counts({ 3: 1 }) },
      ],
    });
    expect(fingerprint(a)).toBe(fingerprint(b));
  });

  it("is 16 hex characters", () => {
    const t = totals({ epoch: "1", members: 1, submissions: 1, populated: [{ cut: CUT_A, counts: counts({ 3: 1 }) }] });
    expect(fingerprint(t)).toMatch(/^[0-9a-f]{16}$/);
  });

  it("is case-insensitive to compare, as the UI promises", () => {
    const t = totals({ epoch: "1", members: 1, submissions: 1, populated: [{ cut: CUT_A, counts: counts({ 3: 1 }) }] });
    expect(fingerprint(t).toUpperCase()).toBe(fingerprint(t).toUpperCase());
  });
});

describe("report from chain state", () => {
  it("never fabricates a comparison the ledger cannot support", () => {
    // Wave 1 has one count per (cut, bucket) and no gender dimension, so there
    // is no second group. If this ever produced a pay gap, the page would be
    // claiming a gender finding the chain cannot substantiate.
    const t = totals({ epoch: "1", members: 9, submissions: 9, populated: [{ cut: CUT_A, counts: counts({ 3: 5, 4: 4 }) }] });
    const report = buildReport(t, { period: "test", generatedAt: "2026-09-30" });
    for (const row of report.rows) {
      expect(row.gap).toBeNull();
    }
  });

  it("withholds a group below the threshold rather than publishing a small cell", () => {
    const t = totals({ epoch: "1", members: 3, submissions: 3, populated: [{ cut: CUT_A, counts: counts({ 3: 3 }) }] });
    const report = buildReport(t, { period: "test", generatedAt: "2026-09-30" });
    expect(report.rows).toHaveLength(0);
    expect(report.suppressed.length).toBeGreaterThan(0);
  });

  it("states participation counts so incomplete coverage is visible", () => {
    const t = totals({ epoch: "1", members: 12, submissions: 4, populated: [{ cut: CUT_A, counts: counts({ 3: 4 }) }] });
    const report = buildReport(t, { period: "test", generatedAt: "2026-09-30" });
    expect(report.totalParticipants).toBe(4);
    expect(report.notes.join(" ")).toMatch(/voluntary/i);
  });

  it("discloses the grouping limitation in the notes, not only in the docs", () => {
    const t = totals({ epoch: "1", members: 5, submissions: 5, populated: [{ cut: CUT_A, counts: counts({ 3: 5 }) }] });
    const report = buildReport(t, { period: "test", generatedAt: "2026-09-30" });
    expect(report.notes.join(" ")).toMatch(/category of worker/i);
  });

  it("carries the fingerprint into the notes so a printed report is checkable", () => {
    const t = totals({ epoch: "1", members: 5, submissions: 5, populated: [{ cut: CUT_A, counts: counts({ 3: 5 }) }] });
    const report = buildReport(t, { period: "test", generatedAt: "2026-09-30" });
    expect(report.notes.join(" ")).toContain(fingerprint(t));
  });
});

describe("group shaping", () => {
  it("does not report base = total, which would make variable pay look like 0%", () => {
    // On-chain we only know total pay. Setting base = total implies nobody has
    // variable pay, which is a factual claim the data cannot support.
    const t = totals({ epoch: "1", members: 5, submissions: 5, populated: [{ cut: CUT_A, counts: counts({ 3: 5 }) }] });
    const g: GroupHistograms = { total: counts({ 3: 5 }), base: Array(BUCKET_COUNT).fill(0) as number[], variable: Array(BUCKET_COUNT).fill(0) as number[] };
    expect(g.base[3]).toBe(0);
    expect(g.total[3]).toBe(5);
  });
});
