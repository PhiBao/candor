import type { WitnessContext } from "@midnight-ntwrk/compact-runtime";
import type { Ledger } from "./managed/gotit/contract/index.js";

/**
 * Witness implementations for the Wave 2 (v2) contract.
 *
 * These run inside the prover. `secret` and `issuerKey` come from the device and
 * are never disclosed; everything the circuit needs that is not private is
 * passed in as a circuit argument, which is why the submit signature carries
 * categoryKey, gender, component and bucket in the clear.
 */
export type GotItPrivateState = {
  /** 32-byte user secret, generated locally, never leaves the device. */
  secret: Uint8Array;
  /** Issuer secret key — present ONLY in the issuer operator's private state. */
  issuerKey?: Uint8Array;
};

export function createPrivateState(secret?: Uint8Array, issuerKey?: Uint8Array): GotItPrivateState {
  return {
    secret: secret ?? new Uint8Array(32),
    ...(issuerKey ? { issuerKey } : {}),
  };
}

export const witnesses = {
  secret: ({ privateState }: WitnessContext<Ledger, GotItPrivateState>): [GotItPrivateState, Uint8Array] => [
    privateState,
    privateState.secret,
  ],
  issuerKey: ({ privateState }: WitnessContext<Ledger, GotItPrivateState>): [GotItPrivateState, Uint8Array] => [
    privateState,
    privateState.issuerKey ?? new Uint8Array(32),
  ],
};

export type { Ledger };
