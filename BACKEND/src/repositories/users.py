from psycopg import AsyncConnection

async def get_user_by_email(conn: AsyncConnection, email: str):
    async with conn.cursor() as cur:
        await cur.execute("SELECT id, email, password_hash FROM users WHERE email = %s LIMIT 1", (email,))
        row = await cur.fetchone()
        if row:
            return {"id": row[0], "email": row[1], "password_hash": row[2]}
    return None

async def create_user(conn: AsyncConnection, email: str, password_hash: str):
    async with conn.cursor() as cur:
        await cur.execute(
            "INSERT INTO users (email, password_hash) VALUES (%s, %s) RETURNING id",
            (email, password_hash)
        )
        row = await cur.fetchone()
        return row[0] if row else None