from psycopg import AsyncConnection
from typing import List

async def create_chat(conn: AsyncConnection, user_id: int, title: str, file_ids: List[int] = None):
    async with conn.cursor() as cur:
        await cur.execute(
            "INSERT INTO chats (user_id, title) VALUES (%s, %s) RETURNING id",
            (user_id, title)
        )
        row = await cur.fetchone()
        chat_id = row[0] if row else None
        
        # Insert many-to-many links
        if chat_id and file_ids:
            for file_id in file_ids:
                await cur.execute("INSERT INTO chat_files (chat_id, file_id) VALUES (%s, %s)", (chat_id, file_id))
                
        return chat_id

async def get_chats_by_user(conn: AsyncConnection, user_id: int):
    async with conn.cursor() as cur:
        await cur.execute("SELECT id, title, created_at FROM chats WHERE user_id = %s ORDER BY created_at DESC", (user_id,))
        rows = await cur.fetchall()
        return [{"id": row[0], "title": row[1], "created_at": row[2]} for row in rows]

async def get_chat_by_id(conn: AsyncConnection, chat_id: int):
    async with conn.cursor() as cur:
        await cur.execute("SELECT id, user_id, title, created_at FROM chats WHERE id = %s LIMIT 1", (chat_id,))
        row = await cur.fetchone()
        if row:
            # Fetch associated files
            await cur.execute("SELECT file_id FROM chat_files WHERE chat_id = %s", (chat_id,))
            file_ids = [r[0] for r in await cur.fetchall()]
            return {"id": row[0], "user_id": row[1], "title": row[2], "file_ids": file_ids, "created_at": row[3]}
    return None

async def delete_chat(conn: AsyncConnection, chat_id: int):
    async with conn.cursor() as cur:
        await cur.execute("DELETE FROM chats WHERE id = %s", (chat_id,))