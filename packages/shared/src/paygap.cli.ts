#!/usr/bin/env node
/**
 * Generate a pay gap report from on-chain histogram state.
 *
 * Reads the JSON produced by `chainRead` (or any source of per-category
 * histograms), applies suppression, and writes both a markdown report and a
 * machine-readable JSON. Pure computation — no network access — so a third
 * party can re-run it and get byte-identical output, which is what makes the
 * report verifiable.
 *
 * Usage:
 *   npx tsx src/paygap.cli.ts --input state.json --out report.md
 *   npx tsx src/paygap.cli.ts --demo          # sample data, clearly labelled
 */

import { readFileSync, writeFileSync } from "node:fs";
import { BUCKET_COUNT, K_ANONYMITY, BUCKETS, type Histogram } from "./index.js";
import { buildReport, renderReportMarkdown, reportToJson, type CategoryInput } from "./paygap.js";

type Input = {
  period: string;
  generatedAt: string;
  k?: number;
  categories: Array<{
    category: string;
    reference: Histogram | { total: Histogram; base: Histogram; variable: Histogram };
    comparison: Histogram | { total: Histogram; base: Histogram; variable: Histogram };
  }>;
};

function args(): Record<string, string> {
  const out: Record<string, string> = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) out[argv[i].slice(2)] = argv[i + 1]?.startsWith("--") ? "true" : (argv[i + 1] ?? "true");
  }
  return out;
}

function validate(h: unknown, where: string): Histogram {
  if (!Array.isArray(h) || h.length !== BUCKET_COUNT) {
    throw new Error(`${where}: expected ${BUCKET_COUNT} buckets, got ${Array.isArray(h) ? h.length : typeof h}`);
  }
  for (let i = 0; i < h.length; i++) {
    if (!Number.isInteger(h[i]) || (h[i] as number) < 0) {
      throw new Error(`${where}: bucket ${i} must be a non-negative integer, got ${JSON.stringify(h[i])}`);
    }
  }
  return h as Histogram;
}

function normalise(v: Input["categories"][number]["reference"], where: string) {
  if (Array.isArray(v)) {
    // Bare histogram: treat it as total pay, with base unknown = total.
    const total = validate(v, where);
    return { total, base: total, variable: Array(BUCKET_COUNT).fill(0) as Histogram };
  }
  return {
    total: validate(v.total, `${where}.total`),
    base: validate(v.base, `${where}.base`),
    variable: validate(v.variable, `${where}.variable`),
  };
}

/** Shape a histogram by name and size so the demo is readable. */
function demoHistogram(salaries: number[]): Histogram {
  const h = Array(BUCKET_COUNT).fill(0) as Histogram;
  for (const s of salaries) {
    for (let i = 0; i < BUCKETS.length; i++) {
      const b = BUCKETS[i];
      if (s >= b.min && (s < b.max || !Number.isFinite(b.max))) {
        h[i]++;
        break;
      }
    }
  }
  return h;
}

const a = args();

if (a.demo) {
  // Illustrative figures, not real data. Labeled so it can never be mistaken
  // for a filing.
  const mk = (total: number[], base?: number[]) => ({
    total: demoHistogram(total),
    base: demoHistogram(base ?? total),
    variable: demoHistogram(total.filter((s) => !(base ?? total).includes(s))),
  });
  const input: Input = {
    period: "FY2026 (SAMPLE DATA — NOT A FILING)",
    generatedAt: new Date().toISOString().slice(0, 10),
    categories: [
      {
        category: "Engineering",
        reference: mk([150_000, 158_000, 162_000, 170_000, 175_000, 180_000, 185_000, 195_000]),
        comparison: mk([120_000, 128_000, 135_000, 140_000, 145_000, 150_000, 155_000, 160_000]),
      },
      {
        category: "Design (6 staff — below threshold)",
        reference: mk([98_000, 102_000, 110_000]),
        comparison: mk([95_000, 99_000]),
      },
    ],
  };
  const cats: CategoryInput[] = input.categories.map((c) => ({
    category: c.category,
    reference: normalise(c.reference, `${c.category}.reference`),
    comparison: normalise(c.comparison, `${c.category}.comparison`),
  }));
  const report = buildReport(cats, { period: input.period, generatedAt: input.generatedAt });
  const md = renderReportMarkdown(report);
  if (a.out) {
    writeFileSync(a.out, md);
    writeFileSync(a.out.replace(/\.md$/, "") + ".json", reportToJson(report));
    console.log(`wrote ${a.out} and ${a.out.replace(/\.md$/, "")}.json`);
  } else {
    console.log(md);
  }
} else if (a.input) {
  const raw = JSON.parse(readFileSync(a.input, "utf8")) as Input;
  if (!raw.period || !raw.generatedAt || !Array.isArray(raw.categories)) {
    throw new Error("input must have: period, generatedAt, categories[]");
  }
  const cats: CategoryInput[] = raw.categories.map((c) => ({
    category: c.category,
    reference: normalise(c.reference, `${c.category}.reference`),
    comparison: normalise(c.comparison, `${c.category}.comparison`),
  }));
  const report = buildReport(cats, {
    period: raw.period,
    generatedAt: raw.generatedAt,
    k: raw.k ?? K_ANONYMITY,
  });
  const md = renderReportMarkdown(report);
  if (a.out) {
    writeFileSync(a.out, md);
    writeFileSync(a.out.replace(/\.md$/, "") + ".json", reportToJson(report));
    console.log(`wrote ${a.out} and ${a.out.replace(/\.md$/, "")}.json`);
  } else {
    console.log(md);
  }
} else {
  console.error(
    "usage:\n" +
      "  tsx src/paygap.cli.ts --input <state.json> [--out report.md]\n" +
      "  tsx src/paygap.cli.ts --demo [--out report.md]\n",
  );
  process.exit(1);
}
