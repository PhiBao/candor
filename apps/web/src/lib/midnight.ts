/**
 * Browser-side Midnight wiring for Candor — the REAL chain path.
 *
 * Follows the official midnightntwrk/example-bboard pattern:
 * - wallet detection scans window.midnight for ANY connector with a compatible
 *   apiVersion (Lace or others) — never a hardcoded key
 * - the wallet's own configuration supplies the proof-server and indexer URIs
 *   (Lace runs a prover internally; the witness/salary never leaves the device)
 * - balancing + submission are wrapped around the connected wallet API
 */
import { FetchZkConfigProvider } from "@midnight-ntwrk/midnight-js-fetch-zk-config-provider";
import { httpClientProofProvider } from "@midnight-ntwrk/midnight-js-http-client-proof-provider";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import {
  deployContract,
  findDeployedContract,
  type DeployedContract,
  type FoundContract,
} from "@midnight-ntwrk/midnight-js-contracts";
import { CompiledContract } from "@midnight-ntwrk/midnight-js-protocol/compact-js";
import { toHex, fromHex, type ContractAddress, type SigningKey } from "@midnight-ntwrk/midnight-js-protocol/compact-runtime";
import { Transaction } from "@midnight-ntwrk/midnight-js-protocol/ledger";
import type { ConnectedAPI, InitialAPI } from "@midnight-ntwrk/dapp-connector-api";
import type { PrivateStateProvider } from "@midnight-ntwrk/midnight-js-types";
import { Contract as CandorContract } from "@candor/contract/managed/candor/contract";
import { witnesses, createPrivateState, type CandorPrivateState } from "@candor/contract/witnesses";
import { issuerCommitment } from "@candor/shared/hash";

export type CandorCircuitId = "submit" | "enroll" | "nextEpoch" | "getHistogram" | "readEpoch";

/** Compatible connector API major (aligns with example-bboard: '4.x') */
const COMPATIBLE_MAJOR = "4";

// ---- wallet detection (generic, per official example) ----------------------

function getFirstCompatibleWallet(): InitialAPI | undefined {
  const midnight = (window as any).midnight as Record<string, InitialAPI> | undefined;
  if (!midnight) return undefined;
  return Object.values(midnight).find(
    (wallet): wallet is InitialAPI =>
      !!wallet &&
      typeof wallet === "object" &&
      "apiVersion" in wallet &&
      typeof wallet.apiVersion === "string" &&
      wallet.apiVersion.split(".")[0] === COMPATIBLE_MAJOR,
  );
}

export function isLaceAvailable(): boolean {
  return getFirstCompatibleWallet() !== undefined;
}

/**
 * Connect to the first compatible wallet. Polls briefly — extensions inject
 * `window.midnight` after page load.
 */
