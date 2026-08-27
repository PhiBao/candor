/**
 * Candor shared domain model
 * - Cuts: role family × level × region (Wave 1: engineering only, no company)
 * - Buckets: USD total-comp histogram, 10 buckets
 * - Cut key hashing: mirrors on-chain persistentHash([cutKey string, bucket])
 * - k-anonymity gate: cut hidden until ≥K contributors
 */

export const K_ANONYMITY = 5;
export const BUCKET_COUNT = 10;
export const EPOCH_LABEL = "Q1-2026"; // Wave 1: single epoch

// ---- Role taxonomy (Wave 1) ----

export const FAMILIES = ["engineering"] as const;
export type Family = (typeof FAMILIES)[number];

export const LEVELS = [
  { id: "L3", label: "Junior (IC3)", short: "L3" },
  { id: "L4", label: "Mid (IC4)", short: "L4" },
  { id: "L5", label: "Senior (IC5)", short: "L5" },
  { id: "L6", label: "Staff (IC6)", short: "L6" },
  { id: "L7", label: "Principal (IC7)", short: "L7" },
] as const;
export type LevelId = (typeof LEVELS)[number]["id"];

export const REGIONS = [
  { id: "remote-us", label: "Remote · US" },
  { id: "remote-eu", label: "Remote · EU" },
  { id: "remote-global", label: "Remote · Global" },
] as const;
export type RegionId = (typeof REGIONS)[number]["id"];

// ---- Buckets (USD total comp) ----

export const BUCKETS = [
  { id: 0, label: "$0–50k", min: 0, max: 50_000 },
  { id: 1, label: "$50–75k", min: 50_000, max: 75_000 },
  { id: 2, label: "$75–100k", min: 75_000, max: 100_000 },
  { id: 3, label: "$100–125k", min: 100_000, max: 125_000 },
  { id: 4, label: "$125–150k", min: 125_000, max: 150_000 },
  { id: 5, label: "$150–175k", min: 150_000, max: 175_000 },
  { id: 6, label: "$175–200k", min: 175_000, max: 200_000 },
  { id: 7, label: "$200–250k", min: 200_000, max: 250_000 },
  { id: 8, label: "$250–350k", min: 250_000, max: 350_000 },
  { id: 9, label: "$350k+", min: 350_000, max: Number.POSITIVE_INFINITY },
] as const;

export function bucketForSalary(salary: number): number {
  if (!Number.isFinite(salary) || salary < 0) throw new Error("invalid salary");
  for (const b of BUCKETS) {
    if (salary >= b.min && salary < b.max) return b.id;
  }
  return 9;
}

export function bucketLabel(id: number): string {
  return BUCKETS.find((b) => b.id === id)?.label ?? `bucket ${id}`;
}

// ---- Cuts ----

export type Cut = {
  family: Family;
  level: LevelId;
  region: RegionId;
};

export function cutKeyString(cut: Cut): string {
  return `${cut.family}:${cut.level}:${cut.region}`;
}

export function cutLabel(cut: Cut): string {
  const lv = LEVELS.find((l) => l.id === cut.level)?.label ?? cut.level;
  const rg = REGIONS.find((r) => r.id === cut.region)?.label ?? cut.region;
  return `${cap(cut.family)} · ${lv} · ${rg}`;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function allCuts(): Cut[] {
  const out: Cut[] = [];
  for (const f of FAMILIES) {
    for (const l of LEVELS) {
      for (const r of REGIONS) {
        out.push({ family: f, level: l.id, region: r.id });
      }
    }
  }
  return out;
}

export function parseCutKey(s: string): Cut | null {
  const [family, level, region] = s.split(":");
  if (!family || !level || !region) return null;
  if (!(FAMILIES as readonly string[]).includes(family)) return null;
  if (!LEVELS.some((l) => l.id === level)) return null;
  if (!REGIONS.some((r) => r.id === region)) return null;
  return { family: family as Family, level: level as LevelId, region: region as RegionId };
}

// ---- Hashing (mirrors on-chain persistentHash) ----
// Browser-compatible: use Web Crypto SHA-256 over UTF-8 bytes.
// On-chain uses SHA-256 similarly, so cutKey hashing is consistent for indexing
// (exact bytes differ due to Compact type encoding, but mapping is bijective per cut string).

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data as BufferSource);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Synchronous fallback for non-crypto contexts (uses a simple hash, not for on-chain comparison)
export function cutKeyToBytes32Sync(cutKey: string): Uint8Array {
  // Use FNV-1a expanded to 32 bytes deterministically — only for local indexing, not consensus
  let h = 2166136261;
  for (let i = 0; i < cutKey.length; i++) {
    h ^= cutKey.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    out[i] = (h >>> ((i % 4) * 8)) & 0xff;
    // perturb per chunk
    h = Math.imul(h ^ (i * 31), 16777619);
  }
  return out;
}

export function bytesToHex(b: Uint8Array): string {
  return Array.from(b)
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/^0x/, "");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

// Composite bucket key: hash(cutKey string + ":" + bucket)
// Matches on-chain bKey = persistentHash([cutKey, bucket]) in the sense of being a
// deterministic function of (cutKey, bucket); exact preimage encoding is documented in contract README.
export function bucketKey(cut: Cut, bucket: number): string {
  return `${cutKeyString(cut)}:b${bucket}`;
}

// ---- Stats ----

export type Histogram = number[]; // length BUCKET_COUNT, counts per bucket

export function emptyHistogram(): Histogram {
  return Array(BUCKET_COUNT).fill(0);
}

export function histogramTotal(h: Histogram): number {
  return h.reduce((a, b) => a + b, 0);
}

export function histogramPercentile(h: Histogram, bucket: number): number | null {
  const total = histogramTotal(h);
  if (total < K_ANONYMITY) return null;
  let cum = 0;
  for (let i = 0; i < h.length; i++) {
    cum += h[i];
    if (i === bucket) {
      // percentile as midpoint of bucket's cumulative range
      const before = cum - h[i];
      return Math.round(((before + h[i] / 2) / total) * 100);
    }
  }
  return null;
}

export function isCutUnlocked(h: Histogram): boolean {
  return histogramTotal(h) >= K_ANONYMITY;
}
