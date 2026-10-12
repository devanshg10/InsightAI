"""Preprocessing service for InsightAI."""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd
from pydantic import BaseModel, Field

SUPPORTED_CONVERSIONS = ["numeric", "string", "boolean", "datetime", "category"]

_original_df: pd.DataFrame | None = None
_working_copy: pd.DataFrame | None = None
_dataset_signature: str = ""
_dataset_name: str = "Uploaded Dataset"
_undo_stack: list[dict[str, Any]] = []
_redo_stack: list[dict[str, Any]] = []
_history: list[str] = []


class PreprocessingError(ValueError):
    """Raised when preprocessing cannot be completed."""


class PreprocessingPreviewRequest(BaseModel):
    operation: str
    column: str | None = None
    method: str | None = None
    optional_parameters: dict[str, Any] = Field(default_factory=dict)


def _ensure_dataset(dataset: pd.DataFrame | None) -> pd.DataFrame:
    if dataset is None or dataset.empty:
        raise PreprocessingError("Please upload a dataset before using preprocessing.")
    return dataset


def _safe_value(value: Any) -> Any:
    if value is None or pd.isna(value):
        return ""
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating, float)):
        if np.isnan(value) or np.isinf(value):
            return ""
        return round(float(value), 4) if not float(value).is_integer() else int(value)
    if isinstance(value, pd.Timestamp):
        return value.strftime("%Y-%m-%d %H:%M:%S").replace(" 00:00:00", "")
    return value


def _serialise_dataframe(df: pd.DataFrame) -> list[dict[str, Any]]:
    records = df.to_dict(orient="records")
    return [
        {str(column): _safe_value(value) for column, value in row.items()}
        for row in records
    ]


def _compute_quality_score(df: pd.DataFrame) -> int:
    missing_values = int(df.isnull().sum().sum())
    duplicates = int(df.duplicated().sum())
    score = 100
    score -= min(missing_values, 30)
    score -= min(duplicates * 5, 20)
    return max(0, score)


def init_working_copy(
    dataset: pd.DataFrame,
    signature: str = "",
    dataset_name: str = "Uploaded Dataset",
) -> pd.DataFrame:
    """Initialize or re-initialize the working copy when a dataset is uploaded."""
    global _original_df, _working_copy, _dataset_signature, _dataset_name, _undo_stack, _redo_stack, _history
    df = _ensure_dataset(dataset)
    _original_df = df.copy(deep=True)
    _working_copy = df.copy(deep=True)
    _dataset_signature = signature or f"{len(df)}:{len(df.columns)}:{','.join(map(str, df.columns))}"
    _dataset_name = dataset_name or "Uploaded Dataset"
    _undo_stack = []
    _redo_stack = []
    _history = []
    return _working_copy


def get_working_copy(dataset: pd.DataFrame | None = None) -> pd.DataFrame:
    """Return the active working copy, initializing it from dataset if needed."""
    global _original_df, _working_copy
    if _working_copy is not None:
        return _working_copy
    df = _ensure_dataset(dataset)
    _original_df = df.copy(deep=True)
    _working_copy = df.copy(deep=True)
    return _working_copy


def ensure_working_copy(dataset: pd.DataFrame | None) -> pd.DataFrame:
    return get_working_copy(dataset)


