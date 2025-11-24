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
            
            # Ensure blocking rules are present; if none provided, use empty lists
            if "blocking_rules_to_generate_predictions" not in settings:
                settings["blocking_rules_to_generate_predictions"] = []
            # Ensure blocking_rules key exists (Splink may auto-generate defaults otherwise)
            if "blocking_rules" not in settings:
                settings["blocking_rules"] = []
            # Ensure comparisons key exists (Splink expects it)
            if "comparisons" not in settings:
                settings["comparisons"] = []
            # Remove any unsupported 'blocking_rules' key (Splink expects only blocking_rules_to_generate_predictions)
            # (No action needed now as we keep the empty list above)
            # Ensure each comparison has at least two levels (match + else) to avoid Splink division by zero
            if isinstance(settings.get("comparisons"), list):
                for comp in settings["comparisons"]:
                    levels = comp.get("comparison_levels", [])
                    if len(levels) == 1:
                        # Add an else level
                        levels.append({
                            "sql_condition": "1=1",
                            "label_for_charts": "Else"
                        })
                        comp["comparison_levels"] = levels
            # After ingest, fetch column names to validate blocking rules
            col_info = self.engine.con.execute(f"PRAGMA table_info({table_name})").fetchdf()
            existing_columns = set(col_info['name'])
            import re
            def rule_is_valid(rule: str) -> bool:
                # Find column names referenced as l.column or r.column
                cols = re.findall(r"[lr]\.([a-zA-Z_][a-zA-Z0-9_]*)", rule)
                return all(col in existing_columns for col in cols)
            # Filter blocking_rules_to_generate_predictions
            if isinstance(settings.get("blocking_rules_to_generate_predictions"), list):
                settings["blocking_rules_to_generate_predictions"] = [r for r in settings["blocking_rules_to_generate_predictions"] if rule_is_valid(r)]
            # Filter blocking_rules (if present)
            if isinstance(settings.get("blocking_rules"), list):
                settings["blocking_rules"] = [r for r in settings["blocking_rules"] if rule_is_valid(r)]
            
            # Remove the blocking_rules key - Splink doesn't accept it, only blocking_rules_to_generate_predictions
            if "blocking_rules" in settings:
                del settings["blocking_rules"]
            
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
