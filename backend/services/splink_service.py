"""
Service layer for Splink entity resolution.

Owns request/response schemas and the translation from the frontend's JSON
comparison config into real Splink comparison objects. The API layer stays free
of Splink specifics; the engine stays free of HTTP specifics.
"""

from __future__ import annotations

import logging
import os
import re
import tempfile
import time
from typing import Any, Optional

from pydantic import BaseModel, Field

try:
    from engine import EntityResolutionEngine, EngineError, RuleTranspiler, quote_ident
except ImportError:  # running as a package
    from backend.engine import EntityResolutionEngine, EngineError, RuleTranspiler, quote_ident

logger = logging.getLogger(__name__)

# Column names referenced as l.foo / r.foo inside a blocking rule.
_RULE_COLUMN_RE = re.compile(r'[lr]\.(?:"([^"]+)"|([a-zA-Z_][a-zA-Z0-9_]*))')


class SemanticBlockingConfig(BaseModel):
    column: str
    run_id: str
    rule: str


class SplinkSettings(BaseModel):
    """Splink-compatible settings sent by the workspace UI."""

    link_type: str = Field(default="dedupe_only")
    unique_id_column_name: str = Field(default="unique_id")
    blocking_rules_to_generate_predictions: list[str] = Field(default_factory=list)
    comparisons: list[dict[str, Any]] = Field(default_factory=list)
    probability_two_random_records_match: Optional[float] = Field(
        default=None,
        description="Prior. Left unset, it is estimated during EM training.",
    )


class EntityResolutionRequest(BaseModel):
    data: str = Field(..., description="Base64-encoded CSV data")
    settings: SplinkSettings
    threshold: float = Field(default=0.5, ge=0.0, le=1.0)
    table_name: Optional[str] = Field(default="input_data")
    primary_key_column: Optional[str] = None
    semantic_blocking: list[SemanticBlockingConfig] = Field(default_factory=list)


class TrainingInfo(BaseModel):
    u_trained: bool = False
    m_trained: bool = False
    prior_estimated: bool = False
    fully_trained: bool = False
    rows: int = 0
    warnings: list[str] = Field(default_factory=list)


class EntityResolutionResponse(BaseModel):
    status: str
    matches: list[dict[str, Any]] = Field(default_factory=list)
    total_pairs: int = 0
    total_scored_pairs: int = 0
    execution_time_ms: float = 0.0
    clusters: Optional[list[dict[str, Any]]] = None
    cluster_lookup: Optional[dict[str, str]] = None
    total_clusters: Optional[int] = None
    duplicate_records: Optional[int] = None
    training: Optional[TrainingInfo] = None
    warnings: list[str] = Field(default_factory=list)
    error: Optional[str] = None


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def build_comparison(comp: dict) -> Any:
    """Translate one frontend comparison config into a Splink comparison.

    Always returns a real ComparisonCreator. Returning a raw dict here is what
    produced the ZeroDivisionError in Splink: a dict with fewer than two
    comparison levels makes the library divide by ``num_levels - 1``.
    """
    from splink.comparison_library import (
        ExactMatch,
        JaccardAtThresholds,
        JaroWinklerAtThresholds,
        LevenshteinAtThresholds,
    )

    column = comp.get("output_column_name")
    if not column:
        raise EngineError("Comparison is missing 'output_column_name'")

    method = comp.get("comparison_library_name")
    raw_threshold = comp.get("threshold")
    threshold = float(raw_threshold) if raw_threshold is not None else None

    if method == "exact_match":
        return ExactMatch(column)

    if method == "jaro_winkler_at_thresholds":
        if threshold is None:
            levels = [0.9, 0.8]
        else:
            primary = _clamp(threshold, 0.5, 0.99)
            levels = sorted({primary, _clamp(primary - 0.1, 0.5, 0.99)}, reverse=True)
        return JaroWinklerAtThresholds(column, levels)

    if method == "jaccard_at_thresholds":
        if threshold is None:
            levels = [0.9, 0.7]
        else:
            primary = _clamp(threshold, 0.4, 0.99)
            levels = sorted({primary, _clamp(primary - 0.2, 0.4, 0.99)}, reverse=True)
        return JaccardAtThresholds(column, levels)

    if method == "levenshtein_at_thresholds":
        # Levenshtein takes edit distances, not similarities. A value below 1
        # is a similarity the UI sent by mistake; fall back to sane distances.
        if threshold is None or threshold < 1:
            distances = [1, 2]
        else:
            primary = int(threshold)
            distances = sorted({primary, primary + 1})
        return LevenshteinAtThresholds(column, distances)

    # Legacy configs: infer the method from the generated SQL.
    for level in comp.get("comparison_levels") or []:
        sql = (level.get("sql_condition") or "").lower()
        if "jaro_winkler" in sql:
            return JaroWinklerAtThresholds(column, [0.9, 0.7])
        if "jaccard" in sql:
            return JaccardAtThresholds(column, [0.9, 0.7])
        if "levenshtein" in sql:
            return LevenshteinAtThresholds(column, [1, 2])

    return ExactMatch(column)


