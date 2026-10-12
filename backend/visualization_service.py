"""Visualization business logic for InsightAI.

FastAPI routes should stay thin and call this module for chart validation,
aggregation, chart payload preparation, metadata, persistence, and export work.
"""

from datetime import datetime
import re

import numpy as np
import pandas as pd


SUPPORTED_CHART_TYPES = {
    "bar": "Bar Chart",
    "line": "Line Chart",
    "pie": "Pie Chart",
    "scatter": "Scatter Plot",
    "histogram": "Histogram",
    "box": "Box Plot",
    "heatmap": "Correlation Heatmap",
}

FUTURE_CHART_TYPES = {}

SUPPORTED_AGGREGATIONS = {
    "sum": "Sum",
    "mean": "Mean",
    "count": "Count",
    "min": "Minimum",
    "max": "Maximum",
}


class ChartValidationError(ValueError):
    """Raised when a visualization request cannot be safely generated."""


def _clean_option(value):
    if value in (None, "", "none", "None"):
        return None
    return value


def _to_numeric_series(df, column):
    if column not in df.columns:
        return pd.Series(dtype=float)
    series = df[column]
    if pd.api.types.is_numeric_dtype(series):
        return series.astype(float)
    cleaned = series.astype(str).str.replace(r"[$,%\s]", "", regex=True)
    return pd.to_numeric(cleaned, errors="coerce")


def _is_numeric(df, column):
    if column not in df.columns:
        return False
    if pd.api.types.is_numeric_dtype(df[column]):
        return True
    non_null = df[column].dropna()
    if non_null.empty:
        return False
    numeric = _to_numeric_series(df, column)
    return numeric.notna().sum() >= 0.7 * len(non_null)


def _is_date_like(df, column):
    if column not in df.columns:
        return False
    if pd.api.types.is_datetime64_any_dtype(df[column]):
        return True

    sample = df[column].dropna().astype(str).head(50)
    if sample.empty:
        return False

    parsed = pd.to_datetime(sample, errors="coerce")
    return parsed.notna().mean() >= 0.75


def _safe_value(value):
    if value is None or pd.isna(value):
        return None
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating, float)):
        if np.isnan(value) or np.isinf(value):
            return None
        return round(float(value), 4)
    if isinstance(value, pd.Timestamp):
        return value.isoformat()
    return str(value)


def validate_chart_request(chart_request, dataset):
    """Validate chart configuration before any data processing or rendering.

    Input: Raw chart request and active uploaded dataset.
    Output: Normalized chart request safe for aggregation and rendering.
    """
    if dataset is None or dataset.empty:
        raise ChartValidationError("Please upload a dataset before generating a chart.")

    chart_type = _clean_option(chart_request.get("chart_type"))
    x_axis = _clean_option(chart_request.get("x_axis"))
    y_axis = _clean_option(chart_request.get("y_axis"))
    aggregation = _clean_option(chart_request.get("aggregation"))
    group_by = _clean_option(chart_request.get("group_by"))
    color_by = _clean_option(chart_request.get("color_by"))
    filters = chart_request.get("filters") or []

    if chart_type not in SUPPORTED_CHART_TYPES:
        raise ChartValidationError("Select a supported chart type.")

    selected_columns = [x_axis, y_axis, group_by, color_by]
    for column in selected_columns:
        if column and column not in dataset.columns:
            raise ChartValidationError(f"Column '{column}' was not found in the uploaded dataset.")

    normalized_filters = []
    for item in filters:
        column = _clean_option(item.get("column") if isinstance(item, dict) else None)
        value = _clean_option(item.get("value") if isinstance(item, dict) else None)
        if not column:
            continue
        if column not in dataset.columns:
            raise ChartValidationError(f"Filter column '{column}' was not found in the uploaded dataset.")
        if value is None:
            raise ChartValidationError(f"Select a value for the {column} filter before generating the chart.")
        normalized_filters.append({"column": column, "value": str(value)})

    if aggregation and aggregation not in SUPPORTED_AGGREGATIONS:
        raise ChartValidationError("Select a supported aggregation.")

    if chart_type == "heatmap":
        numeric_cols = [col for col in dataset.columns if _is_numeric(dataset, col)]
        if len(numeric_cols) < 2:
            raise ChartValidationError("Correlation Heatmap requires at least 2 numeric columns in the dataset.")
        return {
            "chart_type": "heatmap",
            "x_axis": x_axis or numeric_cols[0],
            "y_axis": y_axis or numeric_cols[1],
            "aggregation": None,
            "group_by": None,
            "color_by": None,
            "filters": normalized_filters,
        }

    if not x_axis:
        raise ChartValidationError("Select an X-Axis column.")

    if chart_type in {"bar", "line", "pie"}:
        if not aggregation:
            aggregation = "count" if not y_axis else "sum"
        if aggregation == "count" and not y_axis:
            y_axis = x_axis
        if not y_axis:
            raise ChartValidationError("Select a Y-Axis column.")
        if aggregation != "count" and not _is_numeric(dataset, y_axis):
            raise ChartValidationError(
                f"The selected Y-Axis '{y_axis}' must be numeric for '{SUPPORTED_AGGREGATIONS.get(aggregation, aggregation)}' aggregation. Choose a numeric Y-Axis or switch Aggregation to 'Count'."
            )

    elif chart_type == "scatter":
        if not y_axis:
            raise ChartValidationError("Select a Y-Axis column for the scatter plot.")
        if not _is_numeric(dataset, x_axis) or not _is_numeric(dataset, y_axis):
            raise ChartValidationError("Scatter plots require numeric X-Axis and Y-Axis columns.")
        aggregation = None

    elif chart_type == "histogram":
        if not _is_numeric(dataset, x_axis):
            raise ChartValidationError(f"Histogram requires a numeric X-Axis column ('{x_axis}' is non-numeric).")
        y_axis = None
        aggregation = None

    elif chart_type == "box":
        if not _is_numeric(dataset, x_axis) and (not y_axis or not _is_numeric(dataset, y_axis)):
            raise ChartValidationError("Box Plot requires a numeric column on either the X-Axis or Y-Axis.")
        aggregation = None

    return {
        "chart_type": chart_type,
        "x_axis": x_axis,
        "y_axis": y_axis,
        "aggregation": aggregation,
        "group_by": group_by,
        "color_by": color_by,
        "filters": normalized_filters,
    }


