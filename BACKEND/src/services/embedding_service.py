import uuid
from typing import List
from fastapi import UploadFile
from pypdf import PdfReader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_openai import OpenAIEmbeddings
from qdrant_client import AsyncQdrantClient
from qdrant_client.models import PointStruct
import os
import csv
import io

async def process_and_store_pdf(file: UploadFile, qdrant_client: AsyncQdrantClient, qdrant_collection_name: str, file_id: int):
    # 1. Extract text from Document based on ext
    text = ""
    ext = file.filename.split('.')[-1].lower() if '.' in file.filename else ""
    
    file_bytes = await file.read()
    await file.seek(0)
    
    if ext == "pdf":
        pdf = PdfReader(io.BytesIO(file_bytes))
        for page in pdf.pages:
            page_text = page.extract_text()
            if page_text:
                text += page_text + "\n"
    elif ext == "csv":
        # Parse CSV to text representation
        reader = csv.reader(io.StringIO(file_bytes.decode('utf-8', errors='ignore')))
        for row in reader:
            text += " | ".join(row) + "\n"
    else:
        # Fallback raw text parsing
        text = file_bytes.decode("utf-8", errors="ignore")
    
    # 2. Chunk the text
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=100,
        length_function=len,
        is_separator_regex=False,
    )
    chunks = text_splitter.split_text(text)
    
    if not chunks:
        return
        
    # 3. Generate Embeddings
    embeddings = OpenAIEmbeddings(model="text-embedding-3-small", openai_api_key=os.getenv("OPENAI_API_KEY"))
    chunk_embeddings = await embeddings.aembed_documents(chunks)
    
    # 4. Upload to Qdrant
    points = []
    for i, (chunk, embedding) in enumerate(zip(chunks, chunk_embeddings)):
        point = PointStruct(
            id=str(uuid.uuid4()),
            vector=embedding,
            payload={
                "page_content": chunk,
                "metadata": {
                    "file_id": file_id,
                    "qdrant_collection_name": qdrant_collection_name
                }
            }
        )
        points.append(point)
        
    # We will just put everything in the single "documents" collection and filter by file_id/qdrant_collection_name later.
    await qdrant_client.upsert(
        collection_name="documents",
        wait=True,
        points=points
    )