class SplinkService:
    """Holds the engine for the most recent resolution run.

    Single-engine state is deliberate for a single-user local workspace, but it
    means concurrent runs would clobber each other. Multi-tenant deployment
    needs a keyed engine registry; see README.
    """

    def __init__(self) -> None:
        self.engine: Optional[EntityResolutionEngine] = None

    def _reset_engine(self) -> EntityResolutionEngine:
        if self.engine is not None:
            self.engine.close()
        self.engine = EntityResolutionEngine()
        return self.engine

    def process_entity_resolution(
        self,
        data_csv: str,
        settings: dict[str, Any],
        threshold: float = 0.5,
        table_name: str = "input_data",
        primary_key_column: Optional[str] = None,
        semantic_blocking: Optional[list[dict[str, Any]]] = None,
    ) -> dict[str, Any]:
        start = time.time()
        settings = dict(settings)
        warnings: list[str] = []

        try:
            engine = self._reset_engine()

            # NamedTemporaryFile rather than /tmp/{table_name}.csv: the old path
            # was attacker-controlled and collided between concurrent runs.
            with tempfile.NamedTemporaryFile(
                "w", suffix=".csv", delete=False, encoding="utf-8"
            ) as tmp:
                tmp.write(data_csv)
                temp_path = tmp.name
            try:
                engine.ingest_data(temp_path, table_name)
            finally:
                os.unlink(temp_path)

            available = set(engine.column_names(table_name))
            uid = primary_key_column or settings.get("unique_id_column_name") or "unique_id"
            if uid not in available:
                raise EngineError(
                    f"Primary key column {uid!r} is not in the dataset. "
                    f"Available columns: {', '.join(sorted(available))}"
                )

            if semantic_blocking:
                self._apply_semantic_blocking_columns(engine, table_name, semantic_blocking)
                available = set(engine.column_names(table_name))
                rules = settings.setdefault("blocking_rules_to_generate_predictions", [])
                for config in semantic_blocking:
                    rule = config.get("rule")
                    if rule and rule not in rules:
                        rules.append(rule)

            # Build comparisons, skipping the id column and anything unusable.
            comparisons = []
            for comp in settings.get("comparisons") or []:
                column = comp.get("output_column_name")
                if not column or column == uid:
                    continue
                if column not in available:
                    warnings.append(f"Ignored comparison on missing column {column!r}")
                    continue
                try:
                    comparisons.append(build_comparison(comp))
                except EngineError as exc:
                    warnings.append(str(exc))
            settings["comparisons"] = comparisons

            # Drop blocking rules referencing columns that do not exist, so a
            # stale rule degrades the run instead of failing it.
            kept_rules = []
            for rule in settings.get("blocking_rules_to_generate_predictions") or []:
                referenced = {
                    quoted or bare for quoted, bare in _RULE_COLUMN_RE.findall(rule)
                }
                missing = referenced - available
                if missing:
                    warnings.append(
                        f"Ignored blocking rule referencing unknown column(s) "
                        f"{', '.join(sorted(missing))}: {rule}"
                    )
                    continue
                kept_rules.append(rule)
            settings["blocking_rules_to_generate_predictions"] = kept_rules
            settings.pop("blocking_rules", None)

            if settings.get("probability_two_random_records_match") is None:
                settings.pop("probability_two_random_records_match", None)

            predictions_df = engine.run_resolution(
                table_name, settings, primary_key_column=uid
            )

            matches = predictions_df[predictions_df["match_probability"] >= threshold]
            matches_list = matches.to_dict(orient="records")

            cluster_lookup: dict[str, str] = {}
            try:
                clusters_pdf = engine._clusters_at(threshold).as_pandas_dataframe()
                id_col = "unique_id" if "unique_id" in clusters_pdf.columns else uid
                cluster_lookup = {
                    str(row[id_col]): str(row["cluster_id"])
                    for _, row in clusters_pdf.iterrows()
                }
            except Exception as exc:
                logger.warning("Clustering failed: %s", exc)
                warnings.append(f"Clustering unavailable: {exc}")

            if cluster_lookup:
                # Splink names these after the primary key, not "unique_id".
                left_col, right_col = engine.id_columns
                for match in matches_list:
                    left = str(match.get(left_col, ""))
                    right = str(match.get(right_col, ""))
                    if left in cluster_lookup:
                        match["left_cluster_id"] = cluster_lookup[left]
                    if right in cluster_lookup:
                        match["right_cluster_id"] = cluster_lookup[right]

            summary = {}
            cluster_stats = None
            try:
                summary = engine.duplicate_summary(threshold)
                cluster_stats = engine.get_cluster_stats(threshold)
            except Exception as exc:
                logger.warning("Cluster summary failed: %s", exc)

            report = engine.training_report
            warnings.extend(report.warnings)
            if not matches_list and len(predictions_df) > 0:
                warnings.append(
                    f"{len(predictions_df)} pairs were scored but none reached the "
                    f"{threshold:.2f} threshold. Try lowering it, since the score "
                    f"distribution shows where the pairs actually fall."
                )

            return {
                "status": "success",
                "matches": matches_list,
                "total_pairs": len(matches_list),
                "total_scored_pairs": int(len(predictions_df)),
                "total_clusters": summary.get("total_clusters"),
                "duplicate_records": summary.get("duplicate_records"),
                "execution_time_ms": round((time.time() - start) * 1000, 2),
                "clusters": cluster_stats,
                "cluster_lookup": cluster_lookup or None,
                "training": report.as_dict(),
                "warnings": warnings,
            }

        except EngineError as exc:
            # Caller's fault: bad config, missing column. Safe to show verbatim.
            logger.info("Resolution rejected: %s", exc)
            return {
                "status": "error",
                "error": str(exc),
                "execution_time_ms": round((time.time() - start) * 1000, 2),
                "warnings": warnings,
            }
        except Exception as exc:
            logger.exception("Resolution failed")
            return {
                "status": "error",
                "error": f"{type(exc).__name__}: {exc}",
                "execution_time_ms": round((time.time() - start) * 1000, 2),
                "warnings": warnings,
            }

    def _apply_semantic_blocking_columns(
        self,
        engine: EntityResolutionEngine,
        table_name: str,
        semantic_blocking: list[dict[str, Any]],
    ) -> None:
        """Attach precomputed semantic cluster ids as blocking columns."""
        metadata_db_path = os.path.normpath(
            os.environ.get(
                "ENTIFY_METADATA_DB",
                os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "entify.duckdb"),
            )
        )
        if not os.path.exists(metadata_db_path):
            logger.warning("Semantic metadata DB not found at %s", metadata_db_path)
            return

        try:
            engine.con.execute(f"ATTACH '{metadata_db_path}' AS semantic_meta (READ_ONLY)")
        except Exception as exc:
            logger.warning("Failed to attach metadata DB: %s", exc)
            return

        try:
            exists = engine.con.execute(
                "SELECT COUNT(*) FROM semantic_meta.information_schema.tables "
                "WHERE table_name = 'semantic_blocking_values'"
            ).fetchone()[0]
            if not exists:
                logger.warning("semantic_blocking_values table missing")
                return

            existing = set(engine.column_names(table_name))
            table = quote_ident(table_name)

            for config in semantic_blocking:
                column, run_id = config.get("column"), config.get("run_id")
                if not column or not run_id or column not in existing:
                    continue

                derived = f"semantic_block__{re.sub(r'[^a-zA-Z0-9_]', '_', column)}"
                if derived not in existing:
                    engine.con.execute(
                        f"ALTER TABLE {table} ADD COLUMN {quote_ident(derived)} TEXT"
                    )
                    existing.add(derived)

                engine.con.execute(
                    f"""
                    UPDATE {table} AS t
                    SET {quote_ident(derived)} = m.cluster_id
                    FROM semantic_meta.semantic_blocking_values AS m
                    WHERE m.run_id = ? AND CAST(t.{quote_ident(column)} AS VARCHAR) = m.value
                    """,
                    [run_id],
                )
        except Exception as exc:
            logger.warning("Semantic blocking failed: %s", exc)
        finally:
            try:
                engine.con.execute("DETACH semantic_meta")
            except Exception:
                pass

    def get_data_profile(self, data_csv: str, table_name: str = "profile_data") -> dict[str, Any]:
        """Profile a CSV. Uses its own short-lived engine, always closed."""
        with tempfile.NamedTemporaryFile(
            "w", suffix=".csv", delete=False, encoding="utf-8"
        ) as tmp:
            tmp.write(data_csv)
            temp_path = tmp.name

        engine = EntityResolutionEngine()
        try:
            engine.ingest_data(temp_path, table_name)
            return engine.profile_data(table_name)
        finally:
            engine.close()
            os.unlink(temp_path)

    # -- chart passthroughs (these were missing and returned 500s) ----------

    def _chart(self, attr: str) -> Optional[str]:
        if self.engine is None:
            return None
        return getattr(self.engine, attr)()

    def get_match_weights_chart(self) -> Optional[str]:
        return self._chart("get_match_weights_chart")

    def get_parameter_estimates_chart(self) -> Optional[str]:
        return self._chart("get_parameter_estimates_chart")

    def get_threshold_selection_chart(self) -> Optional[str]:
        return self._chart("get_threshold_selection_chart")

    def get_comparison_viewer_dashboard(self) -> Optional[str]:
        return self._chart("get_comparison_viewer_dashboard")

    def get_waterfall_chart(self, record_id_1: str, record_id_2: str) -> Optional[str]:
        if self.engine is None:
            return None
        return self.engine.get_waterfall_chart(record_id_1, record_id_2)
