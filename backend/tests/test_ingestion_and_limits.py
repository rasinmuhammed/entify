"""Tests for file ingestion breadth and the memory budget.

The memory limit was hardcoded to 2GB, which capped matching well below what
the host could do. These pin the resolution order so it cannot silently regress
to a fixed value again.

Excel matters because it is what people actually have. The dtype behaviour is
tested explicitly: Excel coerces long digit strings to floats, and a phone
number arriving as 8.0115652874e+11 will not match its counterpart.
"""

import os
import tempfile

import pandas as pd
import pytest

from engine import (
    EngineError,
    EntityResolutionEngine,
    detect_system_memory_gb,
    resolve_memory_limit,
)


# -- memory budget ---------------------------------------------------------


def test_explicit_limit_wins():
    assert resolve_memory_limit("7GB") == "7GB"


def test_environment_overrides_detection(monkeypatch):
    monkeypatch.setenv("ENTIFY_MEMORY_LIMIT", "12GB")
    assert resolve_memory_limit() == "12GB"


def test_explicit_beats_environment(monkeypatch):
    monkeypatch.setenv("ENTIFY_MEMORY_LIMIT", "12GB")
    assert resolve_memory_limit("3GB") == "3GB"


def test_default_scales_with_the_machine(monkeypatch):
    monkeypatch.delenv("ENTIFY_MEMORY_LIMIT", raising=False)
    limit = resolve_memory_limit()
    assert limit.endswith("GB")

    total = detect_system_memory_gb()
    if total is not None:
        budget = int(limit.removesuffix("GB"))
        # Must claim a real share of the machine, but never all of it: the
        # Python process holding predictions needs headroom, and handing
        # DuckDB everything trades a clean error for the OOM killer.
        assert 1 <= budget < total


def test_default_is_not_the_old_hardcoded_two_gb(monkeypatch):
    """Regression guard. 2GB on a large host was the original bug."""
    monkeypatch.delenv("ENTIFY_MEMORY_LIMIT", raising=False)
    total = detect_system_memory_gb()
    if total is not None and total >= 8:
        assert resolve_memory_limit() != "2GB"


def test_engine_sets_a_spill_directory():
    """Without somewhere to spill, exceeding the budget is a hard failure."""
    with EntityResolutionEngine() as engine:
        configured = engine.con.execute(
            "SELECT current_setting('temp_directory')"
        ).fetchone()[0]
    assert configured


# -- ingestion breadth -----------------------------------------------------


@pytest.fixture
def frame():
    return pd.DataFrame(
        {
            "name": ["Barbara Reddy", "Barbra Reddy", "Ravi Kumar"],
            # Long digit strings are where Excel does the most damage.
            "phone": ["8011565287", "8011565287", "9990123456"],
            "email": ["b@x.com", "b@x.com", "r@y.com"],
        }
    )


def _write(frame: pd.DataFrame, suffix: str) -> str:
    path = os.path.join(tempfile.mkdtemp(), f"data{suffix}")
    if suffix == ".xlsx":
        frame.to_excel(path, index=False)
    elif suffix == ".csv":
        frame.to_csv(path, index=False)
    elif suffix == ".tsv":
        frame.to_csv(path, sep="\t", index=False)
    elif suffix == ".parquet":
        # Written through DuckDB rather than pandas: pandas needs pyarrow or
        # fastparquet to write, DuckDB does not, and this is also the exact
        # path a real Parquet file takes on the way back in.
        import duckdb

        connection = duckdb.connect()
        try:
            connection.register("_out", frame)
            connection.execute(f"COPY _out TO '{path}' (FORMAT PARQUET)")
        finally:
            connection.close()
    elif suffix == ".json":
        frame.to_json(path, orient="records")
    return path


@pytest.mark.parametrize("suffix", [".csv", ".tsv", ".parquet", ".json", ".xlsx"])
def test_every_supported_format_loads(frame, suffix):
    path = _write(frame, suffix)
    try:
        with EntityResolutionEngine() as engine:
            assert engine.ingest_data(path, table_name="t") == 3
            assert set(engine.column_names("t")) == {"name", "phone", "email"}
    finally:
        os.unlink(path)


def test_excel_phone_numbers_stay_text(frame):
    """A phone read as a float stops matching its counterpart."""
    path = _write(frame, ".xlsx")
    try:
        with EntityResolutionEngine() as engine:
            engine.ingest_data(path, table_name="t")
            values = [r["phone"] for r in engine.get_sample_data("t", limit=3)]
    finally:
        os.unlink(path)

    assert "8011565287" in values
    assert not any("e+" in str(v).lower() for v in values)


def test_unsupported_format_lists_what_works():
    path = _write(pd.DataFrame({"a": [1]}), ".csv")
    bad = path.replace(".csv", ".docx")
    os.rename(path, bad)
    try:
        with EntityResolutionEngine() as engine:
            with pytest.raises(EngineError, match=r"\.xlsx"):
                engine.ingest_data(bad, table_name="t")
    finally:
        os.unlink(bad)


def test_empty_workbook_is_explained():
    path = os.path.join(tempfile.mkdtemp(), "empty.xlsx")
    pd.DataFrame({"name": []}).to_excel(path, index=False)
    try:
        with EntityResolutionEngine() as engine:
            with pytest.raises(EngineError, match="no rows"):
                engine.ingest_data(path, table_name="t")
    finally:
        os.unlink(path)


def test_excel_column_names_are_stripped():
    path = os.path.join(tempfile.mkdtemp(), "spaced.xlsx")
    pd.DataFrame({" name ": ["a", "b"], "email ": ["x", "y"]}).to_excel(path, index=False)
    try:
        with EntityResolutionEngine() as engine:
            engine.ingest_data(path, table_name="t")
            assert set(engine.column_names("t")) == {"name", "email"}
    finally:
        os.unlink(path)
