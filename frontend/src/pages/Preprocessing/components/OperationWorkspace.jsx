import GlassPanel from "../../../components/GlassPanel/GlassPanel";
import MissingValuesPanel from "./operation-panels/MissingValuesPanel";
import DuplicatePanel from "./operation-panels/DuplicatePanel";
import ColumnOperationsPanel from "./operation-panels/ColumnOperationsPanel";
import DataTypesPanel from "./operation-panels/DataTypesPanel";
import TextOperationsPanel from "./operation-panels/TextOperationsPanel";
import NumericOperationsPanel from "./operation-panels/NumericOperationsPanel";
import DateOperationsPanel from "./operation-panels/DateOperationsPanel";
import EncodingPanel from "./operation-panels/EncodingPanel";
import ScalingPanel from "./operation-panels/ScalingPanel";
import SortingPanel from "./operation-panels/SortingPanel";
import FilteringPanel from "./operation-panels/FilteringPanel";

const panelMap = {
  "Missing Values": MissingValuesPanel,
  Duplicates: DuplicatePanel,
  "Column Operations": ColumnOperationsPanel,
  "Data Types": DataTypesPanel,
  "Text Operations": TextOperationsPanel,
  "Numeric Operations": NumericOperationsPanel,
  "Date Operations": DateOperationsPanel,
  Encoding: EncodingPanel,
  Scaling: ScalingPanel,
  Sorting: SortingPanel,
  Filtering: FilteringPanel,
};

function OperationWorkspace({
  selectedOperation,
  columnNames,
  onPreview,
  onApply,
  onDiscardPreview,
  isPreviewing,
  busy,
  statusMessage,
  errorMessage,
}) {
  const Panel = panelMap[selectedOperation] || MissingValuesPanel;

  return (
    <GlassPanel
      title={selectedOperation}
      eyebrow="Operation Workspace"
      className="preprocessing-workspace-panel"
    >
      <div className="preprocessing-workspace-body">
        <div key={selectedOperation} className="preprocessing-workspace-transition">
          <Panel
            columnNames={columnNames}
            onPreview={onPreview}
            onApply={onApply}
            busy={busy}
          />
        </div>

        {(errorMessage || statusMessage || isPreviewing) && (
          <div className="preprocessing-feedback-stack">
            {errorMessage && (
              <div className="preprocessing-alert is-error" role="alert">
                <span>{errorMessage}</span>
              </div>
            )}
            {!errorMessage && statusMessage && (
              <div className={`preprocessing-alert ${isPreviewing ? "is-preview" : "is-success"}`}>
                <span>{statusMessage}</span>
                {isPreviewing && (
                  <button
                    type="button"
                    className="preprocessing-discard-btn"
                    onClick={onDiscardPreview}
                  >
                    Discard Preview
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </GlassPanel>
  );
}

export default OperationWorkspace;
