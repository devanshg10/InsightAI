from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
import pandas as pd
import numpy as np
import re
import ast
import io
import contextlib
from llm_service import generate_dataset_explanation, interpret_chart_prompt
from preprocessing_service import (
    PreprocessingError,
    PreprocessingPreviewRequest,
    apply_operation,
    build_missing_values_preview,
    build_operation_preview,
    build_status,
    clear_transformation_history,
    export_working_copy_csv,
    get_working_copy,
    init_working_copy,
    redo_last_operation,
    reset_working_copy,
    undo_last_operation,
)
from visualization_service import ChartValidationError, generate_chart, interpret_prompt_heuristically
from file_loader import load_dataset


app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
@app.get("/test")
def test():
    return {"working": True}

@app.get("/")
def home():
    return {"message": "InsightAI Backend Running"}

dataset_context = ""
upload_df = None

def safe_number(value):
    if pd.isna(value) or np.isinf(value):
        return None
    return round(float(value), 2)

def infer_date_columns(df):
    date_columns = []
    invalid_type_columns = []

    for col in df.columns:
        series = df[col].dropna()
        if pd.api.types.is_datetime64_any_dtype(df[col]):
            date_columns.append(col)
            continue

        if pd.api.types.is_object_dtype(df[col]) and not series.empty:
            sample = series.astype(str).head(50)
            parsed = pd.to_datetime(sample, errors="coerce")
            valid_ratio = parsed.notna().mean()

            # Date-like object columns work in analysis, but users should know they are stored as strings.
            if valid_ratio >= 0.75:
                date_columns.append(col)
                invalid_type_columns.append(col)

    return date_columns, invalid_type_columns

def build_numeric_stats(df):
    numeric_stats = []

    for col in df.select_dtypes(include="number").columns:
        series = df[col].dropna()
        if series.empty:
            continue

        mode = series.mode()
        q1 = series.quantile(0.25)
        q3 = series.quantile(0.75)

        numeric_stats.append({
            "column": col,
            "mean": safe_number(series.mean()),
            "median": safe_number(series.median()),
            "mode": safe_number(mode.iloc[0]) if not mode.empty else None,
            "min": safe_number(series.min()),
            "max": safe_number(series.max()),
            "std": safe_number(series.std()),
            "variance": safe_number(series.var()),
            "q1": safe_number(q1),
            "q3": safe_number(q3),
            "iqr": safe_number(q3 - q1),
        })

    return numeric_stats

def build_column_details(df):
    column_details = {}

    for col in df.columns:
        series = df[col]
        clean_series = series.dropna()
        value_counts = clean_series.astype(str).value_counts().head(8)
        dtype = str(series.dtype)
        is_numeric = pd.api.types.is_numeric_dtype(series)
        q1 = series.quantile(0.25) if is_numeric and not clean_series.empty else None
        q3 = series.quantile(0.75) if is_numeric and not clean_series.empty else None

        details = {
            "name": col,
            "type": "numeric" if is_numeric else "categorical",
            "dtype": dtype,
            "missing": int(series.isnull().sum()),
            "unique": int(series.nunique(dropna=True)),
            "most_frequent": str(value_counts.index[0]) if not value_counts.empty else None,
            "distribution": {
                str(k): int(v)
                for k, v in value_counts.items()
            },
            "sample_values": [
                str(value)
                for value in clean_series.astype(str).drop_duplicates().head(8)
            ],
        }

        if is_numeric:
            details.update({
                "mean": safe_number(series.mean()),
                "min": safe_number(series.min()),
                "max": safe_number(series.max()),
                "q1": safe_number(q1),
                "q3": safe_number(q3),
            })

        column_details[col] = details

    return column_details

