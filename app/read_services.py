from __future__ import annotations

import re
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Any
from uuid import UUID

from supabase import Client

from app.money import valor_por_extenso


def _rows(response: Any) -> list[dict[str, Any]]:
    return list(response.data or [])


def _page(client: Client, table: str, columns: str, limit: int, offset: int, filters: list[tuple[str, str, Any]]) -> tuple[list[dict[str, Any]], int]:
    query = client.table(table).select(columns, count="exact")
    for method, column, value in filters:
        query = getattr(query, method)(column, value)
    response = query.order("criado_em", desc=True).range(offset, offset + limit - 1).execute()
    return _rows(response), int(response.count or 0)


def _paged(items: list[dict[str, Any]], total: int, limit: int, offset: int) -> dict[str, Any]:
    return {"items": items, "total": total, "limit": limit, "offset": offset}


def _lookup(client: Client, table: str, columns: str, key: str, ids: list[str]) -> dict[str, dict[str, Any]]:
    unique_ids = list(dict.fromkeys(ids))
    if not unique_ids:
        return {}
    response = client.table(table).select(columns).in_(key, unique_ids).execute()
    return {str(row["id"]): row for row in _rows(response)}


def _matching_aluno_ids(client: Client, value: str) -> list[str]:
    term = re.sub(r"[^\w\s.-]", "", value, flags=re.UNICODE).strip()
    if not term:
        return []
    digits = re.sub(r"\D", "", term)
    query = client.table("alunos").select("id")
    if len(digits) == 11:
        query = query.or_(f"nome.ilike.%{term}%,cpf.eq.{digits},cpf.eq.{term}")
    else:
        query = query.ilike("nome", f"%{term}%")
    return [str(row["id"]) for row in _rows(query.limit(500).execute())]


def _contract_summary(row: dict[str, Any], responsible: dict[str, Any] | None = None) -> dict[str, Any]:
    result = {key: row.get(key) for key in (
        "id", "numero_contrato", "data_contrato", "tipo_vaga", "mensalidade_valor",
        "matricula_valor", "cobrar_matricula", "situacao", "primeiro_vencimento", "vencimento_dia",
    )}
    if responsible is not None:
        result["responsavel_financeiro"] = responsible
    return result


def list_alunos(client: Client, limit: int, offset: int, q: str | None, ativo: bool | None, situacao: str | None) -> dict[str, Any]:
    term = re.sub(r"[^\w\s.-]", "", q, flags=re.UNICODE).strip() if q else ""

    def build_query() -> Any:
        query = client.table("alunos").select("id,nome,ativo", count="exact")
        if ativo is not None:
            query = query.eq("ativo", ativo)
        if term:
            digits = re.sub(r"\D", "", term)
            # CPF lookup is exact when a complete document is supplied; list output never returns it.
            if len(digits) == 11:
                query = query.or_(f"nome.ilike.%{term}%,cpf.eq.{digits},cpf.eq.{term}")
            else:
                query = query.ilike("nome", f"%{term}%")
        return query

    if situacao:
        # Derive relationship situation from contract history as well as the legacy aluno flag.
        # Fetch in bounded pages so ended contracts from the prior RPC are classified correctly.
        alunos = []
        batch = 500
        start = 0
        while True:
            page_response = build_query().order("nome").range(start, start + batch - 1).execute()
            page_rows = _rows(page_response)
            alunos.extend(page_rows)
            if len(page_rows) < batch:
                break
            start += batch
        total_source = len(alunos)
    else:
        response = build_query().order("nome").range(offset, offset + limit - 1).execute()
        alunos = _rows(response)
        total_source = int(response.count or 0)
    aluno_ids = [str(row["id"]) for row in alunos]
    contracts: dict[str, list[dict[str, Any]]] = {key: [] for key in aluno_ids}
    for start in range(0, len(aluno_ids), 100):
        related = client.table("contratos").select("id,numero_contrato,aluno_id,responsavel_financeiro_id,data_contrato,tipo_vaga,mensalidade_valor,matricula_valor,cobrar_matricula,vencimento_dia,situacao,primeiro_vencimento").in_("aluno_id", aluno_ids[start:start + 100]).execute()
        for contract in _rows(related):
            contracts.setdefault(str(contract["aluno_id"]), []).append(contract)
    if situacao:
        people_ids = list(dict.fromkeys(str(row["responsavel_financeiro_id"]) for rows in contracts.values() for row in rows if row.get("responsavel_financeiro_id")))
        people = {}
        for start in range(0, len(people_ids), 100):
            people.update(_lookup(client, "responsaveis_financeiros", "id,nome", "id", people_ids[start:start + 100]))
    else:
        people = {}
    result = []
    for aluno in alunos:
        history = contracts.get(str(aluno["id"]), [])
        history.sort(key=lambda item: (item.get("data_contrato") or "", item.get("numero_contrato") or 0), reverse=True)
        active_contracts = [item for item in history if item.get("situacao") == "ativo"]
        derived_status = "ativo" if active_contracts or (aluno["ativo"] and not any(x.get("situacao") == "encerrado" for x in history)) else "encerrado" if any(x.get("situacao") == "encerrado" for x in history) else "inativo"
        if situacao and derived_status != situacao:
            continue
        if situacao and situacao == "ativo" and not active_contracts and aluno["ativo"]:
            derived_status = "ativo"  # legacy active students without a contract remain visible.
        result.append({
            "id": aluno["id"], "nome": aluno["nome"], "ativo": aluno["ativo"],
            "situacao": derived_status,
            "contrato_atual": _contract_summary(active_contracts[0], people.get(str(active_contracts[0].get("responsavel_financeiro_id")))) if active_contracts else None,
        })
    if situacao:
        total = len(result)
        result = result[offset:offset + limit]
    else:
        total = total_source
    return _paged(result, total, limit, offset)


