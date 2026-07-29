"""
FastAPI application for Entify.

Error handling contract: :class:`EngineError` means the caller sent something
invalid and the message is safe to show them, so it maps to 400. Anything else
is our fault, gets logged with a traceback, and returns a generic 500 rather
than leaking internals to the client.
"""

from __future__ import annotations

import asyncio
import base64
import binascii
import json
import logging
import os
import sys
import tempfile
import time
from queue import Empty, Queue
from typing import Any, Optional

from services import sheets_service

from fastapi import Depends, FastAPI, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from pydantic import BaseModel, Field

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import autoconfig  # noqa: E402
from auditor import Auditor, CostAssumption, build_audit_input  # noqa: E402
from engine import EngineError, EntityResolutionEngine  # noqa: E402
from sample_data import generate as generate_sample  # noqa: E402
from services.semantic_blocking_service import SemanticBlockingService  # noqa: E402
from services.splink_service import (  # noqa: E402
    EntityResolutionRequest,
    EntityResolutionResponse,
    SplinkService,
)

logging.basicConfig(
    level=os.environ.get("ENTIFY_LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)-8s %(name)s: %(message)s",
)
logger = logging.getLogger("entify.api")

# Uploads are read fully into memory before DuckDB sees them, so this is a real
# ceiling rather than advice.
MAX_UPLOAD_BYTES = int(os.environ.get("ENTIFY_MAX_UPLOAD_MB", "100")) * 1024 * 1024

ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.environ.get(
        "ENTIFY_CORS_ORIGINS", "http://localhost:3000,http://localhost:3001"
    ).split(",")
    if origin.strip()
]

training_log_queue: Queue = Queue(maxsize=1000)


def emit_training_log(message: str, level: str = "info", data: Optional[dict] = None) -> None:
    """Publish a training log line. Drops rather than blocks when full."""
    try:
        training_log_queue.put_nowait(
            {"message": message, "level": level, "timestamp": time.time(), "data": data or {}}
        )
    except Exception:
        pass


