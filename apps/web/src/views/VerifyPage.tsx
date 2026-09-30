import { useState } from "react";
import { verifyReport } from "../lib/reportRead";
import { getStoredContractAddress } from "../lib/session";

/**
 * Public verification — "can anyone check this?"
 *
 * A standalone page: paste a report's fingerprint, get a yes/no against live
 * chain state. No wallet, no account, nothing to install. This is the surface a
 * works council member or a journalist would actually use, and it is
 * deliberately separate from the report page so it carries no authority to
 * publish anything.
 */

type State =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "done"; ok: boolean; message: string; detail: string[] };

export default function VerifyPage() {
  const [input, setInput] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });
  const address = getStoredContractAddress();

  const run = async () => {
    const fp = input.trim();
    if (!fp || !address) return;
    setState({ kind: "checking" });
    try {
      const r = await verifyReport(address, fp);
      setState({
        kind: "done",
        ok: r.ok,
        message: r.ok
          ? "This report matches live chain state."
          : "This report does not match current chain state.",
        detail: [
          `Epoch: ${r.epoch}`,
          `Submissions on-chain: ${r.submissions}`,
          `Groups with data: ${r.populatedCuts}`,
          `Report claims: ${r.expected}`,
          `Chain reads:     ${r.actual}`,
          `Checked at:      ${r.checkedAt}`,
        ],
      });
    } catch (e) {
      setState({
        kind: "done",
        ok: false,
        message: `Could not read chain state: ${e instanceof Error ? e.message : "read failed"}`,
        detail: [],
      });
    }
  };

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "24px 20px 80px" }}>
      <div className="kicker">VERIFY</div>
      <h1 style={{ fontSize: 30, margin: "4px 0 6px", letterSpacing: "-0.02em" }}>
        Check a report
      </h1>
      <p className="muted" style={{ lineHeight: 1.55, marginTop: 0 }}>
        Paste the fingerprint printed on a GotIt pay gap report. This page re-reads the contract
        and tells you whether the report was built from the state that is actually on chain.
      </p>

      <div className="card card-pad" style={{ marginTop: 20 }}>
        <label className="muted" style={{ fontSize: 12, display: "block", marginBottom: 6 }}>
          Report fingerprint
        </label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void run();
            }}
            placeholder="e.g. a1b2c3d4e5f60718"
            autoComplete="off"
            spellCheck={false}
            style={{
              flex: "1 1 240px",
              minWidth: 220,
              padding: "10px 12px",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--line)",
              background: "var(--panel2)",
              color: "var(--text)",
              fontFamily: "var(--mono)",
              fontSize: 14,
            }}
          />
          <button className="btn btn-primary" onClick={run} disabled={state.kind === "checking" || !input.trim()}>
            {state.kind === "checking" ? "Checking…" : "Verify"}
          </button>
        </div>

        {state.kind === "done" && (
          <div
            style={{
              marginTop: 16,
              padding: 14,
              borderRadius: "var(--radius-sm)",
              border: `1px solid ${state.ok ? "#14301e" : "#4c1d1d"}`,
              background: state.ok ? "var(--green-bg)" : "#1a0f0f",
            }}
          >
            <div style={{ fontWeight: 600, color: state.ok ? "#86efac" : "#fca5a5", marginBottom: 8 }}>
              {state.ok ? "✓ " : "✗ "}
              {state.message}
            </div>
            {state.detail.length > 0 && (
              <div className="mono" style={{ fontSize: 12, lineHeight: 1.7, color: "var(--muted)" }}>
                {state.detail.map((d) => (
                  <div key={d}>{d}</div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="card card-pad" style={{ marginTop: 16 }}>
        <h2 style={{ marginTop: 0, fontSize: 17 }}>What this does and does not prove</h2>
        <div className="muted" style={{ fontSize: 13, lineHeight: 1.65 }}>
          <p style={{ marginTop: 0 }}>
            <b style={{ color: "var(--text)" }}>Proves:</b> the report's figures were derived
            from the bucket counts currently on chain, that the epoch and submission count are
            what the report says, and — because the report engine is a pure function with no I/O
            — that recomputing the statistics from those counts yields the same numbers.
          </p>
          <p>
            <b style={{ color: "var(--text)" }}>Does not prove:</b> that the people who submitted
            were paid what they said, or that every employee participated. Participation is
            voluntary and the fingerprint covers participation counts, so an incomplete report
            is detectable but not prevented. A gap report that is true about 60% of a company is
            still true about 60% of it — the report states its own coverage for that reason.
          </p>
        </div>
      </div>
    </div>
  );
}
