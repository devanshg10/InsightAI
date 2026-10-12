import { useEffect, useState } from "react";
import OperationPanelShell from "./OperationPanelShell";
import { buildColumnOptions, hasColumns } from "../../preprocessingOptions";

const textMethods = ["Lowercase", "Uppercase", "Title Case", "Trim", "Replace"];

function TextOperationsPanel({ columnNames = [], onPreview, onApply, busy }) {
  const columns = buildColumnOptions(columnNames);
  const disabled = !hasColumns(columnNames) || busy;
  const [selectedColumn, setSelectedColumn] = useState(columnNames[0] || "");
  const [method, setMethod] = useState(textMethods[0]);
  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");

  useEffect(() => {
    if (!columnNames.includes(selectedColumn)) {
      setSelectedColumn(columnNames[0] || "");
    }
  }, [columnNames, selectedColumn]);

  const buildPayload = () => ({
    operation: "Text Operations",
    column: selectedColumn,
    method,
    optional_parameters: method === "Replace" ? { find_text: findText, replace_text: replaceText } : {},
  });

  return (
    <OperationPanelShell
      title="Text Operations"
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
          {textMethods.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </label>

      {method === "Replace" && (
        <>
          <label className="preprocessing-field">
            <span>Find Text</span>
            <input
              type="text"
              disabled={disabled}
              placeholder="Text to find"
              value={findText}
              onChange={(event) => setFindText(event.target.value)}
            />
          </label>
          <label className="preprocessing-field">
            <span>Replace With</span>
            <input
              type="text"
              disabled={disabled}
              placeholder="Replacement text"
              value={replaceText}
              onChange={(event) => setReplaceText(event.target.value)}
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

export default TextOperationsPanel;
