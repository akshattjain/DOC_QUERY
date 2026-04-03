# AI Knowledge Indexing System Write-up

## System Design and Approach
The system is built as a RESTful web service using FastAPI and PostgreSQL for structured data (users, files, chat metadata, messages), alongside Langchain and QdrantDB for document indexing and vector-based semantic retrieval. It uses OpenAI for generating text embeddings and acting as the LLM (GPT).
- **FastAPI / Server Layer**: Manages the API routing, database connection pools, JWT authentication middleware, and input parsing.
- **SQL Data Layer**: Raw SQL execution via `psycopg[pool]` for managing structured data entities, opting against an ORM to maintain simplicity and explicit query tuning as requested.
- **Document Processing**: `pypdf` is used to load text, which is subsequently chunked via Langchain's `RecursiveCharacterTextSplitter`. These chunks are encoded into 1536-dimensional embeddings and stored into Qdrant. A unique collection name per file ensures tenant/document isolation.
- **Chat/Inference Layer**: User prompts query the Qdrant database to retrieve the top 5 most semantically relevant chunks. These chunks form a context window to produce grounded, hallucination-free answers using GPT-4o-mini.

## How Retrieval Works
1. Document text is extracted and split into 1000-character segments.
2. The user submits a question associated with a previously indexed document.
3. Langchain converts the query into an embedding and uses cosine similarity via `QdrantVectorStore` to retrieve the `k=5` best matching segments. 
4. The Qdrant retriever relies on metadata filtering specifically to the requested `file_id` inside the unified `documents` vector collection to maintain explicit scope isolation.
5. The retrieved chunks alongside the exact user question are orchestrated through a Prompt Template and piped to the LLM.

## Key Decisions & Challenges Faced
- **Choice of DB architecture**: Using a single Qdrant Collection with metadata filtering (`file_id`) was chosen over creating separate collections per document, drastically simplifying index management while keeping performance high on sparse collections. 
- **Vanilla SQL Repositories**: Creating raw SQL abstractions over a connection pool cleanly separated logic from FastAPI's presentation layer while avoiding the overhead of heavy ORMs or schema migration tools.
- **Async Environment Integration**: Integrating Langchain (which has synchronous defaults for some document loader mechanics) inside the `async` endpoints of FastAPI efficiently without blocking the event loop. The vector-store abstractions correctly utilized their async implementations (`aembed_documents`, `ainvoke`) ensuring high throughput potential.

## Next Steps / Enhancements
- Instead of purely text-based extraction, use full OCR or visually-aware extraction tools for images/tables.
- Implement streaming responses (SSE/WebSockets) for LLM generation to reduce perceived latency.
- Provide chunk relevance tracing explicitly in the response to surface *which* chunks answered the specific sections of the query natively.
