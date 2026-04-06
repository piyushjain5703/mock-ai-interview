from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import create_access_token, hash_password, verify_password
from app.db import get_db
from app.deps import get_current_user
from app.models import Profile, User
from app.schemas import LoginRequest, SignUpRequest, TokenResponse, UserResponse

router = APIRouter(prefix="/auth")


@router.post("/signup", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def signup(payload: SignUpRequest, db: Session = Depends(get_db)) -> TokenResponse:
    existing_user = db.scalar(select(User).where(User.email == payload.email))
    if existing_user:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    user = User(email=payload.email, hashed_password=hash_password(payload.password))
    db.add(user)
    db.flush()
    db.add(Profile(user_id=user.id))
    db.commit()
    db.refresh(user)

    return TokenResponse(access_token=create_access_token(str(user.id)))


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    user = db.scalar(select(User).where(User.email == payload.email))
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    return TokenResponse(access_token=create_access_token(str(user.id)))


@router.get("/me", response_model=UserResponse)
def me(current_user: User = Depends(get_current_user)) -> UserResponse:
    return UserResponse.model_validate(current_user)
