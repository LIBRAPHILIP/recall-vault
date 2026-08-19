import { NETWORK_NAME, TX_STAGES, type ReceiptSnapshot } from "../lib/genlayer";
import { explorerTx } from "../lib/format";

const ORDER = [...TX_STAGES];

export function TxLifecycle({ snap }: { snap: ReceiptSnapshot | null }) {
  if (!snap) return null;
  const current = snap.status.toUpperCase();
  const failed = current === "FAILED" || current === "UNDETERMINED" || current === "CANCELED";
  const idx = ORDER.indexOf(current as (typeof ORDER)[number]);

  return (
    <div className="docket">
      <div className="row">
        <strong>Transaction lifecycle</strong>
        <span className="stamp open">{current}</span>
      </div>
      <div className="lifecycle">
        {ORDER.map((stage, i) => {
          const isCurrent = current === stage;
          const cls = failed
            ? isCurrent
              ? "stage bad"
              : idx > i
                ? "stage done"
                : "stage"
            : current === "FINALIZED" || idx > i
              ? "stage done"
              : isCurrent
                ? "stage now"
                : "stage";
          return (
            <span key={stage} className={cls}>
              {stage}
            </span>
          );
        })}
      </div>
      <div className="small mono muted">
        {snap.hash ? (
          <a href={explorerTx(snap.hash, NETWORK_NAME)} target="_blank" rel="noreferrer">
            {snap.hash}
          </a>
        ) : (
          "Waiting for wallet signature…"
        )}
      </div>
      {snap.execution ? <div className="small muted mt">Execution: {snap.execution}</div> : null}
      {snap.error ? <div className="notice error mt">{snap.error}</div> : null}
      {current === "FINALIZED" && !snap.error ? (
        <div className="notice ok mt">
          Consensus finalized. If this was a payout, GEN is released on finalization via the contract’s
          transfer message.
        </div>
      ) : null}
      {current !== "FINALIZED" && !failed ? (
        <p className="hint mt">
          Intelligent Contract calls go through Optimistic Democracy: a leader proposes, validators
          re-fetch official recall sources, then the result is accepted and finalized.
        </p>
      ) : null}
    </div>
  );
}
