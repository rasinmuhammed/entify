from pathlib import Path
import sys

from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.api import app  # noqa: E402
import backend.api as api_module  # noqa: E402


client = TestClient(app)


def test_health_check_reports_runtime_versions():
    response = client.get("/api/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] in {"healthy", "degraded"}
    assert "python_version" in body


def test_profile_dataset_returns_column_stats():
    csv_data = b"id,name,city\n1,Alice,London\n2,Bob,\n"

    response = client.post(
        "/api/profile",
        files={"file": ("sample.csv", csv_data, "text/csv")},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["row_count"] == 2
    column_names = {column["name"] for column in body["columns"]}
    assert {"id", "name", "city"} <= column_names


def test_resolve_endpoint_delegates_to_service(monkeypatch):
    captured = {}

    def fake_process_entity_resolution(**kwargs):
        captured.update(kwargs)
        return {
            "status": "success",
            "matches": [{"left_id": "1", "right_id": "2", "match_probability": 0.97}],
            "total_pairs": 1,
            "execution_time_ms": 12.5,
            "clusters": [{"cluster_id": "c_1", "size": 2}],
        }

    monkeypatch.setattr(
        api_module.splink_service,
        "process_entity_resolution",
        fake_process_entity_resolution,
    )

    response = client.post(
        "/api/resolve",
        json={
            "data": "aWQsbmFtZQoxLEFsaWNlCjIsQWxpY2UK",
            "settings": {
                "link_type": "dedupe_only",
                "unique_id_column_name": "id",
                "blocking_rules_to_generate_predictions": ["l.name = r.name"],
                "comparisons": [{"output_column_name": "name", "comparison_library_name": "exact_match"}],
            },
            "threshold": 0.8,
            "table_name": "input_data",
            "primary_key_column": "id",
            "semantic_blocking": [{"column": "city", "run_id": "run-1", "rule": "l.city = r.city"}],
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "success"
    assert body["total_pairs"] == 1
    assert captured["threshold"] == 0.8
    assert captured["primary_key_column"] == "id"
    assert captured["semantic_blocking"] == [{"column": "city", "run_id": "run-1", "rule": "l.city = r.city"}]


def test_blocking_suggestions_endpoint_returns_service_payload(monkeypatch):
    def fake_generate_suggestions(**kwargs):
        return {
            "suggestions": [
                {
                    "column": "city",
                    "run_id": "run-1",
                    "recommended_rule": 'l.semantic_block__city = r.semantic_block__city',
                }
            ]
        }

    monkeypatch.setattr(
        api_module.semantic_blocking_service,
        "generate_suggestions",
        fake_generate_suggestions,
    )

    response = client.post(
        "/api/blocking/suggestions",
        json={
            "data": "aWQsbmFtZSxjaXR5CjEsQWxpY2UsTG9uZG9uCg==",
            "columns": ["city"],
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["suggestions"][0]["column"] == "city"
