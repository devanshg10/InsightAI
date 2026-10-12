import GlassPanel from "../../../components/GlassPanel/GlassPanel";

function OperationsSidebar({ operations, selectedOperation, onSelectOperation }) {
  return (
    <GlassPanel
      title="Operation Library"
      eyebrow="Operations"
      className="preprocessing-panel preprocessing-sidebar-panel"
    >
      <div className="preprocessing-operation-list">
        {operations.map((item) => (
          <button
            key={item}
            type="button"
            className={`preprocessing-operation-item ${selectedOperation === item ? "is-active" : ""}`}
            onClick={() => onSelectOperation(item)}
          >
            {item}
          </button>
        ))}
      </div>
    </GlassPanel>
  );
}

export default OperationsSidebar;
