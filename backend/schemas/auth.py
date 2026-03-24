# backend/schemas/auth.py
from schemas.common import CamelModel


class LoginRequest(CamelModel):
    email: str
    password: str


class RegisterRequest(CamelModel):
    email: str
    password: str
    first_name: str | None = None
    last_name: str | None = None


class TokenResponse(CamelModel):
    access_token: str
    token_type: str = "bearer"


class RefreshRequest(CamelModel):
    refresh_token: str | None = None
