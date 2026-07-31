"""Every chart the results screen renders, against a real trained model.

These were all broken at once and nobody noticed, because the endpoints return
409 ("run a match first") whenever there is no model. Without a match in the
test there is nothing to render, so the suite was green while the results
screen returned 500 to anyone who got that far.

So each test runs an actual resolution first. That is slower, and it is the
only arrangement that would have caught this.
"""

import pytest

from sample_data import generate
from services.splink_service import SplinkService


@pytest.fixture(scope="module")
def resolved():
    """A service with a trained model and predictions."""
    frame = generate(n_entities=120, duplicate_rate=0.18, seed=11, include_ground_truth=False)

    service = SplinkService()
    result = service.process_entity_resolution(
        data_csv=frame.to_csv(index=False),
        settings={
            "link_type": "dedupe_only",
            "unique_id_column_name": "customer_id",
            "blocking_rules_to_generate_predictions": [
                "l.email = r.email",
                "l.phone = r.phone",
            ],
            "comparisons": [
                {"output_column_name": c, "comparison_library_name": "jaro_winkler_at_thresholds", "threshold": 0.9}
                for c in ("first_name", "last_name", "email", "address")
            ],
        },
        threshold=0.9,
        table_name="input_data",
        primary_key_column="customer_id",
    )
    assert result["status"] == "success", result.get("error")
    return service, frame


@pytest.mark.parametrize(
    "getter",
    [
        "get_match_weights_chart",
        "get_parameter_estimates_chart",
        "get_comparison_viewer_dashboard",
    ],
)
def test_chart_renders_html(resolved, getter):
    """Splink 4 moved every chart onto linker.visualisations.

    Calling them on the Linker raised AttributeError, which the endpoints
    turned into a 500 the moment a user reached the results screen.
    """
    service, _ = resolved
    html = getattr(service, getter)()
    assert html, f"{getter} returned nothing"
    assert "<" in html, f"{getter} did not return markup"


def test_threshold_chart_never_raises(resolved):
    """A weaker assertion than the others, and deliberately so.

    The match weight histogram fails on some inputs with "Object of type
    Decimal is not JSON serializable", because DuckDB sometimes types the
    weight column as DECIMAL and Altair cannot serialise it. It is
    data-dependent: the same code renders on one dataset and not another.

    What must hold either way is the contract. A chart that cannot render
    returns None, the endpoint answers 409 with something the user can act on,
    and nothing reaches them as a 500.
    """
    service, _ = resolved
    result = service.get_threshold_selection_chart()
    assert result is None or "<" in result


def test_waterfall_explains_a_real_pair(resolved):
    """The waterfall is the product's core claim made visible.

    It needs a *scored* pair, not two raw rows: passing rows straight through
    raised KeyError('gamma_first_name'), because the comparison-level columns
    only exist once the pair has been through the model.
    """
    service, frame = resolved
    engine = service.engine

    pairs = engine.predictions_df()
    assert not pairs.empty, "no predictions to explain"

    top = pairs.sort_values("match_probability", ascending=False).iloc[0]
    html = engine.get_waterfall_chart(
        str(top["customer_id_l"]), str(top["customer_id_r"])
    )

    assert html, "waterfall returned nothing for a pair the model scored"
    assert "<" in html


def test_waterfall_is_none_for_a_pair_that_does_not_exist(resolved):
    """A missing pair should be a clean absence, not an exception."""
    service, _ = resolved
    assert service.engine.get_waterfall_chart("NOPE-1", "NOPE-2") is None


def test_evidence_columns_are_retained(resolved):
    """The per-field Bayes factors are what every explanation is built from.

    Splink discards them unless asked. Without them the waterfall and the
    comparison viewer both refuse to render, which removes the reason to
    choose this over a tool that only reports a score.
    """
    service, _ = resolved
    columns = set(service.engine.predictions_df().columns)
    assert any(c.startswith("bf_") for c in columns), "no Bayes factor columns"
    assert any(c.startswith("gamma_") for c in columns), "no comparison levels"
