import axios from "axios";

const API_BASE = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

export function normalizePreprocessingDataset(result) {
  if (!result) {
    return {
      datasetName: "",
      datasetSignature: "",
      rows: 0,
      columns: 0,
      columnNames: [],
      previewRows: [],
      hasDataset: false,
    };
  }

  const previewRows = Array.isArray(result.preview) ? result.preview : [];
  const columnNames = result.column_names || (previewRows.length ? Object.keys(previewRows[0]) : []);

  return {
    datasetName: result.dataset_name || result.filename || "Uploaded Dataset",
    datasetSignature: result.dataset_signature || "",
    rows: result.rows ?? previewRows.length ?? 0,
    columns: result.columns ?? columnNames.length ?? 0,
    columnNames,
    previewRows,
    hasDataset: previewRows.length > 0 || columnNames.length > 0,
  };
}

export async function fetchPreprocessingStatus() {
  const response = await axios.get(`${API_BASE}/preprocessing/status`);
  return response.data;
}

export async function previewPreprocessingOperation(payload) {
  const response = await axios.post(`${API_BASE}/preprocessing/preview`, payload);
  return response.data;
}

export async function previewMissingValues(payload) {
  return previewPreprocessingOperation(payload);
}

export async function applyPreprocessingOperation(payload) {
  const response = await axios.post(`${API_BASE}/preprocessing/operation`, payload);
  return response.data;
}

export async function undoPreprocessingOperation() {
  const response = await axios.post(`${API_BASE}/preprocessing/undo`);
  return response.data;
}

export async function redoPreprocessingOperation() {
  const response = await axios.post(`${API_BASE}/preprocessing/redo`);
  return response.data;
}

export async function resetPreprocessingDataset() {
  const response = await axios.post(`${API_BASE}/preprocessing/reset`);
  return response.data;
}

export async function clearPreprocessingHistory() {
  const response = await axios.post(`${API_BASE}/preprocessing/clear-history`);
  return response.data;
}

function escapeCsvCell(value) {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function exportPreprocessingDataset(rows = [], columnNames = [], datasetName = "dataset") {
  const cleanBase = (datasetName || "dataset").replace(/\.[^/.]+$/, "");
  const downloadFilename = `${cleanBase}_cleaned.csv`;

  try {
    const response = await axios.get(`${API_BASE}/preprocessing/export`, {
      responseType: "blob",
    });
    const blob = new Blob([response.data], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", downloadFilename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return;
  } catch {
    // Fallback to client-side CSV generation if backend export endpoint is unreachable
    const cols = columnNames.length ? columnNames : (rows.length ? Object.keys(rows[0]) : []);
    const headerLine = cols.map(escapeCsvCell).join(",");
    const dataLines = rows.map((row) => cols.map((col) => escapeCsvCell(row[col])).join(","));
    const csvContent = [headerLine, ...dataLines].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", downloadFilename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}
