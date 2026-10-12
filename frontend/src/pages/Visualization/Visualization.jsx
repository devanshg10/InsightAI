import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import axios from "axios";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import GlassPanel from "../../components/GlassPanel/GlassPanel";
import "./Visualization.css";

const API_BASE = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

const chartTypes = [
  ["bar", "Bar Chart"],
  ["line", "Line Chart"],
  ["pie", "Pie Chart"],
  ["scatter", "Scatter Plot"],
  ["histogram", "Histogram"],
  ["box", "Box Plot"],
  ["heatmap", "Correlation Heatmap"],
];

const aggregations = [
  ["sum", "Sum"],
  ["mean", "Mean"],
  ["count", "Count"],
  ["min", "Minimum"],
  ["max", "Maximum"],
];

const builderFields = [
  "Chart Type",
  "X-Axis",
  "Y-Axis",
  "Aggregation",
  "Group By",
  "Color By",
];

const fallbackExamplePrompts = [
  "Compare average values across categories",
  "Show trend over time",
  "Display numeric distribution",
  "Show relationship between numeric columns",
  "Show correlation heatmap",
];

const defaultDetails = {
  chart_type: "Not generated",
  x_axis: "Not selected",
  y_axis: "Not selected",
  aggregation: "Not selected",
  group_by: "None",
  color_by: "None",
  records_used: "0",
  generated_time: "--",
};

const chartColors = ["#5281ee", "#001847", "#3b6fd4", "#5f6569", "#2a478f", "#7e7576"];

const displayValue = (value) => value || "None";

// Formats chart numbers for readable details, insights, and exports.
const formatNumber = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return value;
  return Number.isInteger(number) ? number.toLocaleString() : number.toLocaleString(undefined, { maximumFractionDigits: 2 });
};

// Downloads a generated frontend export blob.
const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

// Escapes aggregated chart rows for CSV export.
const escapeCsv = (value) => {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

// Escapes labels for generated SVG exports.
const escapeXml = (value) => String(value ?? "").replace(/[<>&'"]/g, (char) => ({
  "<": "&lt;",
  ">": "&gt;",
  "&": "&amp;",
  "'": "&apos;",
  '"': "&quot;",
}[char]));

// Resolves the uploaded dataset name from available metadata.
const getDatasetName = (result) => result?.dataset_name || result?.file_name || result?.filename || "Uploaded Dataset";

// Creates a readable default chart name from chart metadata.
const getChartName = (response) => {
  const details = response?.details || {};
  return `${details.chart_type || "Chart"} - ${details.x_axis || "Dataset"}`;
};

function getColumnLists(result) {
  const allCols = result?.column_names || [];
  const details = result?.column_details || {};
  const numericCols = allCols.filter((c) => details[c]?.type === "numeric");
  const categoricalCols = allCols.filter((c) => details[c]?.type !== "numeric");
  const dateCols = result?.date_column_names || [];
  return {
    allCols,
    numericCols: numericCols.length ? numericCols : allCols,
    categoricalCols: categoricalCols.length ? categoricalCols : allCols,
    dateCols,
  };
}

function buildDynamicPrompts(result) {
  if (!result?.column_names?.length) return fallbackExamplePrompts;
  const { numericCols, categoricalCols, dateCols } = getColumnLists(result);
  const cat1 = categoricalCols[0] || result.column_names[0];
  const num1 = numericCols[0] || result.column_names[0];
  const num2 = numericCols[1] || numericCols[0] || result.column_names[0];
  const date1 = dateCols[0] || cat1;

  const prompts = [
    `Compare average ${num1} across ${cat1}`,
    `Show ${num1} trend by ${date1}`,
    `Display ${num1} distribution`,
  ];
  if (num1 !== num2) {
    prompts.push(`Show relationship between ${num1} and ${num2}`);
  } else {
    prompts.push(`Show count of records by ${cat1}`);
  }
  if (numericCols.length >= 2) {
    prompts.push("Show correlation heatmap");
  } else {
    prompts.push(`Show box plot of ${num1} by ${cat1}`);
  }
  return prompts;
}

