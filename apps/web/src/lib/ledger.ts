import {
  BUCKETS,
  K_ANONYMITY,
  type Cut,
  type Histogram,
  bucketForSalary,
  bucketKey,
  cutKeyString,
  emptyHistogram,
} from "@candor/shared";
import { bytesToHex } from "@candor/shared";

export type LedgerSnapshot = {
  members: string[]; // hex leaf 0x...
  nullifiers: string[];
  histogram: Record<string, number>; // bKey -> count
  epoch: string;
};

const LS_LEDGER = "candor:ledger:v1";
const LS_SECRET = "candor:secret:v1";
const LS_CONTRIBUTIONS = "candor:contribs:v1"; // local record of my submissions for UI

// ---- Secret ----

function safeGet(k: string): string | null { try { return localStorage.getItem(k); } catch { return null; } }
function safeSet(k: string, v: string) { try { localStorage.setItem(k, v); } catch {} }
function safeRemove(k: string) { try { localStorage.removeItem(k); } catch {} }

export function getOrCreateSecret(): Uint8Array {
  const existing = safeGet(LS_SECRET);
  if (existing) {
    try {
      const hex = existing.replace(/^0x/, "");
      const out = new Uint8Array(hex.length / 2);
      for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
      if (out.length === 32) return out;
    } catch {}
  }
  const s = new Uint8Array(32);
  crypto.getRandomValues(s);
  safeSet(LS_SECRET, "0x" + bytesToHex(s));
  return s;
}

export function getSecretHex(): string | null {
  return safeGet(LS_SECRET);
}

// Canonical leaf — identical to the circuit's derivation (hash-parity tested).
// The hashing runtime (wasm) is loaded on demand so the landing page stays light.
export async function leafForSecret(secret: Uint8Array): Promise<string> {
  const { memberLeaf } = await import("@candor/shared/hash");
  return "0x" + bytesToHex(memberLeaf(secret));
}

export async function nullifierForSecret(secret: Uint8Array): Promise<string> {
  const pad = new TextEncoder().encode("candor:nf:v1".padEnd(32, "\0"));
  const buf = new Uint8Array(pad.length + secret.length);
  buf.set(pad, 0);
  buf.set(secret, pad.length);
  const h = await crypto.subtle.digest("SHA-256", buf);
  return "0x" + bytesToHex(new Uint8Array(h));
}

// ---- Ledger ----

export function loadLedger(): LedgerSnapshot {
  const raw = safeGet(LS_LEDGER);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as LedgerSnapshot;
      if (parsed && typeof parsed === "object") return parsed;
    } catch {}
  }
  // seed with demo data so k-gate is demonstrable
  return seedLedger();
}

export function saveLedger(s: LedgerSnapshot) {
  safeSet(LS_LEDGER, JSON.stringify(s));
}

export function resetLedger() {
  safeRemove(LS_LEDGER);
  safeRemove(LS_CONTRIBUTIONS);
}

function seedLedger(): LedgerSnapshot {
  // Seed 3 cuts with enough data to unlock, plus noise elsewhere
  const histogram: Record<string, number> = {};
  const seed = (cutStr: string, counts: number[]) => {
    for (let b = 0; b < counts.length; b++) {
      const k = `${cutStr}:b${b}`;
      if (counts[b]) histogram[k] = counts[b];
    }
  };
  // These three will be prominently unlocked
  seed("engineering:L5:remote-us", [0, 1, 2, 4, 6, 8, 5, 3, 2, 1]); // 32 total, median ~ $150k
  seed("engineering:L4:remote-us", [1, 2, 5, 7, 6, 4, 2, 1, 0, 0]); // 28 total
  seed("engineering:L6:remote-global", [0, 0, 1, 1, 2, 3, 4, 6, 5, 3]); // 25 total
  // A few near-threshold cuts to show locked state that invites contribution
  seed("engineering:L5:remote-eu", [0, 0, 1, 1, 2, 0, 0, 0, 0, 0]); // 4 total (<5, locked)
  seed("engineering:L3:remote-us", [2, 3, 1, 0, 0, 0, 0, 0, 0, 0]); // 6 total (barely unlocked)
  return {
    members: [],
    nullifiers: [],
    histogram,
    epoch: "Q1-2026",
  };
}

export type MyContribution = { cut: Cut; bucket: number; at: string };

export function loadMyContribs(): MyContribution[] {
  const raw = safeGet(LS_CONTRIBUTIONS);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as MyContribution[];
  } catch {
    return [];
  }
}

export function saveMyContrib(c: MyContribution) {
  const cur = loadMyContribs();
  cur.push(c);
  safeSet(LS_CONTRIBUTIONS, JSON.stringify(cur));
}

export function histogramForCut(snap: LedgerSnapshot, cut: Cut): Histogram {
  const hist = emptyHistogram();
  for (let b = 0; b < BUCKETS.length; b++) {
    const k = bucketKey(cut, b);
    hist[b] = snap.histogram[k] ?? 0;
  }
  return hist;
}

export function totalForCut(snap: LedgerSnapshot, cut: Cut): number {
  return histogramForCut(snap, cut).reduce((a, b) => a + b, 0);
}

export function isUnlocked(snap: LedgerSnapshot, cut: Cut): boolean {
  return totalForCut(snap, cut) >= K_ANONYMITY;
}

export function percentileForBucket(snap: LedgerSnapshot, cut: Cut, bucket: number): number | null {
  const hist = histogramForCut(snap, cut);
  const total = hist.reduce((a, b) => a + b, 0);
  if (total < K_ANONYMITY) return null;
  let cum = 0;
  for (let i = 0; i < hist.length; i++) {
    cum += hist[i];
    if (i === bucket) {
      const before = cum - hist[i];
      return Math.round(((before + hist[i] / 2) / total) * 100);
    }
  }
  return null;
}

export function enrollLocal(snap: LedgerSnapshot, leafHex: string): LedgerSnapshot {
  if (!snap.members.includes(leafHex)) {
    snap.members = [...snap.members, leafHex];
    saveLedger(snap);
  }
  return snap;
}

export async function submitLocal(
  snap: LedgerSnapshot,
  secret: Uint8Array,
  cut: Cut,
  bucket: number,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const leaf = await leafForSecret(secret);
  if (!snap.members.includes(leaf)) return { ok: false, reason: "not a member — verify email first" };
  const nf = await nullifierForSecret(secret);
  if (snap.nullifiers.includes(nf)) return { ok: false, reason: "already submitted this epoch" };
  if (bucket < 0 || bucket >= BUCKETS.length) return { ok: false, reason: "invalid bucket" };
  snap.nullifiers = [...snap.nullifiers, nf];
  const k = bucketKey(cut, bucket);
  snap.histogram[k] = (snap.histogram[k] ?? 0) + 1;
  saveLedger(snap);
  saveMyContrib({ cut, bucket, at: new Date().toISOString() });
  return { ok: true };
}
