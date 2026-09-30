/**
 * Pure logic for the report data layer, split out from `reportRead.ts` so it can
 * be tested without an indexer or wasm. `reportRead.ts` owns the network and
 * decoder; this module owns the decisions, which are the part worth pinning
 * down.
 */

import { BUCKET_COUNT } from "@gotit/shared";
import {
  buildReport as buildReportEngine,
  renderReportMarkdown as renderReportMarkdownEngine,
  reportToJson as reportToJsonEngine,
  type CategoryInput,
  type GroupHistograms,
  type PayGapReport,
} from "@gotit/shared/paygap";
import type { Cut } from "@gotit/shared";
import type { LedgerSnapshot } from "./ledger";

export type ChainTotals = {
  epoch: string;
  members: number;
  submissions: number;
  populated: Array<{ cut: Cut; counts: number[] }>;
  emptyCuts: Cut[];
};

/**
 * Verification fingerprint over the exact inputs a report was built from.
 *
 * FNV-1a pair, hex. This is a checksum, not a security primitive: its job is to
 * make divergence between a published report and live chain state obvious and
 * trivially reproducible in a browser. Sorted so a re-read that returns groups
 * in a different order still fingerprints identically.
 */
export function fingerprint(totals: ChainTotals): string {
  const parts: string[] = [
    `epoch=${totals.epoch}`,
    `members=${totals.members}`,
    `submissions=${totals.submissions}`,
  ];
  const rows = [...totals.populated].sort((a, b) => keyOf(a.cut).localeCompare(keyOf(b.cut)));
  for (const { cut, counts } of rows) {
    parts.push(`${keyOf(cut)}=[${counts.join(",")}]`);
  }
  const s = parts.join("|");
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 + c + i, 0x85ebca6b) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

function keyOf(cut: Cut): string {
  return `${cut.family}:${cut.level}:${cut.region}`;
}

function zeros(): number[] {
  return Array(BUCKET_COUNT).fill(0);
}

/**
 * How a Wave 1 cut becomes a reporting group.
 *
 * Wave 1 has no gender dimension on-chain, so a gender pay gap cannot be derived
 * from live state — claiming otherwise would be precisely the overclaim that
 * cost us Wave 1. The engine is gender-parameterised and the comparison side is
 * left empty, which makes `buildReport` withhold the row. What the page shows is
 * a level distribution within each cut, which is a real aggregate and exercises
 * the whole pipeline honestly.
 */
export function toReportCategories(totals: ChainTotals): CategoryInput[] {
  return totals.populated.map(({ cut, counts }) => ({
    category: keyOf(cut),
    reference: {
      total: [...counts],
      // Base is unknown on-chain. Reporting base = total would assert that
      // nobody receives variable pay, which is a claim the data cannot support.
      base: zeros(),
      variable: zeros(),
    } as GroupHistograms,
    comparison: { total: zeros(), base: zeros(), variable: zeros() } as GroupHistograms,
    k: 2,
  }));
}

export function buildReport(
  totals: ChainTotals,
  meta: { period: string; generatedAt: string },
): PayGapReport {
  const report = buildReportEngine(toReportCategories(totals), meta);
  report.notes.unshift(
    `Built from live on-chain state at epoch ${totals.epoch}: ${totals.submissions} verified ` +
      `submission(s), ${totals.members} enrolled member(s). Fingerprint ${fingerprint(totals)}.`,
  );
  report.notes.push(
    "Grouping is the Wave 1 cut taxonomy (family:level:region), not the Directive's " +
      '"category of worker". The ledger has no gender dimension yet, so this report shows ' +
      "level distributions within each cut rather than a gender pay gap. The engine is " +
      "gender-parameterised; the contract change is tracked for Wave 2.",
  );
  return report;
}

export function renderReportMarkdown(report: PayGapReport): string {
  return renderReportMarkdownEngine(report);
}

export function reportToJson(report: PayGapReport): string {
  return reportToJsonEngine(report);
}

/** Shape live state like the existing browse UI expects. */
export function toLedgerSnapshot(totals: ChainTotals): LedgerSnapshot {
  const histogram: Record<string, number> = {};
  for (const { cut, counts } of totals.populated) {
    for (let b = 0; b < BUCKET_COUNT; b++) {
      if (counts[b] > 0) histogram[`${keyOf(cut)}:b${b}`] = counts[b];
    }
  }
  return {
    members: Array.from({ length: totals.members }, (_, i) => `member:${i}`),
    nullifiers: Array.from({ length: totals.submissions }, (_, i) => `nf:${i}`),
    histogram,
    epoch: totals.epoch,
  };
}

export type VerificationResult = {
  ok: boolean;
  expected: string;
  actual: string;
  epoch: string;
  submissions: number;
  populatedCuts: number;
  checkedAt: string;
};

export function compareFingerprint(actual: string, expected: string): boolean {
  return actual.toLowerCase() === expected.toLowerCase();
}