// Builds a standalone SVG image from chart data for reliable exports.
const buildChartExportSvg = ({ chart, details }) => {
  if (!chart?.data?.length) throw new Error("Chart data is not available.");

  const width = 1400;
  const height = 820;
  const margin = { top: 92, right: 64, bottom: 150, left: 96 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const rows = chart.data.filter((row) => Number.isFinite(Number(row[chart.y_key])));
  const values = rows.map((row) => Number(row[chart.y_key]));
  const maxValue = Math.max(...values, 1);
  const minValue = ["scatter", "heatmap"].includes(chart.type) ? Math.min(...values, 0) : 0;
  const yRange = Math.max(maxValue - minValue, 1);
  const xStep = rows.length > 1 ? plotWidth / (rows.length - 1) : plotWidth;
  const barStep = plotWidth / Math.max(rows.length, 1);
  const labelInterval = Math.max(1, Math.ceil(rows.length / 8));
  const yScale = (value) => margin.top + plotHeight - ((Number(value) - minValue) / yRange) * plotHeight;
  const xScale = (index) => margin.left + (rows.length > 1 ? index * xStep : plotWidth / 2);
  const yTicks = Array.from({ length: 5 }, (_, index) => minValue + (yRange * index) / 4);
  const grid = yTicks.map((tick) => {
    const y = yScale(tick);
    return `<line x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}" stroke="#c6ced8" stroke-dasharray="6 6"/><text x="${margin.left - 14}" y="${y + 6}" text-anchor="end" font-size="22" fill="#5f6569">${escapeXml(formatNumber(tick))}</text>`;
  }).join("");
  const xLabels = rows.filter((_, index) => index % labelInterval === 0 || index === rows.length - 1).map((row) => {
    const originalIndex = rows.indexOf(row);
    const label = String(row[chart.x_key] ?? "").slice(0, 26);
    return `<text x="${xScale(originalIndex)}" y="${height - margin.bottom + 48}" text-anchor="middle" font-size="22" fill="#5f6569">${escapeXml(label)}</text>`;
  }).join("");
  let marks;

  if (chart.type === "line") {
    const points = rows.map((row, index) => `${xScale(index)},${yScale(row[chart.y_key])}`).join(" ");
    marks = `<polyline points="${points}" fill="none" stroke="#5281ee" stroke-width="5"/>${rows.map((row, index) => `<circle cx="${xScale(index)}" cy="${yScale(row[chart.y_key])}" r="5" fill="#5281ee"/>`).join("")}`;
  } else if (chart.type === "scatter") {
    const xValues = rows.map((row) => Number(row[chart.x_key]));
    const xMin = Math.min(...xValues, 0);
    const xMax = Math.max(...xValues, 1);
    const xRange = Math.max(xMax - xMin, 1);
    marks = rows.map((row) => {
      const x = margin.left + ((Number(row[chart.x_key]) - xMin) / xRange) * plotWidth;
      return `<circle cx="${x}" cy="${yScale(row[chart.y_key])}" r="7" fill="#5281ee" opacity="0.78"/>`;
    }).join("");
  } else if (chart.type === "pie") {
    let currentAngle = -Math.PI / 2;
    const total = values.reduce((sum, value) => sum + Math.max(value, 0), 0) || 1;
    const cx = width / 2;
    const cy = margin.top + plotHeight / 2;
    const radius = Math.min(plotWidth, plotHeight) * 0.34;
    marks = rows.map((row, index) => {
      const value = Math.max(Number(row[chart.y_key]), 0);
      const nextAngle = currentAngle + (value / total) * Math.PI * 2;
      const largeArc = nextAngle - currentAngle > Math.PI ? 1 : 0;
      const x1 = cx + radius * Math.cos(currentAngle);
      const y1 = cy + radius * Math.sin(currentAngle);
      const x2 = cx + radius * Math.cos(nextAngle);
      const y2 = cy + radius * Math.sin(nextAngle);
      currentAngle = nextAngle;
      return `<path d="M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z" fill="${chartColors[index % chartColors.length]}"/>`;
    }).join("");
  } else {
    marks = rows.map((row, index) => {
      const value = Number(row[chart.y_key]);
      const barHeight = Math.max(2, plotHeight - (yScale(value) - margin.top));
      const x = margin.left + index * barStep + Math.min(4, barStep * 0.12);
      const barWidth = Math.max(3, barStep * 0.76);
      return `<rect x="${x}" y="${yScale(value)}" width="${barWidth}" height="${barHeight}" fill="#5281ee"/>`;
    }).join("");
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="100%" height="100%" fill="#ffffff"/>
    <text x="${margin.left}" y="46" font-size="30" font-weight="700" fill="#495057">${escapeXml(getChartName({ details }))}</text>
    <text x="${margin.left}" y="78" font-size="18" fill="#6c757d">${escapeXml(`${details.dataset_name || "Uploaded Dataset"} • ${details.generated_time || ""}`)}</text>
    <rect x="${margin.left}" y="${margin.top}" width="${plotWidth}" height="${plotHeight}" fill="#f7f9fc" rx="12"/>
    ${grid}
    <line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}" stroke="#5f6569" stroke-width="2"/>
    <line x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}" stroke="#5f6569" stroke-width="2"/>
    ${marks}
    ${chart.type !== "pie" ? xLabels : ""}
    <rect x="${width / 2 - 58}" y="${height - 64}" width="24" height="18" fill="#5281ee"/>
    <text x="${width / 2 - 26}" y="${height - 48}" font-size="22" fill="#5281ee">${escapeXml(chart.y_key || "value")}</text>
  </svg>`;
};

// Converts a chart SVG string to a canvas for image exports.
const svgToCanvas = async (svgText) => {
  const image = new Image();
  const svgBlob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);

  try {
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
      image.src = url;
    });

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(image.width || 1200, 1200);
    canvas.height = Math.max(image.height || 620, 620);
    const context = canvas.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
};

const dataUrlToBytes = (dataUrl) => Uint8Array.from(atob(dataUrl.split(",")[1] || ""), (char) => char.charCodeAt(0));

const textToBytes = (text) => Uint8Array.from(text, (char) => char.charCodeAt(0));

// Builds a lightweight PDF containing chart image and metadata.
const buildPdfBlob = (title, details, generatedTime, imageDataUrl, imageWidth = 1400, imageHeight = 820) => {
  const imageBytes = dataUrlToBytes(imageDataUrl);
  const textLines = [
    title,
    `Generated: ${generatedTime}`,
    `Chart Type: ${details.chart_type || "Unknown"}`,
    `Dataset: ${details.dataset_name || "Uploaded Dataset"}`,
    `X Axis: ${details.x_axis || "Not selected"}`,
    `Y Axis: ${details.y_axis || "Not applicable"}`,
    `Aggregation: ${details.aggregation || "Not applicable"}`,
    `Group By: ${details.group_by || "None"}`,
    `Color By: ${details.color_by || "None"}`,
    `Records Used: ${details.records_used || 0}`,
  ];
  const text = textLines
    .map((line, index) => `BT /F1 ${index === 0 ? 18 : 10} Tf 40 ${780 - index * 18} Td (${String(line).replace(/[()\\]/g, "\\$&")}) Tj ET`)
    .join("\n");
  const content = `${text}\nq 520 0 0 305 40 220 cm /Im1 Do Q`;
  const objects = [
    [textToBytes("<< /Type /Catalog /Pages 2 0 R >>")],
    [textToBytes("<< /Type /Pages /Kids [3 0 R] /Count 1 >>")],
    [textToBytes("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> /XObject << /Im1 5 0 R >> >> /Contents 6 0 R >>")],
    [textToBytes("<< /Type /Font /Subtype /Helvetica /BaseFont /Helvetica >>")],
    [
      textToBytes(`<< /Type /XObject /Subtype /Image /Width ${imageWidth} /Height ${imageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imageBytes.length} >>\nstream\n`),
      imageBytes,
      textToBytes("\nendstream"),
    ],
    [textToBytes(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`)],
  ];
  const chunks = [textToBytes("%PDF-1.4\n")];
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(chunks.reduce((total, chunk) => total + chunk.length, 0));
    chunks.push(textToBytes(`${index + 1} 0 obj\n`), ...object, textToBytes("\nendobj\n"));
  });
  const xref = chunks.reduce((total, chunk) => total + chunk.length, 0);
  let trailer = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    trailer += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  trailer += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  chunks.push(textToBytes(trailer));
  return new Blob(chunks, { type: "application/pdf" });
};

// Adds frontend-only dataset and generation mode metadata to chart details.
const enrichDetails = (details, result, mode) => ({
  ...defaultDetails,
  ...(details || {}),
  dataset_name: getDatasetName(result),
  generation_mode: details?.generation_mode || (mode === "assistant" ? "Assistant" : "Builder"),
});

