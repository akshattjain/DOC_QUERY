import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from psycopg_pool import AsyncConnectionPool
from qdrant_client import AsyncQdrantClient
from dotenv import load_dotenv

from src.controllers.auth import router as auth_router
from src.controllers.chat import router as chat_router

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://user:password@localhost:5432/doc_ai")
QDRANT_URL = os.getenv("QDRANT_URL", "http://localhost:6333")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize DB connection pool
    app.state.db_pool = AsyncConnectionPool(conninfo=DATABASE_URL, check=AsyncConnectionPool.check_connection)
    # The pool opens automatically but for async often wait is used. 
    await app.state.db_pool.wait()
    
    # Initialize Qdrant Client
    app.state.qdrant_client = AsyncQdrantClient(url=QDRANT_URL)
    
    # Run migrations/setup schema
    async with app.state.db_pool.connection() as conn:
        with open("src/models/sql/up.sql", "r") as f:
            await conn.execute(f.read())
        await conn.commit()
    
    # Create Qdrant collection if not exists
    if not await app.state.qdrant_client.collection_exists("documents"):
        from qdrant_client.models import VectorParams, Distance
        # Using OpenAI embeddings default size: 1536
        await app.state.qdrant_client.create_collection(
            collection_name="documents",
            vectors_config=VectorParams(size=1536, distance=Distance.COSINE),
        )
    
    yield
    
    # Cleanup on shutdown
    await app.state.db_pool.close()
    await app.state.qdrant_client.close()

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/api/auth", tags=["auth"])
app.include_router(chat_router, prefix="/api/chats", tags=["chats"])

@app.get("/health")
async def health():
    return {"status": "ok"}