def build_health_metrics(df, invalid_type_columns):
    outlier_count = 0

    for col in df.select_dtypes(include="number").columns:
        series = df[col].dropna()
        if series.empty:
            continue

        q1 = series.quantile(0.25)
        q3 = series.quantile(0.75)
        iqr = q3 - q1
        if iqr == 0:
            continue

        outlier_count += int(((series < q1 - 1.5 * iqr) | (series > q3 + 1.5 * iqr)).sum())

    return {
        "total_missing_values": int(df.isnull().sum().sum()),
        "duplicate_rows": int(df.duplicated().sum()),
        "outlier_count": outlier_count,
        "empty_columns": [
            col for col in df.columns
            if int(df[col].isnull().sum()) == len(df)
        ],
        "invalid_data_types": invalid_type_columns,
    }

def build_correlation_summary(df):
    numeric_df = df.select_dtypes(include="number")
    if numeric_df.shape[1] < 2:
        return []

    correlations = numeric_df.corr().replace([np.inf, -np.inf], np.nan)
    pairs = []
    cols = list(correlations.columns)

    for i, first_col in enumerate(cols):
        for second_col in cols[i + 1:]:
            coefficient = correlations.loc[first_col, second_col]
            if pd.isna(coefficient):
                continue
            pairs.append({
                "first_column": first_col,
                "second_column": second_col,
                "coefficient": round(float(coefficient), 3),
                "absolute": abs(float(coefficient)),
            })

    return sorted(pairs, key=lambda item: item["absolute"], reverse=True)[:5]

def build_ai_metadata(df, date_columns, file_size):
    # This keeps LLM prompts lightweight and prevents sending the full uploaded dataset.
    return {
        "rows": len(df),
        "columns": len(df.columns),
        "column_names": list(df.columns),
        "dtypes": {col: str(dtype) for col, dtype in df.dtypes.items()},
        "numeric_columns": list(df.select_dtypes(include="number").columns),
        "categorical_columns": list(df.select_dtypes(exclude="number").columns),
        "date_columns": date_columns,
        "missing_by_column": {
            col: int(count)
            for col, count in df.isnull().sum().items()
            if int(count) > 0
        },
        "sample_rows": df.head(5).fillna("").to_dict(orient="records"),
        "basic_statistics": build_numeric_stats(df)[:8],
        "file_size": file_size,
    }

def build_visualization_metadata(df):
    """Build privacy-safe metadata for chart prompt interpretation.

    Input: Active uploaded dataset.
    Output: Column metadata only; no full dataset rows are sent to the LLM.
    """
    date_columns, _ = infer_date_columns(df)
    return {
        "dataset_name": "Uploaded CSV",
        "column_names": list(df.columns),
        "dtypes": {col: str(dtype) for col, dtype in df.dtypes.items()},
        "numeric_columns": list(df.select_dtypes(include="number").columns),
        "categorical_columns": list(df.select_dtypes(exclude="number").columns),
        "date_columns": date_columns,
    }

def unique_filter_values(df, column):
    """Return safe dropdown values for an ambiguous required filter.

    Input: Active dataset and a validated column name.
    Output: Up to 100 unique non-empty values for frontend selection.
    """
    if column not in df.columns:
        return []

    values = df[column].dropna().astype(str)
    values = values[values.str.strip() != ""]
    return sorted(values.drop_duplicates().head(100).tolist())

def safe_confidence_score(value):
    """Normalize AI confidence into a percentage integer.

    Input: Numeric or string confidence value from the LLM.
    Output: Integer from 0 to 100.
    """
    try:
        score = int(float(str(value).replace("%", "").strip()))
    except (TypeError, ValueError):
        score = 0

    return max(0, min(100, score))

