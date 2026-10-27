import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listMensalidades, type MensalidadeRecord } from "../api";
import { EmptyState, PageHeader } from "../components/PagePrimitives";
import { formatBrl, formatDate } from "../format";

export default function FinanceiroPage() {
  const navigate = useNavigate();
  const [competencia, setCompetencia] = useState("");
  const [status, setStatus] = useState("");
  const [items, setItems] = useState<MensalidadeRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => { let active = true; setLoading(true); setError(""); listMensalidades({ competencia: competencia || undefined, status: status || undefined, limit: 20, offset: page * 20 }).then((result) => { if (active) { setItems(result.items); setTotal(result.total); } }).catch(() => { if (active) setError("Não foi possível carregar as mensalidades pela API."); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [competencia, status, page]);
  return <>
    <PageHeader eyebrow="CONTAS A RECEBER" title="Financeiro" description="Acompanhe mensalidades, vencimentos e situação das cobranças." action={<button className="management-button" onClick={() => navigate("/pagamentos")}>Registrar pagamento</button>} />
    <section className="management-panel list-panel"><div className="list-toolbar"><div className="filter-controls"><label>Competência <input type="month" value={competencia} onChange={(event) => { setCompetencia(event.target.value); setPage(0); }} /></label><label>Status <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(0); }}><option value="">Todos</option><option value="pendente">Pendente</option><option value="paga">Paga</option><option value="cancelada">Cancelada</option></select></label></div><span className="panel-pill">{total} cobrança(s)</span></div>
      {loading && <p role="status">Carregando cobranças…</p>}{error && <div className="integration-pending" role="alert"><div><strong>Consulta indisponível</strong><p>{error}</p></div></div>}
      <div className="table-scroll"><table><thead><tr><th>Acolhido</th><th>Tipo</th><th>Competência</th><th>Vencimento</th><th>Valor</th><th>Status</th><th /></tr></thead><tbody>{!loading && !error && items.map((item) => <tr key={item.id}><td>{item.aluno_nome}</td><td>{item.tipo_cobranca}</td><td>{item.competencia.slice(0, 7)}</td><td>{formatDate(item.data_vencimento)}</td><td>{formatBrl(Math.round(Number(item.valor_devido) * 100))}</td><td>{item.status}</td><td>{item.status === "pendente" && <button className="text-action" onClick={() => navigate("/pagamentos", { state: { mensalidadeId: item.id, valor: item.valor_devido } })}>Dar baixa</button>}</td></tr>)}</tbody></table></div>
      {!loading && !error && items.length === 0 && <EmptyState title="Nenhuma cobrança encontrada" detail="A consulta foi concluída e não retornou mensalidades para estes filtros." />}
      {!error && <div className="panel-footer"><button className="management-button management-button-secondary" disabled={!page} onClick={() => setPage(page - 1)}>Anterior</button><button className="management-button management-button-secondary" disabled={(page + 1) * 20 >= total} onClick={() => setPage(page + 1)}>Próxima</button></div>}
    </section>
  </>;
}
