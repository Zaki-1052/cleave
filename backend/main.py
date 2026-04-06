# backend/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from config import settings
from logging_config import setup_logging
from rate_limit import limiter
from routers import (
    admin,
    auth,
    experiments,
    fastq_files,
    files,
    jobs,
    local_import,
    notifications,
    projects,
    reactions,
    server_import,
    tus_upload,
    users,
)

setup_logging()

app = FastAPI(title="Cleave", version="0.1.0")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=[
        "Location",
        "Upload-Offset",
        "Upload-Length",
        "Upload-Expires",
        "Tus-Resumable",
        "Tus-Version",
        "Tus-Extension",
        "Tus-Max-Size",
    ],
)

app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(users.router, prefix="/api/v1/users", tags=["users"])
app.include_router(projects.router, prefix="/api/v1/projects", tags=["projects"])
app.include_router(experiments.router, prefix="/api/v1/experiments", tags=["experiments"])
app.include_router(reactions.router, prefix="/api/v1", tags=["reactions"])
app.include_router(fastq_files.router, prefix="/api/v1", tags=["fastqs"])
app.include_router(jobs.router, prefix="/api/v1", tags=["jobs"])
app.include_router(files.router, prefix="/api/v1", tags=["files"])
app.include_router(tus_upload.router, prefix="/api/v1", tags=["uploads"])
app.include_router(notifications.router, prefix="/api/v1/notifications", tags=["notifications"])
app.include_router(admin.router, prefix="/api/v1/admin", tags=["admin"])
app.include_router(server_import.router, prefix="/api/v1", tags=["server-import"])
app.include_router(local_import.router, prefix="/api/v1", tags=["local-import"])


@app.get("/api/v1/health")
async def health_check():
    return {"status": "ok"}
