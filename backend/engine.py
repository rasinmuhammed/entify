import duckdb
from splink import Linker, SettingsCreator, block_on
from splink.backends.duckdb import DuckDBAPI
import pandas as pd
import os

class RuleTranspiler:
    """
    Converts frontend JSON blocking rules into Splink SQL conditions.
    """
    @staticmethod
    def compile_part(part):
        field = part.get("field")
        method = part.get("method")
        params = part.get("parameters", {})
        
        if not field:
            return None
            
        # Handle spaces in column names
        l_field = f'l."{field}"' if " " in field else f"l.{field}"
        r_field = f'r."{field}"' if " " in field else f"r.{field}"
        
        if method == "exact":
            return f"{l_field} = {r_field}"
        elif method == "fuzzy_levenshtein":
            # DuckDB levenshtein returns distance. <= 2 is a reasonable default for "looks like"
            threshold = params.get("threshold", 2)
            return f"levenshtein({l_field}, {r_field}) <= {threshold}"
        elif method == "jaro_winkler":
            threshold = params.get("threshold", 0.9)
            return f"jaro_winkler_similarity({l_field}, {r_field}) > {threshold}"
        elif method == "fuzzy_metaphone":
            # Requires dmetaphone function. If not available, fallback to soundex
            return f"soundex({l_field}) = soundex({r_field})"
        elif method == "first_n_chars":
            n = params.get("n", 1)
            return f"SUBSTRING({l_field}, 1, {n}) = SUBSTRING({r_field}, 1, {n})"
        else:
            return f"{l_field} = {r_field}"

    @staticmethod
    def compile_rule(rule):
        parts = rule.get("parts", [])
        conditions = [RuleTranspiler.compile_part(p) for p in parts]
        conditions = [c for c in conditions if c]
        
        if not conditions:
            return None
            
        return " AND ".join(conditions)

