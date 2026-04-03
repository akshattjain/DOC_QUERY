import os
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langchain_qdrant import QdrantVectorStore
from qdrant_client import AsyncQdrantClient
from qdrant_client.models import Filter, FieldCondition, MatchValue, MatchAny
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
from typing import List

async def generate_response(query: str, qdrant_client: AsyncQdrantClient, qdrant_collection_name: str, file_ids: List[int], chat_history: list = None):
    # Setup LLM and Embeddings
    embeddings = OpenAIEmbeddings(model="text-embedding-3-small", openai_api_key=os.getenv("OPENAI_API_KEY"))
    llm = ChatOpenAI(model="gpt-4o-mini", openai_api_key=os.getenv("OPENAI_API_KEY"))
    
    # Use from_existing_collection factory method to handle URL-based construction
    vectorstore = QdrantVectorStore.from_existing_collection(
        url=os.getenv("QDRANT_URL", "http://localhost:6333"),
        collection_name="documents",
        embedding=embeddings,
    )
    
    retriever = vectorstore.as_retriever(
        search_kwargs={
            "filter": Filter(
                must=[
                    FieldCondition(
                        key="metadata.file_id", 
                        match=MatchAny(any=file_ids)
                    )
                ]
            ),
            "k": 5
        }
    )
    
    docs = await retriever.ainvoke(query)
    context = "\n\n".join([doc.page_content for doc in docs])
    
    messages = [
        SystemMessage(content=(
            "You are a helpful AI knowledge assistant. You will be provided with excerpts from documents. "
            "Please answer the user's question explicitly using the information found in these excerpts. "
            "If the user asks for a summary of the document, summarize the provided excerpts. "
            "If the excerpts do not contain the answer, explicitly state that you cannot answer based on the provided context.\n\n"
            f"Document Excerpts:\n{context}"
        ))
    ]
    
    if chat_history:
        # Include the last 10 messages to avoid context window overflows
        for msg in chat_history[-10:]:
            if msg["role"] == "user":
                messages.append(HumanMessage(content=msg["content"]))
            elif msg["role"] == "assistant":
                messages.append(AIMessage(content=msg["content"]))
                
    messages.append(HumanMessage(content=query))
    
    response = await llm.ainvoke(messages)
    
    # Return both response text and retrieved chunks for reference tracking
    references = [{"text": doc.page_content} for doc in docs]
    return response.content, references