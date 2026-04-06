from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import settings
from app.db import Base, engine
from app import models  # noqa: F401

app = FastAPI(title=settings.app_name)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://0.0.0.0:5173"],
    # Dev: localhost, loopback, and LAN IPs (e.g. phone testing via Vite --host)
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1|0\.0\.0\.0|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3})(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(api_router, prefix="/api/v1")


@app.on_event("startup")
def on_startup() -> None:
    Base.metadata.create_all(bind=engine)


@app.get("/")
def root() -> dict[str, str]:
    return {"service": settings.app_name, "env": settings.app_env}
