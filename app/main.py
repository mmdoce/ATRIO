from __future__ import annotations

import os
import logging
import re
import traceback
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from typing import Annotated, Literal
from uuid import UUID, uuid4

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, Form, HTTPException, Query, Request, UploadFile, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from supabase import Client, create_client

from app.schemas import (
    CadastroAlunoCreate,
    CadastroAlunoResponse,
    ContratoEncerradoResponse,
    ContratoExistenteCreate,
    AlunoDetailRead,
    AlunoListRead,
    ContratoDetailRead,
    ContratoListRead,
    DashboardIndicadoresRead,
    MensalidadeListRead,
    PagamentoListRead,
    PaginatedResult,
    ReativarAlunoCreate,
    PreviaVencimentoCreate,
    PreviaVencimentoResponse,
)
from app.services import cadastrar_aluno_contrato, cadastrar_contrato_existente, reativar_aluno_com_novo_contrato
from app import read_services
from app.auth import CurrentUser, require_roles

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
RECEIPTS_BUCKET = os.getenv("SUPABASE_RECEIPTS_BUCKET", "comprovantes-mensalidades")
MAX_RECEIPT_BYTES = 10 * 1024 * 1024
ALLOWED_RECEIPT_TYPES = {"application/pdf", "image/jpeg", "image/png", "image/webp"}

# Importar a aplicação para gerar schemas e testes locais não exige conexão real.
supabase: Client | None = None
if SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY:
    supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

app = FastAPI(title="Átrio API", version="0.2.0")
app.state.supabase = supabase
logger = logging.getLogger(__name__)

_SENSITIVE_VALUE = re.compile(
    r"(?i)(?P<key>\b(?:cpf|rg|telefone|phone|cep|nome|name|email|endereco|address|bairro|cidade|estado|"
    r"data_nascimento|data_contrato|mensalidade_valor|matricula_valor|valor_devido|valor_pago|"
    r"mensalidade_id|aluno_id|responsavel_id|p_aluno|p_responsavel|authorization|apikey|api_key|"
    r"access_token|refresh_token|service_role_key|password|secret)\b[\"'\)\]]*\s*(?:[:=]\s*|\)\s*=\s*))"
    r"(?P<value>\"(?:\\.|[^\"])*\"|'(?:\\.|[^'])*'|\{[^{}]*\}|\([^)]*\)|[^\s,;}\]]+)"
)
_CPF_VALUE = re.compile(r"(?<!\d)(?:\d{3}[.]?\d{3}[.]?\d{3}-?\d{2})(?!\d)")
_CEP_VALUE = re.compile(r"(?<!\d)\d{5}-?\d{3}(?!\d)")
_BEARER_VALUE = re.compile(r"(?i)\bBearer\s+[^\s,;]+")
_JWT_VALUE = re.compile(r"\beyJ[A-Za-z0-9_-]{20,}(?:\.[A-Za-z0-9_-]+){1,2}\b")


def _sanitized_exception_traceback(exc: Exception) -> str:
    """Format the full traceback while redacting common personal/secret values."""
    formatted = "".join(traceback.format_exception(type(exc), exc, exc.__traceback__))
    formatted = _SENSITIVE_VALUE.sub(lambda match: f"{match.group('key')}[REDACTED]", formatted)
    formatted = _CPF_VALUE.sub("[CPF REDACTED]", formatted)
    formatted = _CEP_VALUE.sub("[CEP REDACTED]", formatted)
    formatted = _BEARER_VALUE.sub("Bearer [REDACTED]", formatted)
    return _JWT_VALUE.sub("[TOKEN REDACTED]", formatted)


def _rpc_failure_response(exc: Exception) -> tuple[int, str]:
    message = str(exc).lower()
    code = str(getattr(exc, "code", "")).upper()
    if code == "PGRST202" or "schema cache" in message or "could not find the function" in message:
        return status.HTTP_503_SERVICE_UNAVAILABLE, "RPC de cadastro indisponível; verifique a migração e o schema do banco."
    if code == "42501" or "permission denied" in message:
        return status.HTTP_503_SERVICE_UNAVAILABLE, "O banco não permite executar a operação de cadastro."
    if "contrato ativo" in message or "unique" in message or code == "23505":
        return status.HTTP_409_CONFLICT, "Cadastro conflitante; verifique o CPF e o contrato ativo."
    if "tipo de vaga" in message or "foreign key" in message or code == "23503":
        return status.HTTP_422_UNPROCESSABLE_ENTITY, "Tipo de vaga ou vínculo informado inválido."
    if "valores do contrato inválidos" in message or "data do contrato não pode estar no futuro" in message:
        return status.HTTP_422_UNPROCESSABLE_ENTITY, "Dados do contrato inválidos. Revise os valores e a data."
    if "aluno não encontrado" in message or "responsável não encontrado" in message:
        return status.HTTP_404_NOT_FOUND, "Aluno ou responsável não encontrado."
    return status.HTTP_500_INTERNAL_SERVER_ERROR, "Não foi possível concluir o cadastro. Consulte o log do backend."
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH"],
    allow_headers=["Content-Type", "Authorization"],
)


