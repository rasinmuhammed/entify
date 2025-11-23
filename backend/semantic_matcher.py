from sentence_transformers import SentenceTransformer
from sklearn.neighbors import NearestNeighbors
import pandas as pd
import numpy as np

class SemanticMatcher:
    def __init__(self, model_name='all-MiniLM-L6-v2'):
        self.model = SentenceTransformer(model_name)
        self.index = None
        self.names = []

    def build_index(self, names):
        """
        Build a vector index for a list of names.
        """
        self.names = list(set(names)) # Unique names
        embeddings = self.model.encode(self.names)
        
        self.index = NearestNeighbors(n_neighbors=5, metric='cosine')
        self.index.fit(embeddings)
        
    def find_matches(self, query_name, threshold=0.8):
        """
        Find semantically similar names.
        """
        if not self.index:
            raise ValueError("Index not built")
            
        query_embedding = self.model.encode([query_name])
        distances, indices = self.index.kneighbors(query_embedding)
        
        matches = []
        for i, idx in enumerate(indices[0]):
            similarity = 1 - distances[0][i] # Cosine distance to similarity
            if similarity >= threshold and self.names[idx] != query_name:
                matches.append({
                    "name": self.names[idx],
                    "similarity": float(similarity)
                })
                
        return matches

    def generate_blocking_rules(self, names, threshold=0.9):
        """
        Generate pairs for Splink blocking rules.
        Returns a list of tuples (name_l, name_r).
        """
        self.build_index(names)
        embeddings = self.model.encode(self.names)
        
        # Find neighbors for all
        distances, indices = self.index.kneighbors(embeddings)
        
        pairs = []
        seen = set()
        
        for i, neighbors in enumerate(indices):
            name_l = self.names[i]
            for j, neighbor_idx in enumerate(neighbors):
                if i == neighbor_idx: continue
                
                similarity = 1 - distances[i][j]
                if similarity >= threshold:
                    name_r = self.names[neighbor_idx]
                    
                    # Sort to avoid duplicates (A, B) vs (B, A)
                    pair = tuple(sorted((name_l, name_r)))
                    if pair not in seen:
                        pairs.append(pair)
                        seen.add(pair)
                        
        return pairs

# Example usage
if __name__ == "__main__":
    matcher = SemanticMatcher()
    names = ["JMAN Group", "J.M.A.N. Consulting", "Google", "Alphabet Inc.", "JMAN Group Ltd"]
    print("Building index...")
    matcher.build_index(names)
    
    print("Matches for 'JMAN Group':")
    print(matcher.find_matches("JMAN Group"))
    
    print("Generating blocking pairs:")
    print(matcher.generate_blocking_rules(names, threshold=0.6))
