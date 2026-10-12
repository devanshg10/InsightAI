import { useEffect, useState } from "react";
import OperationPanelShell from "./OperationPanelShell";
import { buildColumnOptions, hasColumns } from "../../preprocessingOptions";

const methods = ["Rename", "Remove", "Move", "Duplicate"];
const positions = ["First", "Last", "Left", "Right"];

function ColumnOperationsPanel({ columnNames = [], onPreview, onApply, busy }) {
  const columns = buildColumnOptions(columnNames);
  const disabled = !hasColumns(columnNames) || busy;
  const [selectedColumn, setSelectedColumn] = useState(columnNames[0] || "");
  const [method, setMethod] = useState(methods[0]);
  const [newName, setNewName] = useState("");
  const [position, setPosition] = useState(positions[0]);

  useEffect(() => {
    if (!columnNames.includes(selectedColumn)) {
      setSelectedColumn(columnNames[0] || "");
    }
  }, [columnNames, selectedColumn]);

  const buildPayload = () => ({
    operation: "Column Operations",
    column: selectedColumn,
    method,
    optional_parameters: {
      new_name: newName.trim() || (method === "Duplicate" ? `${selectedColumn}_copy` : `${selectedColumn}_renamed`),
      position,
    },
  });

  return (
    <OperationPanelShell
      title="Column Operations"
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
        <span>Operation</span>
        <select disabled={disabled} value={method} onChange={(event) => setMethod(event.target.value)}>
          {methods.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </label>

      {(method === "Rename" || method === "Duplicate") && (
        <label className="preprocessing-field">
          <span>New Column Name</span>
          <input
            type="text"
            disabled={disabled}
            placeholder={method === "Duplicate" ? `${selectedColumn}_copy` : `${selectedColumn}_renamed`}
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
          />
        </label>
      )}

      {method === "Move" && (
        <label className="preprocessing-field">
          <span>Target Position</span>
          <select disabled={disabled} value={position} onChange={(event) => setPosition(event.target.value)}>
            {positions.map((pos) => (
              <option key={pos} value={pos}>
                {pos}
              </option>
            ))}
          </select>
        </label>
      )}

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

export default ColumnOperationsPanel;
