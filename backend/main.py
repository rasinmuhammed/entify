from engine import EntityResolutionEngine
import pandas as pd
import os
from engine import EntityResolutionEngine
import pandas as pd
import os


# Expose the FastAPI app for uvicorn main:app
from api import app

def create_dummy_data():
    data = [
        {"id": 1, "name": "JMAN Group", "city": "London"},
        {"id": 2, "name": "J.M.A.N. Consulting", "city": "London"},
        {"id": 3, "name": "Google", "city": "Mountain View"},
        {"id": 4, "name": "Alphabet Inc.", "city": "Mountain View"},
        {"id": 5, "name": "JMAN Group Ltd", "city": "London"},
    ]
    df = pd.DataFrame(data)
    df.to_csv("dummy_data.csv", index=False)
    return "dummy_data.csv"

def main():
    print("Creating dummy data...")
    file_path = create_dummy_data()
    
    print("Initializing Engine...")
    engine = EntityResolutionEngine()
    
    print("Ingesting data...")
    count = engine.ingest_data(file_path)
    print(f"Ingested {count} rows.")
    
    print("Profiling data...")
    profile = engine.profile_data()
    print(profile)
    
    print("Configuring settings...")
    # Simple settings for testing
    settings = {
        "link_type": "dedupe_only",
        "unique_id_column_name": "id",
        "blocking_rules_to_generate_predictions": [
            "l.city = r.city",
        ],
        "comparisons": [
            # We need to import these from splink, but for now let's try raw dicts or just rely on defaults if possible?
            # Splink 3 requires explicit comparisons usually.
            # Let's use a helper or just define a simple one.
             {
                "output_column_name": "name",
                "comparison_levels": [
                    {
                        "sql_condition": "name_l IS NULL OR name_r IS NULL",
                        "label_for_charts": "Null",
                        "is_null_level": True,
                    },
                    {
                        "sql_condition": "name_l = name_r",
                        "label_for_charts": "Exact match",
                        "m_probability": 0.9,
                        "u_probability": 0.1,
                    },
                    {
                        "sql_condition": "levenshtein(name_l, name_r) <= 2",
                        "label_for_charts": "Levenshtein <= 2",
                        "m_probability": 0.7,
                        "u_probability": 0.2,
                    },
                    {
                        "sql_condition": "ELSE",
                        "label_for_charts": "All other comparisons",
                        "m_probability": 0.1,
                        "u_probability": 0.7,
                    },
                ],
                "comparison_description": "Exact match vs. Name",
            },
             {
                "output_column_name": "city",
                "comparison_levels": [
                    {
                        "sql_condition": "city_l IS NULL OR city_r IS NULL",
                        "label_for_charts": "Null",
                        "is_null_level": True,
                    },
                    {
                        "sql_condition": "city_l = city_r",
                        "label_for_charts": "Exact match",
                        "m_probability": 0.9,
                        "u_probability": 0.1,
                    },
                    {
                        "sql_condition": "ELSE",
                        "label_for_charts": "All other comparisons",
                        "m_probability": 0.1,
                        "u_probability": 0.9,
                    },
                ],
                "comparison_description": "Exact match vs. City",
            }
        ]
    }
    
    print("Running resolution...")
    predictions = engine.run_resolution("input_data", settings)
    print("Predictions head:")
    print(predictions.head())
    
    print("Clustering...")
    clusters = engine.get_clusters(threshold=0.5)
    print("Clusters:")
    print(clusters)

    # Cleanup
    if os.path.exists("dummy_data.csv"):
        os.remove("dummy_data.csv")

if __name__ == "__main__":
    main()