app = FastAPI(
    title="Entify API",
    description="Entity resolution API powered by Splink 4 and DuckDB",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

splink_service = SplinkService()
semantic_blocking_service = SemanticBlockingService()


# -- helpers ---------------------------------------------------------------

def require_engine():
    """Dependency: the current engine, or a 409 explaining what to do."""
    if splink_service.engine is None or not splink_service.engine.has_predictions:
        raise HTTPException(
            status_code=409,
            detail="No matching results yet. Run a match before requesting this.",
        )
    return splink_service.engine


async def read_upload(file: UploadFile) -> str:
    """Read an uploaded CSV, enforcing the size cap and decoding defensively."""
    contents = await file.read()
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File exceeds the {MAX_UPLOAD_BYTES // 1024 // 1024} MB limit.",
        )
    if not contents:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    try:
        return contents.decode("utf-8")
    except UnicodeDecodeError:
        # Exports from Excel are frequently cp1252, not UTF-8.
        return contents.decode("latin-1")


def decode_base64_csv(data: str) -> str:
    try:
        raw = base64.b64decode(data, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(status_code=400, detail=f"data is not valid base64: {exc}")
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Payload exceeds the upload limit.")
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError:
        return raw.decode("latin-1")


def handle_engine_call(fn, *args, **kwargs):
    """Run an engine call, mapping exceptions onto the status-code contract."""
    try:
        return fn(*args, **kwargs)
    except EngineError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except HTTPException:
        raise
    except Exception:
        logger.exception("Unhandled error in %s", getattr(fn, "__name__", fn))
        raise HTTPException(status_code=500, detail="Internal error. Check server logs.")


# -- health ----------------------------------------------------------------

@app.get("/")
async def root():
    return {"status": "healthy", "service": "Entify Entity Resolution API"}


@app.get("/api/health")
async def health_check():
    from splink import __version__ as splink_version
    import duckdb

    engine = splink_service.engine
    return {
        "status": "healthy",
        "splink_version": splink_version,
        "duckdb_version": duckdb.__version__,
        "python_version": sys.version.split()[0],
        "has_results": bool(engine and engine.has_predictions),
        "max_upload_mb": MAX_UPLOAD_BYTES // 1024 // 1024,
    }


# -- demo data -------------------------------------------------------------

@app.get("/api/demo/dataset")
async def demo_dataset(
    entities: int = Query(4000, ge=50, le=50_000),
    duplicate_rate: float = Query(0.18, ge=0.0, le=0.9),
    seed: int = Query(42),
):
    """A messy customer file with real duplicates, generated on demand.

    Lets someone evaluate the app without having to find and upload their own
    data first.
    """
    df = generate_sample(
        n_entities=entities, duplicate_rate=duplicate_rate, seed=seed, include_ground_truth=False
    )
    return Response(
        content=df.to_csv(index=False),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="demo_customers.csv"'},
    )


@app.get("/api/demo/config")
async def demo_config():
    """Matching config tuned for the demo dataset.

    These settings score precision 0.98 / recall 0.93 (F1 0.957) against the
    generator's ground truth, so a first run demonstrates the product working
    rather than a default that finds nothing.
    """
    return {
        "primary_key_column": "customer_id",
        "threshold": 0.95,
        "settings": {
            "link_type": "dedupe_only",
            "unique_id_column_name": "customer_id",
            "blocking_rules_to_generate_predictions": [
                "l.last_name = r.last_name AND l.city = r.city",
                "l.email = r.email",
                "l.address = r.address",
            ],
            "comparisons": [
                {"output_column_name": "first_name", "comparison_library_name": "jaro_winkler_at_thresholds", "threshold": 0.9},
                {"output_column_name": "last_name", "comparison_library_name": "jaro_winkler_at_thresholds", "threshold": 0.9},
                {"output_column_name": "email", "comparison_library_name": "jaro_winkler_at_thresholds", "threshold": 0.9},
                {"output_column_name": "address", "comparison_library_name": "jaro_winkler_at_thresholds", "threshold": 0.9},
                {"output_column_name": "phone", "comparison_library_name": "jaro_winkler_at_thresholds", "threshold": 0.85},
                {"output_column_name": "city", "comparison_library_name": "exact_match"},
            ],
        },
    }


# -- core resolution -------------------------------------------------------

@app.post("/api/resolve", response_model=EntityResolutionResponse)
async def resolve_entities(request: EntityResolutionRequest):
    """Run entity resolution over a base64-encoded CSV."""
    csv_data = decode_base64_csv(request.data)

    result = await asyncio.to_thread(
        splink_service.process_entity_resolution,
        data_csv=csv_data,
        settings=request.settings.model_dump(),
        threshold=request.threshold,
        table_name=request.table_name or "input_data",
        primary_key_column=request.primary_key_column,
        semantic_blocking=[sb.model_dump() for sb in request.semantic_blocking],
    )

    if result.get("status") == "error":
        raise HTTPException(status_code=400, detail=result.get("error", "Resolution failed"))
    return EntityResolutionResponse(**result)


@app.post("/api/resolve/file", response_model=EntityResolutionResponse)
async def resolve_entities_from_file(
    file: UploadFile = File(...),
    settings: str = Form(...),
    threshold: float = Form(0.5),
    table_name: str = Form("input_data"),
    primary_key_column: Optional[str] = Form(None),
):
    """Same as /api/resolve but takes a multipart upload."""
    csv_data = await read_upload(file)
    try:
        settings_dict = json.loads(settings)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail=f"settings is not valid JSON: {exc}")

    result = await asyncio.to_thread(
        splink_service.process_entity_resolution,
        data_csv=csv_data,
        settings=settings_dict,
        threshold=threshold,
        table_name=table_name,
        primary_key_column=primary_key_column,
    )
    if result.get("status") == "error":
        raise HTTPException(status_code=400, detail=result.get("error", "Resolution failed"))
    return EntityResolutionResponse(**result)


@app.post("/api/profile")
async def profile_dataset(file: UploadFile = File(...)):
    """Column completeness and cardinality for an uploaded CSV."""
    csv_data = await read_upload(file)
    return JSONResponse(
        content=await asyncio.to_thread(
            handle_engine_call, splink_service.get_data_profile, csv_data
        )
    )


class SemanticSuggestionRequest(BaseModel):
    data: str
    columns: list[str]
    sample_size: int = Field(default=5000, ge=1, le=100_000)
    max_unique_values: int = Field(default=2000, ge=1, le=50_000)
    similarity_threshold: float = Field(default=0.85, ge=0.0, le=1.0)
    model_name: str = "all-MiniLM-L6-v2"


@app.post("/api/blocking/suggestions")
async def generate_blocking_suggestions(request: SemanticSuggestionRequest):
    csv_data = decode_base64_csv(request.data)
    result = await asyncio.to_thread(
        handle_engine_call,
        semantic_blocking_service.generate_suggestions,
        data_csv=csv_data,
        columns=request.columns,
        sample_size=request.sample_size,
        max_unique_values=request.max_unique_values,
        similarity_threshold=request.similarity_threshold,
        model_name=request.model_name,
    )
    return JSONResponse(content=result)


# -- results ---------------------------------------------------------------

@app.get("/api/match-statistics")
async def get_match_statistics(
    table_name: str = "input_data",
    threshold: float = Query(0.9, ge=0.0, le=1.0),
    engine=Depends(require_engine),
):
    return JSONResponse(content=handle_engine_call(engine.get_match_statistics, table_name, threshold))


@app.get("/api/score-distribution")
async def get_score_distribution(
    num_bins: int = Query(20, ge=2, le=100), engine=Depends(require_engine)
):
    return handle_engine_call(engine.get_score_distribution, num_bins)


@app.get("/api/threshold-analysis")
async def get_threshold_analysis(engine=Depends(require_engine)):
    return handle_engine_call(engine.analyze_thresholds)


@app.get("/api/duplicate-summary")
async def get_duplicate_summary(
    threshold: float = Query(0.95, ge=0.0, le=1.0), engine=Depends(require_engine)
):
    """Headline duplicate counts -- the figures the audit report is built on."""
    return handle_engine_call(engine.duplicate_summary, threshold)


@app.get("/api/clusters")
async def get_clusters(
    table_name: str,
    threshold: float = Query(0.5, ge=0.0, le=1.0),
    id_column: Optional[str] = None,
    engine=Depends(require_engine),
):
    return handle_engine_call(engine.get_clusters_data, table_name, threshold, id_column)


@app.get("/api/export-clusters")
async def export_clusters(
    table_name: str,
    threshold: float = Query(0.5, ge=0.0, le=1.0),
    id_column: Optional[str] = None,
    engine=Depends(require_engine),
):
    csv_data = handle_engine_call(engine.export_clusters_with_data, table_name, threshold, id_column)
    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="clusters_{table_name}.csv"'},
    )


