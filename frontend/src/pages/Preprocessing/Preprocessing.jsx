import { useCallback, useEffect, useMemo, useState } from "react";
import PreprocessingHeader from "./components/PreprocessingHeader";
import OperationWorkspace from "./components/OperationWorkspace";
import OperationsSidebar from "./components/OperationsSidebar";
import DataPreviewTable from "./components/DataPreviewTable";
import TransformationHistory from "./components/TransformationHistory";
import BottomToolbar from "./components/BottomToolbar";
import {
  applyPreprocessingOperation,
  clearPreprocessingHistory,
  exportPreprocessingDataset,
  fetchPreprocessingStatus,
  normalizePreprocessingDataset,
  previewPreprocessingOperation,
  redoPreprocessingOperation,
  resetPreprocessingDataset,
  undoPreprocessingOperation,
} from "./preprocessingApi";
import "./Preprocessing.css";

const operations = [
  "Missing Values",
  "Duplicates",
  "Column Operations",
  "Data Types",
  "Text Operations",
  "Numeric Operations",
  "Date Operations",
  "Encoding",
  "Scaling",
  "Sorting",
  "Filtering",
];

function Preprocessing({ result, setResult, setActivePage }) {
  const [selectedOperation, setSelectedOperation] = useState("Missing Values");
  const [historyOpen, setHistoryOpen] = useState(true);
  const [workingState, setWorkingState] = useState(null);
  const [previewState, setPreviewState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const dataset = useMemo(() => normalizePreprocessingDataset(result), [result]);

  const syncWithBackendResponse = useCallback(
    (response) => {
      setWorkingState({
        rows: response.rows,
        columns: response.columns,
        columnNames: response.column_names || [],
        previewRows: response.preview || [],
        missingValues: response.missing_values ?? 0,
        duplicateRows: response.duplicate_rows ?? 0,
        qualityScore: response.quality_score ?? 86,
        history: response.history || [],
        canUndo: Boolean(response.can_undo),
        canRedo: Boolean(response.can_redo),
      });
      setPreviewState(null);

      if (setResult && response.preview) {
        setResult((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            rows: response.rows ?? prev.rows,
            columns: response.columns ?? prev.columns,
            column_names: response.column_names || prev.column_names,
            preview: response.preview || prev.preview,
            missing_values: response.missing_values ?? prev.missing_values,
            duplicate_rows: response.duplicate_rows ?? prev.duplicate_rows,
            quality_score: response.quality_score ?? prev.quality_score,
            column_details: response.column_details || prev.column_details,
            health_metrics: response.health_metrics || prev.health_metrics,
            numeric_stats: response.numeric_stats || prev.numeric_stats,
            correlation_summary: response.correlation_summary || prev.correlation_summary,
            data_types_present: response.data_types_present || prev.data_types_present,
            date_column_names: response.date_column_names || prev.date_column_names,
          };
        });
      }
    },
    [setResult],
  );

  useEffect(() => {
    if (!dataset.hasDataset) return;
    let cancelled = false;
    fetchPreprocessingStatus()
      .then((status) => {
        if (cancelled) return;
        setWorkingState({
          rows: status.rows ?? dataset.rows,
          columns: status.columns ?? dataset.columns,
          columnNames: status.column_names || dataset.columnNames,
          previewRows: status.preview || dataset.previewRows,
          missingValues: status.missing_values ?? result?.missing_values ?? 0,
          duplicateRows: status.duplicate_rows ?? result?.duplicate_rows ?? 0,
          qualityScore: status.quality_score ?? result?.quality_score ?? 86,
          history: status.history || [],
          canUndo: Boolean(status.can_undo),
          canRedo: Boolean(status.can_redo),
        });
      })
      .catch(() => {
        // Keep initial uploaded dataset state if status fetch fails
      });
    return () => {
      cancelled = true;
    };
  }, [dataset.datasetSignature, dataset.hasDataset]);

  const activeRows = previewState?.previewRows
    ?? workingState?.previewRows
    ?? dataset.previewRows;

  const activeColumns = previewState?.previewColumns
    ?? workingState?.columnNames
    ?? dataset.columnNames;

  const datasetSummary = useMemo(
    () => ({
      name: dataset.datasetName || "Current Dataset",
      rows: previewState?.rows ?? workingState?.rows ?? dataset.rows,
      columns: previewState?.columns ?? workingState?.columns ?? dataset.columns,
      missing: previewState?.missingValues ?? workingState?.missingValues ?? result?.missing_values ?? 0,
      duplicates: previewState?.duplicateRows ?? workingState?.duplicateRows ?? result?.duplicate_rows ?? 0,
      score: previewState?.qualityScore ?? workingState?.qualityScore ?? result?.quality_score ?? 86,
      isPreview: Boolean(previewState),
    }),
    [dataset, previewState, result, workingState],
  );

  const handlePreview = async (payload) => {
    setBusy(true);
    setErrorMessage("");
    try {
      const response = await previewPreprocessingOperation(payload);
      setPreviewState({
        previewRows: response.preview || [],
        previewColumns: response.column_names || activeColumns,
        rows: response.rows ?? activeRows.length,
        columns: response.columns ?? activeColumns.length,
        missingValues: response.missing_values ?? 0,
        duplicateRows: response.duplicate_rows ?? 0,
        qualityScore: response.quality_score ?? 86,
      });
      setStatusMessage(response.message || `Previewing ${payload.operation} (${payload.method}). Click Apply to commit.`);
    } catch (error) {
      setErrorMessage(error.response?.data?.detail || "Could not preview this operation.");
    } finally {
      setBusy(false);
    }
  };

  const handleApply = async (payload) => {
    setBusy(true);
    setErrorMessage("");
    try {
      const response = await applyPreprocessingOperation(payload);
      syncWithBackendResponse(response);
      setStatusMessage(response.message || `Applied ${payload.operation} (${payload.method}).`);
    } catch (error) {
      setErrorMessage(error.response?.data?.detail || "Could not apply this operation.");
    } finally {
      setBusy(false);
    }
  };

  const handleUndo = async () => {
    setBusy(true);
    setErrorMessage("");
    try {
      const response = await undoPreprocessingOperation();
      syncWithBackendResponse(response);
      setStatusMessage(response.message || "Undid last transformation.");
    } catch (error) {
      setErrorMessage(error.response?.data?.detail || "Nothing to undo.");
    } finally {
      setBusy(false);
    }
  };

  const handleRedo = async () => {
    setBusy(true);
    setErrorMessage("");
    try {
      const response = await redoPreprocessingOperation();
      syncWithBackendResponse(response);
      setStatusMessage(response.message || "Redid transformation.");
    } catch (error) {
      setErrorMessage(error.response?.data?.detail || "Nothing to redo.");
    } finally {
      setBusy(false);
    }
  };

  const handleReset = async () => {
    setBusy(true);
    setErrorMessage("");
    try {
      const response = await resetPreprocessingDataset();
      syncWithBackendResponse(response);
      setStatusMessage(response.message || "Dataset reset to original uploaded state.");
    } catch (error) {
      setErrorMessage(error.response?.data?.detail || "Could not reset dataset.");
    } finally {
      setBusy(false);
    }
  };

  const handleClearHistory = async () => {
    setBusy(true);
    setErrorMessage("");
    try {
      const response = await clearPreprocessingHistory();
      setWorkingState((prev) => (prev ? { ...prev, history: response.history || [] } : prev));
      setStatusMessage(response.message || "Transformation history cleared.");
    } catch (error) {
      setErrorMessage(error.response?.data?.detail || "Could not clear transformation history.");
    } finally {
      setBusy(false);
    }
  };

  const handleExport = async () => {
    setBusy(true);
    setErrorMessage("");
    try {
      await exportPreprocessingDataset(activeRows, activeColumns, dataset.datasetName);
      setStatusMessage("Exported cleaned dataset as CSV.");
    } catch {
      setErrorMessage("Could not export dataset.");
    } finally {
      setBusy(false);
    }
  };

  if (!dataset.hasDataset) {
    return (
      <section className="preprocessing-page workspace-page reveal">
        <div className="glass-panel preprocessing-outer-box">
          <div className="empty-state">
            <h2>Upload a dataset to start preprocessing</h2>
            <p>The preprocessing workstation uses the same uploaded dataset as the rest of InsightAI.</p>
            {setActivePage && (
              <button className="primary-action" type="button" onClick={() => setActivePage("home")}>
                Upload Dataset
              </button>
            )}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="preprocessing-page workspace-page reveal">
      <div className="glass-panel preprocessing-outer-box">
        <PreprocessingHeader
          summary={datasetSummary}
          historyOpen={historyOpen}
          onToggleHistory={() => setHistoryOpen((value) => !value)}
        />

        <OperationWorkspace
          selectedOperation={selectedOperation}
          columnNames={workingState?.columnNames || dataset.columnNames}
          onPreview={handlePreview}
          onApply={handleApply}
          onDiscardPreview={() => {
            setPreviewState(null);
            setStatusMessage("Preview discarded. Showing active working copy.");
          }}
          isPreviewing={Boolean(previewState)}
          busy={busy}
          statusMessage={statusMessage}
          errorMessage={errorMessage}
        />

        <div className={`preprocessing-layout ${historyOpen ? "history-open" : "history-closed"}`}>
          <div className="preprocessing-column preprocessing-column-left">
            <OperationsSidebar
              operations={operations}
              selectedOperation={selectedOperation}
              onSelectOperation={(op) => {
                setSelectedOperation(op);
                setErrorMessage("");
              }}
            />
          </div>

          <div className="preprocessing-column preprocessing-column-center">
            <DataPreviewTable
              rows={activeRows}
              columnNames={activeColumns}
              isPreviewing={Boolean(previewState)}
            />
          </div>

          {historyOpen && (
            <div className="preprocessing-column preprocessing-column-right is-open">
              <TransformationHistory
                historyItems={workingState?.history || []}
                canUndo={Boolean(workingState?.canUndo)}
                busy={busy}
                onUndo={handleUndo}
                onClearHistory={handleClearHistory}
                onClose={() => setHistoryOpen(false)}
              />
            </div>
          )}
        </div>

        <BottomToolbar
          canUndo={Boolean(workingState?.canUndo)}
          canRedo={Boolean(workingState?.canRedo)}
          busy={busy}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onReset={handleReset}
          onExport={handleExport}
          onContinue={() => setActivePage?.("visualization")}
        />
      </div>
    </section>
  );
}

export default Preprocessing;