def apply_filters(dataset, filters):
    """Apply validated equality filters to a dataset."""
    filtered = dataset
    for item in filters:
        column = item["column"]
        value = str(item["value"])
        filtered = filtered[filtered[column].astype(str) == value]

    if filtered.empty:
        raise ChartValidationError("No rows match the selected filter values.")

    return filtered


def aggregate_data(dataset, chart_request):
    """Aggregate dataset rows according to chart dimensions and measures."""
    chart_type = chart_request["chart_type"]
    x_axis = chart_request["x_axis"]
    y_axis = chart_request["y_axis"]
    aggregation = chart_request["aggregation"]
    group_by = chart_request["group_by"]
    color_by = chart_request["color_by"]
    dataset = apply_filters(dataset, chart_request.get("filters") or [])

    if chart_type == "heatmap":
        return dataset

    if chart_type == "scatter":
        work = pd.DataFrame()
        work[x_axis] = _to_numeric_series(dataset, x_axis)
        work[y_axis] = _to_numeric_series(dataset, y_axis)
        for extra in [group_by, color_by]:
            if extra and extra not in work.columns:
                work[extra] = dataset[extra]
        return work.dropna(subset=[x_axis, y_axis]).head(500)

    if chart_type == "histogram":
        work = pd.DataFrame({x_axis: _to_numeric_series(dataset, x_axis)})
        return work.dropna().head(5000)

    if chart_type == "box":
        return dataset

    dimensions = [x_axis]
    for optional_dimension in [group_by, color_by]:
        if optional_dimension and optional_dimension not in dimensions:
            dimensions.append(optional_dimension)

    unique_cols = list(dict.fromkeys(dimensions + ([y_axis] if y_axis else [])))
    working = dataset[unique_cols].copy().dropna(subset=dimensions)

    if aggregation == "count":
        grouped = working.groupby(dimensions, dropna=False, sort=False)
        aggregated = grouped.size().reset_index(name="value")
    else:
        working["__measure__"] = _to_numeric_series(working, y_axis)
        working = working.dropna(subset=["__measure__"])
        if working.empty:
            raise ChartValidationError(f"No valid numeric values found in '{y_axis}' after filtering.")
        grouped = working.groupby(dimensions, dropna=False, sort=False)
        aggregated = grouped["__measure__"].agg(aggregation).reset_index(name="value")

    if chart_type == "line":
        if _is_date_like(dataset, x_axis):
            aggregated["__sort__"] = pd.to_datetime(aggregated[x_axis], errors="coerce")
            aggregated = aggregated.sort_values("__sort__", ascending=True, na_position="last").drop(columns=["__sort__"])
        elif _is_numeric(dataset, x_axis):
            aggregated["__sort__"] = pd.to_numeric(aggregated[x_axis], errors="coerce")
            aggregated = aggregated.sort_values("__sort__", ascending=True, na_position="last").drop(columns=["__sort__"])
        return aggregated.head(100)

    if chart_type == "pie":
        return aggregated.sort_values("value", ascending=False).head(15)

    return aggregated.sort_values("value", ascending=False).head(100)


