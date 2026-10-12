import requests
#from openrouter import OpenRouter
import os
import json
import re
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")
load_dotenv()

OPENROUTER_API_KEY = (os.getenv("OPENROUTER_API_KEY") or "").strip().strip('"').strip("'")

OPENROUTER_CHAT_MODELS = [
    model
    for model in [
        os.getenv("OPENROUTER_MODEL"),
        "openai/gpt-oss-20b:free",
        "nvidia/nemotron-3-nano-30b-a3b:free",
        "meta-llama/llama-3.3-70b-instruct:free",
        "google/gemma-3-12b-it:free",
        "openrouter/free",
    ]
    if model
]


def _get_api_key():
    load_dotenv(Path(__file__).resolve().parent / ".env", override=False)
    key = os.getenv("OPENROUTER_API_KEY") or OPENROUTER_API_KEY
    return (key or "").strip().strip('"').strip("'")


def _request_openrouter_chat(prompt, temperature=0.2):
    api_key = _get_api_key()
    if not api_key:
        print("OPENROUTER ERROR: Missing OPENROUTER_API_KEY")
        return None

    for model in OPENROUTER_CHAT_MODELS:
        try:
            response = requests.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": model,
                    "messages": [
                        {
                            "role": "user",
                            "content": prompt,
                        }
                    ],
                    "temperature": temperature,
                },
                timeout=30,
            )
            print(f"MODEL: {model} | STATUS CODE: {response.status_code}")
            data = response.json()
        except (requests.RequestException, ValueError) as exc:
            print(f"OPENROUTER REQUEST ERROR ({model}): {exc}")
            continue

        if "choices" in data and data["choices"]:
            message = data["choices"][0].get("message") or {}
            content = (message.get("content") or "").strip()
            if content:
                return content

        print(f"OPENROUTER RESPONSE ({model}): {data}")

    return None


def _extract_json_object(text):
    """Extract a JSON object from an LLM response.

    Input: Raw model text that should contain a single JSON object.
    Output: Parsed dictionary, or None when parsing is not possible.
    """
    if not text:
        return None

    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?", "", cleaned).strip()
        cleaned = re.sub(r"```$", "", cleaned).strip()

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", cleaned, flags=re.DOTALL)
        if not match:
            return None
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            return None


def generate_dataset_explanation(prompt):
    content = _request_openrouter_chat(prompt, temperature=0.2)
    if content:
        return content

    return "AI Model unavailable"


def interpret_chart_prompt(user_prompt, dataset_metadata):
    """Interpret natural language as visualization parameters.

    Input: User prompt and lightweight dataset metadata only.
    Output: Structured chart plan; never chart data, code, SQL, or calculations.
    """
    if not _get_api_key():
        return {
            "status": "error",
            "message": "AI Model unavailable",
        }

    prompt = f"""
You are InsightAI's visualization request interpreter.

Your only job is to convert a user's natural language chart request into structured chart parameters.
You must never generate charts, chart images, Python code, SQL, pandas code, aggregated values, calculated values, or dataset rows.

Dataset metadata:
{json.dumps(dataset_metadata)}

Supported chart_type values:
bar, line, pie, scatter, histogram

Supported aggregation values:
sum, mean, count, min, max

Rules:
- Use only columns that exist in Dataset metadata.column_names.
- If the user references an unknown column or concept that cannot be mapped to an available column, return status "unknown_column".
- If the request needs a filter value and the user did not provide it, return status "needs_input" and include required_filters with the missing column names.
- Never guess missing filter values.
- For comparisons across categories, prefer bar.
- For trends over numeric or date columns, prefer line.
- For relationships between two numeric columns, prefer scatter.
- For distributions of one numeric column, prefer histogram.
- For bar, line, and pie charts, include x_axis, y_axis, and aggregation.
- For scatter, include x_axis and y_axis, and set aggregation to null.
- For histogram, include x_axis only, and set y_axis and aggregation to null.
- Return confidence_score as an integer from 0 to 100.

Return only valid JSON with this exact shape:
{{
  "status": "ready | needs_input | unknown_column | unsupported",
  "chart_type": "bar | line | pie | scatter | histogram | null",
  "x_axis": "column name or null",
  "y_axis": "column name or null",
  "aggregation": "sum | mean | count | min | max | null",
  "group_by": "column name or null",
  "color_by": "column name or null",
  "required_filters": [
    {{"column": "column name", "value": "value if specified else null", "reason": "short reason"}}
  ],
  "confidence_score": 0,
  "reasoning": "one short sentence",
  "message": "friendly user-facing message"
}}

User request:
{user_prompt}
"""

    content = _request_openrouter_chat(prompt, temperature=0.1)
    if not content:
        return {
            "status": "error",
            "message": "AI Model unavailable",
        }

    parsed = _extract_json_object(content)
    if not parsed:
        return {
            "status": "unsupported",
            "message": "I could not interpret that visualization request. Please try a more specific chart request.",
        }

    return parsed
