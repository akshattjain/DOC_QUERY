from psycopg import AsyncConnection
import json

async def create_message(conn: AsyncConnection, chat_id: int, role: str, content: str, references: list = None, pipeline_data: list = None):
    refs_json = json.dumps(references) if references else "[]"
    pipe_json = json.dumps(pipeline_data) if pipeline_data else "[]"
    
    async with conn.cursor() as cur:
        await cur.execute(
            "INSERT INTO messages (chat_id, role, content, refs, pipeline_data) VALUES (%s, %s, %s, %s::jsonb, %s::jsonb) RETURNING id",
            (chat_id, role, content, refs_json, pipe_json)
        )
        row = await cur.fetchone()
        return row[0] if row else None

async def get_messages_by_chat(conn: AsyncConnection, chat_id: int):
    async with conn.cursor() as cur:
        await cur.execute("SELECT id, role, content, refs, pipeline_data, created_at FROM messages WHERE chat_id = %s ORDER BY created_at ASC", (chat_id,))
        rows = await cur.fetchall()
        return [{
            "id": row[0], 
            "role": row[1], 
            "content": row[2], 
            "references": row[3] if isinstance(row[3], list) else json.loads(row[3]) if row[3] else [],
            "pipeline_data": row[4] if isinstance(row[4], list) else json.loads(row[4]) if row[4] else [],
            "created_at": row[5]
        } for row in rows]