"""
Tests for automatic configuration and golden-record merging.

The product claim these defend is "upload a file and get a good answer without
understanding record linkage". If auto-configuration silently degrades, the
app quietly becomes an expert tool again, so the quality floor here is
deliberately set against the hand-tuned baseline rather than against zero.
"""

from __future__ import annotations

import tempfile
import os

import pytest

import autoconfig
from autoconfig import ColumnRole
from engine import EntityResolutionEngine
from sample_data import generate
from services.splink_service import SplinkService


@pytest.fixture(scope="module")
def labelled():
    df = generate(n_entities=1500, duplicate_rate=0.18, seed=42, include_ground_truth=True)
    truth = set()
    for ids in df.groupby("true_entity_id")["customer_id"].apply(list):
        ordered = sorted(ids)
        for i in range(len(ordered)):
            for j in range(i + 1, len(ordered)):
                truth.add((ordered[i], ordered[j]))
    return df, truth


@pytest.fixture(scope="module")
def loaded(labelled):
    """A table loaded into its own engine, for configuration inspection."""
    df, _ = labelled
    with tempfile.NamedTemporaryFile("w", suffix=".csv", delete=False) as tmp:
        tmp.write(df.drop(columns=["true_entity_id"]).to_csv(index=False))
        path = tmp.name
    engine = EntityResolutionEngine()
    try:
        engine.ingest_data(path, "customers")
        yield engine
    finally:
        engine.close()
        os.unlink(path)


@pytest.fixture(scope="module")
def config(loaded):
    return autoconfig.generate(loaded, "customers")


# -- column understanding --------------------------------------------------

def test_detects_column_roles(config):
    roles = {c.name: c.role for c in config.columns}
    assert roles["email"] == ColumnRole.EMAIL
    assert roles["phone"] == ColumnRole.PHONE
    assert roles["first_name"] == ColumnRole.PERSON_NAME
    assert roles["last_name"] == ColumnRole.PERSON_NAME
    assert roles["address"] == ColumnRole.ADDRESS
    assert roles["city"] == ColumnRole.LOCALITY
    assert roles["signup_date"] == ColumnRole.DATE


def test_identifier_is_found_and_excluded_from_matching(config):
    assert config.primary_key_column == "customer_id"
    key = next(c for c in config.columns if c.name == "customer_id")
    assert not key.usable, "the primary key carries no matching signal"
    used = {c["output_column_name"] for c in config.settings["comparisons"]}
    assert "customer_id" not in used


def test_detection_survives_unhelpful_headers():
    """Roles must come from content too, not only column names."""
    csv = "col_a,col_b,col_c\n" + "\n".join(
        f"x{i}@mail.com,+44 207 555 {1000+i},{i} Maple Street" for i in range(60)
    )
    with tempfile.NamedTemporaryFile("w", suffix=".csv", delete=False) as tmp:
        tmp.write(csv)
        path = tmp.name
    engine = EntityResolutionEngine()
    try:
        engine.ingest_data(path, "t")
        roles = {c.name: c.role for c in autoconfig.profile_columns(engine, "t")}
        assert roles["col_a"] == ColumnRole.EMAIL
        assert roles["col_b"] == ColumnRole.PHONE
        assert roles["col_c"] == ColumnRole.ADDRESS
    finally:
        engine.close()
        os.unlink(path)


def test_every_column_carries_a_reason(config):
    """A configuration nobody can inspect is one nobody can trust."""
    for column in config.columns:
        assert column.reason, f"{column.name} has no explanation"


# -- blocking ---------------------------------------------------------------

def test_blocking_rules_stay_within_budget(config, loaded):
    rules = config.settings["blocking_rules_to_generate_predictions"]
    assert rules, "no blocking rules generated"
    rows = loaded.row_count("customers")
    budget = max(autoconfig.MIN_PAIR_BUDGET, rows * autoconfig.PAIR_BUDGET_MULTIPLIER)
    assert config.estimated_pairs <= budget


def test_pair_count_matches_a_brute_force_join(loaded):
    """The GROUP BY estimator must agree with the naive self-join exactly.

    The self-join is what the estimator replaced -- it materialised the cross
    product and could exhaust memory -- so it is only safe to run here, on a
    small table, as an oracle.
    """
    engine = EntityResolutionEngine()
    try:
        engine.con.execute(
            "CREATE TABLE t AS SELECT * FROM (VALUES "
            "('1','a','x'),('2','a','x'),('3','a','y'),('4','b','y'),('5','b','y')"
            ") AS v(id, name, city)"
        )
        engine._unique_id_column = "id"
        fast = engine.count_pairs_for_equality_rule("t", ['"name"', '"city"'])
        brute = engine.con.execute(
            'SELECT COUNT(*) FROM t l, t r WHERE l.id < r.id '
            'AND l."name" = r."name" AND l."city" = r."city"'
        ).fetchone()[0]
        assert fast == brute == 2
    finally:
        engine.close()


