/**
 * Pay gap report computation (Wave 2)
 *
 * Pure functions, no I/O — every number here is reproducible from on-chain
 * histogram state alone, which is what makes the resulting report verifiable
 * by a third party.
 *
 * The required outputs come from Directive (EU) 2023/970 Art. 9, first reports
 * due 7 June 2027 for employers with 150+ workers:
 *   (a) the gender pay gap
 *   (b) the gender pay gap in complementary or variable components
 *   (c) the median gender pay gap
 *   (d) the median gender pay gap in complementary or variable components
 *   (e) the proportion of female and male workers receiving complementary or
 *       variable components
 * plus the distribution of men and women across each pay quartile.
 *
 * Accuracy, stated honestly: a histogram gives us EXACT counts, EXACT median
 * and EXACT quartiles, but only BOUNDED means and gaps. We report a gap as an
 * interval and say so on the report's face. Reporting a point estimate from
 * bucketed data would be a rounding error dressed up as a statistic.
 */

import { BUCKETS, BUCKET_COUNT, K_ANONYMITY, bucketLabel, type Histogram } from "./index.js";

// ---- Pay component ----

export type PayComponent = "base" | "variable";

export const PAY_COMPONENTS: readonly PayComponent[] = ["base", "variable"] as const;

/**
 * Article 9(1)(a) splits pay into basic salary and "complementary or variable
 * components" such as bonuses. We keep them as separate histograms so a report
 * can state the split rather than blending it into a single misleading number.
 */
export type GroupHistograms = {
  /** Histogram of total pay, all components. */
  total: Histogram;
  /** Histogram of basic salary only. */
  base: Histogram;
  /** Histogram of bonus / commission / equity-cash only. */
  variable: Histogram;
};

export function emptyGroupHistograms(): GroupHistograms {
  return { total: zeros(), base: zeros(), variable: zeros() };
}

function zeros(): Histogram {
  return Array(BUCKET_COUNT).fill(0);
}

/** Midpoint of a bucket; the top bucket uses a finite stand-in (see notes). */
export function bucketMid(bucket: number): number {
  const b = BUCKETS[bucket];
  if (!b) return Number.NaN;
  if (!Number.isFinite(b.max)) return 350_000; // conservative for an open-ended top bucket
  return (b.min + b.max) / 2;
}

// ---- Interval arithmetic ----

/**
 * A statistic we know only to within bounds. Gaps derived from bucketed data
 * are always intervals, never point estimates.
 */
export type Interval = { low: number; high: number };

export function interval(low: number, high: number): Interval {
  return low <= high ? { low, high } : { low: high, high: low };
}

export function intervalPoint(i: Interval): number {
  return (i.low + i.high) / 2;
}

export function intervalWidth(i: Interval): number {
  return i.high - i.low;
}

export function formatInterval(i: Interval, asPercent = true): string {
  const f = (v: number) => (asPercent ? `${(v * 100).toFixed(1)}%` : Math.round(v).toLocaleString("en-US"));
  if (Math.abs(intervalWidth(i)) < 1e-9) return f(i.low);
  return `${f(i.low)} – ${f(i.high)}`;
}

/** a - b, interval-aware. */
export function subtract(a: Interval, b: Interval): Interval {
  return interval(a.low - b.high, a.high - b.low);
}

// ---- Distribution statistics ----

export function groupSize(h: Histogram): number {
  return h.reduce((a, b) => a + b, 0);
}

export function isReportable(h: Histogram, k = K_ANONYMITY): boolean {
  return groupSize(h) >= k;
}

/**
 * Median pay. Exact for even group sizes; for odd sizes the true median is the
 * single middle observation, which a histogram cannot pin down — so we return
 * the interval between the two central buckets instead of guessing.
 */
export function medianInterval(h: Histogram): Interval | null {
  const n = groupSize(h);
  if (n === 0) return null;
  if (n % 2 === 1) {
    const mid = (n + 1) / 2;
    const b = bucketAtRank(h, mid);
    if (b === null) return null;
    const bd = BUCKETS[b];
    return interval(bd.min, Number.isFinite(bd.max) ? bd.max : Number.POSITIVE_INFINITY);
  }
  const lower = bucketAtRank(h, n / 2);
  const upper = bucketAtRank(h, n / 2 + 1);
  if (lower === null || upper === null) return null;
  return interval(bucketMin(lower), bucketMax(upper));
}

/**
 * The pay quartile split: the pay band boundaries separating the bottom 25%,
 * second 25%, third 25% and top 25% of the group. This is Article 9's
 * "distribution of workers across each pay quartile", expressed as the
 * thresholds a reader can act on.
 */
export type Quartiles = {
  q1: Interval;
  q2: Interval;
  q3: Interval;
};

