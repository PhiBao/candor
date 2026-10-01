/**
 * Pure session helpers — safe to import statically (no wasm, no network).
 * Wallet detection follows the official midnight example: scan window.midnight
 * for any connector with a compatible apiVersion.
 */
const COMPATIBLE_MAJOR = "4";
const ADDR_KEY = "gotit:contractAddress";
// v2 gets its own key so deploying it never repoints the v1 report. Empty until
// an operator deploys v2 or sets VITE_CONTRACT_ADDRESS_V2 at build time.
const V2_ADDR_KEY = "gotit:contractV2";
const ISSUER_KEY_KEY = "gotit:issuerKey";
// Renamed from "candor:*" in Wave 2. Read the old keys as a fallback so a
// returning visitor keeps their stored contract address and issuer key instead
// of silently losing them. Old keys are left in place (never deleted) so a
// rollback to Wave 1 still finds them.
const LEGACY_PREFIX = "candor:";
// Baked at build time (fly deploy build arg) so visitors land on the deployed contract
const BAKED_ADDRESS: string = (import.meta as any).env?.VITE_CONTRACT_ADDRESS ?? "";
const BAKED_V2_ADDRESS: string = (import.meta as any).env?.VITE_CONTRACT_ADDRESS_V2 ?? "";
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

/** Read a key, transparently falling back to its pre-rename `candor:` form. */
function readStorage(key: string): string | null {
  try {
    const now = localStorage.getItem(key);
    if (now !== null) return now;
    if (key.startsWith("gotit:")) return localStorage.getItem(LEGACY_PREFIX + key.slice("gotit:".length));
    return null;
  } catch { return null; }
}
function safeSessionGet(key: string): string | null {
  try {
    const now = sessionStorage.getItem(key);
    if (now !== null) return now;
    if (key.startsWith("gotit:")) return sessionStorage.getItem(LEGACY_PREFIX + key.slice("gotit:".length));
    return null;
  } catch { return null; }
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

/**
 * The v2 (Wave 2) contract address, or null if v2 has not been deployed here.
 *
 * Deliberately a separate key from v1's. Pointing the report at v2 is an
 * explicit operator action, so a v2 deploy can never silently repoint the live
 * report at a ledger that happens to be empty.
 */
export function getStoredV2ContractAddress(): string | null {
  return readStorage(V2_ADDR_KEY) || BAKED_V2_ADDRESS || null;
}

export function setStoredV2ContractAddress(address: string): void {
  try { localStorage.setItem(V2_ADDR_KEY, address); } catch {}
}


export function getBakedIssuerKey(): string | null {
  const fromEnv = BAKED_ISSUER_KEY.replace(/^0x/, "").trim();
  if (/^[0-9a-fA-F]{64}$/.test(fromEnv)) return fromEnv.toLowerCase();
  return null;
}

export function getStoredIssuerKey(): string | null {
  const v = readStorage(ISSUER_KEY_KEY);
  if (v && /^[0-9a-fA-F]{64}$/.test(v.replace(/^0x/, "").trim())) return v.replace(/^0x/, "").trim().toLowerCase();
  return getBakedIssuerKey();
}

export function getEffectiveIssuerKey(): string | null {
  // localStorage wins over baked, so operator can rotate without redeploy
  return getStoredIssuerKey();
}
