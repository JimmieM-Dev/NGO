from __future__ import annotations

import os
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient


@pytest.fixture(autouse=True)
def _isolated_db(
    tmp_path_factory: pytest.TempPathFactory,
    monkeypatch: pytest.MonkeyPatch,
) -> Iterator[None]:
    """Give each test a fresh SQLite file and rebind the engine to it."""
    db_path = tmp_path_factory.mktemp("db") / "test.db"
    monkeypatch.setenv("QUORUM_DATABASE_URL", f"sqlite:///{db_path}")

    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    from app import db as db_module
    from app import models  # noqa: F401

    engine = create_engine(
        os.environ["QUORUM_DATABASE_URL"],
        connect_args={"check_same_thread": False},
    )
    monkeypatch.setattr(db_module, "engine", engine)
    monkeypatch.setattr(
        db_module,
        "SessionLocal",
        sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True),
    )
    db_module.Base.metadata.create_all(bind=engine)
    yield


@pytest.fixture()
def client() -> Iterator[TestClient]:
    from app.main import create_app

    app = create_app()
    with TestClient(app) as c:
        yield c
