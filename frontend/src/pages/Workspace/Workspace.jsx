import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import ColumnExplorer from "../../components/ColumnExplorer/ColumnExplorer";
import DataTable from "../../components/DataTable/DataTable";
import GlassPanel from "../../components/GlassPanel/GlassPanel";
import StatisticsSection from "../../components/StatisticsSection/StatisticsSection";
import "./Workspace.css";

const API_BASE = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

function formatBytes(bytes = 0) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function MetricList({ items }) {
  return (
    <div className="metric-list">
      {items.map((item) => (
        <div className="metric-item" key={item.label}>
          <span>{item.label}</span>
          <strong>{item.value}</strong>
        </div>
      ))}
    </div>
  );
}

function ExpandableText({ children, maxLength = 420 }) {
  const [expanded, setExpanded] = useState(false);
  const text = children || "";
  const shouldTrim = text.length > maxLength;
  const displayedText = shouldTrim && !expanded ? `${text.slice(0, maxLength)}...` : text;

  return (
    <div className="expandable-copy">
      <p>{displayedText}</p>
      {shouldTrim && (
        <button type="button" onClick={() => setExpanded((value) => !value)}>
          {expanded ? "View Less" : "View More"}
        </button>
      )}
    </div>
  );
}

function AIBlock({ loading, text, fallback }) {
  if (loading) return <div className="loading-line">Generating analysis...</div>;
  if (!text) return <p className="muted-copy">{fallback}</p>;
  return <ExpandableText>{text}</ExpandableText>;
}

