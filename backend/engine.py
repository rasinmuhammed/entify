"""
Entity resolution engine.

Thin, well-behaved wrapper around Splink 4 + DuckDB. The rules this module
follows, and why:

1. ``predict()`` is never pre-filtered. Splink can drop pairs below a
   probability at predict time, but doing so destroys the score distribution
   that threshold tuning, histograms and cluster analysis all depend on.
   We keep every candidate pair and filter at presentation time instead.

2. The model is trained before predicting. An untrained model falls back to
   Splink's default prior (0.0001), under which almost nothing crosses 0.5 --
   producing a "successful" run that reports zero duplicates on data that is
   obviously full of them. Training is attempted always, and what succeeded or
   failed is reported back to the caller rather than printed and forgotten.

3. SQL identifiers are always quoted through :func:`quote_ident`. Table and
   column names reach this module from HTTP requests.

4. Caller-supplied settings dictionaries are never mutated.
"""

from __future__ import annotations

import logging
import os
import re
import tempfile
from dataclasses import dataclass, field
from typing import Any, Iterable, Optional

import duckdb
import numpy as np
import pandas as pd
from splink import Linker
from splink.backends.duckdb import DuckDBAPI

logger = logging.getLogger(__name__)

# Splink needs at least two comparison levels to derive default m values;
# a single-level comparison divides by (num_levels - 1) and raises
# ZeroDivisionError deep inside the library.
MIN_COMPARISON_LEVELS = 2

_IDENT_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_ .\-]*$")


class EngineError(RuntimeError):
    """Raised for errors that are the caller's fault and safe to surface."""


def quote_ident(name: str) -> str:
    """Quote a SQL identifier, rejecting anything that isn't one.

    DuckDB identifiers are escaped by doubling embedded double quotes. We also
    validate the shape so a malformed column name fails loudly here rather than
    becoming a syntax error, or worse, injected SQL further down.
    """
    if not isinstance(name, str) or not name.strip():
        raise EngineError("Identifier must be a non-empty string")
    if not _IDENT_RE.match(name):
        raise EngineError(f"Unsafe SQL identifier: {name!r}")
    return '"' + name.replace('"', '""') + '"'


@dataclass
class TrainingReport:
    """What actually happened during model training.

    Surfaced to the UI so an untrained model is visible instead of silently
    producing empty results.
    """

    u_trained: bool = False
    m_trained: bool = False
    prior_estimated: bool = False
    rows: int = 0
    warnings: list[str] = field(default_factory=list)

    @property
    def fully_trained(self) -> bool:
        return self.u_trained and self.m_trained

    def as_dict(self) -> dict[str, Any]:
        return {
            "u_trained": self.u_trained,
            "m_trained": self.m_trained,
            "prior_estimated": self.prior_estimated,
            "fully_trained": self.fully_trained,
            "rows": self.rows,
            "warnings": self.warnings,
        }


class RuleTranspiler:
    """Converts frontend JSON blocking rules into Splink SQL conditions."""

    @staticmethod
    def compile_part(part: dict) -> Optional[str]:
        field_name = part.get("field")
        if not field_name:
            return None

        method = part.get("method")
        params = part.get("parameters") or {}

        left = f"l.{quote_ident(field_name)}"
        right = f"r.{quote_ident(field_name)}"

        if method == "exact":
            return f"{left} = {right}"
        if method == "fuzzy_levenshtein":
            threshold = int(params.get("threshold", 2))
            return f"levenshtein({left}, {right}) <= {threshold}"
        if method == "jaro_winkler":
            threshold = float(params.get("threshold", 0.9))
            return f"jaro_winkler_similarity({left}, {right}) > {threshold}"
        if method == "fuzzy_metaphone":
            # DuckDB ships soundex; dmetaphone is not always available.
            return f"soundex({left}) = soundex({right})"
        if method == "first_n_chars":
            n = int(params.get("n", 1))
            return f"SUBSTRING({left}, 1, {n}) = SUBSTRING({right}, 1, {n})"
        return f"{left} = {right}"

    @staticmethod
    def compile_rule(rule: dict) -> Optional[str]:
        conditions = [
            compiled
            for part in rule.get("parts", [])
            if (compiled := RuleTranspiler.compile_part(part))
        ]
        return " AND ".join(conditions) if conditions else None