def normalize_interpreted_plan(plan, df):
    """Normalize and enrich an LLM chart plan for the frontend.

    Input: Raw LLM interpretation and active dataset.
    Output: User-facing plan with available filter values and safe defaults.
    """
    plan = plan or {}
    available_columns = list(df.columns)
    status = plan.get("status") or "unsupported"
    required_filters = []
    selected_columns = [
        plan.get("x_axis"),
        plan.get("y_axis"),
        plan.get("group_by"),
        plan.get("color_by"),
    ]

    # The backend never trusts model-proposed columns unless they exist in the dataset.
    invalid_columns = [
        column for column in selected_columns
        if column and column not in df.columns
    ]
    if invalid_columns:
        status = "unknown_column"
        plan["message"] = (
            f"I could not identify a column related to {', '.join(invalid_columns)}. "
            "Please modify your request."
        )

    # Add dropdown choices only for real dataset columns; never invent values.
    for item in plan.get("required_filters") or []:
        if not isinstance(item, dict):
            continue
        column = item.get("column")
        if column in df.columns:
            required_filters.append({
                "column": column,
                "value": item.get("value"),
                "reason": item.get("reason") or "A filter value is required.",
                "options": unique_filter_values(df, column),
            })

    if status == "unknown_column":
        message = plan.get("message") or "I could not identify a matching column. Please modify your request."
    elif status == "needs_input":
        message = plan.get("message") or "Additional user input is required before this chart can be generated."
    elif status == "ready":
        message = plan.get("message") or "Review the chart plan before generating."
    else:
        message = plan.get("message") or "I could not interpret that visualization request. Please try a more specific chart request."

    return {
        "status": status,
        "user_request": plan.get("user_request"),
        "chart_type": plan.get("chart_type"),
        "x_axis": plan.get("x_axis"),
        "y_axis": plan.get("y_axis"),
        "aggregation": plan.get("aggregation"),
        "group_by": plan.get("group_by"),
        "color_by": plan.get("color_by"),
        "required_filters": required_filters,
        "confidence_score": safe_confidence_score(plan.get("confidence_score")),
        "reasoning": plan.get("reasoning") or "",
        "message": message,
        "available_columns": available_columns,
    }

def build_dataset_context(df):
    sample_rows = df.head(8).fillna("").to_dict(orient="records")
    column_profiles = []

    for col in df.columns:
        series = df[col]
        profile = {
            "name": col,
            "missing": int(series.isnull().sum()),
            "unique": int(series.nunique(dropna=True)),
            "type": "numeric" if pd.api.types.is_numeric_dtype(series) else "categorical"
        }

        if pd.api.types.is_numeric_dtype(series):
            profile.update({
                "mean": round(float(series.mean()), 2) if series.notna().any() else None,
                "min": round(float(series.min()), 2) if series.notna().any() else None,
                "max": round(float(series.max()), 2) if series.notna().any() else None
            })
        else:
            value_counts = series.dropna().astype(str).value_counts().head(8)
            profile["top_values"] = {
                str(value): int(count)
                for value, count in value_counts.items()
            }
            profile["sample_values"] = [
                str(value)
                for value in series.dropna().astype(str).drop_duplicates().head(12)
            ]

        column_profiles.append(profile)

    return f"""
Dataset Profile:
Rows: {len(df)}
Columns: {len(df.columns)}
Column Names: {', '.join(df.columns)}
Total Missing Values: {int(df.isnull().sum().sum())}
Duplicate Rows: {int(df.duplicated().sum())}

Column Profiles:
{column_profiles}

Sample Rows:
{sample_rows}
"""

def find_column(df, question):
    normalized_question = question.lower()

    for col in df.columns:
        if col.lower() in normalized_question:
            return col

    for col in df.columns:
        words = re.findall(r"[a-z0-9]+", col.lower())
        if words and all(word in normalized_question for word in words):
            return col

    return None

