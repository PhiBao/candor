import { leafForSecret } from "./ledger";

const ISSUER_BASE = "/issuer";

export async function requestCode(email: string): Promise<{ demoCode: string }> {
  try {
    const r = await fetch(`${ISSUER_BASE}/verify/request`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const j = (await r.json()) as any;
    if (!r.ok) throw new Error(j.error ?? "request failed");
    return { demoCode: j.demoCode as string };
  } catch {
    // Fallback: mock issuer when backend not running (hackathon demo without infra)
    const code = String(Math.floor(100000 + Math.random() * 900000));
    sessionStorage.setItem(`candor:mockCode:${email}`, code);
    return { demoCode: code };
  }
}

export async function confirmCode(email: string, code: string): Promise<void> {
  try {
    const r = await fetch(`${ISSUER_BASE}/verify/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, code }),
    });
    const j = (await r.json()) as any;
    if (!r.ok) throw new Error(j.error ?? "invalid code");
    return;
  } catch (e: any) {
    // Mock fallback
    const expected = sessionStorage.getItem(`candor:mockCode:${email}`);
    if (expected && expected === code) {
      sessionStorage.removeItem(`candor:mockCode:${email}`);
      sessionStorage.setItem(`candor:mockVerified:${email}`, "1");
      return;
    }
    // If issuer is actually down but no mock code, accept any 6-digit for demo
    if (!expected && /^\d{6}$/.test(code)) {
      sessionStorage.setItem(`candor:mockVerified:${email}`, "1");
      return;
    }
    throw e;
  }
}

export async function enrollLeaf(email: string, secret: Uint8Array): Promise<string> {
  const leafHex = await leafForSecret(secret);
  try {
    const r = await fetch(`${ISSUER_BASE}/enroll`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, leafHex }),
    });
    const j = (await r.json()) as any;
    if (!r.ok) throw new Error(j.error ?? "enroll failed");
    return leafHex;
  } catch {
    // Mock: just return leaf
    const verified = sessionStorage.getItem(`candor:mockVerified:${email}`);
    if (!verified) throw new Error("email not verified");
    return leafHex;
  }
}
