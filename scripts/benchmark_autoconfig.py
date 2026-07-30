"""Stress the auto-configuration, not the matcher.

FEBRL3 with its own column names is a friendly test: headers like
`given_name`, `date_of_birth` and `soc_sec_id` tell the profiler most of what
it needs before it has looked at a single value. Real exports are rarely that
polite. They arrive as `Field1`, or in another language, or padded with
columns that carry no signal at all.

Each variant below changes what auto-configuration has to work out while
holding the underlying records and the ground truth constant. A drop in
accuracy is therefore a failure of the configuration logic, not of Splink.

Usage:
    ./.venv/bin/python scripts/benchmark_autoconfig.py
"""

from __future__ import annotations

import os
import re
import sys
import tempfile
import time
from itertools import combinations

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

import autoconfig
from engine import EntityResolutionEngine
from services.splink_service import build_comparison

ENTITY_PATTERN = re.compile(r"^rec-(\d+)-")


def truth_pairs(frame) -> set[tuple[str, str]]:
    by_entity: dict[str, list[str]] = {}
    for rec_id in frame["rec_id"]:
        by_entity.setdefault(ENTITY_PATTERN.match(rec_id).group(1), []).append(rec_id)
    pairs: set[tuple[str, str]] = set()
    for members in by_entity.values():
        pairs.update(combinations(sorted(members), 2))
    return pairs


def predicted_pairs(clusters: list[dict]) -> set[tuple[str, str]]:
    grouped: dict[str, list[str]] = {}
    for record in clusters:
        cluster_id = str(record.get("cluster_id"))
        if cluster_id.startswith("singleton_"):
            continue
        grouped.setdefault(cluster_id, []).append(str(record["unique_id"]))
    pairs: set[tuple[str, str]] = set()
    for members in grouped.values():
        pairs.update(combinations(sorted(members), 2))
    return pairs


def evaluate(frame, truth, label: str, id_column: str = "rec_id") -> dict:
    """Auto-configure, resolve, and score. Returns a row for the summary."""
    handle, path = tempfile.mkstemp(suffix=".csv", prefix="autoconf_")
    os.close(handle)
    frame.to_csv(path, index=False)

    row = {"label": label, "precision": 0.0, "recall": 0.0, "f1": 0.0,
           "matched_on": 0, "rules": 0, "seconds": 0.0, "error": None}

    started = time.time()
    try:
        with EntityResolutionEngine() as engine:
            engine.ingest_data(path, table_name="t")
            config = autoconfig.generate(engine, "t", threshold=0.95, max_rules=4)

            row["matched_on"] = len(config.settings.get("comparisons") or [])
            row["rules"] = len(
                config.settings.get("blocking_rules_to_generate_predictions") or []
            )
            row["chose_key"] = config.primary_key_column
            row["used"] = [
                c["output_column_name"]
                for c in (config.settings.get("comparisons") or [])
                if isinstance(c, dict)
            ]
            row["excluded"] = [
                (c.name, c.reason) for c in config.columns if not c.usable
            ]

            if not config.settings.get("comparisons"):
                row["error"] = "no usable columns"
                return row

            settings = dict(config.settings)
            settings["comparisons"] = [
                build_comparison(c) if isinstance(c, dict) else c
                for c in settings["comparisons"]
            ]
            engine.run_resolution(
                table_name="t",
                settings=settings,
                primary_key_column=config.primary_key_column,
            )
            clusters = engine.get_clusters_data(
                "t", threshold=0.95, id_column=config.primary_key_column
            )

        # Cluster ids come back keyed by whatever column autoconfig chose. The
        # score is only meaningful against the real record id.
        if config.primary_key_column != id_column:
            lookup = dict(zip(frame[config.primary_key_column].astype(str), frame[id_column]))
            for record in clusters:
                record["unique_id"] = lookup.get(str(record["unique_id"]), record["unique_id"])

        predicted = predicted_pairs(clusters)
        hits = len(predicted & truth)
        precision = hits / len(predicted) if predicted else 0.0
        recall = hits / len(truth) if truth else 0.0
        row["precision"] = precision
        row["recall"] = recall
        row["f1"] = (
            2 * precision * recall / (precision + recall) if precision + recall else 0.0
        )
    except Exception as exc:
        row["error"] = f"{type(exc).__name__}: {str(exc)[:90]}"
    finally:
        row["seconds"] = time.time() - started
        os.unlink(path)

    return row