# -- auto-configuration ----------------------------------------------------

@app.post("/api/autoconfig")
async def auto_configure(
    file: UploadFile = File(...),
    threshold: float = Form(0.95),
    table_name: str = Form("input_data"),
):
    """Infer a complete matching configuration from an uploaded CSV.

    Removes the main barrier to using this without understanding record
    linkage: the caller uploads a file and gets back blocking rules,
    comparisons and a primary key, each with a stated reason.
    """
    csv_data = await read_upload(file)

    def build() -> dict[str, Any]:
        with tempfile.NamedTemporaryFile(
            "w", suffix=".csv", delete=False, encoding="utf-8"
        ) as tmp:
            tmp.write(csv_data)
            path = tmp.name
        engine = EntityResolutionEngine()
        try:
            engine.ingest_data(path, table_name)
            return autoconfig.generate(engine, table_name, threshold).as_dict()
        finally:
            engine.close()
            os.unlink(path)

    return JSONResponse(content=await asyncio.to_thread(handle_engine_call, build))


# -- merged output ---------------------------------------------------------

@app.get("/api/merge/summary")
async def merge_summary(
    table_name: str,
    threshold: float = Query(0.95, ge=0.0, le=1.0),
    engine=Depends(require_engine),
):
    """Row counts before and after merging, without building the file."""
    return handle_engine_call(engine.merge_summary, table_name, threshold)


