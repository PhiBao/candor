/**
 * Mock ledger mirroring candor.compact (v2) semantics for local demo & tests.
 * No Midnight node required. Mirrors:
 * - members: Set<leaf>, insertion issuer-gated on-chain (mock trusts caller)
 * - nullifiers: epoch-scoped — hash(domain, epoch, secret); nextEpoch re-opens
 * - histogram: Map<bKey, count> keyed by canonical bucketKeyBytes
 * - epoch: readable counter cell (singleton map on-chain)
 * Hashing uses shared/src/hash.ts — bit-identical to circuit persistentHash.
 */
import { BUCKET_COUNT, K_ANONYMITY, type Cut, cutKeyString } from "./index.js";
import { memberLeaf, epochNullifier, bucketKeyBytes, cutKeyBytes, bytesToHex } from "./hash.js";

export type MockLedgerState = {
  members: Set<string>; // hex leaf
  nullifiers: Set<string>; // hex epoch nullifier
  histogram: Map<string, number>; // hex bKey -> count
  epoch: bigint;
};

export function createMockLedger(): MockLedgerState {
  return { members: new Set(), nullifiers: new Set(), histogram: new Map(), epoch: 1n };
}

export function enrollMember(state: MockLedgerState, secret: Uint8Array): string {
  const leaf = bytesToHex(memberLeaf(secret));
  state.members.add(leaf);
  return leaf;
}

export function submitContribution(
  state: MockLedgerState,
  secret: Uint8Array,
  cut: Cut,
  bucket: number,
): { ok: true } | { ok: false; reason: string } {
  if (!Number.isInteger(bucket) || bucket < 0 || bucket >= BUCKET_COUNT) {
    return { ok: false, reason: "bucket out of range" };
  }
  const leaf = bytesToHex(memberLeaf(secret));
  if (!state.members.has(leaf)) return { ok: false, reason: "not a member" };
  const nf = bytesToHex(epochNullifier(state.epoch, secret));
  if (state.nullifiers.has(nf)) return { ok: false, reason: "already submitted this epoch" };
  state.nullifiers.add(nf);
  const key = bytesToHex(bucketKeyBytes(cutKeyBytes(cutKeyString(cut)), BigInt(bucket)));
  state.histogram.set(key, (state.histogram.get(key) ?? 0) + 1);
  return { ok: true };
}

export function nextEpoch(state: MockLedgerState): bigint {
  state.epoch += 1n;
  return state.epoch;
}

export function currentEpoch(state: MockLedgerState): bigint {
  return state.epoch;
}

export function histogramForCut(state: MockLedgerState, cut: Cut): number[] {
  const ck = cutKeyBytes(cutKeyString(cut));
  const hist = Array(BUCKET_COUNT).fill(0);
  for (let b = 0; b < BUCKET_COUNT; b++) {
    hist[b] = state.histogram.get(bytesToHex(bucketKeyBytes(ck, BigInt(b)))) ?? 0;
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
// only the bucket index (exactly one key changes, by exactly 1).
export function assertNoExactLeak(prev: Map<string, number>, next: Map<string, number>): boolean {
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