def get_aluno(client: Client, aluno_id: UUID) -> dict[str, Any] | None:
    response = client.table("alunos").select("id,nome,cpf,rg,data_nascimento,telefone,email,cep,endereco,bairro,cidade,estado,ativo,criado_em,atualizado_em").eq("id", str(aluno_id)).limit(1).execute()
    rows = _rows(response)
    if not rows:
        return None
    aluno = rows[0]
    contracts_response = client.table("contratos").select("id,numero_contrato,aluno_id,responsavel_financeiro_id,data_contrato,tipo_vaga,mensalidade_valor,matricula_valor,cobrar_matricula,vencimento_dia,situacao,primeiro_vencimento").eq("aluno_id", str(aluno_id)).order("data_contrato", desc=True).execute()
    contracts = _rows(contracts_response)
    people = _lookup(client, "responsaveis_financeiros", "id,nome,rg,cpf,telefone,cep,endereco,bairro,cidade,estado", "id", [str(c["responsavel_financeiro_id"]) for c in contracts])
    alumno_status = "ativo" if any(c.get("situacao") == "ativo" for c in contracts) or (aluno["ativo"] and not any(c.get("situacao") == "encerrado" for c in contracts)) else "encerrado" if any(c.get("situacao") == "encerrado" for c in contracts) else "inativo"
    aluno["situacao"] = alumno_status
    aluno["contratos"] = [_contract_summary(c, people.get(str(c["responsavel_financeiro_id"]))) for c in contracts]
    return aluno


def list_contratos(client: Client, limit: int, offset: int, aluno_id: UUID | None, situacao: str | None, created_by_user_id: str | None = None) -> dict[str, Any]:
    filters = []
    if aluno_id:
        filters.append(("eq", "aluno_id", str(aluno_id)))
    if situacao:
        filters.append(("eq", "situacao", situacao))
    if created_by_user_id:
        filters.append(("eq", "created_by_user_id", created_by_user_id))
    rows, total = _page(client, "contratos", "id,numero_contrato,aluno_id,responsavel_financeiro_id,data_contrato,tipo_vaga,mensalidade_valor,matricula_valor,cobrar_matricula,primeiro_vencimento,vencimento_dia,situacao,criado_em", limit, offset, filters)
    alunos = _lookup(client, "alunos", "id,nome", "id", [str(row["aluno_id"]) for row in rows])
    result = []
    for row in rows:
        item = dict(row)
        item["aluno_nome"] = alunos.get(str(row["aluno_id"]), {}).get("nome", "")
        result.append(item)
    return _paged(result, total, limit, offset)