@app.get("/api/merge/preview")
async def merge_preview(
    table_name: str,
    threshold: float = Query(0.95, ge=0.0, le=1.0),
    limit: int = Query(50, ge=1, le=500),
    recency_column: Optional[str] = None,
    engine=Depends(require_engine),
):
    def build() -> dict[str, Any]:
        merged = engine.merge_clusters(table_name, threshold, recency_column)
        return {
            "total_rows": int(len(merged)),
            "rows": merged.head(limit).replace({float("nan"): None}).to_dict(orient="records"),
        }

    return await asyncio.to_thread(handle_engine_call, build)


@app.get("/api/merge/export")
async def merge_export(
    table_name: str,
    threshold: float = Query(0.95, ge=0.0, le=1.0),
    recency_column: Optional[str] = None,
    engine=Depends(require_engine),
):
    """The deduplicated file: one surviving record per real entity."""
    csv_data = await asyncio.to_thread(
        handle_engine_call,
        lambda: engine.merge_clusters(table_name, threshold, recency_column).to_csv(index=False),
    )
    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{table_name}_deduplicated.csv"'},
    )


# -- audit report ----------------------------------------------------------

class CostLine(BaseModel):
    label: str
    unit_cost: Optional[float] = None
    unit: str = "per duplicate record"
    note: str = ""


class AuditRequest(BaseModel):
    table_name: str = "input_data"
    threshold: float = Field(default=0.95, ge=0.0, le=1.0)
    dataset_name: str = "Customer dataset"
    prepared_for: str = ""
    currency: str = "$"
    include_examples: bool = True
    cost_assumptions: list[CostLine] = Field(default_factory=list)


# Measured on the bundled benchmark, not on the customer's file. Stated as such
# in the report itself.
BENCHMARK = {"precision": 0.981, "recall": 0.930, "f1": 0.955}


@app.post("/api/audit")
async def generate_audit_report(request: AuditRequest, engine=Depends(require_engine)):
    """Render the data quality audit PDF from the current matching run."""

    def build() -> str:
        profile = engine.profile_data(request.table_name)
        summary = engine.duplicate_summary(request.threshold)
        examples = (
            engine.example_duplicate_clusters(request.table_name, request.threshold)
            if request.include_examples
            else []
        )
        audit = build_audit_input(
            profile=profile,
            summary=summary,
            example_clusters=examples,
            dataset_name=request.dataset_name,
            prepared_for=request.prepared_for,
            currency=request.currency,
            cost_assumptions=[
                CostAssumption(c.label, c.unit_cost, c.unit, c.note)
                for c in request.cost_assumptions
            ],
            benchmark=BENCHMARK,
            training=engine.training_report.as_dict(),
        )
        path = os.path.join(tempfile.mkdtemp(prefix="entify-audit-"), "audit_report.pdf")
        return Auditor().generate_report(audit, path)

    path = await asyncio.to_thread(handle_engine_call, build)
    return FileResponse(path, media_type="application/pdf", filename="data_quality_audit.pdf")


@app.get("/api/audit/preview")
async def audit_preview(
    table_name: str = "input_data",
    threshold: float = Query(0.95, ge=0.0, le=1.0),
    engine=Depends(require_engine),
):
    """The audit figures as JSON, so the UI can show them before downloading."""

    def build() -> dict[str, Any]:
        summary = engine.duplicate_summary(threshold)
        return {
            **summary,
            "duplicate_rate": (
                summary["duplicate_records"] / summary["total_records"] * 100
                if summary["total_records"] else 0.0
            ),
            "examples": engine.example_duplicate_clusters(table_name, threshold, limit=3),
            "benchmark": BENCHMARK,
            "training": engine.training_report.as_dict(),
        }

    return handle_engine_call(build)


# -- model & charts --------------------------------------------------------

@app.get("/api/model-settings")
async def get_model_settings(engine=Depends(require_engine)):
    settings = handle_engine_call(engine.get_model_settings)
    if not settings:
        raise HTTPException(status_code=404, detail="Model settings not available")
    return settings


class EstimationRequest(BaseModel):
    blocking_rule: str


@app.post("/api/estimate-parameters")
async def estimate_parameters(request: EstimationRequest, engine=Depends(require_engine)):
    return await asyncio.to_thread(handle_engine_call, engine.run_em_estimation, request.blocking_rule)


