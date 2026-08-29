/**
 * Pure session helpers — safe to import statically (no wasm, no network).
 * Wallet detection follows the official midnight example: scan window.midnight
 * for any connector with a compatible apiVersion.
 */
const COMPATIBLE_MAJOR = "4";
const ADDR_KEY = "candor:contractAddress";
// Baked at build time (fly deploy build arg) so visitors land on the deployed contract
const BAKED_ADDRESS: string = (import.meta as any).env?.VITE_CONTRACT_ADDRESS ?? "";

export function isLaceAvailable(): boolean {
  const midnight = (window as any).midnight as Record<string, any> | undefined;
  if (!midnight) return false;
  return Object.values(midnight).some(
    (wallet) =>
      !!wallet &&
      typeof wallet === "object" &&
      "apiVersion" in wallet &&
      typeof wallet.apiVersion === "string" &&
      wallet.apiVersion.split(".")[0] === COMPATIBLE_MAJOR,
  );
}

export function getStoredContractAddress(): string | null {
  try {
    return localStorage.getItem(ADDR_KEY) || BAKED_ADDRESS || null;
  } catch {
    return BAKED_ADDRESS || null;
  }
}

export function setStoredContractAddress(address: string): void {
  localStorage.setItem(ADDR_KEY, address);
}
