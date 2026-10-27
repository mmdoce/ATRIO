import { useEffect, useState } from "react";
import { getApiHealth } from "../api";
import { ErrorState, LoadingState, PageHeader, StatusBadge } from "../components/PagePrimitives";
import { Icon } from "../components/Icon";

export default function ConfiguraçõesPage() {
  const [state, setState] = useState<"checking" | "online" | "offline">("checking");
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true; setState("checking");
    getApiHealth().then(() => { if (active) { setState("online"); setLastChecked(new Date()); } }).catch(() => { if (active) { setState("offline"); setLastChecked(new Date()); } });
    return () => { active = false; };
  }, [refresh]);
  return <>
    <PageHeader eyebrow="SISTEMA" title="Configurações" description="Veja o estado da conexão e os recursos ativos desta aplicacao." />
    <section className="settings-grid">
      <article className="management-panel settings-card"><span className="settings-icon"><Icon name="shield" size={21} /></span><span className="management-eyebrow">APLICACAO</span><h2>Átrio</h2><p>Gestão de acolhimento, alunos, contratos e financeiro.</p><div className="settings-row"><span>Interface</span><strong>React</strong></div><div className="settings-row"><span>API</span><strong>FastAPI</strong></div><div className="settings-row"><span>Autenticacao</span><strong>Supabase Auth</strong></div></article>
      <article className="management-panel settings-card"><span className="settings-icon"><Icon name="wallet" size={21} /></span><span className="management-eyebrow">CONECTIVIDADE</span><h2>Estado da API</h2><StatusBadge status={state === "online" ? "Conectado" : state === "offline" ? "Indisponivel" : "Verificando"} /><p>O teste de saude confirma que a API responde; ele não verifica as consultas ao banco.</p><div className="settings-row"><span>Última verificação</span><strong>{lastChecked ? lastChecked.toLocaleString("pt-BR") : "Em andamento"}</strong></div><div className="settings-action">{state === "checking" ? <LoadingState label="Verificando conexão..." /> : state === "offline" ? <ErrorState message="A API não respondeu." onRetry={() => setRefresh(value => value + 1)} /> : <button className="management-button management-button-secondary" onClick={() => setRefresh(value => value + 1)}><Icon name="refresh" size={17} /> Verificar novamente</button>}</div></article>
    </section>
    <aside className="security-notice"><Icon name="shield" size={20} /><div><strong>Proteção de dados</strong><p>O acesso a alunos, contratos e dados financeiros é controlado pelo seu perfil. Nunca cole tokens ou chaves nesta tela.</p></div></aside>
  </>;
}