class TestRuleRequest(BaseModel):
    table_name: str
    blocking_rule: str


@app.post("/api/test-blocking-rule")
async def test_blocking_rule(request: TestRuleRequest):
    if splink_service.engine is None:
        raise HTTPException(status_code=409, detail="Upload data before testing rules.")
    return await asyncio.to_thread(
        handle_engine_call,
        splink_service.engine.count_pairs_for_rule,
        request.table_name,
        request.blocking_rule,
    )


def _chart_endpoint(getter_name: str):
    async def endpoint():
        chart = handle_engine_call(getattr(splink_service, getter_name))
        if not chart:
            raise HTTPException(
                status_code=409, detail="Chart unavailable. Run a match first."
            )
        return JSONResponse(content={"html": chart})

    return endpoint


app.add_api_route("/api/splink/charts/match-weights", _chart_endpoint("get_match_weights_chart"), methods=["GET"])
app.add_api_route("/api/splink/charts/parameter-estimates", _chart_endpoint("get_parameter_estimates_chart"), methods=["GET"])
app.add_api_route("/api/splink/charts/threshold-selection", _chart_endpoint("get_threshold_selection_chart"), methods=["GET"])
app.add_api_route("/api/splink/charts/comparison-viewer", _chart_endpoint("get_comparison_viewer_dashboard"), methods=["GET"])


@app.get("/api/splink/charts/waterfall")
async def get_waterfall_chart(record_id_1: str, record_id_2: str):
    """Explain one pair: which fields contributed how much evidence."""
    chart = handle_engine_call(splink_service.get_waterfall_chart, record_id_1, record_id_2)
    if not chart:
        raise HTTPException(status_code=404, detail="Chart unavailable or pair not found.")
    return JSONResponse(content={"html": chart})


# -- streaming logs --------------------------------------------------------

@app.get("/api/training-logs")
async def training_logs(request: Request):
    """SSE stream of training progress.

    Heartbeats are sent on a real interval. The previous implementation
    advertised 15 seconds but emitted one every 100ms, flooding the client.
    """
    HEARTBEAT_SECONDS = 15.0

    async def event_generator():
        last_heartbeat = time.monotonic()
        while True:
            if await request.is_disconnected():
                break
            try:
                log = training_log_queue.get_nowait()
                yield {"event": "log", "data": json.dumps(log)}
                continue
            except Empty:
                pass

            now = time.monotonic()
            if now - last_heartbeat >= HEARTBEAT_SECONDS:
                last_heartbeat = now
                yield {"event": "heartbeat", "data": json.dumps({"timestamp": time.time()})}

            await asyncio.sleep(0.25)

    try:
        from sse_starlette.sse import EventSourceResponse
    except ImportError:
        raise HTTPException(
            status_code=501, detail="Install sse-starlette to stream training logs."
        )
    return EventSourceResponse(event_generator())



class SheetsDedupeRequest(BaseModel):
    """A spreadsheet selection: header row plus data rows."""

    header: list[str]
    rows: list[list[Any]]
    threshold: float = Field(default=0.9, ge=0.5, le=0.999)


@app.post("/api/sheets/dedupe")
async def sheets_dedupe(request: SheetsDedupeRequest):
    """Find duplicate rows in a spreadsheet selection.

    Self-contained on purpose: the Sheets add-on has no project or config, so
    this runs profiling, configuration, matching and clustering in one call
    against a throwaway engine. Nothing is retained between requests, which
    also means concurrent callers cannot collide the way the workspace
    endpoints can.
    """
    try:
        # Blocking work; keep the event loop free for other requests.
        return await asyncio.to_thread(
            sheets_service.dedupe,
            request.header,
            request.rows,
            request.threshold,
        )
    except sheets_service.SheetsDedupeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Sheets dedupe failed")
        raise HTTPException(
            status_code=500,
            detail="Matching failed on this selection. Check the columns are "
                   "the ones you meant to include.",
        ) from exc

if __name__ == "__main__":
    import uvicorn

    uvicorn.run("api:app", host="127.0.0.1", port=8000, reload=True)
