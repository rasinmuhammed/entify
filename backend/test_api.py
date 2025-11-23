import requests
import time

BASE_URL = "http://127.0.0.1:8000"

def create_dummy_csv():
    content = "id,name,city\n1,JMAN Group,London\n2,J.M.A.N. Consulting,London\n3,Google,Mountain View"
    with open("test_upload.csv", "w") as f:
        f.write(content)
    return "test_upload.csv"

def test_api():
    print("Creating dummy CSV...")
    filename = create_dummy_csv()
    
    print("Testing /upload...")
    with open(filename, "rb") as f:
        files = {"file": (filename, f, "text/csv")}
        response = requests.post(f"{BASE_URL}/upload", files=files)
    
    print(response.json())
    assert response.status_code == 200
    table_name = response.json()["table_name"]
    print(f"Uploaded table: {table_name}")
    
    print("Testing /profile...")
    response = requests.get(f"{BASE_URL}/profile/{table_name}")
    print(response.json())
    assert response.status_code == 200
    
    print("Testing /run-match...")
    settings = {
        "link_type": "dedupe_only",
        "unique_id_column_name": "id",
        "blocking_rules_to_generate_predictions": ["l.city = r.city"],
        "comparisons": [
             {
                "output_column_name": "name",
                "comparison_levels": [
                    {"sql_condition": "name_l IS NULL OR name_r IS NULL", "is_null_level": True},
                    {"sql_condition": "name_l = name_r", "m_probability": 0.9, "u_probability": 0.1},
                    {"sql_condition": "ELSE", "m_probability": 0.1, "u_probability": 0.9}
                ]
            }
        ]
    }
    response = requests.post(f"{BASE_URL}/run-match", json={"table_name": table_name, "settings": settings})
    print(response.json())
    assert response.status_code == 200
    job_id = response.json()["job_id"]
    
    print(f"Polling job {job_id}...")
    while True:
        response = requests.get(f"{BASE_URL}/job/{job_id}")
        status = response.json()["status"]
        print(f"Status: {status}")
        if status in ["completed", "failed"]:
            break
        time.sleep(1)
        
    print("Job result:")
    print(response.json())

if __name__ == "__main__":
    test_api()