@app.exception_handler(RequestValidationError)
async def sanitized_validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
    """Return field locations and messages without echoing submitted personal data."""
    errors = [
        {"loc": error.get("loc", ()), "msg": error.get("msg", "Valor inválido"), "type": error.get("type", "value_error")}
        for error in exc.errors()
    ]
    return JSONResponse(status_code=422, content={"detail": errors})


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/auth/me")
def auth_me(user: CurrentUser = Depends(require_roles("DIRETOR", "MONITOR"))) -> dict:
    return {"id": user.id, "email": user.email, "role": user.role}


@app.get("/admin/usuarios")
def listar_usuarios(user: CurrentUser = Depends(require_roles("DIRETOR"))) -> list[dict]:
    try:
        client = _require_supabase()
        result = client.table("user_profiles").select("id,role,active,created_at").order("created_at").execute()
        users = []
        for profile in result.data or []:
            auth_user = client.auth.admin.get_user_by_id(profile["id"]).user
            users.append({**profile, "email": getattr(auth_user, "email", None)})
        return users
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Não foi possível consultar perfis; confirme a migração local de autenticação.") from exc


@app.post("/admin/usuarios", status_code=status.HTTP_201_CREATED)
def convidar_usuario(payload: dict, user: CurrentUser = Depends(require_roles("DIRETOR"))) -> dict:
    email = payload.get("email")
    role = payload.get("role")
    if not isinstance(email, str) or len(email) > 254 or not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email) or role not in {"DIRETOR", "MONITOR"}:
        raise HTTPException(status_code=422, detail="Informe um e-mail válido e um perfil permitido.")
    client = _require_supabase()
    auth_user = None
    try:
        if role == "DIRETOR":
            directors = client.table("user_profiles").select("id").eq("role", "DIRETOR").eq("active", True).limit(1).execute()
            if not directors.data:
                raise HTTPException(status_code=409, detail="Não há Diretor ativo; use o procedimento administrativo de primeiro provisionamento.")
        invite_options: dict = {}
        redirect = os.getenv("AUTH_INVITE_REDIRECT_URL")
        if redirect:
            invite_options["redirect_to"] = redirect
        invited = client.auth.admin.invite_user_by_email(email.strip().lower(), options=invite_options)
        auth_user = invited.user
        if auth_user is None:
            raise RuntimeError("Invite did not return a user")
        client.table("user_profiles").insert({"id": auth_user.id, "role": role, "active": True}).execute()
        return {"id": str(auth_user.id), "role": role, "active": True}
    except HTTPException:
        raise
    except Exception as exc:
        if auth_user is not None:
            try:
                client.auth.admin.delete_user(auth_user.id)
            except Exception:
                logger.error("Falha ao remover usuário Auth órfão após convite incompleto.")
        logger.error("Falha no convite de usuário (%s)", type(exc).__name__)
        raise HTTPException(status_code=502, detail="Não foi possível concluir o convite. Verifique o SMTP e os logs do Supabase.") from exc


@app.patch("/admin/usuarios/{user_id}")
def atualizar_perfil_usuario(user_id: UUID, payload: dict, user: CurrentUser = Depends(require_roles("DIRETOR"))) -> dict:
    if str(user_id) == user.id and payload.get("role") == "DIRETOR":
        raise HTTPException(status_code=403, detail="Não é permitido elevar o próprio perfil.")
    if not payload or set(payload) - {"role", "active"}:
        raise HTTPException(status_code=422, detail="Informe somente role e/ou active.")
    if "role" in payload and payload["role"] not in {"DIRETOR", "MONITOR"}:
        raise HTTPException(status_code=422, detail="Perfil inválido.")
    if "active" in payload and not isinstance(payload["active"], bool):
        raise HTTPException(status_code=422, detail="Estado active inválido.")
    try:
        result = _require_supabase().table("user_profiles").update(payload).eq("id", str(user_id)).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Perfil não encontrado.")
        return {"id": str(user_id), "role": result.data[0]["role"], "active": result.data[0]["active"]}
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Falha na atualização de perfil (%s)", type(exc).__name__)
        raise HTTPException(status_code=409, detail="Não foi possível alterar o perfil; a operação pode preservar o último Diretor ativo.") from exc


