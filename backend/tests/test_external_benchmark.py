"""Accuracy against FEBRL, an external record linkage dataset.

`test_matching_quality.py` measures against data this project generates, which
proves the pipeline is internally consistent but not that it generalises.
FEBRL is published, widely used in the record linkage literature, and nothing
here was tuned for it.

These tests exercise *auto-configuration* specifically. No blocking rules,
comparisons or thresholds are supplied: the engine is handed an unfamiliar CSV
and has to work out how to match it.

Skipped when the dataset cannot be fetched, so a clean checkout without
network access still runs the rest of the suite.
"""

import os
import re
import tempfile
from itertools import combinations

import pytest

import autoconfig
from engine import EntityResolutionEngine
from services.splink_service import build_comparison

ENTITY_PATTERN = re.compile(r"^rec-(\d+)-")


@pytest.fixture(scope="module")
def febrl():
    """FEBRL3 with its ground-truth pairs, or a skip if unavailable."""
    try:
        from splink.datasets import splink_datasets

        frame = splink_datasets.febrl3.copy()
    except Exception as exc:  # network, or the dataset moved
        pytest.skip(f"FEBRL3 unavailable: {exc}")

    pairs = set()
    by_entity: dict[str, list[str]] = {}
    for rec_id in frame["rec_id"]:
        by_entity.setdefault(ENTITY_PATTERN.match(rec_id).group(1), []).append(rec_id)
    for members in by_entity.values():
        pairs.update(combinations(sorted(members), 2))

    return frame, pairs


def resolve(frame, threshold: float = 0.95):
    """Auto-configure and run, returning the predicted within-cluster pairs."""
    handle, path = tempfile.mkstemp(suffix=".csv", prefix="febrl_test_")
    os.close(handle)
    frame.to_csv(path, index=False)

    try:
        with EntityResolutionEngine() as engine:
            engine.ingest_data(path, table_name="febrl")
            config = autoconfig.generate(engine, "febrl", threshold=threshold, max_rules=4)

            settings = dict(config.settings)
            settings["comparisons"] = [
                build_comparison(c) if isinstance(c, dict) else c
                for c in settings.get("comparisons", [])
            ]
            engine.run_resolution(
                table_name="febrl",
                settings=settings,
                primary_key_column=config.primary_key_column,
            )
            clusters = engine.get_clusters_data(
                "febrl", threshold=threshold, id_column=config.primary_key_column
            )
    finally:
        os.unlink(path)

    grouped: dict[str, list[str]] = {}
    for record in clusters:
        cluster_id = str(record.get("cluster_id"))
        if cluster_id.startswith("singleton_"):
            continue
        grouped.setdefault(cluster_id, []).append(str(record["unique_id"]))

    predicted = set()
    for members in grouped.values():
        predicted.update(combinations(sorted(members), 2))
    return predicted


def score(predicted, truth):
    hits = len(predicted & truth)
    precision = hits / len(predicted) if predicted else 0.0
    recall = hits / len(truth) if truth else 0.0
    return precision, recall


def test_autoconfig_is_accurate_on_unseen_data(febrl):
    """Floors, not exact values, so the test survives library updates."""
    frame, truth = febrl
    precision, recall = score(resolve(frame), truth)
    assert precision >= 0.99, f"precision {precision:.3f}"
    assert recall >= 0.98, f"recall {recall:.3f}"


def test_still_accurate_without_a_strong_identifier(febrl):
    """The honest case.

    FEBRL3 carries soc_sec_id, which survives nearly intact across duplicates
    and is close to a unique key. Any matcher looks good when one column gives
    the answer away, and plenty of real datasets have no such column. Without
    it, matching has to work from names, addresses and dates alone.
    """
    frame, truth = febrl
    harder = frame.drop(columns=[c for c in frame.columns if "soc_sec_id" in c])
    precision, recall = score(resolve(harder), truth)
    assert precision >= 0.98, f"precision {precision:.3f}"
    assert recall >= 0.95, f"recall {recall:.3f}"


def test_numeric_identifier_columns_do_not_break_matching(febrl):
    """Regression guard.

    DuckDB types a column of digits as BIGINT, and the string similarity
    functions only accept VARCHAR, so soc_sec_id crashed the run with
    "No function matches jaro_winkler_similarity(BIGINT, BIGINT)". Comparisons
    now cast, and this fails if that cast is ever removed.
    """
    frame, _ = febrl
    numeric = [c for c in frame.columns if "soc_sec_id" in c or "postcode" in c]
    assert numeric, "expected FEBRL to contain numeric-looking identifier columns"

    # Resolving at all is the assertion: this raised before the fix.
    assert resolve(frame[["rec_id", *numeric]], threshold=0.95) is not None
