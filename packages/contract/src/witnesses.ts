import type { Ledger } from "./managed/candor/contract/index.js";
import type { WitnessContext } from "@midnight-ntwrk/compact-runtime";

export type CandorPrivateState = {
  secret: Uint8Array; // 32 bytes, generated locally, never leaves device
};

export function createPrivateState(secret?: Uint8Array): CandorPrivateState {
  if (secret) {
    if (secret.length !== 32) throw new Error("secret must be 32 bytes");
    return { secret };
  }
  const s = new Uint8Array(32);
  crypto.getRandomValues(s);
  return { secret: s };
}

export const witnesses = {
  secret: ({ privateState }: WitnessContext<Ledger, CandorPrivateState>): [CandorPrivateState, Uint8Array] => {
    return [privateState, privateState.secret];
  },
};
