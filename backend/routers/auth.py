# backend/routers/auth.py
import jwt as pyjwt
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi_users.exceptions import InvalidPasswordException, UserAlreadyExists
from pydantic import EmailStr

from auth import UserManager, get_access_jwt_strategy, get_refresh_jwt_strategy, get_user_manager
from config import settings
from rate_limit import limiter
from schemas.common import CamelModel

router = APIRouter()


class _Credentials:
    """Adapter: fastapi-users authenticate() expects .username/.password attributes."""

    def __init__(self, email: str, password: str):
        self.username = email
        self.password = password


class LoginRequest(CamelModel):
    email: EmailStr
    password: str


class RegisterRequest(CamelModel):
    email: EmailStr
    password: str
    first_name: str | None = None
    last_name: str | None = None


class TokenResponse(CamelModel):
    access_token: str
    token_type: str = "bearer"


def _set_refresh_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key="fapiusers_refresh",
        value=token,
        httponly=True,
        samesite="lax",
        secure=settings.COOKIE_SECURE,
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
    )


@router.post("/login", response_model=TokenResponse)
@limiter.limit("5/minute")
async def login(
    body: LoginRequest,
    request: Request,
    response: Response,
    user_manager: UserManager = Depends(get_user_manager),
):
    from fastapi_users.router.common import ErrorCode

    user = await user_manager.authenticate(
        credentials=_Credentials(body.email, body.password),
    )
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=ErrorCode.LOGIN_BAD_CREDENTIALS,
        )

    access_strategy = get_access_jwt_strategy()
    access_token = await access_strategy.write_token(user)

    refresh_strategy = get_refresh_jwt_strategy()
    refresh_token = await refresh_strategy.write_token(user)
    _set_refresh_cookie(response, refresh_token)

    return TokenResponse(access_token=access_token)


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("3/minute")
async def register(
    body: RegisterRequest,
    request: Request,
    response: Response,
    user_manager: UserManager = Depends(get_user_manager),
):
    from fastapi_users.schemas import BaseUserCreate

    user_create = BaseUserCreate(
        email=body.email,
        password=body.password,
    )
    try:
        user = await user_manager.create(user_create, safe=True, request=request)
    except UserAlreadyExists:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="REGISTER_USER_ALREADY_EXISTS",
        )
    except InvalidPasswordException as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "REGISTER_INVALID_PASSWORD",
                "reason": e.reason,
            },
        )

    # Set custom fields that BaseUserCreate doesn't include
    if body.first_name is not None or body.last_name is not None:
        session = user_manager.user_db.session
        if body.first_name is not None:
            user.first_name = body.first_name
        if body.last_name is not None:
            user.last_name = body.last_name
        await session.commit()
        await session.refresh(user)

    access_strategy = get_access_jwt_strategy()
    access_token = await access_strategy.write_token(user)

    refresh_strategy = get_refresh_jwt_strategy()
    refresh_token = await refresh_strategy.write_token(user)
    _set_refresh_cookie(response, refresh_token)

    return TokenResponse(access_token=access_token)


@router.post("/refresh", response_model=TokenResponse)
@limiter.limit("10/minute")
async def refresh(
    request: Request,
    response: Response,
    user_manager: UserManager = Depends(get_user_manager),
):
    refresh_token = request.cookies.get("fapiusers_refresh")
    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No refresh token provided",
        )

    refresh_strategy = get_refresh_jwt_strategy()
    user = await refresh_strategy.read_token(refresh_token, user_manager)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )

    # Reject refresh if password was changed after this token was issued
    if user.password_changed_at is not None:
        try:
            payload = pyjwt.decode(
                refresh_token,
                settings.REFRESH_SECRET_KEY,
                algorithms=["HS256"],
                audience=["fastapi-users:auth"],
            )
            token_issued_at = payload["exp"] - (settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400)
            if token_issued_at < user.password_changed_at.timestamp():
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Password was changed. Please log in again.",
                )
        except pyjwt.PyJWTError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid refresh token",
            )

    access_strategy = get_access_jwt_strategy()
    access_token = await access_strategy.write_token(user)

    new_refresh = await refresh_strategy.write_token(user)
    _set_refresh_cookie(response, new_refresh)

    return TokenResponse(access_token=access_token)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(response: Response):
    response.delete_cookie(
        key="fapiusers_refresh",
        httponly=True,
        samesite="lax",
        secure=settings.COOKIE_SECURE,
    )


# --- Password Reset ---


class ForgotPasswordRequest(CamelModel):
    email: EmailStr


class ResetPasswordRequest(CamelModel):
    token: str
    password: str


@router.post("/forgot-password", status_code=status.HTTP_202_ACCEPTED)
@limiter.limit("3/minute")
async def forgot_password(
    body: ForgotPasswordRequest,
    request: Request,
    user_manager: UserManager = Depends(get_user_manager),
):
    try:
        user = await user_manager.get_by_email(body.email)
        await user_manager.forgot_password(user, request)
    except Exception:
        pass  # Always 202 to prevent email enumeration
    return {"status": "ok"}


@router.post("/reset-password", status_code=status.HTTP_200_OK)
@limiter.limit("5/minute")
async def reset_password(
    body: ResetPasswordRequest,
    request: Request,
    user_manager: UserManager = Depends(get_user_manager),
):
    try:
        await user_manager.reset_password(body.token, body.password, request)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="RESET_PASSWORD_BAD_TOKEN",
        )
    return {"status": "ok"}
