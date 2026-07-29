from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
BACKEND_ROOT = ROOT / "backend"
for path in (ROOT, BACKEND_ROOT):
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))

from backend.services.splink_service import SplinkService, build_comparison  # noqa: E402
from splink.comparison_library import ExactMatch, JaroWinklerAtThresholds  # noqa: E402


def test_build_comparison_uses_current_library_objects():
    exact = build_comparison(
        {
            "output_column_name": "name",
            "comparison_library_name": "exact_match",
        }
    )
    fuzzy = build_comparison(
        {
            "output_column_name": "name",
            "comparison_library_name": "jaro_winkler_at_thresholds",
            "threshold": 0.91,
        }
    )

    assert isinstance(exact, ExactMatch)
    assert isinstance(fuzzy, JaroWinklerAtThresholds)


def test_process_entity_resolution_runs_with_current_splink_runtime():
    csv_data = "id,name,city\n1,JMAN Group,London\n2,JMAN Group Ltd,London\n3,Google,Mountain View\n"
    settings = {
        "link_type": "dedupe_only",
        "unique_id_column_name": "id",
        "blocking_rules_to_generate_predictions": ["l.city = r.city"],
        "comparisons": [
            {"output_column_name": "name", "comparison_library_name": "exact_match"},
            # A second comparison on a column that is not blocked on. With only
            # the blocked column compared, there is no evidence left to score
            # and Splink emits invalid SQL.
            {"output_column_name": "city", "comparison_library_name": "exact_match"},
        ],
    }

    service = SplinkService()
    result = service.process_entity_resolution(
        data_csv=csv_data,
        settings=settings,
        threshold=0.5,
        primary_key_column="id",
    )

    assert result["status"] == "success", result.get("error")
    assert "execution_time_ms" in result
    # Three rows cannot train a model; that must be surfaced, not hidden.
    assert result["training"]["rows"] == 3