def _count_records_used(dataset, chart_request):
    dataset = apply_filters(dataset, chart_request.get("filters") or [])
    chart_type = chart_request["chart_type"]
    x_axis = chart_request["x_axis"]
    y_axis = chart_request["y_axis"]

    if chart_type == "heatmap":
        return int(len(dataset))

    if chart_type == "histogram":
        return int(_to_numeric_series(dataset, x_axis).dropna().shape[0])

    if chart_type == "scatter":
        s_x = _to_numeric_series(dataset, x_axis)
        s_y = _to_numeric_series(dataset, y_axis)
        return int((s_x.notna() & s_y.notna()).sum())

    if chart_type == "box":
        num_col = y_axis if (y_axis and _is_numeric(dataset, y_axis)) else x_axis
        return int(_to_numeric_series(dataset, num_col).dropna().shape[0])

    dimensions = [x_axis]
    for optional_dimension in [chart_request["group_by"], chart_request["color_by"]]:
        if optional_dimension and optional_dimension not in dimensions:
            dimensions.append(optional_dimension)

    unique_cols = list(dict.fromkeys(dimensions + ([y_axis] if y_axis else [])))
    return int(dataset[unique_cols].dropna().shape[0])


def _serialize_rows(df):
    rows = []
    for record in df.to_dict(orient="records"):
        rows.append({key: _safe_value(value) for key, value in record.items()})
    return rows


def _add_compound_axis_label(df, chart_request):
    label_parts = []
    for part in [chart_request["x_axis"], chart_request["group_by"], chart_request["color_by"]]:
        if part and part not in label_parts:
            label_parts.append(part)

    if len(label_parts) == 1:
        return df, chart_request["x_axis"]

    labelled = df.copy()
    labelled["label"] = labelled[label_parts].astype(str).agg(" / ".join, axis=1)
    return labelled, "label"


def _build_histogram_data(df, x_axis):
    series = df[x_axis].dropna()
    if series.empty:
        return []
    counts, edges = np.histogram(series, bins=min(20, max(5, int(np.sqrt(len(series))))))
    rows = []

    for index, count in enumerate(counts):
        rows.append({
            "bin": f"{round(float(edges[index]), 2)} - {round(float(edges[index + 1]), 2)}",
            "value": int(count),
        })

    return rows


def _build_box_data(dataset, chart_request):
    x_axis = chart_request["x_axis"]
    y_axis = chart_request["y_axis"]
    group_by = chart_request["group_by"]

    if y_axis and _is_numeric(dataset, y_axis) and not _is_numeric(dataset, x_axis):
        cat_col = x_axis
        num_col = y_axis
    elif _is_numeric(dataset, x_axis) and y_axis and not _is_numeric(dataset, y_axis):
        cat_col = y_axis
        num_col = x_axis
    elif _is_numeric(dataset, x_axis) and group_by:
        cat_col = group_by
        num_col = x_axis
    else:
        cat_col = None
        num_col = y_axis if (y_axis and _is_numeric(dataset, y_axis)) else x_axis

    num_series = _to_numeric_series(dataset, num_col)
    work = pd.DataFrame({"__val__": num_series})
    if cat_col:
        work["__cat__"] = dataset[cat_col].astype(str)
    else:
        work["__cat__"] = num_col

    work = work.dropna(subset=["__val__"])
    if work.empty:
        raise ChartValidationError(f"No numeric values available for Box Plot in '{num_col}'.")

    top_cats = work["__cat__"].value_counts().head(12).index
    work = work[work["__cat__"].isin(top_cats)]

    rows = []
    for cat_name, group in work.groupby("__cat__", sort=False):
        vals = group["__val__"]
        if vals.empty:
            continue
        q1 = float(vals.quantile(0.25))
        median = float(vals.median())
        q3 = float(vals.quantile(0.75))
        rows.append({
            "category": str(cat_name),
            "min": round(float(vals.min()), 2),
            "q1": round(q1, 2),
            "median": round(median, 2),
            "q3": round(q3, 2),
            "max": round(float(vals.max()), 2),
            "mean": round(float(vals.mean()), 2),
            "iqr": round(q3 - q1, 2),
            "value": round(median, 2),
        })

    return rows, "category", "value", num_col


