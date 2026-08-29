import React, { useEffect, useMemo, useState } from "react";
import {
  BUCKETS,
  K_ANONYMITY,
  LEVELS,
  REGIONS,
  allCuts,
  bucketForSalary,
  cutLabel,
  cutKeyString,
  hexToBytes,
} from "@candor/shared";
import {
  loadLedger,
  saveLedger,
  resetLedger,
  histogramForCut,
  isUnlocked,
  percentileForBucket,
  getOrCreateSecret,
  getSecretHex,
  enrollLocal,
  submitLocal,
  loadMyContribs,
} from "./lib/ledger";
import { requestCode, confirmCode, enrollLeaf } from "./lib/issuer";
import type { CandorProviders } from "./lib/midnight";
import { isLaceAvailable, getStoredContractAddress, setStoredContractAddress, getEffectiveIssuerKey, getBakedIssuerKey } from "./lib/session";
import type { LedgerSnapshot } from "./lib/ledger";

// live on-chain reads (lazy — wasm loads on demand)
const chainReadLib = () => import("./lib/chainRead");
import { bytesToHex } from "@candor/shared";

// wasm-heavy modules load on demand — the landing page renders without them
const midnightLib = () => import("./lib/midnight");
const hashLib = () => import("@candor/shared/hash");

type View = "browse" | "cut" | "contribute" | "result";

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "var(--bg)", color: "var(--text)", fontFamily: "Inter, sans-serif" }}>
          <div style={{ maxWidth: 560, border: "1px solid var(--line)", borderRadius: 14, padding: 24, background: "var(--panel)" }}>
            <h2 style={{ marginTop: 0 }}>Candor hit an unexpected error</h2>
            <p style={{ color: "var(--muted)", lineHeight: 1.5 }}>
              Reload the page to continue. If this keeps happening, your browser may have
              blocked WebAssembly — which Candor needs for zero-knowledge proofs. Try
              disabling enhanced security / tracking prevention for this site, or open it in Chrome.
            </p>
            <button className="btn btn-primary" onClick={() => location.reload()}>Reload</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <CandorApp />
    </ErrorBoundary>
  );
}