// Creates a session-only saved chart record.
const createSavedChart = (response, result, mode) => ({
  id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
  name: getChartName(response),
  chart: response.chart,
  details: enrichDetails(response.details, result, mode),
  date: new Date().toLocaleDateString(),
  time: new Date().toLocaleTimeString(),
});

// Generates analyst-style insights from rendered chart data only.
const buildInsights = (chart) => {
  if (!chart?.data?.length) return [];

  if (chart.type === "heatmap") {
    const offDiagonal = chart.data.filter((r) => r.row !== r.column && Number.isFinite(Number(r.value)));
    if (!offDiagonal.length) return ["Correlation matrix generated for numeric features."];
    const sorted = [...offDiagonal].sort((a, b) => Math.abs(Number(b.value)) - Math.abs(Number(a.value)));
    const top = sorted[0];
    return [
      `Strongest relationship is between ${top.row} and ${top.column} (r = ${top.value}).`,
      `Evaluated ${chart.matrix_columns?.length || 0} numeric columns across the dataset.`,
      Number(top.value) > 0.5
        ? `Positive correlation suggests ${top.row} and ${top.column} move together.`
        : Number(top.value) < -0.5
          ? `Negative correlation suggests ${top.row} and ${top.column} move inversely.`
          : "Most variable pairs show weak-to-moderate linear correlation.",
    ];
  }

  if (chart.type === "box") {
    const rows = chart.data;
    const sorted = [...rows].sort((a, b) => Number(b.median) - Number(a.median));
    const highest = sorted[0];
    const widest = [...rows].sort((a, b) => Number(b.iqr) - Number(a.iqr))[0];
    return [
      `${highest.category} has the highest median at ${formatNumber(highest.median)} (range: ${formatNumber(highest.min)} to ${formatNumber(highest.max)}).`,
      `${widest.category} exhibits the widest interquartile spread (IQR = ${formatNumber(widest.iqr)}).`,
      `Compared quartile distributions across ${rows.length} group${rows.length === 1 ? "" : "s"}.`,
    ];
  }

  const xKey = chart.x_key;
  const yKey = chart.y_key;
  const rows = chart.data.filter((row) => Number.isFinite(Number(row[yKey])));
  if (!rows.length) return ["Chart data is available, but no numeric values were found for insight generation."];

  const sorted = [...rows].sort((a, b) => Number(b[yKey]) - Number(a[yKey]));
  const highest = sorted[0];
  const lowest = sorted[sorted.length - 1];
  const values = rows.map((row) => Number(row[yKey]));
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const insights = [
    `${highest[xKey]} has the highest ${yKey} at ${formatNumber(highest[yKey])}.`,
    `${lowest[xKey]} has the lowest ${yKey} at ${formatNumber(lowest[yKey])}.`,
    `The average ${yKey} across visible chart points is ${formatNumber(average)}.`,
  ];

  if (rows.length >= 3) {
    const first = Number(rows[0][yKey]);
    const last = Number(rows[rows.length - 1][yKey]);
    if (last > first) insights.push(`${yKey} increases from the first point to the last point.`);
    if (last < first) insights.push(`${yKey} decreases from the first point to the last point.`);
  }

  const outlier = rows.find((row) => Number(row[yKey]) > average * 2 && Number(row[yKey]) !== Number(highest[yKey]));
  if (outlier) insights.push(`${outlier[xKey]} stands out as a possible high outlier at ${formatNumber(outlier[yKey])}.`);
  if (rows.length > 1) insights.push(`The visible chart uses ${rows.length} aggregated data point${rows.length === 1 ? "" : "s"}.`);

  return insights.slice(0, 8);
};

function toChartRequest(config, filters = []) {
  const noYAxis = ["histogram", "heatmap"].includes(config.chartType);
  const noAgg = ["scatter", "histogram", "box", "heatmap"].includes(config.chartType);
  const effectiveY = noYAxis
    ? null
    : config.yAxis || (config.aggregation === "count" ? config.xAxis : null);

  return {
    chart_type: config.chartType,
    x_axis: config.xAxis || null,
    y_axis: effectiveY,
    aggregation: noAgg ? null : (config.aggregation || "sum"),
    group_by: config.groupBy || null,
    color_by: config.colorBy || null,
    filters,
  };
}

function ModeOption({ active, icon, title, description, buttonLabel, onSelect }) {
  return (
    <article className={`visual-mode-card ${active ? "active" : ""}`}>
      <div className="visual-mode-heading">
        <span aria-hidden="true">{icon}</span>
        <h3>{title}</h3>
      </div>
      <p>{description}</p>
      <button type="button" onClick={onSelect}>
        {buttonLabel}
      </button>
    </article>
  );
}

function PlaceholderField({ label }) {
  return (
    <label className="visual-field">
      <span>{label}</span>
      <div className="visual-placeholder">Pending prompt interpretation</div>
    </label>
  );
}

function SelectField({ label, value, onChange, options, disabled = false, includeNone = false, placeholder }) {
  return (
    <label className="visual-field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled}>
        <option value="">{placeholder || (includeNone ? "None" : `Select ${label}`)}</option>
        {options.map(([valueOption, labelOption]) => (
          <option key={valueOption} value={valueOption}>
            {labelOption}
          </option>
        ))}
      </select>
    </label>
  );
}

