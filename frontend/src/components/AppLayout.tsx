import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

import { getApiHealth } from "../api";

const navigation = [
  { to: "/dashboard", label: "Visão geral", icon: "grid" },
  { to: "/acolhidos", label: "Acolhidos", icon: "people" },
  { to: "/contratos", label: "Contratos", icon: "file" },
  { to: "/financeiro", label: "Financeiro", icon: "chart" },
  { to: "/pagamentos", label: "Pagamentos", icon: "receipt" },
];

const pageTitles: Record<string, string> = {
  "/dashboard": "Visão geral",
  "/acolhidos": "Acolhidos",
  "/acolhidos/novo": "Novo acolhimento",
  "/contratos": "Contratos",
  "/financeiro": "Financeiro",
  "/pagamentos": "Pagamentos",
  "/configuracoes": "Configurações",
};

export function AppLayout() {
  const [apiState, setApiState] = useState<"checking" | "online" | "offline">("checking");
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    getApiHealth().then(() => { if (active) setApiState("online"); }).catch(() => { if (active) setApiState("offline"); });
    return () => { active = false; };
  }, [location.pathname]);

  const basePath = location.pathname === "/acolhidos/novo" ? location.pathname : location.pathname.startsWith("/acolhidos/") ? "/acolhidos" : location.pathname;
  const title = pageTitles[basePath] ?? "Detalhes do cadastro";

  return <div className="management-shell">
    <button className="mobile-menu-toggle" type="button" aria-label="Abrir navegação" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>☰</button>
    {menuOpen && <button className="sidebar-backdrop" aria-label="Fechar navegação" onClick={() => setMenuOpen(false)} />}
    <aside className={`management-sidebar ${menuOpen ? "sidebar-open" : ""}`}>
      <NavLink className="management-brand" to="/dashboard" onClick={() => setMenuOpen(false)}>
        <span className="management-brand-symbol">A</span><span><strong>Átrio</strong><small>GESTÃO DE ACOLHIMENTO</small></span>
      </NavLink>
      <span className="management-nav-label">MENU PRINCIPAL</span>
      <nav className="management-nav" aria-label="Navegação principal">
        {navigation.map((item) => <NavLink key={item.to} to={item.to} onClick={() => setMenuOpen(false)} className={({ isActive }) => `management-nav-link ${isActive || (item.to === "/acolhidos" && location.pathname.startsWith("/acolhidos/")) ? "is-active" : ""}`}><NavIcon name={item.icon} /><span>{item.label}</span></NavLink>)}
      </nav>
      <div className="management-sidebar-bottom">
        <NavLink to="/configuracoes" onClick={() => setMenuOpen(false)} className={({ isActive }) => `management-nav-link ${isActive ? "is-active" : ""}`}><NavIcon name="settings" /><span>Configurações</span></NavLink>
        <div className="management-profile"><span className="management-profile-mark">A</span><span><strong>Equipe Átrio</strong><small>Gestão de acolhimento</small></span></div>
      </div>
    </aside>

    <div className="management-workspace">
      <header className="management-topbar">
        <div className="management-breadcrumb"><span>Átrio</span><span>/</span><strong>{title}</strong></div>
        <div className="management-topbar-actions">
          {location.pathname === "/acolhidos" && <button className="management-button topbar-new-button" type="button" onClick={() => navigate("/acolhidos/novo")}>+ Novo acolhido</button>}
          <div className={`management-api-status api-${apiState}`}><span />{apiState === "online" ? "API acessível" : apiState === "offline" ? "API indisponível" : "Verificando conexão"}</div>
        </div>
      </header>
      <main className="management-content">
        <Outlet />
      </main>
      <footer className="management-footer"><span>Átrio · Gestão de acolhimento</span><span>Dados exibidos conforme disponibilidade da API</span></footer>
    </div>
  </div>;
}

function NavIcon({ name }: { name: string }) {
  const base = { width: 19, height: 19, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true as const };
  if (name === "grid") return <svg {...base}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>;
  if (name === "people") return <svg {...base}><circle cx="9" cy="8" r="3"/><path d="M3.5 20v-1.5A5.5 5.5 0 0 1 9 13a5.5 5.5 0 0 1 5.5 5.5V20zM16 5a3 3 0 0 1 0 6M17 13a5.5 5.5 0 0 1 3.5 5.2V20h-3"/></svg>;
  if (name === "file") return <svg {...base}><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 14h8M8 18h8"/></svg>;
  if (name === "chart") return <svg {...base}><path d="M4 19V5M4 19h17"/><path d="m7 15 4-4 3 2 5-6"/></svg>;
  if (name === "receipt") return <svg {...base}><path d="M5 3h14v18l-3-2-4 2-4-2-3 2z"/><path d="M8 8h8M8 12h8M8 16h4"/></svg>;
  return <svg {...base}><circle cx="12" cy="12" r="3"/><path d="m19 13.5 1 1.5-1.5 2.6-1.8-.5a7.7 7.7 0 0 1-1.5.9l-.3 1.9h-3l-.3-1.9a7.7 7.7 0 0 1-1.5-.9l-1.8.5L6.8 15l1-1.5a7.5 7.5 0 0 1 0-1.8l-1-1.5 1.5-2.6 1.8.5a7.7 7.7 0 0 1 1.5-.9l.3-1.9h3l.3 1.9a7.7 7.7 0 0 1 1.5.9l1.8-.5 1.5 2.6-1 1.5a7.5 7.5 0 0 1 0 1.8Z" transform="translate(-1 -1)"/></svg>;
}
