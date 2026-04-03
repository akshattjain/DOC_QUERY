from psycopg import AsyncConnection

async def create_message(conn: AsyncConnection, chat_id: int, role: str, content: str):
    async with conn.cursor() as cur:
        await cur.execute(
            "INSERT INTO messages (chat_id, role, content) VALUES (%s, %s, %s) RETURNING id",
            (chat_id, role, content)
        )
        row = await cur.fetchone()
        return row[0] if row else None

async def get_messages_by_chat(conn: AsyncConnection, chat_id: int):
    async with conn.cursor() as cur:
        await cur.execute("SELECT id, role, content, created_at FROM messages WHERE chat_id = %s ORDER BY created_at ASC", (chat_id,))
        rows = await cur.fetchall()
        return [{"id": row[0], "role": row[1], "content": row[2], "created_at": row[3]} for row in rows]