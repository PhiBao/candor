/**
 * Pure session helpers — safe to import statically (no wasm, no network).
 * Wallet detection follows the official midnight example: scan window.midnight
 * for any connector with a compatible apiVersion.
 */
const COMPATIBLE_MAJOR = "4";
const ADDR_KEY = "candor:contractAddress";
const ISSUER_KEY_KEY = "candor:issuerKey";
// Baked at build time (fly deploy build arg) so visitors land on the deployed contract
const BAKED_ADDRESS: string = (import.meta as any).env?.VITE_CONTRACT_ADDRESS ?? "";
const BAKED_ISSUER_KEY: string = (import.meta as any).env?.VITE_ISSUER_KEY ?? "";

export function isLaceAvailable(): boolean {
  try {
    const midnight = (window as any).midnight as Record<string, any> | undefined;
    if (!midnight || typeof midnight !== "object") return false;
    return Object.values(midnight).some(
      (wallet) =>
        !!wallet &&
        typeof wallet === "object" &&
        "apiVersion" in wallet &&
        typeof wallet.apiVersion === "string" &&
        wallet.apiVersion.split(".")[0] === COMPATIBLE_MAJOR,
    );
  } catch { return false; }
}

function readStorage(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function safeSessionGet(key: string): string | null {
  try { return sessionStorage.getItem(key); } catch { return null; }
}
function safeSessionSet(key: string, val: string) {
  try { sessionStorage.setItem(key, val); } catch {}
}

export function getStoredContractAddress(): string | null {
  return readStorage(ADDR_KEY) || BAKED_ADDRESS || null;
}

export function setStoredContractAddress(address: string): void {
  try { localStorage.setItem(ADDR_KEY, address); } catch {}
}


export function getBakedIssuerKey(): string | null {
  const fromEnv = BAKED_ISSUER_KEY.replace(/^0x/, "").trim();
  if (/^[0-9a-fA-F]{64}$/.test(fromEnv)) return fromEnv.toLowerCase();
  return null;
}

export function getStoredIssuerKey(): string | null {
  try {
    const v = localStorage.getItem(ISSUER_KEY_KEY);
    if (v && /^[0-9a-fA-F]{64}$/.test(v.replace(/^0x/, "").trim())) return v.replace(/^0x/, "").trim().toLowerCase();
  } catch {}
  return getBakedIssuerKey();
}

export function getEffectiveIssuerKey(): string | null {
  // localStorage wins over baked, so operator can rotate without redeploy
  return getStoredIssuerKey();
}
