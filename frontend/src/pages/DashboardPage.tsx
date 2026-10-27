import { useCallback, useEffect, useState } from "react";
import { getDashboardMetrics, type DashboardMetrics } from "../api";
import { EmptyState, ErrorState, LoadingState, PageHeader, StatusBadge } from "../components/PagePrimitives";
import { PaymentDialog } from "../components/PaymentDialog";
import { Icon } from "../components/Icon";
import { formatBrl, formatDate } from "../format";

export default function DashboardPage() {
  const [data, setData] = useState<DashboardMetrics | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [selectedBill, setSelectedBill] = useState<DashboardMetrics["proximos_vencimentos"][number] | null>(null);
  const [paymentNotice, setPaymentNotice] = useState("");
  useEffect(() => {
    let active = true;
    setLoading(true); setError("");
    getDashboardMetrics().then(result => { if (active) setData(result); }).catch(() => { if (active) setError("Confira a conexao da API e tente novamente."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refresh]);
  const paymentSucceeded = useCallback(() => {
    setPaymentNotice("Pagamento registrado. Atualizando os indicadores...");
    setRefresh(value => value + 1);
  }, []);
  const metrics = [
    { label: "Alunos ativos", value: data?.alunos_ativos, icon: "users" as const },
    { label: "Contratos ativos", value: data?.contratos_ativos, icon: "contract" as const },
    { label: "Mensalidades pendentes", value: data?.mensalidades_pendentes, icon: "calendar" as const },
    { label: "Recebido neste mês", value: data ? formatBrl(Math.round(Number(data.resumo_financeiro_mes.valor_recebido) * 100)) : undefined, icon: "wallet" as const },
  ];
  return <>
    <PageHeader eyebrow="PAINEL DE GESTÃO" title="Visão geral" description="Acompanhe a operação e os pontos que precisam de atenção." />
    {paymentNotice && <div className="payment-result payment-result-success" role="status"><Icon name="check" size={18} />{paymentNotice}</div>}
    {error && <ErrorState message={error} onRetry={() => setRefresh(value => value + 1)} />}
    {loading && <LoadingState label="Atualizando indicadores e vencimentos..." />}
    {!error && <section className="metric-grid" aria-label="Indicadores principais">
      {metrics.map(metric => <article className="metric-card" key={metric.label}><div className="metric-card-top"><span>{metric.label}</span><span className="metric-mark"><Icon name={metric.icon} size={19} /></span></div><strong>{metric.value ?? "—"}</strong><small>{data ? "Dados atuais do sistema" : "Aguardando resposta da API"}</small></article>)}
    </section>}
    {data && !error && <div className="dashboard-panels">
      <section className="management-panel"><div className="panel-heading"><div><span className="management-eyebrow">AGENDA</span><h2>Próximos vencimentos</h2><p>Mensalidades pendentes ordenadas pela data de vencimento.</p></div><span className="panel-pill">{data.proximos_vencimentos.length} próximos</span></div>
        {data.proximos_vencimentos.length ? <div className="table-scroll"><table><thead><tr><th>Aluno</th><th>Competência</th><th>Vencimento</th><th>Valor pendente</th><th>Situação</th><th>Ação</th></tr></thead><tbody>{data.proximos_vencimentos.map(item => <tr key={item.id}><td><strong>{item.aluno_nome}</strong></td><td>{item.competencia.slice(0, 7)}</td><td>{formatDate(item.data_vencimento)}</td><td>{formatBrl(Math.round(Number(item.valor_devido) * 100))}</td><td><StatusBadge status="Pendente" /></td><td><button type="button" className="text-action" onClick={() => { setPaymentNotice(""); setSelectedBill(item); }}><Icon name="receipt" size={16} /> Registrar baixa</button></td></tr>)}</tbody></table></div> : <EmptyState title="Sem próximos vencimentos" detail="Não há cobranças pendentes com vencimento futuro retornadas pela API." />}
      </section>
      <section className="management-panel"><div className="panel-heading"><div><span className="management-eyebrow">RESUMO DO MÊS</span><h2>Movimentação financeira</h2></div><span className="panel-pill">{data.resumo_financeiro_mes.competencia}</span></div>
        <div className="financial-placeholder"><div><span>Valores recebidos</span><strong>{formatBrl(Math.round(Number(data.resumo_financeiro_mes.valor_recebido) * 100))}</strong></div><div><span>Valores em aberto</span><strong>{formatBrl(Math.round(Number(data.resumo_financeiro_mes.valor_em_aberto) * 100))}</strong></div><div className="dashboard-payment-count"><span>Pagamentos registrados</span><strong>{data.pagamentos_registrados}</strong></div><p>Totais calculados a partir dos registros financeiros do sistema.</p></div>
      </section>
    </div>}
    {selectedBill && <PaymentDialog bill={selectedBill} onCancel={() => setSelectedBill(null)} onSuccess={paymentSucceeded} />}
  </>;
}
