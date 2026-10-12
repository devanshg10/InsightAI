import { useEffect, useState } from "react";
import OperationPanelShell from "./OperationPanelShell";
import { buildColumnOptions, hasColumns } from "../../preprocessingOptions";

const conditions = [
  "Equals",
  "Not Equals",
  "Contains",
  "Greater Than",
  "Less Than",
  "Is Not Empty",
  "Is Empty",
];

function FilteringPanel({ columnNames = [], onPreview, onApply, busy }) {
  const columns = buildColumnOptions(columnNames);
  const disabled = !hasColumns(columnNames) || busy;
  const [selectedColumn, setSelectedColumn] = useState(columnNames[0] || "");
  const [condition, setCondition] = useState(conditions[0]);
  const [value, setValue] = useState("");

  useEffect(() => {
    if (!columnNames.includes(selectedColumn)) {
      setSelectedColumn(columnNames[0] || "");
    }
  }, [columnNames, selectedColumn]);

  const needsValue = !["Is Not Empty", "Is Empty"].includes(condition);
  const canRun = !disabled && Boolean(selectedColumn) && (!needsValue || value.trim() !== "");

  const buildPayload = () => ({
    operation: "Filtering",
    column: selectedColumn,
    method: condition,
    optional_parameters: { value },
  });

  return (
    <OperationPanelShell
      title="Filtering"
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
        <span>Condition</span>
        <select disabled={disabled} value={condition} onChange={(event) => setCondition(event.target.value)}>
          {conditions.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </label>

      {needsValue && (
        <label className="preprocessing-field">
          <span>Value</span>
          <input
            type="text"
            placeholder="Enter filter value"
            disabled={disabled}
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        </label>
      )}

      <div className="preprocessing-action-row">
        <button type="button" disabled={!canRun} onClick={() => onPreview?.(buildPayload())}>
          {busy ? "Working..." : "Preview"}
        </button>
        <button
          type="button"
          className="preprocessing-apply-btn"
          disabled={!canRun}
          onClick={() => onApply?.(buildPayload())}
        >
          {busy ? "Working..." : "Apply"}
        </button>
      </div>
    </OperationPanelShell>
  );
}

export default FilteringPanel;
