import os
import operator
from typing import TypedDict, Annotated, List, Dict, Any
from langgraph.graph import StateGraph, END
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langchain_qdrant import QdrantVectorStore
from qdrant_client import AsyncQdrantClient
from qdrant_client.models import Filter, FieldCondition, MatchAny
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage

# Define Graph State
class GraphState(TypedDict):
    query: str
    chat_history: List[Dict]
    file_ids: List[int]
    qdrant_client: Any
    
    retrieved_docs: List[Any]
    pipeline_data: Annotated[List[Dict], operator.add]
    final_answer: str

# Node: Retrieve Documents
async def retrieve_docs(state: GraphState):
    query = state["query"]
    file_ids = state["file_ids"]
    qdrant_client = state["qdrant_client"]
    
    embeddings = OpenAIEmbeddings(model="text-embedding-3-small", openai_api_key=os.getenv("OPENAI_API_KEY"))
    
    vectorstore = QdrantVectorStore.from_existing_collection(
        url=os.getenv("QDRANT_URL", "http://localhost:6333"),
        collection_name="documents",
        embedding=embeddings,
    )
    
    # Use similarity_search_with_score to get scores
    docs_with_scores = await vectorstore.asimilarity_search_with_score(
        query=query,
        k=5,
        filter=Filter(
            must=[FieldCondition(key="metadata.file_id", match=MatchAny(any=file_ids))]
        )
    )
    
    docs = [{"doc": doc, "score": score} for doc, score in docs_with_scores]
    
    status = {"step": "RAG Retriever", "status": "RETRIEVED", "details": f"Retrieved {len(docs)} chunks from Vector Database."}
    return {"retrieved_docs": docs, "pipeline_data": [status]}

# Node: Check Relevance
async def check_relevance(state: GraphState):
    docs = state["retrieved_docs"]
    
    if not docs:
         status = {"step": "Relevance Checker", "status": "NO DOCUMENTS", "details": "No relevant documents found."}
         return {"pipeline_data": [status]}
         
    # Mock relevance check or calculate average score
    avg_score = sum([d["score"] for d in docs]) / len(docs)
    
    if avg_score > 0.4:
         status = {"step": "Relevance Checker", "status": "RELEVANT", "score": round(avg_score, 2), "details": f"Average confidence score: {round(avg_score, 2)}"}
    else:
         status = {"step": "Relevance Checker", "status": "LOW RELEVANCE", "score": round(avg_score, 2), "details": "Documents might not fully answer the query."}
         
    return {"pipeline_data": [status]}

# Node: LLM Refiner
async def generate_answer(state: GraphState):
    query = state["query"]
    docs = state["retrieved_docs"]
    chat_history = state["chat_history"]
    
    llm = ChatOpenAI(model="gpt-4o-mini", openai_api_key=os.getenv("OPENAI_API_KEY"))
    
    context = ""
    for idx, item in enumerate(docs):
         doc = item["doc"]
         score = item["score"]
         filename = doc.metadata.get("filename", "Unknown")
         page = doc.metadata.get("page_number", "?")
         context += f"Chunk {idx+1} [File: {filename}, Page: {page}, Score: {score:.2f}]:\n{doc.page_content}\n\n"
         
    messages = [
        SystemMessage(content=(
            "You are a helpful AI knowledge assistant. You will be provided with excerpts from documents. "
            "Please answer the user's question explicitly using the information found in these excerpts. "
            "If the user asks for a summary of the document, summarize the provided excerpts. "
            "If the excerpts do not contain the answer, explicitly state that you cannot answer based on the provided context.\n\n"
            f"Document Context:\n{context}"
        ))
    ]
    
    if chat_history:
        for msg in chat_history[-10:]:
            if msg["role"] == "user":
                messages.append(HumanMessage(content=msg["content"]))
            elif msg["role"] == "assistant":
                messages.append(AIMessage(content=msg["content"]))
                
    messages.append(HumanMessage(content=query))
    
    response = await llm.ainvoke(messages)
    
    status = {"step": "LLM Refiner", "status": "GENERATED", "details": "Drafted final response using chat history and retrieved chunks."}
    
    return {"final_answer": response.content, "pipeline_data": [status]}


# Build the Graph
workflow = StateGraph(GraphState)
workflow.add_node("rag_retriever", retrieve_docs)
workflow.add_node("relevance_checker", check_relevance)
workflow.add_node("llm_refiner", generate_answer)

workflow.set_entry_point("rag_retriever")
workflow.add_edge("rag_retriever", "relevance_checker")
workflow.add_edge("relevance_checker", "llm_refiner")
workflow.add_edge("llm_refiner", END)

app = workflow.compile()

async def generate_graph_response(query: str, qdrant_client: AsyncQdrantClient, file_ids: List[int], chat_history: list = None):
    initial_state = {
        "query": query,
        "chat_history": chat_history or [],
        "file_ids": file_ids,
        "qdrant_client": qdrant_client,
        "retrieved_docs": [],
        "pipeline_data": [{"step": "Query Processing", "status": "STARTED", "details": "Received User Query"}],
        "final_answer": ""
    }
    
    result = await app.ainvoke(initial_state)
    
    # Format references for the frontend
    references = []
    for item in result["retrieved_docs"]:
        doc = item["doc"]
        references.append({
            "text": doc.page_content,
            "filename": doc.metadata.get("filename", "Unknown"),
            "page_number": doc.metadata.get("page_number", "?"),
            "score": round(item["score"], 3)
        })
        
    return result["final_answer"], references, result["pipeline_data"]