def get_contrato(client: Client, contrato_id: UUID, created_by_user_id: str | None = None) -> dict[str, Any] | None:
    query = client.table("contratos").select("id,numero_contrato,aluno_id,responsavel_financeiro_id,data_contrato,tipo_vaga,mensalidade_valor,matricula_valor,cobrar_matricula,primeiro_vencimento,vencimento_dia,situacao,criado_em,atualizado_em").eq("id", str(contrato_id))
    if created_by_user_id:
        query = query.eq("created_by_user_id", created_by_user_id)
    response = query.limit(1).execute()
    rows = _rows(response)
    if not rows:
        return None
    row = rows[0]
    students = _lookup(client, "alunos", "id,nome,cpf,rg,data_nascimento,telefone,cep,endereco,bairro,cidade,estado", "id", [str(row["aluno_id"])])
    responsible = _lookup(client, "responsaveis_financeiros", "id,nome,rg,cpf,telefone,cep,endereco,bairro,cidade,estado", "id", [str(row["responsavel_financeiro_id"])])
    row["aluno_nome"] = students.get(str(row["aluno_id"]), {}).get("nome", "")
    row["aluno"] = students.get(str(row["aluno_id"]), {"id": row["aluno_id"], "nome": row["aluno_nome"]})
    row["responsavel_financeiro"] = responsible.get(str(row["responsavel_financeiro_id"]))
    row["mensalidade_valor_por_extenso"] = valor_por_extenso(Decimal(str(row["mensalidade_valor"])))
    row["matricula_valor_por_extenso"] = valor_por_extenso(Decimal(str(row["matricula_valor"])))
    return row


def list_mensalidades(client: Client, limit: int, offset: int, competencia: date | None, status: str | None, aluno_id: UUID | None, contrato_id: UUID | None, aluno_q: str | None = None) -> dict[str, Any]:
    filters = []
    if competencia:
        filters.append(("eq", "competencia", competencia.isoformat()))
    if status:
        filters.append(("eq", "status", status))
    if aluno_id:
        filters.append(("eq", "aluno_id", str(aluno_id)))
    if contrato_id:
        filters.append(("eq", "contrato_id", str(contrato_id)))
    if aluno_q:
        matched = _matching_aluno_ids(client, aluno_q)
        if not matched:
            return _paged([], 0, limit, offset)
        filters.append(("in_", "aluno_id", matched))
    rows, total = _page(client, "mensalidades", "id,aluno_id,contrato_id,tipo_cobranca,competencia,data_vencimento,valor_devido,valor_pago,forma_pagamento,status,comprovante_path,pago_em,criado_em", limit, offset, filters)
    students = _lookup(client, "alunos", "id,nome", "id", [str(row["aluno_id"]) for row in rows])
    contracts = _lookup(client, "contratos", "id,numero_contrato", "id", [str(row["contrato_id"]) for row in rows if row.get("contrato_id")])
    result = []
    for row in rows:
        item = dict(row)
        item["aluno_nome"] = students.get(str(row["aluno_id"]), {}).get("nome", "")
        item["numero_contrato"] = contracts.get(str(row.get("contrato_id")), {}).get("numero_contrato")
        result.append(item)
    return _paged(result, total, limit, offset)


def list_pagamentos(client: Client, limit: int, offset: int, mensalidade_id: UUID | None, aluno_id: UUID | None, data_inicio: date | None, data_fim: date | None, aluno_q: str | None = None) -> dict[str, Any]:
    query = client.table("pagamentos_mensalidade").select(
        "id,mensalidade_id,valor_pago,forma_pagamento,comprovante_path,pago_em,criado_em,"
        "mensalidade:mensalidades!inner(id,aluno_id,competencia,data_vencimento,contrato_id)", count="exact"
    )
    if mensalidade_id:
        query = query.eq("mensalidade_id", str(mensalidade_id))
    if aluno_id:
        query = query.eq("mensalidade.aluno_id", str(aluno_id))
    if aluno_q:
        aluno_ids = _matching_aluno_ids(client, aluno_q)
        if not aluno_ids:
            return _paged([], 0, limit, offset)
        bills = _rows(client.table("mensalidades").select("id").in_("aluno_id", aluno_ids).limit(1000).execute())
        bill_ids = [str(row["id"]) for row in bills]
        if not bill_ids:
            return _paged([], 0, limit, offset)
        query = query.in_("mensalidade_id", bill_ids)
    if data_inicio:
        query = query.gte("pago_em", datetime.combine(data_inicio, datetime.min.time()).isoformat())
    if data_fim:
        query = query.lt("pago_em", datetime.combine(data_fim + timedelta(days=1), datetime.min.time()).isoformat())
    response = query.order("pago_em", desc=True).range(offset, offset + limit - 1).execute()
    rows = _rows(response)
    total = int(response.count or 0)
    bills = {str(row["mensalidade_id"]): row.get("mensalidade") for row in rows if row.get("mensalidade")}
    contracts = _lookup(client, "contratos", "id,numero_contrato", "id", [str(bills.get(str(row["mensalidade_id"]), {}).get("contrato_id")) for row in rows if bills.get(str(row["mensalidade_id"]), {}).get("contrato_id")])
    students = _lookup(client, "alunos", "id,nome", "id", [str(bills.get(str(row["mensalidade_id"]), {}).get("aluno_id")) for row in rows if bills.get(str(row["mensalidade_id"]))])
    result = []
    for row in rows:
        bill = bills.get(str(row["mensalidade_id"]), {})
        student_id = str(bill.get("aluno_id", ""))
        result.append({**row, "aluno_id": student_id, "aluno_nome": students.get(student_id, {}).get("nome", ""),
                       "competencia": bill.get("competencia"), "data_vencimento": bill.get("data_vencimento"),
                       "numero_contrato": contracts.get(str(bill.get("contrato_id")), {}).get("numero_contrato")})
    return _paged(result, total, limit, offset)


