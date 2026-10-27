from __future__ import annotations

from typing import Any

from supabase import Client

from app.money import valor_por_extenso
from app.schemas import CadastroAlunoCreate, ContratoExistenteCreate, ReativarAlunoCreate


def cadastrar_aluno_contrato(client: Client, cadastro: CadastroAlunoCreate) -> dict[str, Any]:
    """Create the linked people, contract and initial charges in one DB transaction."""
    response = client.rpc(
        "cadastrar_aluno_contrato",
        {
            "p_aluno": cadastro.aluno.model_dump(mode="json"),
            "p_responsavel": cadastro.responsavel_financeiro.model_dump(mode="json"),
            "p_data_contrato": cadastro.contrato.data_contrato.isoformat(),
            "p_tipo_vaga": cadastro.contrato.tipo_vaga.upper(),
            "p_mensalidade_valor": str(cadastro.contrato.mensalidade_valor),
            "p_matricula_valor": str(cadastro.contrato.matricula_valor),
            "p_cobrar_matricula": cadastro.contrato.cobrar_matricula,
            "p_vencimento_dia": cadastro.contrato.vencimento_dia,
        },
    ).execute()
    return {
        **response.data,
        "mensalidade_valor_por_extenso": valor_por_extenso(cadastro.contrato.mensalidade_valor),
        "matricula_valor_por_extenso": valor_por_extenso(cadastro.contrato.matricula_valor),
    }


def cadastrar_contrato_existente(client: Client, contrato: ContratoExistenteCreate) -> dict[str, Any]:
    response = client.rpc(
        "cadastrar_contrato_existente",
        {
            "p_aluno_id": str(contrato.aluno_id),
            "p_responsavel_id": str(contrato.responsavel_financeiro_id),
            "p_data_contrato": contrato.data_contrato.isoformat(),
            "p_tipo_vaga": contrato.tipo_vaga.upper(),
            "p_mensalidade_valor": str(contrato.mensalidade_valor),
            "p_matricula_valor": str(contrato.matricula_valor),
            "p_cobrar_matricula": contrato.cobrar_matricula,
            "p_vencimento_dia": contrato.vencimento_dia,
        },
    ).execute()
    return {
        **response.data,
        "mensalidade_valor_por_extenso": valor_por_extenso(contrato.mensalidade_valor),
        "matricula_valor_por_extenso": valor_por_extenso(contrato.matricula_valor),
    }


def reativar_aluno_com_novo_contrato(client: Client, contrato: ReativarAlunoCreate, aluno_id: str) -> dict[str, Any]:
    """Reactivate an ended student through one database transaction and a new contract."""
    response = client.rpc(
        "reativar_aluno_contrato",
        {
            "p_aluno_id": aluno_id,
            "p_responsavel_id": str(contrato.responsavel_financeiro_id),
            "p_data_contrato": contrato.data_contrato.isoformat(),
            "p_tipo_vaga": contrato.tipo_vaga.upper(),
            "p_mensalidade_valor": str(contrato.mensalidade_valor),
            "p_matricula_valor": str(contrato.matricula_valor),
            "p_cobrar_matricula": contrato.cobrar_matricula,
            "p_vencimento_dia": contrato.vencimento_dia,
        },
    ).execute()
    return {
        **response.data,
        "mensalidade_valor_por_extenso": valor_por_extenso(contrato.mensalidade_valor),
        "matricula_valor_por_extenso": valor_por_extenso(contrato.matricula_valor),
    }

