import os

import redis as sync_redis
from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.base import SessionLocal
from app.models.models import User
from app.services.auth import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
    REFRESH_TOKEN_EXPIRE_DAYS,
)

router = APIRouter(prefix="/auth", tags=["auth"])

REFRESH_TTL_SECONDS = REFRESH_TOKEN_EXPIRE_DAYS * 86400


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_redis():
    r = sync_redis.from_url(os.getenv("REDIS_URL", "redis://redis:6379"))
    try:
        yield r
    finally:
        r.close()


# ── Request / response schemas ────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    email: str
    password: str


class LoginRequest(BaseModel):
    email: str
    password: str


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/register", summary="Register a new user")
def register(body: RegisterRequest, response: Response, db: Session = Depends(get_db)):
    if len(body.password) < 8:
        raise HTTPException(status_code=422, detail="Password must be at least 8 characters")

    existing = db.query(User).filter(User.email == body.email).first()
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")

    user = User(email=body.email, hashed_password=hash_password(body.password))
    db.add(user)
    db.commit()
    db.refresh(user)

    access_token = create_access_token(int(user.id))
    refresh_token = create_refresh_token(int(user.id))

    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        max_age=REFRESH_TTL_SECONDS,
        samesite="lax",
        secure=False,  # set True in production (HTTPS only)
    )
    return {"access_token": access_token, "user": {"id": user.id, "email": user.email}}


@router.post("/login", summary="Log in with email and password")
def login(body: LoginRequest, response: Response, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email).first()
    if not user or not verify_password(body.password, str(user.hashed_password)):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    access_token = create_access_token(int(user.id))
    refresh_token = create_refresh_token(int(user.id))

    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        max_age=REFRESH_TTL_SECONDS,
        samesite="lax",
        secure=False,
    )
    return {"access_token": access_token, "user": {"id": user.id, "email": user.email}}


@router.post("/refresh", summary="Exchange refresh token for new access token")
def refresh(
    response: Response,
    refresh_token: str | None = Cookie(default=None),
    r: sync_redis.Redis = Depends(get_redis),
    db: Session = Depends(get_db),
):
    if not refresh_token:
        raise HTTPException(status_code=401, detail="No refresh token")

    # Check blacklist
    if r.get(f"blacklist:{refresh_token}"):
        raise HTTPException(status_code=401, detail="Refresh token revoked")

    try:
        payload = decode_token(refresh_token)
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user_id = int(payload["sub"])
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")

    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    # Rotate: blacklist the old refresh token
    import time
    from jose import jwt as jose_jwt  # type: ignore[import-untyped]
    payload_raw = jose_jwt.decode(refresh_token, options={"verify_signature": False, "verify_exp": False})
    ttl_remaining = max(0, int(payload_raw.get("exp", 0)) - int(time.time()))
    if ttl_remaining > 0:
        r.setex(f"blacklist:{refresh_token}", ttl_remaining, "1")

    new_access = create_access_token(user_id)
    new_refresh = create_refresh_token(user_id)

    response.set_cookie(
        key="refresh_token",
        value=new_refresh,
        httponly=True,
        max_age=REFRESH_TTL_SECONDS,
        samesite="lax",
        secure=False,
    )
    return {"access_token": new_access, "user": {"id": user.id, "email": user.email}}


@router.post("/logout", summary="Invalidate refresh token")
def logout(
    response: Response,
    refresh_token: str | None = Cookie(default=None),
    r: sync_redis.Redis = Depends(get_redis),
):
    if refresh_token:
        import time
        try:
            from jose import jwt as jose_jwt  # type: ignore[import-untyped]
            payload = jose_jwt.decode(refresh_token, options={"verify_signature": False, "verify_exp": False})
            ttl_remaining = max(0, int(payload.get("exp", 0)) - int(time.time()))
            if ttl_remaining > 0:
                r.setex(f"blacklist:{refresh_token}", ttl_remaining, "1")
        except Exception:
            pass
    response.delete_cookie("refresh_token")
    return {"message": "Logged out"}


@router.get("/me", summary="Get current user info")
def me(request: Request, db: Session = Depends(get_db)):
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = auth_header[7:]
    try:
        payload = decode_token(token)
        user_id = int(payload["sub"])
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return {"id": user.id, "email": user.email}