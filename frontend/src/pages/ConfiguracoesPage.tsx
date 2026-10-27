import { useEffect, useState } from "react";

import { getApiHealth } from "../api";
import { PageHeader } from "../components/PagePrimitives";

export default function ConfiguracoesPage() {
  const [state, setState] = useState<"checking" | "online" | "offline">("checking");
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  useEffect(() => {
    let active = true;
    getApiHealth().then(() => { if (active) { setState("online"); setLastChecked(new Date()); } }).catch(() => {
      if (active) { setState("offline"); setLastChecked(new Date()); }
    });
    return () => { active = false; };
  }, []);

  return <>
    <PageHeader eyebrow="SISTEMA" title="Configurações" description="Informações de conexão e ambiente desta aplicação." />
    <section className="settings-grid">
      <article className="management-panel settings-card"><span className="management-eyebrow">APLICAÇÃO</span><h2>Átrio</h2><p>Gestão de acolhimento, contratos e financeiro.</p><div className="settings-row"><span>Interface</span><strong>Frontend web</strong></div><div className="settings-row"><span>API</span><strong>FastAPI</strong></div><div className="settings-row"><span>Armazenamento de dados</span><strong>Backend da aplicação</strong></div></article>
      <article className="management-panel settings-card"><span className="management-eyebrow">CONECTIVIDADE</span><h2>Estado da API</h2><div className={`connection-state connection-${state}`}><span />{state === "online" ? "API acessível" : state === "offline" ? "API indisponível" : "Verificando conexão"}</div><p>O endpoint de saúde confirma apenas que a API responde; não verifica a conexão com o banco.</p><div className="settings-row"><span>Última verificação</span><strong>{lastChecked ? lastChecked.toLocaleString("pt-BR") : "Em andamento"}</strong></div></article>
    </section>
    <aside className="security-notice"><span aria-hidden="true">⌑</span><div><strong>Proteção de dados</strong><p>Não coloque chaves ou tokens nesta interface. A API ainda requer autenticação e autorização antes do uso com dados reais.</p></div></aside>
  </>;
}
