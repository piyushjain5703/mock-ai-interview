from fastapi import APIRouter

from app.api.routes.auth import router as auth_router
from app.api.routes.evaluation import router as evaluation_router
from app.api.routes.health import router as health_router
from app.api.routes.history import router as history_router
from app.api.routes.interview import router as interview_router
from app.api.routes.profile import router as profile_router
from app.api.routes.resume import router as resume_router
from app.api.routes.webhook import router as webhook_router

api_router = APIRouter()
api_router.include_router(auth_router, tags=["auth"])
api_router.include_router(health_router, tags=["health"])
api_router.include_router(profile_router, tags=["profile"])
api_router.include_router(resume_router, tags=["resumes"])
api_router.include_router(interview_router, tags=["interviews"])
api_router.include_router(evaluation_router, tags=["evaluation"])
api_router.include_router(history_router, tags=["history"])
api_router.include_router(webhook_router, tags=["webhooks"])