def _fill_missing_values(
    df: pd.DataFrame,
    column: str,
    method: str,
    optional_parameters: dict[str, Any],
) -> tuple[pd.DataFrame, str]:
    result = df.copy(deep=True)
    normalized_method = (method or "").strip().lower()
    target_all = not column or column in {"__all__", "All Columns"}

    if not target_all and column not in result.columns:
        raise PreprocessingError(f"Column '{column}' was not found in the dataset.")

    target_columns = list(result.columns) if target_all else [column]

    if normalized_method == "fill mean":
        filled_any = False
        for col in target_columns:
            numeric_series = pd.to_numeric(result[col], errors="coerce")
            if numeric_series.dropna().empty:
                if not target_all:
                    raise PreprocessingError(
                        f"Column '{col}' is non-numeric and cannot use Fill Mean. Choose 'Fill Mode', 'Fill Custom Value', or 'Drop Rows'."
                    )
                continue
            mean_val = round(float(numeric_series.mean()), 2)
            mask = result[col].isna() | (result[col].astype(str).str.strip() == "")
            result.loc[mask, col] = mean_val
            filled_any = True
        if not filled_any:
            raise PreprocessingError("No numeric columns were available for mean imputation.")
        label = f"Missing Values: Filled mean on {'all numeric columns' if target_all else column}"
        return result, label

    if normalized_method == "fill median":
        filled_any = False
        for col in target_columns:
            numeric_series = pd.to_numeric(result[col], errors="coerce")
            if numeric_series.dropna().empty:
                if not target_all:
                    raise PreprocessingError(
                        f"Column '{col}' is non-numeric and cannot use Fill Median. Choose 'Fill Mode', 'Fill Custom Value', or 'Drop Rows'."
                    )
                continue
            median_val = round(float(numeric_series.median()), 2)
            mask = result[col].isna() | (result[col].astype(str).str.strip() == "")
            result.loc[mask, col] = median_val
            filled_any = True
        if not filled_any:
            raise PreprocessingError("No numeric columns were available for median imputation.")
        label = f"Missing Values: Filled median on {'all numeric columns' if target_all else column}"
        return result, label

    if normalized_method == "fill mode":
        for col in target_columns:
            series = result[col].replace("", np.nan)
            mode = series.mode(dropna=True)
            fill_value = mode.iloc[0] if not mode.empty else "Unknown"
            mask = result[col].isna() | (result[col].astype(str).str.strip() == "")
            result.loc[mask, col] = fill_value
        label = f"Missing Values: Filled mode on {'all columns' if target_all else column}"
        return result, label

    if normalized_method in {"fill custom value", "fill value", "custom"}:
        raw_fill = optional_parameters.get("fill_value", "")
        if str(raw_fill).strip() == "":
            raw_fill = "0"
        for col in target_columns:
            fill_val: Any = raw_fill
            if pd.api.types.is_numeric_dtype(result[col]):
                try:
                    fill_val = float(raw_fill) if "." in str(raw_fill) else int(raw_fill)
                except (TypeError, ValueError):
                    pass
            mask = result[col].isna() | (result[col].astype(str).str.strip() == "")
            result.loc[mask, col] = fill_val
        label = f"Missing Values: Filled '{raw_fill}' on {'all columns' if target_all else column}"
        return result, label

    raise PreprocessingError(f"Unsupported missing values method: '{method}'.")


def _drop_missing_rows(df: pd.DataFrame, column: str | None = None) -> tuple[pd.DataFrame, str]:
    result = df.copy(deep=True)
    if column and column not in {"__all__", "All Columns"}:
        if column not in result.columns:
            raise PreprocessingError(f"Column '{column}' was not found in the dataset.")
        mask = result[column].notna() & (result[column].astype(str).str.strip() != "")
        cleaned = result.loc[mask].reset_index(drop=True)
        return cleaned, f"Missing Values: Dropped missing rows in {column}"
    cleaned = result.replace("", np.nan).dropna().reset_index(drop=True)
    return cleaned, "Missing Values: Dropped rows with missing values"


def _drop_missing_columns(df: pd.DataFrame, column: str | None = None) -> tuple[pd.DataFrame, str]:
    result = df.copy(deep=True)
    if column and column not in {"__all__", "All Columns"}:
        if column not in result.columns:
            raise PreprocessingError(f"Column '{column}' was not found in the dataset.")
        if len(result.columns) <= 1:
            raise PreprocessingError("Cannot drop the only remaining column in the dataset.")
        return result.drop(columns=[column]), f"Missing Values: Dropped column {column}"
    missing_columns = [name for name in result.columns if int(result[name].replace("", np.nan).isna().sum()) > 0]
    if not missing_columns:
        return result, "Missing Values: No columns contained missing values"
    if len(missing_columns) >= len(result.columns):
        raise PreprocessingError("Cannot drop all columns in the dataset.")
    return result.drop(columns=missing_columns), f"Missing Values: Dropped columns ({', '.join(map(str, missing_columns))})"


