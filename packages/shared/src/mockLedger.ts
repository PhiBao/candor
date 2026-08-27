/**
 * Mock ledger that mirrors on-chain Candor semantics for local demo & tests.
 * No Midnight node required. Logic matches candor.compact:
 * - members: Set<leaf>
 * - nullifiers: Set<nf>
 * - histogram: Map<bKey, count>
 * This is the "proof-server-local" demo path; replace with real indexer/provider in Preprod.
 */
import { BUCKET_COUNT, K_ANONYMITY, type Cut, bucketKey, cutKeyString } from "./index.js";
import { bytesToHex } from "./index.js";

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const h = await crypto.subtle.digest("SHA-256", data as BufferSource);
  return new Uint8Array(h);
}

async function leafForSecret(secret: Uint8Array): Promise<string> {
  const pad = new TextEncoder().encode("candor:member:v1".padEnd(32, "\0"));
  const buf = new Uint8Array(pad.length + secret.length);
  buf.set(pad, 0);
  buf.set(secret, pad.length);
  return bytesToHex(await sha256(buf));
}

async function nullifierForSecret(secret: Uint8Array): Promise<string> {
  const pad = new TextEncoder().encode("candor:nf:v1".padEnd(32, "\0"));
  const buf = new Uint8Array(pad.length + secret.length);
  buf.set(pad, 0);
  buf.set(secret, pad.length);
  return bytesToHex(await sha256(buf));
}

export type MockLedgerState = {
  members: Set<string>; // hex leaf
  nullifiers: Set<string>; // hex nf
  histogram: Map<string, number>; // bKey -> count
  epoch: number;
};

export function createMockLedger(): MockLedgerState {
  return { members: new Set(), nullifiers: new Set(), histogram: new Map(), epoch: 1 };
}

export async function enrollMember(state: MockLedgerState, secret: Uint8Array): Promise<string> {
  const leaf = await leafForSecret(secret);
  state.members.add(leaf);
  return leaf;
}

export async function submitContribution(
  state: MockLedgerState,
  secret: Uint8Array,
  cut: Cut,
  bucket: number,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (bucket < 0 || bucket >= BUCKET_COUNT) return { ok: false, reason: "bucket out of range" };
  const leaf = await leafForSecret(secret);
  if (!state.members.has(leaf)) return { ok: false, reason: "not a member" };
  const nf = await nullifierForSecret(secret);
  if (state.nullifiers.has(nf)) return { ok: false, reason: "already submitted this epoch" };
  state.nullifiers.add(nf);
  const key = bucketKey(cut, bucket);
  state.histogram.set(key, (state.histogram.get(key) ?? 0) + 1);
  return { ok: true };
}

export function histogramForCut(state: MockLedgerState, cut: Cut): number[] {
  const hist = Array(BUCKET_COUNT).fill(0);
  for (let b = 0; b < BUCKET_COUNT; b++) {
    hist[b] = state.histogram.get(bucketKey(cut, b)) ?? 0;
  }
  return hist;
}

export function isUnlockedForCut(state: MockLedgerState, cut: Cut): boolean {
  const total = histogramForCut(state, cut).reduce((a, b) => a + b, 0);
  return total >= K_ANONYMITY;
}

export function allUnlockedCuts(state: MockLedgerState, cuts: Cut[]): Cut[] {
  return cuts.filter((c) => isUnlockedForCut(state, c));
}

// Differential-leak regression: histogram delta must never reveal exact salary,
// only the bucket index. This helper asserts that property.
export function assertNoExactLeak(prev: Map<string, number>, next: Map<string, number>): boolean {
  // Count keys whose value changed — must be exactly 1 and delta exactly 1
  let changed = 0;
  for (const [k, v] of next) {
    const pv = prev.get(k) ?? 0;
    if (v !== pv) {
      if (v !== pv + 1) return false;
      changed++;
    }
  }
  for (const [k, pv] of prev) {
    if (!next.has(k) && pv !== 0) return false;
  }
  return changed === 1;
}