export async function connectToWallet(networkId = "preprod"): Promise<ConnectedAPI> {
  const deadline = Date.now() + 5_000;
  let initialAPI: InitialAPI | undefined;
  while (Date.now() < deadline) {
    initialAPI = getFirstCompatibleWallet();
    if (initialAPI) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  // Debug aid: shows which wallets injected and their API versions
  const midnight = (window as any).midnight as Record<string, any> | undefined;
  console.info(
    "[candor] window.midnight wallets:",
    midnight ? Object.fromEntries(Object.entries(midnight).map(([k, v]) => [k, v?.apiVersion ?? "<no apiVersion>"])) : "none",
  );
  if (!initialAPI) {
    throw new Error("Could not find a Midnight wallet connector. Extension installed and enabled?");
  }
  const connectedAPI = await initialAPI.connect(networkId);
  return connectedAPI;
}

// ---- in-memory private state (per-session; the app re-seeds the secret) ----

/** Minimal in-memory PrivateStateProvider (same shape as example-bboard's). */
function inMemoryPrivateStateProvider<PSI extends string, PS>(): PrivateStateProvider<PSI, PS> {
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

// ---- provider assembly ------------------------------------------------------

export type CandorProviders = {
  connectedAPI: ConnectedAPI;
  zkConfigProvider: FetchZkConfigProvider<string>;
  publicDataProvider: ReturnType<typeof indexerPublicDataProvider>;
  privateStateProvider: PrivateStateProvider<string, CandorPrivateState>;
  proofProvider: ReturnType<typeof httpClientProofProvider>;
  walletProvider: unknown;
  midnightProvider: unknown;
};

/** Connect to the wallet and assemble the full provider bundle for Candor. */
export async function connectCandor(networkId = "preprod"): Promise<CandorProviders> {
  const connectedAPI = await connectToWallet(networkId);

  const zkConfigProvider: FetchZkConfigProvider<string> = new FetchZkConfigProvider("/zk/candor");

  // The wallet supplies its own proof-server and indexer endpoints
  const config = await connectedAPI.getConfiguration();
  if (!config.indexerUri) throw new Error("Wallet configuration missing indexerUri");

  const privateStateProvider = inMemoryPrivateStateProvider<string, CandorPrivateState>();

  const proofProvider = httpClientProofProvider(
    config.proverServerUri ?? "http://localhost:6300",
    zkConfigProvider as any,
  );

  const publicDataProvider = indexerPublicDataProvider(config.indexerUri, config.indexerWsUri);

  // WalletProvider wrapper — balances transactions through the wallet
  const shieldedAddresses = await connectedAPI.getShieldedAddresses();
  const walletProvider = {
    getCoinPublicKey: () => shieldedAddresses.shieldedCoinPublicKey,
    getEncryptionPublicKey: () => shieldedAddresses.shieldedEncryptionPublicKey,
    balanceTx: async (tx: any, _ttl?: Date) => {
      const serialized = toHex(tx.serialize());
      const received = await connectedAPI.balanceUnsealedTransaction(serialized);
      return Transaction.deserialize("signature", "proof", "binding", fromHex(received.tx));
    },
  };

  // MidnightProvider wrapper — submits finalized transactions through the wallet
  const midnightProvider = {
    submitTx: async (tx: any) => {
      await connectedAPI.submitTransaction(toHex(tx.serialize()));
      const txIdentifiers = tx.identifiers();
      return txIdentifiers[0];
    },
  };

  return {
    connectedAPI,
    zkConfigProvider,
    publicDataProvider,
    privateStateProvider,
    proofProvider,
    walletProvider,
    midnightProvider,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function compiledContract(): any {
  // keys/zkir are fetched from /zk/candor; witness code lives in @candor/contract
  const withWitnessesFn = CompiledContract.withWitnesses as any;
  const withAssetsFn = CompiledContract.withCompiledFileAssets as any;
  return withAssetsFn(withWitnessesFn(CompiledContract.make("candor", CandorContract), witnesses), "/zk/candor");
}

type CandorInstance = InstanceType<typeof CandorContract>;
type Found = FoundContract<CandorInstance>;
export type DeployedCandor = DeployedContract<CandorInstance>;

/**
 * Deploy Candor. The connected wallet becomes the issuer: its private state
 * carries the issuerKey witness used by enroll/nextEpoch.
 */
export async function deployCandor(providers: CandorProviders, issuerKey: Uint8Array): Promise<DeployedCandor> {
  const ps: CandorPrivateState = { ...createPrivateState(), issuerKey };
  const deployed = (await deployContract(providers as any, {
    compiledContract: compiledContract(),
    privateStateId: "candor",
    initialPrivateState: ps,
    args: [issuerCommitment(issuerKey)],
  } as any)) as unknown as DeployedCandor;
  return deployed;
}

/** Connect to an already-deployed Candor instance. */
export async function findCandor(
  providers: CandorProviders,
  contractAddress: string,
  opts: { asIssuer?: boolean; issuerKey?: Uint8Array; secret?: Uint8Array } = {},
): Promise<Found> {
  // The user secret must be the SAME persistent value on every call: it derives
  // both the membership leaf and the epoch nullifier inside the circuit.
  const ps = opts.asIssuer
    ? { ...createPrivateState(opts.secret), issuerKey: opts.issuerKey }
    : createPrivateState(opts.secret);
  return (await findDeployedContract(providers as any, {
    compiledContract: compiledContract(),
    contractAddress,
    privateStateId: "candor",
    initialPrivateState: ps,
  } as any)) as unknown as Found;
}

/** Submit one bucketed salary — real on-chain transaction via the wallet. */
export async function submitOnChain(
  providers: CandorProviders,
  contractAddress: string,
  opts: { cutKey: Uint8Array; bucket: number; secret: Uint8Array },
): Promise<any> {
  const found = await findCandor(providers, contractAddress, { secret: opts.secret });
  return (found.callTx as any).submit(opts.cutKey, BigInt(opts.bucket));
}

/** Issuer-only: enroll a member leaf (operator wallet signs the tx). */
export async function enrollOnChain(
  providers: CandorProviders,
  contractAddress: string,
  opts: { memberLeaf: Uint8Array; issuerKey: Uint8Array },
): Promise<any> {
  const found = await findCandor(providers, contractAddress, { asIssuer: true, issuerKey: opts.issuerKey });
  return (found.callTx as any).enroll(opts.memberLeaf);
}

/** Issuer-only: advance the epoch, re-opening submissions for everyone. */
export async function nextEpochOnChain(
  providers: CandorProviders,
  contractAddress: string,
  opts: { issuerKey: Uint8Array },
): Promise<any> {
  const found = await findCandor(providers, contractAddress, { asIssuer: true, issuerKey: opts.issuerKey });
  return (found.callTx as any).nextEpoch();
}

// ---- session helpers -------------------------------------------------------

const ADDR_KEY = "candor:contractAddress";

export function getStoredContractAddress(): string | null {
  try {
    return localStorage.getItem(ADDR_KEY);
  } catch {
    return null;
  }
}

export function setStoredContractAddress(address: string): void {
  localStorage.setItem(ADDR_KEY, address);
}