def direct_dataset_answer(question, df):
    q = question.lower()

    if re.search(r"\b(row|rows|records|entries)\b", q) and re.search(r"\b(how many|count|number|total)\b", q):
        return f"The dataset contains {len(df)} rows."

    if re.search(r"\b(column|columns|fields)\b", q) and re.search(r"\b(how many|count|number|total)\b", q):
        return f"The dataset contains {len(df.columns)} columns."

    if "column names" in q or "columns name" in q or "list columns" in q or "show columns" in q:
        return "The columns are: " + ", ".join(df.columns) + "."

    if "missing" in q or "null" in q or "empty" in q:
        missing_total = int(df.isnull().sum().sum())
        if "which" in q or "column" in q or "where" in q:
            missing_by_column = {
                col: int(count)
                for col, count in df.isnull().sum().items()
                if int(count) > 0
            }
            if not missing_by_column:
                return "There are no missing values in the dataset."
            details = ", ".join([f"{col}: {count}" for col, count in missing_by_column.items()])
            return f"The dataset has {missing_total} missing values. By column: {details}."
        return f"The dataset contains {missing_total} missing values."

    if "duplicate" in q:
        return f"The dataset contains {int(df.duplicated().sum())} duplicate rows."

    if "numeric" in q and "column" in q:
        cols = list(df.select_dtypes(include="number").columns)
        if not cols:
            return "I did not find any numeric columns in this dataset."
        return f"The dataset has {len(cols)} numeric columns: {', '.join(cols)}."

    if ("categorical" in q or "category" in q) and "column" in q and not any(word in q for word in ["most", "common", "dominant", "top"]):
        cols = list(df.select_dtypes(exclude="number").columns)
        if not cols:
            return "I did not find any categorical columns in this dataset."
        return f"The dataset has {len(cols)} categorical columns: {', '.join(cols)}."

    if any(phrase in q for phrase in ["most common", "appears most", "top", "dominant", "highest count"]):
        col = find_column(df, question)
        candidates = [col] if col else list(df.select_dtypes(exclude="number").columns)

        for candidate in candidates:
            if candidate and not df[candidate].dropna().empty:
                counts = df[candidate].astype(str).value_counts()
                top_value = counts.index[0]
                top_count = int(counts.iloc[0])
                return f"The most common value in {candidate} is {top_value}, appearing {top_count} times."

    if any(phrase in q for phrase in ["unique values", "how many unique", "distinct values"]):
        col = find_column(df, question)
        if col:
            return f"{col} has {int(df[col].nunique(dropna=True))} unique values."

    if any(word in q for word in ["show", "find", "search", "related", "about", "tell me"]):
        text_columns = list(df.select_dtypes(exclude="number").columns)
        matches = pd.Series(False, index=df.index)
        matched_value = None

        for col in text_columns:
            values = df[col].dropna().astype(str).drop_duplicates()
            for value in values:
                value_text = str(value).strip()
                if len(value_text) < 2:
                    continue
                if value_text.lower() in q:
                    matches = matches | df[col].astype(str).str.lower().str.contains(re.escape(value_text.lower()), na=False)
                    matched_value = value_text

        matching_rows = df[matches].head(5)
        if matched_value and not matching_rows.empty:
            records = matching_rows.fillna("").to_dict(orient="records")
            return f"I found {int(matches.sum())} row(s) related to {matched_value}. Here are the first matches: {records}"

    return None

