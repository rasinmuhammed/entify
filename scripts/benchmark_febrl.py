"""Benchmark Entify against FEBRL, a standard record linkage dataset.

The benchmark in `backend/tests/test_matching_quality.py` uses data this
project generates itself, which proves the pipeline is internally consistent
but not that it works on data it has never seen. FEBRL3 is an external,
published dataset with known duplicates, distributed with Splink.

The point of this script is specifically to test *auto-configuration*. No
blocking rules, comparisons or thresholds are supplied. Entify is handed a
CSV it has never seen and has to work out how to match it, which is the claim
worth checking against outside data.

Ground truth is encoded in `rec_id`: `rec-1496-org` and `rec-1496-dup-0` are
the same person, so the entity is the number between the prefix and the
suffix.

Usage:
    ./.venv/bin/python scripts/benchmark_febrl.py
"""

from __future__ import annotations

import os
import re
import sys
import time
from itertools import combinations

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

import autoconfig
from engine import EntityResolutionEngine
from services.splink_service import build_comparison

ENTITY_PATTERN = re.compile(r"^rec-(\d+)-")


def true_entity(rec_id: str) -> str:
    """The entity a FEBRL record belongs to."""
    match = ENTITY_PATTERN.match(rec_id)
    if not match:
        raise ValueError(f"Unexpected rec_id format: {rec_id!r}")
    return match.group(1)


def truth_pairs(frame) -> set[tuple[str, str]]:
    """Every pair of record ids that refer to the same person."""
    pairs: set[tuple[str, str]] = set()
    by_entity: dict[str, list[str]] = {}
    for rec_id in frame["rec_id"]:
        by_entity.setdefault(true_entity(rec_id), []).append(rec_id)
    for members in by_entity.values():
        for left, right in combinations(sorted(members), 2):
            pairs.add((left, right))
    return pairs


def predicted_pairs(clusters: list[dict]) -> set[tuple[str, str]]:
    """Every within-cluster pair Entify implies by grouping records."""
    grouped: dict[str, list[str]] = {}
    for record in clusters:
        cluster_id = str(record.get("cluster_id"))
        if cluster_id.startswith("singleton_"):
            continue
        grouped.setdefault(cluster_id, []).append(str(record["unique_id"]))

    pairs: set[tuple[str, str]] = set()
    for members in grouped.values():
        for left, right in combinations(sorted(members), 2):
            pairs.add((left, right))
    return pairs


def run(frame, truth: set[tuple[str, str]], label: str) -> None:
    """Auto-configure and score one variant of the dataset."""
    import tempfile

    print(f"\n{'=' * 62}\n{label}\n{'=' * 62}")
    print(f"{len(frame):,} records, {len(frame.columns)} columns")

    handle, path = tempfile.mkstemp(suffix=".csv", prefix="febrl3_")
    os.close(handle)
    frame.to_csv(path, index=False)

    try:
        started = time.time()
        with EntityResolutionEngine() as engine:
            engine.ingest_data(path, table_name="febrl")

            # No hand-tuning: this is the whole point.
            config = autoconfig.generate(engine, "febrl", threshold=0.95, max_rules=4)
            print("Auto-configuration chose:")
            print(f"  primary key: {config.primary_key_column}")
            for note in config.notes:
                print(f"  {note}")
            print()

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

            for threshold in (0.5, 0.9, 0.95, 0.99):
                clusters = engine.get_clusters_data(
                    "febrl", threshold=threshold, id_column=config.primary_key_column
                )
                predicted = predicted_pairs(clusters)
                hits = len(predicted & truth)
                precision = hits / len(predicted) if predicted else 0.0
                recall = hits / len(truth) if truth else 0.0
                f1 = (
                    2 * precision * recall / (precision + recall)
                    if precision + recall
                    else 0.0
                )
                print(
                    f"  threshold {threshold:<5} "
                    f"precision {precision:.3f}  recall {recall:.3f}  F1 {f1:.3f}  "
                    f"({hits:,} of {len(predicted):,} predicted pairs correct)"
                )

        print(f"\nTotal time: {time.time() - started:.1f}s")
    finally:
        os.unlink(path)


def main() -> None:
    from splink.datasets import splink_datasets

    frame = splink_datasets.febrl3.copy()

    # FEBRL ships with a leading space on every column but rec_id. Left alone
    # deliberately: handling awkward headers is part of what is being tested.
    truth = truth_pairs(frame)
    entities = frame["rec_id"].map(true_entity).nunique()
    print(f"Ground truth: {entities:,} distinct people, {len(truth):,} duplicate pairs")

    run(frame, truth, "FEBRL3, as published")

    # FEBRL3 carries soc_sec_id, which survives almost intact across
    # duplicates and is close to a unique key. Any matcher looks strong when
    # one column nearly gives the answer away, and plenty of real datasets
    # have no such column. Dropping it is the more honest test of whether
    # matching on names, addresses and dates actually works.
    harder = frame.drop(columns=[c for c in frame.columns if "soc_sec_id" in c])
    run(harder, truth, "FEBRL3, without the soc_sec_id identifier")


if __name__ == "__main__":
    main()
