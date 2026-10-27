from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal
import re
from datetime import datetime
from typing import Any, Generic, Literal, TypeVar
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

T = TypeVar("T")


def validar_cpf(value: str) -> str:
    digits = re.sub(r"\D", "", value)
    if len(digits) != 11 or len(set(digits)) == 1:
        raise ValueError("CPF inválido")
    for length in (9, 10):
        total = sum(int(digits[i]) * (length + 1 - i) for i in range(length))
        check = (total * 10) % 11
        if check == 10:
            check = 0
        if check != int(digits[length]):
            raise ValueError("CPF inválido")
    return digits


class PessoaCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    nome: str = Field(min_length=2, max_length=160)
    rg: str = Field(min_length=1, max_length=30)
    cpf: str = Field(min_length=11, max_length=20)
    telefone: str = Field(min_length=8, max_length=30)
    cep: str = Field(min_length=8, max_length=12)
    endereco: str = Field(min_length=2, max_length=240)
    bairro: str = Field(min_length=2, max_length=120)
    cidade: str = Field(min_length=2, max_length=120)
    estado: str = Field(min_length=2, max_length=2)

    @field_validator("cpf")
    @classmethod
    def cpf_valido(cls, value: str) -> str:
        return validar_cpf(value)

    @field_validator("estado")
    @classmethod
    def estado_maiusculo(cls, value: str) -> str:
        return value.upper()


class AlunoCreate(PessoaCreate):
    data_nascimento: date

    @field_validator("data_nascimento")
    @classmethod
    def nascimento_no_passado(cls, value: date) -> date:
        if value >= date.today():
            raise ValueError("Data de nascimento deve ser anterior a hoje")
        return value


class ResponsavelCreate(PessoaCreate):
    pass


class ContratoCreate(BaseModel):
    data_contrato: date
    tipo_vaga: str = Field(min_length=1, max_length=40)
    mensalidade_valor: Decimal = Field(gt=0, max_digits=10, decimal_places=2)
    matricula_valor: Decimal = Field(ge=0, max_digits=10, decimal_places=2)
    cobrar_matricula: bool
    vencimento_dia: int | None = Field(default=None, ge=1, le=31)
    situacao: Literal["ativo"] = "ativo"


class CadastroAlunoCreate(BaseModel):
    aluno: AlunoCreate
    responsavel_financeiro: ResponsavelCreate
    contrato: ContratoCreate

    @model_validator(mode="after")
    def datas_e_matricula(self) -> CadastroAlunoCreate:
        if self.contrato.data_contrato > date.today():
            raise ValueError("Data do contrato não pode estar no futuro")
        if self.aluno.data_nascimento >= self.contrato.data_contrato:
            raise ValueError("Nascimento deve ser anterior à data do contrato")
        if self.contrato.cobrar_matricula and self.contrato.matricula_valor <= 0:
            raise ValueError("Valor da matrícula deve ser positivo quando houver cobrança")
        return self

    @property
    def primeiro_vencimento(self) -> date:
        return self.contrato.data_contrato + timedelta(days=30)


class ContratoExistenteCreate(ContratoCreate):
    aluno_id: UUID
    responsavel_financeiro_id: UUID

    @model_validator(mode="after")
    def validar_regras(self) -> ContratoExistenteCreate:
        if self.data_contrato > date.today():
            raise ValueError("Data do contrato não pode estar no futuro")
        if self.cobrar_matricula and self.matricula_valor <= 0:
            raise ValueError("Valor da matrícula deve ser positivo quando houver cobrança")
        return self


class ReativarAlunoCreate(ContratoCreate):
    responsavel_financeiro_id: UUID

    @model_validator(mode="after")
    def validar_reativacao(self) -> ReativarAlunoCreate:
        if self.data_contrato > date.today():
            raise ValueError("Data do contrato não pode estar no futuro")
        if self.cobrar_matricula and self.matricula_valor <= 0:
            raise ValueError("Valor da matrícula deve ser positivo quando houver cobrança")
        return self


class CadastroAlunoResponse(BaseModel):
    aluno_id: UUID
    responsavel_financeiro_id: UUID
    contrato_id: UUID
    numero_contrato: int
    primeiro_vencimento: date
    mensalidade_id: UUID
    matricula_id: UUID | None
    situacao: str
    mensalidade_valor_por_extenso: str
    matricula_valor_por_extenso: str


class PreviaVencimentoCreate(BaseModel):
    data_contrato: date

    @field_validator("data_contrato")
    @classmethod
    def contrato_nao_futuro(cls, value: date) -> date:
        if value > date.today():
            raise ValueError("Data do contrato não pode estar no futuro")
        return value


