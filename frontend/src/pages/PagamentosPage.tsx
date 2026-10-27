import { useEffect, useState, type FormEvent } from "react";
import { useLocation } from "react-router-dom";

import { ApiError, getApiHealth, listPagamentos, PAYMENT_METHODS, registerPayment, type PagamentoRecord, type PaymentMethod } from "../api";
import { EmptyState, IntegrationPending, PageHeader } from "../components/PagePrimitives";
import { formatBrl, formatDate, parseBrlToCents } from "../format";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export default function PagamentosPage() {
  const location = useLocation();
  const prefill = (location.state as { mensalidadeId?: string; valor?: string } | null);
  const [mensalidadeId, setMensalidadeId] = useState(prefill?.mensalidadeId ?? "");
  const [valor, setValor] = useState(prefill?.valor ?? "");
  const [forma, setForma] = useState<PaymentMethod>("pix");
  const [comprovante, setComprovante] = useState<File | undefined>();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiOnline, setApiOnline] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [payments, setPayments] = useState<PagamentoRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");

  useEffect(() => {
    let active = true;
    getApiHealth().then(() => { if (active) setApiOnline(true); }).catch(() => { if (active) setApiOnline(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    listPagamentos({ limit: 20, offset: 0 }).then((result) => { if (active) setPayments(result.items); }).catch(() => { if (active) setHistoryError("Não foi possível carregar o histórico de pagamentos pela API."); }).finally(() => { if (active) setHistoryLoading(false); });
    return () => { active = false; };
  }, [confirmed]);

  function validate() {
    const next: Record<string, string> = {};
    const id = mensalidadeId.trim();
    if (!uuidPattern.test(id)) next.mensalidadeId = "Informe o identificador válido da mensalidade existente.";
    const amountCents = parseBrlToCents(valor);
    if (!valor.trim() || amountCents === null || amountCents <= 0) next.valor = "Informe um valor positivo, com até duas casas decimais.";
    if (comprovante && !["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(comprovante.type)) next.comprovante = "Use PDF, JPG, PNG ou WebP.";
    if (comprovante && comprovante.size > 10 * 1024 * 1024) next.comprovante = "O comprovante deve ter até 10 MB.";
    setErrors(next);
    return next;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setConfirmed(false);
    setSubmitError("");
    if (Object.keys(validate()).length) return;
    setSubmitting(true);
    try {
      await registerPayment({
        mensalidade_id: mensalidadeId.trim(),
        valor_pago: ((parseBrlToCents(valor) ?? 0) / 100).toFixed(2),
        forma_pagamento: forma,
        comprovante,
      });
      setConfirmed(true);
      setMensalidadeId("");
      setValor("");
      setComprovante(undefined);
      const file = document.querySelector<HTMLInputElement>("#payment-receipt");
      if (file) file.value = "";
    } catch (error) {
      setSubmitError(error instanceof ApiError ? error.message : "Não foi possível confirmar a baixa pela API.");
    } finally {
      setSubmitting(false);
    }
  }

  return <>
    <PageHeader eyebrow="HISTÓRICO FINANCEIRO" title="Pagamentos" description="Consulte pagamentos registrados ou dê baixa em uma mensalidade existente." />
    <section className="management-panel list-panel payment-history-panel">
      <div className="panel-heading"><div><span className="management-eyebrow">MOVIMENTAÇÕES</span><h2>Histórico de pagamentos</h2></div><span className="panel-pill">{payments.length} recentes</span></div>
      {historyLoading && <p role="status">Carregando histórico…</p>}{historyError && <IntegrationPending>{historyError}</IntegrationPending>}
      {!historyLoading && !historyError && payments.length === 0 && <EmptyState title="Nenhum pagamento registrado" detail="A consulta foi concluída e não retornou pagamentos." />}
      {!historyLoading && !historyError && payments.length > 0 && <div className="table-scroll"><table><thead><tr><th>Acolhido</th><th>Mensalidade</th><th>Competência</th><th>Pagamento</th><th>Valor</th><th>Forma</th><th>Comprovante</th></tr></thead><tbody>{payments.map((payment) => <tr key={payment.id}><td>{payment.aluno_nome}</td><td>{payment.numero_contrato ? `Contrato nº ${payment.numero_contrato}` : payment.mensalidade_id.slice(0, 8)}</td><td>{payment.competencia.slice(0, 7)}</td><td>{formatDate(payment.pago_em.slice(0, 10))}</td><td>{formatBrl(Math.round(Number(payment.valor_pago) * 100))}</td><td>{payment.forma_pagamento}</td><td>{payment.comprovante_path ? "Armazenado no bucket privado" : "—"}</td></tr>)}</tbody></table></div>}
    </section>

    <section className="management-panel payment-form-panel" id="registrar-pagamento">
      <div className="panel-heading"><div><span className="management-eyebrow">AÇÃO INTEGRADA</span><h2>Registrar pagamento</h2><p>Registra a baixa de uma parcela existente; não cria mensalidades.</p></div><span className="panel-pill panel-pill-integrated">POST /mensalidades/baixa</span></div>
      <IntegrationPending>É necessário informar o ID exato da cobrança; não existe rota de busca de parcelas para selecionar uma automaticamente.</IntegrationPending>
      <form className="payment-form" onSubmit={handleSubmit} noValidate>
        <label className="management-field payment-id-field"><span>ID da mensalidade</span><input value={mensalidadeId} onChange={(event) => setMensalidadeId(event.target.value)} placeholder="UUID da parcela existente" autoComplete="off" aria-invalid={Boolean(errors.mensalidadeId)} />{errors.mensalidadeId && <small className="management-field-error">{errors.mensalidadeId}</small>}</label>
        <label className="management-field"><span>Valor pago</span><div className="payment-money-input"><span>R$</span><input inputMode="decimal" value={valor} onChange={(event) => setValor(event.target.value)} placeholder="0,00" aria-invalid={Boolean(errors.valor)} /></div>{errors.valor && <small className="management-field-error">{errors.valor}</small>}</label>
        <label className="management-field"><span>Forma de pagamento</span><select value={forma} onChange={(event) => setForma(event.target.value as PaymentMethod)}>{PAYMENT_METHODS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label className="management-field"><span>Comprovante <small>(opcional)</small></span><input id="payment-receipt" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp" onChange={(event) => setComprovante(event.target.files?.[0])} aria-invalid={Boolean(errors.comprovante)} />{errors.comprovante && <small className="management-field-error">{errors.comprovante}</small>}<small className="management-field-hint">Armazenado pelo backend em bucket privado. Máximo: 10 MB.</small></label>
        {confirmed && <div className="payment-result payment-result-success" role="status"><strong>Baixa confirmada pela API.</strong><span>A solicitação foi aceita. O histórico permanece dependente do endpoint de consulta.</span></div>}
        {submitError && <div className="payment-result payment-result-error" role="alert"><strong>Não foi possível concluir a baixa.</strong><span>{submitError}</span></div>}
        {apiOnline === false && <div className="payment-result payment-result-error" role="status"><strong>API indisponível.</strong><span>Nenhum pagamento será enviado até que a conexão esteja disponível.</span></div>}
        <div className="payment-submit-row"><span>Documentos e valores são enviados somente ao backend configurado.</span><button className="management-button" disabled={submitting || apiOnline !== true}>{submitting ? "Enviando…" : "Confirmar baixa"}</button></div>
      </form>
    </section>
  </>;
}