def _require_supabase() -> Client:
    if supabase is None:
        raise HTTPException(status_code=503, detail="Backend Supabase não configurado.")
    return supabase


def _read_failure() -> HTTPException:
    # Exception messages from PostgREST may include submitted values or schema details.
    return HTTPException(status_code=502, detail="Não foi possível consultar os dados solicitados.")


@app.get("/alunos", response_model=PaginatedResult[AlunoListRead])
def listar_alunos(
    q: str | None = Query(default=None, max_length=100),
    ativo: bool | None = None,
    situacao: Literal["ativo", "encerrado", "inativo"] | None = None,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    user: CurrentUser = Depends(require_roles("DIRETOR", "MONITOR")),
) -> dict:
    try:
        result = read_services.list_alunos(_require_supabase(), limit, offset, q, ativo, situacao)
        if user.role == "MONITOR":
            for item in result.get("items", []):
                item["contrato_atual"] = None
        return result
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Falha na consulta GET /alunos (%s)", type(exc).__name__)
        raise _read_failure() from exc


@app.get("/alunos/{aluno_id}", response_model=AlunoDetailRead)
def detalhar_aluno(aluno_id: UUID, user: CurrentUser = Depends(require_roles("DIRETOR", "MONITOR"))) -> dict:
    try:
        result = read_services.get_aluno(_require_supabase(), aluno_id)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Falha na consulta GET /alunos/{aluno_id} (%s)", type(exc).__name__)
        raise _read_failure() from exc
    if result is None:
        raise HTTPException(status_code=404, detail="Acolhido não encontrado.")
    if user.role == "MONITOR":
        owned = _require_supabase().table("contratos").select("id").eq("aluno_id", str(aluno_id)).eq("created_by_user_id", user.id).execute()
        owned_ids = {str(row["id"]) for row in (owned.data or [])}
        result["contratos"] = [contract for contract in result.get("contratos", []) if str(contract["id"]) in owned_ids]
    return result


@app.get("/contratos", response_model=PaginatedResult[ContratoListRead])
def listar_contratos(
    aluno_id: UUID | None = None,
    situacao: Literal["ativo", "encerrado", "suspenso"] | None = None,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    user: CurrentUser = Depends(require_roles("DIRETOR", "MONITOR")),
) -> dict:
    try:
        if user.role == "MONITOR":
            return read_services.list_contratos(_require_supabase(), limit, offset, aluno_id, situacao, created_by_user_id=user.id)
        return read_services.list_contratos(_require_supabase(), limit, offset, aluno_id, situacao)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Falha na consulta GET /contratos (%s)", type(exc).__name__)
        raise _read_failure() from exc


@app.get("/contratos/{contrato_id}", response_model=ContratoDetailRead)
def detalhar_contrato(contrato_id: UUID, user: CurrentUser = Depends(require_roles("DIRETOR", "MONITOR"))) -> dict:
    try:
        if user.role == "MONITOR":
            result = read_services.get_contrato(_require_supabase(), contrato_id, created_by_user_id=user.id)
        else:
            result = read_services.get_contrato(_require_supabase(), contrato_id)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Falha na consulta GET /contratos/{contrato_id} (%s)", type(exc).__name__)
        raise _read_failure() from exc
    if result is None:
        raise HTTPException(status_code=404, detail="Contrato não encontrado.")
    return result


def _competencia(value: str | None) -> date | None:
    if value is None:
        return None
    try:
        parsed = datetime.strptime(value, "%Y-%m").date()
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="Competência deve seguir o formato AAAA-MM.") from exc
    return parsed.replace(day=1)


@app.get("/mensalidades", response_model=PaginatedResult[MensalidadeListRead])
def listar_mensalidades(
    q: str | None = Query(default=None, max_length=100),
    competencia: str | None = Query(default=None, pattern=r"^\d{4}-(0[1-9]|1[0-2])$"),
    status_cobranca: Literal["pendente", "paga", "cancelada"] | None = Query(default=None, alias="status"),
    aluno_id: UUID | None = None,
    contrato_id: UUID | None = None,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    user: CurrentUser = Depends(require_roles("DIRETOR")),
) -> dict:
    try:
        if q:
            return read_services.list_mensalidades(_require_supabase(), limit, offset, _competencia(competencia), status_cobranca, aluno_id, contrato_id, q)
        return read_services.list_mensalidades(_require_supabase(), limit, offset, _competencia(competencia), status_cobranca, aluno_id, contrato_id)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Falha na consulta GET /mensalidades (%s)", type(exc).__name__)
        raise _read_failure() from exc