class EntityResolutionEngine:
    def __init__(self, db_path=":memory:", memory_limit="2GB"):
        """Initialize the engine with a DuckDB connection."""
        self.con = duckdb.connect(database=db_path)
        
        # Configure memory limit to prevent crashes
        self.con.execute(f"SET memory_limit='{memory_limit}'")
        
        # Install/Load httpfs for URL ingestion
        try:
            self.con.execute("INSTALL httpfs; LOAD httpfs;")
        except Exception as e:
            print(f"Warning: Could not load httpfs extension. URL ingestion may fail. {e}")

        self.linker = None
        self.predictions = None

    def ingest_data(self, source, table_name="input_data"):
        """
        Load data from a CSV/Parquet file path or URL into DuckDB.
        """
        # Check if source is a URL
        is_url = source.startswith("http://") or source.startswith("https://")
        
        # Determine extension
        if is_url:
            # Naive extension check for URL, might need improvement
            if ".csv" in source:
                file_ext = ".csv"
            elif ".parquet" in source:
                file_ext = ".parquet"
            else:
                # Default to CSV if unknown for now
                file_ext = ".csv"
        else:
            file_ext = os.path.splitext(source)[1].lower()
        
        if file_ext == '.csv':
            self.con.execute(f"CREATE OR REPLACE TABLE {table_name} AS SELECT * FROM read_csv_auto('{source}')")
        elif file_ext == '.parquet':
            self.con.execute(f"CREATE OR REPLACE TABLE {table_name} AS SELECT * FROM read_parquet('{source}')")
        else:
            raise ValueError(f"Unsupported file format: {file_ext}")
            
        return self.con.execute(f"SELECT COUNT(*) FROM {table_name}").fetchone()[0]

    def profile_data(self, table_name="input_data"):
        """
        Return basic statistics about the dataset.
        """
        # Get column names and types
        # DESCRIBE returns tuples like (column_name, column_type, null, key, default, extra)
        describe_result = self.con.execute(f"DESCRIBE {table_name}").fetchall()
        columns_info = {col[0]: col[1] for col in describe_result}
        columns = [col[0] for col in describe_result]
        
        profile = {}
        total_rows = self.con.execute(f"SELECT COUNT(*) FROM {table_name}").fetchone()[0]
        profile['total_rows'] = total_rows
        
        column_stats = []
        for col in columns:
            null_count = self.con.execute(f"SELECT COUNT(*) FROM {table_name} WHERE {col} IS NULL").fetchone()[0]
            unique_count = self.con.execute(f"SELECT COUNT(DISTINCT {col}) FROM {table_name}").fetchone()[0]
            column_stats.append({
                'column': col,
                'type': columns_info[col],
                'null_percentage': (null_count / total_rows) * 100 if total_rows > 0 else 0,
                'unique_count': unique_count
            })
            
        profile['columns'] = column_stats
        return profile

    def configure_settings(self, unique_id_col_name="id", link_type="dedupe_only", blocking_rules=None, comparisons=None):
        """
        Generate Splink settings dictionary.
        """
        settings = {
            "link_type": link_type,
            "unique_id_column_name": unique_id_col_name,
        }
        
        if blocking_rules:
            settings["blocking_rules_to_generate_predictions"] = blocking_rules
            settings["blocking_rules"] = blocking_rules
        else:
            settings["blocking_rules_to_generate_predictions"] = []
            settings["blocking_rules"] = []
        
        if comparisons:
            settings["comparisons"] = comparisons
            
        return settings

    def run_resolution(self, table_name, settings):
        """
        Initialize and run the Splink linker.
        """
        # Initialize DuckDBAPI with existing connection
        db_api = DuckDBAPI(connection=self.con)
        
        # Remove threshold if present, as it's not a valid Splink setting
        if "threshold" in settings:
            settings.pop("threshold")
        
        # Initialize Linker
        self.linker = Linker(table_name, settings, db_api=db_api)
        
        # Estimate u and m parameters (simplified workflow)
        try:
            # Only run estimation if we have enough data
            count = self.con.execute(f"SELECT COUNT(*) FROM {table_name}").fetchone()[0]
            
            # Check if using full comparison (no blocking)
            blocking_rules = settings.get("blocking_rules_to_generate_predictions", [])
            using_full_comparison = not blocking_rules or len(blocking_rules) == 0
            
            if using_full_comparison:
                total_pairs = (count * (count - 1)) / 2
                print(f"🔄 NO BLOCKING RULES - Full N×N comparison enabled")
                print(f"   Dataset: {count:,} rows → {total_pairs:,.0f} potential pairs")
                if count > 10000:
                    print(f"   ⚠️  WARNING: Large dataset! This may be slow.")
            else:
                print(f"🔒 Using {len(blocking_rules)} blocking rule(s)")
                for i, rule in enumerate(blocking_rules, 1):
                    print(f"   Rule {i}: {rule}")
            
            if count > 50:
                print(f"🧠 Training model using random sampling (max_pairs=1e6)...")
                self.linker.training.estimate_u_using_random_sampling(max_pairs=1e6)
                print(f"✅ Training complete")
            else:
                print(f"⚠️  Skipping u-estimation: too few rows ({count})")
        except Exception as e:
            print(f"⚠️  Estimation failed (continuing with defaults): {e}")
        
        # Predict
        print(f"🔮 Running predictions...")
        self.predictions = self.linker.inference.predict(threshold_match_probability=0.5)
        
        return self.predictions.as_pandas_dataframe()

    def get_sample_data(self, table_name, limit=5):
        """
        Return a sample of rows from the dataset.
        """
        result = self.con.execute(f"SELECT * FROM {table_name} LIMIT {limit}").fetchdf()
        # Convert to list of dicts for JSON response
        return result.to_dict(orient='records')

    def get_uncertain_pairs(self, threshold_lower=0.4, threshold_upper=0.6, limit=10):
        """
        Return pairs with match probability between thresholds.
        Requires predictions to be available.
        """
        if not self.predictions:
            return []
            
        # Query the predictions dataframe (which is a Splink DataFrame wrapper)
        # We need to convert to pandas or use SQL on the underlying table
        # Splink predictions are usually in a table named 'df_predict_...' in DuckDB
        # But self.predictions.as_pandas_dataframe() is easiest for small data
        
        # Optimization: Use SQL directly if possible to avoid loading all predictions
        pred_table = self.predictions.physical_name
        
        query = f"""
        SELECT * 
        FROM {pred_table} 
        WHERE match_probability > {threshold_lower} 
          AND match_probability < {threshold_upper}
        LIMIT {limit}
        """
        
        try:
            df = self.con.execute(query).fetchdf()
            
            # Format for frontend: needs 'left' and 'right' objects
            pairs = []
            for _, row in df.iterrows():
                # Identify left and right columns
                left_cols = {k.replace("_l", ""): v for k, v in row.items() if k.endswith("_l")}
                right_cols = {k.replace("_r", ""): v for k, v in row.items() if k.endswith("_r")}
                
                pairs.append({
                    "id": f"{row.get('source_dataset_l', '')}_{row.get('unique_id_l', '')}-{row.get('source_dataset_r', '')}_{row.get('unique_id_r', '')}",
                    "score": row['match_probability'],
                    "left": left_cols,
                    "right": right_cols
                })
            return pairs
        except Exception as e:
            print(f"Error fetching uncertain pairs: {e}")
            return []

    def get_score_histogram(self):
        """
        Return match score distribution.
        """
        if not self.predictions:
            return []
            
        pred_table = self.predictions.physical_name
        
        # Create bins
        query = f"""
        SELECT 
            FLOOR(match_probability * 10) / 10.0 as bin_start,
            COUNT(*) as count
        FROM {pred_table}
        GROUP BY bin_start
        ORDER BY bin_start
        """
        
        try:
            df = self.con.execute(query).fetchdf()
            histogram = []
            for _, row in df.iterrows():
                bin_start = row['bin_start']
                bin_end = round(bin_start + 0.1, 1)
                histogram.append({
                    "range": f"{bin_start:.1f}-{bin_end:.1f}",
                    "count": int(row['count'])
                })
            return histogram
        except Exception as e:
            print(f"Error fetching histogram: {e}")
            return []

    def get_cluster_stats(self, threshold=0.9):
        """
        Return cluster size statistics.
        """
        if not self.linker or not self.predictions:
            return []
            
        # Run clustering if not already done/cached (simplified)
        df_clusters = self.linker.clustering.cluster_pairwise_predictions_at_threshold(self.predictions, threshold_match_probability=threshold)
        cluster_table = df_clusters.physical_name
        
        query = f"""
        WITH cluster_counts AS (
            SELECT cluster_id, COUNT(*) as cluster_size
            FROM {cluster_table}
            GROUP BY cluster_id
        )
        SELECT 
            CASE 
                WHEN cluster_size = 1 THEN 'Singletons'
                WHEN cluster_size = 2 THEN 'Pairs'
                WHEN cluster_size = 3 THEN 'Triplets'
                ELSE 'Large Groups (4+)'
            END as size_category,
            COUNT(*) as count
        FROM cluster_counts
        GROUP BY size_category
        """
        
        try:
            df = self.con.execute(query).fetchdf()
            stats = []
            for _, row in df.iterrows():
                stats.append({
                    "name": row['size_category'],
                    "value": int(row['count'])
                })
            return stats
        except Exception as e:
            print(f"Error fetching cluster stats: {e}")
            return []

    def get_match_weights_chart(self):
        """
        Generate match weights chart HTML.
        """
        if not self.linker:
            return None
        
        try:
            # Splink 3.x method
            chart = self.linker.match_weights_chart()
            # The chart object has a .as_html() method or similar, or simply str(chart) might work depending on version
            # Usually chart.spec is a dict, we want the HTML wrapper
            # Let's try to get the HTML directly if possible, or save to string
            # Splink charts are Altair/Vega-Lite based.
            
            # In recent Splink versions, we can get html string
            import json
            if hasattr(chart, "to_json"):
                 # This returns the spec, frontend needs to render it or we return full HTML
                 # Let's try to return the standalone HTML which is easier for now
                 pass
            
            # Use a temporary file to get the HTML string if no direct method exists
            # Or use chart.save(None) trick?
            # Actually, chart.to_html() is standard in many libraries.
            # Splink's chart objects usually have a way to export.
            
            # Let's assume we can get the spec and wrap it, or use splink's internal display logic
            # For now, let's try to return the spec as a string, or look for a method.
            # Checking Splink docs (mental check): linker.match_weights_chart() returns a SplinkChart.
            # SplinkChart has .save("path.html").
            
            # We will save to a temp string buffer
            # Actually, let's try to just return the spec and let frontend render? 
            # No, the requirement was "Splink HTML charts".
            
            # Hack: save to temp file and read back
            import tempfile
            with tempfile.NamedTemporaryFile(mode='w+', suffix='.html', delete=False) as tmp:
                chart.save(tmp.name, overwrite=True)
                tmp.seek(0)
                html_content = tmp.read()
                tmp.close()
                os.unlink(tmp.name)
                return html_content
                
        except Exception as e:
            print(f"Error generating match weights chart: {e}")
            return None

    def get_waterfall_chart(self, record_id_1, record_id_2):
        """
        Generate waterfall chart HTML for a pair.
        """
        if not self.linker:
            return None
            
        try:
            # We need to handle IDs. If they are integers in the data, we must convert.
            # If they are strings, keep as strings.
            # We can try to infer type from the unique_id column in the database
            # But for now, let's try both or just pass as is.
            
            # Splink waterfall_chart takes a dict of records or just IDs?
            # linker.waterfall_chart(records) usually.
            
            # We need to find the records first.
            # Or use linker.waterfall_chart(match_weight_record)
            
            # Better approach: find the specific prediction record
            # self.predictions is a SplinkDataFrame
            # We can query it for the pair
            
            # Construct a filter
            # We need to know the unique ID column name
            uid = self.linker._settings_obj._unique_id_column_name
            
            # This might be complex to query efficiently from the linker's prediction object if it's large.
            # However, linker.waterfall_chart often accepts the records themselves.
            
            # Let's try to fetch the records from the input data
            # This is "explain the match between these two records"
            
            # Fetch record 1
            # We need to handle potential type mismatch (int vs str)
            # Try to cast to int if it looks like one
            def try_cast(val):
                try:
                    return int(val)
                except:
                    return val
            
            rid1 = try_cast(record_id_1)
            rid2 = try_cast(record_id_2)
            
            records = self.con.execute(f"SELECT * FROM {self.linker._input_table_name} WHERE {uid} = ? OR {uid} = ?", [rid1, rid2]).fetchdf().to_dict(orient='records')
            
            if len(records) != 2:
                print(f"Could not find both records: {rid1}, {rid2}. Found {len(records)}")
                return None
                
            # Sort so we pass them in consistent order if needed, or just pass list
            chart = self.linker.waterfall_chart(records)
            
            import tempfile
            with tempfile.NamedTemporaryFile(mode='w+', suffix='.html', delete=False) as tmp:
                chart.save(tmp.name, overwrite=True)
                tmp.seek(0)
                html_content = tmp.read()
                tmp.close()
                os.unlink(tmp.name)
                return html_content
                
        except Exception as e:
            print(f"Error generating waterfall chart: {e}")
            import traceback
            traceback.print_exc()
            return None
