"""
Splink-Compatible Entity Resolution Engine for Pyodide/WASM
Implements Fellegi-Sunter probabilistic matching with Splink settings schema

Note: Real Splink cannot run in browser due to C-extension dependencies (duckdb, rapidfuzz).
This engine implements Splink's API and settings format for compatibility.
"""
import js
import json
import asyncio
from typing import List, Dict, Any
import re

print("🚀 Entify Matcher Loading (Splink-Compatible)...")


class SplinkCompatibleMatcher:
    """
    Entity Resolution engine compatible with Splink's settings schema
    
    Supports:
    - Splink blocking_rules format
    - Splink comparisons format  
    - Fellegi-Sunter probability calculations
    - Settings JSON export for real Splink on Databricks
    """
    
    def __init__(self, table_name: str, settings: Dict[str, Any]):
        self.table_name = table_name
        self.settings = settings
        self.link_type = settings.get("link_type", "dedupe_only")
        
        # Parse Splink settings
        self.blocking_rules = settings.get("blocking_rules_to_generate_predictions", [])
        self.comparisons = settings.get("comparisons", [])
        self.unique_id_column = settings.get("unique_id_column_name", "id")
        
        print(f"📋 Loaded {len(self.comparisons)} comparison rules")
        print(f"🚧 Loaded {len(self.blocking_rules)} blocking rules")
        
    async def _execute_sql(self, sql: str) -> List[Dict]:
        """Execute SQL via DuckDB-WASM JavaScript bridge"""
        print(f"📊 Executing SQL... ({len(sql)} chars)")
        result_proxy = await js.js_run_query(sql)
        return result_proxy.to_py()
    
    def _parse_blocking_rule(self, rule: str) -> str:
        """
        Convert Splink blocking rule to DuckDB SQL
        Examples:
          - "l.first_name = r.first_name" -> "l.first_name = r.first_name"
          - "block_on('surname')" -> "l.surname = r.surname"
        """
        # Handle block_on() function format
        block_on_match = re.search(r"block_on\(['\"](\w+)['\"]\)", rule)
        if block_on_match:
            col = block_on_match.group(1)
            return f"l.{col} = r.{col}"
        
        # Direct SQL condition
        return rule
    
    def _generate_comparison_sql(self, comparison: Dict) -> List[str]:
        """
        Generate SQL for a single comparison using Splink's comparison_levels
        Returns list of CASE statements for each level
        """
        col = comparison["output_column_name"]
        levels = comparison.get("comparison_levels", [])
        
        if not levels:
            # Default: exact match only
            return [f"CASE WHEN l.{col} = r.{col} THEN 2.0 ELSE -2.0 END as {col}_weight"]
        
        # Build CASE statement from levels
        case_parts = []
        for idx, level in enumerate(levels):
            sql_cond = level.get("sql_condition", "")
            m_probability = level.get("m_probability", 0.9 if idx == 0 else 0.1)
            u_probability = level.get("u_probability", 0.01)
            
            # Calculate match weight using Fellegi-Sunter formula
            # weight = log2(m_probability / u_probability)
            import math
            if u_probability > 0:
                weight = math.log2(m_probability / u_probability)
            else:
                weight = 10.0  # High weight for exact matches
            
            # Convert Splink SQL placeholders to DuckDB
            duckdb_cond = sql_cond.replace("_l", f"_l").replace("_r", f"_r")
            duckdb_cond = duckdb_cond.replace(f"{col}_l", f"l.{col}")
            duckdb_cond = duckdb_cond.replace(f"{col}_r", f"r.{col}")
            
            case_parts.append(f"WHEN {duckdb_cond} THEN {weight}")
        
        case_parts.append(f"ELSE -2.0")  # Else clause for non-match
        
        case_sql = f"CASE {' '.join(case_parts)} END as {col}_weight"
        return [case_sql]
    
    async def predict(self, threshold: float = 0.5, max_pairs: int = 1000) -> List[Dict]:
        """
        Run entity resolution matching
        
        Args:
            threshold: Match probability threshold (0.0 - 1.0)
            max_pairs: Maximum number of pairs to return
            
        Returns:
            List of matched pairs with probabilities
        """
        print(f"🔍 Starting matching (threshold={threshold})...")
        
        # Step 1: Build blocking SQL
        if self.blocking_rules:
            blocking_conditions = [
                f"({self._parse_blocking_rule(rule)})"
                for rule in self.blocking_rules
            ]
            blocking_sql = " OR ".join(blocking_conditions)
        else:
            # Default blocking: first letter of name
            print("⚠️  No blocking rules defined, using default (first letter)")
            blocking_sql = "substr(CAST(l.name AS VARCHAR), 1, 1) = substr(CAST(r.name AS VARCHAR), 1, 1)"
        
        # Step 2: Build comparison SQL
        comparison_sqls = []
        weight_columns = []
        
        for comp in self.comparisons:
            comp_sql_list = self._generate_comparison_sql(comp)
            comparison_sqls.extend(comp_sql_list)
            weight_columns.append(f"{comp['output_column_name']}_weight")
        
        if not comparison_sqls:
            # Default: single comparison on first column
            comparison_sqls = ["CASE WHEN l.name = r.name THEN 2.0 ELSE -2.0 END as name_weight"]
            weight_columns = ["name_weight"]
        
        # Step 3: Calculate total match weight and probability
        total_weight_sql = " + ".join(weight_columns)
        
        # Fellegi-Sunter: P(match) = 1 / (1 + exp(-total_weight))
        probability_sql = f"1.0 / (1.0 + exp(-({total_weight_sql})))"
        
        # Step 4: Build full SQL query
        sql = f"""
        WITH candidate_pairs AS (
            SELECT DISTINCT
                l.{self.unique_id_column} as id_l,
                r.{self.unique_id_column} as id_r,
                l.* as record_l,
                r.* as record_r
            FROM {self.table_name} l
            INNER JOIN {self.table_name} r
            ON ({blocking_sql})
            WHERE l.{self.unique_id_column} < r.{self.unique_id_column}
            LIMIT 10000
        ),
        scored_pairs AS (
            SELECT
                *,
                {', '.join(comparison_sqls)},
                {total_weight_sql} as match_weight,
                {probability_sql} as match_probability
            FROM candidate_pairs
        )
        SELECT *
        FROM scored_pairs
        WHERE match_probability >= {threshold}
        ORDER BY match_probability DESC
        LIMIT {max_pairs}
        """
        
        # Execute
        results = await self._execute_sql(sql)
        
        print(f"✅ Matching complete: {len(results)} pairs found (threshold={threshold})")
        return results
    
    def export_settings(self) -> str:
        """
        Export settings as JSON compatible with real Splink
        This JSON can be used with Splink on Databricks/Spark
        """
        return json.dumps(self.settings, indent=2)


