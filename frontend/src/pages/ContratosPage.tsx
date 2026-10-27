import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getContrato, listContratos, type ContratoDetail, type ContratoRecord } from "../api";
import { ButtonLink, EmptyState, PageHeader } from "../components/PagePrimitives";
import { formatBrl, formatDate } from "../format";

export function ContratosPage() {
  const [situacao, setSituacao] = useState("");
  const [page, setPage] = useState(0);
  const [items, setItems] = useState<ContratoRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true; setLoading(true); setError("");
    listContratos({ situacao: situacao || undefined, limit: 20, offset: page * 20 }).then((result) => { if (active) { setItems(result.items); setTotal(result.total); } }).catch(() => { if (active) setError("Não foi possível carregar os contratos pela API."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [situacao, page]);
  return <>
    <PageHeader eyebrow="GESTÃO CONTRATUAL" title="Contratos" description="Acompanhe contratos ativos e consulte o histórico de encerramentos." action={<ButtonLink href="/acolhidos/novo">Novo contrato</ButtonLink>} />
    <section className="management-panel list-panel"><div className="list-toolbar"><label className="filter-controls">Situação <select value={situacao} onChange={(event) => { setSituacao(event.target.value); setPage(0); }}><option value="">Todos</option><option value="ativo">Ativos</option><option value="encerrado">Encerrados</option><option value="suspenso">Suspensos</option></select></label><span className="panel-pill">{total} contrato(s)</span></div>
      {loading && <p role="status">Carregando contratos…</p>}{error && <div className="integration-pending" role="alert"><div><strong>Consulta indisponível</strong><p>{error}</p></div></div>}
      <div className="table-scroll"><table><thead><tr><th>Número</th><th>Acolhido</th><th>Data</th><th>Tipo de vaga</th><th>Valor mensal</th><th>Situação</th></tr></thead><tbody>{!loading && !error && items.map((item) => <tr key={item.id}><td><ButtonLink href={`/contratos/${item.id}`} secondary>Nº {item.numero_contrato}</ButtonLink></td><td>{item.aluno_nome}</td><td>{formatDate(item.data_contrato)}</td><td>{item.tipo_vaga}</td><td>{formatBrl(Math.round(Number(item.mensalidade_valor) * 100))}</td><td>{item.situacao}</td></tr>)}</tbody></table></div>
      {!loading && !error && !items.length && <EmptyState title="Nenhum contrato encontrado" detail="A consulta foi concluída e não retornou contratos para este filtro." />}
      {!error && <div className="panel-footer"><button className="management-button management-button-secondary" disabled={!page} onClick={() => setPage(page - 1)}>Anterior</button><button className="management-button management-button-secondary" disabled={(page + 1) * 20 >= total} onClick={() => setPage(page + 1)}>Próxima</button></div>}
    </section>
  </>;
}

export function ContratoDetalhePage() {
  const { id = "" } = useParams();
  const [item, setItem] = useState<ContratoDetail | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { let active = true; getContrato(id).then((result) => { if (active) setItem(result); }).catch((reason) => { if (active) setError(reason.status === 404 ? "Contrato não encontrado." : "Não foi possível carregar o contrato pela API."); }); return () => { active = false; }; }, [id]);
  return <><PageHeader eyebrow="CONTRATOS / DETALHES" title={item ? `Contrato nº ${item.numero_contrato}` : "Detalhes do contrato"} description="Dados do contrato, das pessoas vinculadas e da situação atual." action={<ButtonLink href="/contratos" secondary>Voltar aos contratos</ButtonLink>} />
    {!item && !error && <p role="status">Carregando contrato…</p>}{error && <div className="integration-pending" role="alert"><div><strong>Consulta indisponível</strong><p>{error}</p></div></div>}
    {item && <section className="management-panel detail-confirmation"><span className="management-eyebrow">CONTRATO</span><h2>{item.aluno_nome}</h2><div className="contract-actions"><ButtonLink href={`/contratos/${item.id}/documento`} secondary>Visualizar contrato</ButtonLink><ButtonLink href={`/contratos/${item.id}/documento?imprimir=1`} secondary>Imprimir contrato</ButtonLink><ButtonLink href={`/contratos/${item.id}/documento?imprimir=1`}>Baixar contrato em PDF</ButtonLink></div><div className="detail-id-grid"><div><span>Situação</span><strong>{item.situacao}</strong></div><div><span>Data do contrato</span><strong>{formatDate(item.data_contrato)}</strong></div><div><span>Tipo de vaga</span><strong>{item.tipo_vaga}</strong></div><div><span>Mensalidade contratada</span><strong>{formatBrl(Math.round(Number(item.mensalidade_valor) * 100))}</strong></div><div><span>Matrícula cobrada</span><strong>{item.cobrar_matricula ? formatBrl(Math.round(Number(item.matricula_valor) * 100)) : "Não"}</strong></div><div><span>Primeiro vencimento</span><strong>{formatDate(item.primeiro_vencimento)}</strong></div><div><span>Responsável financeiro</span><strong>{item.responsavel_financeiro?.nome ?? "—"}</strong></div><div><span>CPF do responsável</span><strong>{item.responsavel_financeiro?.cpf ?? "Não informado"}</strong></div><div><span>Telefone do responsável</span><strong>{item.responsavel_financeiro?.telefone ?? "Não informado"}</strong></div></div></section>}
  </>;
}
