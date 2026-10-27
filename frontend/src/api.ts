import { createPaymentFormData } from "./paymentFlow.ts";

export type CadastroResponse = {
  aluno_id: string;
  responsavel_financeiro_id: string;
  contrato_id: string;
  numero_contrato: number;
  primeiro_vencimento: string;
  mensalidade_id: string;
  matricula_id: string | null;
  situacao: string;
  mensalidade_valor_por_extenso: string;
  matricula_valor_por_extenso: string;
};

export type CadastroPayload = {
  aluno: PessoaPayload & { data_nascimento: string };
  responsavel_financeiro: PessoaPayload;
  contrato: {
    data_contrato: string;
    tipo_vaga: "SOCIAL" | "PARTICULAR";
    mensalidade_valor: string;
    matricula_valor: string;
    cobrar_matricula: boolean;
    vencimento_dia: number;
  };
};

export type Page<T> = { items: T[]; total: number; limit: number; offset: number };
export type ResponsavelFinanceiro = { id: string; nome: string; rg?: string | null; cpf?: string | null; telefone?: string | null; cep?: string | null; endereco?: string | null; bairro?: string | null; cidade?: string | null; estado?: string | null };
export type ContratoSummary = { id: string; numero_contrato: number; data_contrato: string; tipo_vaga: string; mensalidade_valor: number; matricula_valor: number; cobrar_matricula: boolean; situacao: string; primeiro_vencimento: string; vencimento_dia?: number | null; responsavel_financeiro?: ResponsavelFinanceiro | null };
export type AlunoRecord = { id: string; nome: string; ativo: boolean; situacao: "ativo" | "encerrado" | "inativo"; contrato_atual: null | ContratoSummary };
export type AlunoDetail = AlunoRecord & { cpf?: string | null; rg?: string | null; data_nascimento?: string | null; telefone?: string | null; email?: string | null; cep?: string | null; endereco?: string | null; bairro?: string | null; cidade?: string | null; estado?: string | null; criado_em?: string | null; atualizado_em?: string | null; contratos: ContratoSummary[] };
export type ContratoRecord = { id: string; numero_contrato: number; aluno_id: string; aluno_nome: string; data_contrato: string; tipo_vaga: string; mensalidade_valor: number; matricula_valor: number; cobrar_matricula: boolean; primeiro_vencimento: string; vencimento_dia?: number | null; situacao: string; criado_em?: string | null };
export type ContratoDetail = ContratoRecord & { responsavel_financeiro_id: string; responsavel_financeiro: ResponsavelFinanceiro | null; aluno: { id: string; nome: string; cpf?: string | null; rg?: string | null; data_nascimento?: string | null; telefone?: string | null; cep?: string | null; endereco?: string | null; bairro?: string | null; cidade?: string | null; estado?: string | null }; mensalidade_valor_por_extenso: string; matricula_valor_por_extenso: string; atualizado_em?: string | null };
export type MensalidadeRecord = { id: string; aluno_id: string; aluno_nome: string; contrato_id?: string | null; numero_contrato?: number | null; tipo_cobranca: string; competencia: string; data_vencimento: string; valor_devido: number; valor_pago?: number | null; forma_pagamento?: string | null; status: string; comprovante_path?: string | null; pago_em?: string | null; criado_em?: string | null };
export type PagamentoRecord = { id: string; mensalidade_id: string; valor_pago: number; forma_pagamento: string; comprovante_path?: string | null; pago_em: string; criado_em?: string | null; aluno_id: string; aluno_nome: string; competencia: string; data_vencimento: string; numero_contrato?: number | null };
export type DashboardMetrics = { alunos_ativos: number; contratos_ativos: number; mensalidades_pendentes: number; pagamentos_registrados: number; proximos_vencimentos: Array<{ id: string; aluno_id: string; aluno_nome: string; contrato_id?: string | null; numero_contrato?: number | null; competencia: string; tipo_cobranca: string; data_vencimento: string; valor_devido: number }>; resumo_financeiro_mes: { competencia: string; valor_recebido: number; valor_em_aberto: number } };

export const PAYMENT_METHODS = [
  ["pix", "Pix"], ["dinheiro", "Dinheiro"], ["cartao_credito", "Cartão de crédito"],
  ["cartao_debito", "Cartão de débito"], ["transferencia", "Transferência"], ["boleto", "Boleto"], ["outro", "Outro"],
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number][0];