@app.get("/pagamentos", response_model=PaginatedResult[PagamentoListRead])
def listar_pagamentos(
    q: str | None = Query(default=None, max_length=100),
    mensalidade_id: UUID | None = None,
    aluno_id: UUID | None = None,
    data_inicio: date | None = None,
    data_fim: date | None = None,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    user: CurrentUser = Depends(require_roles("DIRETOR")),
) -> dict:
    if data_inicio and data_fim and data_fim < data_inicio:
        raise HTTPException(status_code=422, detail="Data final deve ser igual ou posterior à data inicial.")
    try:
        if q:
            return read_services.list_pagamentos(_require_supabase(), limit, offset, mensalidade_id, aluno_id, data_inicio, data_fim, q)
        return read_services.list_pagamentos(_require_supabase(), limit, offset, mensalidade_id, aluno_id, data_inicio, data_fim)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Falha na consulta GET /pagamentos (%s)", type(exc).__name__)
        raise _read_failure() from exc


@app.get("/dashboard/indicadores", response_model=DashboardIndicadoresRead)
def obter_indicadores_dashboard(user: CurrentUser = Depends(require_roles("DIRETOR"))) -> dict:
    try:
        return read_services.dashboard_indicadores(_require_supabase())
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Falha na consulta GET /dashboard/indicadores (%s)", type(exc).__name__)
        raise _read_failure() from exc


@app.post("/contratos/previa-vencimento", response_model=PreviaVencimentoResponse)
def previa_vencimento(request: PreviaVencimentoCreate, user: CurrentUser = Depends(require_roles("DIRETOR", "MONITOR"))) -> dict[str, str]:
    """Calcula a data a conferir antes do POST agregado, sem persistir dados."""
    from datetime import timedelta

    return {"primeiro_vencimento": (request.data_contrato + timedelta(days=30)).isoformat()}


@app.post("/alunos", response_model=CadastroAlunoResponse, status_code=status.HTTP_201_CREATED)
def cadastrar_aluno(cadastro: CadastroAlunoCreate, user: CurrentUser = Depends(require_roles("DIRETOR", "MONITOR"))) -> dict:
    """Cadastra pessoas, contrato e cobranças iniciais em uma transação."""
    if supabase is None:
        raise HTTPException(status_code=503, detail="Backend Supabase não configurado.")
    try:
        return cadastrar_aluno_contrato(supabase, cadastro, user.id)
    except Exception as exc:
        logger.error(
            "Falha na RPC cadastrar_aluno_contrato (POST /alunos):\n%s",
            _sanitized_exception_traceback(exc),
        )
        response_status, detail = _rpc_failure_response(exc)
        raise HTTPException(status_code=response_status, detail=detail) from exc


@app.post("/contratos", response_model=CadastroAlunoResponse, status_code=status.HTTP_201_CREATED)
def cadastrar_contrato(contrato: ContratoExistenteCreate, user: CurrentUser = Depends(require_roles("DIRETOR"))) -> dict:
    """Cria contrato e cobranças iniciais para aluno/responsável já cadastrados."""
    if supabase is None:
        raise HTTPException(status_code=503, detail="Backend Supabase não configurado.")
    try:
        return cadastrar_contrato_existente(supabase, contrato, user.id)
    except Exception as exc:
        message = str(exc).lower()
        if "contrato ativo" in message or "unique" in message:
            raise HTTPException(status_code=409, detail="Aluno já possui contrato ativo.") from exc
        if "tipo de vaga" in message:
            raise HTTPException(status_code=422, detail="Tipo de vaga inexistente ou inativo.") from exc
        if "não encontrado" in message or "foreign key" in message:
            raise HTTPException(status_code=404, detail="Aluno, responsável ou tipo de vaga não encontrado.") from exc
        raise HTTPException(status_code=400, detail="Não foi possível cadastrar o contrato.") from exc


