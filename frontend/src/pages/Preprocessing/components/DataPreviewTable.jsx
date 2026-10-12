import { useMemo, useState } from "react";
import GlassPanel from "../../../components/GlassPanel/GlassPanel";

function DataPreviewTable({ rows = [], columnNames = [], isPreviewing = false }) {
  const [search, setSearch] = useState("");

  const normalizedRows = useMemo(
    () =>
      rows.map((row, index) => ({
        __rowNumber: index + 1,
        ...row,
      })),
    [rows],
  );

  const columns = useMemo(() => {
    if (columnNames?.length) return ["#", ...columnNames];
    if (!normalizedRows.length) return ["#"];
    return ["#", ...Object.keys(normalizedRows[0]).filter((column) => column !== "__rowNumber")];
  }, [columnNames, normalizedRows]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return normalizedRows;

    return normalizedRows.filter((row) =>
      Object.entries(row).some(
        ([key, value]) => key !== "__rowNumber" && String(value ?? "").toLowerCase().includes(query),
      ),
    );
  }, [normalizedRows, search]);

  return (
    <GlassPanel
      title="Dataset Preview"
      eyebrow={isPreviewing ? "Data Preview • Previewing Unapplied Changes" : "Data Preview • Active Working Copy"}
      className="preprocessing-panel preprocessing-preview-panel"
    >
      <div className="preprocessing-preview-toolbar">
        <span className="preprocessing-preview-meta">
          Showing {filteredRows.length} of {normalizedRows.length} preview rows • {Math.max(0, columns.length - 1)} columns
        </span>
        <div className="preprocessing-search-wrap">
          <input
            type="text"
            placeholder="Search rows or values..."
            aria-label="Search dataset preview"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </div>

      <div className="preprocessing-table-shell">
        {filteredRows.length === 0 ? (
          <div className="preprocessing-table-empty">
            No matching rows found in the current preview.
          </div>
        ) : (
          <table className="preprocessing-table">
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column}>{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row, index) => (
                <tr key={`${row.__rowNumber}-${index}`}>
                  <td>{row.__rowNumber}</td>
                  {columns.slice(1).map((column) => (
                    <td key={column}>
                      {row[column] !== undefined && row[column] !== null && row[column] !== ""
                        ? String(row[column])
                        : <span className="preprocessing-null-cell">null</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </GlassPanel>
  );
}

export default DataPreviewTable;
