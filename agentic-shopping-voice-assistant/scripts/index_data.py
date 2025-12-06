"""
Data indexing script for Amazon Product Dataset 2020
Uses pre-computed embeddings from text_emb.pt and data_cleaned.csv
"""

import pandas as pd
import torch
import numpy as np
from pathlib import Path
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.vectorstores import FAISS
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def load_data():
    """Load cleaned dataset and pre-computed embeddings"""
    csv_path = Path("data/data_cleaned.csv")
    emb_path = Path("text_emb.pt")
    
    if not csv_path.exists():
        raise FileNotFoundError(f"Data file not found at {csv_path}")
    
    if not emb_path.exists():
        raise FileNotFoundError(f"Embeddings file not found at {emb_path}")
        
    logger.info(f"Loading data from {csv_path}...")
    df = pd.read_csv(csv_path)
    
    logger.info(f"Loading embeddings from {emb_path}...")
    embeddings = torch.load(emb_path)
    
    if len(df) != len(embeddings):
        raise ValueError(f"Data length ({len(df)}) does not match embeddings length ({len(embeddings)})")
        
    return df, embeddings

def index_products(persist_directory: str = "./faiss_db"):
    """
    Index products into FAISS using pre-computed embeddings
    """
    df, embeddings_tensor = load_data()
    
    # Convert tensor to list of lists for LangChain
    logger.info("Converting embeddings to list...")
    embeddings_list = embeddings_tensor.tolist()
    
    # Prepare texts and metadata
    text_embeddings = []
    metadatas = []
    
    logger.info("Preparing metadata...")
    for idx, row in df.iterrows():
        # Use rich_description as the content
        content = row.get("rich_description", "")
        if pd.isna(content):
            content = ""
            
        # Prepare metadata
        # Note: brand and material are not in data_cleaned.csv, setting as empty defaults
        metadata = {
            "Uniq Id": row.get("uniq_id", ""),
            "Product Name": row.get("product_name", ""),
            "Selling Price": row.get("selling_price", 0),
            "category": row.get("category", ""),
            "brand": "",     # Not available in data_cleaned.csv
            "material": "",  # Not available in data_cleaned.csv
        }
        
        text_embeddings.append((content, embeddings_list[idx]))
        metadatas.append(metadata)
    
    # Initialize Embedding Function (needed for query embedding at runtime)
    # Must match the model used to generate text_emb.pt (assuming stella-base-en-v2)
    logger.info("Loading embedding model for reference...")
    embedder = HuggingFaceEmbeddings(
        model_name="infgrad/stella-base-en-v2",
        model_kwargs={"trust_remote_code": True}
    )
    
    # Create FAISS index from pre-computed embeddings
    logger.info("Creating FAISS index...")
    vector_store = FAISS.from_embeddings(
        text_embeddings=text_embeddings,
        embedding=embedder,
        metadatas=metadatas
    )
    
    # Save
    logger.info(f"Saving index to {persist_directory}...")
    vector_store.save_local(persist_directory)
    
    logger.info(f"✓ Successfully indexed {len(df)} products to {persist_directory}")
    return vector_store

if __name__ == "__main__":
    index_products()