export function quartiles(h: Histogram): Quartiles | null {
  const n = groupSize(h);
  if (n < 4) return null;
  return {
    q1: thresholdAtFraction(h, 0.25),
    q2: thresholdAtFraction(h, 0.5),
    q3: thresholdAtFraction(h, 0.75),
  };
}

/** The bucket boundary at the given cumulative fraction of the group. */
function thresholdAtFraction(h: Histogram, frac: number): Interval {
  const n = groupSize(h);
  if (n === 0) return interval(0, 0);
  const target = Math.max(1, Math.min(n, Math.round(frac * n)));
  const b = bucketAtRank(h, target);
  if (b === null) return interval(0, 0);
  return interval(bucketMin(b), bucketMax(b));
}

function bucketAtRank(h: Histogram, rank: number): number | null {
  let cum = 0;
  for (let i = 0; i < h.length; i++) {
    if (h[i] > 0) {
      cum += h[i];
      if (cum >= rank) return i;
    }
  }
  for (let i = h.length - 1; i >= 0; i--) if (h[i] > 0) return i;
  return null;
}

function bucketMin(b: number): number {
  return BUCKETS[b]?.min ?? 0;
}

function bucketMax(b: number): number {
  const m = BUCKETS[b]?.max;
  return Number.isFinite(m as number) ? (m as number) : Number.POSITIVE_INFINITY;
}

/**
 * Mean pay, as an interval. The true mean lies between the mean of all bucket
 * midpoints (lower bound, when everyone sits at the bottom of their bucket) and
 * the mean of all bucket maxima (upper bound).
 */
export function meanInterval(h: Histogram): Interval | null {
  const n = groupSize(h);
  if (n === 0) return null;
  let low = 0;
  let high = 0;
  for (let i = 0; i < h.length; i++) {
    if (h[i] === 0) continue;
    low += h[i] * bucketMin(i);
    high += h[i] * (Number.isFinite(bucketMax(i)) ? bucketMax(i) : bucketMid(i));
  }
  return interval(low / n, high / n);
}

// ---- The gender pay gap ----

/**
 * Gap is conventionally expressed relative to the reference group's mean:
 *   gap = (mean_other - mean_reference) / mean_reference
 * Using the reference group's own (interval) mean as the denominator gives an
 * interval, widened by the numerator's uncertainty. The direction of the
 * interval tells us the sign unambiguously unless it straddles zero, which we
 * report as "no discernible gap" rather than as zero.
 */
/**
 * Article 9(4) triggers a joint pay assessment when a report shows an
 * unjustified gap of 5% or more in a worker category. This is the threshold
 * that has consequences, so we flag against it explicitly.
 */
export const MATERIALITY_THRESHOLD = 0.05;

export type GapDirection = "other-earns-more" | "other-earns-less" | "no-discernible-gap";

export type GapResult = {
  /** Range the true gap provably lies within. */
  gap: Interval;
  /**
   * Sign of the gap. Determined by the whole interval, not a point estimate:
   * if any part of the interval is above zero the other group may earn more.
   */
  direction: GapDirection;
  /**
   * Indicative magnitude, for prioritisation only. Explicitly NOT the filed
   * figure — the interval above is.
   */
  indicative: number;
  /** True when the indicative gap reaches the 5% joint-assessment threshold. */
  material: boolean;
  /** False when the interval straddles zero, i.e. the sign is not provable. */
  conclusive: boolean;
};

export function payGap(reference: Histogram, other: Histogram): GapResult | null {
  const refMean = meanInterval(reference);
  const othMean = meanInterval(other);
  if (!refMean || !othMean || groupSize(reference) === 0 || groupSize(other) === 0) return null;

  // Divide interval by interval: the extremes come from opposite corners.
  const lo = (othMean.low - refMean.high) / refMean.high;
  const hi = (othMean.high - refMean.low) / refMean.low;
  const gap = interval(lo, hi);

  // A boundary value of exactly 0 is a real, reportable finding ("at most
  // parity"), not an absence of one. Only a range that genuinely crosses zero
  // is inconclusive.
  const EPS = 1e-9;
  let direction: GapDirection = "no-discernible-gap";
  let conclusive = true;
  if (gap.low > EPS) {
    direction = "other-earns-more";
  } else if (gap.high < -EPS) {
    direction = "other-earns-less";
  } else if (gap.high <= EPS && gap.low < -EPS) {
    // Range sits entirely at or below parity: the other group never earns more.
    direction = "other-earns-less";
  } else if (gap.low >= -EPS && gap.high > EPS) {
    direction = "other-earns-more";
  } else {
    conclusive = false;
  }

  // Materiality is judged on the bound that matters, not on the midpoint.
  //
  // Using the midpoint here would be a category error: it is a point estimate
  // of a quantity the data only bounds. A range of [-33%, +50%] has midpoint
  // +8.3% and would be flagged as material, but the true gap could be 0 —
  // flagging it would cry wolf on a category that may be perfectly compliant,
  // and the consequence of a false flag is a joint pay assessment.
  //
  // Rule: flag when the range excludes zero AND the bound nearest zero still
  // reaches the threshold. Only a *proven* disparity of the required size
  // counts.
  const nearestZero = Math.min(Math.abs(gap.low), Math.abs(gap.high));
  const material = conclusive && nearestZero >= MATERIALITY_THRESHOLD;

  return { gap, direction, indicative: intervalPoint(gap), material, conclusive };
}