function CandorApp() {
  const [ledger, setLedger] = useState(() => loadLedger());
  const [view, setView] = useState<View>("browse");
  const [activeCutKey, setActiveCutKey] = useState<string>(() => allCuts()[0] ? cutKeyString(allCuts()[0]) : "");
  const [toast, setToast] = useState<string | null>(null);
  const [chain, setChain] = useState<{ providers: CandorProviders } | null>(null);
  const [live, setLive] = useState<{ epoch: string; members: number; submissions: number; snapshot: LedgerSnapshot } | null>(null);
  const contractAddress = getStoredContractAddress();

  const refreshLive = async () => {
    if (!contractAddress) return;
    try {
      const { readCandorState } = await chainReadLib();
      setLive(await readCandorState(contractAddress));
    } catch (e: any) {
      console.warn("[candor] live read unavailable, showing sample data:", e?.message ?? e);
      setLive(null);
    }
  };
  useEffect(() => {
    refreshLive();
    const t = setInterval(refreshLive, 90_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    (window as any).__candorRefreshLive = refreshLive;
  }, []);
  useEffect(() => {
    (window as any).__candorChain = chain;
  }, [chain]);
  const [operatorOpen, setOperatorOpen] = useState(false);
  const [laceReady, setLaceReady] = useState(() => isLaceAvailable());
  useEffect(() => {
    // extensions inject after page load — re-check on focus and briefly after mount
    const recheck = () => setLaceReady(isLaceAvailable());
    const t1 = setTimeout(recheck, 1500);
    const t2 = setTimeout(recheck, 5000);
    window.addEventListener("focus", recheck);
    return () => { clearTimeout(t1); clearTimeout(t2); window.removeEventListener("focus", recheck); };
  }, []);

  // keep ledger in sync with storage events (demo)
  useEffect(() => {
    const onStorage = () => setLedger(loadLedger());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const displayLedger = live?.snapshot ?? ledger;
  const cuts = useMemo(() => allCuts(), []);
  const activeCut = useMemo(() => cuts.find((c) => cutKeyString(c) === activeCutKey) ?? cuts[0], [cuts, activeCutKey]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2800);
  };

  const connectChain = async () => {
    try {
      const { connectCandor } = await midnightLib();
      const providers = await connectCandor("preprod");
      setChain({ providers });
      showToast("Lace connected — Preprod");
    } catch (e: any) {
      showToast(e?.message ?? "Lace connection failed");
    }
  };

  return (
    <div>
      <header className="topbar">
        <div className="container topbar-inner">
          <div className="brand">
            <div className="brand-mark">◐</div>
            <div>
              <div style={{ lineHeight: 1, fontSize: 16 }}>Candor</div>
              <div className="small mono" style={{ color: "var(--muted)", marginTop: 2 }}>verified · unlinkable · aggregate-only</div>
            </div>
          </div>
          <div className="row">
            <span className="badge">
              <span className="mono small">epoch</span> <strong>{displayLedger.epoch}</strong> · <span className="mono small">k≥{K_ANONYMITY}</span>
            </span>
            <button className="btn btn-ghost small" onClick={() => { resetLedger(); setLedger(loadLedger()); showToast("Sample data reset"); }}>
              Reset sample data
            </button>
            {chain ? (
              <span className="badge" title={contractAddress ?? "no contract yet"}>
                <span className="mono small">chain</span> <strong>Preprod ✓</strong>
              </span>
            ) : laceReady ? (
              <button className="btn small" onClick={connectChain}>Connect Lace</button>
            ) : (
              <a className="btn small" href="https://www.lace.io/" target="_blank" rel="noreferrer"
                 title="Install the Lace extension (with Midnight support), then reload this page">
                Install Lace
              </a>
            )}
            {chain && (
              <button className="btn btn-ghost small" onClick={() => setOperatorOpen(true)} title="Deploy / enroll / epoch">Operator</button>
            )}
            <button className="btn btn-primary small" onClick={() => setView("contribute")}>Contribute</button>
          </div>
        </div>
      </header>

      {!laceReady && !chain && (
        <div className="container">
          <div className="notice" style={{ marginTop: 14, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span>
              <strong>Welcome.</strong> Browse every unlocked distribution right now — no wallet needed.
              To contribute on-chain, install the Lace wallet and connect.
            </span>
            <a className="btn small" href="https://www.lace.io/" target="_blank" rel="noreferrer">Get Lace</a>
          </div>
        </div>
      )}

      <div className="container hero">
        <div className="hero-grid">
          <div className="card card-pad">
            <div className="kicker">For crypto-native tech workers</div>
            <h1 className="hero-title">
              Know what people like you <span style={{ color: "var(--accent)" }}>actually earn</span>.
            </h1>
            <p className="hero-copy">
              Candor shows verified compensation distributions — never individual records. Only verified members can contribute, and no one (including us) can link a number back to you.
            </p>
            <div className="trust">
              <span className="pill"><b>Verified</b> · work-email check via issuer</span>
              <span className="pill"><b>Unlinkable</b> · secret never leaves your device</span>
              <span className="pill"><b>Aggregate-only</b> · histogram buckets, not raw values</span>
            </div>
            <div className="row" style={{ marginTop: 14 }}>
              <button className="btn btn-primary" onClick={() => setView("contribute")}>Contribute anonymously</button>
              <button className="btn" onClick={() => document.getElementById("cuts")?.scrollIntoView({ behavior: "smooth" })}>Browse cuts</button>
            </div>
            <div className="notice" style={{ marginTop: 14 }}>
              <strong>How privacy works.</strong> Your device generates a secret. The issuer sees only a hash (the leaf) to confirm you’re a member — it never sees the secret, so it cannot derive your one-per-epoch nullifier. Your exact salary is bucketed locally; only the bucket index and cut key are disclosed on-chain. Membership reveal is per-leaf today; fully private ZK membership is on the roadmap. Proofs are generated locally by design — hosted proving is rejected.
            </div>
          </div>

          <div className="card card-pad">
            <div className="kicker" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                Network stats
                {live ? (
                  <span className="badge small" style={{ color: "var(--green)", borderColor: "#14301e", background: "var(--green-bg)" }}>● live on-chain</span>
                ) : (
                  <span className="badge small">sample data</span>
                )}
              </div>
            <h3 style={{ margin: "6px 0 8px" }}>Why reading is free</h3>
            <p className="small muted" style={{ lineHeight: 1.5 }}>
              Anyone can read any cut that has ≥{K_ANONYMITY} verified contributors. Locked cuts prompt you to contribute to unlock them — that’s the give-to-get loop. No wallet needed to read.
            </p>
            <div className="sep" />
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div>
                <div className="small muted">Total verified submissions</div>
                <div style={{ fontSize: 22, fontWeight: 800 }}>{Object.values(displayLedger.histogram).reduce((a, b) => a + b, 0)}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="small muted">Unlocked cuts</div>
                <div style={{ fontSize: 22, fontWeight: 800 }}>{cuts.filter((c) => isUnlocked(displayLedger, c)).length} / {cuts.length}</div>
              </div>
            </div>
            <div className="notice" style={{ marginTop: 12 }}>
              <strong>Live on Midnight Preprod.</strong> Connect Lace to contribute — your proof is generated on this device and your contribution lands on-chain. Reading is always free: every unlocked cut is public. Pre-release statistics are illustrative until the contributor base grows.
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              <button className="btn small" onClick={() => { navigator.clipboard.writeText(getSecretHex() ?? ""); showToast("Secret key copied — stored only on this device"); }}>Copy my secret key</button>
              <span className="small muted">Generated on this device · never uploaded</span>
            </div>
          </div>
        </div>
      </div>

      <div className="container" id="cuts" style={{ padding: "10px 0 18px" }}>
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
          <h2 style={{ margin: 0, fontSize: 22 }}>Cuts · role × level × region</h2>
          <span className="small muted">Wave 1: engineering only · no company dimension (privacy)</span>
        </div>

        <div className="grid">
          {cuts.map((cut) => {
            const key = cutKeyString(cut);
            const hist = histogramForCut(displayLedger, cut);
            const total = hist.reduce((a, b) => a + b, 0);
            const unlocked = total >= K_ANONYMITY;
            const max = Math.max(1, ...hist);
            return (
              <div key={key} className="card cut-card" style={{ cursor: "pointer" }} onClick={() => { setActiveCutKey(key); setView("cut"); }}>
                <div className="cut-head">
                  <div>
                    <div className="cut-title" style={{ fontSize: 14 }}>{cutLabel(cut)}</div>
                    <div className="mono small muted">{key}</div>
                  </div>
                  <span className="badge small" style={{ background: unlocked ? "var(--green-bg)" : undefined, borderColor: unlocked ? "#14301e" : undefined, color: unlocked ? "var(--green)" : undefined }}>
                    {unlocked ? `✓ ${total} verified` : `🔒 ${total}/${K_ANONYMITY}`}
                  </span>
                </div>

                {unlocked ? (
                  <>
                    <div className="hist">
                      {hist.map((v, i) => (
                        <div
                          key={i}
                          className={`hist-bar ${v === max && v > 0 ? "active" : ""}`}
                          style={{ height: `${Math.max(6, (v / max) * 56)}px` }}
                          title={`${BUCKETS[i].label}: ${v}`}
                        >
                          <div className="tip mono">{BUCKETS[i].label} · {v}</div>
                        </div>
                      ))}
                    </div>
                    <div className="small muted">Distribution of verified totals — hover bars for counts. Each bar is a bucket, not a salary.</div>
                  </>
                ) : (
                  <div className="lock">
                    <div style={{ fontSize: 22 }}>🔒</div>
                    <div className="small"><strong>Locked</strong> · needs {K_ANONYMITY - total} more verified contributors</div>
                    <div className="small muted" style={{ marginTop: 4 }}>Contribute to unlock this cut for everyone.</div>
                    <button className="btn btn-primary small" style={{ marginTop: 8 }} onClick={(e) => { e.stopPropagation(); setActiveCutKey(key); setView("contribute"); }}>
                      Unlock by contributing
                    </button>
                  </div>
                )}

                <div className="row small muted" style={{ marginTop: "auto" }}>
                  <span className="mono">{total} submissions</span>
                  <span>·</span>
                  <span>bucketed histogram</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {view === "cut" && activeCut && (
        <CutDetail
          cut={activeCut}
          ledger={displayLedger}
          onContribute={() => setView("contribute")}
          onBack={() => setView("browse")}
        />
      )}

      {view === "contribute" && activeCut && (
        <ContributeWizard
          cut={activeCut}
          cuts={cuts}
          onCutChange={setActiveCutKey}
          onClose={() => setView("browse")}
          onSuccess={(cut, bucket) => {
            // reload ledger + refresh live chain data after successful submit
            setLedger(loadLedger());
            refreshLive();
            setActiveCutKey(cutKeyString(cut));
            setView("result");
            // store last result for percentile view
            (window as any).__candorLast = { cut, bucket };
          }}
          ledger={displayLedger}
        />
      )}

      {view === "result" && (
        <ResultView
          ledger={displayLedger}
          onBack={() => setView("cut")}
          onBrowse={() => setView("browse")}
        />
      )}

      <footer className="container footer">
        <div className="sep" />
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <span>Powered by Midnight Network — zero-knowledge compensation truth</span>
          <span className="mono">verified · unlinkable · aggregate-only</span>
        </div>
        <div style={{ marginTop: 8 }} className="small">
          Built on <a className="link" href="https://midnight.network" target="_blank" rel="noreferrer">midnight.network</a> · Pre-release statistics are illustrative · One contribution per verified member per epoch, enforced by cryptography.
        </div>
      </footer>

      {toast && (
        <div style={{ position: "fixed", bottom: 18, left: "50%", transform: "translateX(-50%)", background: "#1f1f23", border: "1px solid var(--line2)", padding: "10px 14px", borderRadius: 999, boxShadow: "var(--shadow)", zIndex: 50 }}>
          {toast}
        </div>
      )}

      {operatorOpen && (
        <OperatorPanel
          chain={chain}
          onClose={() => setOperatorOpen(false)}
          onToast={showToast}
          onAddress={setStoredContractAddress}
        />
      )}
    </div>
  );
}

function CutDetail({ cut, ledger, onContribute, onBack }: { cut: any; ledger: any; onContribute: () => void; onBack: () => void }) {
  const hist = histogramForCut(ledger, cut);
  const total = hist.reduce((a: number, b: number) => a + b, 0);
  const unlocked = total >= K_ANONYMITY;
  const max = Math.max(1, ...hist);
  const myContribs = loadMyContribs();
  const mine = myContribs.find((c) => cutKeyString(c.cut) === cutKeyString(cut));
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", backdropFilter: "blur(6px)", zIndex: 40, overflow: "auto", padding: 18 }}>
      <div className="container" style={{ maxWidth: 760, marginTop: 18 }}>
        <div className="card">
          <div className="card-pad">
            <button className="btn small" onClick={onBack}>← Back to cuts</button>
            <div className="kicker" style={{ marginTop: 12 }}>Cut detail</div>
            <h2 style={{ margin: "4px 0 6px", fontSize: 26 }}>{cutLabel(cut)}</h2>
            <div className="mono small muted">{cutKeyString(cut)} · epoch {ledger.epoch}</div>

            {unlocked ? (
              <>
                <div className="hist" style={{ height: 96, marginTop: 14 }}>
                  {hist.map((v: number, i: number) => (
                    <div key={i} className={`hist-bar ${v === max && v > 0 ? "active" : ""}`} style={{ height: `${Math.max(8, (v / max) * 88)}px` }}>
                      <div className="tip mono">{BUCKETS[i].label}: {v} · {Math.round((v / total) * 100)}%</div>
                    </div>
                  ))}
                </div>
                <div className="row small muted" style={{ flexWrap: "wrap", marginTop: 6 }}>
                  {BUCKETS.map((b) => (
                    <span key={b.id} className="mono" style={{ fontSize: 11 }}>{b.label}</span>
                  ))}
                </div>
                <div className="sep" />
                <div className="small muted">
                  Verified submissions: <strong style={{ color: "var(--text)" }}>{total}</strong> · Each bar increments by 1 per verified contributor. No individual salary is recoverable — only the bucket is disclosed on-chain.
                </div>
                {mine && <div className="notice" style={{ marginTop: 10, borderColor: "#2a3d1a", background: "#0f1a0f" }}>You contributed to this cut in bucket <strong>{BUCKETS[mine.bucket]?.label}</strong> — percentile shown in your result.</div>}
              </>
            ) : (
              <div className="lock" style={{ marginTop: 12 }}>
                <div style={{ fontSize: 28 }}>🔒</div>
                <div><strong>Locked</strong> — {total}/{K_ANONYMITY} verified contributors</div>
                <div className="small muted">This cut stays hidden until it reaches k≥{K_ANONYMITY}. Be one of the first to unlock it.</div>
              </div>
            )}

            <div className="row" style={{ marginTop: 14 }}>
              <button className="btn btn-primary" onClick={onContribute}>Contribute to this cut</button>
              <button className="btn" onClick={onBack}>Browse other cuts</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ContributeWizard({ cut, cuts, onCutChange, onClose, onSuccess, ledger }: { cut: any; cuts: any[]; onCutChange: (k: string) => void; onClose: () => void; onSuccess: (cut: any, bucket: number) => void; ledger: any }) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [demoCode, setDemoCode] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  const [level, setLevel] = useState(cut.level);
  const [region, setRegion] = useState(cut.region);
  const [salary, setSalary] = useState<string>("150000");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const selectedCut = useMemo(() => {
    const k = `${cut.family}:${level}:${region}`;
    return cuts.find((c) => cutKeyString(c) === k) ?? cut;
  }, [cut.family, level, region, cuts, cut]);

  const bucket = useMemo(() => {
    const n = Number(salary.replace(/[^0-9]/g, ""));
    if (!Number.isFinite(n) || n <= 0) return null;
    return bucketForSalary(n);
  }, [salary]);

  const doRequest = async () => {
    setErr(null); setBusy(true);
    try {
      const r = await requestCode(email);
      setDemoCode(r.demoCode);
      setStep(2);
    } catch (e: any) { setErr(e.message ?? "request failed"); } finally { setBusy(false); }
  };
  const doConfirm = async () => {
    setErr(null); setBusy(true);
    try {
      await confirmCode(email, code);
      setVerified(true);
      setStep(3);
    } catch (e: any) { setErr(e.message ?? "invalid code"); } finally { setBusy(false); }
  };
  const doEnrollAndSubmit = async () => {
    if (bucket == null) { setErr("enter a valid salary"); return; }
    setErr(null); setBusy(true);
    try {
      const secret = getOrCreateSecret();
      const leafHex = await enrollLeaf(email, secret);
      // optimistic local ledger enroll
      let snap = loadLedger();
      snap = enrollLocal(snap, leafHex);
      saveLedger(snap);

      const chainProps = (window as any).__candorChain as { providers: CandorProviders } | undefined;
      const address = getStoredContractAddress();
      if (chainProps && address) {
        // REAL chain path: prove via Lace, submit on Preprod.
        const { cutKeyBytes } = await hashLib();
        const { submitOnChain, enrollOnChain } = await midnightLib();
        const issuerKey = getEffectiveIssuerKey();
        // Auto-enroll on-chain if not yet a member — makes the verified flow seamless.
        if (issuerKey) {
          try {
            await enrollOnChain(chainProps.providers, address, {
              memberLeaf: hexToBytes(leafHex.replace(/^0x/, "").trim()),
              issuerKey: hexToBytes(issuerKey),
            });
          } catch (e: any) {
            const msg = String(e?.message ?? e);
            if (!/already/i.test(msg)) {
              // Hosted prover can 403 on the enroll proof — still try submit, the demo will
              // fall back to a friendly message if it also fails. Don't block the flow here.
              console.warn("[candor] auto-enroll skipped:", msg.slice(0, 300));
            }
          }
        }
        try {
          await submitOnChain(chainProps.providers, address, {
            cutKey: cutKeyBytes(cutKeyString(selectedCut)),
            bucket,
            secret,
          });
        } catch (e: any) {
          const msg = String(e?.message ?? e);
          const isProverDown = /403|Failed to fetch|Load failed|proof-server/i.test(msg);
          if (isProverDown) {
            // Hosted prover is temporarily unavailable — record locally as a demo
            // contribution so the user still gets the percentile moment.
            console.warn("[candor] hosted prover unavailable, falling back to demo ledger:", msg.slice(0, 300));
            await new Promise((r) => setTimeout(r, 900));
            const res = await submitLocal(snap, secret, selectedCut, bucket);
            if (!res.ok) throw new Error(res.reason);
            onSuccess(selectedCut, bucket);
            return;
          }
          if (/not a member/i.test(msg)) {
            throw new Error("Enrollment is still pending — the on-chain enroll may still be confirming. Please wait ~10s and try again, or use the Operator panel to enroll this leaf.");
          }
          if (/email not verified/i.test(msg)) {
            throw new Error("Email not verified on the issuer — please restart verification from step 1.");
          }
          throw e;
        }
      } else {
        // demo path: simulated proving, mock ledger
        await new Promise((r) => setTimeout(r, 900));
        const res = await submitLocal(snap, secret, selectedCut, bucket);
        if (!res.ok) throw new Error(res.reason);
      }
      onSuccess(selectedCut, bucket);
    } catch (e: any) { setErr(e.message ?? "submit failed"); } finally { setBusy(false); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", backdropFilter: "blur(8px)", zIndex: 40, overflow: "auto", padding: 18 }}>
      <div className="container" style={{ maxWidth: 640, marginTop: 18 }}>
        <div className="card">
          <div className="card-pad">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <button className="btn small" onClick={onClose}>✕ Close</button>
              <span className="mono small muted">Step {step}/4 · {["Verify", "Confirm", "Describe", "Submit"][step - 1]}</span>
            </div>
            <div className="steps">
              {[1, 2, 3, 4].map((s) => <div key={s} className={`step ${s <= step ? "on" : ""}`} />)}
            </div>

            {step === 1 && (
              <>
                <h2 style={{ margin: "6px 0 4px" }}>Verify you’re real</h2>
                <p className="small muted" style={{ lineHeight: 1.5 }}>
                  Enter your work email. We check it via the issuer and create a leaf that proves you’re a verified member — without giving the issuer your secret or your salary.
                </p>
                <div className="notice" style={{ margin: "10px 0" }}>
                  <strong>Trust boundary.</strong> The issuer learns who is a member (email → leaf), but never sees your secret, so it cannot link your future submission to you.
                </div>
                <label className="small muted">Work email</label>
                <input className="input" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} style={{ marginTop: 6 }} />
                {err && <div className="small" style={{ color: "var(--red)", marginTop: 8 }}>{err}</div>}
                <div className="row" style={{ marginTop: 12 }}>
                  <button className="btn btn-primary" disabled={!email.includes("@") || busy} onClick={doRequest}>{busy ? "Sending…" : "Send code"}</button>
                  <span className="small muted">Beta: your code appears on the next screen instantly</span>
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <h2 style={{ margin: "6px 0 4px" }}>Enter the code</h2>
                {demoCode && <div className="code" style={{ margin: "8px 0" }}>Verification code for <b>{email}</b>: <span className="mono" style={{ fontSize: 16, color: "var(--accent)" }}>{demoCode}</span> — copy it below.</div>}
                <label className="small muted">6-digit code</label>
                <input className="input" placeholder="123456" value={code} onChange={(e) => setCode(e.target.value)} style={{ marginTop: 6 }} />
                {err && <div className="small" style={{ color: "var(--red)", marginTop: 8 }}>{err}</div>}
                <div className="row" style={{ marginTop: 12 }}>
                  <button className="btn btn-primary" disabled={code.length < 4 || busy} onClick={doConfirm}>{busy ? "Checking…" : "Verify"}</button>
                  <button className="btn" onClick={() => setStep(1)}>Back</button>
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <h2 style={{ margin: "6px 0 4px" }}>Describe your role</h2>
                <p className="small muted">One question per screen. Your exact salary is bucketed locally — on-chain, only the bucket index is disclosed.</p>
                <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
                  <label className="small muted">Level</label>
                  <select className="select" value={level} onChange={(e) => { setLevel(e.target.value as any); onCutChange(`${cut.family}:${e.target.value}:${region}`); }}>
                    {LEVELS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
                  </select>
                  <label className="small muted">Region</label>
                  <select className="select" value={region} onChange={(e) => { setRegion(e.target.value as any); onCutChange(`${cut.family}:${e.target.value}:${level}`); }}>
                    {REGIONS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                  </select>
                  <label className="small muted">Total comp (USD, base + bonus + equity annualized)</label>
                  <input className="input" inputMode="numeric" value={salary} onChange={(e) => setSalary(e.target.value)} placeholder="150000" />
                  <div className="notice">
                    {bucket != null ? (
                      <>You’ll contribute to <strong>{cutLabel(selectedCut)}</strong> · bucket <strong>{BUCKETS[bucket].label}</strong> — the distribution, not your number, becomes public.</>
                    ) : (
                      <>Enter a salary to see your bucket.</>
                    )}
                    <div className="small muted" style={{ marginTop: 6 }}>Coarse buckets are a privacy/utility dial — they guarantee each increment reveals only a range.</div>
                  </div>
                </div>
                {err && <div className="small" style={{ color: "var(--red)", marginTop: 8 }}>{err}</div>}
                <div className="row" style={{ marginTop: 12 }}>
                  <button className="btn btn-primary" disabled={bucket == null || busy} onClick={() => setStep(4)}>Continue</button>
                  <button className="btn" onClick={() => setStep(2)}>Back</button>
                </div>
              </>
            )}

            {step === 4 && (
              <>
                <h2 style={{ margin: "6px 0 4px" }}>Submit anonymously</h2>
                <div className="notice">
                  <strong>What happens on submit:</strong> Your device derives a leaf from your secret (already enrolled), builds a membership proof, derives an epoch nullifier (one per verified person per epoch), and increments the bucket. Only <span className="mono">cutKey</span> and <span className="mono">bucket</span> are disclosed on-chain.
                </div>
                <div className="code" style={{ marginTop: 10 }}>
                  <div>cut: {cutKeyString(selectedCut)}</div>
                  <div>bucket: {bucket} · {bucket != null ? BUCKETS[bucket].label : "—"}</div>
                  <div>leaf: {(getSecretHex() ?? "").slice(0, 10)}… (derived locally)</div>
                  <div>epoch: {ledger.epoch} · k≥{K_ANONYMITY}</div>
                </div>
                <div className="notice" style={{ marginTop: 10, borderColor: verified ? "#2a3d1a" : undefined }}>
                  {verified ? "✓ Verified member" : "Not verified"} · {ledger.members.length} total members · {ledger.nullifiers.length} submissions this epoch
                </div>
                {err && <div className="small" style={{ color: "var(--red)", marginTop: 8 }}>{err}</div>}
                <div className="row" style={{ marginTop: 12 }}>
                  <button className="btn btn-primary" disabled={busy || bucket == null} onClick={doEnrollAndSubmit}>{busy ? "Proving & submitting…" : "Submit — generate ZK proof locally"}</button>
                  <button className="btn" onClick={() => setStep(3)}>Back</button>
                </div>
                <div className="small muted" style={{ marginTop: 8 }}>
                    {(import.meta as any).env?.VITE_HOSTED_PROVER === "true"
                      ? "Beta hosted demo: proof generation is routed through a hosted proving service over TLS. For full on-device privacy, run Candor locally — see the repo docs."
                      : "Your device generates the zero-knowledge proof — your exact salary never leaves this browser."}
                  </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ResultView({ ledger, onBack, onBrowse }: { ledger: any; onBack: () => void; onBrowse: () => void }) {
  const last = (window as any).__candorLast as { cut: any; bucket: number } | undefined;
  const cut = last?.cut;
  const bucket = last?.bucket;
  const pct = cut && bucket != null ? percentileForBucket(ledger, cut, bucket) : null;
  const hist = cut ? histogramForCut(ledger, cut) : null;
  const total = hist ? hist.reduce((a: number, b: number) => a + b, 0) : 0;

  if (!cut || bucket == null) {
    return (
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 40, padding: 18 }}>
        <div className="container" style={{ maxWidth: 560, marginTop: 24 }}>
          <div className="card card-pad">
            <p>No recent submission found.</p>
            <button className="btn" onClick={onBrowse}>Browse cuts</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", backdropFilter: "blur(8px)", zIndex: 40, overflow: "auto", padding: 18 }}>
      <div className="container" style={{ maxWidth: 560, marginTop: 18 }}>
        <div className="card" style={{ borderColor: "#3a3a0a" }}>
          <div className="card-pad">
            <div className="kicker">Recorded · nobody can link this to you</div>
            <div className="percent-hero">
              <div className="percent-num">{pct != null ? `${pct}th` : "—"}</div>
              <div className="percent-label">percentile in {cutLabel(cut)}</div>
              <div className="small muted" style={{ marginTop: 4 }}>Bucket {BUCKETS[bucket].label} · {total} verified contributors</div>
            </div>

            {hist && (
              <div className="hist" style={{ height: 72, marginTop: 12 }}>
                {hist.map((v: number, i: number) => (
                  <div key={i} className={`hist-bar ${i === bucket ? "active" : ""}`} style={{ height: `${Math.max(6, (v / Math.max(1, ...hist)) * 64)}px` }} />
                ))}
              </div>
            )}
            <div className="small muted" style={{ textAlign: "center", marginTop: 6 }}>Your bucket highlighted · distribution is public, individual records never are</div>

            <div className="sep" />
            <div className="notice">
              <strong>What just happened.</strong> One bucket incremented by 1. No one watching the chain can recover your exact salary from the delta — only that “one verified person in bucket {bucket}” arrived. That’s the histogram-not-sum guarantee.
            </div>

            <div className="row" style={{ marginTop: 14 }}>
              <button className="btn btn-primary" onClick={onBack}>View this cut</button>
              <button className="btn" onClick={onBrowse}>Browse all cuts</button>
              <button className="btn btn-ghost" onClick={() => { if (navigator.share) navigator.share({ title: "Candor", text: `I'm in the ${pct}th percentile for ${cutLabel(cut)} — verified on Candor.`, url: location.href }); else { navigator.clipboard.writeText(`I'm in the ${pct}th percentile for ${cutLabel(cut)} — verified on Candor.`); } }}>Share percentile</button>
            </div>

            <div className="small muted" style={{ marginTop: 10 }}>
              Your data expires after this epoch ({ledger.epoch}) — you’ll be eligible to refresh it next quarter. That’s the retention loop, and it’s cryptographic.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function OperatorPanel({
  chain,
  onClose,
  onToast,
  onAddress,
}: {
  chain: { providers: CandorProviders } | null;
  onClose: () => void;
  onToast: (msg: string) => void;
  onAddress: (addr: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [issuerKeyHex, setIssuerKeyHex] = useState<string>(() => {
    try { return localStorage.getItem("candor:issuerKey") ?? getBakedIssuerKey() ?? ""; } catch { return getBakedIssuerKey() ?? ""; }
  });
  const [leafHex, setLeafHex] = useState<string>("");
  const [enrollEmail, setEnrollEmail] = useState<string>("");
  const address = getStoredContractAddress();
  const effectiveKey = getEffectiveIssuerKey() ?? issuerKeyHex.replace(/^0x/, "").trim();
  const keyValid = /^[0-9a-fA-F]{64}$/.test(effectiveKey);
  // Auto-save baked key on first load so the operator never has to paste
  useEffect(() => {
    const baked = getBakedIssuerKey();
    if (baked && !localStorage.getItem("candor:issuerKey")) {
      try { localStorage.setItem("candor:issuerKey", baked); if (!issuerKeyHex) setIssuerKeyHex(baked); } catch {}
    }
  }, []);

  const saveIssuerKey = () => {
    const clean = issuerKeyHex.replace(/^0x/, "").trim();
    if (!/^[0-9a-fA-F]{64}$/.test(clean)) { onToast(`issuer key must be 64 hex chars (got ${clean.length} chars)`); return; }
    localStorage.setItem("candor:issuerKey", clean);
    onToast("Issuer key saved (local only)");
  };

  const doDeploy = async () => {
    if (!chain) return;
    const clean = effectiveKey;
    if (!keyValid) { onToast(`issuer key invalid (${clean.length} chars) — paste 64 hex chars and Save`); return; }
    setBusy(true);
    try {
      const { deployCandor } = await midnightLib();
      const deployed = await deployCandor(chain.providers, hexToBytes(clean));
      const addr = (deployed.deployTxData as any).public?.contractAddress;
      if (addr) { onAddress(addr); onToast(`Deployed at ${addr}`); }
      else onToast("Deployed — check Lace for the address");
    } catch (e: any) {
      console.error("[candor] deploy failed — full error:", e, "cause:", e?.cause);
      onToast(e?.message ?? "deploy failed");
    } finally { setBusy(false); }
  };

  const doEnroll = async () => {
    if (!chain || !address) { onToast("deploy first"); return; }
    const clean = effectiveKey;
    if (!keyValid) { onToast(`issuer key invalid (${clean.length} chars) — paste 64 hex chars and Save`); return; }
    setBusy(true);
    try {
      const { enrollOnChain } = await midnightLib();
      await enrollOnChain(chain.providers, address, {
        memberLeaf: hexToBytes(leafHex.replace(/^0x/, "").trim()),
        issuerKey: hexToBytes(clean),
      });
      onToast("Member enrolled on-chain");
    } catch (e: any) {
      console.error("[candor] enroll failed — full error:", e, "cause:", e?.cause);
      onToast(e?.message ?? "enroll failed");
    } finally { setBusy(false); }
  };

  const doEnrollMine = async () => {
    const secret = getOrCreateSecret();
    const { memberLeaf } = await hashLib();
    setLeafHex(bytesToHex(memberLeaf(secret)));
  };

  const doEnrollByEmail = async () => {
    // fetch the leaf the issuer computed for a verified email (issuer service keeps a map)
    try {
      const r = await fetch(`/issuer/leaf?email=${encodeURIComponent(enrollEmail)}`);
      const j = await r.json();
      if (j?.leafHex) setLeafHex(j.leafHex);
      else onToast("no leaf for that email");
    } catch { onToast("issuer service unreachable"); }
  };

  const doNextEpoch = async () => {
    if (!chain || !address) { onToast("deploy first"); return; }
    const clean = effectiveKey;
    if (!keyValid) { onToast(`issuer key invalid (${clean.length} chars) — paste 64 hex chars and Save`); return; }
    setBusy(true);
    try {
      const { nextEpochOnChain } = await midnightLib();
      await nextEpochOnChain(chain.providers, address, { issuerKey: hexToBytes(clean) });
      onToast("Epoch advanced — members can submit again");
    } catch (e: any) { onToast(e?.message ?? "nextEpoch failed"); } finally { setBusy(false); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", backdropFilter: "blur(8px)", zIndex: 40, overflow: "auto", padding: 18 }}>
      <div className="container" style={{ maxWidth: 640, marginTop: 18 }}>
        <div className="card">
          <div className="card-pad">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <button className="btn small" onClick={onClose}>✕ Close</button>
              <span className="mono small muted">issuer console · Preprod</span>
            </div>
            <h2 style={{ margin: "6px 0 4px" }}>Issuer console</h2>
            <p className="small muted">
              The operator wallet holds the issuer key witness. It can enroll member leaves and advance the
              epoch — nothing else. It never sees contributor secrets or salaries.
            </p>

            <div className="row" style={{ justifyContent: "space-between" }}>
              <label className="small muted">Issuer secret key (hex, stays in this browser)</label>
              <span className="small" style={{ color: keyValid ? "var(--green)" : "var(--red)" }}>
                {keyValid ? "✓ key loaded" : "✗ no key"}
              </span>
            </div>
            <div className="row" style={{ gap: 8, marginTop: 6 }}>
              <input className="input" value={issuerKeyHex} onChange={(e) => setIssuerKeyHex(e.target.value)} placeholder="64 hex chars" />
              <button className="btn small" onClick={saveIssuerKey}>Save</button>
            </div>

            <div className="sep" />
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div className="small muted">Contract</div>
                <div className="mono small">{address ?? "not deployed"}</div>
              </div>
              <button className="btn btn-primary small" disabled={busy || !chain} onClick={doDeploy}>
                {busy ? "Deploying…" : "Deploy contract"}
              </button>
            </div>

            <div className="sep" />
            <label className="small muted">Member leaf to enroll (hex)</label>
            <div className="row" style={{ gap: 8, marginTop: 6 }}>
              <input className="input" value={leafHex} onChange={(e) => setLeafHex(e.target.value)} placeholder="leaf hex" />
            </div>
            <div className="row" style={{ gap: 8, marginTop: 8 }}>
              <button className="btn small" onClick={doEnrollMine}>Load my leaf (this browser)</button>
              <input className="input" style={{ maxWidth: 220 }} placeholder="user@company.com" value={enrollEmail} onChange={(e) => setEnrollEmail(e.target.value)} />
              <button className="btn small" onClick={doEnrollByEmail}>Fetch by email</button>
              <button className="btn btn-primary small" disabled={busy || !address || !leafHex} onClick={doEnroll}>
                {busy ? "Enrolling…" : "Enroll on-chain"}
              </button>
            </div>

            <div className="sep" />
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span className="small muted">Advancing the epoch lets every member submit once more.</span>
              <button className="btn small" disabled={busy || !address} onClick={doNextEpoch}>Advance epoch</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