def _execute_transformation(
    df: pd.DataFrame,
    request: PreprocessingPreviewRequest,
) -> tuple[pd.DataFrame, str]:
    operation = (request.operation or "").strip().lower()
    column = (request.column or "").strip()
    method = (request.method or "").strip()
    method_lower = method.lower()
    params = request.optional_parameters or {}

    # 1. Missing Values
    if operation in {"missing values", "missing_values"}:
        if not column:
            raise PreprocessingError("Select a column before running Missing Values.")
        if method_lower in {"fill mean", "fill median", "fill mode", "fill custom value", "fill value", "custom"}:
            return _fill_missing_values(df, column, method, params)
        if method_lower == "drop rows":
            return _drop_missing_rows(df, column)
        if method_lower == "drop columns":
            return _drop_missing_columns(df, column)
        raise PreprocessingError("Choose a supported missing values method.")

    # 2. Duplicates
    if operation in {"duplicates", "duplicate"}:
        result = df.copy(deep=True)
        subset = None
        if column and column not in {"__all__", "All Columns"}:
            if column not in result.columns:
                raise PreprocessingError(f"Column '{column}' was not found in the dataset.")
            subset = [column]
        if method_lower in {"remove exact duplicates", "keep first", ""}:
            cleaned = result.drop_duplicates(subset=subset, keep="first").reset_index(drop=True)
            scope = f"on {column}" if subset else "across all columns"
            return cleaned, f"Duplicates: Removed duplicates ({method or 'Keep first'}) {scope}"
        if method_lower == "keep last":
            cleaned = result.drop_duplicates(subset=subset, keep="last").reset_index(drop=True)
            scope = f"on {column}" if subset else "across all columns"
            return cleaned, f"Duplicates: Removed duplicates (Keep last) {scope}"
        if method_lower in {"drop all duplicates", "drop all"}:
            cleaned = result.drop_duplicates(subset=subset, keep=False).reset_index(drop=True)
            scope = f"on {column}" if subset else "across all columns"
            return cleaned, f"Duplicates: Dropped all duplicate occurrences {scope}"
        raise PreprocessingError(f"Unsupported duplicate removal strategy: '{method}'.")

    # 3. Column Operations
    if operation in {"column operations", "column_operations"}:
        if not column or column not in df.columns:
            raise PreprocessingError("Select a valid column for Column Operations.")
        result = df.copy(deep=True)
        if method_lower == "rename":
            new_name = str(params.get("new_name") or "").strip()
            if not new_name:
                new_name = f"{column}_renamed"
            if new_name != column and new_name in result.columns:
                raise PreprocessingError(f"A column named '{new_name}' already exists.")
            result = result.rename(columns={column: new_name})
            return result, f"Column Operations: Renamed '{column}' to '{new_name}'"
        if method_lower == "remove":
            if len(result.columns) <= 1:
                raise PreprocessingError("Cannot remove the only remaining column in the dataset.")
            result = result.drop(columns=[column])
            return result, f"Column Operations: Removed column '{column}'"
        if method_lower == "move":
            position = str(params.get("position") or "First").strip().lower()
            cols = [c for c in result.columns if c != column]
            current_idx = list(result.columns).index(column)
            if position == "first":
                new_cols = [column] + cols
            elif position == "last":
                new_cols = cols + [column]
            elif position == "left":
                target_idx = max(0, current_idx - 1)
                cols.insert(target_idx, column)
                new_cols = cols
            elif position == "right":
                target_idx = min(len(cols), current_idx + 1)
                cols.insert(target_idx, column)
                new_cols = cols
            else:
                new_cols = [column] + cols
            return result[new_cols], f"Column Operations: Moved '{column}' to {position}"
        if method_lower == "duplicate":
            base_name = str(params.get("new_name") or f"{column}_copy").strip()
            new_name = base_name
            counter = 2
            while new_name in result.columns:
                new_name = f"{base_name}_{counter}"
                counter += 1
            col_idx = list(result.columns).index(column)
            result.insert(col_idx + 1, new_name, result[column].copy(deep=True))
            return result, f"Column Operations: Duplicated '{column}' as '{new_name}'"
        raise PreprocessingError(f"Unsupported column operation: '{method}'.")

    # 4. Data Types
    if operation in {"data types", "data_types"}:
        if not column or column not in df.columns:
            raise PreprocessingError("Select a valid column for Data Types conversion.")
        result = df.copy(deep=True)
        series = result[column]
        if method_lower == "string":
            result[column] = series.where(series.notna(), "").astype(str)
            return result, f"Data Types: Converted '{column}' to String"
        if method_lower in {"integer", "int"}:
            numeric = pd.to_numeric(series, errors="coerce")
            if numeric.dropna().empty and series.dropna().any():
                raise PreprocessingError(f"Column '{column}' values cannot be converted to Integer.")
            result[column] = numeric.round().astype("Int64")
            return result, f"Data Types: Converted '{column}' to Integer"
        if method_lower in {"float", "numeric"}:
            numeric = pd.to_numeric(series, errors="coerce")
            if numeric.dropna().empty and series.dropna().any():
                raise PreprocessingError(f"Column '{column}' values cannot be converted to Float.")
            result[column] = numeric.astype(float).round(4)
            return result, f"Data Types: Converted '{column}' to Float"
        if method_lower in {"datetime", "date"}:
            parsed = pd.to_datetime(series, errors="coerce")
            if parsed.dropna().empty and series.dropna().any():
                raise PreprocessingError(f"Column '{column}' values cannot be parsed as DateTime.")
            formatted = parsed.dt.strftime("%Y-%m-%d %H:%M:%S").str.replace(" 00:00:00", "", regex=False)
            result[column] = formatted.where(parsed.notna(), np.nan)
            return result, f"Data Types: Converted '{column}' to DateTime"
        if method_lower in {"boolean", "bool"}:
            truthy = {"true", "1", "1.0", "yes", "y", "t"}
            falsy = {"false", "0", "0.0", "no", "n", "f", ""}
            def _to_bool(val: Any) -> Any:
                if pd.isna(val):
                    return np.nan
                s = str(val).strip().lower()
                if s in truthy:
                    return True
                if s in falsy:
                    return False
                return bool(val)
            result[column] = series.map(_to_bool)
            return result, f"Data Types: Converted '{column}' to Boolean"
        if method_lower == "category":
            result[column] = series.astype("category")
            return result, f"Data Types: Converted '{column}' to Category"
        raise PreprocessingError(f"Unsupported data type conversion: '{method}'.")

    # 5. Text Operations
    if operation in {"text operations", "text_operations"}:
        if not column or column not in df.columns:
            raise PreprocessingError("Select a valid column for Text Operations.")
        result = df.copy(deep=True)
        series = result[column]
        not_null = series.notna()
        text_series = series.astype(str)
        if method_lower == "lowercase":
            result[column] = text_series.str.lower().where(not_null, np.nan)
            return result, f"Text Operations: Lowercased '{column}'"
        if method_lower == "uppercase":
            result[column] = text_series.str.upper().where(not_null, np.nan)
            return result, f"Text Operations: Uppercased '{column}'"
        if method_lower == "title case":
            result[column] = text_series.str.title().where(not_null, np.nan)
            return result, f"Text Operations: Title-cased '{column}'"
        if method_lower == "trim":
            result[column] = text_series.str.strip().str.replace(r"\s+", " ", regex=True).where(not_null, np.nan)
            return result, f"Text Operations: Trimmed whitespace in '{column}'"
        if method_lower == "replace":
            find_text = str(params.get("find_text") or "")
            replace_text = str(params.get("replace_text") or "")
            if not find_text:
                raise PreprocessingError("Enter the text to find before running Replace.")
            result[column] = text_series.str.replace(find_text, replace_text, case=False, regex=False).where(not_null, np.nan)
            return result, f"Text Operations: Replaced '{find_text}' with '{replace_text}' in '{column}'"
        raise PreprocessingError(f"Unsupported text operation: '{method}'.")

    # 6. Numeric Operations
    if operation in {"numeric operations", "numeric_operations"}:
        if not column or column not in df.columns:
            raise PreprocessingError("Select a valid column for Numeric Operations.")
        result = df.copy(deep=True)
        numeric_series = pd.to_numeric(result[column], errors="coerce")
        if numeric_series.dropna().empty:
            raise PreprocessingError(f"Column '{column}' does not contain numeric values.")
        if method_lower == "normalize":
            min_val = float(numeric_series.min())
            max_val = float(numeric_series.max())
            span = max_val - min_val
            if span == 0:
                result[column] = numeric_series.where(numeric_series.isna(), 0.0)
            else:
                result[column] = ((numeric_series - min_val) / span).round(4)
            return result, f"Numeric Operations: Normalized '{column}' to [0, 1]"
        if method_lower == "clip":
            raw_min = params.get("min_value")
            raw_max = params.get("max_value")
            lower = float(raw_min) if raw_min not in {None, ""} else float(numeric_series.quantile(0.05))
            upper = float(raw_max) if raw_max not in {None, ""} else float(numeric_series.quantile(0.95))
            if lower > upper:
                lower, upper = upper, lower
            result[column] = numeric_series.clip(lower=lower, upper=upper).round(4)
            return result, f"Numeric Operations: Clipped '{column}' to [{round(lower, 2)}, {round(upper, 2)}]"
        if method_lower == "round":
            try:
                decimals = int(params.get("decimals", 2))
            except (TypeError, ValueError):
                decimals = 2
            decimals = max(0, min(10, decimals))
            if decimals == 0:
                result[column] = numeric_series.round(0).astype("Int64")
            else:
                result[column] = numeric_series.round(decimals)
            return result, f"Numeric Operations: Rounded '{column}' to {decimals} decimal place(s)"
        if method_lower == "bin":
            try:
                bins = int(params.get("bins", 4))
            except (TypeError, ValueError):
                bins = 4
            bins = max(2, min(20, bins))
            binned = pd.cut(numeric_series, bins=bins, precision=2)
            result[column] = binned.astype(str).where(numeric_series.notna(), np.nan)
            return result, f"Numeric Operations: Binned '{column}' into {bins} intervals"
        raise PreprocessingError(f"Unsupported numeric operation: '{method}'.")

    # 7. Date Operations
    if operation in {"date operations", "date_operations"}:
        if not column or column not in df.columns:
            raise PreprocessingError("Select a valid column for Date Operations.")
        result = df.copy(deep=True)
        parsed = pd.to_datetime(result[column], errors="coerce")
        if parsed.dropna().empty:
            raise PreprocessingError(f"Column '{column}' cannot be parsed as dates.")
        if method_lower == "extract year":
            result[column] = parsed.dt.year.astype("Int64")
            return result, f"Date Operations: Extracted Year from '{column}'"
        if method_lower == "extract month":
            result[column] = parsed.dt.month_name().where(parsed.notna(), np.nan)
            return result, f"Date Operations: Extracted Month from '{column}'"
        if method_lower == "extract day":
            result[column] = parsed.dt.day_name().where(parsed.notna(), np.nan)
            return result, f"Date Operations: Extracted Day Name from '{column}'"
        if method_lower == "format":
            date_format = str(params.get("date_format") or "%Y-%m-%d").strip()
            result[column] = parsed.dt.strftime(date_format).where(parsed.notna(), np.nan)
            return result, f"Date Operations: Formatted '{column}' as '{date_format}'"
        if method_lower == "shift":
            try:
                days = int(params.get("days", 1))
            except (TypeError, ValueError):
                days = 1
            shifted = parsed + pd.to_timedelta(days, unit="D")
            result[column] = shifted.dt.strftime("%Y-%m-%d").where(parsed.notna(), np.nan)
            return result, f"Date Operations: Shifted '{column}' by {days} day(s)"
        raise PreprocessingError(f"Unsupported date operation: '{method}'.")

    # 8. Encoding
    if operation == "encoding":
        if not column or column not in df.columns:
            raise PreprocessingError("Select a valid column for Encoding.")
        result = df.copy(deep=True)
        series = result[column]
        if method_lower == "one-hot":
            unique_count = int(series.nunique(dropna=True))
            if unique_count == 0:
                raise PreprocessingError(f"Column '{column}' has no non-empty values to encode.")
            if unique_count > 25:
                top_categories = set(series.astype(str).value_counts().head(24).index)
                result[column] = series.astype(str).where(series.astype(str).isin(top_categories), "Other")
            encoded = pd.get_dummies(result, columns=[column], prefix=column, dtype=int)
            return encoded, f"Encoding: Applied One-Hot Encoding on '{column}'"
        if method_lower == "label encoding":
            codes, _ = pd.factorize(series.replace("", np.nan))
            result[column] = pd.Series(codes, index=result.index).replace(-1, np.nan).astype("Int64")
            return result, f"Encoding: Applied Label Encoding on '{column}'"
        if method_lower == "ordinal":
            clean = series.replace("", np.nan).dropna().astype(str)
            categories = sorted(clean.unique())
            mapping = {cat: idx for idx, cat in enumerate(categories)}
            result[column] = series.replace("", np.nan).astype(str).map(mapping).astype("Int64")
            return result, f"Encoding: Applied Ordinal Encoding on '{column}'"
        raise PreprocessingError(f"Unsupported encoding method: '{method}'.")

    # 9. Scaling
    if operation == "scaling":
        if not column or column not in df.columns:
            raise PreprocessingError("Select a valid column for Scaling.")
        result = df.copy(deep=True)
        numeric_series = pd.to_numeric(result[column], errors="coerce")
        if numeric_series.dropna().empty:
            raise PreprocessingError(f"Column '{column}' does not contain numeric values for scaling.")
        if method_lower == "standard scaler":
            mean_val = float(numeric_series.mean())
            std_val = float(numeric_series.std())
            if std_val == 0 or np.isnan(std_val):
                result[column] = numeric_series.where(numeric_series.isna(), 0.0)
            else:
                result[column] = ((numeric_series - mean_val) / std_val).round(4)
            return result, f"Scaling: Applied Standard Scaler on '{column}'"
        if method_lower == "min-max":
            min_val = float(numeric_series.min())
            max_val = float(numeric_series.max())
            span = max_val - min_val
            if span == 0 or np.isnan(span):
                result[column] = numeric_series.where(numeric_series.isna(), 0.0)
            else:
                result[column] = ((numeric_series - min_val) / span).round(4)
            return result, f"Scaling: Applied Min-Max Scaling on '{column}'"
        if method_lower == "robust":
            median_val = float(numeric_series.median())
            q1 = float(numeric_series.quantile(0.25))
            q3 = float(numeric_series.quantile(0.75))
            iqr = q3 - q1
            if iqr == 0 or np.isnan(iqr):
                result[column] = (numeric_series - median_val).round(4)
            else:
                result[column] = ((numeric_series - median_val) / iqr).round(4)
            return result, f"Scaling: Applied Robust Scaling on '{column}'"
        raise PreprocessingError(f"Unsupported scaling method: '{method}'.")

    # 10. Sorting
    if operation == "sorting":
        if not column or column not in df.columns:
            raise PreprocessingError("Select a valid column for Sorting.")
        result = df.copy(deep=True)
        ascending = method_lower != "descending"
        numeric_try = pd.to_numeric(result[column], errors="coerce")
        if numeric_try.notna().sum() >= 0.8 * result[column].notna().sum() and numeric_try.notna().any():
            result["__sort_key__"] = numeric_try
            result = result.sort_values(by="__sort_key__", ascending=ascending, na_position="last").drop(columns=["__sort_key__"]).reset_index(drop=True)
        else:
            result = result.sort_values(by=column, ascending=ascending, na_position="last").reset_index(drop=True)
        direction_label = "Ascending" if ascending else "Descending"
        return result, f"Sorting: Sorted by '{column}' ({direction_label})"

    # 11. Filtering
    if operation == "filtering":
        if not column or column not in df.columns:
            raise PreprocessingError("Select a valid column for Filtering.")
        result = df.copy(deep=True)
        series = result[column]
        raw_value = str(params.get("value") if params.get("value") is not None else "").strip()

        if method_lower == "is not empty":
            mask = series.notna() & (series.astype(str).str.strip() != "")
            return result.loc[mask].reset_index(drop=True), f"Filtering: Kept rows where '{column}' is not empty"
        if method_lower == "is empty":
            mask = series.isna() | (series.astype(str).str.strip() == "")
            return result.loc[mask].reset_index(drop=True), f"Filtering: Kept rows where '{column}' is empty"

        if raw_value == "":
            raise PreprocessingError("Enter a filter value before running Filtering.")

        if method_lower == "equals":
            numeric_col = pd.to_numeric(series, errors="coerce")
            try:
                num_val = float(raw_value)
                mask = (numeric_col == num_val) | (series.astype(str).str.strip().str.lower() == raw_value.lower())
            except ValueError:
                mask = series.astype(str).str.strip().str.lower() == raw_value.lower()
            return result.loc[mask].reset_index(drop=True), f"Filtering: {column} equals '{raw_value}'"

        if method_lower == "not equals":
            numeric_col = pd.to_numeric(series, errors="coerce")
            try:
                num_val = float(raw_value)
                mask = (numeric_col != num_val) & (series.astype(str).str.strip().str.lower() != raw_value.lower())
            except ValueError:
                mask = series.astype(str).str.strip().str.lower() != raw_value.lower()
            return result.loc[mask].reset_index(drop=True), f"Filtering: {column} not equals '{raw_value}'"

        if method_lower == "contains":
            mask = series.astype(str).str.contains(raw_value, case=False, na=False, regex=False)
            return result.loc[mask].reset_index(drop=True), f"Filtering: {column} contains '{raw_value}'"

        if method_lower in {"greater than", "less than"}:
            numeric_col = pd.to_numeric(series, errors="coerce")
            try:
                threshold = float(raw_value)
                if numeric_col.notna().any():
                    mask = numeric_col > threshold if method_lower == "greater than" else numeric_col < threshold
                else:
                    mask = series.astype(str) > raw_value if method_lower == "greater than" else series.astype(str) < raw_value
            except ValueError:
                mask = series.astype(str) > raw_value if method_lower == "greater than" else series.astype(str) < raw_value
            op_label = ">" if method_lower == "greater than" else "<"
            return result.loc[mask].reset_index(drop=True), f"Filtering: {column} {op_label} {raw_value}"

        raise PreprocessingError(f"Unsupported filtering condition: '{method}'.")

    raise PreprocessingError(f"Unsupported preprocessing operation: '{request.operation}'.")