@app.post("/contratos/{contrato_id}/encerrar", response_model=ContratoEncerradoResponse)
def encerrar_contrato(contrato_id: UUID, user: CurrentUser = Depends(require_roles("DIRETOR"))) -> dict:
    """Encerra o contrato ativo sem alterar parcelas ou pagamentos históricos."""
    if supabase is None:
        raise HTTPException(status_code=503, detail="Backend Supabase não configurado.")
    try:
        response = supabase.rpc("encerrar_contrato", {"p_contrato_id": str(contrato_id)}).execute()
        return response.data
    except Exception as exc:
        raise HTTPException(status_code=404, detail="Contrato ativo não encontrado.") from exc


@app.post("/alunos/{aluno_id}/reativar", response_model=CadastroAlunoResponse, status_code=status.HTTP_201_CREATED)
def reativar_aluno(aluno_id: UUID, contrato: ReativarAlunoCreate, user: CurrentUser = Depends(require_roles("DIRETOR"))) -> dict:
    """Reativa aluno encerrado por meio de um novo contrato e suas cobranças iniciais."""
    if supabase is None:
        raise HTTPException(status_code=503, detail="Backend Supabase não configurado.")
    try:
        return reativar_aluno_com_novo_contrato(supabase, contrato, str(aluno_id), user.id)
    except Exception as exc:
        code, detail = _rpc_failure_response(exc)
        message = str(exc).lower()
        if "contrato ativo" in message or "unique" in message or getattr(exc, "code", "") == "23505":
            raise HTTPException(status_code=409, detail="O acolhido já possui vínculo ativo.") from exc
        if "contrato encerrado" in message or "aluno não encontrado" in message or "responsável não encontrado" in message:
            raise HTTPException(status_code=409 if "encerrado" in message else 404, detail="Não foi possível reativar o acolhido no estado atual.") from exc
        raise HTTPException(status_code=code, detail=detail) from exc


@app.post("/mensalidades/baixa")
async def baixar_mensalidade(
    mensalidade_id: Annotated[UUID, Form()],
    valor_pago: Annotated[Decimal, Form(gt=0, max_digits=10, decimal_places=2)],
    forma_pagamento: Annotated[
        Literal[
            "dinheiro",
            "pix",
            "cartao_credito",
            "cartao_debito",
            "transferencia",
            "boleto",
            "outro",
        ],
        Form(),
    ],
    comprovante: Annotated[UploadFile | None, File()] = None,
    user: CurrentUser = Depends(require_roles("DIRETOR")),
) -> dict:
    """Registra a baixa de uma parcela existente; não cria parcelas."""
    if supabase is None:
        raise HTTPException(status_code=503, detail="Backend Supabase não configurado.")
    comprovante_path: str | None = None
    if comprovante is not None:
        if comprovante.content_type not in ALLOWED_RECEIPT_TYPES:
            raise HTTPException(status_code=415, detail="Formato de comprovante não permitido.")
        contents = await comprovante.read(MAX_RECEIPT_BYTES + 1)
        if len(contents) > MAX_RECEIPT_BYTES:
            raise HTTPException(status_code=413, detail="Comprovante excede o limite de 10 MB.")
        suffix = Path(comprovante.filename or "").suffix.lower()
        if suffix not in {".pdf", ".jpg", ".jpeg", ".png", ".webp"}:
            suffix = {"application/pdf": ".pdf", "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}[comprovante.content_type]
        comprovante_path = f"{mensalidade_id}/{uuid4()}{suffix}"
        try:
            supabase.storage.from_(RECEIPTS_BUCKET).upload(
                comprovante_path,
                contents,
                {"content-type": comprovante.content_type, "upsert": "false"},
            )
        except Exception as exc:
            raise HTTPException(status_code=502, detail="Falha ao enviar o comprovante ao Storage.") from exc

    try:
        response = supabase.rpc(
            "baixar_mensalidade",
            {
                "p_mensalidade_id": str(mensalidade_id),
                "p_valor_pago": str(valor_pago),
                "p_forma_pagamento": forma_pagamento,
                "p_comprovante_path": comprovante_path,
            },
        ).execute()
        return response.data
    except Exception as exc:
        if comprovante_path:
            try:
                supabase.storage.from_(RECEIPTS_BUCKET).remove([comprovante_path])
            except Exception:
                pass
        message = str(exc).lower()
        if "não encontrada" in message or "ja baixada" in message or "já baixada" in message:
            raise HTTPException(status_code=409, detail="Parcela inexistente ou já baixada.") from exc
        if "valor pago" in message:
            raise HTTPException(status_code=422, detail="O valor pago deve ser igual ao valor da parcela.") from exc
        raise HTTPException(status_code=400, detail="Não foi possível dar baixa na parcela.") from exc
