"""Deduplication for spreadsheet-shaped data.

The Sheets add-on sends a header row plus data rows and expects back groups of
rows that refer to the same thing, with enough evidence attached to explain
each grouping in a sidebar.

This is deliberately a different shape from the workspace API. The add-on has
no concept of projects, configuration, or a training phase: a user selects a
range, presses a button, and wants an answer. So the whole pipeline runs in
one call and configures itself, and anything the user could not act on is
left out of the response.

Row identity is positional. Spreadsheets have no stable primary key, so rows
are addressed by their index in the payload and the add-on maps that back to
sheet rows itself.
"""

from __future__ import annotations

import csv
import io
import os
import tempfile
from dataclasses import dataclass
from typing import Any, Optional

import autoconfig
from engine import EntityResolutionEngine
from services.splink_service import build_comparison

# A spreadsheet selection large enough to exceed this is not what the add-on is
# for, and the honest answer is to say so rather than time out in a sidebar.
MAX_ROWS = 50_000

# Below this, expectation maximisation has too few pairs to estimate match
# weights from, so m values stay untrained and everything scores near the
# default prior. Measured behaviour: a six-row selection with three obvious
# duplicates returns nothing, while a few hundred rows finds them reliably.
# Results are still returned below this, with a note, because silently
# returning nothing is what makes a tool feel broken.
MIN_ROWS_FOR_RELIABLE_TRAINING = 50

# Internal column name for positional identity. Prefixed to avoid colliding
# with a user column that happens to be called "row" or "id".
ROW_ID = "_entify_row"


@dataclass
class SheetGroup:
    """One set of rows judged to be the same entity."""

    rows: list[int]
    confidence: float
    evidence: list[dict[str, Any]]


class SheetsDedupeError(ValueError):
    """Raised for input the caller can fix, and phrased so they can fix it."""


def _to_csv(header: list[str], rows: list[list[Any]]) -> str:
    """Render the payload as CSV with a positional id column prepended."""
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow([ROW_ID, *header])
    for index, row in enumerate(rows):
        # Short rows are normal in spreadsheets; pad rather than reject.
        padded = list(row) + [""] * (len(header) - len(row))
        writer.writerow([index, *padded[: len(header)]])
    return buffer.getvalue()


def _validate(header: list[str], rows: list[list[Any]]) -> None:
    if not header:
        raise SheetsDedupeError(
            "The first row of your selection is used as column headers, and it "
            "came through empty. Include a header row in the selection."
        )
    if len(rows) < 2:
        raise SheetsDedupeError(
            "At least two data rows are needed to look for duplicates."
        )
    if len(rows) > MAX_ROWS:
        raise SheetsDedupeError(
            f"That selection has {len(rows):,} rows. This add-on handles up to "
            f"{MAX_ROWS:,}. For larger files use the Entify workspace."
        )

    blank = [i for i, name in enumerate(header) if not str(name).strip()]
    if blank:
        raise SheetsDedupeError(
            f"Column {blank[0] + 1} has no header. Every selected column needs "
            "a name so the results can refer to it."
        )


def _evidence_for_group(
    predictions, members: list[int], columns: list[str]
) -> list[dict[str, Any]]:
    """Per-field contributions for a group, strongest evidence first.

    This is the reason the add-on exists rather than a formula. A user who is
    about to delete a row wants to see which fields agreed, not a score.

    Groups come from transitive closure, so the first two members are not
    necessarily a pair the model scored directly: A-B and B-C can both be
    above threshold while A-C was never compared. Any scored pair within the
    group is picked, highest probability first, so the exemplar shown is the
    clearest one rather than an arbitrary one. Pair order in the predictions
    table is not guaranteed either, hence matching both directions.
    """
    left_col, right_col = f"{ROW_ID}_l", f"{ROW_ID}_r"
    if left_col not in predictions.columns:
        return []

    wanted = set(members)
    left_ids = predictions[left_col].astype(int)
    right_ids = predictions[right_col].astype(int)
    within = predictions[left_ids.isin(wanted) & right_ids.isin(wanted)]
    if within.empty:
        return []

    if "match_probability" in within.columns:
        within = within.sort_values("match_probability", ascending=False)

    row = within.iloc[0]
    fields: list[dict[str, Any]] = []
    for column in columns:
        weight_key = f"bf_{column}"
        if weight_key not in row.index:
            continue
        try:
            weight = float(row[weight_key])
        except (TypeError, ValueError):
            continue
        # A Bayes factor of 1 means the field said nothing either way.
        if weight <= 0 or abs(weight - 1.0) < 1e-9:
            continue
        fields.append(
            {
                "field": column,
                "left": _clean(row.get(f"{column}_l")),
                "right": _clean(row.get(f"{column}_r")),
                # Positive supports a match, negative argues against one.
                "supports_match": weight > 1.0,
                "strength": round(abs(weight if weight > 1 else 1 / weight), 2),
            }
        )

    fields.sort(key=lambda f: f["strength"], reverse=True)
    return fields


