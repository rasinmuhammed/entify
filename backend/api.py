"""
FastAPI REST API for Entity Resolution
Provides endpoints for Splink-powered matching
"""
from fastapi import FastAPI, UploadFile, File, HTTPException, Form, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from typing import Dict, List, Optional, Any
import base64
import sys
import os
import asyncio
import json
import time
from queue import Queue
from sse_starlette.sse import EventSourceResponse

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from services.splink_service import SplinkService, EntityResolutionRequest, EntityResolutionResponse

# Global log queue for training logs
training_log_queue = Queue()

def emit_training_log(message: str, level: str = "info", data: Optional[Dict] = None):
    """Emit a training log to the queue"""
    log_entry = {
        "message": message,
        "level": level,
        "timestamp": time.time(),
        "data": data or {}
    }
    training_log_queue.put(log_entry)

app = FastAPI(
    title="Entify API",
    description="Entity Resolution API powered by Splink",
    version="1.0.0"
)

# CORS middleware for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],  # Next.js dev servers
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize service
splink_service = SplinkService()


@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "Entify Entity Resolution API",
        "splink_available": True
    }


@app.post("/api/resolve", response_model=EntityResolutionResponse)
async def resolve_entities(request: EntityResolutionRequest):
    """
    Run entity resolution on uploaded dataset
    
    Request body:
        - data: Base64-encoded CSV string
        - settings: Splink settings (blocking rules, comparisons)
        - threshold: Match probability threshold (0.0-1.0)
        
    Returns:
        - matches: List of matched record pairs
        - total_pairs: Number of matches found
        - execution_time_ms: Processing time
        - clusters: Cluster statistics (optional)
    """
    try:
        # Decode base64 data
        csv_data = base64.b64decode(request.data).decode('utf-8')
        
        # Run resolution via service layer
        result = splink_service.process_entity_resolution(
            data_csv=csv_data,
            settings=request.settings.model_dump(),
            threshold=request.threshold,
            table_name=request.table_name or "input_data",
            primary_key_column=request.primary_key_column
        )
        
        return EntityResolutionResponse(**result)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/resolve/file")
async def resolve_entities_from_file(
    file: UploadFile = File(...),
    settings: str = Form(...),
    threshold: float = Form(0.5)
):
    """
    Alternative endpoint: Upload file directly instead of base64
    
    Args:
        file: CSV file upload
        settings: JSON string of Splink settings
        threshold: Match probability threshold
    """
    import json
    
    try:
        # Read file content
        contents = await file.read()
        csv_data = contents.decode('utf-8')
        
        # Parse settings
        settings_dict = json.loads(settings)
        
        # Run resolution
        result = splink_service.process_entity_resolution(
            data_csv=csv_data,
            settings=settings_dict,
            threshold=threshold
        )
        
        return JSONResponse(content=result)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/profile")
async def profile_dataset(file: UploadFile = File(...)):
    """
    Profile uploaded dataset (statistics, column types, null counts)
    
    Returns:
        - total_rows: Number of rows
        - columns: List of column statistics
    """
    try:
        contents = await file.read()
        csv_data = contents.decode('utf-8')
        
        profile = splink_service.get_data_profile(csv_data)
        
        return JSONResponse(content=profile)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/health")
async def health_check():
    """Detailed health check with Splink status"""
    try:
        from splink import __version__ as splink_version
        import duckdb
        
        return {
            "status": "healthy",
            "splink_version": splink_version,
            "duckdb_version": duckdb.__version__,
            "python_version": sys.version
        }
    except Exception as e:
        return {
            "status": "degraded",
            "error": str(e)
        }


@app.get("/api/training-logs")
async def training_logs(request: Request):
    """
    Server-Sent Events endpoint for streaming training logs
    """
    async def event_generator():
        try:
            while True:
                # Check if client disconnected
                if await request.is_disconnected():
                    break
                
                # Check for new logs
                if not training_log_queue.empty():
                    log = training_log_queue.get_nowait()
                    yield {
                        "event": "log",
                        "data": json.dumps(log)
                    }
                else:
                    # Send heartbeat every 15 seconds to keep connection alive
                    yield {
                        "event": "heartbeat",
                        "data": json.dumps({"timestamp": time.time()})
                    }
                
                await asyncio.sleep(0.1)
        except asyncio.CancelledError:
            pass
    
    return EventSourceResponse(event_generator())



@app.get("/api/splink/charts/match-weights")
async def get_match_weights_chart():
    """
    Get the match weights chart as HTML
    """
    try:
        chart_html = splink_service.get_match_weights_chart()
        if not chart_html:
            raise HTTPException(status_code=404, detail="Chart not available. Run resolution first.")
        
        return JSONResponse(content={"html": chart_html})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/splink/charts/waterfall")
async def get_waterfall_chart(record_id_1: str, record_id_2: str):
    """
    Get the waterfall chart for a specific pair of records
    """
    try:
        # Parse composite IDs if necessary, but Splink usually expects simple IDs or dicts
        # For now, we assume the service handles the ID lookup/formatting
        chart_html = splink_service.get_waterfall_chart(record_id_1, record_id_2)
        if not chart_html:
            raise HTTPException(status_code=404, detail="Chart not available or pair not found.")
            
        return JSONResponse(content={"html": chart_html})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/match-statistics")
