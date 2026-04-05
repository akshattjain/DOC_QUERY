import uuid
from typing import List
from fastapi import UploadFile
import fitz  # PyMuPDF
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_openai import OpenAIEmbeddings, ChatOpenAI
from langchain_core.messages import HumanMessage
from qdrant_client import AsyncQdrantClient
from qdrant_client.models import PointStruct
import os
import base64
from PIL import Image
import io
import csv

import asyncio

async def process_image_with_semaphore(doc, xref, page_num, semaphore, llm_vision):
    async with semaphore:
        try:
            base_image = doc.extract_image(xref)
            image_bytes = base_image["image"]
            
            # Use Pillow to filter small icons/lines and resize
            img = Image.open(io.BytesIO(image_bytes))
            if img.width < 100 or img.height < 100:
                return None  # Skip tiny filler images to save tokens
                
            img.thumbnail((512, 512)) # Downscale to max 512x512
            buffer = io.BytesIO()
            img.save(buffer, format="JPEG", quality=85)
            resized_bytes = buffer.getvalue()
            
            base64_image = base64.b64encode(resized_bytes).decode('utf-8')
            
            msg = HumanMessage(
                content=[
                    {"type": "text", "text": "Describe this image in detail. It is from a document. Include any visible text, diagrams, or charts."},
                    {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{base64_image}"}}
                ]
            )
            response = await llm_vision.ainvoke([msg])
            img_desc = f"[Image Description from page {page_num}]: " + response.content
            return {"text": img_desc, "page_number": page_num}
        except Exception as e:
            print(f"Failed to process image on page {page_num}: {e}")
            return None

async def process_and_store_bytes(file_bytes: bytes, filename: str, qdrant_client: AsyncQdrantClient, qdrant_collection_name: str, file_id: int):
    """Process file from raw bytes — used for background tasks where UploadFile is no longer available."""
    ext = filename.split('.')[-1].lower() if '.' in filename else ""

    chunks_with_metadata = []
    llm_vision = ChatOpenAI(model="gpt-4o-mini", max_tokens=300)

    if ext == "pdf":
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        image_tasks = []
        semaphore = asyncio.Semaphore(10)

        for page_num in range(len(doc)):
            page = doc[page_num]
            text = page.get_text()
            if text.strip():
                chunks_with_metadata.append({"text": text, "page_number": page_num + 1})

            image_list = page.get_images(full=True)
            for img_index, img in enumerate(image_list):
                xref = img[0]
                image_tasks.append(
                    process_image_with_semaphore(doc, xref, page_num + 1, semaphore, llm_vision)
                )

        if image_tasks:
            image_results = await asyncio.gather(*image_tasks)
            for res in image_results:
                if res:
                    chunks_with_metadata.append(res)
    elif ext == "csv":
        text = ""
        reader = csv.reader(io.StringIO(file_bytes.decode('utf-8', errors='ignore')))
        for row in reader:
            text += " | ".join(row) + "\n"
        chunks_with_metadata.append({"text": text, "page_number": 1})
    else:
        text = file_bytes.decode("utf-8", errors="ignore")
        chunks_with_metadata.append({"text": text, "page_number": 1})

    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=100,
        length_function=len,
        is_separator_regex=False,
    )

    final_chunks = []
    final_metadata = []
    for cm in chunks_with_metadata:
        splits = text_splitter.split_text(cm["text"])
        for s in splits:
            final_chunks.append(s)
            final_metadata.append({"page_number": cm["page_number"]})

    if not final_chunks:
        return

    embeddings = OpenAIEmbeddings(model="text-embedding-3-small", openai_api_key=os.getenv("OPENAI_API_KEY"))
    chunk_embeddings = await embeddings.aembed_documents(final_chunks)

    points = []
    for i, (chunk, embedding, meta) in enumerate(zip(final_chunks, chunk_embeddings, final_metadata)):
        point = PointStruct(
            id=str(uuid.uuid4()),
            vector=embedding,
            payload={
                "page_content": chunk,
                "metadata": {
                    "file_id": file_id,
                    "filename": filename,
                    "page_number": meta["page_number"],
                    "qdrant_collection_name": qdrant_collection_name
                }
            }
        )
        points.append(point)

    await qdrant_client.upsert(
        collection_name="documents",
        wait=True,
        points=points
    )


async def process_and_store_pdf(file: UploadFile, qdrant_client: AsyncQdrantClient, qdrant_collection_name: str, file_id: int):
    # 1. Extract text & images from Document based on ext
    ext = file.filename.split('.')[-1].lower() if '.' in file.filename else ""

    file_bytes = await file.read()
    await file.seek(0)

    chunks_with_metadata = []
    llm_vision = ChatOpenAI(model="gpt-4o-mini", max_tokens=300)

    if ext == "pdf":
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        image_tasks = []
        semaphore = asyncio.Semaphore(10)  # Rate limit parallel API calls
        
        for page_num in range(len(doc)):
            page = doc[page_num]
            text = page.get_text()
            if text.strip():
                chunks_with_metadata.append({"text": text, "page_number": page_num + 1})
            
            image_list = page.get_images(full=True)
            for img_index, img in enumerate(image_list):
                xref = img[0]
                image_tasks.append(
                    process_image_with_semaphore(doc, xref, page_num + 1, semaphore, llm_vision)
                )
                
        if image_tasks:
            image_results = await asyncio.gather(*image_tasks)
            for res in image_results:
                if res:
                    chunks_with_metadata.append(res)
    elif ext == "csv":
        text = ""
        reader = csv.reader(io.StringIO(file_bytes.decode('utf-8', errors='ignore')))
        for row in reader:
            text += " | ".join(row) + "\n"
        chunks_with_metadata.append({"text": text, "page_number": 1})
    else:
        text = file_bytes.decode("utf-8", errors="ignore")
        chunks_with_metadata.append({"text": text, "page_number": 1})
    
    # 2. Chunk the text
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=100,
        length_function=len,
        is_separator_regex=False,
    )
    
    final_chunks = []
    final_metadata = []
    for cm in chunks_with_metadata:
        splits = text_splitter.split_text(cm["text"])
        for s in splits:
            final_chunks.append(s)
            final_metadata.append({"page_number": cm["page_number"]})
    
    if not final_chunks:
        return
        
    # 3. Generate Embeddings
    embeddings = OpenAIEmbeddings(model="text-embedding-3-small", openai_api_key=os.getenv("OPENAI_API_KEY"))
    chunk_embeddings = await embeddings.aembed_documents(final_chunks)
    
    # 4. Upload to Qdrant
    points = []
    for i, (chunk, embedding, meta) in enumerate(zip(final_chunks, chunk_embeddings, final_metadata)):
        point = PointStruct(
            id=str(uuid.uuid4()),
            vector=embedding,
            payload={
                "page_content": chunk,
                "metadata": {
                    "file_id": file_id,
                    "filename": file.filename,
                    "page_number": meta["page_number"],
                    "qdrant_collection_name": qdrant_collection_name
                }
            }
        )
        points.append(point)
        
    await qdrant_client.upsert(
        collection_name="documents",
        wait=True,
        points=points
    )