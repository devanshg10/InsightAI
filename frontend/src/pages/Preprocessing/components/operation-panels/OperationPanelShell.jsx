function OperationPanelShell({ title, disabled, message, children }) {
  return (
    <div className={`preprocessing-operation-panel ${disabled ? "is-disabled" : ""}`}>
      <div className="preprocessing-operation-panel-header">
        <p>{title}</p>
      </div>
      {message && <p className="preprocessing-operation-note">{message}</p>}
      <div className="preprocessing-operation-panel-grid">{children}</div>
    </div>
  );
}

export default OperationPanelShell;
