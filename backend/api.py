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
            table_name=request.table_name or "input_data"
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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