async def get_match_statistics(table_name: str = "input_data", threshold: float = 0.9):
    """
    Get comprehensive statistics about the matching process.
    Includes comparison counts, match distribution, cluster stats, and performance metrics.
    """
    try:
        stats = splink_service.engine.get_match_statistics(table_name, threshold)
        if "error" in stats:
            raise HTTPException(status_code=404, detail=stats["error"])
        return JSONResponse(content=stats)
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/splink/charts/parameter-estimates")
async def get_parameter_estimates_chart():
    """
    Get the parameter estimates chart showing m/u probabilities for all comparisons
    """
    try:
        chart_html = splink_service.get_parameter_estimates_chart()
        if not chart_html:
            raise HTTPException(status_code=404, detail="Chart not available. Run resolution first.")
        return JSONResponse(content={"html": chart_html})
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/splink/charts/threshold-selection")
async def get_threshold_selection_chart():
    """
    Get the interactive threshold selection tool chart
    """
    try:
        chart_html = splink_service.get_threshold_selection_chart()
        if not chart_html:
            raise HTTPException(status_code=404, detail="Chart not available. Run resolution first.")
        return JSONResponse(content={"html": chart_html})
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/splink/charts/comparison-viewer")
async def get_comparison_viewer_chart():
    """
    Get the comparison viewer dashboard with example record comparisons
    """
    try:
        chart_html = splink_service.get_comparison_viewer_dashboard()
        if not chart_html:
            raise HTTPException(status_code=404, detail="Chart not available. Run resolution first.")
        return JSONResponse(content={"html": chart_html})
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/score-distribution")
async def get_score_distribution():
    """
    Get match probability distribution histogram.
    Helps visualize natural clustering of scores.
    
    Returns:
        JSON with bins, counts, and summary statistics
    """
    try:
        if not splink_service.engine:
            raise HTTPException(status_code=400, detail="No matching results available. Run matching first.")
        
        distribution = splink_service.engine.get_score_distribution()
        
        if "error" in distribution:
            raise HTTPException(status_code=400, detail=distribution["error"])
        
        return distribution
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/threshold-analysis")
async def get_threshold_analysis():
    """
    Analyze matching performance at different threshold values.
    Shows how metrics change with threshold selection.
    
    Returns:
        JSON with metrics for each threshold
    """
    try:
        if not splink_service.engine:
            raise HTTPException(status_code=400, detail="No matching results available. Run matching first.")
        
        analysis = splink_service.engine.analyze_thresholds()
        
        if "error" in analysis:
            raise HTTPException(status_code=400, detail=analysis["error"])
        
        return analysis
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/export-clusters")
async def export_clusters_with_data(
    table_name: str,
    threshold: float = 0.5,
    id_column: str = "unique_id"
):
    """
    Export clusters merged with original data as CSV.
    Returns CSV file with all original columns plus cluster_id and cluster_size.
    
    Query Parameters:
        table_name: Name of the original data table (e.g., 'my_data_original')
        threshold: Match probability threshold (default: 0.5)
        id_column: Name of the ID column in original data (default: 'unique_id')
        
    Returns:
        CSV file ready for download
    """
    try:
        if not splink_service.engine:
            raise HTTPException(status_code=400, detail="No matching results available. Run matching first.")
        
        csv_data = splink_service.engine.export_clusters_with_data(
            table_name=table_name,
            threshold=threshold,
            id_column=id_column
        )
        
        if csv_data.startswith("error:"):
            error_msg = csv_data.replace("error: ", "")
            raise HTTPException(status_code=400, detail=error_msg)
        
        # Return as downloadable CSV file
        from fastapi.responses import Response
        return Response(
            content=csv_data,
            media_type="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename=clusters_export_{table_name}.csv"
            }
        )
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/clusters")
async def get_clusters(
    table_name: str,
    threshold: float = 0.5,
    id_column: str = "unique_id"
):
    """
    Get clusters merged with original data as JSON.
    """
    try:
        if not splink_service.engine:
            raise HTTPException(status_code=400, detail="No matching results available. Run matching first.")
        
        data = splink_service.engine.get_clusters_data(
            table_name=table_name,
            threshold=threshold,
            id_column=id_column
        )
        
        # Convert to JSON compatible format
        return data
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


class EstimationRequest(BaseModel):
    blocking_rule: str

@app.post("/api/estimate-parameters")
async def estimate_parameters(request: EstimationRequest):
    """
    Run Expectation Maximization to estimate m parameters using a blocking rule.
    """
    try:
        if not splink_service.engine:
            raise HTTPException(status_code=400, detail="Engine not initialized")
            
        result = splink_service.engine.run_em_estimation(request.blocking_rule)
        
        if result.get("status") == "error":
            raise HTTPException(status_code=500, detail=result.get("message"))
            
        return result
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

class TestRuleRequest(BaseModel):
    table_name: str
    blocking_rule: str

@app.post("/api/test-blocking-rule")
async def test_blocking_rule(request: TestRuleRequest):
    """
    Count the number of pairs generated by a blocking rule.
    """
    try:
        if not splink_service.engine:
            raise HTTPException(status_code=400, detail="Engine not initialized")
            
        result = splink_service.engine.count_pairs_for_rule(request.table_name, request.blocking_rule)
        
        if result.get("status") == "error":
            raise HTTPException(status_code=500, detail=result.get("message"))
            
        return result
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/model-settings")
async def get_model_settings():
    """
    Get current Splink model settings.
    """
    try:
        if not splink_service.engine:
            raise HTTPException(status_code=400, detail="Engine not initialized")
            
        settings = splink_service.engine.get_model_settings()
        if not settings:
            raise HTTPException(status_code=404, detail="Model settings not available")
            
        return settings
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/match-weights-chart")
async def get_match_weights_chart():
    """
    Get match weights chart data (Vega-Lite spec).
    """
    try:
        if not splink_service.engine:
            raise HTTPException(status_code=400, detail="Engine not initialized")
            
        chart = splink_service.engine.get_match_weights_chart_data()
        if not chart:
            raise HTTPException(status_code=404, detail="Chart data not available")
            
        return chart
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
