import "./GlassPanel.css";

function GlassPanel({ title, eyebrow, children, className = "" }) {
  return (
    <section className={`glass-panel draggable-panel ${className}`}>
      <div className="panel-grip">
        <span>{eyebrow}</span>
        <strong>{title}</strong>
      </div>
      {children}
    </section>
  );
}

export default GlassPanel;
