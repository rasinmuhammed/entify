"""
Splink Entity Resolution Service
Provides clean, modular interface for running entity resolution with real Splink
"""
import io
import base64
from typing import Dict, List, Optional, Any
from pydantic import BaseModel, Field
import pandas as pd
from engine import EntityResolutionEngine, RuleTranspiler


class SplinkSettings(BaseModel):
    """Splink-compatible settings schema"""
    link_type: str = Field(default="dedupe_only", description="Type of linkage")
    unique_id_column_name: str = Field(default="id", description="Unique ID column")
    blocking_rules_to_generate_predictions: List[str] = Field(default_factory=list)
    comparisons: List[Dict[str, Any]] = Field(default_factory=list)
    
    class Config:
        json_schema_extra = {
            "example": {
                "link_type": "dedupe_only",
                "unique_id_column_name": "id",
                "blocking_rules_to_generate_predictions": [
                    "l.city = r.city"
                ],
                "comparisons": [
                    {
                        "output_column_name": "name",
                        "comparison_levels": [
                            {"sql_condition": "name_l = name_r", "label_for_charts": "Exact match"}
                        ]
                    }
                ]
            }
        }


class EntityResolutionRequest(BaseModel):
    """Request model for entity resolution"""
    data: str = Field(..., description="Base64-encoded CSV data")
    settings: SplinkSettings
    threshold: float = Field(default=0.5, ge=0.0, le=1.0)
    table_name: Optional[str] = Field(default="input_data")


class EntityResolutionResponse(BaseModel):
    """Response model for entity resolution"""
    status: str
    matches: List[Dict[str, Any]]
    total_pairs: int
    execution_time_ms: float
    clusters: Optional[List[Dict[str, Any]]] = None
    error: Optional[str] = None


class SplinkService:
    """
    Service layer for Splink entity resolution
    Clean separation of concerns from API layer
    """
    
    def __init__(self):
        self.engine: Optional[EntityResolutionEngine] = None
    
    def process_entity_resolution(
        self,
        data_csv: str,
        settings: Dict[str, Any],
        threshold: float = 0.5,
        table_name: str = "input_data"
    ) -> Dict[str, Any]:
        """
        Run entity resolution with Splink
        
        Args:
            data_csv: CSV data as string
            settings: Splink settings dictionary
            threshold: Match probability threshold
            table_name: Name for the DuckDB table
            
        Returns:
            Dictionary with matches and metadata
        """
        import time
        start_time = time.time()
        
        try:
            # Initialize engine
            self.engine = EntityResolutionEngine()
            
            # Save CSV to temporary file
            temp_csv_path = f"/tmp/{table_name}_{int(start_time)}.csv"
            with open(temp_csv_path, 'w') as f:
                f.write(data_csv)
            
            # Ingest data
            row_count = self.engine.ingest_data(temp_csv_path, table_name)
            print(f"✅ Ingested {row_count} rows")
            
            # Run Splink resolution
            predictions_df = self.engine.run_resolution(table_name, settings)
            
            # Filter by threshold
            matches = predictions_df[predictions_df['match_probability'] >= threshold]
            
            # Convert to JSON-serializable format
            matches_list = matches.to_dict(orient='records')
            
            # Get clusters (optional)
            clusters = None
            try:
                cluster_stats = self.engine.get_cluster_stats(threshold)
                clusters = cluster_stats
            except Exception as e:
                print(f"⚠️  Clustering failed: {e}")
            
            # Cleanup
            import os
            if os.path.exists(temp_csv_path):
                os.remove(temp_csv_path)
            
            execution_time_ms = (time.time() - start_time) * 1000
            
            return {
                "status": "success",
                "matches": matches_list,
                "total_pairs": len(matches_list),
                "execution_time_ms": round(execution_time_ms, 2),
                "clusters": clusters
            }
            
        except Exception as e:
            import traceback
            tb = traceback.format_exc()
            try:
                with open("last_error.log", "w") as f:
                    f.write(tb)
            except:
                pass
            
            return {
                "status": "error",
                "matches": [],
                "total_pairs": 0,
                "execution_time_ms": (time.time() - start_time) * 1000,
                "error": str(e),
                "traceback": tb
            }
    
    def get_data_profile(self, data_csv: str, table_name: str = "profile_data") -> Dict[str, Any]:
        """
        Profile uploaded dataset
        
        Returns:
            Dictionary with column statistics
        """
        try:
            engine = EntityResolutionEngine()
            
            # Save CSV temporarily
            temp_path = f"/tmp/{table_name}_profile.csv"
            with open(temp_path, 'w') as f:
                f.write(data_csv)
            
            engine.ingest_data(temp_path, table_name)
            profile = engine.profile_data(table_name)
            
            # Cleanup
            import os
            if os.path.exists(temp_path):
                os.remove(temp_path)
            
            return profile
            
        except Exception as e:
            return {"error": str(e)}
