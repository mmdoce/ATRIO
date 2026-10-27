import { parseBrlToCents } from "./format.ts";

export type PaymentFormInput = {
  mensalidade_id: string;
  valor_pago: string;
  forma_pagamento: "dinheiro" | "pix" | "cartao_credito" | "cartao_debito" | "transferencia" | "boleto" | "outro";
  comprovante?: File;
};

export function createPaymentFormData(payload: PaymentFormInput): FormData {
  const form = new FormData();
  form.append("mensalidade_id", payload.mensalidade_id);
  form.append("valor_pago", payload.valor_pago);
  form.append("forma_pagamento", payload.forma_pagamento);
  if (payload.comprovante) form.append("comprovante", payload.comprovante);
  return form;
}

export function validateFullPayment(amount: string, amountDueCents: number): string | null {
  const cents = parseBrlToCents(amount);
  if (cents === null || cents <= 0) return "Informe um valor válido, com até duas casas decimais.";
  if (cents !== amountDueCents) {
    const due = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(amountDueCents / 100);
    return `A baixa atual exige o valor total da parcela: ${due}. Pagamentos parciais não são aceitos.`;
  }
  return null;
}

export async function confirmPayment<T>(
  payload: PaymentFormInput,
  send: (payload: PaymentFormInput) => Promise<T>,
  onSuccess: (result: T) => void,
): Promise<{ success: true } | { success: false; error: unknown }> {
  try {
    const result = await send(payload);
    onSuccess(result);
    return { success: true };
  } catch (error) {
    return { success: false, error };
  }
}

export function cancelPayment(onCancel: () => void): void {
  onCancel();
}
