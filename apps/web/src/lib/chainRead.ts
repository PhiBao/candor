/**
 * Live on-chain reads — no wallet required.
 * Queries the Preprod indexer for the deployed contract's public state and
 * shapes it like a LedgerSnapshot so the existing UI functions work unchanged.
 * Falls back gracefully: callers decide what to show when the read fails.
 */
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { asContractAddress } from "@midnight-ntwrk/midnight-js-types";
import { ledger as candorLedger } from "@candor/contract/managed/candor/contract";
import { bucketKeyBytes, cutKeyBytes } from "@candor/shared/hash";
import { BUCKET_COUNT, type Cut, cutKeyString } from "@candor/shared";
import type { LedgerSnapshot } from "./ledger";

// Same-origin proxy (Caddy on Fly, Vite in dev) — the indexer sends no CORS
// headers, so direct browser reads are blocked.
const ORIGIN = window.location.origin;
const INDEXER_HTTP = `${ORIGIN}/indexer/midnight-preprod/`;
const INDEXER_WS = `${ORIGIN.replace(/^http/, "ws")}/indexer/midnight-preprod/ws`;

const provider = indexerPublicDataProvider(INDEXER_HTTP, INDEXER_WS);

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
}

/**
 * Read the deployed contract's public ledger state.
 * Throws on failure — callers must handle (sample data is the fallback).
 */
export async function readCandorState(contractAddress: string): Promise<{
  epoch: string;
  members: number;
  submissions: number;
  snapshot: LedgerSnapshot;
}> {
  const state = await withTimeout(provider.queryContractState(asContractStateAddress(contractAddress)), 15_000);
  if (!state) throw new Error("contract state not found on indexer");
  const led = candorLedger((state as any).data ?? state);

  const epoch = led.epochCount.lookup(new Uint8Array([101]));
  const histogram: Record<string, number> = {};
  // Populate histogram for all Wave 1 cuts so public pages are live
  const { allCuts } = await import("@candor/shared");
  for (const cut of allCuts()) {
    const ck = cutKeyBytes(cutKeyString(cut));
    for (let b = 0; b < BUCKET_COUNT; b++) {
      let v = 0;
      try { v = Number(led.histogram.lookup(bucketKeyBytes(ck, BigInt(b)))); } catch { v = 0; }
      if (v > 0) histogram[`${cutKeyString(cut)}:b${b}`] = v;
    }
  }
  const members = Number(led.members.size());
  const submissions = Number(led.nullifiers.size());

  return {
    epoch: epoch.toString(),
    members,
    submissions,
    snapshot: {
      members: Array.from({ length: members }, (_, i) => `member:${i}`),
      nullifiers: Array.from({ length: submissions }, (_, i) => `nf:${i}`),
      histogram,
      epoch: epoch.toString(),
    },
  };
}

/** Fill a snapshot's histogram with live counts for the given cut. */
export async function readHistogramInto(
  snapshot: LedgerSnapshot,
  contractAddress: string,
  cut: Cut,
): Promise<void> {
  const state = await withTimeout(provider.queryContractState(asContractStateAddress(contractAddress)), 15_000);
  if (!state) throw new Error("contract state not found on indexer");
  const led = candorLedger((state as any).data ?? state);
  const ck = cutKeyBytes(cutKeyString(cut));
  for (let b = 0; b < BUCKET_COUNT; b++) {
    let v = 0;
    try {
      v = Number(led.histogram.lookup(bucketKeyBytes(ck, BigInt(b))));
    } catch {
      v = 0;
    }
    if (v > 0) snapshot.histogram[`${cutKeyString(cut)}:b${b}`] = v;
  }
}

function asContractStateAddress(address: string): any {
  return asContractAddress(address);
}
