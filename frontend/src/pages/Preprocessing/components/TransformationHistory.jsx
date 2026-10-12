import GlassPanel from "../../../components/GlassPanel/GlassPanel";

function TransformationHistory({
  historyItems = [],
  canUndo = false,
  busy = false,
  onUndo,
  onClearHistory,
  onClose,
}) {
  return (
    <GlassPanel
      title="Recent Actions"
      eyebrow="Transformation History"
      className="preprocessing-panel preprocessing-history-panel"
    >
      <div className="preprocessing-history-top-bar">
        <span>{historyItems.length} applied transformation{historyItems.length === 1 ? "" : "s"}</span>
        <button type="button" className="preprocessing-panel-close" onClick={onClose}>
          Hide
        </button>
      </div>

      <div className="preprocessing-history-list">
        {historyItems.length === 0 ? (
          <div className="preprocessing-history-empty">
            No transformations applied yet. Select an operation above and click Apply.
          </div>
        ) : (
          historyItems.map((item, idx) => (
            <div key={`${item}-${idx}`} className="preprocessing-history-item">
              ✓ {item}
            </div>
          ))
        )}
      </div>

      <div className="preprocessing-history-actions">
        <button type="button" disabled={!canUndo || busy} onClick={onUndo}>
          Undo Last
        </button>
        <button type="button" disabled={historyItems.length === 0 || busy} onClick={onClearHistory}>
          Clear History
        </button>
      </div>
    </GlassPanel>
  );
}

export default TransformationHistory;
