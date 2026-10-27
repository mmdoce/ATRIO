import { useEffect, useState, type FormEvent } from "react";
import { useLocation, useParams } from "react-router-dom";
import { ApiError, closeContract, getAluno, listAlunos, listMensalidades, reactivateAluno, type AlunoDetail, type AlunoRecord, type CadastroResponse, type MensalidadeRecord } from "../api";
import { ButtonLink, EmptyState, ErrorState, LoadingState, PageHeader, StatusBadge } from "../components/PagePrimitives";
import { formatBrl, formatDate, parseBrlToCents } from "../format";
import { useAuth } from "../auth";
import { Icon } from "../components/Icon";

export function AcolhidosPage() {
  const { profile } = useAuth();
  const [q, setQ] = useState("");
  const [situacao, setSituacao] = useState("");
  const [page, setPage] = useState(0);
  const [items, setItems] = useState<AlunoRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setError("");
    const timer = window.setTimeout(() => {
      listAlunos({ q: q.trim() || undefined, situacao: situacao || undefined, limit: 20, offset: page * 20 })
        .then(result => { if (active) { setItems(result.items); setTotal(result.total); } })
        .catch(() => { if (active) setError("Confira a conexao do sistema e tente novamente."); })
        .finally(() => { if (active) setLoading(false); });
    }, q ? 280 : 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [q, situacao, page, refresh]);
  return <>
    <PageHeader eyebrow="CADASTROS" title="Alunos" description="Localize alunos e consulte suas fichas cadastrais." action={<ButtonLink href="/acolhidos/novo" icon="plus">Novo aluno</ButtonLink>} />
    <section className="management-panel list-panel">
      <div className="list-toolbar">
        <label className="search-field"><Icon name="search" size={18} /><input type="search" value={q} onChange={event => { setQ(event.target.value); setPage(0); }} placeholder="Buscar por nome ou CPF" aria-label="Buscar alunos por nome ou CPF" /></label>
        <div className="filter-controls"><label><Icon name="filter" size={17} /> Vínculo<select value={situacao} onChange={event => { setSituacao(event.target.value); setPage(0); }}><option value="">Todos</option><option value="ativo">Ativo</option><option value="encerrado">Encerrado</option><option value="inativo">Sem vínculo</option></select></label>
          {(q || situacao) && <button type="button" className="clear-filters" onClick={() => { setQ(""); setSituacao(""); setPage(0); }}>Limpar filtros</button>}
        </div>
      </div>
      {error && <ErrorState message={error} onRetry={() => setRefresh(value => value + 1)} />}
      {loading && <LoadingState label="Carregando alunos..." />}
      {!loading && !error && items.length > 0 && <div className="table-scroll"><table><thead><tr><th>Aluno</th><th>Vínculo</th>{profile?.role === "DIRETOR" && <th>Contrato atual</th>}<th>Ação</th></tr></thead><tbody>{items.map(item => <tr key={item.id}><td><strong>{item.nome}</strong></td><td><StatusBadge status={item.situacao === "ativo" ? "Ativo" : item.situacao === "encerrado" ? "Encerrado" : "Sem vínculo"} /></td>{profile?.role === "DIRETOR" && <td>{item.contrato_atual ? `N. ${item.contrato_atual.numero_contrato} - ${item.contrato_atual.tipo_vaga}` : "?"}</td>}<td><ButtonLink href={`/acolhidos/${item.id}`} secondary icon="eye">Abrir ficha</ButtonLink></td></tr>)}</tbody></table></div>}
      {!loading && !error && items.length === 0 && <EmptyState title="Nenhum aluno encontrado" detail="A busca não retornou registros. Ajuste os filtros ou cadastre um aluno." action={!q && !situacao ? <ButtonLink href="/acolhidos/novo" icon="plus">Cadastrar aluno</ButtonLink> : undefined} />}
      {!error && total > 0 && <div className="panel-footer"><span>Mostrando {page * 20 + 1}-{Math.min((page + 1) * 20, total)} de {total} alunos</span><div className="pagination-actions"><button className="management-button management-button-secondary" disabled={page === 0} onClick={() => setPage(page - 1)}><Icon name="arrow" size={16} /> Anterior</button><button className="management-button management-button-secondary" disabled={(page + 1) * 20 >= total} onClick={() => setPage(page + 1)}>Próxima <Icon name="chevron" size={16} /></button></div></div>}
    </section>
  </>;
}