export function medianGap(reference: Histogram, other: Histogram): Interval | null {
  const ref = medianInterval(reference);
  const oth = medianInterval(other);
  if (!ref || !oth || ref.low === 0) return null;
  // Numerator is exactly bounded; denominator is not, so widen conservatively.
  return subtract(oth, ref);
}

// ---- Disclosure control ----

export type SuppressionReason =
  | "below-k-anonymity-threshold"
  | "empty-group"
  | "merged-into-parent-category";

export type SuppressedRow = {
  category: string;
  reason: SuppressionReason;
  size: number;
};

export type ReportRow = {
  category: string;
  reference: { size: number; mean: Interval; median: Interval | null };
  comparison: { size: number; mean: Interval; median: Interval | null };
  gap: ReturnType<typeof payGap>;
  medianGap: Interval | null;
  variableShare: { reference: number; comparison: number } | null;
  quartiles: { reference: Quartiles | null; comparison: Quartiles | null };
};

export type PayGapReport = {
  /** ISO date the report was generated. */
  generatedAt: string;
  /** Reporting period label, e.g. "FY2026". */
  period: string;
  k: number;
  rows: ReportRow[];
  suppressed: SuppressedRow[];
  /** Categories that received at least one participant, before suppression. */
  participatingCategories: number;
  /** Total participants across all categories, including suppressed ones. */
  totalParticipants: number;
  /** Categories where one side fell below k and the row was withheld. */
  partialCategories: number;
  notes: string[];
};

// ---- Report assembly ----

export type CategoryInput = {
  /** Employer's own job-category label, passed through unchanged. */
  category: string;
  reference: GroupHistograms;
  comparison: GroupHistograms;
  k?: number;
};

const PERCENTILE_NOTE =
  "Gaps and means are intervals, not point estimates: the underlying data is bucketed, so the exact figures are not recoverable. Quartiles and counts are exact.";
const PARTICIPATION_NOTE =
  "Participation is voluntary. Category sizes below the anonymity threshold are suppressed, and participation counts are shown so incomplete coverage is visible rather than hidden.";

/**
 * Build a report from per-category histograms. This is a pure function of
 * on-chain state — no network calls — so anyone can re-run it and get the same
 * numbers, which is the point.
 */
export function buildReport(
  categories: CategoryInput[],
  meta: { period: string; generatedAt: string; k?: number },
): PayGapReport {
  const k = meta.k ?? K_ANONYMITY;
  const rows: ReportRow[] = [];
  const suppressed: SuppressedRow[] = [];
  let participating = 0;
  let total = 0;
  let partial = 0;

  for (const c of categories) {
    const refTotal = groupSize(c.reference.total);
    const cmpTotal = groupSize(c.comparison.total);
    participating += 1;
    total += refTotal + cmpTotal;

    if (refTotal + cmpTotal === 0) {
      suppressed.push({ category: c.category, reason: "empty-group", size: 0 });
      continue;
    }

    // Disclosure control: withhold the row unless BOTH sides clear k. Reporting
    // one side of a comparison reveals the other by subtraction, so a one-sided
    // row is a disclosure just as much as a small cell.
    if (refTotal < k || cmpTotal < k) {
      const reason: SuppressionReason =
        refTotal === 0 || cmpTotal === 0 ? "empty-group" : "below-k-anonymity-threshold";
      suppressed.push({ category: c.category, reason, size: refTotal + cmpTotal });
      if (refTotal < k && cmpTotal < k) partial += 1;
      continue;
    }

    const gap = payGap(c.reference.total, c.comparison.total);
    rows.push({
      category: c.category,
      reference: {
        size: refTotal,
        mean: meanInterval(c.reference.total)!,
        median: medianInterval(c.reference.total),
      },
      comparison: {
        size: cmpTotal,
        mean: meanInterval(c.comparison.total)!,
        median: medianInterval(c.comparison.total),
      },
      gap,
      medianGap: medianGap(c.reference.total, c.comparison.total),
      variableShare: {
        reference: variableShare(c.reference),
        comparison: variableShare(c.comparison),
      },
      quartiles: {
        reference: quartiles(c.reference.total),
        comparison: quartiles(c.comparison.total),
      },
    });
  }

  return {
    generatedAt: meta.generatedAt,
    period: meta.period,
    k,
    rows,
    suppressed,
    participatingCategories: participating,
    totalParticipants: total,
    partialCategories: partial,
    notes: [PERCENTILE_NOTE, PARTICIPATION_NOTE],
  };
}