type PessoaPayload = {
  nome: string;
  rg: string;
  cpf: string;
  telefone: string;
  cep: string;
  endereco: string;
  bairro: string;
  cidade: string;
  estado: string;
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        ...(init?.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiError("Não foi possível conectar à API. Confira se o backend está iniciado.");
  }

  if (!response.ok) {
    if (response.status === 409) {
      throw new ApiError("A operação entrou em conflito com o estado atual do cadastro ou da cobrança.", response.status);
    }
    if (response.status === 422) {
      throw new ApiError("A API recusou um ou mais campos. Revise os dados antes de tentar novamente.", response.status);
    }
    if (response.status === 503) {
      throw new ApiError("A API não encontrou o banco ou a RPC necessária. Verifique a conexão e a migração de cadastro.", response.status);
    }
    if (response.status === 413) throw new ApiError("O comprovante ultrapassa o limite permitido.", response.status);
    if (response.status === 415) throw new ApiError("O formato do comprovante não é permitido.", response.status);
    if (response.status === 502) throw new ApiError("O backend não conseguiu armazenar o comprovante.", response.status);
    throw new ApiError("A API não conseguiu concluir a solicitação. Nenhum sucesso foi confirmado.", response.status);
  }

  return (await response.json()) as T;
}

export function getApiHealth(): Promise<{ status: string }> {
  return request("/health");
}

function queryString(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => { if (value !== undefined && value !== "") search.set(key, String(value)); });
  const encoded = search.toString();
  return encoded ? `?${encoded}` : "";
}

export function listAlunos(params: { q?: string; situacao?: string; limit?: number; offset?: number } = {}): Promise<Page<AlunoRecord>> {
  return request(`/alunos${queryString(params)}`);
}
export function getAluno(id: string): Promise<AlunoDetail> { return request(`/alunos/${encodeURIComponent(id)}`); }
export function listContratos(params: { aluno_id?: string; situacao?: string; limit?: number; offset?: number } = {}): Promise<Page<ContratoRecord>> {
  return request(`/contratos${queryString(params)}`);
}
export function getContrato(id: string): Promise<ContratoDetail> {
  return request(`/contratos/${encodeURIComponent(id)}`);
}
export function closeContract(id: string): Promise<{ contrato_id: string; situacao: "encerrado" }> {
  return request(`/contratos/${encodeURIComponent(id)}/encerrar`, { method: "POST" });
}
export type ReactivationPayload = {
  responsavel_financeiro_id: string;
  data_contrato: string;
  tipo_vaga: "SOCIAL" | "PARTICULAR";
  mensalidade_valor: string;
  matricula_valor: string;
  cobrar_matricula: boolean;
  vencimento_dia: number;
};
export function reactivateAluno(id: string, payload: ReactivationPayload): Promise<CadastroResponse> {
  return request(`/alunos/${encodeURIComponent(id)}/reativar`, { method: "POST", body: JSON.stringify(payload) });
}
export function listMensalidades(params: { competencia?: string; status?: string; aluno_id?: string; contrato_id?: string; limit?: number; offset?: number } = {}): Promise<Page<MensalidadeRecord>> {
  return request(`/mensalidades${queryString(params)}`);
}
export function listPagamentos(params: { mensalidade_id?: string; aluno_id?: string; data_inicio?: string; data_fim?: string; limit?: number; offset?: number } = {}): Promise<Page<PagamentoRecord>> {
  return request(`/pagamentos${queryString(params)}`);
}
export function getDashboardMetrics(): Promise<DashboardMetrics> { return request("/dashboard/indicadores"); }

export function previewFirstDue(contractDate: string): Promise<{ primeiro_vencimento: string }> {
  return request("/contratos/previa-vencimento", {
    method: "POST",
    body: JSON.stringify({ data_contrato: contractDate }),
  });
}

export function createCadastro(payload: CadastroPayload): Promise<CadastroResponse> {
  return request("/alunos", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export type PaymentPayload = {
  mensalidade_id: string;
  valor_pago: string;
  forma_pagamento: PaymentMethod;
  comprovante?: File;
};

export function registerPayment(payload: PaymentPayload): Promise<unknown> {
  const form = createPaymentFormData(payload);
  return request("/mensalidades/baixa", { method: "POST", body: form });
}