def _build_heatmap_data(dataset):
    numeric_cols = [col for col in dataset.columns if _is_numeric(dataset, col)][:10]
    num_df = pd.DataFrame({col: _to_numeric_series(dataset, col) for col in numeric_cols})
    corr = num_df.corr().fillna(0.0)
    rows = []
    for row_col in numeric_cols:
        for col_col in numeric_cols:
            coeff = round(float(corr.loc[row_col, col_col]), 3)
            rows.append({
                "pair": f"{row_col} × {col_col}",
                "row": str(row_col),
                "column": str(col_col),
                "value": coeff,
            })
    return rows, numeric_cols


def generate_chart(chart_request, dataset):
    """Generate a frontend-ready chart payload from the current dataset."""
    validated_request = validate_chart_request(chart_request, dataset)
    prepared_data = aggregate_data(dataset, validated_request)
    chart_type = validated_request["chart_type"]
    records_used = _count_records_used(dataset, validated_request)

    extra_chart_props = {}
    if chart_type == "histogram":
        chart_data = _build_histogram_data(prepared_data, validated_request["x_axis"])
        x_key = "bin"
        y_key = "value"
    elif chart_type == "scatter":
        chart_data = _serialize_rows(prepared_data)
        x_key = validated_request["x_axis"]
        y_key = validated_request["y_axis"]
    elif chart_type == "box":
        filtered_df = apply_filters(dataset, validated_request.get("filters") or [])
        chart_data, x_key, y_key, num_col = _build_box_data(filtered_df, validated_request)
        validated_request["y_axis"] = num_col
    elif chart_type == "heatmap":
        filtered_df = apply_filters(dataset, validated_request.get("filters") or [])
        chart_data, matrix_columns = _build_heatmap_data(filtered_df)
        x_key = "pair"
        y_key = "value"
        extra_chart_props["matrix_columns"] = matrix_columns
    else:
        labelled_data, x_key = _add_compound_axis_label(prepared_data, validated_request)
        chart_data = _serialize_rows(labelled_data)
        y_key = "value"

    chart = {
        "type": chart_type,
        "label": SUPPORTED_CHART_TYPES[chart_type],
        "data": chart_data,
        "x_key": x_key,
        "y_key": y_key,
        "group_key": validated_request["group_by"],
        "color_key": validated_request["color_by"],
        **extra_chart_props,
    }

    return {
        "chart": chart,
        "details": get_chart_details(chart, validated_request, records_used),
    }


