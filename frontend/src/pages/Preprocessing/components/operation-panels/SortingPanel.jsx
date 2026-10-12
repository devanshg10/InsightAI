import { useEffect, useState } from "react";
import OperationPanelShell from "./OperationPanelShell";
import { buildColumnOptions, hasColumns } from "../../preprocessingOptions";

const directions = ["Ascending", "Descending"];

function SortingPanel({ columnNames = [], onPreview, onApply, busy }) {
  const columns = buildColumnOptions(columnNames);
  const disabled = !hasColumns(columnNames) || busy;
  const [selectedColumn, setSelectedColumn] = useState(columnNames[0] || "");
  const [direction, setDirection] = useState(directions[0]);

  useEffect(() => {
    if (!columnNames.includes(selectedColumn)) {
      setSelectedColumn(columnNames[0] || "");
    }
  }, [columnNames, selectedColumn]);

  const buildPayload = () => ({
    operation: "Sorting",
    column: selectedColumn,
    method: direction,
    optional_parameters: {},
  });

  return (
    <OperationPanelShell
      title="Sorting"
      disabled={disabled}
      message={!hasColumns(columnNames) ? "Upload a dataset to configure this operation." : ""}
    >
      <label className="preprocessing-field">
        <span>Column</span>
        <select disabled={disabled} value={selectedColumn} onChange={(event) => setSelectedColumn(event.target.value)}>
          {columns.map((column) => (
            <option key={column.value} value={column.value}>
              {column.label}
            </option>
          ))}
        </select>
      </label>

      <label className="preprocessing-field">
        <span>Direction</span>
        <select disabled={disabled} value={direction} onChange={(event) => setDirection(event.target.value)}>
          {directions.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </label>

      <div className="preprocessing-action-row">
        <button type="button" disabled={disabled || !selectedColumn} onClick={() => onPreview?.(buildPayload())}>
          {busy ? "Working..." : "Preview"}
        </button>
        <button
          type="button"
          className="preprocessing-apply-btn"
          disabled={disabled || !selectedColumn}
          onClick={() => onApply?.(buildPayload())}
        >
          {busy ? "Working..." : "Apply"}
        </button>
      </div>
    </OperationPanelShell>
  );
}

export default SortingPanel;