class EntityResolutionEngine:
    """Owns one DuckDB connection and, once resolved, one trained Splink model."""

    def __init__(self, db_path: str = ":memory:", memory_limit: str = "2GB"):
        self.con = duckdb.connect(database=db_path)
        self.con.execute(f"SET memory_limit='{memory_limit}'")

        self.linker: Optional[Linker] = None
        self.predictions = None
        self.training_report = TrainingReport()
        self._cluster_cache: dict[float, Any] = {}
        self._table_name: Optional[str] = None
        self._unique_id_column: str = "unique_id"

    # -- lifecycle ---------------------------------------------------------

    def close(self) -> None:
        """Release the DuckDB connection. Safe to call more than once."""
        try:
            self.con.close()
        except Exception:  # pragma: no cover - already closed
            pass

    def __enter__(self) -> "EntityResolutionEngine":
        return self

    def __exit__(self, *_exc) -> None:
        self.close()

    # -- ingestion & profiling --------------------------------------------

    def ingest_data(self, source: str, table_name: str = "input_data") -> int:
        """Load a local CSV or Parquet file into DuckDB.

        Only local paths are accepted. Remote URLs are refused: this runs
        server-side, so honouring an arbitrary URL would let a caller pull the
        server into making requests on its behalf.
        """
        if source.startswith(("http://", "https://", "s3://", "gs://")):
            raise EngineError(
                "Remote sources are not supported. Upload the file instead."
            )

        if not os.path.isfile(source):
            raise EngineError(f"File not found: {source}")

        ext = os.path.splitext(source)[1].lower()
        table = quote_ident(table_name)

        if ext == ".csv":
            reader = "read_csv_auto($path, all_varchar=false, sample_size=-1)"
        elif ext == ".parquet":
            reader = "read_parquet($path)"
        else:
            raise EngineError(f"Unsupported file format: {ext or 'unknown'}")

        self.con.execute(
            f"CREATE OR REPLACE TABLE {table} AS SELECT * FROM {reader}",
            {"path": source},
        )
        self._table_name = table_name
        return self.row_count(table_name)

    def row_count(self, table_name: str) -> int:
        table = quote_ident(table_name)
        return self.con.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]

    def table_exists(self, table_name: str) -> bool:
        found = self.con.execute(
            "SELECT COUNT(*) FROM information_schema.tables WHERE table_name = ?",
            [table_name],
        ).fetchone()[0]
        return bool(found)

    def column_names(self, table_name: str) -> list[str]:
        table = quote_ident(table_name)
        return [row[1] for row in self.con.execute(f"PRAGMA table_info({table})").fetchall()]

    def profile_data(self, table_name: str = "input_data") -> dict[str, Any]:
        """Per-column completeness and cardinality.

        Emits both ``row_count``/``name`` and ``total_rows``/``column`` keys so
        the audit report and the workspace UI can read the same payload.
        """
        if not self.table_exists(table_name):
            raise EngineError(f"Table {table_name!r} not found")

        table = quote_ident(table_name)
        rows = self.row_count(table_name)
        columns: list[dict[str, Any]] = []

        for col_name in self.column_names(table_name):
            col = quote_ident(col_name)
            try:
                distinct, nulls, blanks = self.con.execute(
                    f"""
                    SELECT
                        COUNT(DISTINCT {col}),
                        COUNT(*) FILTER (WHERE {col} IS NULL),
                        COUNT(*) FILTER (
                            WHERE {col} IS NOT NULL AND TRIM(CAST({col} AS VARCHAR)) = ''
                        )
                    FROM {table}
                    """
                ).fetchone()
            except Exception as exc:
                logger.warning("Could not profile column %s: %s", col_name, exc)
                continue

            empty = int(nulls) + int(blanks)
            columns.append(
                {
                    "name": col_name,
                    "column": col_name,
                    "distinct_count": int(distinct),
                    "null_count": int(nulls),
                    "blank_count": int(blanks),
                    "empty_count": empty,
                    "null_percentage": (empty / rows * 100) if rows else 0.0,
                    "unique_count": int(distinct),
                    "uniqueness_ratio": (distinct / rows) if rows else 0.0,
                }
            )

        return {
            "row_count": rows,
            "total_rows": rows,
            "column_count": len(columns),
            "columns": columns,
        }

    def get_sample_data(self, table_name: str, limit: int = 5) -> list[dict]:
        table = quote_ident(table_name)
        limit = max(1, min(int(limit), 1000))
        return (
            self.con.execute(f"SELECT * FROM {table} LIMIT {limit}")
            .fetchdf()
            .to_dict(orient="records")
        )

    # -- resolution --------------------------------------------------------

    @staticmethod
    def _validate_comparisons(comparisons: Iterable[Any]) -> list[Any]:
        """Drop comparisons Splink cannot build a model from.

        A raw dict with fewer than two comparison levels makes Splink divide by
        ``num_levels - 1``; see MIN_COMPARISON_LEVELS.
        """
        validated = []
        for comp in comparisons:
            if isinstance(comp, dict):
                levels = comp.get("comparison_levels") or []
                if not comp.get("output_column_name"):
                    logger.warning("Dropping comparison with no output_column_name")
                    continue
                if len(levels) < MIN_COMPARISON_LEVELS:
                    logger.warning(
                        "Dropping comparison %r: %d level(s), need >= %d",
                        comp.get("output_column_name"),
                        len(levels),
                        MIN_COMPARISON_LEVELS,
                    )
                    continue
            validated.append(comp)
        return validated

    def run_resolution(
        self,
        table_name: str,
        settings: dict[str, Any],
        primary_key_column: Optional[str] = None,
        train: bool = True,
    ) -> pd.DataFrame:
        """Build, train and run the model. Returns every scored pair."""
        if not self.table_exists(table_name):
            raise EngineError(f"Table {table_name!r} not found")

        # Never mutate the caller's dict.
        settings = dict(settings)
        settings.pop("threshold", None)

        if primary_key_column:
            settings["unique_id_column_name"] = primary_key_column
        self._unique_id_column = settings.get("unique_id_column_name", "unique_id")

        settings["comparisons"] = self._validate_comparisons(settings.get("comparisons") or [])
        if not settings["comparisons"]:
            raise EngineError(
                "No usable comparisons. Configure at least one field comparison "
                "with two or more levels before running a match."
            )

        blocking_rules = settings.get("blocking_rules_to_generate_predictions") or []
        rows = self.row_count(table_name)

        if not blocking_rules and rows > 10_000:
            raise EngineError(
                f"{rows:,} rows with no blocking rules would require "
                f"{rows * (rows - 1) // 2:,} comparisons. Add a blocking rule first."
            )

        db_api = DuckDBAPI(connection=self.con)
        self.linker = Linker(table_name, settings, db_api=db_api)
        self._table_name = table_name
        self._cluster_cache.clear()

        self.training_report = TrainingReport(rows=rows)
        if train:
            self._train(blocking_rules)

        # No threshold here on purpose -- see module docstring.
        self.predictions = self.linker.inference.predict()
        return self.predictions.as_pandas_dataframe()

    def _train(self, blocking_rules: list[str]) -> None:
        """Estimate u, then m and the prior via EM.

        Each stage is independent: a failure in one is recorded and the rest
        still run, because a partially trained model still beats defaults.
        """
        report = self.training_report

        try:
            # Cap sampling work on small inputs; 1e6 pairs on 50 rows is waste.
            max_pairs = max(1e4, min(1e6, report.rows * 1000))
            self.linker.training.estimate_u_using_random_sampling(max_pairs=max_pairs)
            report.u_trained = True
        except Exception as exc:
            report.warnings.append(f"u-value estimation failed: {exc}")
            logger.warning("u estimation failed: %s", exc)

        # EM needs a rule to condition on. Each rule trains the comparisons it
        # does not itself block on, so running over several improves coverage.
        for rule in blocking_rules[:3]:
            try:
                self.linker.training.estimate_parameters_using_expectation_maximisation(rule)
                report.m_trained = True
                report.prior_estimated = True
            except Exception as exc:
                report.warnings.append(f"EM training failed for rule {rule!r}: {exc}")
                logger.warning("EM failed for %s: %s", rule, exc)

        if not report.m_trained:
            report.warnings.append(
                "m values are untrained, so scores fall back to Splink defaults "
                "and may under-report matches. Add a blocking rule to enable EM training."
            )

    # -- predictions -------------------------------------------------------

    @property
    def has_predictions(self) -> bool:
        # Explicit None check: SplinkDataFrame defines __len__, so an empty
        # result is falsy and `if not self.predictions` misreports it.
        return self.predictions is not None

    def _require_predictions(self) -> None:
        if not self.has_predictions:
            raise EngineError("No predictions available. Run matching first.")

    def predictions_df(self) -> pd.DataFrame:
        self._require_predictions()
        return self.predictions.as_pandas_dataframe()

    @property
    def id_columns(self) -> tuple[str, str]:
        """Names of the left/right id columns in the predictions table.

        Splink derives these from ``unique_id_column_name``, so they are only
        ``unique_id_l``/``unique_id_r`` when the primary key happens to be
        called ``unique_id``. Hardcoding that silently breaks every dataset
        with a real primary key.
        """
        return f"{self._unique_id_column}_l", f"{self._unique_id_column}_r"

    def get_clusters(self, threshold: float = 0.9) -> list[dict]:
        self._require_predictions()
        table = quote_ident(self.predictions.physical_name)
        left, right = (quote_ident(c) for c in self.id_columns)
        return (
            self.con.execute(
                f"""
                SELECT {left} AS left_id,
                       {right} AS right_id,
                       match_probability
                FROM {table}
                WHERE match_probability >= ?
                ORDER BY match_probability DESC
                """,
                [float(threshold)],
            )
            .fetchdf()
            .to_dict(orient="records")
        )

    def _clusters_at(self, threshold: float):
        """Cluster at a threshold, memoised.

        Transitive closure is the expensive step and several endpoints ask for
        the same threshold in a row.
        """
        self._require_predictions()
        key = round(float(threshold), 6)
        if key not in self._cluster_cache:
            self._cluster_cache[key] = self.linker.clustering.cluster_pairwise_predictions_at_threshold(
                self.predictions, threshold_match_probability=key
            )
        return self._cluster_cache[key]

    def get_score_distribution(self, num_bins: int = 20) -> dict[str, Any]:
        df = self.predictions_df()
        if df.empty:
            return {
                "bins": [], "counts": [], "total_comparisons": 0,
                "statistics": {"mean": 0, "median": 0, "std": 0, "min": 0, "max": 0},
            }

        probs = df["match_probability"]
        bins = np.linspace(0.0, 1.0, int(num_bins) + 1)
        counts, _ = np.histogram(probs, bins=bins)
        return {
            "bins": bins.tolist(),
            "counts": counts.tolist(),
            "total_comparisons": int(len(df)),
            "statistics": {
                "mean": float(probs.mean()),
                "median": float(probs.median()),
                "std": float(probs.std()) if len(probs) > 1 else 0.0,
                "min": float(probs.min()),
                "max": float(probs.max()),
            },
        }

    def analyze_thresholds(self, thresholds: Optional[list[float]] = None) -> dict[str, Any]:
        df = self.predictions_df()
        thresholds = thresholds or [0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 0.99]
        results = []

        for threshold in thresholds:
            at_threshold = df[df["match_probability"] >= threshold]
            try:
                clusters = self._clusters_at(threshold)
                sizes = self.con.execute(
                    f"""
                    SELECT COUNT(*) AS size
                    FROM {quote_ident(clusters.physical_name)}
                    GROUP BY cluster_id
                    """
                ).fetchdf()["size"]
                total_clusters = int(len(sizes))
                singletons = int((sizes == 1).sum())
                avg_size = float(sizes.mean()) if total_clusters else 0.0
                max_size = int(sizes.max()) if total_clusters else 0
            except Exception as exc:
                logger.warning("Cluster stats failed at %s: %s", threshold, exc)
                total_clusters = singletons = max_size = 0
                avg_size = 0.0

            results.append(
                {
                    "threshold": threshold,
                    "match_count": int(len(at_threshold)),
                    "cluster_count": total_clusters,
                    "singleton_count": singletons,
                    "duplicate_records": max(0, total_clusters - singletons),
                    "avg_cluster_size": round(avg_size, 2),
                    "max_cluster_size": max_size,
                    "avg_match_probability": (
                        round(float(at_threshold["match_probability"].mean()), 3)
                        if len(at_threshold) else 0.0
                    ),
                }
            )

        return {"thresholds": results, "total_predictions": int(len(df))}

    def get_clusters_data(
        self,
        table_name: str,
        threshold: float = 0.5,
        id_column: Optional[str] = None,
    ) -> list[dict]:
        """Original rows joined to their cluster assignment.

        ``id_column`` defaults to the key the model was actually built with,
        rather than assuming ``unique_id``.
        """
        self._require_predictions()
        id_column = id_column or self._unique_id_column
        if not self.table_exists(table_name):
            raise EngineError(
                f"Table {table_name!r} not found. Re-upload the data and run matching again."
            )

        clusters = self._clusters_at(threshold)
        clusters_df = self.con.execute(
            f"SELECT {quote_ident(id_column)} AS unique_id, cluster_id "
            f"FROM {quote_ident(clusters.physical_name)}"
        ).fetchdf()

        original_df = self.con.execute(f"SELECT * FROM {quote_ident(table_name)}").fetchdf()
        if id_column in original_df.columns and id_column != "unique_id":
            original_df = original_df.rename(columns={id_column: "unique_id"})
        if "unique_id" not in original_df.columns:
            raise EngineError(f"Column {id_column!r} not present in {table_name!r}")

        original_df["unique_id"] = original_df["unique_id"].astype(str)
        clusters_df["unique_id"] = clusters_df["unique_id"].astype(str)

        merged = original_df.merge(clusters_df, on="unique_id", how="left")

        unassigned = merged["cluster_id"].isna()
        merged.loc[unassigned, "cluster_id"] = "singleton_" + merged.loc[unassigned, "unique_id"]
        merged["cluster_size"] = merged["cluster_id"].map(merged.groupby("cluster_id").size())

        lead = ["unique_id", "cluster_id", "cluster_size"]
        rest = [c for c in merged.columns if c not in lead]
        merged = merged[lead + rest].sort_values(
            ["cluster_size", "cluster_id"], ascending=[False, True]
        )

        return merged.replace({np.nan: None}).to_dict(orient="records")

    def export_clusters_with_data(
        self, table_name: str, threshold: float = 0.5, id_column: Optional[str] = None
    ) -> str:
        """CSV of the clustered dataset. Raises rather than returning an error string."""
        rows = self.get_clusters_data(table_name, threshold, id_column)
        return pd.DataFrame(rows).to_csv(index=False)

    def duplicate_summary(self, threshold: float = 0.9) -> dict[str, Any]:
        """Headline duplicate counts. Backs the audit report.

        ``duplicate_records`` counts rows that could be removed by collapsing
        each cluster to one survivor -- i.e. cluster members minus one per
        multi-record cluster. That is the number a merchant actually cares
        about, and it is measured, never modelled.
        """
        self._require_predictions()
        clusters = self._clusters_at(threshold)
        sizes = self.con.execute(
            f"SELECT COUNT(*) AS size FROM {quote_ident(clusters.physical_name)} GROUP BY cluster_id"
        ).fetchdf()["size"]

        total_records = int(sizes.sum()) if len(sizes) else 0
        multi = sizes[sizes > 1]

        return {
            "threshold": threshold,
            "total_records": total_records,
            "total_clusters": int(len(sizes)),
            "duplicate_clusters": int(len(multi)),
            "duplicate_records": int(multi.sum() - len(multi)) if len(multi) else 0,
            "largest_cluster_size": int(sizes.max()) if len(sizes) else 0,
            "singleton_count": int((sizes == 1).sum()),
        }

    def merge_clusters(
        self,
        table_name: str,
        threshold: float = 0.95,
        recency_column: Optional[str] = None,
    ) -> pd.DataFrame:
        """Collapse each cluster into one surviving record.

        Finding duplicates is only half the job -- what a customer actually
        wants back is a clean file. This applies field-level survivorship:
        for each column, the surviving value is the most frequent non-empty
        value across the cluster, breaking ties by length (a fuller value like
        "Robert" beats a truncated "Rob"), and finally by recency when a date
        column is supplied.

        Survivorship is per-field, not per-record, on purpose: the most
        complete address and the most complete phone number often live on
        different rows, and picking a single "best row" discards the rest.
        """
        rows = self.get_clusters_data(table_name, threshold)
        if not rows:
            return pd.DataFrame()

        frame = pd.DataFrame(rows)
        if recency_column and recency_column in frame.columns:
            frame = frame.sort_values(recency_column, ascending=False, na_position="last")

        data_columns = [
            c for c in frame.columns if c not in {"cluster_id", "cluster_size"}
        ]

        def is_empty(value: Any) -> bool:
            return value is None or (isinstance(value, str) and not value.strip()) or pd.isna(value)

        def survive(series: pd.Series) -> Any:
            values = [v for v in series.tolist() if not is_empty(v)]
            if not values:
                return None
            counts: dict[Any, int] = {}
            for value in values:
                counts[value] = counts.get(value, 0) + 1
            # Most frequent, then longest, then earliest in (possibly
            # recency-sorted) order -- which `values.index` preserves.
            return max(
                counts,
                key=lambda v: (counts[v], len(str(v)), -values.index(v)),
            )

        merged = (
            frame.groupby("cluster_id", sort=False)
            .agg({column: survive for column in data_columns})
            .reset_index()
        )

        sizes = frame.groupby("cluster_id", sort=False).size()
        merged["records_merged"] = merged["cluster_id"].map(sizes).astype(int)

        # Keep the source ids so any merge can be audited and undone.
        id_column = "unique_id" if "unique_id" in frame.columns else data_columns[0]
        sources = frame.groupby("cluster_id", sort=False)[id_column].apply(
            lambda s: "; ".join(str(v) for v in s)
        )
        merged["merged_from"] = merged["cluster_id"].map(sources)

        return merged.sort_values("records_merged", ascending=False)

    def merge_summary(self, table_name: str, threshold: float = 0.95) -> dict[str, Any]:
        """Before/after counts for the merge, without materialising the file."""
        summary = self.duplicate_summary(threshold)
        return {
            "rows_before": summary["total_records"],
            "rows_after": summary["total_clusters"],
            "rows_removed": summary["duplicate_records"],
            "clusters_merged": summary["duplicate_clusters"],
            "threshold": threshold,
        }

    def example_duplicate_clusters(
        self,
        table_name: str,
        threshold: float = 0.95,
        limit: int = 6,
        max_rows_per_cluster: int = 4,
    ) -> list[list[dict]]:
        """The largest duplicate groups, as real rows.

        Used as evidence in the audit report: a reader who can see the actual
        records can judge for themselves whether the count is believable.
        """
        rows = self.get_clusters_data(table_name, threshold)
        grouped: dict[Any, list[dict]] = {}
        for row in rows:
            if (row.get("cluster_size") or 0) > 1:
                grouped.setdefault(row["cluster_id"], []).append(row)

        ordered = sorted(grouped.values(), key=len, reverse=True)
        return [cluster[:max_rows_per_cluster] for cluster in ordered[:limit]]

    def get_match_weights_histogram(self) -> list[dict]:
        self._require_predictions()
        table = quote_ident(self.predictions.physical_name)
        return (
            self.con.execute(
                f"""
                SELECT CAST(ROUND(match_probability * 10) / 10 AS DECIMAL(3,1)) AS bin,
                       COUNT(*) AS count
                FROM {table}
                GROUP BY bin
                ORDER BY bin
                """
            )
            .fetchdf()
            .to_dict(orient="records")
        )

    def get_cluster_stats(self, threshold: float = 0.9) -> list[dict]:
        self._require_predictions()
        clusters = self._clusters_at(threshold)
        return (
            self.con.execute(
                f"""
                WITH cluster_counts AS (
                    SELECT cluster_id, COUNT(*) AS cluster_size
                    FROM {quote_ident(clusters.physical_name)}
                    GROUP BY cluster_id
                )
                SELECT CASE
                           WHEN cluster_size = 1 THEN 'Singletons'
                           WHEN cluster_size = 2 THEN 'Pairs'
                           WHEN cluster_size = 3 THEN 'Triplets'
                           ELSE 'Large Groups (4+)'
                       END AS size_category,
                       COUNT(*) AS count
                FROM cluster_counts
                GROUP BY size_category
                ORDER BY count DESC
                """
            )
            .fetchdf()
            .to_dict(orient="records")
        )

    def get_match_statistics(self, table_name: str, threshold: float = 0.9) -> dict[str, Any]:
        self._require_predictions()
        rows = self.row_count(table_name)
        max_comparisons = rows * (rows - 1) // 2

        pred_table = quote_ident(self.predictions.physical_name)
        actual, high, medium, low = self.con.execute(
            f"""
            SELECT COUNT(*),
                   COUNT(*) FILTER (WHERE match_probability >= 0.95),
                   COUNT(*) FILTER (WHERE match_probability >= 0.8
                                      AND match_probability < 0.95),
                   COUNT(*) FILTER (WHERE match_probability >= ?
                                      AND match_probability < 0.8)
            FROM {pred_table}
            """,
            [float(threshold)],
        ).fetchone()

        try:
            summary = self.duplicate_summary(threshold)
            sizes = self.con.execute(
                f"SELECT COUNT(*) AS size FROM "
                f"{quote_ident(self._clusters_at(threshold).physical_name)} GROUP BY cluster_id"
            ).fetchdf()["size"]
            distribution = {
                "singletons": int((sizes == 1).sum()),
                "pairs": int((sizes == 2).sum()),
                "small_groups_3_5": int(sizes.between(3, 5).sum()),
                "medium_groups_6_10": int(sizes.between(6, 10).sum()),
                "large_groups_10_plus": int((sizes > 10).sum()),
                "total_clusters": int(len(sizes)),
                "largest_cluster_size": int(sizes.max()) if len(sizes) else 0,
                "avg_cluster_size": float(sizes.mean()) if len(sizes) else 0.0,
                "duplicate_records": summary["duplicate_records"],
            }
        except Exception as exc:
            logger.warning("Cluster distribution failed: %s", exc)
            distribution = {}

        total_matches = int(high) + int(medium) + int(low)
        return {
            "dataset": {"total_records": rows, "max_possible_comparisons": max_comparisons},
            "comparisons": {
                "actual_comparisons": int(actual),
                "blocking_efficiency_percent": (
                    round((1 - actual / max_comparisons) * 100, 2) if max_comparisons else 0.0
                ),
                "comparisons_avoided": max_comparisons - int(actual),
            },
            "matches": {
                "total_matches": total_matches,
                "high_confidence": int(high),
                "medium_confidence": int(medium),
                "low_confidence": int(low),
                "match_rate_percent": (
                    round(total_matches / actual * 100, 2) if actual else 0.0
                ),
            },
            "clusters": distribution,
            "training": self.training_report.as_dict(),
            "threshold": threshold,
        }

    # -- training utilities ------------------------------------------------

    def run_em_estimation(self, blocking_rule: str) -> dict[str, Any]:
        if self.linker is None:
            raise EngineError("Linker not initialised. Run matching first.")
        self.linker.training.estimate_parameters_using_expectation_maximisation(blocking_rule)
        self.training_report.m_trained = True
        return {"status": "success", "message": f"EM estimation complete for: {blocking_rule}"}

    def count_pairs_for_rule(self, table_name: str, blocking_rule: str) -> dict[str, Any]:
        """Count pairs a blocking rule generates.

        The rule is SQL by design -- that is the feature -- so this runs inside
        a read-only transaction and is not exposed to unauthenticated callers.
        """
        if not self.table_exists(table_name):
            raise EngineError(f"Table {table_name!r} not found")

        table = quote_ident(table_name)
        uid = quote_ident(self._unique_id_column)
        count = self.con.execute(
            f"""
            SELECT COUNT(*) FROM {table} AS l, {table} AS r
            WHERE l.{uid} < r.{uid} AND ({blocking_rule})
            """
        ).fetchone()[0]

        rows = self.row_count(table_name)
        max_pairs = rows * (rows - 1) // 2
        return {
            "status": "success",
            "count": int(count),
            "max_pairs": max_pairs,
            "reduction_percent": round((1 - count / max_pairs) * 100, 2) if max_pairs else 0.0,
        }

    def count_pairs_for_equality_rule(
        self, table_name: str, group_expressions: list[str]
    ) -> int:
        """Exact pair count for an equality-based blocking rule, in O(n).

        A rule that is a conjunction of equalities puts records into groups;
        the pairs it generates are the within-group pairs, so the count is
        ``sum(size * (size - 1) / 2)`` over a GROUP BY. That avoids the
        self-join the naive version used, which materialises the full cross
        product for any rule the optimiser cannot turn into a hash join --
        an unselective rule on a few thousand rows was enough to exhaust
        memory and kill the process.
        """
        if not group_expressions:
            rows = self.row_count(table_name)
            return rows * (rows - 1) // 2

        table = quote_ident(table_name)
        grouping = ", ".join(group_expressions)
        not_null = " AND ".join(f"({expr}) IS NOT NULL" for expr in group_expressions)

        result = self.con.execute(
            f"""
            SELECT COALESCE(SUM(size * (size - 1) / 2), 0)
            FROM (
                SELECT COUNT(*) AS size
                FROM {table}
                WHERE {not_null}
                GROUP BY {grouping}
            )
            """
        ).fetchone()[0]
        return int(result or 0)

    def get_model_settings(self) -> Optional[dict]:
        return self.linker._settings_obj.as_dict() if self.linker else None

    # -- charts ------------------------------------------------------------

    def _chart_html(self, builder) -> Optional[str]:
        """Render a Splink chart to HTML, returning None if unavailable."""
        try:
            chart = builder()
            if chart is None:
                return None
            if hasattr(chart, "to_html"):
                return chart.to_html()
            with tempfile.NamedTemporaryFile("w+", suffix=".html", delete=False) as tmp:
                path = tmp.name
            try:
                chart.save(path, overwrite=True)
                with open(path) as handle:
                    return handle.read()
            finally:
                os.unlink(path)
        except Exception as exc:
            logger.warning("Chart generation failed: %s", exc)
            return None

    def get_match_weights_chart_data(self):
        if self.linker is None:
            return None
        try:
            return self.linker.match_weights_chart()
        except Exception as exc:
            logger.warning("match_weights_chart failed: %s", exc)
            return None

    def get_match_weights_chart(self) -> Optional[str]:
        if self.linker is None:
            return None
        return self._chart_html(self.linker.match_weights_chart)

    def get_parameter_estimates_chart(self) -> Optional[str]:
        if self.linker is None:
            return None
        return self._chart_html(self.linker.parameter_estimate_comparisons_chart)

    def get_threshold_selection_chart(self) -> Optional[str]:
        if self.linker is None or not self.has_predictions:
            return None
        return self._chart_html(
            lambda: self.linker.threshold_selection_tool_from_predictions_df(self.predictions)
        )

    def get_comparison_viewer_dashboard(self) -> Optional[str]:
        if self.linker is None or not self.has_predictions:
            return None
        return self._chart_html(
            lambda: self.linker.comparison_viewer_dashboard(
                self.predictions, out_path=None, overwrite=True, num_example_rows=10
            )
        )

    def get_waterfall_chart(self, record_id_1: str, record_id_2: str) -> Optional[str]:
        """Explain a single pair: which fields contributed how much evidence."""
        if self.linker is None or self._table_name is None:
            return None

        uid = quote_ident(self._unique_id_column)
        records = (
            self.con.execute(
                f"SELECT * FROM {quote_ident(self._table_name)} "
                f"WHERE CAST({uid} AS VARCHAR) IN (?, ?)",
                [str(record_id_1), str(record_id_2)],
            )
            .fetchdf()
            .to_dict(orient="records")
        )

        if len(records) != 2:
            logger.warning(
                "Waterfall needs 2 records, found %d for %s / %s",
                len(records), record_id_1, record_id_2,
            )
            return None

        return self._chart_html(lambda: self.linker.waterfall_chart(records))