async def run_entity_resolution(
    table_name: str,
    settings_json: str,
    threshold: float = 0.7,
    max_pairs: int = 1000
) -> str:
    """
    Main entry point for Splink-compatible entity resolution
    
    Args:
        table_name: DuckDB-WASM table name
        settings_json: Splink-format settings as JSON string
        threshold: Match probability threshold (0.0 - 1.0)
        max_pairs: Maximum pairs to return
        
    Returns:
        JSON string with results
    """
    try:
        print(f"🔍 Entify Entity Resolution")
        print(f"   Table: {table_name}")
        print(f"   Threshold: {threshold}")
        
        settings = json.loads(settings_json)
        
        # Initialize matcher
        matcher = SplinkCompatibleMatcher(table_name, settings)
        
        # Run matching
        matches = await matcher.predict(threshold, max_pairs)
        
        result = {
            "status": "success",
            "engine": "entify_splink_compatible",
            "matches": matches,
            "total_pairs": len(matches),
            "threshold": threshold,
            "settings": settings  # Include settings for debugging
        }
        
        print(f"✅ Entity resolution complete!")
        return json.dumps(result)
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return json.dumps({
            "status": "error",
            "error": str(e),
            "traceback": traceback.format_exc()
        })


# Backwards-compatible wrapper
async def run_splink_match(table_name: str, settings_json: str) -> str:
    """Legacy function for compatibility"""
    return await run_entity_resolution(table_name, settings_json, threshold=0.5)


print("✅ Entify Matcher Ready")
print("   Engine: Splink-Compatible (Pure Python + SQL)")
print("   Settings: Exportable to real Splink on Databricks")


