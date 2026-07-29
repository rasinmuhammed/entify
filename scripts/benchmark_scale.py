"""Measure how matching scales with row count.

The README states a rough ceiling for how much data the engine can handle.
This produces the numbers behind that claim instead of asserting it, and is
worth re-running after any change to blocking or the prediction path.

Usage:
    ./.venv/bin/python scripts/benchmark_scale.py
"""

import gc
import os
import resource
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from sample_data import generate
from services.splink_service import SplinkService


def jaro(column: str, threshold: float = 0.9) -> dict:
    return {
        "output_column_name": column,
        "comparison_levels": [
            {
                "sql_condition": f'"{column}_l" IS NULL OR "{column}_r" IS NULL',
                "label_for_charts": "Null",
                "is_null_level": True,
            },
            {"sql_condition": f'"{column}_l" = "{column}_r"', "label_for_charts": "Exact"},
            {
                "sql_condition": f'jaro_winkler_similarity("{column}_l", "{column}_r") >= {threshold}',
                "label_for_charts": "Similar",
            },
            {"sql_condition": "ELSE", "label_for_charts": "All other"},
        ],
    }


def exact(column: str) -> dict:
    return {
        "output_column_name": column,
        "comparison_levels": [
            {
                "sql_condition": f'"{column}_l" IS NULL OR "{column}_r" IS NULL',
                "label_for_charts": "Null",
                "is_null_level": True,
            },
            {"sql_condition": f'"{column}_l" = "{column}_r"', "label_for_charts": "Exact"},
            {"sql_condition": "ELSE", "label_for_charts": "All other"},
        ],
    }


SETTINGS = {
    "link_type": "dedupe_only",
    "unique_id_column_name": "customer_id",
    "blocking_rules_to_generate_predictions": [
        "l.last_name = r.last_name AND l.city = r.city",
        "l.email = r.email",
        "l.address = r.address",
    ],
    "comparisons": [
        jaro("first_name"),
        jaro("last_name"),
        jaro("email"),
        jaro("address"),
        jaro("phone", 0.85),
        exact("city"),
    ],
}


def peak_mb() -> float:
    """Peak resident set size. ru_maxrss is bytes on macOS, kilobytes on Linux."""
    rss = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    return rss / (1024 * 1024) if sys.platform == "darwin" else rss / 1024


def main() -> None:
    for n_entities in [1500, 5000, 20000, 60000, 150000]:
        gc.collect()
        df = generate(
            n_entities=n_entities, duplicate_rate=0.18, seed=42, include_ground_truth=True
        )
        rows = len(df)
        csv = df.drop(columns=["true_entity_id"]).to_csv(index=False)

        start = time.time()
        try:
            service = SplinkService()
            result = service.process_entity_resolution(
                data_csv=csv,
                settings=dict(SETTINGS),
                threshold=0.95,
                table_name="customers",
                primary_key_column="customer_id",
            )
            elapsed = time.time() - start
            status = result.get("status")
            pairs = len(result.get("predictions") or [])
            print(
                f"{rows:>8,} rows | {elapsed:7.1f}s | peak RSS {peak_mb():6.0f} MB "
                f"| {status} | {pairs:,} pairs above threshold",
                flush=True,
            )
            if status != "success":
                print("   error:", str(result.get("error"))[:300], flush=True)
                break
        except Exception as exc:
            print(
                f"{rows:>8,} rows | FAILED after {time.time() - start:.1f}s: "
                f"{type(exc).__name__}: {str(exc)[:300]}",
                flush=True,
            )
            break
        finally:
            del df, csv
            gc.collect()


if __name__ == "__main__":
    main()
