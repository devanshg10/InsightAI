import { useEffect, useMemo, useState } from "react";
import OperationPanelShell from "./OperationPanelShell";
import { buildColumnOptions, hasColumns } from "../../preprocessingOptions";

const fillMethods = [
  "Fill Mode",
  "Fill Mean",
  "Fill Median",
  "Fill Custom Value",
  "Drop Rows",
  "Drop Columns",
];

function MissingValuesPanel({ columnNames = [], onPreview, onApply, busy }) {
  const columns = useMemo(
    () => [{ label: "All Columns", value: "All Columns" }, ...buildColumnOptions(columnNames)],
    [columnNames],
  );
  const disabled = !hasColumns(columnNames) || busy;
  const [selectedColumn, setSelectedColumn] = useState(columnNames[0] || "All Columns");
  const [method, setMethod] = useState(fillMethods[0]);
  const [customValue, setCustomValue] = useState("0");

  useEffect(() => {
    if (selectedColumn !== "All Columns" && !columnNames.includes(selectedColumn)) {
      setSelectedColumn(columnNames[0] || "All Columns");
    }
  }, [columnNames, selectedColumn]);

  const canRun = !disabled && Boolean(selectedColumn) && Boolean(method);

  const buildPayload = () => ({
    operation: "Missing Values",
    column: selectedColumn,
    method,
    optional_parameters: method === "Fill Custom Value" ? { fill_value: customValue } : {},
  });

  return (
    <OperationPanelShell
      title="Missing Values"
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
        <span>Method</span>
        <select disabled={disabled} value={method} onChange={(event) => setMethod(event.target.value)}>
          {fillMethods.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </label>

      {method === "Fill Custom Value" && (
        <label className="preprocessing-field">
          <span>Custom Fill Value</span>
          <input
            type="text"
            disabled={disabled}
            placeholder="Enter replacement value"
            value={customValue}
            onChange={(event) => setCustomValue(event.target.value)}
          />
        </label>
      )}

      <div className="preprocessing-action-row">
        <button type="button" disabled={!canRun} onClick={() => onPreview?.(buildPayload())}>
          {busy ? "Working..." : "Preview"}
        </button>
        <button type="button" className="preprocessing-apply-btn" disabled={!canRun} onClick={() => onApply?.(buildPayload())}>
          {busy ? "Working..." : "Apply"}
        </button>
      </div>
    </OperationPanelShell>
  );
}

export default MissingValuesPanel;
