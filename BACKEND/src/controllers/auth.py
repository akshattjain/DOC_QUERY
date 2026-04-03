from fastapi import APIRouter, HTTPException, Depends, Request, status
from pydantic import BaseModel
from psycopg import errors

from src.services import auth_service
from src.repositories import users

router = APIRouter()

class UserRegister(BaseModel):
    email: str
    password: str

class UserLogin(BaseModel):
    email: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str

@router.post("/register", response_model=Token)
async def register(user: UserRegister, request: Request):
    conn = request.app.state.db_pool.connection()
    async with conn as connection:
        hashed_pw = auth_service.get_password_hash(user.password)
        try:
            user_id = await users.create_user(connection, user.email, hashed_pw)
            await connection.commit()
        except errors.UniqueViolation:
            raise HTTPException(status_code=400, detail="Email already registered")
        
        token = auth_service.create_access_token(data={"sub": str(user_id), "email": user.email})
        return {"access_token": token, "token_type": "bearer"}

@router.post("/login", response_model=Token)
async def login(user: UserLogin, request: Request):
    conn = request.app.state.db_pool.connection()
    async with conn as connection:
        db_user = await users.get_user_by_email(connection, user.email)
        if not db_user:
            raise HTTPException(status_code=400, detail="Invalid email or password")
        
        if not auth_service.verify_password(user.password, db_user["password_hash"]):
            raise HTTPException(status_code=400, detail="Invalid email or password")
        
        token = auth_service.create_access_token(data={"sub": str(db_user["id"]), "email": db_user["email"]})
        return {"access_token": token, "token_type": "bearer"}