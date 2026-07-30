"""
Semantic Blocking Service
Generates semantic blocking suggestions and persists mappings to DuckDB.
"""
import io
import os
import re
import datetime
import uuid
import hashlib
from typing import Any, Dict, List, Optional

import duckdb
import numpy as np
import pandas as pd

# sentence-transformers pulls in torch, which is over half a gigabyte and adds
# seconds to startup. Semantic blocking is an optional feature, so the import
# happens when it is used rather than when the API boots. Installing the base
# requirements no longer costs a deep learning stack.
SEMANTIC_EXTRA_HINT = (
    "Semantic blocking needs the optional extras. Install them with: "
    "pip install -r requirements-semantic.txt"
)


def _load_semantic_deps():
    """Import the ML stack, or explain how to install it."""
    try:
        from sentence_transformers import SentenceTransformer
        from sklearn.neighbors import NearestNeighbors
    except ImportError as exc:
        raise RuntimeError(SEMANTIC_EXTRA_HINT) from exc
    return SentenceTransformer, NearestNeighbors


def semantic_extras_available() -> bool:
    """Whether semantic blocking can run, without importing the stack."""
    import importlib.util

    return all(
        importlib.util.find_spec(name) is not None
        for name in ("sentence_transformers", "sklearn")
    )


class _UnionFind:
    def __init__(self, size: int):
        self.parent = list(range(size))
        self.rank = [0] * size

    def find(self, x: int) -> int:
        if self.parent[x] != x:
            self.parent[x] = self.find(self.parent[x])
        return self.parent[x]

    def union(self, x: int, y: int) -> None:
        rx = self.find(x)
        ry = self.find(y)
        if rx == ry:
            return
        if self.rank[rx] < self.rank[ry]:
            self.parent[rx] = ry
        elif self.rank[rx] > self.rank[ry]:
            self.parent[ry] = rx
        else:
            self.parent[ry] = rx
            self.rank[rx] += 1


class SemanticBlockingService:
    def __init__(self, db_path: Optional[str] = None):
        default_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "entify.duckdb")
        self.db_path = os.path.normpath(db_path or os.environ.get("ENTIFY_METADATA_DB", default_path))
        self._ensure_schema()

    def _ensure_schema(self) -> None:
        con = duckdb.connect(self.db_path)
        con.execute(
            """
            CREATE TABLE IF NOT EXISTS semantic_blocking_runs (
                run_id TEXT PRIMARY KEY,
                created_at TIMESTAMP,
                column_name TEXT,
                dataset_fingerprint TEXT,
                model_name TEXT,
                similarity_threshold DOUBLE,
                unique_value_count INTEGER,
                cluster_count INTEGER
            )
            """
        )
        con.execute(
            """
            CREATE TABLE IF NOT EXISTS semantic_blocking_values (
                run_id TEXT,
                value TEXT,
                cluster_id TEXT
            )
            """
        )
        con.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_semantic_blocking_values_run_id
            ON semantic_blocking_values(run_id)
            """
        )
        con.close()

    def generate_suggestions(
        self,
        data_csv: str,
        columns: List[str],
        sample_size: int = 5000,
        max_unique_values: int = 2000,
        similarity_threshold: float = 0.85,
        model_name: str = "all-MiniLM-L6-v2"
    ) -> Dict[str, Any]:
        df = pd.read_csv(io.StringIO(data_csv))
        if sample_size and len(df) > sample_size:
            df = df.sample(n=sample_size, random_state=42)

        dataset_fingerprint = hashlib.sha256(data_csv.encode("utf-8")).hexdigest()

        SentenceTransformer, NearestNeighbors = _load_semantic_deps()
        model = SentenceTransformer(model_name)
        suggestions: List[Dict[str, Any]] = []

        for column in columns:
            if column not in df.columns:
                continue

            values_series = df[column].dropna().astype(str).str.strip()
            values_series = values_series[values_series != ""]
            values = values_series.unique().tolist()

            if max_unique_values and len(values) > max_unique_values:
                values = list(pd.Series(values).sample(n=max_unique_values, random_state=42))

            if len(values) < 2:
                continue

            embeddings = model.encode(values, show_progress_bar=False)
            embeddings = np.array(embeddings, dtype=np.float32)
            norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
            norms[norms == 0] = 1.0
            normed = embeddings / norms

            n_neighbors = min(10, len(values))
            nn = NearestNeighbors(n_neighbors=n_neighbors, metric="cosine")
            nn.fit(normed)
            distances, indices = nn.kneighbors(normed)

            uf = _UnionFind(len(values))

            for i in range(len(values)):
                for j, neighbor_idx in enumerate(indices[i]):
                    if i == neighbor_idx:
                        continue
                    similarity = 1 - distances[i][j]
                    if similarity >= similarity_threshold:
                        uf.union(i, neighbor_idx)

            clusters: Dict[int, List[int]] = {}
            for i in range(len(values)):
                root = uf.find(i)
                clusters.setdefault(root, []).append(i)

            cluster_id_map: Dict[int, str] = {}
            for idx, root in enumerate(clusters.keys()):
                cluster_id_map[root] = f"c_{idx}"

            run_id = str(uuid.uuid4())
            cluster_count = len(clusters)
            unique_value_count = len(values)

            # Persist run + value mappings
            con = duckdb.connect(self.db_path)
            con.execute(
                """
                INSERT INTO semantic_blocking_runs
                (run_id, created_at, column_name, dataset_fingerprint, model_name,
                 similarity_threshold, unique_value_count, cluster_count)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    run_id,
                    datetime.datetime.utcnow(),
                    column,
                    dataset_fingerprint,
                    model_name,
                    similarity_threshold,
                    unique_value_count,
                    cluster_count
                ],
            )

            values_rows = []
            for root, members in clusters.items():
                cluster_id = cluster_id_map[root]
                for member_idx in members:
                    values_rows.append((run_id, values[member_idx], cluster_id))

            con.executemany(
                "INSERT INTO semantic_blocking_values (run_id, value, cluster_id) VALUES (?, ?, ?)",
                values_rows
            )
            con.close()

            # Build sample pairs
            sample_pairs: List[Dict[str, Any]] = []
            for root, members in clusters.items():
                if len(members) < 2:
                    continue
                a = members[0]
                for b in members[1:3]:
                    similarity = float(np.dot(normed[a], normed[b]))
                    sample_pairs.append({
                        "value_a": values[a],
                        "value_b": values[b],
                        "similarity": round(similarity, 4)
                    })
                if len(sample_pairs) >= 5:
                    break

            safe_col = re.sub(r"[^a-zA-Z0-9_]", "_", column)
            recommended_rule = f'l.semantic_block__{safe_col} = r.semantic_block__{safe_col}'

            suggestions.append({
                "column": column,
                "run_id": run_id,
                "recommended_rule": recommended_rule,
                "cluster_count": cluster_count,
                "unique_value_count": unique_value_count,
                "sample_pairs": sample_pairs
            })

        return {"suggestions": suggestions}