def build_status(dataset: pd.DataFrame | None = None, message: str = "Working copy status loaded.") -> dict[str, Any]:
    df = get_working_copy(dataset)
    return {
        "preview": _serialise_dataframe(df.head(100)),
        "rows": int(df.shape[0]),
        "columns": int(df.shape[1]),
        "column_names": [str(column) for column in df.columns],
        "dataset_name": _dataset_name,
        "dataset_signature": _dataset_signature,
        "missing_values": int(df.isnull().sum().sum()),
        "duplicate_rows": int(df.duplicated().sum()),
        "quality_score": _compute_quality_score(df),
        "empty_columns": [str(column) for column in df.columns if int(df[column].isnull().sum()) == len(df)],
        "invalid_data_types": [],
        "numeric_columns": [str(column) for column in df.select_dtypes(include="number").columns],
        "categorical_columns": [str(column) for column in df.select_dtypes(exclude="number").columns],
        "date_columns": [str(column) for column in df.select_dtypes(include=["datetime", "datetimetz"]).columns],
        "current_dataset_size": {"rows": int(df.shape[0]), "columns": int(df.shape[1])},
        "supported_conversions": SUPPORTED_CONVERSIONS,
        "history": list(_history),
        "can_undo": len(_undo_stack) > 0,
        "can_redo": len(_redo_stack) > 0,
        "message": message,
        "applied": True,
    }


