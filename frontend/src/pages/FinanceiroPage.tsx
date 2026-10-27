import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listMensalidades, type MensalidadeRecord } from "../api";
import { EmptyState, ErrorState, LoadingState, PageHeader, StatusBadge } from "../components/PagePrimitives";
import { Icon } from "../components/Icon";
import { formatBrl, formatDate } from "../format";

export default function FinanceiroPage() {
  const navigate = useNavigate();
  const [q, setQ] = useState(""); const [competencia, setCompetência] = useState(""); const [status, setStatus] = useState("");
  const [items, setItems] = useState<MensalidadeRecord[]>([]); const [total, setTotal] = useState(0); const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true; setLoading(true); setError("");
    const timer = window.setTimeout(() => listMensalidades({ q: q.trim() || undefined, competencia: competencia || undefined, status: status || undefined, limit: 20, offset: page * 20 })
      .then(result => { if (active) { setItems(result.items); setTotal(result.total); } })
      .catch(() => { if (active) setError("Confira a conexão com o servidor e tente novamente."); })
      .finally(() => { if (active) setLoading(false); }), q ? 280 : 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [q, competencia, status, page, refresh]);
  const clear = () => { setQ(""); setCompetência(""); setStatus(""); setPage(0); };
  return <>
    <PageHeader eyebrow="CONTAS A RECEBER" title="Financeiro" description="Consulte mensalidades e acompanhe pendências de cobrança." action={<button className="management-button" onClick={() => navigate("/pagamentos")}><Icon name="receipt" size={17} /> Registrar pagamento</button>} />
    <section className="management-panel list-panel">
      <div className="list-toolbar"><label className="search-field"><Icon name="search" size={18} /><input type="search" value={q} onChange={event => { setQ(event.target.value); setPage(0); }} placeholder="Buscar aluno por nome ou CPF" aria-label="Buscar aluno por nome ou CPF" /></label>
        <div className="filter-controls"><label>Competência<input type="month" value={competencia} onChange={event => { setCompetência(event.target.value); setPage(0); }} /></label><label>Status<select value={status} onChange={event => { setStatus(event.target.value); setPage(0); }}><option value="">Todos</option><option value="pendente">Pendente</option><option value="paga">Paga</option><option value="cancelada">Cancelada</option></select></label>
          {(q || competencia || status) && <button className="clear-filters" type="button" onClick={clear}>Limpar filtros</button>}</div><span className="panel-pill">{total} mensalidades</span></div>
      {error && <ErrorState message={error} onRetry={() => setRefresh(value => value + 1)} />}
      {loading && <LoadingState label="Carregando mensalidades..." />}
      {!loading && !error && items.length > 0 && <div className="table-scroll"><table><thead><tr><th>Aluno</th><th>Tipo</th><th>Competência</th><th>Vencimento</th><th>Valor devido</th><th>Status</th><th>Ações</th></tr></thead><tbody>{items.map(item => <tr key={item.id}><td><strong>{item.aluno_nome}</strong></td><td>{item.tipo_cobranca}</td><td>{item.competencia.slice(0, 7)}</td><td>{formatDate(item.data_vencimento)}</td><td>{formatBrl(Math.round(Number(item.valor_devido) * 100))}</td><td><StatusBadge status={item.status === "paga" ? "Paga" : item.status === "pendente" ? "Pendente" : "Cancelada"} /></td><td>{item.status === "pendente" && <button className="text-action" onClick={() => navigate("/pagamentos", { state: { mensalidadeId: item.id, valor: item.valor_devido } })}><Icon name="receipt" size={16} /> Dar baixa</button>}</td></tr>)}</tbody></table></div>}
      {!loading && !error && items.length === 0 && <EmptyState title="Nenhuma mensalidade encontrada" detail="A busca não retornou cobranças. Altere os filtros e tente novamente." />}
      {!error && total > 0 && <div className="panel-footer"><span>Mostrando {page * 20 + 1}-{Math.min((page + 1) * 20, total)} de {total} registros</span><div className="pagination-actions"><button className="management-button management-button-secondary" disabled={!page} onClick={() => setPage(page - 1)}><Icon name="arrow" size={16} /> Anterior</button><button className="management-button management-button-secondary" disabled={(page + 1) * 20 >= total} onClick={() => setPage(page + 1)}>Próxima <Icon name="chevron" size={16} /></button></div></div>}
    </section>
  </>;
}