@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    global dataset_context
    global upload_df

    file.file.seek(0, 2)
    file_size = file.file.tell()
    file.file.seek(0)
    #df = pd.read_csv(file.file)
    df = load_dataset(file)
    upload_df = df

    date_columns, invalid_type_columns = infer_date_columns(df)



    chart_data = []
    insights = []
    #numeric_stats = []

    skip_words = [
        "id",
        "name",
        "ticket",
        "email",
        "phone"
    ]

    
    

    
    #SETTING LIMITS ONLY FOR COLUMNS HAVING LESS THAN 10 UNIQUE VALUES TO AVOID USELESS CHARTS CREATION with lots of unique val
    for col in df.select_dtypes(include="object").columns:

        # Skip useless identifier columns
        if any(word in col.lower() for word in skip_words):
            continue

        unique_count = df[col].nunique()

        # Only chart columns with few categories
        if unique_count <= 10:

            value_counts = df[col].value_counts().head(10)

            chart_data.append({
                "column": col,
                "data": [
                    {"name": str(index), "value": int(value)}
                    for index, value in value_counts.items()
                ]
            })



    # Full numeric statistics power the dataset overview dashboard without an AI call.
    numeric_stats = build_numeric_stats(df)
        

        
    #INSIGHT SECTION
    if df.isnull().sum().sum() > 0:
        insights.append(
            f"Dataset contains {int(df.isnull().sum().sum())} missing values."
        )

    if df.duplicated().sum() == 0:
        insights.append("No duplicate rows found.")

    if len(df) > 0:
        insights.append(
            f"Dataset contains {len(df)} rows and {len(df.columns)} columns."
        )

    if len(df.select_dtypes(include='number').columns) > len(df.columns)/2:
        insights.append("Dataset is mostly numeric.")
    else:
        insights.append("Dataset is mostly categorical.")




    #GIVING CLEANING SUGGESTIONS
    cleaning_suggestions = []

    # Missing values per column
    for col in df.columns:

        missing_count = int(df[col].isnull().sum())

        if missing_count > 0:
            cleaning_suggestions.append(
                f"{col} contains {missing_count} missing values."
            )

    # Duplicate rows
    duplicate_count = int(df.duplicated().sum())

    if duplicate_count > 0:
        cleaning_suggestions.append(
            f"Dataset contains {duplicate_count} duplicate rows."
        )

    # Identifier columns
    identifier_words = [
        "id",
        "roll",
        "phone",
        "mobile",
        "whatsapp",
        "ticket"
    ]

    for col in df.columns:

        if any(word in col.lower() for word in identifier_words):
            cleaning_suggestions.append(
                f"{col} appears to be an identifier column."
            )    

    
    missing_values = int(df.isnull().sum().sum())
    duplicates = int(df.duplicated().sum())

    quality_score = 100
    quality_score -= min(missing_values, 30)
    quality_score -= min(duplicates * 5, 20)

    quality_score = max(0, quality_score)



    # Column-level facts are used by the interactive explorer and its one-line AI explanation.
    column_details = build_column_details(df)
    health_metrics = build_health_metrics(df, invalid_type_columns)
    data_types_present = sorted({str(dtype) for dtype in df.dtypes})
    correlation_summary = build_correlation_summary(df)
    ai_metadata = build_ai_metadata(df, date_columns, file_size)
    dataset_signature = f"{file.filename}:{file_size}:{len(df)}:{len(df.columns)}:{','.join(df.columns)}"
    init_working_copy(df, signature=dataset_signature, dataset_name=file.filename or "Uploaded Dataset")

    #BUILDING THE PROMPT
    
    dataset_context = build_dataset_context(df)

    #PRINTING RESULTS
    return {
        "filename": file.filename,
        "dataset_name": file.filename or "Uploaded Dataset",
        "rows": len(df),
        "columns": len(df.columns),
        "column_names": list(df.columns),
        "missing_values": int(df.isnull().sum().sum()),
        "duplicate_rows": int(df.duplicated().sum()),
        "numeric_columns": len(df.select_dtypes(include="number").columns),
        "categorical_columns": len(df.select_dtypes(exclude="number").columns),
        "date_columns": len(date_columns),
        "date_column_names": date_columns,
        "data_types_present": data_types_present,
        "file_size": file_size,
        "preview": df.fillna("").to_dict(orient="records"),
        "chart_data" : chart_data,
        "insights": insights,
        "numeric_stats": numeric_stats,
        "cleaning_suggestions": cleaning_suggestions,
        "quality_score": quality_score,
        "column_details": column_details,
        "health_metrics": health_metrics,
        "correlation_summary": correlation_summary,
        "ai_metadata": ai_metadata,
        "dataset_signature": dataset_signature,
    }


def _sync_active_dataset(status_payload: dict) -> dict:
    """Keep upload_df and dataset_context synchronized with the preprocessing working copy."""
    global upload_df, dataset_context
    df = get_working_copy(upload_df)
    upload_df = df
    dataset_context = build_dataset_context(df)
    date_columns, invalid_type_columns = infer_date_columns(df)
    status_payload["column_details"] = build_column_details(df)
    status_payload["health_metrics"] = build_health_metrics(df, invalid_type_columns)
    status_payload["numeric_stats"] = build_numeric_stats(df)
    status_payload["correlation_summary"] = build_correlation_summary(df)
    status_payload["data_types_present"] = sorted({str(dtype) for dtype in df.dtypes})
    status_payload["date_column_names"] = date_columns
    return status_payload

