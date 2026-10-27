from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

bearer = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class CurrentUser:
    id: str
    email: str | None
    role: str


async def authenticated_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
) -> CurrentUser:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Autenticação necessária.", headers={"WWW-Authenticate": "Bearer"})
    client = getattr(request.app.state, "supabase", None)
    if client is None:
        raise HTTPException(status_code=503, detail="Autenticação do backend não configurada.")
    try:
        # GoTrue validates signature, issuer, audience, expiry and current user state.
        response = client.auth.get_user(credentials.credentials)
        auth_user = response.user
        if auth_user is None or not auth_user.id:
            raise HTTPException(status_code=401, detail="Sessão inválida ou expirada.", headers={"WWW-Authenticate": "Bearer"})
    except HTTPException:
        raise
    except Exception as exc:
        auth_status = getattr(exc, "status", None) or getattr(exc, "status_code", None)
        if auth_status in {400, 401, 403} or isinstance(exc, ValueError):
            raise HTTPException(status_code=401, detail="Sessão inválida ou expirada.", headers={"WWW-Authenticate": "Bearer"}) from exc
        raise HTTPException(status_code=503, detail="Serviço de autenticação temporariamente indisponível.") from exc
    try:
        profile = client.table("user_profiles").select("role,active").eq("id", auth_user.id).maybe_single().execute().data
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Não foi possível consultar o perfil de acesso.") from exc
    if not profile or profile.get("active") is not True or profile.get("role") not in {"DIRETOR", "MONITOR"}:
        raise HTTPException(status_code=403, detail="Usuário sem perfil ativo autorizado.")
    return CurrentUser(id=str(auth_user.id), email=getattr(auth_user, "email", None), role=profile["role"])


def require_roles(*roles: str) -> Callable:
    async def dependency(user: CurrentUser = Depends(authenticated_user)) -> CurrentUser:
        if user.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permissão insuficiente.")
        return user

    return dependency