class PreviaVencimentoResponse(BaseModel):
    primeiro_vencimento: date


class ContratoEncerradoResponse(BaseModel):
    contrato_id: UUID
    situacao: Literal["encerrado"]


class PaginatedResult(BaseModel, Generic[T]):
    items: list[T]
    total: int
    limit: int
    offset: int


class ResponsavelFinanceiroRead(BaseModel):
    id: UUID
    nome: str
    rg: str | None = None
    cpf: str | None = None
    telefone: str | None = None
    cep: str | None = None
    endereco: str | None = None
    bairro: str | None = None
    cidade: str | None = None
    estado: str | None = None


class ContratoResumoRead(BaseModel):
    id: UUID
    numero_contrato: int
    data_contrato: date
    tipo_vaga: str
    mensalidade_valor: Decimal
    matricula_valor: Decimal
    cobrar_matricula: bool
    situacao: str
    primeiro_vencimento: date
    vencimento_dia: int | None = None
    responsavel_financeiro: ResponsavelFinanceiroRead | None = None


class AlunoListRead(BaseModel):
    id: UUID
    nome: str
    ativo: bool
    situacao: Literal["ativo", "encerrado", "inativo"]
    contrato_atual: ContratoResumoRead | None = None


class AlunoDetailRead(BaseModel):
    id: UUID
    nome: str
    cpf: str | None = None
    rg: str | None = None
    data_nascimento: date | None = None
    telefone: str | None = None
    email: str | None = None
    cep: str | None = None
    endereco: str | None = None
    bairro: str | None = None
    cidade: str | None = None
    estado: str | None = None
    ativo: bool
    situacao: Literal["ativo", "encerrado", "inativo"]
    criado_em: datetime | None = None
    atualizado_em: datetime | None = None
    contratos: list[ContratoResumoRead]


class ContratoListRead(BaseModel):
    id: UUID
    numero_contrato: int
    aluno_id: UUID
    aluno_nome: str
    data_contrato: date
    tipo_vaga: str
    mensalidade_valor: Decimal
    matricula_valor: Decimal
    cobrar_matricula: bool
    primeiro_vencimento: date
    vencimento_dia: int | None = None
    situacao: str
    criado_em: datetime | None = None


class AlunoContratoRead(BaseModel):
    id: UUID
    nome: str
    cpf: str | None = None
    rg: str | None = None
    data_nascimento: date | None = None
    telefone: str | None = None
    cep: str | None = None
    endereco: str | None = None
    bairro: str | None = None
    cidade: str | None = None
    estado: str | None = None


class ContratoDetailRead(ContratoListRead):
    responsavel_financeiro_id: UUID
    responsavel_financeiro: dict[str, Any] | None = None
    aluno: AlunoContratoRead
    mensalidade_valor_por_extenso: str
    matricula_valor_por_extenso: str
    atualizado_em: datetime | None = None


class MensalidadeListRead(BaseModel):
    id: UUID
    aluno_id: UUID
    aluno_nome: str
    contrato_id: UUID | None = None
    numero_contrato: int | None = None
    tipo_cobranca: str
    competencia: date
    data_vencimento: date
    valor_devido: Decimal
    valor_pago: Decimal | None = None
    forma_pagamento: str | None = None
    status: str
    comprovante_path: str | None = None
    pago_em: datetime | None = None
    criado_em: datetime | None = None


class PagamentoListRead(BaseModel):
    id: UUID
    mensalidade_id: UUID
    valor_pago: Decimal
    forma_pagamento: str
    comprovante_path: str | None = None
    pago_em: datetime
    criado_em: datetime | None = None
    aluno_id: UUID
    aluno_nome: str
    competencia: date
    data_vencimento: date
    numero_contrato: int | None = None


class VencimentoProximoRead(BaseModel):
    id: UUID
    aluno_id: UUID
    aluno_nome: str
    contrato_id: UUID | None = None
    numero_contrato: int | None = None
    competencia: date
    tipo_cobranca: str
    data_vencimento: date
    valor_devido: Decimal
    status: str


class ResumoFinanceiroMesRead(BaseModel):
    competencia: str
    valor_recebido: Decimal
    valor_em_aberto: Decimal


class DashboardIndicadoresRead(BaseModel):
    alunos_ativos: int
    contratos_ativos: int
    mensalidades_pendentes: int
    pagamentos_registrados: int
    proximos_vencimentos: list[VencimentoProximoRead]
    resumo_financeiro_mes: ResumoFinanceiroMesRead

