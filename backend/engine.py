import duckdb
from splink import Linker
from splink.backends.duckdb import DuckDBAPI
import pandas as pd
import os

class EntityResolutionEngine:
    def __init__(self, db_path=":memory:"):
        """Initialize the engine with a DuckDB connection."""
        self.con = duckdb.connect(database=db_path)
        self.linker = None
        self.predictions = None

    def ingest_data(self, file_path, table_name="input_data"):
        """
        Load data from a CSV or Parquet file into DuckDB.
        """
        file_ext = os.path.splitext(file_path)[1].lower()
        
        if file_ext == '.csv':
            self.con.execute(f"CREATE OR REPLACE TABLE {table_name} AS SELECT * FROM read_csv_auto('{file_path}')")
        elif file_ext == '.parquet':
            self.con.execute(f"CREATE OR REPLACE TABLE {table_name} AS SELECT * FROM read_parquet('{file_path}')")
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
        This is a simplified version. In a real app, this would be more dynamic.
        """
        settings = {
            "link_type": link_type,
            "unique_id_column_name": unique_id_col_name,
        }
        
        if blocking_rules:
            settings["blocking_rules_to_generate_predictions"] = blocking_rules
            
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
        self.linker.training.estimate_u_using_random_sampling(max_pairs=1e6)
        
        # Predict
        self.predictions = self.linker.inference.predict(threshold_match_probability=0.5)
        
        return self.predictions.as_pandas_dataframe()

    def get_clusters(self, threshold=0.9):
        """
        Return the resolved clusters.
        """
        if not self.linker or not self.predictions:
            raise ValueError("Linker or predictions not available. Run run_resolution first.")
            
        df_clusters = self.linker.clustering.cluster_pairwise_predictions_at_threshold(self.predictions, threshold_match_probability=threshold)
        return df_clusters.as_pandas_dataframe()
