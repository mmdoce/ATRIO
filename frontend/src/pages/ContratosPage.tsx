import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getContrato, listContratos, type ContratoDetail, type ContratoRecord } from "../api";
import { ButtonLink, EmptyState, ErrorState, LoadingState, PageHeader, StatusBadge } from "../components/PagePrimitives";
import { Icon } from "../components/Icon";
import { formatBrl, formatDate } from "../format";

export function ContratosPage() {
  const [situacao, setSituação] = useState(""); const [page, setPage] = useState(0); const [items, setItems] = useState<ContratoRecord[]>([]); const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [refresh, setRefresh] = useState(0);
  useEffect(() => { let active = true; setLoading(true); setError("");
    listContratos({ situacao: situacao || undefined, limit: 20, offset: page * 20 }).then(result => { if (active) { setItems(result.items); setTotal(result.total); } }).catch(() => { if (active) setError("Confira a conexão do sistema e tente novamente."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [situacao, page, refresh]);
  return <>
    <PageHeader eyebrow="GESTÃO CONTRATUAL" title="Contratos" description="Consulte os contratos ativos e o histórico de vinculos." action={<ButtonLink href="/acolhidos/novo" icon="plus">Novo contrato</ButtonLink>} />
    <section className="management-panel list-panel"><div className="list-toolbar"><div className="filter-controls"><label><Icon name="filter" size={17} /> Situação<select value={situacao} onChange={event => { setSituação(event.target.value); setPage(0); }}><option value="">Todas</option><option value="ativo">Ativos</option><option value="encerrado">Encerrados</option><option value="suspenso">Suspensos</option></select></label>{situacao && <button className="clear-filters" onClick={() => { setSituação(""); setPage(0); }}>Limpar filtro</button>}</div><span className="panel-pill">{total} contratos</span></div>
      {error && <ErrorState message={error} onRetry={() => setRefresh(value => value + 1)} />}{loading && <LoadingState label="Carregando contratos..." />}
      {!loading && !error && items.length > 0 && <div className="table-scroll"><table><thead><tr><th>Contrato</th><th>Aluno</th><th>Início</th><th>Tipo de vaga</th><th>Mensalidade</th><th>Situação</th></tr></thead><tbody>{items.map(item => <tr key={item.id}><td><ButtonLink href={`/contratos/${item.id}`} secondary icon="eye">N. {item.numero_contrato}</ButtonLink></td><td><strong>{item.aluno_nome}</strong></td><td>{formatDate(item.data_contrato)}</td><td>{item.tipo_vaga}</td><td>{formatBrl(Math.round(Number(item.mensalidade_valor) * 100))}</td><td><StatusBadge status={item.situacao} /></td></tr>)}</tbody></table></div>}
      {!loading && !error && items.length === 0 && <EmptyState title="Nenhum contrato encontrado" detail="A consulta não retornou contratos para este filtro." />}
      {!error && total > 0 && <div className="panel-footer"><span>Mostrando {page * 20 + 1}-{Math.min((page + 1) * 20, total)} de {total} contratos</span><div className="pagination-actions"><button className="management-button management-button-secondary" disabled={!page} onClick={() => setPage(page - 1)}><Icon name="arrow" size={16} /> Anterior</button><button className="management-button management-button-secondary" disabled={(page + 1) * 20 >= total} onClick={() => setPage(page + 1)}>Próxima <Icon name="chevron" size={16} /></button></div></div>}
    </section>
  </>;
}

export function ContratoDetalhePage() {
  const { id = "" } = useParams(); const [item, setItem] = useState<ContratoDetail | null>(null); const [error, setError] = useState(""); const [refresh, setRefresh] = useState(0);
  useEffect(() => { let active = true; setError(""); setItem(null); getContrato(id).then(result => { if (active) setItem(result); }).catch(reason => { if (active) setError(reason.status === 404 ? "Contrato nao encontrado ou sem permissao de consulta." : "Confira a conexão do sistema e tente novamente."); }); return () => { active = false; }; }, [id, refresh]);
  return <><PageHeader eyebrow="CONTRATOS / DETALHES" title={item ? `Contrato n. ${item.numero_contrato}` : "Detalhes do contrato"} description="Dados do contrato e das pessoas vinculadas." action={<ButtonLink href="/contratos" secondary icon="arrow">Voltar aos contratos</ButtonLink>} />
    {!item && !error && <LoadingState label="Carregando contrato..." />}{error && <ErrorState message={error} onRetry={() => setRefresh(value => value + 1)} />}
    {item && <section className="management-panel detail-confirmation"><span className="management-eyebrow">CONTRATO</span><h2>{item.aluno_nome}</h2><div className="contract-actions"><ButtonLink href={`/contratos/${item.id}/documento`} secondary icon="eye">Visualizar contrato</ButtonLink><ButtonLink href={`/contratos/${item.id}/documento?imprimir=1`} secondary icon="print">Imprimir contrato</ButtonLink></div><div className="detail-id-grid"><div><span>Situação</span><StatusBadge status={item.situacao} /></div><div><span>Data do contrato</span><strong>{formatDate(item.data_contrato)}</strong></div><div><span>Tipo de vaga</span><strong>{item.tipo_vaga}</strong></div><div><span>Mensalidade contratada</span><strong>{formatBrl(Math.round(Number(item.mensalidade_valor) * 100))}</strong></div><div><span>Matricula cobrada</span><strong>{item.cobrar_matricula ? formatBrl(Math.round(Number(item.matricula_valor) * 100)) : "Nao"}</strong></div><div><span>Primeiro vencimento</span><strong>{formatDate(item.primeiro_vencimento)}</strong></div><div><span>Responsavel financeiro</span><strong>{item.responsavel_financeiro?.nome ?? "—"}</strong></div><div><span>CPF do responsavel</span><strong>{item.responsavel_financeiro?.cpf ?? "Nao informado"}</strong></div><div><span>Telefone do responsavel</span><strong>{item.responsavel_financeiro?.telefone ?? "Nao informado"}</strong></div></div></section>}
  </>;
}
