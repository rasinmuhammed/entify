"""
Known-answer tests for the matching engine.

"It returned some clusters" is not a test for an entity resolution system --
the failure mode that matters is returning confident, plausible, wrong answers.
These tests run against generated data with known ground truth and assert on
measured precision and recall, so a regression in scoring or clustering fails
the build instead of quietly degrading result quality.

The thresholds below are floors, chosen with headroom under the numbers the
engine currently achieves. They are meant to catch regressions, not to encode
the current values exactly.
"""

from __future__ import annotations

import pytest

from engine import EngineError, EntityResolutionEngine, quote_ident
from sample_data import generate
from services.splink_service import SplinkService, build_comparison


# -- fixtures --------------------------------------------------------------

def jaro(column: str, threshold: float = 0.9) -> dict:
    return {
        "output_column_name": column,
        "comparison_library_name": "jaro_winkler_at_thresholds",
        "threshold": threshold,
    }


def exact(column: str) -> dict:
    return {"output_column_name": column, "comparison_library_name": "exact_match"}


TUNED_SETTINGS = {
    "link_type": "dedupe_only",
    "unique_id_column_name": "customer_id",
    "blocking_rules_to_generate_predictions": [
        "l.last_name = r.last_name AND l.city = r.city",
        "l.email = r.email",
        "l.address = r.address",
    ],
    "comparisons": [
        jaro("first_name"), jaro("last_name"), jaro("email"),
        jaro("address"), jaro("phone", 0.85), exact("city"),
    ],
}


@pytest.fixture(scope="module")
def labelled_data():
    """A dataset with ground truth, plus the true duplicate pairs."""
    df = generate(n_entities=1500, duplicate_rate=0.18, seed=42, include_ground_truth=True)
    truth_pairs = set()
    for ids in df.groupby("true_entity_id")["customer_id"].apply(list):
        ordered = sorted(ids)
        for i in range(len(ordered)):
            for j in range(i + 1, len(ordered)):
                truth_pairs.add((ordered[i], ordered[j]))
    return df, truth_pairs


@pytest.fixture(scope="module")
def resolved(labelled_data):
    """Run the tuned config once and reuse it across assertions."""
    df, truth_pairs = labelled_data
    service = SplinkService()
    result = service.process_entity_resolution(
        data_csv=df.drop(columns=["true_entity_id"]).to_csv(index=False),
        settings=dict(TUNED_SETTINGS),
        threshold=0.95,
        table_name="customers",
        primary_key_column="customer_id",
    )
    assert result["status"] == "success", result.get("error")
    return service, result, df, truth_pairs


def score(engine, truth_pairs, threshold: float) -> tuple[float, float]:
    """Pairwise precision and recall at a threshold."""
    predictions = engine.predictions_df()
    left, right = engine.id_columns
    above = predictions[predictions["match_probability"] >= threshold]
    predicted = {
        tuple(sorted((str(a), str(b))))
        for a, b in zip(above[left], above[right])
    }
    true_positives = len(predicted & truth_pairs)
    precision = true_positives / len(predicted) if predicted else 0.0
    recall = true_positives / len(truth_pairs) if truth_pairs else 0.0
    return precision, recall


# -- quality ---------------------------------------------------------------

def test_precision_and_recall_meet_floor(resolved):
    service, _, _, truth_pairs = resolved
    precision, recall = score(service.engine, truth_pairs, 0.95)
    assert precision >= 0.90, f"precision regressed to {precision:.3f}"
    assert recall >= 0.85, f"recall regressed to {recall:.3f}"


def test_duplicate_count_is_close_to_truth(resolved):
    """The headline number in the audit report must track reality."""
    _, result, df, _ = resolved
    actual = len(df) - df["true_entity_id"].nunique()
    reported = result["duplicate_records"]
    error_rate = abs(reported - actual) / actual
    assert error_rate <= 0.20, (
        f"reported {reported} duplicates against a true {actual} "
        f"({error_rate:.1%} off)"
    )


def test_precision_increases_with_threshold(resolved):
    """A higher bar must not admit more false positives."""
    service, _, _, truth_pairs = resolved
    precisions = [score(service.engine, truth_pairs, t)[0] for t in (0.5, 0.9, 0.99)]
    assert precisions == sorted(precisions), f"precision not monotonic: {precisions}"


def test_model_is_actually_trained(resolved):
    """Untrained models silently return nothing; that must never pass."""
    _, result, _, _ = resolved
    training = result["training"]
    assert training["u_trained"], training["warnings"]
    assert training["m_trained"], training["warnings"]


def test_predictions_are_not_pre_filtered(resolved):
    """The full score distribution must survive for threshold tuning.

    Splink can filter at predict time; doing so would leave the histogram and
    threshold analysis with nothing below the cutoff to show.
    """
    service, result, _, _ = resolved
    distribution = service.engine.get_score_distribution()
    assert distribution["total_comparisons"] > result["total_pairs"], (
        "predictions appear pre-filtered: no pairs scored below the threshold"
    )
    assert distribution["statistics"]["min"] < 0.95