def build_operation_preview(dataset: pd.DataFrame | None, request: PreprocessingPreviewRequest) -> dict[str, Any]:
    df = get_working_copy(dataset)
    preview_df, label = _execute_transformation(df, request)
    return {
        "preview": _serialise_dataframe(preview_df.head(100)),
        "rows": int(preview_df.shape[0]),
        "columns": int(preview_df.shape[1]),
        "column_names": [str(column) for column in preview_df.columns],
        "missing_values": int(preview_df.isnull().sum().sum()),
        "duplicate_rows": int(preview_df.duplicated().sum()),
        "quality_score": _compute_quality_score(preview_df),
        "dataset_name": _dataset_name,
        "operation": request.operation,
        "message": f"Previewing: {label} ({preview_df.shape[0]} rows, {preview_df.shape[1]} columns).",
        "applied": False,
    }


def build_missing_values_preview(dataset: pd.DataFrame | None, request: PreprocessingPreviewRequest) -> dict[str, Any]:
    """Alias maintained for backwards compatibility."""
    return build_operation_preview(dataset, request)


def apply_operation(dataset: pd.DataFrame | None, data: dict[str, Any]) -> dict[str, Any]:
    global _working_copy, _undo_stack, _redo_stack, _history
    df = get_working_copy(dataset)
    request = PreprocessingPreviewRequest(
        operation=data.get("operation", ""),
        column=data.get("column") or data.get("selected_column"),
        method=data.get("method"),
        optional_parameters=data.get("optional_parameters", {}),
    )
    updated_df, label = _execute_transformation(df, request)
    _undo_stack.append({
        "df": df.copy(deep=True),
        "history": list(_history),
    })
    if len(_undo_stack) > 30:
        _undo_stack.pop(0)
    _redo_stack.clear()
    _working_copy = updated_df
    _history.insert(0, label)
    status = build_status(_working_copy, message=f"Applied: {label}")
    status["operation"] = request.operation
    status["applied"] = True
    return status


