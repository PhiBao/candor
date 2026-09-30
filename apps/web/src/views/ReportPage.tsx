import { useCallback, useEffect, useState } from "react";
import {
  buildReportFromChain,
  fingerprint,
  verifyReport,
  type ChainTotals,
} from "../lib/reportRead";
import { renderReportMarkdown } from "@gotit/shared/paygap";
import type { PayGapReport } from "@gotit/shared/paygap";
import { getStoredContractAddress } from "../lib/session";

/**
 * The compliance report — Wave 2's deliverable.
 *
 * Reads live on-chain state and renders the Art. 9 statistics. Every state is
 * explicit: live data, a read failure, or a genuinely empty chain. There is no
 * path that shows plausible numbers without saying where they came from, which
 * is the habit that cost us Wave 1.
 */

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; report: PayGapReport; totals: ChainTotals; fp: string };

const PERIOD = "Epoch 1 — Wave 2 preview";

export default function ReportPage() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [copied, setCopied] = useState(false);
  const [verifyInput, setVerifyInput] = useState("");
  const [verifyResult, setVerifyResult] = useState<string | null>(null);

  const address = getStoredContractAddress();

  const load = useCallback(async () => {
    if (!address) {
      setState({ kind: "error", message: "No contract address configured for this deployment." });
      return;
    }
    setState({ kind: "loading" });
    try {
      const { report, totals, fingerprint: fp } = await buildReportFromChain(address, PERIOD);
      setState({ kind: "ready", report, totals, fp });
      setVerifyInput(fp);
    } catch (e) {
      setState({
        kind: "error",
        message: e instanceof Error ? e.message : "could not read contract state",
      });
    }
  }, [address]);

  useEffect(() => {
    void load();
  }, [load]);

  const markdown = state.kind === "ready" ? renderReportMarkdown(state.report) : "";

  const copyMarkdown = async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const runVerify = async () => {
    if (!address || !verifyInput.trim()) return;
    setVerifyResult("checking…");
    try {
      const r = await verifyReport(address, verifyInput.trim());
      setVerifyResult(
        r.ok
          ? `MATCH — this report matches live chain state (epoch ${r.epoch}, ${r.submissions} submission(s)).`
          : `MISMATCH — chain now reads ${r.actual}, report claims ${r.expected}. ` +
            `Either the report is stale or it was not built from this contract.`,
      );
    } catch (e) {
      setVerifyResult(`could not verify: ${e instanceof Error ? e.message : "read failed"}`);
    }
  };

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 20px 80px" }}>
      <div style={{ marginBottom: 8 }}>
        <div className="kicker">COMPLIANCE REPORT</div>
        <h1 style={{ fontSize: 30, margin: "4px 0 6px", letterSpacing: "-0.02em" }}>
          Pay gap report
        </h1>
        <p style={{ color: "var(--muted)", margin: 0, maxWidth: 620, lineHeight: 1.55 }}>
          Built from live on-chain state. No individual salary is readable from anything on this
          page — only counts, and only where a group is large enough that publishing it cannot
          identify anyone.
        </p>
      </div>

      {state.kind === "loading" && (
        <div className="card card-pad" style={{ marginTop: 20 }}>
          <div className="muted">Reading contract state from the Preprod indexer…</div>
        </div>
      )}

      {state.kind === "error" && (
        <div className="card card-pad" style={{ marginTop: 20, borderColor: "#7f1d1d" }}>
          <div style={{ color: "#fca5a5", fontWeight: 600, marginBottom: 6 }}>
            Could not read live chain state
          </div>
          <div className="muted" style={{ marginBottom: 12 }}>
            {state.message}
          </div>
          <div className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
            This page never substitutes sample data for a live read. If the indexer is
            unreachable, no report is shown at all — an empty table that looks authoritative is
            worse than an error.
          </div>
          <button className="btn btn-ghost" style={{ marginTop: 12 }} onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}

      {state.kind === "ready" && (
        <>
          <div className="card card-pad" style={{ marginTop: 20 }}>
            <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
              <Stat label="Epoch" value={state.totals.epoch} />
              <Stat label="Enrolled members" value={String(state.totals.members)} />
              <Stat label="Submissions on-chain" value={String(state.totals.submissions)} />
              <Stat
                label="Groups with data"
                value={`${state.totals.populated.length} / ${
                  state.totals.populated.length + state.totals.emptyCuts.length
                }`}
              />
            </div>
            <div style={{ marginTop: 14, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span
                className="badge small"
                style={{ color: "var(--green)", borderColor: "#14301e", background: "var(--green-bg)" }}
              >
                ● live on-chain
              </span>
              <span className="muted" style={{ fontSize: 13 }}>
                fingerprint <code style={{ color: "var(--fg)" }}>{state.fp}</code>
              </span>
              <button className="btn btn-ghost" style={{ marginLeft: "auto" }} onClick={copyMarkdown}>
                {copied ? "Copied" : "Copy report as Markdown"}
              </button>
            </div>
          </div>

          {state.report.rows.length === 0 && state.report.suppressed.length > 0 && (
            <div className="card card-pad" style={{ marginTop: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Nothing publishable yet</div>
              <div className="muted" style={{ lineHeight: 1.55 }}>
                {state.totals.submissions === 0
                  ? "The contract is live but has no submissions. That is the honest state of the chain, and a report built from it would be an empty table that implies coverage nobody has contributed."
                  : `There ${state.totals.submissions === 1 ? "is" : "are"} ${state.totals.submissions} verified submission${state.totals.submissions === 1 ? "" : "s"} on chain, spread across ${state.report.suppressed.length} group${state.report.suppressed.length === 1 ? "" : "s"} — every one below the anonymity threshold. A group of one cannot be published without publishing that person's pay, so nothing is.`}
              </div>
            </div>
          )}

          {state.report.rows.length > 0 && (
            <div className="card card-pad" style={{ marginTop: 16 }}>
              <h2 style={{ marginTop: 0, fontSize: 18 }}>Groups</h2>
              {state.report.rows.map((row) => (
                <div key={row.category} style={{ marginBottom: 18, paddingBottom: 14, borderBottom: "1px solid var(--line)" }}>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>{row.category}</div>
                  <table style={{ width: "100%", fontSize: 14, borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ color: "var(--muted)", textAlign: "left" }}>
                        <th style={{ padding: "4px 8px 4px 0", fontWeight: 500 }}>Headcount</th>
                        <th style={{ padding: "4px 8px 4px 0", fontWeight: 500 }}>Median</th>
                        <th style={{ padding: "4px 8px 4px 0", fontWeight: 500 }}>Mean</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={{ padding: "4px 8px 4px 0" }}>{row.reference.size}</td>
                        <td style={{ padding: "4px 8px 4px 0" }}>
                          {row.reference.median ? money(row.reference.median.low, row.reference.median.high) : "—"}
                        </td>
                        <td style={{ padding: "4px 8px 4px 0" }}>
                          {money(row.reference.mean.low, row.reference.mean.high)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}

          {state.report.suppressed.length > 0 && (
            <div className="card card-pad" style={{ marginTop: 16 }}>
              <h2 style={{ marginTop: 0, fontSize: 18 }}>Withheld</h2>
              <div className="muted" style={{ fontSize: 13, marginBottom: 10, lineHeight: 1.5 }}>
                A group is withheld when either side of a comparison falls below the anonymity
                threshold. Publishing one side would reveal the other by subtraction, so a
                one-sided row is a disclosure just as much as a small cell is.
              </div>
              {state.report.rows.length === 0 && (
                <div className="muted" style={{ fontSize: 13, marginBottom: 10, lineHeight: 1.5 }}>
                  This is the expected state on a young chain: the threshold only clears once
                  enough people in the same group have contributed.
                </div>
              )}
              {state.report.suppressed.map((s) => (
                <div key={s.category} className="muted" style={{ fontSize: 13, marginBottom: 4 }}>
                  {s.category} — {s.reason} ({s.size} participant{s.size === 1 ? "" : "s"})
                </div>
              ))}
            </div>
          )}

          <div className="card card-pad" style={{ marginTop: 16 }}>
            <h2 style={{ marginTop: 0, fontSize: 18 }}>Disclosure notes</h2>
            {state.report.notes.map((n, i) => (
              <div key={i} className="muted" style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 8 }}>
                {n}
              </div>
            ))}
          </div>

          <div className="card card-pad" style={{ marginTop: 16 }}>
            <h2 style={{ marginTop: 0, fontSize: 18 }}>Verify this report</h2>
            <div className="muted" style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 12 }}>
              Anyone can paste the fingerprint from a published report and check it against chain
              state. No wallet, no account, no permission.
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input
                value={verifyInput}
                onChange={(e) => setVerifyInput(e.target.value)}
                placeholder="fingerprint from a report"
                style={{
                  flex: "1 1 220px",
                  minWidth: 200,
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid var(--line)",
                  background: "var(--bg-2)",
                  color: "var(--fg)",
                  fontFamily: "var(--mono)",
                  fontSize: 13,
                }}
              />
              <button className="btn btn-primary" onClick={runVerify}>
                Verify against chain
              </button>
            </div>
            {verifyResult && (
              <div className="muted" style={{ marginTop: 10, fontSize: 13, lineHeight: 1.5 }}>
                {verifyResult}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="muted" style={{ fontSize: 12, marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 600 }}>{value}</div>
    </div>
  );
}

function money(low: number, high: number): string {
  const f = (v: number) => (Number.isFinite(v) ? `$${Math.round(v).toLocaleString("en-US")}` : "$∞");
  return low === high ? f(low) : `${f(low)}–${f(high)}`;
}

export { fingerprint };
