import { useCallback, useEffect, useState } from "react";
import { getDashboardMetrics, type DashboardMetrics } from "../api";
import { EmptyState, IntegrationPending, PageHeader } from "../components/PagePrimitives";
import { PaymentDialog } from "../components/PaymentDialog";
import { formatBrl, formatDate } from "../format";

const metricKeys = [
  ["alunos_ativos", "Acolhidos ativos"], ["contratos_ativos", "Contratos ativos"],
  ["mensalidades_pendentes", "Mensalidades pendentes"], ["pagamentos_registrados", "Pagamentos registrados"],
] as const;

export default function DashboardPage() {
  const [data, setData] = useState<DashboardMetrics | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [selectedBill, setSelectedBill] = useState<DashboardMetrics["proximos_vencimentos"][number] | null>(null);
  const [paymentNotice, setPaymentNotice] = useState("");
  useEffect(() => {
    let active = true;
    getDashboardMetrics().then((result) => { if (active) setData(result); }).catch(() => { if (active) setError("Não foi possível carregar os indicadores. Confira a conexão da API e do banco."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refresh]);
  const paymentSucceeded = useCallback(() => {
    setPaymentNotice("Pagamento registrado. Atualizando vencimentos e indicadores…");
    setRefresh((value) => value + 1);
  }, []);
  return <>
    <PageHeader eyebrow="PAINEL DE GESTÃO" title="Visão geral" description="Acompanhe acolhimentos, contratos e movimentações financeiras do Átrio." />
    {paymentNotice && <div className="payment-result payment-result-success" role="status">{paymentNotice}</div>}
    {error && <div className="integration-pending" role="alert"><div><strong>Consulta indisponível</strong><p>{error}</p></div></div>}
    {loading && <p role="status">Carregando indicadores…</p>}
    <section className="metric-grid" aria-label="Indicadores do painel">
      {metricKeys.map(([key, label], index) => <article className="metric-card" key={key}><div className="metric-card-top"><span>{label}</span><span className={`metric-mark metric-mark-${index + 1}`} /></div><strong>{data ? data[key] : "—"}</strong><small>{data ? "Atualizado pela API" : "Aguardando dados"}</small></article>)}
    </section>
    <div className="dashboard-panels">
      <section className="management-panel"><div className="panel-heading"><div><span className="management-eyebrow">AGENDA FINANCEIRA</span><h2>Próximos vencimentos</h2></div><span className="panel-pill">{data ? data.proximos_vencimentos.length : "—"}</span></div>
        {data?.proximos_vencimentos.length ? <div className="table-scroll"><table><thead><tr><th>Acolhido</th><th>Competência</th><th>Vencimento</th><th>Valor devido</th><th>Tipo</th><th>Ação</th></tr></thead><tbody>{data.proximos_vencimentos.map((item) => <tr key={item.id}><td>{item.aluno_nome}</td><td>{item.competencia.slice(0, 7)}</td><td>{formatDate(item.data_vencimento)}</td><td>{formatBrl(Math.round(Number(item.valor_devido) * 100))}</td><td>{item.tipo_cobranca}</td><td><button type="button" className="text-action" onClick={() => { setPaymentNotice(""); setSelectedBill(item); }}>Dar baixa</button></td></tr>)}</tbody></table></div> : data ? <EmptyState title="Sem próximos vencimentos" detail="Não há cobranças pendentes com vencimento futuro cadastradas." /> : <IntegrationPending>Os vencimentos serão exibidos quando a consulta de indicadores responder.</IntegrationPending>}
      </section>
      <section className="management-panel"><div className="panel-heading"><div><span className="management-eyebrow">COMPETÊNCIA ATUAL</span><h2>Resumo financeiro</h2></div><span className="panel-pill">{data?.resumo_financeiro_mes.competencia ?? "—"}</span></div>
        {data ? <div className="financial-placeholder"><div><span>Valores recebidos</span><strong>{formatBrl(Math.round(Number(data.resumo_financeiro_mes.valor_recebido) * 100))}</strong></div><div><span>Valores em aberto</span><strong>{formatBrl(Math.round(Number(data.resumo_financeiro_mes.valor_em_aberto) * 100))}</strong></div><p>Recebido pelo pagamento registrado neste mês; em aberto pelas parcelas pendentes da competência atual.</p></div> : <IntegrationPending>O resumo financeiro aparecerá após uma resposta confirmada da API.</IntegrationPending>}
      </section>
    </div>
    {selectedBill && <PaymentDialog bill={selectedBill} onCancel={() => setSelectedBill(null)} onSuccess={paymentSucceeded} />}
  </>;
}
