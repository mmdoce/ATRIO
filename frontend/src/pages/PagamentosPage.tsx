import { useEffect, useRef, useState, type FormEvent } from "react";
import { useLocation } from "react-router-dom";

import { ApiError, getApiHealth, listMensalidades, listPagamentos, PAYMENT_METHODS, registerPayment, type MensalidadeRecord, type PagamentoRecord, type PaymentMethod } from "../api";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "../components/PagePrimitives";
import { Icon } from "../components/Icon";
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
  const [paymentTotal, setPaymentTotal] = useState(0);
  const [studentSearch, setStudentSearch] = useState("");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [historyPage, setHistoryPage] = useState(0);
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const submittingRef = useRef(false);
  const [openBills, setOpenBills] = useState<MensalidadeRecord[]>([]);
  const [billsLoading, setBillsLoading] = useState(true);
  const [billsError, setBillsError] = useState("");
  const [billsRefresh, setBillsRefresh] = useState(0);

  useEffect(() => {
    let active = true; setBillsLoading(true); setBillsError("");
    listMensalidades({ status: "pendente", limit: 100, offset: 0 }).then(result => { if (active) setOpenBills(result.items); }).catch(() => { if (active) setBillsError("Nao foi possivel carregar as mensalidades pendentes."); }).finally(() => { if (active) setBillsLoading(false); });
    return () => { active = false; };
  }, [billsRefresh]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");

  useEffect(() => {
    let active = true;
    getApiHealth().then(() => { if (active) setApiOnline(true); }).catch(() => { if (active) setApiOnline(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setHistoryLoading(true); setHistoryError("");
    const timer = window.setTimeout(() => listPagamentos({ q: studentSearch.trim() || undefined, data_inicio: dateStart || undefined, data_fim: dateEnd || undefined, limit: 20, offset: historyPage * 20 }).then(result => { if (active) { setPayments(result.items); setPaymentTotal(result.total); } }).catch(() => { if (active) setHistoryError("Confira a conexão com o servidor e tente novamente."); }).finally(() => { if (active) setHistoryLoading(false); }), studentSearch ? 280 : 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [confirmed, studentSearch, dateStart, dateEnd, historyPage, historyRefresh]);

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
    if (submittingRef.current) return;
    setConfirmed(false);
    setSubmitError("");
    if (Object.keys(validate()).length) return;
    setSubmitting(true);
    submittingRef.current = true;
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
      setBillsRefresh(value => value + 1);
      setComprovante(undefined);
      const file = document.querySelector<HTMLInputElement>("#payment-receipt");
      if (file) file.value = "";
    } catch (error) {
      setSubmitError(error instanceof ApiError ? error.message : "Não foi possível confirmar a baixa pela API.");
    } finally {
      setSubmitting(false);
      submittingRef.current = false;
    }
  }

  return <>
    <PageHeader eyebrow="HISTÓRICO FINANCEIRO" title="Pagamentos" description="Consulte pagamentos registrados ou dê baixa em uma mensalidade existente." />
    <section className="management-panel list-panel payment-history-panel">
      <div className="panel-heading"><div><span className="management-eyebrow">MOVIMENTAÇÕES</span><h2>Histórico de pagamentos</h2></div><span className="panel-pill">{paymentTotal} registros</span></div>
      <div className="list-toolbar"><label className="search-field"><Icon name="search" size={18} /><input type="search" value={studentSearch} onChange={event => { setStudentSearch(event.target.value); setHistoryPage(0); }} placeholder="Buscar aluno por nome ou CPF" aria-label="Buscar pagamentos por nome ou CPF do aluno" /></label>
        <div className="filter-controls"><label>De <input type="date" value={dateStart} onChange={event => { setDateStart(event.target.value); setHistoryPage(0); }} /></label><label>Até <input type="date" value={dateEnd} onChange={event => { setDateEnd(event.target.value); setHistoryPage(0); }} /></label>
          {(studentSearch || dateStart || dateEnd) && <button className="clear-filters" type="button" onClick={() => { setStudentSearch(""); setDateStart(""); setDateEnd(""); setHistoryPage(0); }}>Limpar filtros</button>}
        </div>
      </div>
      {historyLoading && <LoadingState label="Carregando pagamentos..." />}
      {historyError && <ErrorState message={historyError} onRetry={() => setHistoryRefresh(value => value + 1)} />}
      {!historyLoading && !historyError && payments.length === 0 && <EmptyState title="Nenhum pagamento encontrado" detail="A consulta não retornou pagamentos para estes filtros." />}
      {!historyLoading && !historyError && payments.length > 0 && <div className="table-scroll"><table><thead><tr><th>Aluno</th><th>Mensalidade</th><th>Competência</th><th>Pagamento</th><th>Valor recebido</th><th>Forma</th><th>Comprovante</th></tr></thead><tbody>{payments.map(payment => <tr key={payment.id}><td><strong>{payment.aluno_nome}</strong></td><td>{payment.numero_contrato ? `Contrato ${payment.numero_contrato}` : payment.mensalidade_id.slice(0, 8)}</td><td>{payment.competencia.slice(0, 7)}</td><td>{formatDate(payment.pago_em.slice(0, 10))}</td><td>{formatBrl(Math.round(Number(payment.valor_pago) * 100))}</td><td>{payment.forma_pagamento}</td><td>{payment.comprovante_path ? "Armazenado em area privada" : "Sem comprovante"}</td></tr>)}</tbody></table></div>}
      {!historyError && paymentTotal > 0 && <div className="panel-footer"><span>Mostrando {historyPage * 20 + 1}-{Math.min((historyPage + 1) * 20, paymentTotal)} de {paymentTotal} pagamentos</span><div className="pagination-actions"><button className="management-button management-button-secondary" disabled={!historyPage} onClick={() => setHistoryPage(historyPage - 1)}><Icon name="arrow" size={16} /> Anterior</button><button className="management-button management-button-secondary" disabled={(historyPage + 1) * 20 >= paymentTotal} onClick={() => setHistoryPage(historyPage + 1)}>Próxima <Icon name="chevron" size={16} /></button></div></div>}
    </section>

    <section className="management-panel payment-form-panel" id="registrar-pagamento">
      <div className="panel-heading"><div><span className="management-eyebrow">AÇÃO INTEGRADA</span><h2>Registrar pagamento</h2><p>Registra a baixa de uma parcela existente; não cria mensalidades.</p></div><span className="panel-pill panel-pill-integrated">POST /mensalidades/baixa</span></div>

      <form className="payment-form" onSubmit={handleSubmit} noValidate>
        <label className="management-field payment-id-field"><span>Mensalidade pendente</span><select value={mensalidadeId} onChange={event => { const selected = openBills.find(bill => bill.id === event.target.value); setMensalidadeId(event.target.value); if (selected) setValor(Number(selected.valor_devido).toFixed(2).replace(".", ",")); }} aria-invalid={Boolean(errors.mensalidadeId)} disabled={billsLoading || Boolean(billsError)}><option value="">{billsLoading ? "Carregando mensalidades..." : "Selecione a mensalidade"}</option>{openBills.map(bill => <option key={bill.id} value={bill.id}>{bill.aluno_nome} · {bill.competencia.slice(0, 7)} · venc. {formatDate(bill.data_vencimento)} · {formatBrl(Math.round(Number(bill.valor_devido) * 100))}</option>)}{mensalidadeId && !openBills.some(bill => bill.id === mensalidadeId) && <option value={mensalidadeId}>Selecionada anteriormente · {formatBrl(Math.round(Number(valor || 0) * 100))}</option>}</select>{errors.mensalidadeId && <small className="management-field-error">{errors.mensalidadeId}</small>}{billsError && <small className="management-field-error">{billsError} <button type="button" className="inline-retry" onClick={() => setBillsRefresh(value => value + 1)}>Tentar novamente</button></small>}</label>
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
