import GlassPanel from "../../../components/GlassPanel/GlassPanel";

function StatPill({ label, value }) {
  return (
    <div className="preprocessing-stat-pill">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function PreprocessingHeader({ summary, historyOpen, onToggleHistory }) {
  return (
    <GlassPanel
      title="Data Cleaning & Preprocessing Workstation"
      eyebrow="Workstation"
      className="preprocessing-header"
    >
      <div className="preprocessing-header-grid">
        <div className="preprocessing-header-copy">
          <p className="preprocessing-subtitle">
            Prepare your dataset with focused Pandas-style controls in a clean, IDE-like workspace.
            Preview changes safely before applying them to your active dataset.
          </p>
          <div className="preprocessing-header-badges">
            <span className="preprocessing-badge">
              Active Dataset: <strong>{summary.name}</strong>
            </span>
            {summary.isPreview && (
              <span className="preprocessing-badge is-preview">
                Preview Mode (Not Yet Applied)
              </span>
            )}
            <button
              type="button"
              className="preprocessing-inline-toggle"
              onClick={onToggleHistory}
            >
              {historyOpen ? "Hide History Panel" : "Show History Panel"}
            </button>
          </div>
        </div>

        <div className="preprocessing-summary-card">
          <div className="preprocessing-summary-top">
            <strong>{summary.name}</strong>
            <span className="preprocessing-score">{summary.score}% Health</span>
          </div>
          <div className="preprocessing-stat-grid">
            <StatPill label="Total Rows" value={Number(summary.rows ?? 0).toLocaleString()} />
            <StatPill label="Total Columns" value={Number(summary.columns ?? 0).toLocaleString()} />
            <StatPill label="Missing Values" value={Number(summary.missing ?? 0).toLocaleString()} />
            <StatPill label="Duplicates" value={Number(summary.duplicates ?? 0).toLocaleString()} />
          </div>
        </div>
      </div>
    </GlassPanel>
  );
}

export default PreprocessingHeader;
