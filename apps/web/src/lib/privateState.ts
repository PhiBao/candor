/**
 * Minimal in-memory PrivateStateProvider, matching the shape used by
 * midnightntwrk/example-bboard.
 *
 * Its own module for a concrete reason: `midnight.ts` reads `window.location` at
 * module scope (it builds the same-origin prover URI eagerly), so importing
 * anything from it in a Node test environment throws `window is not defined`.
 * The provider itself has no browser dependency, and keeping it here lets both
 * the v1 and v2 chain modules share it without either dragging the other in.
 *
 * Note this holds private state in memory only — a page reload loses it. That is
 * correct for the submit/enroll flows (each proof carries its own private state)
 * and avoids persisting anything salary-related to disk.
 */
import type { PrivateStateProvider } from "@midnight-ntwrk/midnight-js-types";
import type { SigningKey } from "@midnight-ntwrk/midnight-js-protocol/compact-runtime";

export function inMemoryPrivateStateProvider<PSI extends string, PS>(): PrivateStateProvider<PSI, PS> {
  const states = new Map<string, Map<PSI, PS>>();
  const signingKeys = new Map<string, SigningKey>();
  let address: string | null = null;
  const requireAddress = () => {
    if (address === null) throw new Error("Contract address not set");
    return address;
  };
  return {
    setContractAddress(a: string) {
      address = a;
    },
    async set(key: PSI, state: PS) {
      const scoped = states.get(requireAddress()) ?? new Map();
      scoped.set(key, state);
      states.set(requireAddress(), scoped);
    },
    async get(key: PSI) {
      return states.get(requireAddress())?.get(key) ?? null;
    },
    async remove(key: PSI) {
      states.get(requireAddress())?.delete(key);
    },
    async clear() {
      states.delete(requireAddress());
    },
    async setSigningKey(a: string, k: SigningKey) {
      signingKeys.set(a, k);
    },
    async getSigningKey(a: string) {
      return signingKeys.get(a) ?? null;
    },
    async removeSigningKey(a: string) {
      signingKeys.delete(a);
    },
    async clearSigningKeys() {
      signingKeys.clear();
    },
  } as unknown as PrivateStateProvider<PSI, PS>;
}