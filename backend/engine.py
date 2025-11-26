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
        Generate profiling stats for the dataset.
        """
        row_count = self.con.execute(f"SELECT COUNT(*) FROM {table_name}").fetchone()[0]
        
        # Get column names
        columns = self.con.execute(f"PRAGMA table_info({table_name})").fetchall()
        column_names = [col[1] for col in columns]
        
        # Basic stats
        profile = {
            "row_count": row_count,
            "column_count": len(column_names),
            "columns": []
        }
        
        for col_name in column_names:
            try:
                # Count distinct and nulls
                distinct_count = self.con.execute(f'SELECT COUNT(DISTINCT "{col_name}") FROM {table_name}').fetchone()[0]
                null_count = self.con.execute(f'SELECT COUNT(*) FROM {table_name} WHERE "{col_name}" IS NULL').fetchone()[0]
                
                profile["columns"].append({
                    "name": col_name,
                    "distinct_count": distinct_count,
                    "null_count": null_count,
                    "null_percentage": (null_count / row_count * 100) if row_count > 0 else 0
                })
            except Exception as e:
                print(f"Could not profile column {col_name}: {e}")
        
        return profile

    def run_resolution(self, table_name, settings, primary_key_column=None):
        """
        Initialize and run the Splink linker.
        
        Args:
            table_name: Name of the table to run linkage on
            settings: Splink settings dictionary
            primary_key_column: Name of the column to use as unique identifier (optional)
        """
        # Initialize DuckDBAPI with existing connection
        db_api = DuckDBAPI(connection=self.con)
        
        # Remove threshold if present, as it's not a valid Splink setting
        if "threshold" in settings:
            settings.pop("threshold")
        
        # Set the unique_id_column_name if primary key is provided
        if primary_key_column:
            settings["unique_id_column_name"] = primary_key_column
            print(f"✅ Using primary key column: {primary_key_column}")
        elif "unique_id_column_name" not in settings:
            # Auto-detect if not provided
            print("⚠️  No primary key specified - Splink will try to auto-detect")
        
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
        return self.con.execute(f"SELECT * FROM {table_name} LIMIT {limit}").fetchdf().to_dict(orient='records')

    def get_score_distribution(self, num_bins=10):
        """
        Get distribution of match probabilities across all predictions.
        Helps visualize natural clustering of scores and choose thresholds.
        
        Args:
            num_bins: Number of histogram bins (default 10)
            
        Returns:
            Dictionary with bins, counts, and summary statistics
        """
        if not self.predictions:
            return {
                "error": "No predictions available. Run matching first."
            }
        
        try:
            import numpy as np
            
            # Get predictions as pandas DataFrame
            df = self.predictions.as_pandas_dataframe()
            
            # Create histogram bins
            bins = np.linspace(0, 1.0, num_bins + 1)
            counts, edges = np.histogram(df['match_probability'], bins=bins)
            
            # Calculate summary statistics
            mean_score = float(df['match_probability'].mean())
            median_score = float(df['match_probability'].median())
            std_score = float(df['match_probability'].std())
            
            return {
                "bins": bins.tolist(),
                "counts": counts.tolist(),
                "total_comparisons": len(df),
                "statistics": {
                    "mean": mean_score,
                    "median": median_score,
                    "std": std_score,
                    "min": float(df['match_probability'].min()),
                    "max": float(df['match_probability'].max())
                }
            }
        except Exception as e:
            print(f"Error generating score distribution: {e}")
            import traceback
            traceback.print_exc()
            return {"error": str(e)}

    def analyze_thresholds(self, thresholds=None):
        """
        Analyze matching performance at different threshold values.
        Shows how match count, cluster count, and other metrics change.
        
        Args:
            thresholds: List of thresholds to analyze (default: [0.5, 0.7, 0.8, 0.9, 0.95])
            
        Returns:
            List of dictionaries with metrics for each threshold
        """
        if not self.predictions:
            return {
                "error": "No predictions available. Run matching first."
            }
        
        if thresholds is None:
            thresholds = [0.5, 0.6, 0.7, 0.8, 0.9, 0.95]
        
        try:
            results = []
            df = self.predictions.as_pandas_dataframe()
            
            for threshold in thresholds:
                # Count matches at this threshold
                matches_at_threshold = df[df['match_probability'] >= threshold]
                match_count = len(matches_at_threshold)
                
                # Try to get cluster statistics
                try:
                    df_clusters = self.linker.clustering.cluster_pairwise_predictions_at_threshold(
                        self.predictions,
                        threshold_match_probability=threshold
                    )
                    
                    # Get cluster sizes
                    cluster_sizes = self.con.execute(f"""
                        SELECT cluster_id, COUNT(*) as size
                        FROM {df_clusters.physical_name}
                        GROUP BY cluster_id
                    """).fetchdf()
                    
                    total_clusters = len(cluster_sizes)
                    singleton_count = int((cluster_sizes['size'] == 1).sum())
                    avg_cluster_size = float(cluster_sizes['size'].mean()) if len(cluster_sizes) > 0 else 0
                    max_cluster_size = int(cluster_sizes['size'].max()) if len(cluster_sizes) > 0 else 0
                    
                except Exception as cluster_error:
                    print(f"Warning: Could not compute clusters for threshold {threshold}: {cluster_error}")
                    total_clusters = 0
                    singleton_count = 0
                    avg_cluster_size = 0
                    max_cluster_size = 0
                
                results.append({
                    "threshold": threshold,
                    "match_count": match_count,
                    "cluster_count": total_clusters,
                    "singleton_count": singleton_count,
                    "avg_cluster_size": round(avg_cluster_size, 2),
                    "max_cluster_size": max_cluster_size,
                    "avg_match_probability": round(float(matches_at_threshold['match_probability'].mean()), 3) if match_count > 0 else 0
                })
            
            return {
                "thresholds": results,
                "total_predictions": len(df)
            }
            
        except Exception as e:
            print(f"Error analyzing thresholds: {e}")
            import traceback
            traceback.print_exc()
            return {"error": str(e)}

    def get_clusters(self, threshold=0.9):
        """
        Get clusters from predictions.
        Requires predictions to be available.
        """
        if not self.predictions:
            return []
        
        # Query the predictions dataframe (which is a Splink DataFrame wrapper)
        
        # Splink predictions are usually in a table named 'df_predict_...' in DuckDB
        # But self.predictions.as_pandas_dataframe() is easiest for small data
        
        # Optimization: Use SQL directly if possible to avoid loading all predictions
        pred_table = self.predictions.physical_name
        
        query = f"""
        SELECT 
            unique_id_l as left_id,
            unique_id_r as right_id,
            match_probability
        FROM {pred_table}
        WHERE match_probability >= {threshold}
        ORDER BY match_probability DESC
        """
        
        return self.con.execute(query).fetchdf().to_dict(orient='records')
    
    def get_clusters_data(self, table_name, threshold=0.5, id_column='unique_id'):
        """
        Get clusters merged with original data as a list of dictionaries.
        """
        if not self.predictions:
            raise ValueError("No predictions available. Run matching first.")
        
        try:
            import pandas as pd
            
            # Get clusters using Splink's clustering
            df_clusters = self.linker.clustering.cluster_pairwise_predictions_at_threshold(
                self.predictions,
                threshold_match_probability=threshold
            )
            
            # Get clusters as dataframe
            clusters_df = self.con.execute(f"""
                SELECT 
                    {id_column} as unique_id,
                    cluster_id
                FROM {df_clusters.physical_name}
            """).fetchdf()
            
            # Get original data
            try:
                original_df = self.con.execute(f"""
                    SELECT * FROM {table_name}
                """).fetchdf()
            except Exception as e:
                if "does not exist" in str(e):
                    raise ValueError(f"Original table '{table_name}' not found. Please re-load your data and run matching again.")
                raise e
            
            # Ensure ID column is string for consistent merging
            if id_column in original_df.columns:
                # Rename to unique_id for merging if different
                if id_column != 'unique_id':
                    original_df = original_df.rename(columns={id_column: 'unique_id'})
            
            original_df['unique_id'] = original_df['unique_id'].astype(str)
            clusters_df['unique_id'] = clusters_df['unique_id'].astype(str)
            
            # Merge original data with cluster assignments
            result_df = original_df.merge(
                clusters_df,
                on='unique_id',
                how='left'  # Keep all original records, even if not matched
            )
            
            # Assign cluster_id to singletons (records not in any cluster)
            null_mask = result_df['cluster_id'].isnull()
            result_df.loc[null_mask, 'cluster_id'] = 'singleton_' + result_df.loc[null_mask, 'unique_id'].astype(str)
            
            # Add cluster size
            cluster_sizes = result_df.groupby('cluster_id').size()
            result_df['cluster_size'] = result_df['cluster_id'].map(cluster_sizes)
            
            # Reorder columns: unique_id, cluster_id, cluster_size, then original columns
            cols = result_df.columns.tolist()
            if 'unique_id' in cols: cols.remove('unique_id')
            if 'cluster_id' in cols: cols.remove('cluster_id')
            if 'cluster_size' in cols: cols.remove('cluster_size')
            
            # Add them at the front
            new_cols = ['unique_id', 'cluster_id', 'cluster_size'] + cols
            result_df = result_df[new_cols]
            
            # Sort by cluster_id for better readability
            result_df = result_df.sort_values(['cluster_size', 'cluster_id'], ascending=[False, True])
            
            # Replace NaN with None for JSON compatibility
            result_df = result_df.where(pd.notnull(result_df), None)
            
            return result_df.to_dict(orient='records')
            
        except Exception as e:
            print(f"Error getting cluster data: {e}")
            raise e

    def export_clusters_with_data(self, table_name, threshold=0.5, id_column='unique_id'):
        """
        Export clusters merged with original data.
        Returns CSV string with all original columns + cluster_id + cluster_size.
        """
        try:
            data = self.get_clusters_data(table_name, threshold, id_column)
            import pandas as pd
            df = pd.DataFrame(data)
            csv_output = df.to_csv(index=False)
            print(f"✅ Exported {len(df)} records")
            return csv_output
        except Exception as e:
            print(f"Error exporting clusters: {e}")
            return f"error: {str(e)}"

    def run_em_estimation(self, blocking_rule):
        """
        Run Expectation Maximization to estimate m parameters.
        """
        if not self.linker:
            raise ValueError("Linker not initialized. Run resolution first.")
            
        try:
            print(f"🧠 Running EM estimation with rule: {blocking_rule}")
            self.linker.training.estimate_parameters_using_expectation_maximisation(blocking_rule)
            return {"status": "success", "message": f"EM estimation complete for rule: {blocking_rule}"}
        except Exception as e:
            print(f"Error running EM estimation: {e}")
            return {"status": "error", "message": str(e)}

    def count_pairs_for_rule(self, table_name, blocking_rule):
        """
        Count the number of pairs generated by a blocking rule.
        """
        try:
            # Ensure table exists
            exists = self.con.execute(f"SELECT count(*) FROM information_schema.tables WHERE table_name = '{table_name}'").fetchone()[0]
            if not exists:
                return {"status": "error", "message": f"Table {table_name} not found"}

            # Simple SQL count
            # Note: Assuming unique_id exists. If not, we might need to handle it.
            # But for now, we assume standard setup.
            query = f"""
                SELECT count(*) 
                FROM "{table_name}" as l, "{table_name}" as r 
                WHERE l.unique_id < r.unique_id 
                AND {blocking_rule}
            """
            count = self.con.execute(query).fetchone()[0]
            return {"status": "success", "count": count}
        except Exception as e:
            print(f"Error counting pairs: {e}")
            return {"status": "error", "message": str(e)}

    def get_model_settings(self):
        """
        Get the current model settings (parameters).
        """
        if not self.linker:
            return None
        return self.linker._settings_obj.as_dict()

    def get_match_weights_chart_data(self):
        """
        Get data for match weights chart (Vega-Lite spec).
        """
        if not self.linker:
            return None
        try:
            return self.linker.match_weights_chart()
        except Exception as e:
            print(f"Error getting match weights chart: {e}")
            return None
    
    def get_match_weights_histogram(self):
        """
        Return data for a match weights histogram.
        """
        if not self.predictions:
            return []
        
        pred_table = self.predictions.physical_name
        
        try:
            query = f"""
            SELECT 
                CAST(ROUND(match_probability * 10) / 10 AS DECIMAL(3,1)) as bin,
                COUNT(*) as count
            FROM {pred_table}
            GROUP BY bin
            ORDER BY bin
            """
            
            return self.con.execute(query).fetchdf().to_dict(orient='records')
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
        ORDER BY size_category
        """
        
        return self.con.execute(query).fetchdf().to_dict(orient='records')

    def get_match_weights_chart(self):
        """
        Return HTML for Splink's match weights chart.
        """
        if not self.linker:
            return None
        try:
            chart = self.linker.match_weights_chart()
            return chart.to_html()
        except Exception as e:
            print(f"Error generating match weights chart: {e}")
            return None

    def get_parameter_estimates_chart(self):
        """
        Return HTML for Splink's parameter estimates chart (m/u probabi parameters).
        """
        if not self.linker:
            return None
        try:
            chart = self.linker.parameter_estimate_comparisons_chart()
            return chart.to_html()
        except Exception as e:
            print(f"Error generating parameter estimates chart: {e}")
            import traceback
            traceback.print_exc()
            return None

    def get_threshold_selection_chart(self):
        """
        Return HTML for threshold selection tool chart.
        """
        if not self.linker or not self.predictions:
            return None
        try:
            chart = self.linker.threshold_selection_tool_from_predictions_df(self.predictions)
            return chart.to_html()
        except Exception as e:
            print(f"Error generating threshold selection chart: {e}")
            import traceback
            traceback.print_exc()
            return None

    def get_comparison_viewer_dashboard(self):
        """
        Return HTML for comparison viewer dashboard.
        """
        if not self.linker or not self.predictions:
            return None
        try:
            chart = self.linker.comparison_viewer_dashboard(self.predictions, out_path=None, overwrite=True, num_example_rows=10)
            return chart.to_html() if hasattr(chart, 'to_html') else None
        except Exception as e:
            print(f"Error generating comparison viewer dashboard: {e}")
            import traceback
            traceback.print_exc()
            return None

    def get_waterfall_chart(self, record_id_1, record_id_2):
        """
        Generate a waterfall chart comparing two specific records.
        """
        if not self.linker:
            return None
        
        try:
            # Need to extract the actual records from the source table
            # Waterfall chart wants the actual record dicts/DFs to compare
            
            # Try common unique ID field names
            uid = "unique_id"
            for possible_field in ["unique_id", "id", "_id", "source_id"]:
                try:
                    test = self.con.execute(f"SELECT {possible_field} FROM {self.linker._input_table_name} LIMIT 1").fetchone()
                    if test is not None:
                        uid = possible_field
                        break
                except:
                    continue
            
            # Map frontend IDs to actual format
            rid1 = record_id_1
            rid2 = record_id_2
            
            # Try both as-is and cast to int if they look numeric
            # Fallback: if cluster format "0_N", extract N
            for rid in [rid1, rid2]:
                if '_' in rid:
                    parts = rid.split('_')
                    if len(parts) == 2:
                        try:
                            rid1 = int(parts[1]) if rid == rid1 else rid1
                            rid2 = int(parts[1]) if rid == rid2 else rid2
                        except:
                            pass
            
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

    def get_match_statistics(self, table_name, threshold=0.9):
        """
        Return comprehensive statistics about the matching process.
        Includes comparison counts, performance metrics, cluster distribution, etc.
        """
        if not self.linker or not self.predictions:
            return {
                "error": "No matching results available. Run matching first."
            }
        
        try:
            # Get basic counts
            row_count = self.con.execute(f"SELECT COUNT(*) FROM {table_name}").fetchone()[0]
            
            # Calculate theoretical max comparisons (N × N-1 / 2 for dedupe)
            max_comparisons = (row_count * (row_count - 1)) // 2
            
            # Get actual comparison count from predictions
            pred_table = self.predictions.physical_name
            actual_comparisons = self.con.execute(f"SELECT COUNT(*) FROM {pred_table}").fetchone()[0]
            
            # Get match counts at different thresholds
            high_matches = self.con.execute(
                f"SELECT COUNT(*) FROM {pred_table} WHERE match_probability >= 0.95"
            ).fetchone()[0]
            
            medium_matches = self.con.execute(
                f"SELECT COUNT(*) FROM {pred_table} WHERE match_probability >= 0.8 AND match_probability < 0.95"
            ).fetchone()[0]
            
            low_matches = self.con.execute(
                f"SELECT COUNT(*) FROM {pred_table} WHERE match_probability >= {threshold} AND match_probability < 0.8"
            ).fetchone()[0]
            
            total_matches = high_matches + medium_matches + low_matches
            
            # Get cluster statistics
            try:
                df_clusters = self.linker.clustering.cluster_pairwise_predictions_at_threshold(
                    self.predictions, 
                    threshold_match_probability=threshold
                )
                cluster_table = df_clusters.physical_name
                
                # Cluster size distribution
                print(f"DEBUG: Cluster table: {cluster_table}")
                try:
                    debug_sizes = self.con.execute(f"SELECT cluster_id, COUNT(*) as size FROM {cluster_table} GROUP BY cluster_id ORDER BY size DESC LIMIT 5").fetchall()
                    print(f"DEBUG: Top 5 cluster sizes: {debug_sizes}")
                except Exception as e:
                    print(f"DEBUG: Failed to query cluster sizes: {e}")

                cluster_stats_query = f"""
                    WITH cluster_sizes AS (
                        SELECT cluster_id, COUNT(*) as size
                        FROM {cluster_table}
                        GROUP BY cluster_id
                    )
                    SELECT 
                        SUM(CASE WHEN size = 1 THEN 1 ELSE 0 END) as singletons,
                        SUM(CASE WHEN size = 2 THEN 1 ELSE 0 END) as pairs,
                        SUM(CASE WHEN size BETWEEN 3 AND 5 THEN 1 ELSE 0 END) as small_groups,
                        SUM(CASE WHEN size BETWEEN 6 AND 10 THEN 1 ELSE 0 END) as medium_groups,
                        SUM(CASE WHEN size > 10 THEN 1 ELSE 0 END) as large_groups,
                        COUNT(DISTINCT cluster_id) as total_clusters,
                        MAX(size) as largest_cluster,
                        AVG(size) as avg_cluster_size
                    FROM cluster_sizes
                """
                cluster_stats = self.con.execute(cluster_stats_query).fetchone()
                
                cluster_distribution = {
                    "singletons": int(cluster_stats[0] or 0),
                    "pairs": int(cluster_stats[1] or 0),
                    "small_groups_3_5": int(cluster_stats[2] or 0),
                    "medium_groups_6_10": int(cluster_stats[3] or 0),
                    "large_groups_10_plus": int(cluster_stats[4] or 0),
                    "total_clusters": int(cluster_stats[5] or 0),
                    "largest_cluster_size": int(cluster_stats[6] or 0),
                    "avg_cluster_size": float(cluster_stats[7] or 0)
                }
            except Exception as e:
                print(f"⚠️ Cluster stats failed: {e}")
                cluster_distribution = {}
            
            # Calculate efficiency metrics
            blocking_efficiency = (1 - (actual_comparisons / max_comparisons)) * 100 if max_comparisons > 0 else 0
            match_rate = (total_matches / actual_comparisons * 100) if actual_comparisons > 0 else 0
            
            return {
                "dataset": {
                    "total_records": row_count,
                    "max_possible_comparisons": max_comparisons
                },
                "comparisons": {
                    "actual_comparisons": actual_comparisons,
                    "blocking_efficiency_percent": round(blocking_efficiency, 2),
                    "comparisons_avoided": max_comparisons - actual_comparisons
                },
                "matches": {
                    "total_matches": total_matches,
                    "high_confidence": high_matches,
                    "medium_confidence": medium_matches,
                    "low_confidence": low_matches,
                    "match_rate_percent": round(match_rate, 2)
                },
                "clusters": cluster_distribution,
                "threshold": threshold
            }
            
        except Exception as e:
            import traceback
            print(f"Error generating statistics: {e}")
            traceback.print_exc()
            return {
                "error": str(e)
            }
