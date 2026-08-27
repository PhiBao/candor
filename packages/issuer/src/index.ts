/**
 * Candor issuer — the ONLY trusted component.
 * - Verifies work email (Wave 1: code via console; production: email provider)
 * - Inserts member leaf into contract (Set<Bytes<32>>)
 * - Maintains append-only leaf log and per-epoch rate limits
 *
 * Trust boundary documented in README:
 * Issuer learns WHO is a member, but cannot link a SUBMISSION to a member
 * because it never sees the member's secret (needed to derive nullifier).
 */
import express from "express";
import cors from "cors";
import crypto from "node:crypto";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT ? Number(process.env.PORT) : 8787;

// In-memory store for Wave 1 demo. Replace with DB in production.
const pendingCodes = new Map<string, string>(); // email -> code
const verifiedEmails = new Set<string>();
const leafLog: { email: string; leafHex: string; at: string }[] = [];
const leaves = new Set<string>(); // hex

function sha256Hex(buf: Uint8Array): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function leafForSecretHex(secretHex: string): string {
  const secret = Buffer.from(secretHex.replace(/^0x/, ""), "hex");
  const pad = Buffer.alloc(32, 0);
  Buffer.from("candor:member:v1").copy(pad);
  const h = crypto.createHash("sha256").update(Buffer.concat([pad, secret])).digest("hex");
  return "0x" + h;
}

app.get("/health", (_req, res) => res.json({ ok: true, leaves: leaves.size, verified: verifiedEmails.size }));

// Step 1: request code (Wave 1: code returned in response + logged; prod: email it)
app.post("/verify/request", (req, res) => {
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) return res.status(400).json({ error: "invalid email" });
  // Wave 1 allow-list: crypto-native beachhead domains, but accept any for demo
  const code = String(Math.floor(100000 + Math.random() * 900000));
  pendingCodes.set(email, code);
  console.log(`[issuer] code for ${email}: ${code}`);
  // Return code in response for demo so no real email infra needed
  res.json({ ok: true, demoCode: code, message: "Demo mode: code returned directly. Check server logs." });
});

// Step 2: confirm code
app.post("/verify/confirm", (req, res) => {
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const code = String(req.body?.code ?? "").trim();
  const expected = pendingCodes.get(email);
  if (!expected || expected !== code) return res.status(400).json({ error: "invalid code" });
  pendingCodes.delete(email);
  verifiedEmails.add(email);
  res.json({ ok: true });
});

// Step 3: enroll leaf (client generates secret locally, sends only leaf)
app.post("/enroll", (req, res) => {
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const leafHex = String(req.body?.leafHex ?? "").trim().toLowerCase();
  if (!verifiedEmails.has(email)) return res.status(403).json({ error: "email not verified" });
  if (!/^0x[0-9a-f]{64}$/.test(leafHex)) return res.status(400).json({ error: "invalid leafHex" });
  if (leaves.has(leafHex)) return res.status(409).json({ error: "already enrolled" });
  // Per-epoch rate limit: one leaf per email per epoch (Wave 1 epoch is static, so one ever)
  const existingForEmail = leafLog.find((e) => e.email === email);
  if (existingForEmail) return res.status(409).json({ error: "email already has a leaf this epoch" });

  leaves.add(leafHex);
  leafLog.push({ email, leafHex, at: new Date().toISOString() });

  // In production, this would call contract.enroll(leafHex) via wallet + proof server.
  // For Wave 1 mock demo, the web app's local ledger is updated optimistically;
  // this endpoint is the source of truth for the append-only log.
  console.log(`[issuer] enrolled ${email} -> ${leafHex}`);
  res.json({ ok: true, leafHex });
});

// Public log for auditability (emails redacted to domain for privacy)
app.get("/log", (_req, res) => {
  const redacted = leafLog.map((e) => ({
    domain: e.email.split("@")[1] ?? "",
    leafHex: e.leafHex,
    at: e.at,
  }));
  res.json({ count: redacted.length, entries: redacted });
});

app.get("/leaves", (_req, res) => {
  res.json({ count: leaves.size, leaves: Array.from(leaves) });
});

// Helper: compute leaf from secret (useful for testing, not used in prod flow where client computes)
app.post("/leaf", (req, res) => {
  const secretHex = String(req.body?.secretHex ?? "").trim();
  if (!/^0x[0-9a-f]{64}$/.test(secretHex) && !/^[0-9a-f]{64}$/.test(secretHex)) {
    return res.status(400).json({ error: "secretHex must be 32 bytes hex" });
  }
  const leafHex = leafForSecretHex(secretHex);
  res.json({ leafHex });
});

app.listen(PORT, () => {
  console.log(`[issuer] listening on http://localhost:${PORT}`);
  console.log(`[issuer] health: http://localhost:${PORT}/health`);
});
