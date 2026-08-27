/**
 * Deployment script for Candor on Midnight.
 * Mirrors the pattern from docs/deploy-and-operate.md and midnight-rps-sample-app pkgs/cli.
 * Requires: proof server on :6300, funded wallet with DUST, indexer endpoints.
 *
 * Usage:
 *   pnpm --filter @candor/contract deploy:preprod
 *   (or: node --loader ts-node/esm src/deploy.ts preprod)
 */
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { levelPrivateStateProvider } from "@midnight-ntwrk/midnight-js-level-private-state-provider";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { NodeZkConfigProvider } from "@midnight-ntwrk/midnight-js-node-zk-config-provider";
import { httpClientProofProvider } from "@midnight-ntwrk/midnight-js-http-client-proof-provider";
import { deployContract, findDeployedContract } from "@midnight-ntwrk/midnight-js-contracts";
import { CompiledContract } from "@midnight-ntwrk/midnight-js-contracts"; // re-export via midnight-js-contracts in 4.1.x docs uses @midnight-ntwrk/midnight-js-contracts

// NOTE: In Midnight.js 4.1.x, import via protocol subpaths where needed:
// import { Contract } from "./managed/candor/contract/index.js";
// import { witnesses } from "./witnesses.js";

const NETWORKS = {
  undeployed: {
    indexer: "http://localhost:8088/api/v4/graphql",
    indexerWS: "ws://localhost:8088/api/v4/graphql/ws",
    node: "http://localhost:9944",
    proofServer: "http://localhost:6300",
  },
  preprod: {
    indexer: process.env.MIDNIGHT_INDEXER ?? "https://indexer.preprod.midnight.network/api/v4/graphql",
    indexerWS: process.env.MIDNIGHT_INDEXER_WS ?? "wss://indexer.preprod.midnight.network/api/v4/graphql/ws",
    proofServer: process.env.PROOF_SERVER ?? "http://localhost:6300",
    node: process.env.MIDNIGHT_NODE ?? "https://rpc.preprod.midnight.network",
  },
} as const;

async function main() {
  const network = (process.argv[2] as keyof typeof NETWORKS) ?? (process.env.MIDNIGHT_NETWORK as any) ?? "preprod";
  if (!(network in NETWORKS)) throw new Error(`unknown network ${network}`);
  const cfg = NETWORKS[network as keyof typeof NETWORKS];

  setNetworkId(network as any);
  console.log(`[deploy] network=${network} indexer=${cfg.indexer}`);

  // Providers setup is intentionally verbose and mirrors docs to avoid hidden magic.
  // In production, privateStateProvider password must be derived, not hardcoded.
  const privateStateProvider = levelPrivateStateProvider({
    privateStateStoreName: "candor-private-state",
    signingKeyStoreName: "candor-signing-keys",
    privateStoragePasswordProvider: () => process.env.CANDOR_STATE_PASSWORD ?? "Candor-Demo-2026!!!",
    accountId: process.env.MIDNIGHT_WALLET_ADDRESS ?? "demo-account",
  });

  const publicDataProvider = indexerPublicDataProvider(cfg.indexer, cfg.indexerWS);
  const zkConfigPath = new URL("./managed/candor", import.meta.url).pathname;
  const zkConfigProvider = new NodeZkConfigProvider<"submit" | "enroll" | "getHistogram">(zkConfigPath);
  const proofProvider = httpClientProofProvider(cfg.proofServer, zkConfigProvider as any);

  console.log("[deploy] providers ready, zkConfig at", zkConfigPath);
  console.log("[deploy] To complete deployment, wire walletProvider (WalletFacade) and call deployContract:");
  console.log(`
  import { Contract } from "./managed/candor/contract/index.js";
  import { witnesses } from "./witnesses.js";

  const compiled = CompiledContract.withCompiledFileAssets(
    CompiledContract.withWitnesses(CompiledContract.make("candor", Contract), witnesses),
    zkConfigPath
  );
  const deployed = await deployContract(providers, {
    compiledContract: compiled,
    privateStateId: "candorPrivateState",
    initialPrivateState: { secret: new Uint8Array(32) },
    // constructor arg: issuerCommit
    constructorArgs: { issuerCommit: new Uint8Array(32) },
  });
  console.log("deployed at", deployed.deployTxData.public.contractAddress);
  `);

  // Dry-run verification: ensure verifier keys are readable
  const vk = await (zkConfigProvider as any).getVerifierKey("submit").catch(() => null);
  console.log("[deploy] verifierKey(submit) present:", !!vk && vk.length > 0);

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
