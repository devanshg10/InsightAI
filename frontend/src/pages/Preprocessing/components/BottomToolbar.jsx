function BottomToolbar({
  canUndo,
  canRedo,
  busy,
  onUndo,
  onRedo,
  onReset,
  onExport,
  onContinue,
}) {
  return (
    <div className="glass-panel preprocessing-bottom-toolbar">
      <button type="button" disabled={!canUndo || busy} onClick={onUndo}>
        Undo
      </button>
      <button type="button" disabled={!canRedo || busy} onClick={onRedo}>
        Redo
      </button>
      <button type="button" disabled={busy} onClick={onReset}>
        Reset Dataset
      </button>
      <button type="button" disabled={busy} onClick={onExport}>
        Export Dataset
      </button>
      <button type="button" className="preprocessing-continue-btn" disabled={busy} onClick={onContinue}>
        Continue to Visualization →
      </button>
    </div>
  );
}

export default BottomToolbar;