def test_pair_count_ignores_null_groups(loaded):
    """Records with a NULL in the blocking key are not candidates."""
    engine = EntityResolutionEngine()
    try:
        engine.con.execute(
            "CREATE TABLE t AS SELECT * FROM (VALUES "
            "('1','a'),('2','a'),('3',NULL),('4',NULL)) AS v(id, email)"
        )
        assert engine.count_pairs_for_equality_rule("t", ['"email"']) == 1
    finally:
        engine.close()


# -- end-to-end quality -----------------------------------------------------

@pytest.fixture(scope="module")
def auto_result(labelled, config):
    df, truth = labelled
    service = SplinkService()
    result = service.process_entity_resolution(
        data_csv=df.drop(columns=["true_entity_id"]).to_csv(index=False),
        settings=config.settings,
        threshold=config.threshold,
        table_name="customers",
        primary_key_column=config.primary_key_column,
    )
    assert result["status"] == "success", result.get("error")
    return service, result, df, truth


def test_auto_config_matches_hand_tuned_quality(auto_result):
    """Auto-configuration must not be meaningfully worse than an expert's."""
    service, _, _, truth = auto_result
    engine = service.engine
    predictions = engine.predictions_df()
    left, right = engine.id_columns
    above = predictions[predictions["match_probability"] >= 0.95]
    predicted = {
        tuple(sorted((str(a), str(b)))) for a, b in zip(above[left], above[right])
    }
    tp = len(predicted & truth)
    precision = tp / len(predicted) if predicted else 0.0
    recall = tp / len(truth) if truth else 0.0

    assert precision >= 0.93, f"auto-config precision regressed to {precision:.3f}"
    assert recall >= 0.88, f"auto-config recall regressed to {recall:.3f}"


def test_auto_config_duplicate_count_tracks_truth(auto_result):
    _, result, df, _ = auto_result
    actual = len(df) - df["true_entity_id"].nunique()
    reported = result["duplicate_records"]
    assert abs(reported - actual) / actual <= 0.15


# -- golden records ---------------------------------------------------------

def test_merge_collapses_clusters_to_one_row_each(auto_result):
    service, _, _, _ = auto_result
    engine = service.engine
    summary = engine.merge_summary("customers", 0.95)
    merged = engine.merge_clusters("customers", 0.95)

    assert len(merged) == summary["rows_after"]
    assert summary["rows_before"] - summary["rows_after"] == summary["rows_removed"]
    assert merged["cluster_id"].is_unique


def test_merge_keeps_an_audit_trail(auto_result):
    """Every merge must be traceable back to the records it consumed."""
    service, _, _, _ = auto_result
    merged = service.engine.merge_clusters("customers", 0.95)
    multi = merged[merged["records_merged"] > 1]
    assert not multi.empty
    for _, row in multi.head(20).iterrows():
        sources = row["merged_from"].split("; ")
        assert len(sources) == row["records_merged"]


def test_survivorship_prefers_populated_values_over_blanks():
    """A merged record must not inherit a blank when a real value exists."""
    engine = EntityResolutionEngine()
    try:
        engine.con.execute(
            "CREATE TABLE t AS SELECT * FROM (VALUES "
            "('1','Robert','rob@x.com'),('2','Rob',''),('3','Robert',NULL)"
            ") AS v(id, name, email)"
        )
        rows = [
            {"unique_id": "1", "cluster_id": "c1", "cluster_size": 3, "name": "Robert", "email": "rob@x.com"},
            {"unique_id": "2", "cluster_id": "c1", "cluster_size": 3, "name": "Rob", "email": ""},
            {"unique_id": "3", "cluster_id": "c1", "cluster_size": 3, "name": "Robert", "email": None},
        ]
        engine.get_clusters_data = lambda *a, **k: rows  # type: ignore[method-assign]
        merged = engine.merge_clusters("t", 0.9)

        assert len(merged) == 1
        assert merged.iloc[0]["email"] == "rob@x.com"
        # "Robert" appears twice and is longer than "Rob".
        assert merged.iloc[0]["name"] == "Robert"
        assert merged.iloc[0]["records_merged"] == 3
    finally:
        engine.close()
