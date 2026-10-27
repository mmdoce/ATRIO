import { BrowserRouter, Link, Navigate, Route, Routes, useNavigate } from "react-router-dom";

import type { CadastroResponse } from "./api";
import { AppLayout } from "./components/AppLayout";
import { AcolhidosPage, AcolhidoDetalhePage } from "./pages/AcolhidosPage";
import CadastroPage from "./pages/CadastroPage";
import { ContratoDetalhePage, ContratosPage } from "./pages/ContratosPage";
import ConfiguracoesPage from "./pages/ConfiguracoesPage";
import DashboardPage from "./pages/DashboardPage";
import FinanceiroPage from "./pages/FinanceiroPage";
import PagamentosPage from "./pages/PagamentosPage";
import ContratoDocumentoPage from "./pages/ContratoDocumentoPage";

export default function App() {
  return <BrowserRouter><Routes>
    <Route element={<AppLayout />}>
      <Route index element={<Navigate to="/dashboard" replace />} />
      <Route path="dashboard" element={<DashboardPage />} />
      <Route path="acolhidos" element={<AcolhidosPage />} />
      <Route path="acolhidos/novo" element={<CadastroRoute />} />
      <Route path="acolhidos/:id" element={<AcolhidoDetalhePage />} />
      <Route path="contratos" element={<ContratosPage />} />
      <Route path="contratos/:id/documento" element={<ContratoDocumentoPage />} />
      <Route path="contratos/:id" element={<ContratoDetalhePage />} />
      <Route path="financeiro" element={<FinanceiroPage />} />
      <Route path="pagamentos" element={<PagamentosPage />} />
      <Route path="configuracoes" element={<ConfiguracoesPage />} />
      <Route path="*" element={<NotFound />} />
    </Route>
  </Routes></BrowserRouter>;
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