def _count(client: Client, table: str, filters: list[tuple[str, str, Any]]) -> int:
    query = client.table(table).select("id", count="exact", head=True)
    for method, column, value in filters:
        query = getattr(query, method)(column, value)
    return int(query.execute().count or 0)


def _sum_all(client: Client, table: str, column: str, filters: list[tuple[str, str, Any]]) -> Decimal:
    total = Decimal("0")
    offset = 0
    batch = 500
    while True:
        query = client.table(table).select(column)
        for method, key, value in filters:
            query = getattr(query, method)(key, value)
        rows = _rows(query.range(offset, offset + batch - 1).execute())
        total += sum((Decimal(str(row[column] or 0)) for row in rows), Decimal("0"))
        if len(rows) < batch:
            return total
        offset += batch


def dashboard_indicadores(client: Client) -> dict[str, Any]:
    today = date.today()
    month_start = today.replace(day=1)
    next_month = (month_start.replace(day=28) + timedelta(days=4)).replace(day=1)
    month = month_start.strftime("%Y-%m")
    students = _count(client, "alunos", [("eq", "ativo", True)])
    contracts = _count(client, "contratos", [("eq", "situacao", "ativo")])
    pending = _count(client, "mensalidades", [("eq", "status", "pendente")])
    payments = _count(client, "pagamentos_mensalidade", [])
    upcoming_response = client.table("mensalidades").select("id,aluno_id,contrato_id,competencia,tipo_cobranca,data_vencimento,valor_devido,status").eq("status", "pendente").gte("data_vencimento", today.isoformat()).order("data_vencimento").limit(5).execute()
    upcoming = _rows(upcoming_response)
    upcoming_students = _lookup(client, "alunos", "id,nome", "id", [str(row["aluno_id"]) for row in upcoming])
    upcoming_contracts = _lookup(client, "contratos", "id,numero_contrato", "id", [str(row["contrato_id"]) for row in upcoming if row.get("contrato_id")])
    due_items = [{**row, "aluno_nome": upcoming_students.get(str(row["aluno_id"]), {}).get("nome", ""),
                  "numero_contrato": upcoming_contracts.get(str(row.get("contrato_id")), {}).get("numero_contrato")} for row in upcoming]
    received = _sum_all(client, "pagamentos_mensalidade", "valor_pago", [
        ("gte", "pago_em", datetime.combine(month_start, datetime.min.time()).isoformat()),
        ("lt", "pago_em", datetime.combine(next_month, datetime.min.time()).isoformat()),
    ])
    open_amount = _sum_all(client, "mensalidades", "valor_devido", [
        ("eq", "competencia", month_start.isoformat()), ("eq", "status", "pendente"),
    ])
    return {"alunos_ativos": students, "contratos_ativos": contracts, "mensalidades_pendentes": pending,
            "pagamentos_registrados": payments, "proximos_vencimentos": due_items,
            "resumo_financeiro_mes": {"competencia": month, "valor_recebido": received, "valor_em_aberto": open_amount}}
