import { BrowserRouter, Link, Navigate, Outlet, Route, Routes, useNavigate } from "react-router-dom";

import type { CadastroResponse } from "./api";
import { AuthProvider, useAuth } from "./auth";
import { AppLayout } from "./components/AppLayout";
import { AcolhidosPage, AcolhidoDetalhePage } from "./pages/AcolhidosPage";
import CadastroPage from "./pages/CadastroPage";
import { ContratoDetalhePage, ContratosPage } from "./pages/ContratosPage";
import ConfiguracoesPage from "./pages/ConfiguracoesPage";
import DashboardPage from "./pages/DashboardPage";
import FinanceiroPage from "./pages/FinanceiroPage";
import PagamentosPage from "./pages/PagamentosPage";
import ContratoDocumentoPage from "./pages/ContratoDocumentoPage";
import { LoginPage, PasswordResetPage, RecoveryPage } from "./pages/AuthPages";
import UsersPage from "./pages/UsersPage";

export default function App() {
  return <AuthProvider><BrowserRouter><Routes>
    <Route path="login" element={<LoginPage />} />
    <Route path="recuperar-senha" element={<RecoveryPage />} />
    <Route path="redefinir-senha" element={<PasswordResetPage />} />
    <Route element={<ProtectedLayout />}>
      <Route index element={<HomeRedirect />} />
      <Route element={<RoleGate role="DIRETOR" />}><Route path="dashboard" element={<DashboardPage />} /><Route path="usuarios" element={<UsersPage />} /></Route>
      <Route path="acolhidos" element={<AcolhidosPage />} />
      <Route path="acolhidos/novo" element={<CadastroRoute />} />
      <Route path="acolhidos/:id" element={<AcolhidoDetalhePage />} />
      <Route path="contratos" element={<ContratosPage />} />
      <Route path="contratos/:id/documento" element={<ContratoDocumentoPage />} />
      <Route path="contratos/:id" element={<ContratoDetalhePage />} />
      <Route element={<RoleGate role="DIRETOR" />}><Route path="financeiro" element={<FinanceiroPage />} /><Route path="pagamentos" element={<PagamentosPage />} /></Route>
      <Route path="configuracoes" element={<ConfiguracoesPage />} />
      <Route path="*" element={<NotFound />} />
    </Route>
  </Routes></BrowserRouter></AuthProvider>;
}

function ProtectedLayout() {
  const { loading, profile } = useAuth();
  if (loading) return <main className="auth-page" role="status">Validando sua sessão…</main>;
  if (!profile) return <Navigate to="/login" replace />;
  return <AppLayout />;
}

function RoleGate({ role }: { role: "DIRETOR" }) {
  const { profile } = useAuth();
  return profile?.role === role ? <Outlet /> : <Navigate to="/acolhidos" replace />;
}

function HomeRedirect() {
  const { profile } = useAuth();
  return <Navigate to={profile?.role === "DIRETOR" ? "/dashboard" : "/acolhidos"} replace />;
}

function CadastroRoute() {
  const navigate = useNavigate();
  function handleCreated(cadastro: CadastroResponse) {
    navigate(`/acolhidos/${cadastro.aluno_id}`, { replace: true, state: { cadastro } });
  }
  return <CadastroPage onCreated={handleCreated} />;
}

function NotFound() {
  return <section className="management-panel not-found"><span className="management-eyebrow">PÁGINA NÃO ENCONTRADA</span><h1>Este caminho não existe</h1><p>Escolha uma seção no menu para continuar.</p><Link className="management-button" to="/dashboard">Ir para visão geral</Link></section>;
}
