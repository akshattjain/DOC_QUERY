from psycopg import AsyncConnection

async def create_file_metadata(conn: AsyncConnection, user_id: int, filename: str, qdrant_collection_name: str, file_size: int):
    async with conn.cursor() as cur:
        await cur.execute(
            "INSERT INTO files (user_id, filename, qdrant_collection_name, file_size) VALUES (%s, %s, %s, %s) RETURNING id",
            (user_id, filename, qdrant_collection_name, file_size)
        )
        row = await cur.fetchone()
        return row[0] if row else None

async def get_files_by_user(conn: AsyncConnection, user_id: int):
    async with conn.cursor() as cur:
        await cur.execute("SELECT id, filename, qdrant_collection_name, file_size, created_at FROM files WHERE user_id = %s ORDER BY created_at DESC", (user_id,))
        rows = await cur.fetchall()
        return [{"id": row[0], "filename": row[1], "qdrant_collection_name": row[2], "file_size": row[3], "created_at": row[4]} for row in rows]

async def get_file_by_id(conn: AsyncConnection, file_id: int):
    async with conn.cursor() as cur:
        await cur.execute("SELECT id, user_id, filename, qdrant_collection_name, file_size, created_at FROM files WHERE id = %s LIMIT 1", (file_id,))
        row = await cur.fetchone()
        if row:
            return {"id": row[0], "user_id": row[1], "filename": row[2], "qdrant_collection_name": row[3], "file_size": row[4], "created_at": row[5]}
    return None