@app.post("/ai-analysis")
async def ai_analysis(data: dict):
    prompt = data["prompt"]
    response = generate_dataset_explanation(prompt)
    return {
        "analysis": response
    }

@app.get("/preprocessing/status")
async def preprocessing_status():
    if upload_df is None:
        raise HTTPException(status_code=400, detail="Please upload a dataset before opening preprocessing.")

    try:
        return build_status(upload_df)
    except PreprocessingError as error:
        raise HTTPException(status_code=400, detail=str(error))

@app.post("/preprocessing/reset")
async def reset_preprocessing():
    if upload_df is None:
        raise HTTPException(status_code=400, detail="Please upload a dataset before opening preprocessing.")

    try:
        status = reset_working_copy(upload_df)
        return _sync_active_dataset(status)
    except PreprocessingError as error:
        raise HTTPException(status_code=400, detail=str(error))

@app.post("/preprocessing/operation")
async def run_preprocessing_operation(data: dict):
    if upload_df is None:
        raise HTTPException(status_code=400, detail="Please upload a dataset before running preprocessing.")

    try:
        status = apply_operation(upload_df, data)
        return _sync_active_dataset(status)
    except PreprocessingError as error:
        raise HTTPException(status_code=400, detail=str(error))

@app.post("/preprocessing/undo")
async def undo_preprocessing_operation():
    if upload_df is None:
        raise HTTPException(status_code=400, detail="Please upload a dataset before undoing preprocessing.")

    try:
        status = undo_last_operation(upload_df)
        return _sync_active_dataset(status)
    except PreprocessingError as error:
        raise HTTPException(status_code=400, detail=str(error))

@app.post("/preprocessing/redo")
async def redo_preprocessing_operation():
    if upload_df is None:
        raise HTTPException(status_code=400, detail="Please upload a dataset before redoing preprocessing.")

    try:
        status = redo_last_operation(upload_df)
        return _sync_active_dataset(status)
    except PreprocessingError as error:
        raise HTTPException(status_code=400, detail=str(error))

@app.post("/preprocessing/clear-history")
async def clear_preprocessing_history():
    if upload_df is None:
        raise HTTPException(status_code=400, detail="Please upload a dataset before clearing history.")

    try:
        return clear_transformation_history(upload_df)
    except PreprocessingError as error:
        raise HTTPException(status_code=400, detail=str(error))

@app.get("/preprocessing/export")
async def export_preprocessing_dataset():
    if upload_df is None:
        raise HTTPException(status_code=400, detail="Please upload a dataset before exporting.")

    try:
        csv_content, filename = export_working_copy_csv(upload_df)
        return Response(
            content=csv_content,
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except PreprocessingError as error:
        raise HTTPException(status_code=400, detail=str(error))

@app.post("/preprocessing/preview")
async def preview_preprocessing_operation(data: dict):
    if upload_df is None:
        raise HTTPException(status_code=400, detail="Please upload a dataset before previewing preprocessing.")

    try:
        request = PreprocessingPreviewRequest(
            operation=data.get("operation", ""),
            column=data.get("column") or data.get("selected_column"),
            method=data.get("method"),
            optional_parameters=data.get("optional_parameters", {}),
        )
        return build_operation_preview(upload_df, request)
    except PreprocessingError as error:
        raise HTTPException(status_code=400, detail=str(error))

@app.post("/visualization/generate")
async def generate_visualization(data: dict):
    if upload_df is None:
        raise HTTPException(status_code=400, detail="Please upload a dataset before generating a chart.")

    try:
        return generate_chart(data, upload_df)
    except ChartValidationError as error:
        raise HTTPException(status_code=400, detail=str(error))

@app.post("/visualization/interpret")
async def interpret_visualization(data: dict):
    if upload_df is None:
        raise HTTPException(status_code=400, detail="Please upload a dataset before using Assistant Mode.")

    prompt = data.get("prompt", "").strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="Enter a chart request before asking AI to interpret it.")

    metadata = build_visualization_metadata(upload_df)
    plan = interpret_chart_prompt(prompt, metadata)
    if not plan or plan.get("status") in {"error", "unsupported", None}:
        plan = interpret_prompt_heuristically(prompt, metadata)
    normalized_plan = normalize_interpreted_plan(plan, upload_df)
    if normalized_plan.get("status") in {"error", "unsupported", "unknown_column"}:
        fallback_plan = interpret_prompt_heuristically(prompt, metadata)
        normalized_plan = normalize_interpreted_plan(fallback_plan, upload_df)
    normalized_plan["user_request"] = prompt

    return normalized_plan

