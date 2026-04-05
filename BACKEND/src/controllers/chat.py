from fastapi import APIRouter, Depends, UploadFile, File, Request, HTTPException
from pydantic import BaseModel
import uuid
import asyncio
import shutil
import tempfile
from pathlib import Path
from typing import List

from src.middleware.auth import get_current_user
from src.services import embedding_service
from src.services import llm_service
from src.repositories import file_metadata, chat, messages

router = APIRouter()

# In-memory store for background upload job statuses.
# Maps job_id -> {status, file_id, error}
_job_store: dict = {}

# In-memory store for chunked upload sessions.
# Maps upload_id -> {filename, upload_dir, total_chunks, chunks_received, user_id}
_chunk_sessions: dict = {}

_CHUNK_UPLOAD_DIR = Path(tempfile.gettempdir()) / "doc_query_uploads"
_CHUNK_UPLOAD_DIR.mkdir(exist_ok=True)

MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB

class InitUploadRequest(BaseModel):
    filename: str
    total_chunks: int

class ChatCreate(BaseModel):
    title: str
    file_ids: List[int]

class MessageCreate(BaseModel):
    content: str

@router.post("/upload/init")
async def init_chunked_upload(
    body: InitUploadRequest,
    request: Request,
    user_id: int = Depends(get_current_user),
):
    ext = body.filename.split('.')[-1].lower() if '.' in body.filename else ""
    if ext not in ["pdf", "csv", "txt"]:
        raise HTTPException(status_code=400, detail="Only PDF, CSV, and TXT files are presently supported for indexing")
    if body.total_chunks < 1:
        raise HTTPException(status_code=400, detail="total_chunks must be at least 1")

    upload_id = uuid.uuid4().hex
    upload_dir = _CHUNK_UPLOAD_DIR / upload_id
    upload_dir.mkdir(parents=True, exist_ok=True)

    _chunk_sessions[upload_id] = {
        "filename": body.filename,
        "upload_dir": str(upload_dir),
        "total_chunks": body.total_chunks,
        "chunks_received": 0,
        "user_id": user_id,
    }

    return {"upload_id": upload_id}


@router.post("/upload/chunk/{upload_id}")
async def upload_chunk(
    upload_id: str,
    chunk_index: int,
    chunk: UploadFile = File(...),
    user_id: int = Depends(get_current_user),
):
    session = _chunk_sessions.get(upload_id)
    if not session or session["user_id"] != user_id:
        raise HTTPException(status_code=404, detail="Upload session not found")
    if chunk_index < 0 or chunk_index >= session["total_chunks"]:
        raise HTTPException(status_code=400, detail="Invalid chunk_index")

    chunk_data = await chunk.read()
    chunk_path = Path(session["upload_dir"]) / f"chunk_{chunk_index:06d}"
    chunk_path.write_bytes(chunk_data)
    session["chunks_received"] += 1

    return {"chunks_received": session["chunks_received"]}


@router.post("/upload/finalize/{upload_id}")
async def finalize_chunked_upload(
    upload_id: str,
    request: Request,
    user_id: int = Depends(get_current_user),
):
    session = _chunk_sessions.get(upload_id)
    if not session or session["user_id"] != user_id:
        raise HTTPException(status_code=404, detail="Upload session not found")
    if session["chunks_received"] != session["total_chunks"]:
        raise HTTPException(
            status_code=400,
            detail=f"Expected {session['total_chunks']} chunks but only {session['chunks_received']} received",
        )

    upload_dir = Path(session["upload_dir"])
    assembled = bytearray()
    for i in range(session["total_chunks"]):
        chunk_path = upload_dir / f"chunk_{i:06d}"
        if not chunk_path.exists():
            raise HTTPException(status_code=400, detail=f"Chunk {i} is missing")
        assembled.extend(chunk_path.read_bytes())

    shutil.rmtree(upload_dir, ignore_errors=True)
    del _chunk_sessions[upload_id]

    file_bytes = bytes(assembled)
    filename = session["filename"]
    file_size = len(file_bytes)

    if file_size > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="Assembled file exceeds the 50 MB limit")

    qdrant_collection_name = f"doc_{uuid.uuid4().hex}"
    conn = request.app.state.db_pool.connection()
    async with conn as connection:
        file_id = await file_metadata.create_file_metadata(
            connection, user_id, filename, qdrant_collection_name, file_size
        )
        await connection.commit()

    job_id = uuid.uuid4().hex
    _job_store[job_id] = {"status": "processing", "file_id": None, "error": None}

    qdrant_client = request.app.state.qdrant_client

    async def _run_processing():
        try:
            await embedding_service.process_and_store_bytes(
                file_bytes, filename, qdrant_client, qdrant_collection_name, file_id
            )
            _job_store[job_id]["status"] = "done"
            _job_store[job_id]["file_id"] = file_id
        except Exception as e:
            print(f"Background upload job {job_id} failed: {e}")
            _job_store[job_id]["status"] = "error"
            _job_store[job_id]["error"] = str(e)

    asyncio.create_task(_run_processing())
    return {"job_id": job_id}


