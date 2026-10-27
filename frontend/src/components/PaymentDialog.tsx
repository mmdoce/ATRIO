import { useRef, useState, type FormEvent } from "react";
import { ApiError, PAYMENT_METHODS, registerPayment, type DashboardMetrics, type PaymentMethod } from "../api";
import { formatBrl, formatDate, parseBrlToCents } from "../format";
import { cancelPayment, confirmPayment, validateFullPayment } from "../paymentFlow";
import { Icon } from "./Icon";

type Bill = DashboardMetrics["proximos_vencimentos"][number];

export function PaymentDialog({ bill, onCancel, onSuccess }: {
  bill: Bill;
  onCancel: () => void;
  onSuccess: () => void;
}) {
  const dueCents = Math.round(Number(bill.valor_devido) * 100);
  const [value, setValue] = useState((dueCents / 100).toFixed(2).replace(".", ","));
  const [method, setMethod] = useState<PaymentMethod>("pix");
  const [receipt, setReceipt] = useState<File>();
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [complete, setComplete] = useState(false);
  const inFlight = useRef(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || complete) return;
    setError("");
    const validation = validateFullPayment(value, dueCents);
    const paidCents = parseBrlToCents(value) ?? 0;
    if (validation) {
      setError(validation);
      return;
    }
    if (receipt && !["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(receipt.type)) {
      setError("O comprovante deve ser PDF, JPG, PNG ou WebP.");
      return;
    }
    if (receipt && receipt.size > 10 * 1024 * 1024) {
      setError("O comprovante deve ter até 10 MB.");
      return;
    }
    inFlight.current = true;
    setSending(true);
    try {
      const result = await confirmPayment({
        mensalidade_id: bill.id,
        valor_pago: (paidCents / 100).toFixed(2),
        forma_pagamento: method,
        comprovante: receipt,
      }, registerPayment, () => undefined);
      if (!result.success) throw result.error;
      setComplete(true);
      onSuccess();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Não foi possível registrar o pagamento.");
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  }

  const cancel = () => { if (!sending) cancelPayment(onCancel); };
  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) cancel(); }}>
    <section className="payment-dialog" role="dialog" aria-modal="true" aria-labelledby="payment-dialog-title">
      <div className="panel-heading"><div><span className="management-eyebrow">BAIXA DE MENSALIDADE</span><h2 id="payment-dialog-title">Registrar pagamento</h2></div><button type="button" className="dialog-close" aria-label="Cancelar e fechar" disabled={sending} onClick={cancel}><Icon name="close" size={20} /></button></div>
      <div className="payment-dialog-summary">
        <strong>{bill.aluno_nome}</strong>
        <span>Competência {bill.competencia.slice(0, 7)} · vencimento {formatDate(bill.data_vencimento)}</span>
        <div><span>Valor devido</span><strong>{formatBrl(dueCents)}</strong></div>
        <div><span>Saldo restante</span><strong>{complete ? formatBrl(0) : formatBrl(dueCents)}</strong></div>
      </div>
      {complete ? <div className="payment-result payment-result-success" role="status"><strong>Pagamento confirmado pela API.</strong><span>A cobrança saiu da lista de pendentes e os indicadores foram atualizados.</span></div> : <form className="payment-dialog-form" onSubmit={submit} noValidate>
        <label className="management-field"><span>Valor pago</span><div className="payment-money-input"><span>R$</span><input aria-label="Valor pago" inputMode="decimal" value={value} onChange={(event) => setValue(event.target.value)} /></div><small className="management-field-hint">A API exige a quitação integral desta cobrança.</small></label>
        <label className="management-field"><span>Forma de pagamento</span><select aria-label="Forma de pagamento" value={method} onChange={(event) => setMethod(event.target.value as PaymentMethod)}>{PAYMENT_METHODS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label className="management-field payment-dialog-receipt"><span>Comprovante <small>(opcional)</small></span><input aria-label="Comprovante" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp" onChange={(event) => setReceipt(event.target.files?.[0])} /><small className="management-field-hint">PDF, JPG, PNG ou WebP · até 10 MB · armazenamento privado.</small></label>
        {error && <div className="payment-result payment-result-error" role="alert">{error}</div>}
        <div className="payment-dialog-actions"><button type="button" className="management-button management-button-secondary" disabled={sending} onClick={cancel}>Cancelar</button><button type="submit" className="management-button" disabled={sending}>{sending ? "Registrando…" : "Confirmar baixa"}</button></div>
      </form>}
      {complete && <div className="payment-dialog-actions"><button type="button" className="management-button" onClick={onCancel}>Concluir</button></div>}
    </section>
  </div>;
}
