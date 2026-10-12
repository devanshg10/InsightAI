import { useEffect, useState } from "react";
import OperationPanelShell from "./OperationPanelShell";
import { buildColumnOptions, hasColumns } from "../../preprocessingOptions";

const dateMethods = ["Extract Year", "Extract Month", "Extract Day", "Format", "Shift"];
const dateFormats = [
  ["%Y-%m-%d", "YYYY-MM-DD (2026-10-12)"],
  ["%d/%m/%Y", "DD/MM/YYYY (12/10/2026)"],
  ["%m/%d/%Y", "MM/DD/YYYY (10/12/2026)"],
  ["%B %d, %Y", "Month DD, YYYY"],
];

function DateOperationsPanel({ columnNames = [], onPreview, onApply, busy }) {
  const columns = buildColumnOptions(columnNames);
  const disabled = !hasColumns(columnNames) || busy;
  const [selectedColumn, setSelectedColumn] = useState(columnNames[0] || "");
  const [method, setMethod] = useState(dateMethods[0]);
  const [dateFormat, setDateFormat] = useState(dateFormats[0][0]);
  const [days, setDays] = useState("1");

  useEffect(() => {
    if (!columnNames.includes(selectedColumn)) {
      setSelectedColumn(columnNames[0] || "");
    }
  }, [columnNames, selectedColumn]);

  const buildPayload = () => ({
    operation: "Date Operations",
    column: selectedColumn,
    method,
    optional_parameters: {
      date_format: dateFormat,
      days: Number(days) || 1,
    },
  });

  return (
    <OperationPanelShell
      title="Date Operations"
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
          {dateMethods.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </label>

      {method === "Format" && (
        <label className="preprocessing-field">
          <span>Date Format</span>
          <select disabled={disabled} value={dateFormat} onChange={(event) => setDateFormat(event.target.value)}>
            {dateFormats.map(([fmt, label]) => (
              <option key={fmt} value={fmt}>
                {label}
              </option>
            ))}
          </select>
        </label>
      )}

      {method === "Shift" && (
        <label className="preprocessing-field">
          <span>Shift by Days (+/-)</span>
          <input
            type="number"
            disabled={disabled}
            value={days}
            onChange={(event) => setDays(event.target.value)}
          />
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

export default DateOperationsPanel;
