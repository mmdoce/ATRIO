import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { getApiHealth } from "../api";
import { useAuth } from "../auth";
import { Icon, type IconName } from "./Icon";
import { LogoAtrio } from "./LogoAtrio";

const navigation: { to: string; label: string; icon: IconName; group: string; directorOnly?: boolean }[] = [
  { to: "/dashboard", label: "Visão geral", icon: "dashboard", group: "Principal", directorOnly: true },
  { to: "/acolhidos", label: "Alunos", icon: "users", group: "Cadastros" },
  { to: "/contratos", label: "Contratos", icon: "contract", group: "Cadastros" },
  { to: "/financeiro", label: "Financeiro", icon: "wallet", group: "Financeiro", directorOnly: true },
  { to: "/pagamentos", label: "Pagamentos", icon: "receipt", group: "Financeiro", directorOnly: true },
  { to: "/usuarios", label: "Usuários e acessos", icon: "shield", group: "Administração", directorOnly: true },
];
const pageTitles: Record<string, string> = {
  "/dashboard": "Visão geral", "/acolhidos": "Alunos", "/acolhidos/novo": "Novo aluno",
  "/contratos": "Contratos", "/financeiro": "Financeiro", "/pagamentos": "Pagamentos",
  "/configuracoes": "Configurações", "/usuarios": "Usuários e acessos",
};

export function AppLayout() {
  const [apiState, setApiState] = useState<"checking" | "online" | "offline">("checking");
  const [menuOpen, setMenuOpen] = useState(false);
  const [compact, setCompact] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  useEffect(() => {
    let active = true;
    getApiHealth().then(() => { if (active) setApiState("online"); }).catch(() => { if (active) setApiState("offline"); });
    return () => { active = false; };
  }, [location.pathname]);

  const basePath = location.pathname === "/acolhidos/novo" ? location.pathname : location.pathname.startsWith("/acolhidos/") ? "/acolhidos" : location.pathname;
  const title = pageTitles[basePath] ?? "Detalhes do cadastro";
  const visibleItems = navigation.filter(item => !item.directorOnly || profile?.role === "DIRETOR");
  const groups = [...new Set(visibleItems.map(item => item.group))];
  const initials = profile?.email?.slice(0, 1).toUpperCase() || "A";

  return <div className={`management-shell ${compact ? "sidebar-compact" : ""}`}>
    <button className="mobile-menu-toggle" type="button" aria-label={menuOpen ? "Fechar navegação" : "Abrir navegação"} aria-expanded={menuOpen} onClick={() => setMenuOpen(open => !open)}><Icon name={menuOpen ? "close" : "menu"} size={22} /></button>
    {menuOpen && <button className="sidebar-backdrop" aria-label="Fechar navegação" onClick={() => setMenuOpen(false)} />}
    <aside className={`management-sidebar ${menuOpen ? "sidebar-open" : ""}`} aria-label="Menu do sistema">
      <NavLink className="management-brand" to={profile?.role === "DIRETOR" ? "/dashboard" : "/acolhidos"} onClick={() => setMenuOpen(false)}>
        <LogoAtrio size={42} showName={false} /><span className="management-brand-copy"><strong>Átrio</strong><small>SISTEMA DE GESTÃO</small></span>
      </NavLink>
      <nav className="management-nav" aria-label="Navegação principal">
        {groups.map(group => <section className="management-nav-group" key={group} aria-label={group}>
          <span className="management-nav-label">{group}</span>
          {visibleItems.filter(item => item.group === group).map(item => <NavLink key={item.to} title={compact ? item.label : undefined} to={item.to} onClick={() => setMenuOpen(false)} className={({ isActive }) => `management-nav-link ${isActive || (item.to === "/acolhidos" && location.pathname.startsWith("/acolhidos/")) ? "is-active" : ""}`}><Icon name={item.icon} size={19} /><span>{item.label}</span></NavLink>)}
        </section>)}
      </nav>
      <div className="management-sidebar-bottom">
        <NavLink title={compact ? "Configurações" : undefined} to="/configuracoes" onClick={() => setMenuOpen(false)} className={({ isActive }) => `management-nav-link ${isActive ? "is-active" : ""}`}><Icon name="settings" size={19} /><span>Configurações</span></NavLink>
        <div className="management-profile"><span className="management-profile-mark">{initials}</span><span className="management-profile-copy"><strong>{profile?.email || "Equipe Átrio"}</strong><small>{profile?.role === "DIRETOR" ? "Diretor" : "Monitor"}</small></span><button type="button" className="auth-logout" title="Sair do sistema" aria-label="Sair do sistema" onClick={async () => { await signOut(); navigate("/login", { replace: true }); }}><Icon name="logout" size={18} /></button></div>
      </div>
      <button type="button" className="sidebar-collapse-toggle" aria-label={compact ? "Expandir menu" : "Recolher menu"} aria-pressed={compact} onClick={() => setCompact(value => !value)}><Icon name="chevron" size={17} /><span>{compact ? "Expandir menu" : "Recolher menu"}</span></button>
    </aside>
    <div className="management-workspace">
      <header className="management-topbar"><div className="management-breadcrumb"><span>Átrio</span><Icon name="chevron" size={15} /><strong>{title}</strong></div>
        <div className="management-topbar-actions"><div className={`management-api-status api-${apiState}`} role="status"><span />{apiState === "online" ? "Sistema conectado" : apiState === "offline" ? "Conexão indisponível" : "Conferindo conexão"}</div></div>
      </header>
      <main className="management-content"><Outlet /></main>
      <footer className="management-footer"><span>Átrio · Gestão de acolhimento</span><span>Dados atualizados pela API do sistema</span></footer>
    </div>
  </div>;
}