function DetailList({ details }) {
  const items = [
    ["Chart Type", details.chart_type],
    ["X-Axis", details.x_axis],
    ["Y-Axis", details.y_axis],
    ["Aggregation", details.aggregation],
    ["Group By", details.group_by],
    ["Color By", details.color_by],
    ["Dataset Name", details.dataset_name],
    ["Generation Mode", details.generation_mode],
    ["Records Used", details.records_used],
    ["Generated Time", details.generated_time],
  ];

  return (
    <div className="visual-detail-list">
      {items.map(([label, value]) => (
        <div className="visual-detail-row" key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}

// Renders generated chart insights or a friendly empty state.
function InsightsList({ insights, hasChart }) {
  if (!hasChart) return <p className="visual-empty-copy">Generate a chart to view insights.</p>;
  if (!insights.length) return <p className="visual-empty-copy">No chart generated yet.</p>;

  return (
    <ul className="visual-insight-list">
      {insights.map((insight) => (
        <li key={insight}>{insight}</li>
      ))}
    </ul>
  );
}

// Renders session-saved charts with open, rename, and delete controls.
function SavedChartsList({ charts, editingId, renameValue, onOpen, onRenameStart, onRenameChange, onRenameSave, onDelete }) {
  if (!charts.length) return <p className="visual-empty-copy">No charts generated yet. Generate a chart above to save it to your library.</p>;

  return (
    <div className="visual-saved-list">
      {charts.map((savedChart) => (
        <article className="visual-saved-item" key={savedChart.id}>
          {editingId === savedChart.id ? (
            <input
              value={renameValue}
              onChange={(event) => onRenameChange(event.target.value)}
              onBlur={() => onRenameSave(savedChart.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter") onRenameSave(savedChart.id);
              }}
              autoFocus
            />
          ) : (
            <strong>{savedChart.name}</strong>
          )}
          <span>{savedChart.details.chart_type} • {savedChart.details.dataset_name} • {savedChart.date} {savedChart.time}</span>
          <span>{savedChart.details.x_axis} / {savedChart.details.y_axis} • {savedChart.details.aggregation}</span>
          <div className="visual-button-row">
            <button type="button" onClick={() => onOpen(savedChart)}>Open</button>
            <button type="button" onClick={() => (editingId === savedChart.id ? onRenameSave(savedChart.id) : onRenameStart(savedChart))}>
              {editingId === savedChart.id ? "Save" : "Rename"}
            </button>
            <button type="button" onClick={() => onDelete(savedChart.id)}>Delete</button>
          </div>
        </article>
      ))}
    </div>
  );
}

function BuilderPanel({
  result,
  form,
  setForm,
  canGenerate,
  disabledState,
  error,
  loading,
  onGenerate,
}) {
  const columns = useMemo(
    () => (result?.column_names || []).map((column) => [column, column]),
    [result?.column_names],
  );

  const updateForm = (key, value) => {
    setForm((current) => {
      const next = { ...current, [key]: value };
      const { numericCols, categoricalCols } = getColumnLists(result);

      if (key === "chartType") {
        if (["scatter", "histogram", "box", "heatmap"].includes(value)) {
          next.aggregation = "";
        } else if (!next.aggregation) {
          next.aggregation = "sum";
        }

        if (value === "histogram") {
          next.yAxis = "";
          if (numericCols.length && !numericCols.includes(next.xAxis)) {
            next.xAxis = numericCols[0];
          }
        } else if (value === "scatter") {
          if (numericCols.length && !numericCols.includes(next.xAxis)) {
            next.xAxis = numericCols[0];
          }
          if (numericCols.length && !numericCols.includes(next.yAxis)) {
            next.yAxis = numericCols[1] || numericCols[0];
          }
        } else if (value === "box") {
          if (categoricalCols.length && !next.xAxis) {
            next.xAxis = categoricalCols[0];
          }
          if (numericCols.length && !numericCols.includes(next.yAxis)) {
            next.yAxis = numericCols[0];
          }
        } else if (["bar", "pie", "line"].includes(value)) {
          if (!next.xAxis && categoricalCols.length) {
            next.xAxis = categoricalCols[0];
          }
          if (!next.yAxis && numericCols.length) {
            next.yAxis = numericCols[0];
          }
        }
      }

      return next;
    });
  };

  return (
    <GlassPanel title="Builder Configuration" eyebrow="Manual Setup" className="visual-full-panel">
      <div className="visual-fields-grid">
        <SelectField
          label="Chart Type"
          value={form.chartType}
          onChange={(value) => updateForm("chartType", value)}
          options={chartTypes}
          disabled={!result}
        />
        <SelectField
          label="X-Axis"
          value={form.xAxis}
          onChange={(value) => updateForm("xAxis", value)}
          options={columns}
          disabled={!result || disabledState.xAxis}
          placeholder={disabledState.xAxis ? "Auto (All Numeric Columns)" : "Select X-Axis"}
        />
        <SelectField
          label="Y-Axis"
          value={form.yAxis}
          onChange={(value) => updateForm("yAxis", value)}
          options={columns}
          disabled={!result || disabledState.yAxis}
          placeholder={
            disabledState.yAxis
              ? "Not required"
              : form.aggregation === "count"
                ? "Optional for Count"
                : "Select Y-Axis"
          }
        />
        <SelectField
          label="Aggregation"
          value={form.aggregation}
          onChange={(value) => updateForm("aggregation", value)}
          options={aggregations}
          disabled={!result || disabledState.aggregation}
          placeholder={disabledState.aggregation ? "Not applicable" : "Select Aggregation"}
        />
        <SelectField
          label="Group By"
          value={form.groupBy}
          onChange={(value) => updateForm("groupBy", value)}
          options={columns}
          disabled={!result || disabledState.groupBy}
          includeNone
        />
        <SelectField
          label="Color By"
          value={form.colorBy}
          onChange={(value) => updateForm("colorBy", value)}
          options={columns}
          disabled={!result || disabledState.colorBy}
          includeNone
        />
      </div>

      {error && <p className="visual-error">{error}</p>}
      {!result && <p className="visual-empty-copy">Upload a dataset before configuring a manual chart.</p>}

      <button
        className="visual-action-button"
        type="button"
        disabled={!canGenerate || loading}
        onClick={onGenerate}
      >
        {loading ? "Generating..." : "Generate Chart"}
      </button>
    </GlassPanel>
  );
}

function AssistantPanel({
  result,
  prompt,
  setPrompt,
  interpretation,
  setInterpretation,
  editForm,
  setEditForm,
  filterValues,
  setFilterValues,
  error,
  loading,
  onInterpret,
  onGenerate,
}) {
  const columns = useMemo(
    () => (result?.column_names || []).map((column) => [column, column]),
    [result?.column_names],
  );
  const dynamicPrompts = useMemo(() => buildDynamicPrompts(result), [result]);
  const [editingParameters, setEditingParameters] = useState(false);

  const hasPlan = Boolean(interpretation);
  const canAccept = interpretation?.status === "ready" || interpretation?.status === "needs_input";
  const missingFilter = (interpretation?.required_filters || []).some(
    (filter) => !filterValues[filter.column],
  );
  const canGeneratePlan = canAccept && !missingFilter;
  const planItems = [
    ["User Request", interpretation?.user_request],
    ["Recommended Chart", chartTypes.find(([value]) => value === editForm.chartType)?.[1]],
    ["Chart Type", chartTypes.find(([value]) => value === editForm.chartType)?.[1]],
    ["X-Axis", editForm.xAxis],
    ["Y-Axis", editForm.yAxis],
    ["Aggregation", aggregations.find(([value]) => value === editForm.aggregation)?.[1]],
    ["Group By", editForm.groupBy],
    ["Color By", editForm.colorBy],
    ["Required Filters", (interpretation?.required_filters || []).map((item) => item.column).join(", ")],
    ["Confidence Score", interpretation ? `${interpretation.confidence_score || 0}%` : ""],
    ["Reasoning", interpretation?.reasoning],
  ];

  const updateEditForm = (key, value) => {
    setEditForm((current) => {
      const next = { ...current, [key]: value };
      if (key === "chartType" && ["scatter", "histogram", "box", "heatmap"].includes(value)) {
        next.aggregation = "";
      }
      if (key === "chartType" && ["histogram", "heatmap"].includes(value)) {
        next.yAxis = "";
      }
      return next;
    });
  };

  const handleCancel = () => {
    setEditingParameters(false);
    setInterpretation(null);
    setEditForm({
      chartType: "",
      xAxis: "",
      yAxis: "",
      aggregation: "",
      groupBy: "",
      colorBy: "",
    });
    setFilterValues({});
  };

  const handleAccept = () => {
    const filters = (interpretation?.required_filters || []).map((filter) => ({
      column: filter.column,
      value: filterValues[filter.column] || filter.value,
    }));
    onGenerate(toChartRequest(editForm, filters));
  };

  return (
    <GlassPanel title="Assistant Configuration" eyebrow="AI Prompt" className="visual-full-panel">
      <div className="visual-chip-row">
        {dynamicPrompts.map((example) => (
          <button key={example} type="button" onClick={() => setPrompt(example)} disabled={!result || loading}>
            {example}
          </button>
        ))}
      </div>

      <label className="visual-field">
        <span>Prompt</span>
        <textarea
          placeholder="Example: Compare average salary across departments"
          rows="4"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          disabled={!result || loading}
        />
      </label>

      {error && <p className="visual-error">{error}</p>}
      {!result && <p className="visual-empty-copy">Upload a dataset before using Assistant Mode.</p>}

      <button
        className="visual-action-button"
        type="button"
        disabled={!result || loading || !prompt.trim()}
        onClick={onInterpret}
      >
        {loading ? "Interpreting..." : "Interpret Request"}
      </button>

      <div className="visual-interpretation">
        <h3>AI Visualization Plan</h3>

        {!hasPlan ? (
          <div className="visual-fields-grid compact">
            {builderFields.map((field) => (
              <PlaceholderField key={field} label={field} />
            ))}
          </div>
        ) : (
          <>
            <p className="visual-plan-status">{interpretation.message}</p>

            {interpretation.status === "unknown_column" && (
              <p className="visual-empty-copy">
                Available columns are: {interpretation.available_columns.join(", ")}. Please modify your request.
              </p>
            )}

            <div className="visual-detail-list">
              {planItems.map(([label, value]) => (
                <div className="visual-detail-row" key={label}>
                  <span>{label}</span>
                  <strong>{displayValue(value)}</strong>
                </div>
              ))}
            </div>

            {(interpretation.required_filters || []).map((filter) => (
              <SelectField
                key={filter.column}
                label={`Required Filter: ${filter.column}`}
                value={filterValues[filter.column] || filter.value || ""}
                onChange={(value) => setFilterValues((current) => ({ ...current, [filter.column]: value }))}
                options={(filter.options || []).map((value) => [value, value])}
                disabled={loading}
              />
            ))}

            {canAccept && editingParameters && (
              <div className="visual-fields-grid compact visual-edit-grid">
                <SelectField
                  label="Chart Type"
                  value={editForm.chartType}
                  onChange={(value) => updateEditForm("chartType", value)}
                  options={chartTypes}
                  disabled={loading}
                />
                <SelectField
                  label="X-Axis"
                  value={editForm.xAxis}
                  onChange={(value) => updateEditForm("xAxis", value)}
                  options={columns}
                  disabled={loading || editForm.chartType === "heatmap"}
                />
                <SelectField
                  label="Y-Axis"
                  value={editForm.yAxis}
                  onChange={(value) => updateEditForm("yAxis", value)}
                  options={columns}
                  disabled={loading || ["histogram", "heatmap"].includes(editForm.chartType)}
                />
                <SelectField
                  label="Aggregation"
                  value={editForm.aggregation}
                  onChange={(value) => updateEditForm("aggregation", value)}
                  options={aggregations}
                  disabled={loading || ["scatter", "histogram", "box", "heatmap"].includes(editForm.chartType)}
                />
                <SelectField
                  label="Group By"
                  value={editForm.groupBy}
                  onChange={(value) => updateEditForm("groupBy", value)}
                  options={columns}
                  disabled={loading}
                  includeNone
                />
                <SelectField
                  label="Color By"
                  value={editForm.colorBy}
                  onChange={(value) => updateEditForm("colorBy", value)}
                  options={columns}
                  disabled={loading}
                  includeNone
                />
              </div>
            )}

            <div className="visual-button-row">
              <button type="button" disabled={!canGeneratePlan || loading} onClick={handleAccept}>
                Accept & Generate Chart
              </button>
              <button type="button" disabled={!canAccept || loading} onClick={() => setEditingParameters((v) => !v)}>
                {editingParameters ? "Hide Parameters" : "Edit Parameters"}
              </button>
              <button type="button" disabled={loading} onClick={handleCancel}>
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </GlassPanel>
  );
}

function HeatmapGrid({ chart }) {
  const cols = chart.matrix_columns || [];
  const lookup = {};
  (chart.data || []).forEach((item) => {
    lookup[`${item.row}:::${item.column}`] = Number(item.value);
  });

  const getCellStyle = (coeff) => {
    const abs = Math.min(1, Math.abs(coeff));
    if (coeff >= 0) {
      return {
        background: `rgba(82, 129, 238, ${0.12 + abs * 0.72})`,
        color: abs > 0.55 ? "#ffffff" : "#001847",
      };
    }
    return {
      background: `rgba(220, 53, 69, ${0.12 + abs * 0.72})`,
      color: abs > 0.55 ? "#ffffff" : "#8f1d1d",
    };
  };

  return (
    <div className="visual-heatmap-wrap">
      <table className="visual-heatmap-table">
        <thead>
          <tr>
            <th>Variable</th>
            {cols.map((col) => (
              <th key={col}>{col}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cols.map((rowCol) => (
            <tr key={rowCol}>
              <th>{rowCol}</th>
              {cols.map((colCol) => {
                const val = lookup[`${rowCol}:::${colCol}`] ?? 0;
                return (
                  <td key={colCol} style={getCellStyle(val)}>
                    {val.toFixed(2)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ChartRenderer({ chart, height = 340 }) {
  if (!chart?.data?.length) {
    return <div className="visual-chart-placeholder">Generated charts will appear here.</div>;
  }

  if (chart.type === "heatmap") {
    return <HeatmapGrid chart={chart} />;
  }

  if (chart.type === "box") {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={chart.data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="category" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Bar dataKey="q1" name="Q1 (25%)" fill="#a3b1c6" />
          <Bar dataKey="median" name="Median (50%)" fill="#5281ee" />
          <Bar dataKey="q3" name="Q3 (75%)" fill="#001847" />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (chart.type === "pie") {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Tooltip />
          <Legend />
          <Pie data={chart.data} dataKey={chart.y_key} nameKey={chart.x_key} outerRadius={115}>
            {chart.data.map((entry, index) => (
              <Cell key={`${entry[chart.x_key]}-${index}`} fill={chartColors[index % chartColors.length]} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    );
  }

  if (chart.type === "line") {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={chart.data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey={chart.x_key} />
          <YAxis />
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey={chart.y_key} stroke="#5281ee" strokeWidth={3} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  if (chart.type === "scatter") {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <ScatterChart>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis type="number" dataKey={chart.x_key} name={chart.x_key} />
          <YAxis type="number" dataKey={chart.y_key} name={chart.y_key} />
          <Tooltip cursor={{ strokeDasharray: "3 3" }} />
          <Legend />
          <Scatter name={`${chart.x_key} vs ${chart.y_key}`} data={chart.data} fill="#5281ee" />
        </ScatterChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={chart.data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey={chart.x_key} />
        <YAxis />
        <Tooltip />
        <Legend />
        <Bar dataKey={chart.y_key} fill="#5281ee" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function Visualization({ result, setActivePage }) {
  const chartShellRef = useRef(null);
  const exportChartRef = useRef(null);
  const workspaceAnchorRef = useRef(null);
  const panStartRef = useRef(null);
  const [creationMode, setCreationMode] = useState("builder");
  const [form, setForm] = useState({
    chartType: "bar",
    xAxis: "",
    yAxis: "",
    aggregation: "sum",
    groupBy: "",
    colorBy: "",
  });
  const [chartResponse, setChartResponse] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [assistantPrompt, setAssistantPrompt] = useState("");
  const [interpretation, setInterpretation] = useState(null);
  const [assistantEditForm, setAssistantEditForm] = useState({
    chartType: "",
    xAxis: "",
    yAxis: "",
    aggregation: "",
    groupBy: "",
    colorBy: "",
  });
  const [assistantFilterValues, setAssistantFilterValues] = useState({});
  const [savedCharts, setSavedCharts] = useState([]);
  const [renameId, setRenameId] = useState("");
  const [renameValue, setRenameValue] = useState("");
  const [exportMessage, setExportMessage] = useState("");
  const [workspaceView, setWorkspaceView] = useState({ zoom: 1, pan: false, fullscreen: false });
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });

  const storageKey = useMemo(
    () => (result?.dataset_signature ? `insightai:viz:${result.dataset_signature}` : ""),
    [result?.dataset_signature],
  );

  // Auto-populate initial X-Axis and Y-Axis defaults when dataset is available
  useEffect(() => {
    if (!result?.column_names?.length) return;
    const { allCols, numericCols, categoricalCols } = getColumnLists(result);
    setForm((prev) => {
      const validX = allCols.includes(prev.xAxis) ? prev.xAxis : (categoricalCols[0] || allCols[0] || "");
      const validY = allCols.includes(prev.yAxis) ? prev.yAxis : (numericCols[0] || allCols[0] || "");
      return {
        ...prev,
        xAxis: validX,
        yAxis: prev.chartType === "histogram" ? "" : validY,
      };
    });
  }, [result]);

  // Restore saved charts and active chart from sessionStorage
  useEffect(() => {
    if (!storageKey) return;
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.savedCharts)) setSavedCharts(parsed.savedCharts);
        if (parsed.chartResponse) setChartResponse(parsed.chartResponse);
      }
    } catch {
      // Ignore storage read errors
    }
  }, [storageKey]);

  // Persist saved charts and active chart to sessionStorage
  useEffect(() => {
    if (!storageKey) return;
    try {
      sessionStorage.setItem(storageKey, JSON.stringify({ savedCharts, chartResponse }));
    } catch {
      // Ignore storage quota errors
    }
  }, [chartResponse, savedCharts, storageKey]);

  const disabledState = useMemo(() => ({
    xAxis: form.chartType === "heatmap",
    yAxis: ["histogram", "heatmap"].includes(form.chartType),
    aggregation: ["scatter", "histogram", "box", "heatmap"].includes(form.chartType),
    groupBy: ["histogram", "heatmap"].includes(form.chartType),
    colorBy: ["histogram", "heatmap"].includes(form.chartType),
  }), [form.chartType]);

  const canGenerate = useMemo(() => {
    if (!result || !form.chartType) return false;
    if (form.chartType === "heatmap") return true;
    if (!form.xAxis) return false;
    if (form.chartType === "histogram") return true;
    if (form.chartType === "box") return Boolean(form.xAxis || form.yAxis);
    if (form.chartType === "scatter") return Boolean(form.xAxis && form.yAxis);
    if (form.aggregation === "count") return true;
    return Boolean(form.yAxis && form.aggregation);
  }, [form, result]);

  const currentDetails = useMemo(
    () => (chartResponse?.details ? enrichDetails(chartResponse.details, result, creationMode) : null),
    [chartResponse, creationMode, result],
  );

  const insights = useMemo(() => buildInsights(chartResponse?.chart), [chartResponse?.chart]);

  const activeChartPayload = useMemo(
    () => (chartResponse?.chart && currentDetails ? { chart: chartResponse.chart, details: currentDetails } : null),
    [chartResponse, currentDetails],
  );

  const exportDisabled = !activeChartPayload;

  const saveGeneratedChart = useCallback((response, mode) => {
    if (!response?.chart?.data?.length) return;
    setSavedCharts((current) => [createSavedChart(response, result, mode), ...current]);
  }, [result]);

  const generateChart = useCallback(async (requestPayload, mode = creationMode) => {
    if (loading) return;
    if (!result) {
      setError("Upload a dataset before generating a chart.");
      return;
    }

    setLoading(true);
    setError("");
    setExportMessage("");

    try {
      const response = await axios.post(`${API_BASE}/visualization/generate`, requestPayload);
      setChartResponse(response.data);
      saveGeneratedChart(response.data, mode);
      setTimeout(() => {
        workspaceAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 60);
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "Chart generation is unavailable right now. Please try again.");
      setChartResponse(null);
    } finally {
      setLoading(false);
    }
  }, [creationMode, loading, result, saveGeneratedChart]);

  const handleGenerate = useCallback(() => {
    if (!canGenerate || loading) return;
    generateChart(toChartRequest(form), "builder");
  }, [canGenerate, form, generateChart, loading]);

  const handleInterpret = useCallback(async () => {
    if (!assistantPrompt.trim() || loading) return;
    if (!result) {
      setError("Upload a dataset before using Assistant Mode.");
      return;
    }

    setLoading(true);
    setError("");
    setInterpretation(null);

    try {
      const response = await axios.post(`${API_BASE}/visualization/interpret`, {
        prompt: assistantPrompt,
      });
      const plan = response.data;

      setInterpretation(plan);
      setAssistantFilterValues(
        (plan.required_filters || []).reduce((values, filter) => {
          if (filter.value) values[filter.column] = filter.value;
          return values;
        }, {}),
      );
      setAssistantEditForm({
        chartType: plan.chart_type || "bar",
        xAxis: plan.x_axis || "",
        yAxis: plan.y_axis || "",
        aggregation: plan.aggregation || "",
        groupBy: plan.group_by || "",
        colorBy: plan.color_by || "",
      });
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "AI could not interpret this request right now.");
    } finally {
      setLoading(false);
    }
  }, [assistantPrompt, loading, result]);

  const handleOpenSavedChart = useCallback((savedChart) => {
    setChartResponse({ chart: savedChart.chart, details: savedChart.details });
    setExportMessage("");
    setTimeout(() => {
      workspaceAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }, []);

  const handleRenameStart = useCallback((savedChart) => {
    setRenameId(savedChart.id);
    setRenameValue(savedChart.name);
  }, []);

  const handleRenameSave = useCallback((chartId) => {
    setSavedCharts((current) => current.map((item) => (
      item.id === chartId ? { ...item, name: renameValue.trim() || item.name } : item
    )));
    setRenameId("");
    setRenameValue("");
  }, [renameValue]);

  const handleDeleteSavedChart = useCallback((chartId) => {
    setSavedCharts((current) => current.filter((item) => item.id !== chartId));
  }, []);

  const handleResetView = useCallback(() => {
    setWorkspaceView({ zoom: 1, pan: false, fullscreen: false });
    setPanOffset({ x: 0, y: 0 });
  }, []);

  const handleResetChartView = useCallback(() => {
    setWorkspaceView((current) => ({ ...current, zoom: 1, pan: false }));
    setPanOffset({ x: 0, y: 0 });
  }, []);

  const handleZoom = useCallback((direction) => {
    setWorkspaceView((current) => ({
      ...current,
      zoom: direction === "in"
        ? Math.min(current.zoom + 0.15, 1.8)
        : Math.max(current.zoom - 0.15, 0.7),
    }));
  }, []);

  const handleToggleFullscreen = useCallback(() => {
    setWorkspaceView((current) => ({ ...current, fullscreen: !current.fullscreen, zoom: 1, pan: false }));
    setPanOffset({ x: 0, y: 0 });
  }, []);

  const handlePanStart = useCallback((event) => {
    if (!workspaceView.pan || !chartResponse?.chart) return;
    panStartRef.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      offsetX: panOffset.x,
      offsetY: panOffset.y,
    };
  }, [chartResponse?.chart, panOffset, workspaceView.pan]);

  const handlePanMove = useCallback((event) => {
    if (!workspaceView.pan || !panStartRef.current) return;
    const nextX = panStartRef.current.offsetX + event.clientX - panStartRef.current.pointerX;
    const nextY = panStartRef.current.offsetY + event.clientY - panStartRef.current.pointerY;
    setPanOffset({ x: nextX, y: nextY });
  }, [workspaceView.pan]);

  const handlePanEnd = useCallback(() => {
    panStartRef.current = null;
  }, []);

  const handleExport = useCallback(async (format) => {
    if (!activeChartPayload) {
      setExportMessage("Generate a chart before exporting.");
      return;
    }

    try {
      setExportMessage("");
      const filename = getChartName(activeChartPayload).replace(/[^a-z0-9]+/gi, "-").toLowerCase();
      const details = activeChartPayload.details;

      if (format === "csv") {
        const rows = activeChartPayload.chart.data || [];
        const headers = Object.keys(rows[0] || {});
        const csv = [headers.join(","), ...rows.map((row) => headers.map((header) => escapeCsv(row[header])).join(","))].join("\n");
        downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), `${filename}.csv`);
        return;
      }

      const svgText = buildChartExportSvg(activeChartPayload);
      if (format === "svg") {
        downloadBlob(new Blob([svgText], { type: "image/svg+xml;charset=utf-8" }), `${filename}.svg`);
        return;
      }

      const canvas = await svgToCanvas(svgText);
      if (format === "png") {
        canvas.toBlob((blob) => {
          if (!blob) throw new Error("PNG export failed.");
          downloadBlob(blob, `${filename}.png`);
        }, "image/png");
        return;
      }

      const imageDataUrl = canvas.toDataURL("image/jpeg", 0.92);
      downloadBlob(buildPdfBlob(getChartName(activeChartPayload), details, details.generated_time, imageDataUrl, canvas.width, canvas.height), `${filename}.pdf`);
    } catch {
      setExportMessage("Export failed. Please generate the chart again and retry.");
    }
  }, [activeChartPayload]);

  const fullscreenOverlay = workspaceView.fullscreen && chartResponse?.chart ? createPortal(
    <div className="visual-fullscreen-overlay" role="dialog" aria-modal="true">
      <div className="visual-fullscreen-card">
        <div className="visual-fullscreen-toolbar">
          <strong>Visualization Workspace</strong>
          <div className="visual-fullscreen-controls">
            <button type="button" onClick={() => handleZoom("in")}>Zoom In</button>
            <button type="button" onClick={() => handleZoom("out")}>Zoom Out</button>
            <button type="button" onClick={() => setWorkspaceView((current) => ({ ...current, pan: !current.pan }))}>{workspaceView.pan ? "Pan On" : "Pan"}</button>
            <button type="button" onClick={handleResetChartView}>Reset View</button>
            <button className="visual-fullscreen-close" type="button" onClick={handleToggleFullscreen}>Exit Fullscreen</button>
          </div>
        </div>
        <div
          className={`visual-fullscreen-chart ${workspaceView.pan ? "panning" : ""}`}
          onMouseDown={handlePanStart}
          onMouseMove={handlePanMove}
          onMouseLeave={handlePanEnd}
          onMouseUp={handlePanEnd}
        >
          <div className="visual-chart-transform" style={{ transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${workspaceView.zoom})` }}>
            <ChartRenderer chart={chartResponse?.chart} height={520} />
          </div>
        </div>
      </div>
    </div>,
    document.body,
  ) : null;

  if (!result) {
    return (
      <section className="visualization-page workspace-page reveal">
        <div className="glass-panel visualization-outer-box">
          <div className="empty-state">
            <h2>Upload a dataset to start visualizing</h2>
            <p>The visualization workstation uses your uploaded or preprocessed dataset to build interactive charts.</p>
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
    <>
      <section className="visualization-page workspace-page reveal">
        <div className="glass-panel visualization-outer-box">
          <GlassPanel
            title="Visualization Studio"
            eyebrow="Interactive Charting & AI Copilot"
            className="visual-full-panel visual-header-panel"
          >
            <div className="visual-header-row">
              <p>
                Create, explore, and export visualizations from <strong>{getDatasetName(result)}</strong> ({Number(result.rows ?? 0).toLocaleString()} rows • {Number(result.columns ?? 0).toLocaleString()} columns).
              </p>
            </div>
          </GlassPanel>

          <div className="visualization-grid">
            <GlassPanel title="Choose Chart Creation Method" eyebrow="Chart Creation" className="visual-full-panel">
              <div className="visual-mode-grid">
                <ModeOption
                  active={creationMode === "builder"}
                  icon="🛠"
                  title="Builder Mode"
                  description="Manually configure every chart parameter (Bar, Line, Pie, Scatter, Histogram, Box Plot, Correlation Heatmap)."
                  buttonLabel="Select Builder Mode"
                  onSelect={() => setCreationMode("builder")}
                />
                <ModeOption
                  active={creationMode === "assistant"}
                  icon="🤖"
                  title="Assistant Mode"
                  description="Describe the visualization you want in plain English and let InsightAI configure the chart plan."
                  buttonLabel="Select Assistant Mode"
                  onSelect={() => setCreationMode("assistant")}
                />
              </div>
            </GlassPanel>

            {creationMode === "builder" ? (
              <BuilderPanel
                result={result}
                form={form}
                setForm={setForm}
                canGenerate={canGenerate}
                disabledState={disabledState}
                error={error}
                loading={loading}
                onGenerate={handleGenerate}
              />
            ) : (
              <AssistantPanel
                result={result}
                prompt={assistantPrompt}
                setPrompt={setAssistantPrompt}
                interpretation={interpretation}
                setInterpretation={setInterpretation}
                editForm={assistantEditForm}
                setEditForm={setAssistantEditForm}
                filterValues={assistantFilterValues}
                setFilterValues={setAssistantFilterValues}
                error={error}
                loading={loading}
                onInterpret={handleInterpret}
                onGenerate={(payload) => generateChart(payload, "assistant")}
              />
            )}

            <div className="visual-scroll-anchor" ref={workspaceAnchorRef} />
            <GlassPanel title="Visualization Workspace" eyebrow="Chart Canvas" className="visual-full-panel visual-workspace-panel">
              <div className="visual-toolbar">
                <button type="button" disabled={!chartResponse?.chart} onClick={() => handleZoom("in")}>Zoom In</button>
                <button type="button" disabled={!chartResponse?.chart} onClick={() => handleZoom("out")}>Zoom Out</button>
                <button type="button" disabled={!chartResponse?.chart} onClick={() => setWorkspaceView((current) => ({ ...current, pan: !current.pan }))}>{workspaceView.pan ? "Pan On" : "Pan"}</button>
                <button type="button" disabled={!chartResponse?.chart} onClick={handleToggleFullscreen}>{workspaceView.fullscreen ? "Exit Fullscreen" : "Fullscreen"}</button>
                <button type="button" disabled={!chartResponse?.chart} onClick={handleResetView}>Reset View</button>
              </div>
              <div
                className={`visual-chart-shell ${workspaceView.pan ? "panning" : ""}`}
                ref={chartShellRef}
                onMouseDown={handlePanStart}
                onMouseMove={handlePanMove}
                onMouseLeave={handlePanEnd}
                onMouseUp={handlePanEnd}
              >
                <div className="visual-chart-transform" style={{ transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${workspaceView.zoom})` }}>
                  <ChartRenderer chart={chartResponse?.chart} />
                </div>
              </div>
              <div className="visual-export-renderer" ref={exportChartRef} aria-hidden="true">
                <ChartRenderer chart={chartResponse?.chart} height={620} />
              </div>
            </GlassPanel>

            <GlassPanel title="Chart Details" eyebrow="Metadata">
              {currentDetails ? <DetailList details={currentDetails} /> : <p className="visual-empty-copy">No chart generated yet. Configure a chart above and click Generate Chart.</p>}
            </GlassPanel>

            <GlassPanel title="AI Chart Insights" eyebrow="Analysis">
              <InsightsList insights={insights} hasChart={Boolean(chartResponse?.chart)} />
            </GlassPanel>

            <GlassPanel title="Saved Charts" eyebrow="Library">
              <SavedChartsList
                charts={savedCharts}
                editingId={renameId}
                renameValue={renameValue}
                onOpen={handleOpenSavedChart}
                onRenameStart={handleRenameStart}
                onRenameChange={setRenameValue}
                onRenameSave={handleRenameSave}
                onDelete={handleDeleteSavedChart}
              />
            </GlassPanel>

            <GlassPanel title="Export Chart" eyebrow="Export">
              {exportDisabled && <p className="visual-empty-copy">Generate a chart before exporting.</p>}
              {exportMessage && <p className="visual-error">{exportMessage}</p>}
              <div className="visual-export-grid">
                <button type="button" disabled={exportDisabled} onClick={() => handleExport("png")}>PNG</button>
                <button type="button" disabled={exportDisabled} onClick={() => handleExport("pdf")}>PDF</button>
                <button type="button" disabled={exportDisabled} onClick={() => handleExport("svg")}>SVG</button>
                <button type="button" disabled={exportDisabled} onClick={() => handleExport("csv")}>CSV</button>
              </div>
            </GlassPanel>
          </div>
        </div>
      </section>
      {fullscreenOverlay}
    </>
  );
}

export default Visualization;
