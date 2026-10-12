import csv
import io

import pandas as pd
from fastapi import HTTPException

# Encodings to try automatically
SUPPORTED_ENCODINGS = [
    "utf-8",
    "utf-8-sig",
    "latin1",
    "cp1252",
]


def _read_csv_with_fallback(file_bytes: bytes):
    """
    Reads CSV files using multiple encodings, delimiters,
    and parser engines until one succeeds.
    """

    last_error = None

    for encoding in SUPPORTED_ENCODINGS:
        try:
            text = file_bytes.decode(encoding)

            # Detect delimiter automatically
            try:
                dialect = csv.Sniffer().sniff(text[:5000])
                delimiter = dialect.delimiter
            except Exception:
                delimiter = ","

            # Fast C engine
            try:
                return pd.read_csv(
                    io.StringIO(text),
                    sep=delimiter,
                    engine="c",
                )
            except Exception:
                pass

            # Python engine fallback
            try:
                return pd.read_csv(
                    io.StringIO(text),
                    sep=delimiter,
                    engine="python",
                    on_bad_lines="skip",
                )
            except Exception as e:
                last_error = e

        except Exception as e:
            last_error = e

    raise HTTPException(
        status_code=400,
        detail=f"Unable to read the uploaded CSV file.\n{last_error}",
    )


def load_dataset(upload_file):
    """
    Universal CSV Loader for InsightAI.

    Supports:
    - CSV exported from Excel
    - CSV exported from Jupyter
    - Kaggle CSV
    - SQL Export CSV
    - Different delimiters
    - Different encodings
    """

    filename = upload_file.filename.lower()

    # Only CSV files are allowed
    if not filename.endswith(".csv"):
        raise HTTPException(
            status_code=400,
            detail="Only CSV files are supported.",
        )

    # Read uploaded file
    file_bytes = upload_file.file.read()

    # Reset file pointer
    upload_file.file.seek(0)

    # Load CSV
    df = _read_csv_with_fallback(file_bytes)

    # Check if dataset is empty
    if df.empty:
        raise HTTPException(
            status_code=400,
            detail="The uploaded dataset is empty.",
        )

    # Clean column names
    df.columns = (
        df.columns.astype(str)
        .str.strip()
        .str.replace("\n", " ", regex=False)
        .str.replace("\r", " ", regex=False)
    )

    return df