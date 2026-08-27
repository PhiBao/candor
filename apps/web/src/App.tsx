import { useEffect, useMemo, useState } from "react";
import {
  BUCKETS,
  K_ANONYMITY,
  LEVELS,
  REGIONS,
  allCuts,
  bucketForSalary,
  cutLabel,
  cutKeyString,
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

type View = "browse" | "cut" | "contribute" | "result";

export default function App() {
  const [ledger, setLedger] = useState(() => loadLedger());
  const [view, setView] = useState<View>("browse");
  const [activeCutKey, setActiveCutKey] = useState<string>(() => allCuts()[0] ? cutKeyString(allCuts()[0]) : "");
  const [toast, setToast] = useState<string | null>(null);

  // keep ledger in sync with storage events (demo)
  useEffect(() => {
    const onStorage = () => setLedger(loadLedger());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const cuts = useMemo(() => allCuts(), []);
  const activeCut = useMemo(() => cuts.find((c) => cutKeyString(c) === activeCutKey) ?? cuts[0], [cuts, activeCutKey]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2800);
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
              <span className="mono small">epoch</span> <strong>{ledger.epoch}</strong> · <span className="mono small">k≥{K_ANONYMITY}</span>
            </span>
            <button className="btn btn-ghost small" onClick={() => { resetLedger(); setLedger(loadLedger()); showToast("Demo ledger reset"); }}>
              Reset demo
            </button>
            <button className="btn btn-primary small" onClick={() => setView("contribute")}>Contribute</button>
          </div>
        </div>
      </header>

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
              <strong>How privacy works.</strong> Your device generates a secret. The issuer sees only a hash (the leaf) to confirm you’re a member — it never sees the secret, so it cannot derive your one-per-epoch nullifier. Your exact salary is bucketed locally; only the bucket index and cut key are disclosed on-chain. Wave&nbsp;1 membership reveal is per-leaf; Wave&nbsp;2 moves to ZK Merkle membership with no leaf disclosure. Proof server must be user-local — hosted proving is rejected by design.
            </div>
          </div>

          <div className="card card-pad">
            <div className="kicker">Live demo ledger</div>
            <h3 style={{ margin: "6px 0 8px" }}>Why reading is free</h3>
            <p className="small muted" style={{ lineHeight: 1.5 }}>
              Anyone can read any cut that has ≥{K_ANONYMITY} verified contributors. Locked cuts prompt you to contribute to unlock them — that’s the give-to-get loop. No wallet needed to read.
            </p>
            <div className="sep" />
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div>
                <div className="small muted">Total verified submissions</div>
                <div style={{ fontSize: 22, fontWeight: 800 }}>{Object.values(ledger.histogram).reduce((a, b) => a + b, 0)}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="small muted">Unlocked cuts</div>
                <div style={{ fontSize: 22, fontWeight: 800 }}>{cuts.filter((c) => isUnlocked(ledger, c)).length} / {cuts.length}</div>
              </div>
            </div>
            <div className="notice" style={{ marginTop: 12 }}>
              <strong>Demo mode.</strong> Ledger is local (mock) for instant demo without a Midnight node. Contract at <span className="mono">packages/contract/src/candor.compact</span> compiles on compact 0.31.1. Real deployment uses Lace on Preprod with a local proof server.
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              <button className="btn small" onClick={() => { navigator.clipboard.writeText(getSecretHex() ?? ""); showToast("Secret copied (demo only)"); }}>Copy my secret (demo)</button>
              <span className="small muted">Secret never leaves device</span>
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
            const hist = histogramForCut(ledger, cut);
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
          ledger={ledger}
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
            // reload ledger after successful submit
            setLedger(loadLedger());
            setActiveCutKey(cutKeyString(cut));
            setView("result");
            // store last result for percentile view
            (window as any).__candorLast = { cut, bucket };
          }}
          ledger={ledger}
        />
      )}

      {view === "result" && (
        <ResultView
          ledger={loadLedger()}
          onBack={() => setView("cut")}
          onBrowse={() => setView("browse")}
        />
      )}

      <footer className="container footer">
        <div className="sep" />
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <span>Built for Midnight Buildathon · Wave 1 · Contract compiles on compact 0.31.1 (lang 0.23)</span>
          <span className="mono">midnight · compact · lace · proof-server-local</span>
        </div>
        <div style={{ marginTop: 8 }} className="small">
          Docs: <a className="link" href="https://docs.midnight.network" target="_blank" rel="noreferrer">docs.midnight.network</a> · Sample: <a className="link" href="https://github.com/mashharuki/midnight-rps-sample-app" target="_blank" rel="noreferrer">midnight-rps-sample-app</a> · Issuer log is append-only and rate-limited per email per epoch.
        </div>
      </footer>

      {toast && (
        <div style={{ position: "fixed", bottom: 18, left: "50%", transform: "translateX(-50%)", background: "#1f1f23", border: "1px solid var(--line2)", padding: "10px 14px", borderRadius: 999, boxShadow: "var(--shadow)", zIndex: 50 }}>
          {toast}
        </div>
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
      // small delay to feel like proof generation (local proof server would take ~20s on Preprod)
      await new Promise((r) => setTimeout(r, 900));
      const res = await submitLocal(snap, secret, selectedCut, bucket);
      if (!res.ok) throw new Error(res.reason);
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
                  <span className="small muted">Demo: code shown on next step, no email infra needed</span>
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <h2 style={{ margin: "6px 0 4px" }}>Enter the code</h2>
                {demoCode && <div className="code" style={{ margin: "8px 0" }}>Demo code for <b>{email}</b>: <span className="mono" style={{ fontSize: 16, color: "var(--accent)" }}>{demoCode}</span> — copy it below.</div>}
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
                <div className="small muted" style={{ marginTop: 8 }}>Proving runs against your local proof server (port 6300) when targeting Preprod. Demo mode simulates proving locally.</div>
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
