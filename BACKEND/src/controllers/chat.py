from fastapi import APIRouter, Depends, UploadFile, File, Request, HTTPException
from pydantic import BaseModel
import uuid
from typing import List

from src.middleware.auth import get_current_user
from src.services import embedding_service
from src.services import llm_service
from src.repositories import file_metadata, chat, messages

router = APIRouter()

class ChatCreate(BaseModel):
    title: str
    file_ids: List[int]

class MessageCreate(BaseModel):
    content: str

@router.post("/upload")
async def upload_file(request: Request, file: UploadFile = File(...), user_id: int = Depends(get_current_user)):
    ext = file.filename.split('.')[-1].lower() if '.' in file.filename else ""
    if ext not in ["pdf", "csv", "txt"]:
        raise HTTPException(status_code=400, detail="Only PDF, CSV, and TXT files are presently supported for indexing")
    
    file.file.seek(0, 2)
    file_size = file.file.tell()
    file.file.seek(0)
    
    qdrant_collection_name = f"doc_{uuid.uuid4().hex}"
    
    conn = request.app.state.db_pool.connection()
    async with conn as connection:
        file_id = await file_metadata.create_file_metadata(
            connection, user_id, file.filename, qdrant_collection_name, file_size
        )
        await connection.commit()
    
    qdrant_client = request.app.state.qdrant_client
    await embedding_service.process_and_store_pdf(file, qdrant_client, qdrant_collection_name, file_id)
    
    return {"message": "File uploaded and indexed successfully", "file_id": file_id}


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
        
        # Retrieve context and generate response with LLM
        qdrant_client = request.app.state.qdrant_client
        response_content, references = await llm_service.generate_response(
            query=data.content, 
            qdrant_client=qdrant_client, 
            qdrant_collection_name="documents", 
            file_ids=chat_obj["file_ids"],
            chat_history=history_msgs
        )
        
        # Save AI message
        ai_msg_id = await messages.create_message(connection, chat_id, "assistant", response_content)
        await connection.commit()
        
        return {
            "message": response_content,
            "references": references
        }