import { useMemo, useState } from "react";
import "./DataTable.css";

const PAGE_SIZE = 10;

function DataTable({ preview }) {
  const [search, setSearch] = useState("");
  const [activeColumn, setActiveColumn] = useState("all");
  const [sortConfig, setSortConfig] = useState({ key: "", direction: "asc" });
  const [page, setPage] = useState(1);

  const columns = useMemo(() => (preview?.length ? Object.keys(preview[0]) : []), [preview]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return preview || [];

    return (preview || []).filter((row) => {
      const values = activeColumn === "all" ? Object.values(row) : [row[activeColumn]];
      return values.some((value) => String(value).toLowerCase().includes(query));
    });
  }, [activeColumn, preview, search]);

  const sortedRows = useMemo(() => {
    if (!sortConfig.key) return filteredRows;

    return [...filteredRows].sort((a, b) => {
      const first = a[sortConfig.key];
      const second = b[sortConfig.key];
      const firstNumber = Number(first);
      const secondNumber = Number(second);
      const bothNumeric = !Number.isNaN(firstNumber) && !Number.isNaN(secondNumber);
      const comparison = bothNumeric
        ? firstNumber - secondNumber
        : String(first).localeCompare(String(second));

      return sortConfig.direction === "asc" ? comparison : -comparison;
    });
  }, [filteredRows, sortConfig]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visibleRows = sortedRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const updateSort = (key) => {
    setSortConfig((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc",
    }));
  };

  return (
    <>
      <h2>Data Preview</h2>

      <div className="table-toolbar">
        <input
          type="search"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          placeholder="Search rows"
        />

        <select
          value={activeColumn}
          onChange={(event) => {
            setActiveColumn(event.target.value);
            setPage(1);
          }}
        >
          <option value="all">All Columns</option>
          {columns.map((column) => (
            <option key={column} value={column}>
              {column}
            </option>
          ))}
        </select>
      </div>

      <div className="table-container">
        <table className="preview-table">
          <thead>
            <tr>
              {columns.map((key) => (
                <th key={key}>
                  <button type="button" onClick={() => updateSort(key)}>
                    {key}
                    {sortConfig.key === key ? ` ${sortConfig.direction === "asc" ? "ASC" : "DESC"}` : ""}
                  </button>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {visibleRows.map((row, index) => (
              <tr key={`${currentPage}-${index}`}>
                {columns.map((column) => (
                  <td key={column}>{row[column]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="pagination-row">
        <span>
          Page {currentPage} of {totalPages}
        </span>
        <div>
          <button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))}>
            Prev
          </button>
          <button type="button" onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>
            Next
          </button>
        </div>
      </div>
    </>
  );
}

export default DataTable;