def main() -> None:
    import numpy as np
    import pandas as pd
    from splink.datasets import splink_datasets

    base = splink_datasets.febrl3.copy()
    truth = truth_pairs(base)
    print(f"FEBRL3: {len(base):,} records, {len(truth):,} true duplicate pairs\n")

    rng = np.random.default_rng(42)
    variants: list[tuple[str, "pd.DataFrame"]] = [("Baseline, original headers", base)]

    # 1. Headers stripped of meaning. If accuracy survives, role detection is
    #    reading values. If it collapses, the profiler was leaning on names.
    anonymous = base.copy()
    anonymous.columns = ["rec_id"] + [f"col_{i}" for i in range(1, len(base.columns))]
    variants.append(("Meaningless headers (col_1..col_N)", anonymous))

    # 2. Headers in another language. Same test, but closer to a real export
    #    from a non-English system.
    german = base.copy()
    german.columns = [
        "rec_id", "vorname", "nachname", "hausnummer", "strasse", "zusatz",
        "ort", "plz", "bundesland", "geburtsdatum", "sozialversicherung",
    ]
    variants.append(("Non-English headers", german))

    # 3. Junk columns. A constant, a value unique to every row, and a mostly
    #    empty column. All three should be excluded, and none should be
    #    mistaken for a primary key or a useful blocking rule.
    noisy = base.copy()
    noisy["region"] = "APAC"
    noisy["export_row"] = [f"x{i}" for i in range(len(noisy))]
    sparse = rng.random(len(noisy)) < 0.05
    noisy["notes"] = np.where(sparse, "follow up", "")
    variants.append(("Plus constant, unique and 95% empty columns", noisy))

    # 4. Heavy missingness across the fields that carry the signal.
    holed = base.copy()
    for column in [" given_name", " surname", " date_of_birth"]:
        mask = rng.random(len(holed)) < 0.35
        holed.loc[mask, column] = ""
    variants.append(("35% of name and date values blanked", holed))

    # 5. No strong identifier and no date. Leaves names and addresses only.
    lean = base.drop(columns=[" soc_sec_id", " date_of_birth"])
    variants.append(("No identifier and no date of birth", lean))

    # 6. A decoy. `id` is unique per row and plausibly named, but it is a row
    #    number, not an identity. Two records for the same person get
    #    different ones, so blocking or matching on it would be worthless.
    decoy = base.copy()
    decoy.insert(0, "id", range(1, len(decoy) + 1))
    variants.append(("Decoy unique 'id' column present", decoy))

    # 7. Column order shuffled and a duplicated name field, so nothing can be
    #    inferred from position and one signal appears twice.
    shuffled = base.copy()
    shuffled["contact_name"] = shuffled[" given_name"] + " " + shuffled[" surname"]
    order = list(shuffled.columns)
    rng.shuffle(order)
    shuffled = shuffled[order]
    variants.append(("Shuffled order plus a duplicated name field", shuffled))

    results = [evaluate(frame, truth, label) for label, frame in variants]

    width = max(len(r["label"]) for r in results)
    print(f"{'Variant'.ljust(width)}  Prec  Recall     F1  Cols  Rules   Time")
    print("-" * (width + 44))
    for r in results:
        if r["error"]:
            print(f"{r['label'].ljust(width)}  {r['error']}")
            continue
        print(
            f"{r['label'].ljust(width)}  "
            f"{r['precision']:.3f}  {r['recall']:.3f}  {r['f1']:.3f}  "
            f"{r['matched_on']:>4}  {r['rules']:>5}  {r['seconds']:>5.1f}s"
        )

    print("\nWhat auto-configuration decided:")
    for r in results:
        if r.get("error"):
            continue
        print(f"\n  {r['label']}")
        print(f"    primary key: {r.get('chose_key')}")
        print(f"    matched on:  {', '.join(r.get('used') or []) or 'nothing'}")
        for name, reason in (r.get("excluded") or [])[:4]:
            print(f"    excluded {name}: {reason}")

    baseline = results[0]
    print()
    for r in results[1:]:
        if r["error"]:
            continue
        drop = baseline["f1"] - r["f1"]
        verdict = "holds" if drop < 0.05 else "DEGRADES"
        print(f"  {verdict:<9} {r['label']}: F1 {r['f1']:.3f} ({drop:+.3f} vs baseline)")


if __name__ == "__main__":
    main()
