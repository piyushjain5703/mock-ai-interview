from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models import Profile, User
from app.schemas import ProfilePayload, ProfileResponse

router = APIRouter(prefix="/profile")


@router.get("", response_model=ProfileResponse)
def get_profile(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> ProfileResponse:
    profile = db.query(Profile).filter(Profile.user_id == current_user.id).first()
    if profile is None:
        profile = Profile(user_id=current_user.id)
        db.add(profile)
        db.commit()
        db.refresh(profile)

    roles = [role for role in (profile.preferred_roles or "").split(",") if role]
    return ProfileResponse(
        user_id=current_user.id,
        full_name=profile.full_name,
        experience_level=profile.experience_level,
        preferred_roles=roles,
    )


@router.put("", response_model=ProfileResponse)
def update_profile(
    payload: ProfilePayload,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ProfileResponse:
    profile = db.query(Profile).filter(Profile.user_id == current_user.id).first()
    if profile is None:
        profile = Profile(user_id=current_user.id)
        db.add(profile)

    profile.full_name = payload.full_name
    profile.experience_level = payload.experience_level
    profile.preferred_roles = ",".join(payload.preferred_roles)
    db.commit()
    db.refresh(profile)

    return ProfileResponse(
        user_id=current_user.id,
        full_name=profile.full_name,
        experience_level=profile.experience_level,
        preferred_roles=payload.preferred_roles,
    )
