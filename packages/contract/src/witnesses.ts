import type { Ledger } from "./managed/candor/contract/index.js";
import type { WitnessContext } from "@midnight-ntwrk/compact-runtime";

export type CandorPrivateState = {
  /** 32-byte user secret, generated locally, never leaves the device */
  secret: Uint8Array;
  /** issuer secret key — present ONLY in the issuer operator's private state */
  issuerKey?: Uint8Array;
};

export function createPrivateState(secret?: Uint8Array, issuerKey?: Uint8Array): CandorPrivateState {
  let s = secret;
  if (s) {
    if (s.length !== 32) throw new Error("secret must be 32 bytes");
  } else {
    s = new Uint8Array(32);
    crypto.getRandomValues(s);
  }
  if (issuerKey) {
    if (issuerKey.length !== 32) throw new Error("issuerKey must be 32 bytes");
    return { secret: s, issuerKey };
  }
  return { secret: s };
}

export const witnesses = {
  secret: ({ privateState }: WitnessContext<Ledger, CandorPrivateState>): [CandorPrivateState, Uint8Array] => {
    return [privateState, privateState.secret];
  },
  issuerKey: ({ privateState }: WitnessContext<Ledger, CandorPrivateState>): [CandorPrivateState, Uint8Array] => {
    if (!privateState.issuerKey) throw new Error("issuerKey: no issuer key in private state");
    return [privateState, privateState.issuerKey];
  },
};