@app.post("/chat")
async def chat_with_dataset(data: dict):

    if upload_df is None:
        return {"answer": "Please upload a CSV dataset first, then I can analyze it with you."}

    question = data["question"].strip()
    history = data.get("history", [])[-8:]

    direct_answer = direct_dataset_answer(question, upload_df)
    if direct_answer:
        return {"answer": f"Answer\n**{direct_answer}**", "source": "pandas"}

    conversation_history = "\n".join([
        f"{message.get('sender', 'user')}: {message.get('text', '')}"
        for message in history
    ])

    prompt = f"""
    You are InsightAI.

    You are a friendly AI data analyst sitting beside the user.

    Dataset Context:
    {dataset_context}

    Recent Conversation:
    {conversation_history}

    Rules:

    - Answer ONLY the user's question.
    - Do NOT repeat the full dataset overview.
    - Do NOT repeat dataset information unless relevant.
    - If user says hi, hello, hey etc, greet them normally.
    - If user asks how you can help, explain your dataset analysis capabilities.
    - Use the sample rows, top values, and column profiles when questions mention real values.
    - If the answer needs an exact calculation not present in the context, say what you can infer and suggest a more specific question.
    - Keep answers short, conversational, and grammatically polished.
    - Use clear headings only when they improve readability.
    - Highlight important terms in bold.
    - Use italics sparingly for nuance.
    - Avoid raw markdown clutter. Do not start lines with #.

    User Question:
    {question}
    """

    response = generate_dataset_explanation(prompt)

    return {
        "answer": response,
        "source": "llm"
    }

def format_pandas_output(value):
    if value is None:
        return ""

    if isinstance(value, pd.DataFrame):
        return value.head(50).to_string(index=False)

    if isinstance(value, pd.Series):
        return value.head(50).to_string()

    return str(value)

@app.post("/pandas-run")
async def run_pandas_command(data: dict):
    if upload_df is None:
        return {"ok": False, "output": "Please upload a CSV dataset first."}

    command = data.get("command", "").strip()
    if not command:
        return {"ok": False, "output": "Enter a pandas command to run."}

    local_scope = {
        "df": upload_df.copy(),
        "pd": pd,
        "np": np,
    }

    try:
        parsed = ast.parse(command, mode="exec")
        last_expr = None

        if parsed.body and isinstance(parsed.body[-1], ast.Expr):
            last_expr = ast.Expression(parsed.body.pop().value)
            ast.fix_missing_locations(last_expr)

        stdout = io.StringIO()
        with contextlib.redirect_stdout(stdout):
            if parsed.body:
                exec(compile(parsed, "<pandas-command>", "exec"), {}, local_scope)

            result_value = None
            if last_expr is not None:
                result_value = eval(compile(last_expr, "<pandas-command>", "eval"), {}, local_scope)

        printed = stdout.getvalue().strip()
        formatted = format_pandas_output(result_value).strip()
        output = "\n".join(part for part in [printed, formatted] if part)

        return {
            "ok": True,
            "output": output or "Command ran successfully.",
        }
    except Exception as error:
        return {
            "ok": False,
            "output": f"{type(error).__name__}: {error}",
        }
