"""Tests for the spreadsheet deduplication path.

The Sheets add-on gets one shot: a user selects a range and presses a button.
There is no configuration step to fall back on, so these cover the inputs a
spreadsheet actually produces (ragged rows, blank headers, columns carrying no
signal, selections too small to train on) rather than only the happy path.

Accuracy is asserted on a few hundred generated rows with known duplicates,
because that is the size a real selection tends to be. A handful of rows is
not enough for expectation maximisation to estimate match weights, which is
itself covered below.
"""

import pytest

from sample_data import generate
from services import sheets_service
from services.sheets_service import SheetsDedupeError, dedupe


@pytest.fixture(scope="module")
def sheet():
    """A realistic selection: 500-odd rows with known duplicate groups."""
    df = generate(n_entities=400, duplicate_rate=0.18, seed=7, include_ground_truth=True)
    truth = df["true_entity_id"].tolist()
    df = df.drop(columns=["true_entity_id", "customer_id"])
    return list(df.columns), df.astype(str).values.tolist(), truth


@pytest.fixture(scope="module")
def result(sheet):
    header, rows, _ = sheet
    return dedupe(header, rows, threshold=0.9)


def test_every_reported_group_is_really_one_entity(sheet, result):
    """Precision floor. A false group makes a user delete a real customer."""
    _, _, truth = sheet
    impure = [g for g in result["groups"] if len({truth[r] for r in g["rows"]}) > 1]
    assert not impure, f"{len(impure)} groups mixed distinct entities"


def test_finds_most_of_the_real_duplicates(sheet, result):
    _, _, truth = sheet
    true_duplicate_rows = len(truth) - len(set(truth))
    assert result["duplicate_rows"] >= true_duplicate_rows * 0.85


def test_does_not_flag_more_duplicates_than_exist(sheet, result):
    _, _, truth = sheet
    assert result["duplicate_rows"] <= len(truth) - len(set(truth))


def test_rows_are_addressed_positionally(sheet, result):
    _, rows, _ = sheet
    for group in result["groups"]:
        assert len(group["rows"]) == len(set(group["rows"]))
        for row in group["rows"]:
            assert 0 <= row < len(rows)


def test_a_row_belongs_to_at_most_one_group(result):
    seen: set[int] = set()
    for group in result["groups"]:
        assert not (seen & set(group["rows"]))
        seen |= set(group["rows"])


def test_evidence_explains_the_grouping(result):
    group = result["groups"][0]
    assert group["evidence"], "a group with no evidence cannot be reviewed"
    for item in group["evidence"]:
        assert item["strength"] > 0
        assert isinstance(item["supports_match"], bool)
        assert item["field"] in result["columns_used"]


def test_evidence_is_ordered_by_strength(result):
    strengths = [e["strength"] for e in result["groups"][0]["evidence"]]
    assert strengths == sorted(strengths, reverse=True)


def test_reports_which_columns_decided(sheet, result):
    header, _, _ = sheet
    assert result["columns_used"]
    assert all(c in header for c in result["columns_used"])


def test_realistic_selection_is_marked_reliable(result):
    assert result["reliable"] is True


def test_small_selection_is_flagged_not_silently_empty():
    """Too few rows to train on must say so rather than return a bare zero."""
    header = ["name", "email"]
    rows = [["Barbara Reddy", "b.reddy@example.com"]] * 4
    out = dedupe(header, rows, threshold=0.9)
    assert out["reliable"] is False
    assert any("not enough" in note for note in out["notes"])


def test_ragged_rows_are_padded_not_rejected(sheet):
    """Trailing empty cells are omitted entirely by the Sheets API."""
    header, rows, _ = sheet
    ragged = [row[:2] if i % 3 == 0 else row for i, row in enumerate(rows)]
    out = dedupe(header, ragged, threshold=0.9)
    assert out["rows_examined"] == len(ragged)


def test_blank_header_names_the_offending_column(sheet):
    header, rows, _ = sheet
    broken = list(header)
    broken[1] = "  "
    with pytest.raises(SheetsDedupeError, match="Column 2"):
        dedupe(broken, rows)


def test_too_few_rows_is_explained():
    with pytest.raises(SheetsDedupeError, match="two data rows"):
        dedupe(["name"], [["only one"]])


def test_oversized_selection_points_at_the_workspace():
    oversized = [["a", "b"]] * (sheets_service.MAX_ROWS + 1)
    with pytest.raises(SheetsDedupeError, match="workspace"):
        dedupe(["name", "email"], oversized)


def test_unmatchable_columns_return_a_note_not_an_error():
    """Every value unique: nothing to match on, but not a crash."""
    out = dedupe(["ref"], [[f"id-{i}"] for i in range(60)])
    assert out["groups"] == []
    assert out["notes"]