def undo_last_operation(dataset: pd.DataFrame | None = None) -> dict[str, Any]:
    global _working_copy, _undo_stack, _redo_stack, _history
    df = get_working_copy(dataset)
    if not _undo_stack:
        raise PreprocessingError("There are no preprocessing actions to undo.")
    _redo_stack.append({
        "df": df.copy(deep=True),
        "history": list(_history),
    })
    previous = _undo_stack.pop()
    _working_copy = previous["df"]
    _history = previous["history"]
    return build_status(_working_copy, message="Undid last transformation.")


def redo_last_operation(dataset: pd.DataFrame | None = None) -> dict[str, Any]:
    global _working_copy, _undo_stack, _redo_stack, _history
    df = get_working_copy(dataset)
    if not _redo_stack:
        raise PreprocessingError("There are no preprocessing actions to redo.")
    _undo_stack.append({
        "df": df.copy(deep=True),
        "history": list(_history),
    })
    next_state = _redo_stack.pop()
    _working_copy = next_state["df"]
    _history = next_state["history"]
    return build_status(_working_copy, message="Redid transformation.")


def clear_transformation_history(dataset: pd.DataFrame | None = None) -> dict[str, Any]:
    global _history
    df = get_working_copy(dataset)
    _history = []
    return build_status(df, message="Transformation history log cleared.")


def reset_working_copy(dataset: pd.DataFrame | None) -> dict[str, Any]:
    global _working_copy, _undo_stack, _redo_stack, _history
    base_df = _original_df if _original_df is not None else _ensure_dataset(dataset)
    _working_copy = base_df.copy(deep=True)
    _undo_stack = []
    _redo_stack = []
    _history = []
    return build_status(_working_copy, message="Dataset reset to original uploaded state.")


def export_working_copy_csv(dataset: pd.DataFrame | None = None) -> tuple[str, str]:
    df = get_working_copy(dataset)
    clean_name = (_dataset_name or "dataset").rsplit(".", 1)[0]
    filename = f"{clean_name}_cleaned.csv"
    return df.to_csv(index=False), filename