type ReactivationForm = { responsavel_financeiro_id: string; data_contrato: string; tipo_vaga: "SOCIAL" | "PARTICULAR"; mensalidade_valor: string; matricula_valor: string; cobrar_matricula: boolean; vencimento_dia: string };
const todayIso = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`; };
const money = (value: number) => formatBrl(Math.round(Number(value) * 100));
const personAddress = (person: { endereco?: string | null; bairro?: string | null; cep?: string | null; cidade?: string | null; estado?: string | null }) => [person.endereco, person.bairro, person.cep && `CEP ${person.cep}`, person.cidade, person.estado].filter(Boolean).join(" · ") || "Não informado";

export function AcolhidoDetalhePage() {
  const { profile } = useAuth();
  const { id = "" } = useParams();
  const location = useLocation();
  const cadastro = (location.state as { cadastro?: CadastroResponse } | null)?.cadastro;
  const [aluno, setAluno] = useState<AlunoDetail | null>(null);
  const [charges, setCharges] = useState<MensalidadeRecord[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [working, setWorking] = useState(false);
  const [actionError, setActionError] = useState("");
  const [actionNotice, setActionNotice] = useState("");
  const [reactivationOpen, setReactivationOpen] = useState(false);
  const [reactivationForm, setReactivationForm] = useState<ReactivationForm | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true); setError("");
    Promise.all([getAluno(id), profile?.role === "DIRETOR" ? listMensalidades({ aluno_id: id, limit: 100, offset: 0 }) : Promise.resolve({ items: [] as MensalidadeRecord[] })])
      .then(([result, financial]) => { if (active) { setAluno(result); setCharges(financial.items); } })
      .catch((reason) => { if (active) setError(reason instanceof ApiError && reason.status === 404 ? "Acolhido não encontrado." : "Não foi possível carregar a ficha completa pela API."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, refresh, profile?.role]);

  const activeContract = aluno?.contratos.find((contract) => contract.situacao === "ativo");
  const latestEnded = aluno?.contratos.find((contract) => contract.situacao === "encerrado");

  async function handleClose() {
    if (!activeContract || working) return;
    const confirmed = window.confirm(`Confirma o encerramento do contrato nº ${activeContract.numero_contrato}? O histórico e as cobranças serão preservados. Esta operação não coleta data ou motivo, pois esses campos não existem no backend atual.`);
    if (!confirmed) return;
    setWorking(true); setActionError(""); setActionNotice("");
    try {
      await closeContract(activeContract.id);
      setActionNotice(`Contrato nº ${activeContract.numero_contrato} encerrado pela API. Atualizando ficha…`);
      setRefresh((value) => value + 1);
    } catch (reason) {
      setActionError(reason instanceof ApiError ? reason.message : "Não foi possível confirmar o encerramento pela API.");
    } finally { setWorking(false); }
  }

  function startReactivation() {
    if (!latestEnded?.responsavel_financeiro) {
      setActionError("Não há responsável financeiro vinculado ao contrato encerrado. Revise o vínculo cadastral antes de reativar.");
      return;
    }
    setActionError(""); setActionNotice("");
    setReactivationForm({
      responsavel_financeiro_id: latestEnded.responsavel_financeiro.id,
      data_contrato: todayIso(),
      tipo_vaga: latestEnded.tipo_vaga === "PARTICULAR" ? "PARTICULAR" : "SOCIAL",
      mensalidade_valor: latestEnded.mensalidade_valor.toFixed(2).replace(".", ","),
      matricula_valor: "0,00",
      cobrar_matricula: false,
      vencimento_dia: latestEnded.vencimento_dia ? String(latestEnded.vencimento_dia) : "",
    });
    setReactivationOpen(true);
  }

  async function submitReactivation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reactivationForm || working || !latestEnded) return;
    const monthlyCents = parseBrlToCents(reactivationForm.mensalidade_valor);
    const enrollmentCents = reactivationForm.cobrar_matricula ? parseBrlToCents(reactivationForm.matricula_valor) : 0;
    if (!monthlyCents || monthlyCents <= 0 || (reactivationForm.cobrar_matricula && (!enrollmentCents || enrollmentCents <= 0))) {
      setActionError("Informe valores monetários válidos; a mensalidade deve ser positiva e a matrícula só é obrigatória quando marcada para cobrança.");
      return;
    }
    const dueDay = Number(reactivationForm.vencimento_dia);
    if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) {
      setActionError("Informe o dia de vencimento recorrente entre 1 e 31.");
      return;
    }
    if (!window.confirm(`Será criado um novo contrato para ${aluno?.nome}, com vencimento inicial 30 dias após a data informada. A matrícula ${reactivationForm.cobrar_matricula ? "será cobrada" : "não será cobrada"}. Confirmar?`)) return;
    setWorking(true); setActionError(""); setActionNotice("");
    try {
      const created = await reactivateAluno(id, {
        responsavel_financeiro_id: reactivationForm.responsavel_financeiro_id,
        data_contrato: reactivationForm.data_contrato,
        tipo_vaga: reactivationForm.tipo_vaga,
        mensalidade_valor: (monthlyCents / 100).toFixed(2),
        matricula_valor: ((enrollmentCents ?? 0) / 100).toFixed(2),
        cobrar_matricula: reactivationForm.cobrar_matricula,
        vencimento_dia: dueDay,
      });
      setActionNotice(`Reativação confirmada pela API. Novo contrato nº ${created.numero_contrato}; primeiro vencimento ${formatDate(created.primeiro_vencimento)}.`);
      setReactivationOpen(false); setReactivationForm(null); setRefresh((value) => value + 1);
    } catch (reason) {
      setActionError(reason instanceof ApiError ? reason.message : "Não foi possível confirmar a reativação pela API.");
    } finally { setWorking(false); }
  }

  if (profile?.role === "MONITOR" && aluno && !loading && !error) return <>
    <PageHeader eyebrow="CADASTRO" title={aluno.nome} description="Ficha cadastral do acolhido." />
    <section className="management-panel person-detail-panel"><div className="panel-heading"><div><span className="management-eyebrow">DADOS CADASTRAIS</span><h2>{aluno.nome}</h2></div></div>
      <div className="person-detail-grid"><div><span>CPF</span><strong>{aluno.cpf ?? "Não informado"}</strong></div><div><span>RG</span><strong>{aluno.rg ?? "Não informado"}</strong></div><div><span>Data de nascimento</span><strong>{formatDate(aluno.data_nascimento ?? null)}</strong></div><div><span>Telefone</span><strong>{aluno.telefone ?? "Não informado"}</strong></div><div className="wide"><span>Endereço</span><strong>{personAddress(aluno)}</strong></div></div>
    </section>
    <p className="management-panel">Informações financeiras, responsáveis financeiros e encerramento de contratos são restritos ao perfil Diretor.</p>
  </>;

  return <>
    <PageHeader eyebrow="ACOLHIDOS / FICHA" title={aluno?.nome ?? (cadastro ? `Contrato nº ${cadastro.numero_contrato}` : "Ficha do acolhido")} description="Dados cadastrais, situação do vínculo, responsáveis e histórico financeiro carregados da API." action={<ButtonLink href="/acolhidos" secondary>Voltar à lista</ButtonLink>} />
    {cadastro && <div className="payment-result payment-result-success" role="status"><strong>Cadastro concluído e confirmado pela API.</strong><span>Contrato nº {cadastro.numero_contrato}; primeiro vencimento {formatDate(cadastro.primeiro_vencimento)}. As opções do documento consultam o contrato salvo.</span><div className="contract-actions"><ButtonLink href={`/contratos/${cadastro.contrato_id}/documento`} secondary>Visualizar contrato</ButtonLink><ButtonLink href={`/contratos/${cadastro.contrato_id}/documento?imprimir=1`} secondary>Imprimir contrato</ButtonLink><ButtonLink href={`/contratos/${cadastro.contrato_id}/documento?imprimir=1`}>Baixar contrato em PDF</ButtonLink></div></div>}
    {actionNotice && <div className="payment-result payment-result-success" role="status">{actionNotice}</div>}
    {actionError && <div className="payment-result payment-result-error" role="alert">{actionError}</div>}
    {loading && <LoadingState label="Carregando ficha do aluno..." />}{error && <ErrorState message={error} onRetry={() => setRefresh(value => value + 1)} />}
    {aluno && <>
      <section className="management-panel person-detail-panel"><div className="panel-heading"><div><span className="management-eyebrow">DADOS CADASTRAIS</span><h2>{aluno.nome}</h2></div><span className={`panel-pill ${aluno.situacao === "ativo" ? "panel-pill-integrated" : ""}`}>{aluno.situacao === "ativo" ? "Vínculo ativo" : aluno.situacao === "encerrado" ? "Vínculo encerrado" : "Sem vínculo ativo"}</span></div>
        <div className="person-detail-grid"><div><span>CPF</span><strong>{aluno.cpf ?? "Não informado"}</strong></div><div><span>RG</span><strong>{aluno.rg ?? "Não informado"}</strong></div><div><span>Data de nascimento</span><strong>{formatDate(aluno.data_nascimento ?? null)}</strong></div><div><span>Telefone</span><strong>{aluno.telefone ?? "Não informado"}</strong></div><div className="wide"><span>Endereço</span><strong>{personAddress(aluno)}</strong></div></div>
      </section>

      <section className="management-panel"><div className="panel-heading"><div><span className="management-eyebrow">VÍNCULOS</span><h2>Contratos e histórico</h2></div>{activeContract && <button type="button" className="management-button management-button-secondary" disabled={working} onClick={handleClose}>{working ? "Processando…" : "Encerrar contrato"}</button>}{!activeContract && aluno.situacao === "encerrado" && <button type="button" className="management-button" disabled={working} onClick={startReactivation}>Reativar aluno</button>}</div>
        {aluno.contratos.length ? <div className="contract-history-grid">{aluno.contratos.map((contract) => <article className="contract-history-card" key={contract.id}><div className="panel-heading"><div><span className="management-eyebrow">CONTRATO Nº {contract.numero_contrato}</span><strong>{contract.situacao}</strong></div><div className="contract-actions"><ButtonLink href={`/contratos/${contract.id}`} secondary>Detalhes</ButtonLink><ButtonLink href={`/contratos/${contract.id}/documento`} secondary>Visualizar contrato</ButtonLink><ButtonLink href={`/contratos/${contract.id}/documento?imprimir=1`} secondary>Imprimir / PDF</ButtonLink></div></div><div className="person-detail-grid"><div><span>Data do contrato</span><strong>{formatDate(contract.data_contrato)}</strong></div><div><span>Tipo de vaga</span><strong>{contract.tipo_vaga}</strong></div><div><span>Mensalidade</span><strong>{money(contract.mensalidade_valor)}</strong></div><div><span>Matrícula</span><strong>{contract.cobrar_matricula ? money(contract.matricula_valor) : "Não cobrada"}</strong></div><div><span>Primeiro vencimento</span><strong>{formatDate(contract.primeiro_vencimento)}</strong></div><div><span>Vencimento recorrente</span><strong>{contract.vencimento_dia ?? "Não informado"}</strong></div></div>
          {contract.responsavel_financeiro && <div className="responsible-card"><span className="management-eyebrow">RESPONSÁVEL FINANCEIRO / CONTRATANTE</span><h3>{contract.responsavel_financeiro.nome}</h3><div className="person-detail-grid"><div><span>CPF</span><strong>{contract.responsavel_financeiro.cpf ?? "Não informado"}</strong></div><div><span>RG</span><strong>{contract.responsavel_financeiro.rg ?? "Não informado"}</strong></div><div><span>Telefone</span><strong>{contract.responsavel_financeiro.telefone ?? "Não informado"}</strong></div><div className="wide"><span>Endereço</span><strong>{personAddress(contract.responsavel_financeiro)}</strong></div></div></div>}
        </article>)}</div> : <EmptyState title="Sem contratos relacionados" detail="A API não retornou contratos para este acolhido." />}
      </section>

      {reactivationOpen && reactivationForm && <section className="management-panel reactivation-panel"><div className="panel-heading"><div><span className="management-eyebrow">NOVO VÍNCULO</span><h2>Reativar com novo contrato</h2><p>O contrato anterior e as cobranças históricas serão mantidos.</p></div><button className="management-button management-button-secondary" type="button" disabled={working} onClick={() => { setReactivationOpen(false); setReactivationForm(null); }}>Cancelar</button></div>
        <p>Responsável reutilizado: <strong>{latestEnded?.responsavel_financeiro?.nome}</strong>. Matrícula começa sem cobrança para evitar repetição automática; confirme se deseja uma nova cobrança.</p>
        <form className="reactivation-form" onSubmit={submitReactivation}>
          <label>Data do novo contrato<input type="date" max={todayIso()} required value={reactivationForm.data_contrato} onChange={(event) => setReactivationForm({ ...reactivationForm, data_contrato: event.target.value })} /></label>
          <label>Tipo de vaga<select value={reactivationForm.tipo_vaga} onChange={(event) => setReactivationForm({ ...reactivationForm, tipo_vaga: event.target.value as ReactivationForm["tipo_vaga"] })}><option value="SOCIAL">Social</option><option value="PARTICULAR">Particular</option></select></label>
          <label>Mensalidade (R$)<input inputMode="decimal" required value={reactivationForm.mensalidade_valor} onChange={(event) => setReactivationForm({ ...reactivationForm, mensalidade_valor: event.target.value })} /></label>
          <label>Dia de vencimento<input type="number" min="1" max="31" required value={reactivationForm.vencimento_dia} onChange={(event) => setReactivationForm({ ...reactivationForm, vencimento_dia: event.target.value })} /></label>
          <label className="reactivation-checkbox"><input type="checkbox" checked={reactivationForm.cobrar_matricula} onChange={(event) => setReactivationForm({ ...reactivationForm, cobrar_matricula: event.target.checked })} /> Cobrar matrícula neste novo contrato</label>
          {reactivationForm.cobrar_matricula && <label>Valor da matrícula (R$)<input inputMode="decimal" required value={reactivationForm.matricula_valor} onChange={(event) => setReactivationForm({ ...reactivationForm, matricula_valor: event.target.value })} /></label>}
          <div className="reactivation-actions"><button className="management-button" disabled={working}>{working ? "Salvando…" : "Confirmar novo contrato"}</button></div>
        </form>
      </section>}

      <section className="management-panel"><div className="panel-heading"><div><span className="management-eyebrow">FINANCEIRO</span><h2>Mensalidades e pagamentos</h2></div></div>{charges.length ? <div className="table-scroll"><table><thead><tr><th>Competência</th><th>Vencimento</th><th>Valor devido</th><th>Pago</th><th>Status</th></tr></thead><tbody>{charges.map((charge) => <tr key={charge.id}><td>{charge.competencia.slice(0, 7)}</td><td>{formatDate(charge.data_vencimento)}</td><td>{money(charge.valor_devido)}</td><td>{charge.valor_pago == null ? "—" : money(charge.valor_pago)}</td><td>{charge.status}</td></tr>)}</tbody></table></div> : <p>{loading ? "Carregando movimentações…" : "Nenhuma mensalidade foi retornada pela API."}</p>}</section>
    </>}
  </>;
}
