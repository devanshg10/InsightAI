import { useEffect, useState } from "react";
import OperationPanelShell from "./OperationPanelShell";
import { buildColumnOptions, hasColumns } from "../../preprocessingOptions";

const numericMethods = ["Normalize", "Clip", "Round", "Bin"];

function NumericOperationsPanel({ columnNames = [], onPreview, onApply, busy }) {
  const columns = buildColumnOptions(columnNames);
  const disabled = !hasColumns(columnNames) || busy;
  const [selectedColumn, setSelectedColumn] = useState(columnNames[0] || "");
  const [method, setMethod] = useState(numericMethods[0]);
  const [decimals, setDecimals] = useState("2");
  const [bins, setBins] = useState("4");
  const [minValue, setMinValue] = useState("");
  const [maxValue, setMaxValue] = useState("");

  useEffect(() => {
    if (!columnNames.includes(selectedColumn)) {
      setSelectedColumn(columnNames[0] || "");
    }
  }, [columnNames, selectedColumn]);

  const buildPayload = () => ({
    operation: "Numeric Operations",
    column: selectedColumn,
    method,
    optional_parameters: {
      decimals: Number(decimals) || 2,
      bins: Number(bins) || 4,
      min_value: minValue,
      max_value: maxValue,
    },
  });

  return (
    <OperationPanelShell
      title="Numeric Operations"
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
          {numericMethods.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </label>

      {method === "Round" && (
        <label className="preprocessing-field">
          <span>Decimal Places</span>
          <input
            type="number"
            min="0"
            max="10"
            disabled={disabled}
            value={decimals}
            onChange={(event) => setDecimals(event.target.value)}
          />
        </label>
      )}

      {method === "Bin" && (
        <label className="preprocessing-field">
          <span>Number of Bins</span>
          <input
            type="number"
            min="2"
            max="20"
            disabled={disabled}
            value={bins}
            onChange={(event) => setBins(event.target.value)}
          />
        </label>
      )}

      {method === "Clip" && (
        <>
          <label className="preprocessing-field">
            <span>Min Threshold (optional)</span>
            <input
              type="number"
              disabled={disabled}
              placeholder="Default: 5th percentile"
              value={minValue}
              onChange={(event) => setMinValue(event.target.value)}
            />
          </label>
          <label className="preprocessing-field">
            <span>Max Threshold (optional)</span>
            <input
              type="number"
              disabled={disabled}
              placeholder="Default: 95th percentile"
              value={maxValue}
              onChange={(event) => setMaxValue(event.target.value)}
            />
          </label>
        </>
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

export default NumericOperationsPanel;
