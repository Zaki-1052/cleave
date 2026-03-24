# backend/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from logging_config import setup_logging
from routers import (
    auth,
    experiments,
    fastq_files,
    files,
    jobs,
    notifications,
    projects,
    reactions,
    users,
)

setup_logging()

app = FastAPI(title="Cleave", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(users.router, prefix="/api/v1/users", tags=["users"])
app.include_router(projects.router, prefix="/api/v1/projects", tags=["projects"])
app.include_router(experiments.router, prefix="/api/v1/experiments", tags=["experiments"])
app.include_router(reactions.router, prefix="/api/v1", tags=["reactions"])
app.include_router(fastq_files.router, prefix="/api/v1", tags=["fastqs"])
app.include_router(jobs.router, prefix="/api/v1", tags=["jobs"])
app.include_router(files.router, prefix="/api/v1", tags=["files"])
app.include_router(notifications.router, prefix="/api/v1/notifications", tags=["notifications"])


@app.get("/api/v1/health")
async def health_check():
    return {"status": "ok"}
