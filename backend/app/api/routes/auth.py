from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import create_access_token, hash_password, verify_password
from app.db import get_db
from app.deps import get_current_user
from app.models import Profile, User
from app.schemas import (
    AppleAuthRequest,
    GoogleAuthRequest,
    LoginRequest,
    SignUpRequest,
    TokenResponse,
    UserResponse,
)
from app.services.oauth_service import verify_apple_id_token, verify_google_id_token

router = APIRouter(prefix="/auth")


def _get_or_create_oauth_user(
    db: Session,
    *,
    provider: str,
    subject: str,
    email: str,
    full_name: Optional[str],
    picture_url: Optional[str],
) -> User:
    user = db.scalar(
        select(User).where(User.oauth_provider == provider, User.oauth_subject == subject)
    )
    if user:
        # Refresh stored profile fields with the latest claims.
        if full_name and user.full_name != full_name:
            user.full_name = full_name
        if picture_url and user.picture_url != picture_url:
            user.picture_url = picture_url
        db.commit()
        db.refresh(user)
        return user

    if email:
        existing = db.scalar(select(User).where(User.email == email))
        if existing:
            existing.oauth_provider = provider
            existing.oauth_subject = subject
            if full_name and not existing.full_name:
                existing.full_name = full_name
            if picture_url and not existing.picture_url:
                existing.picture_url = picture_url
            db.commit()
            db.refresh(existing)
            return existing

    if not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="OAuth provider did not return an email address.",
        )

    user = User(
        email=email,
        hashed_password=None,
        full_name=full_name,
        picture_url=picture_url,
        oauth_provider=provider,
        oauth_subject=subject,
    )
    db.add(user)
    db.flush()
    db.add(Profile(user_id=user.id, full_name=full_name))
    db.commit()
    db.refresh(user)
    return user


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
    if not user or not user.hashed_password or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    return TokenResponse(access_token=create_access_token(str(user.id)))


@router.post("/google", response_model=TokenResponse)
def google_auth(payload: GoogleAuthRequest, db: Session = Depends(get_db)) -> TokenResponse:
    claims = verify_google_id_token(payload.id_token)
    if not claims.get("email_verified", True):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google account email is not verified.",
        )
    user = _get_or_create_oauth_user(
        db,
        provider="google",
        subject=str(claims["sub"]),
        email=str(claims.get("email", "")).lower(),
        full_name=claims.get("name"),
        picture_url=claims.get("picture"),
    )
    return TokenResponse(access_token=create_access_token(str(user.id)))


@router.post("/apple", response_model=TokenResponse)
def apple_auth(payload: AppleAuthRequest, db: Session = Depends(get_db)) -> TokenResponse:
    claims = verify_apple_id_token(payload.id_token)
    user = _get_or_create_oauth_user(
        db,
        provider="apple",
        subject=str(claims["sub"]),
        email=str(claims.get("email", "")).lower(),
        full_name=payload.full_name,
        picture_url=None,
    )
    return TokenResponse(access_token=create_access_token(str(user.id)))


@router.get("/me", response_model=UserResponse)
def me(current_user: User = Depends(get_current_user)) -> UserResponse:
    return UserResponse.model_validate(current_user)
