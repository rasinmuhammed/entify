from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import shutil
import os
import uuid
try:
    from .engine import EntityResolutionEngine
except ImportError:
    from engine import EntityResolutionEngine

app = FastAPI(title="Entify API", description="API for Entify Entity Resolution Platform")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global engine instance (in a real app, might be per-request or pool)
# For now, we initialize it with a persistent DuckDB file or memory
# We'll use a file to persist across requests
DB_PATH = "entify.duckdb"
engine = EntityResolutionEngine(db_path=DB_PATH)

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

class ProfileResponse(BaseModel):
    total_rows: int
    columns: List[Dict[str, Any]]

class MatchRequest(BaseModel):
    table_name: str
    settings: Dict[str, Any]

class JobStatus(BaseModel):
    job_id: str
    status: str
    result: Optional[Dict[str, Any]] = None

# Simple in-memory job store
jobs: Dict[str, JobStatus] = {}

@app.get("/")
def read_root():
    return {"message": "Welcome to Entify API"}

@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    """
    Upload a CSV or Parquet file and ingest it into the engine.
    Returns the table name and row count.
    """
    file_ext = os.path.splitext(file.filename)[1].lower()
    if file_ext not in ['.csv', '.parquet']:
        raise HTTPException(status_code=400, detail="Unsupported file format. Use .csv or .parquet")
    
    # Generate a unique table name
    table_name = f"table_{uuid.uuid4().hex}"
    file_path = os.path.join(UPLOAD_DIR, f"{table_name}{file_ext}")
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    try:
        count = engine.ingest_data(file_path, table_name)
        return {"table_name": table_name, "rows": count}
    except Exception as e:
        os.remove(file_path)
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/profile/{table_name}", response_model=ProfileResponse)
def profile_dataset(table_name: str):
    """
    Get profile statistics for a dataset.
    """
    try:
        profile = engine.profile_data(table_name)
        return profile
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def process_match_job(job_id: str, table_name: str, settings: Dict[str, Any]):
    """
    Background task to run the matching process.
    """
    try:
        jobs[job_id].status = "running"
        
        # Run resolution
        engine.run_resolution(table_name, settings)
        
        # Get clusters (using default threshold for now, or from settings)
        clusters = engine.get_clusters(threshold=settings.get("threshold", 0.5))
        
        # Save results to a file or just keep in memory/db?
        # For now, let's save to a CSV in uploads
        result_filename = f"results_{job_id}.csv"
        result_path = os.path.join(UPLOAD_DIR, result_filename)
        clusters.to_csv(result_path, index=False)
        
        jobs[job_id].status = "completed"
        jobs[job_id].result = {"download_url": f"/download/{result_filename}", "count": len(clusters)}
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        jobs[job_id].status = "failed"
        jobs[job_id].result = {"error": str(e)}

class MatchSettings(BaseModel):
    link_type: str = "dedupe_only"
    unique_id_column_name: str = "id"
    blocking_rules_to_generate_predictions: List[str] = []
    threshold: float = 0.5

class RunMatchRequest(BaseModel):
    table_name: str
    settings: MatchSettings
    blocking_rules: Optional[List[Dict[str, str]]] = None # New field for UI builder

@app.post("/run-match")
async def run_match(request: RunMatchRequest, background_tasks: BackgroundTasks):
    job_id = str(uuid.uuid4())
    jobs[job_id] = JobStatus(job_id=job_id, status="pending")
    
    # Convert UI blocking rules to Splink SQL if provided
    if request.blocking_rules:
        sql_rules = []
        for rule in request.blocking_rules:
            col = rule.get("column")
            method = rule.get("method")
            if not col: continue
            
            if method == "exact":
                sql_rules.append(f"l.{col} = r.{col}")
            elif method == "soundex":
                sql_rules.append(f"soundex(l.{col}) = soundex(r.{col})")
            elif method == "jaro_winkler":
                sql_rules.append(f"jaro_winkler_similarity(l.{col}, r.{col}) > 0.9")
        
        if sql_rules:
            request.settings.blocking_rules_to_generate_predictions = sql_rules

    background_tasks.add_task(process_match_job, job_id, request.table_name, request.settings.dict())
    return {"job_id": job_id, "status": "pending"}

@app.get("/job/{job_id}", response_model=JobStatus)
def get_job_status(job_id: str):
    """
    Check the status of a job.
    """
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    return jobs[job_id]

@app.get("/download/{filename}")
def download_result(filename: str):
    """
    Download a result file.
    """
    file_path = os.path.join(UPLOAD_DIR, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
    from fastapi.responses import FileResponse
    return FileResponse(file_path)