@router.post("/upload")
async def upload_file(request: Request, file: UploadFile = File(...), user_id: int = Depends(get_current_user)):
    ext = file.filename.split('.')[-1].lower() if '.' in file.filename else ""
    if ext not in ["pdf", "csv", "txt"]:
        raise HTTPException(status_code=400, detail="Only PDF, CSV, and TXT files are presently supported for indexing")

    # Read file bytes eagerly — UploadFile is tied to the request lifecycle
    # and won't be available once the response is returned.
    file_bytes = await file.read()
    filename = file.filename
    file_size = len(file_bytes)

    qdrant_collection_name = f"doc_{uuid.uuid4().hex}"

    conn = request.app.state.db_pool.connection()
    async with conn as connection:
        file_id = await file_metadata.create_file_metadata(
            connection, user_id, filename, qdrant_collection_name, file_size
        )
        await connection.commit()

    job_id = uuid.uuid4().hex
    _job_store[job_id] = {"status": "processing", "file_id": None, "error": None}

    qdrant_client = request.app.state.qdrant_client

    async def _run_processing():
        try:
            await embedding_service.process_and_store_bytes(
                file_bytes, filename, qdrant_client, qdrant_collection_name, file_id
            )
            _job_store[job_id]["status"] = "done"
            _job_store[job_id]["file_id"] = file_id
        except Exception as e:
            print(f"Background upload job {job_id} failed: {e}")
            _job_store[job_id]["status"] = "error"
            _job_store[job_id]["error"] = str(e)

    asyncio.create_task(_run_processing())

    return {"job_id": job_id}


@router.get("/upload/status/{job_id}")
async def get_upload_status(job_id: str, user_id: int = Depends(get_current_user)):
    job = _job_store.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.get("/")
async def get_chats(request: Request, user_id: int = Depends(get_current_user)):
    conn = request.app.state.db_pool.connection()
    async with conn as connection:
        chats = await chat.get_chats_by_user(connection, user_id)
        return chats

@router.post("/")
async def create_new_chat(data: ChatCreate, request: Request, user_id: int = Depends(get_current_user)):
    conn = request.app.state.db_pool.connection()
    async with conn as connection:
        # Verify files belong to user
        for f_id in data.file_ids:
            file_obj = await file_metadata.get_file_by_id(connection, f_id)
            if not file_obj or file_obj["user_id"] != user_id:
                raise HTTPException(status_code=404, detail=f"File {f_id} not found or unauthorized")
        
        chat_id = await chat.create_chat(connection, user_id, data.title, data.file_ids)
        await connection.commit()
        return {"chat_id": chat_id}

@router.get("/{chat_id}")
async def get_chat(chat_id: int, request: Request, user_id: int = Depends(get_current_user)):
    conn = request.app.state.db_pool.connection()
    async with conn as connection:
        chat_obj = await chat.get_chat_by_id(connection, chat_id)
        if not chat_obj or chat_obj["user_id"] != user_id:
            raise HTTPException(status_code=404, detail="Chat not found")
        return chat_obj

@router.delete("/{chat_id}")
async def delete_existing_chat(chat_id: int, request: Request, user_id: int = Depends(get_current_user)):
    conn = request.app.state.db_pool.connection()
    async with conn as connection:
        chat_obj = await chat.get_chat_by_id(connection, chat_id)
        if not chat_obj or chat_obj["user_id"] != user_id:
            raise HTTPException(status_code=404, detail="Chat not found")
        await chat.delete_chat(connection, chat_id)
        await connection.commit()
        return {"message": "Chat deleted successfully"}

@router.get("/{chat_id}/messages")
async def get_chat_messages(chat_id: int, request: Request, user_id: int = Depends(get_current_user)):
    conn = request.app.state.db_pool.connection()
    async with conn as connection:
        chat_obj = await chat.get_chat_by_id(connection, chat_id)
        if not chat_obj or chat_obj["user_id"] != user_id:
            raise HTTPException(status_code=404, detail="Chat not found")
        chat_messages = await messages.get_messages_by_chat(connection, chat_id)
        return chat_messages

@router.post("/{chat_id}/messages")
async def send_message(chat_id: int, data: MessageCreate, request: Request, user_id: int = Depends(get_current_user)):
    conn = request.app.state.db_pool.connection()
    async with conn as connection:
        chat_obj = await chat.get_chat_by_id(connection, chat_id)
        if not chat_obj or chat_obj["user_id"] != user_id:
            raise HTTPException(status_code=404, detail="Chat not found")
        
        # Fetch history before adding the new message
        history_msgs = await messages.get_messages_by_chat(connection, chat_id)
        
        # Save user message
        await messages.create_message(connection, chat_id, "user", data.content)
        
        # Retrieve context and generate response with LangGraph
        qdrant_client = request.app.state.qdrant_client
        from src.services import llm_graph_service
        
        response_content, references, pipeline_data = await llm_graph_service.generate_graph_response(
            query=data.content, 
            qdrant_client=qdrant_client, 
            file_ids=chat_obj["file_ids"],
            chat_history=history_msgs
        )
        
        # Save AI message with new metadata
        ai_msg_id = await messages.create_message(
            connection, chat_id, "assistant", response_content, references=references, pipeline_data=pipeline_data
        )
        await connection.commit()
        
        return {
            "message": response_content,
            "references": references,
            "pipeline_data": pipeline_data
        }