/** Proportion of a group receiving any variable component (Art. 9(1)(e)). */
export function variableShare(g: GroupHistograms): number {
  const withVariable = groupSize(g.total) - groupSize(g.base);
  const total = groupSize(g.total);
  return total === 0 ? 0 : withVariable / total;
}

// ---- Rendering ----

function money(i: Interval): string {
  const f = (v: number) => (Number.isFinite(v) ? `$${Math.round(v).toLocaleString("en-US")}` : "$∞");
  if (!Number.isFinite(i.low) && !Number.isFinite(i.high)) return "—";
  if (i.low === i.high) return f(i.low);
  return `${f(i.low)}–${f(i.high)}`;
}

function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

/**
 * Render the report as the markdown table a compliance officer actually pastes
 * into their filing, plus the disclosure notes that have to travel with it.
 */
export function renderReportMarkdown(r: PayGapReport): string {
  const L: string[] = [];
  L.push(`# Pay gap report — ${r.period}`);
  L.push("");
  L.push(`Generated ${r.generatedAt} · anonymity threshold k=${r.k} · ${r.totalParticipants} participants across ${r.participatingCategories} categories`);
  L.push("");

  if (r.rows.length === 0) {
    L.push(`> No category met the anonymity threshold of k=${r.k}. Nothing is publishable this period.`);
  }

  for (const row of r.rows) {
    L.push(`## ${row.category}`);
    L.push("");
    L.push(`| | Reference group | Comparison group |`);
    L.push(`|---|---|---|`);
    L.push(`| Headcount | ${row.reference.size} | ${row.comparison.size} |`);
    L.push(`| Median pay | ${row.reference.median ? money(row.reference.median) : "—"} | ${row.comparison.median ? money(row.comparison.median) : "—"} |`);
    L.push(`| Mean pay | ${money(row.reference.mean)} | ${money(row.comparison.mean)} |`);
    L.push(
      `| Receiving variable pay | ${row.variableShare ? pct(row.variableShare.reference) : "—"} | ${row.variableShare ? pct(row.variableShare.comparison) : "—"} |`,
    );
    L.push("");
    if (row.gap) {
      const dir = row.gap.direction.replace(/-/g, " ");
      const tag = row.gap.conclusive ? "" : " — sign not provable from bucketed data";
      L.push(`**Mean pay gap:** ${formatInterval(row.gap.gap)} (${dir})${tag}`);
      if (row.gap.material) {
        L.push("");
        L.push(
          `> **At or above the ${(MATERIALITY_THRESHOLD * 100).toFixed(0)}% threshold** in Art. 9(4): ` +
            `if this gap is not objectively justified, a joint pay assessment with worker representatives is triggered.`,
        );
      }
    } else {
      L.push("**Mean pay gap:** not computable");
    }
    if (row.medianGap) L.push(`**Median pay gap:** ${money(row.medianGap)}`);
    const qRef = row.quartiles.reference;
    const qCmp = row.quartiles.comparison;
    if (qRef && qCmp) {
      L.push("");
      L.push("| Pay quartile boundary | Reference group | Comparison group |");
      L.push("|---|---|---|");
      L.push(`| 25th percentile | ${money(qRef.q1)} | ${money(qCmp.q1)} |`);
      L.push(`| Median | ${money(qRef.q2)} | ${money(qCmp.q2)} |`);
      L.push(`| 75th percentile | ${money(qRef.q3)} | ${money(qCmp.q3)} |`);
    }
    L.push("");
  }

  if (r.suppressed.length) {
    L.push("## Suppressed categories");
    L.push("");
    L.push(`| Category | Participants | Reason |`);
    L.push(`|---|---|---|`);
    for (const s of r.suppressed) {
      L.push(`| ${s.category} | ${s.size} | ${s.reason} |`);
    }
    L.push("");
  }

  L.push("## Disclosure notes");
  L.push("");
  for (const n of r.notes) L.push(`- ${n}`);
  L.push("");
  return L.join("\n");
}

/** Machine-readable form, for the verification page and for diffing periods. */
export function reportToJson(r: PayGapReport): string {
  return JSON.stringify(
    r,
    (_k, v) =>
      typeof v === "number" && !Number.isFinite(v)
        ? v > 0
          ? "unbounded"
          : "unbounded"
        : v,
    2,
  );
}

/** Which bucket a person falls in — used by tests and by the client-side form. */
export { bucketLabel, BUCKETS };