function RecommendationList({ loading, recommendations }) {
  if (loading) return <div className="loading-line">Generating recommendations...</div>;
  if (!recommendations.length) return <p className="muted-copy">No AI recommendations available yet.</p>;

  return (
    <ul className="recommendation-list">
      {recommendations.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function CorrelationSummary({ correlations }) {
  if (!correlations?.length) {
    return <p className="muted-copy">At least two numeric columns are needed to calculate correlations.</p>;
  }

  return (
    <div className="correlation-list">
      {correlations.map((item) => (
        <div className="correlation-row" key={`${item.first_column}-${item.second_column}`}>
          <span>{item.first_column}</span>
          <span>{item.second_column}</span>
          <strong>{item.coefficient}</strong>
        </div>
      ))}
    </div>
  );
}

function Workspace({
  result,
  explorerColumn,
  setExplorerColumn,
  setActivePage,
}) {
  const [dataStory, setDataStory] = useState("");
  const [recommendations, setRecommendations] = useState([]);
  const [columnExplanation, setColumnExplanation] = useState("");
  const [loadingStory, setLoadingStory] = useState(false);
  const [loadingRecommendations, setLoadingRecommendations] = useState(false);
  const [loadingColumnExplanation, setLoadingColumnExplanation] = useState(false);

  const cacheKey = useMemo(() => {
    if (!result?.dataset_signature) return "";
    return `insightai:${result.dataset_signature}`;
  }, [result?.dataset_signature]);

  const isValidAIResponse = (value) =>
    Boolean(value && typeof value === "string" && value.trim() && value.trim() !== "AI Model unavailable");

  useEffect(() => {
    if (!result || !cacheKey) return;

    const cachedStory = localStorage.getItem(`${cacheKey}:data-story`);
    if (isValidAIResponse(cachedStory)) {
      setDataStory(cachedStory);
      return;
    }
    if (cachedStory) {
      localStorage.removeItem(`${cacheKey}:data-story`);
    }

    setLoadingStory(true);
    axios
      .post(`${API_BASE}/ai-analysis`, {
        prompt: `You are a professional data analyst. Using only this lightweight dataset metadata, write one concise paragraph explaining what the dataset represents, what one row likely represents, the likely business domain, likely business objective, and overall purpose. Never invent specific values. Metadata: ${JSON.stringify(result.ai_metadata)}`,
      })
      .then((response) => {
        const analysis = response.data.analysis || "";
        setDataStory(analysis);
        if (isValidAIResponse(analysis)) {
          localStorage.setItem(`${cacheKey}:data-story`, analysis);
        }
      })
      .catch(() => setDataStory(""))
      .finally(() => setLoadingStory(false));
  }, [cacheKey, result]);

  useEffect(() => {
    if (!result || !cacheKey) return;

    const cachedRecommendations = localStorage.getItem(`${cacheKey}:recommendations`);
    if (cachedRecommendations) {
      try {
        const parsed = JSON.parse(cachedRecommendations);
        if (Array.isArray(parsed) && parsed.length > 0 && parsed.every(isValidAIResponse)) {
          setRecommendations(parsed);
          return;
        }
        localStorage.removeItem(`${cacheKey}:recommendations`);
      } catch {
        localStorage.removeItem(`${cacheKey}:recommendations`);
      }
    }

    setLoadingRecommendations(true);
    axios
      .post(`${API_BASE}/ai-analysis`, {
        prompt: `You are a data analyst. Using only this lightweight metadata, return 5 concise, practical bullet recommendations. Cover cleaning actions, interesting columns, a potential target variable if identifiable, exploratory analyses, and relationships worth investigating. Do not fabricate values. Metadata: ${JSON.stringify(result.ai_metadata)}`,
      })
      .then((response) => {
        const analysis = response.data.analysis || "";
        if (!isValidAIResponse(analysis)) {
          setRecommendations([]);
          return;
        }
        const items = analysis
          .split("\n")
          .map((line) => line.replace(/^[-*\d.\s]+/, "").trim())
          .filter(isValidAIResponse)
          .slice(0, 7);
        setRecommendations(items);
        if (items.length > 0) {
          localStorage.setItem(`${cacheKey}:recommendations`, JSON.stringify(items));
        }
      })
      .catch(() => setRecommendations([]))
      .finally(() => setLoadingRecommendations(false));
  }, [cacheKey, result]);

  useEffect(() => {
    if (!result || !cacheKey || !explorerColumn) return;

    const column = result.column_details[explorerColumn];
    const cachedExplanation = localStorage.getItem(`${cacheKey}:column:${explorerColumn}`);
    if (isValidAIResponse(cachedExplanation)) {
      setColumnExplanation(cachedExplanation);
      return;
    }
    if (cachedExplanation) {
      localStorage.removeItem(`${cacheKey}:column:${explorerColumn}`);
    }

    setColumnExplanation("");
    setLoadingColumnExplanation(true);
    axios
      .post(`${API_BASE}/ai-analysis`, {
        prompt: `In one sentence, explain this dataset column for a business analyst. Use only the provided metadata and do not invent values. Column metadata: ${JSON.stringify(column)}`,
      })
      .then((response) => {
        const explanation = response.data.analysis || "";
        setColumnExplanation(explanation);
        if (isValidAIResponse(explanation)) {
          localStorage.setItem(`${cacheKey}:column:${explorerColumn}`, explanation);
        }
      })
      .catch(() => setColumnExplanation(""))
      .finally(() => setLoadingColumnExplanation(false));
  }, [cacheKey, explorerColumn, result]);

  if (!result) {
    return (
      <section className="workspace-page reveal">
        <div className="empty-state">
          <h2>No dataset loaded yet</h2>
          <p>Start a new analysis from the upload page to unlock the workspace.</p>
          <button className="primary-action" onClick={() => setActivePage("home")}>
            New Analysis
          </button>
        </div>
      </section>
    );
  }

  const health = result.health_metrics || {};
  const quickFacts = [
    { label: "Total Rows", value: result.rows },
    { label: "Total Columns", value: result.columns },
    { label: "Numeric Columns", value: result.numeric_columns },
    { label: "Categorical Columns", value: result.categorical_columns },
    { label: "Date Columns", value: result.date_columns },
    { label: "Data Types", value: result.data_types_present?.join(", ") || "None" },
  ];
  const healthFacts = [
    { label: "Total Missing Values", value: health.total_missing_values ?? 0 },
    { label: "Duplicate Rows", value: health.duplicate_rows ?? 0 },
    { label: "Outlier Count", value: health.outlier_count ?? 0 },
    { label: "Empty Columns", value: health.empty_columns?.length ?? 0 },
    { label: "Invalid Data Types", value: health.invalid_data_types?.length ?? 0 },
  ];

  return (
    <section className="workspace-page reveal">
      <div className="workspace-grid">
        <GlassPanel title="Data Story" eyebrow="AI Summary">
          <AIBlock loading={loadingStory} text={dataStory} fallback="Upload metadata is ready for summary generation." />
        </GlassPanel>

        <GlassPanel title="Dataset Health" eyebrow="Quality Overview">
          <MetricList items={healthFacts} />
          {(health.empty_columns?.length > 0 || health.invalid_data_types?.length > 0) && (
            <div className="detail-note">
              <p>Empty: {health.empty_columns?.join(", ") || "None"}</p>
              <p>Type checks: {health.invalid_data_types?.join(", ") || "None"}</p>
            </div>
          )}
        </GlassPanel>

        <GlassPanel title="Quick Facts" eyebrow="Metadata">
          <span className="file-size-pill">{formatBytes(result.file_size)}</span>
          <MetricList items={quickFacts} />
        </GlassPanel>

        <GlassPanel title="Numeric Statistics" eyebrow="Pandas Profile">
          <StatisticsSection stats={result.numeric_stats} />
        </GlassPanel>

        <GlassPanel title="Column Explorer" eyebrow={`${result.columns} Total`}>
          <select
            value={explorerColumn}
            onChange={(event) => setExplorerColumn(event.target.value)}
          >
            <option value="">Choose Column</option>
            {result.column_names.map((col) => (
              <option key={col} value={col}>
                {col}
              </option>
            ))}
          </select>
          <ColumnExplorer
            selectedColumn={explorerColumn}
            columnDetails={result.column_details}
            aiExplanation={columnExplanation}
            loadingExplanation={loadingColumnExplanation}
          />
        </GlassPanel>

        <GlassPanel title="Correlation Summary" eyebrow="Top Relationships">
          <CorrelationSummary correlations={result.correlation_summary} />
        </GlassPanel>

        <GlassPanel title="AI Recommendations" eyebrow="Next Actions">
          <RecommendationList
            loading={loadingRecommendations}
            recommendations={recommendations}
          />
        </GlassPanel>

        <GlassPanel title="Data Preview" eyebrow="Interactive Table">
          <DataTable preview={result.preview} />
        </GlassPanel>
      </div>
    </section>
  );
}

export default Workspace;
