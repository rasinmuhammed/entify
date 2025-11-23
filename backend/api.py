"""
FastAPI REST API for Entity Resolution
Provides endpoints for Splink-powered matching
"""
from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from typing import Dict, List, Optional, Any
import base64
import sys
import os

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from services.splink_service import SplinkService, EntityResolutionRequest, EntityResolutionResponse

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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