def _notes_for(notes: list[str], row_count: int) -> list[str]:
    """Prepend the small-selection warning when it applies.

    Applied on every return path. A four-row selection also trips the "no
    usable columns" case, and being told only that would send the user off to
    fix their columns when the real problem is the size of the selection.
    """
    if row_count >= MIN_ROWS_FOR_RELIABLE_TRAINING:
        return list(notes)
    return [
        f"Only {row_count} rows were selected. The model learns match weights "
        f"from the data itself, and below about {MIN_ROWS_FOR_RELIABLE_TRAINING} "
        "rows there is not enough to learn from, so duplicates may be missed. "
        "Select more rows for a reliable answer.",
        *notes,
    ]


def _clean(value: Any) -> str:
    if value is None:
        return ""
    text = str(value)
    return "" if text.lower() in {"nan", "none", "nat"} else text


def dedupe(
    header: list[str],
    rows: list[list[Any]],
    threshold: float = 0.9,
) -> dict[str, Any]:
    """Find duplicate groups in a spreadsheet selection.

    Returns groups, the columns that were actually used to decide, and any
    notes worth surfacing. Configuration is inferred; the caller sends data
    and nothing else.
    """
    _validate(header, rows)

    # The engine loads from a path rather than a string, so the payload is
    # staged to a temp file and removed on the way out even if matching raises.
    handle, csv_path = tempfile.mkstemp(suffix=".csv", prefix="entify_sheet_")
    try:
        with os.fdopen(handle, "w", encoding="utf-8", newline="") as fh:
            fh.write(_to_csv(header, rows))
        return _dedupe_from_path(csv_path, header, rows, threshold)
    finally:
        try:
            os.unlink(csv_path)
        except OSError:
            pass


def _dedupe_from_path(
    csv_path: str,
    header: list[str],
    rows: list[list[Any]],
    threshold: float,
) -> dict[str, Any]:
    with EntityResolutionEngine() as engine:
        engine.ingest_data(csv_path, table_name="sheet")

        config = autoconfig.generate(
            engine, "sheet", threshold=threshold, max_rules=3
        )
        if not config.settings.get("comparisons"):
            return {
                "groups": [],
                "columns_used": [],
                "notes": _notes_for(
                    config.notes
                    or [
                        "None of these columns can support matching. They are "
                        "either all unique, all identical, or mostly empty."
                    ],
                    len(rows),
                ),
                "rows_examined": len(rows),
                "duplicate_rows": 0,
                "reliable": len(rows) >= MIN_ROWS_FOR_RELIABLE_TRAINING,
            }

        settings = dict(config.settings)
        settings["unique_id_column_name"] = ROW_ID
        # Without this Splink drops the per-field Bayes factors and only the
        # final probability survives, which would leave the sidebar with a
        # score and nothing to justify it.
        settings["retain_intermediate_calculation_columns"] = True
        # autoconfig emits library-name dicts; the engine needs real
        # ComparisonCreators, or it drops each one for having no levels.
        settings["comparisons"] = [
            build_comparison(c) if isinstance(c, dict) else c
            for c in settings.get("comparisons", [])
        ]

        engine.run_resolution(
            table_name="sheet", settings=settings, primary_key_column=ROW_ID
        )
        # get_clusters returns pairwise predictions; the grouped assignment
        # lives in get_clusters_data, which is what the add-on needs.
        assigned = engine.get_clusters_data(
            "sheet", threshold=threshold, id_column=ROW_ID
        )
        predictions = engine.predictions_df()

    used = [
        c["output_column_name"]
        for c in config.settings.get("comparisons", [])
        if isinstance(c, dict) and c.get("output_column_name")
    ]

    by_cluster: dict[str, list[int]] = {}
    for record in assigned:
        cluster_id = str(record.get("cluster_id"))
        # Singletons are assigned a synthetic id and are not duplicates.
        if cluster_id.startswith("singleton_"):
            continue
        by_cluster.setdefault(cluster_id, []).append(int(record["unique_id"]))

    groups: list[dict[str, Any]] = []
    for members in by_cluster.values():
        members = sorted(members)
        if len(members) < 2:
            continue
        # Explain the group through its first pair. Showing every pair in a
        # sidebar is noise; the representative pair is what people check.
        evidence = _evidence_for_group(predictions, members, used)
        groups.append(
            {
                "rows": members,
                "size": len(members),
                "evidence": evidence,
            }
        )

    groups.sort(key=lambda g: (-g["size"], g["rows"][0]))

    notes = _notes_for(config.notes, len(rows))

    return {
        "groups": groups,
        "columns_used": used,
        "notes": notes,
        "rows_examined": len(rows),
        "duplicate_rows": sum(g["size"] - 1 for g in groups),
        "reliable": len(rows) >= MIN_ROWS_FOR_RELIABLE_TRAINING,
    }
