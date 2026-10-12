import { useEffect, useMemo, useState } from "react";
import OperationPanelShell from "./OperationPanelShell";
import { buildColumnOptions, hasColumns } from "../../preprocessingOptions";

const strategies = [
  "Remove exact duplicates",
  "Keep first",
  "Keep last",
  "Drop all duplicates",
];

function DuplicatePanel({ columnNames = [], onPreview, onApply, busy }) {
  const columns = useMemo(
    () => [{ label: "All Columns", value: "All Columns" }, ...buildColumnOptions(columnNames)],
    [columnNames],
  );
  const disabled = !hasColumns(columnNames) || busy;
  const [selectedColumn, setSelectedColumn] = useState("All Columns");
  const [strategy, setStrategy] = useState(strategies[0]);

  useEffect(() => {
    if (selectedColumn !== "All Columns" && !columnNames.includes(selectedColumn)) {
      setSelectedColumn("All Columns");
    }
  }, [columnNames, selectedColumn]);

  const buildPayload = () => ({
    operation: "Duplicates",
    column: selectedColumn,
    method: strategy,
    optional_parameters: {},
  });

  return (
    <OperationPanelShell
      title="Duplicates"
      disabled={disabled}
      message={!hasColumns(columnNames) ? "Upload a dataset to configure this operation." : ""}
    >
      <label className="preprocessing-field">
        <span>Scope</span>
        <select disabled={disabled} value={selectedColumn} onChange={(event) => setSelectedColumn(event.target.value)}>
          {columns.map((column) => (
            <option key={column.value} value={column.value}>
              {column.label}
            </option>
          ))}
        </select>
      </label>

      <label className="preprocessing-field">
        <span>Strategy</span>
        <select disabled={disabled} value={strategy} onChange={(event) => setStrategy(event.target.value)}>
          {strategies.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </label>

      <div className="preprocessing-action-row">
        <button type="button" disabled={disabled} onClick={() => onPreview?.(buildPayload())}>
          {busy ? "Working..." : "Preview"}
        </button>
        <button type="button" className="preprocessing-apply-btn" disabled={disabled} onClick={() => onApply?.(buildPayload())}>
          {busy ? "Working..." : "Apply"}
        </button>
      </div>
    </OperationPanelShell>
  );
}

export default DuplicatePanel;
