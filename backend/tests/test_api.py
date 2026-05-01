import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.base import Base
from app.api.analyses import get_db as analyses_get_db
from app.api.auth import get_db as auth_get_db

# File-based SQLite so all tables persist within one test
SQLALCHEMY_TEST_URL = "sqlite:///./test.db"

engine = create_engine(
    SQLALCHEMY_TEST_URL, connect_args={"check_same_thread": False}
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(autouse=True)
def setup_db():
    """Create all tables before each test, drop after."""
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def client():
    app.dependency_overrides[analyses_get_db] = override_get_db
    app.dependency_overrides[auth_get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def test_health(client):
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


def test_create_analysis(client):
    res = client.post("/api/v1/analyses", data={"title": "My Test"})
    assert res.status_code == 200
    body = res.json()
    assert "id" in body
    assert body["status"] == "pending"


def test_create_analysis_no_title(client):
    res = client.post("/api/v1/analyses", data={})
    assert res.status_code == 200
    assert "id" in res.json()


def test_get_status_no_job(client):
    analysis_id = client.post("/api/v1/analyses", data={}).json()["id"]
    res = client.get(f"/api/v1/analyses/{analysis_id}/status")
    assert res.status_code == 404


def test_get_results_not_ready(client):
    analysis_id = client.post("/api/v1/analyses", data={}).json()["id"]
    res = client.get(f"/api/v1/analyses/{analysis_id}/results")
    assert res.status_code == 404


def test_list_analyses_requires_auth(client):
    res = client.get("/api/v1/analyses")
    assert res.status_code == 401


def test_register_and_login(client):
    res = client.post("/api/v1/auth/register", json={"email": "test@x.com", "password": "password123"})
    assert res.status_code == 200
    assert "access_token" in res.json()

    res2 = client.post("/api/v1/auth/login", json={"email": "test@x.com", "password": "password123"})
    assert res2.status_code == 200
    assert "access_token" in res2.json()


def test_register_duplicate_email(client):
    client.post("/api/v1/auth/register", json={"email": "a@b.com", "password": "password123"})
    res = client.post("/api/v1/auth/register", json={"email": "a@b.com", "password": "password123"})
    assert res.status_code == 409


def test_login_wrong_password(client):
    client.post("/api/v1/auth/register", json={"email": "c@d.com", "password": "correctpass"})
    res = client.post("/api/v1/auth/login", json={"email": "c@d.com", "password": "wrongpass"})
    assert res.status_code == 401


def test_me_requires_auth(client):
    res = client.get("/api/v1/auth/me")
    assert res.status_code == 401


def test_me_with_valid_token(client):
    reg = client.post("/api/v1/auth/register", json={"email": "e@f.com", "password": "password123"})
    assert reg.status_code == 200, reg.json()
    token = reg.json()["access_token"]
    res = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    assert res.json()["email"] == "e@f.com"
