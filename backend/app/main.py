"""FastAPI application entrypoint for Quorum."""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.db import init_db
from app.routers import checkins, events, invitees, reports


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


def create_app() -> FastAPI:
    app = FastAPI(
        title="Quorum API",
        version="0.1.0",
        description=(
            "Verified attendance. Anonymous by design. Backend for biometric event "
            "check-in where attendee identity is a pseudonymous template hash."
        ),
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(events.router)
    app.include_router(invitees.router)
    app.include_router(checkins.router)
    app.include_router(reports.router)

    @app.get("/health", tags=["meta"])
    def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