def get_chart_details(chart, chart_request=None, records_used=0):
    """Return metadata describing a generated chart."""
    chart_request = chart_request or {}

    return {
        "chart_type": chart.get("label", "Not generated"),
        "x_axis": chart_request.get("x_axis") or "Not selected",
        "y_axis": chart_request.get("y_axis") or "Not applicable",
        "aggregation": SUPPORTED_AGGREGATIONS.get(chart_request.get("aggregation"), "Not applicable"),
        "group_by": chart_request.get("group_by") or "None",
        "color_by": chart_request.get("color_by") or "None",
        "records_used": records_used,
        "generated_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }


def interpret_prompt_heuristically(user_prompt: str, metadata: dict) -> dict:
    """Deterministic natural-language chart plan interpreter used when LLM is unavailable."""
    q = (user_prompt or "").strip().lower()
    columns = metadata.get("column_names") or []
    numeric_cols = metadata.get("numeric_columns") or []
    categorical_cols = metadata.get("categorical_columns") or []
    date_cols = metadata.get("date_columns") or []

    if not columns:
        return {
            "status": "unsupported",
            "message": "Please upload a dataset with columns first.",
        }

    # Find columns mentioned in the prompt using whole-word boundary matching
    matched_cols = []
    for col in columns:
        col_low = col.lower()
        if re.search(rf"\b{re.escape(col_low)}\b", q):
            matched_cols.append(col)
            continue
        tokens = [t for t in re.findall(r"[a-z0-9]+", col_low) if len(t) > 2]
        if tokens and any(re.search(rf"\b{re.escape(t)}\b", q) for t in tokens):
            matched_cols.append(col)

    # Determine chart type from keywords
    if any(w in q for w in ["heatmap", "correlation", "correlations", "matrix"]):
        chart_type = "heatmap"
    elif any(w in q for w in ["box", "boxplot", "quartile", "outlier", "spread"]):
        chart_type = "box"
    elif any(w in q for w in ["scatter", "relationship", "versus", " vs ", "against"]):
        chart_type = "scatter"
    elif any(w in q for w in ["histogram", "distribution", "frequency"]):
        chart_type = "histogram"
    elif any(w in q for w in ["pie", "share", "proportion", "percentage", "breakdown"]):
        chart_type = "pie"
    elif any(w in q for w in ["line", "trend", "over time", "monthly", "yearly", "daily", "timeline"]):
        chart_type = "line"
    else:
        chart_type = "bar"

    # Determine aggregation from keywords
    if any(w in q for w in ["average", "mean", "avg"]):
        aggregation = "mean"
    elif any(w in q for w in ["count", "how many", "number of", "frequency"]):
        aggregation = "count"
    elif any(w in q for w in ["minimum", "min", "lowest"]):
        aggregation = "min"
    elif any(w in q for w in ["maximum", "max", "highest", "top"]):
        aggregation = "max"
    else:
        aggregation = "sum"

    matched_num = [c for c in matched_cols if c in numeric_cols]
    matched_cat = [c for c in matched_cols if c in categorical_cols]
    matched_date = [c for c in matched_cols if c in date_cols]

    x_axis = None
    y_axis = None

    if chart_type == "heatmap":
        x_axis = numeric_cols[0] if numeric_cols else columns[0]
        y_axis = numeric_cols[1] if len(numeric_cols) > 1 else x_axis
        aggregation = None
    elif chart_type == "histogram":
        x_axis = matched_num[0] if matched_num else (numeric_cols[0] if numeric_cols else columns[0])
        y_axis = None
        aggregation = None
    elif chart_type == "scatter":
        if len(matched_num) >= 2:
            x_axis, y_axis = matched_num[0], matched_num[1]
        elif len(numeric_cols) >= 2:
            x_axis = matched_num[0] if matched_num else numeric_cols[0]
            y_axis = next((c for c in numeric_cols if c != x_axis), numeric_cols[1])
        else:
            x_axis = columns[0]
            y_axis = columns[1] if len(columns) > 1 else columns[0]
        aggregation = None
    elif chart_type == "box":
        x_axis = matched_cat[0] if matched_cat else (categorical_cols[0] if categorical_cols else columns[0])
        y_axis = matched_num[0] if matched_num else (numeric_cols[0] if numeric_cols else columns[0])
        aggregation = None
    elif chart_type == "line":
        x_axis = (
            matched_date[0]
            if matched_date
            else (date_cols[0] if date_cols else (matched_cat[0] if matched_cat else columns[0]))
        )
        y_axis = matched_num[0] if matched_num else (numeric_cols[0] if numeric_cols else x_axis)
        if y_axis not in numeric_cols:
            aggregation = "count"
    else:
        # bar or pie
        x_axis = matched_cat[0] if matched_cat else (categorical_cols[0] if categorical_cols else columns[0])
        if matched_num:
            y_axis = matched_num[0]
        elif numeric_cols and aggregation != "count":
            y_axis = numeric_cols[0]
        else:
            y_axis = x_axis
            aggregation = "count"

    return {
        "status": "ready",
        "chart_type": chart_type,
        "x_axis": x_axis,
        "y_axis": y_axis,
        "aggregation": aggregation,
        "group_by": matched_cat[1] if len(matched_cat) > 1 else None,
        "color_by": None,
        "required_filters": [],
        "confidence_score": 88 if matched_cols else 76,
        "reasoning": f"Mapped request to a {SUPPORTED_CHART_TYPES.get(chart_type, chart_type)} using '{x_axis}'"
        + (f" and '{y_axis}' ({aggregation})." if y_axis and aggregation else "."),
        "message": "Visualization plan is ready. Click Accept to generate the chart or Edit Parameters to customize.",
    }