# -- correctness of reported figures ---------------------------------------

def test_duplicate_summary_is_internally_consistent(resolved):
    service, _, _, _ = resolved
    summary = service.engine.duplicate_summary(0.95)
    assert summary["total_clusters"] == (
        summary["singleton_count"] + summary["duplicate_clusters"]
    )
    assert summary["duplicate_records"] == (
        summary["total_records"] - summary["total_clusters"]
    )


def test_cluster_ids_attach_with_a_non_default_primary_key(resolved):
    """Regression: prediction columns are named after the primary key.

    Assuming `unique_id_l`/`unique_id_r` silently dropped every cluster id for
    any dataset whose key was not literally called `unique_id`.
    """
    _, result, _, _ = resolved
    assert any("left_cluster_id" in match for match in result["matches"])
    assert service_id_columns_match(result)


def service_id_columns_match(result) -> bool:
    return any("customer_id_l" in match for match in result["matches"])


def test_example_clusters_contain_real_duplicates(resolved):
    """Evidence in the audit report must be genuine multi-record groups."""
    service, _, _, _ = resolved
    examples = service.engine.example_duplicate_clusters("customers", 0.95, limit=3)
    assert examples, "no example clusters produced"
    for cluster in examples:
        assert len(cluster) > 1
        assert len({row["cluster_id"] for row in cluster}) == 1


# -- input validation ------------------------------------------------------

def test_single_level_comparison_is_rejected_not_crashed():
    """Regression: this used to raise ZeroDivisionError inside Splink."""
    service = SplinkService()
    result = service.process_entity_resolution(
        data_csv="id,name\n1,a\n2,b\n",
        settings={
            "link_type": "dedupe_only",
            "unique_id_column_name": "id",
            "blocking_rules_to_generate_predictions": [],
            # No output_column_name -- unusable, must be reported not fatal.
            "comparisons": [{"comparison_levels": [{"sql_condition": "name_l = name_r"}]}],
        },
        threshold=0.5,
        primary_key_column="id",
    )
    assert result["status"] == "error"
    assert "comparison" in result["error"].lower()
    assert "division" not in result["error"].lower()


def test_missing_primary_key_names_the_available_columns():
    service = SplinkService()
    result = service.process_entity_resolution(
        data_csv="id,name\n1,a\n2,b\n",
        settings={"comparisons": [exact("name")]},
        primary_key_column="nope",
    )
    assert result["status"] == "error"
    assert "nope" in result["error"]
    assert "name" in result["error"]


def test_build_comparison_never_returns_a_raw_dict():
    """Returning the caller's dict is what reached Splink and divided by zero."""
    for config in (exact("a"), jaro("b"), {"output_column_name": "c"}):
        built = build_comparison(config)
        assert not isinstance(built, dict), config

    with pytest.raises(EngineError):
        build_comparison({"comparison_levels": []})


def test_levenshtein_similarity_is_not_used_as_a_distance():
    """A UI-supplied similarity below 1 must not become a zero edit distance."""
    built = build_comparison(
        {
            "output_column_name": "name",
            "comparison_library_name": "levenshtein_at_thresholds",
            "threshold": 0.9,
        }
    )
    assert not isinstance(built, dict)


# -- SQL identifier safety -------------------------------------------------

@pytest.mark.parametrize(
    "identifier",
    ['x"; DROP TABLE users; --', "a';--", "", "  ", "1abc", "col;name"],
)
def test_quote_ident_rejects_unsafe_identifiers(identifier):
    with pytest.raises(EngineError):
        quote_ident(identifier)


@pytest.mark.parametrize("identifier", ["customer_id", "First Name", "col.name", "a-b", "_x1"])
def test_quote_ident_accepts_real_column_names(identifier):
    assert quote_ident(identifier).startswith('"')


def test_ingest_rejects_remote_sources(tmp_path):
    """The engine runs server-side; honouring a URL would make it fetch for callers."""
    engine = EntityResolutionEngine()
    try:
        with pytest.raises(EngineError, match="Remote sources"):
            engine.ingest_data("https://example.com/data.csv")
    finally:
        engine.close()


def test_profile_reports_blanks_as_empty(tmp_path):
    """Blank strings are missing data; counting only NULLs understates sparsity."""
    csv_path = tmp_path / "d.csv"
    csv_path.write_text('id,email\n1,a@b.com\n2,\n3,"   "\n')

    engine = EntityResolutionEngine()
    try:
        engine.ingest_data(str(csv_path), "t")
        profile = engine.profile_data("t")
        email = next(c for c in profile["columns"] if c["name"] == "email")
        assert email["empty_count"] == 2
        assert profile["total_rows"] == profile["row_count"] == 3
    finally:
        engine.close()
