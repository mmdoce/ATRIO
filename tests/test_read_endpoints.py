from __future__ import annotations

import unittest
from unittest.mock import patch
from uuid import UUID

from fastapi.testclient import TestClient

from app import main
from app.auth import CurrentUser, authenticated_user


class ReadEndpointTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(main.app)
        self.previous_supabase = main.supabase
        main.supabase = object()  # service is mocked; no network/database connection is made
        main.app.dependency_overrides[authenticated_user] = lambda: CurrentUser("00000000-0000-4000-8000-000000000001", "test@example.invalid", "DIRETOR")

    def tearDown(self) -> None:
        main.supabase = self.previous_supabase
        main.app.dependency_overrides.clear()

    def test_alunos_lista_vazia_e_encaminha_filtros_e_paginacao(self) -> None:
        with patch.object(main.read_services, "list_alunos", return_value={"items": [], "total": 0, "limit": 10, "offset": 20}) as read:
            response = self.client.get("/alunos", params={"q": "Nome Fictício", "situacao": "ativo", "limit": 10, "offset": 20})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"items": [], "total": 0, "limit": 10, "offset": 20})
        args = read.call_args.args
        self.assertEqual(args[1:], (10, 20, "Nome Fictício", None, "ativo"))

    def test_alunos_aceita_filtro_de_vinculo_encerrado(self) -> None:
        with patch.object(main.read_services, "list_alunos", return_value={"items": [], "total": 0, "limit": 20, "offset": 0}) as read:
            response = self.client.get("/alunos", params={"situacao": "encerrado"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(read.call_args.args[-1], "encerrado")

    def test_uuid_invalido_rejeitado_antes_da_consulta(self) -> None:
        with patch.object(main.read_services, "get_aluno") as read:
            response = self.client.get("/alunos/nao-e-uuid")
        self.assertEqual(response.status_code, 422)
        read.assert_not_called()

    def test_aluno_inexistente_retorna_404(self) -> None:
        with patch.object(main.read_services, "get_aluno", return_value=None):
            response = self.client.get("/alunos/00000000-0000-4000-8000-000000000001")
        self.assertEqual(response.status_code, 404)

    def test_ficha_inclui_responsavel_financeiro_relacionado(self) -> None:
        detail = {
            "id": "00000000-0000-4000-8000-000000000001", "nome": "Acolhido Fictício",
            "ativo": True, "situacao": "ativo", "contratos": [{
                "id": "00000000-0000-4000-8000-000000000002", "numero_contrato": 11,
                "data_contrato": "2026-10-01", "tipo_vaga": "SOCIAL", "mensalidade_valor": "100.00",
                "matricula_valor": "0.00", "cobrar_matricula": False, "situacao": "ativo",
                "primeiro_vencimento": "2026-10-31", "responsavel_financeiro": {
                    "id": "00000000-0000-4000-8000-000000000003", "nome": "Responsável Fictício",
                    "cpf": "00000000000", "telefone": "11900000000", "rg": "RG-TESTE",
                },
            }],
        }
        with patch.object(main.read_services, "get_aluno", return_value=detail):
            response = self.client.get("/alunos/00000000-0000-4000-8000-000000000001")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["contratos"][0]["responsavel_financeiro"]["nome"], "Responsável Fictício")
        self.assertEqual(response.json()["contratos"][0]["responsavel_financeiro"]["cpf"], "00000000000")

    def test_contratos_filtra_aluno_e_situacao(self) -> None:
        with patch.object(main.read_services, "list_contratos", return_value={"items": [], "total": 0, "limit": 50, "offset": 0}) as read:
            response = self.client.get("/contratos", params={"aluno_id": "00000000-0000-4000-8000-000000000001", "situacao": "encerrado"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(read.call_args.args[3:], (UUID("00000000-0000-4000-8000-000000000001"), "encerrado"))

    def test_contrato_inexistente_retorna_404(self) -> None:
        with patch.object(main.read_services, "get_contrato", return_value=None):
            response = self.client.get("/contratos/00000000-0000-4000-8000-000000000002")
        self.assertEqual(response.status_code, 404)

    def test_competencia_invalida_retorna_422(self) -> None:
        with patch.object(main.read_services, "list_mensalidades") as read:
            response = self.client.get("/mensalidades?competencia=2026-13")
        self.assertEqual(response.status_code, 422)
        read.assert_not_called()

    def test_filtros_mensalidade_sao_convertidos(self) -> None:
        with patch.object(main.read_services, "list_mensalidades", return_value={"items": [], "total": 0, "limit": 25, "offset": 0}) as read:
            response = self.client.get("/mensalidades?competencia=2026-10&status=pendente&limit=25")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(read.call_args.args[1:], (25, 0, __import__("datetime").date(2026, 10, 1), "pendente", None, None))

    def test_periodo_invertido_em_pagamentos_retorna_422(self) -> None:
        with patch.object(main.read_services, "list_pagamentos") as read:
            response = self.client.get("/pagamentos?data_inicio=2026-10-10&data_fim=2026-10-09")
        self.assertEqual(response.status_code, 422)
        read.assert_not_called()

    def test_falha_de_banco_tem_resposta_generica_sem_detalhe_interno(self) -> None:
        with patch.object(main.read_services, "list_contratos", side_effect=RuntimeError("cpf=00000000000 token=nao-exibir")):
            response = self.client.get("/contratos")
        self.assertEqual(response.status_code, 502)
        self.assertNotIn("cpf", response.text.lower())
        self.assertNotIn("token", response.text.lower())

    def test_dashboard_retorna_payload_tipado(self) -> None:
        payload = {"alunos_ativos": 0, "contratos_ativos": 0, "mensalidades_pendentes": 0,
                   "pagamentos_registrados": 0, "proximos_vencimentos": [{
                       "id": "00000000-0000-4000-8000-000000000004",
                       "aluno_id": "00000000-0000-4000-8000-000000000001",
                       "aluno_nome": "Acolhido Fictício", "contrato_id": "00000000-0000-4000-8000-000000000002",
                       "numero_contrato": 10, "competencia": "2026-10-01", "tipo_cobranca": "MENSALIDADE",
                       "data_vencimento": "2026-10-30", "valor_devido": "150.00", "status": "pendente",
                   }],
                   "resumo_financeiro_mes": {"competencia": "2026-10", "valor_recebido": "0", "valor_em_aberto": "0"}}
        with patch.object(main.read_services, "dashboard_indicadores", return_value=payload):
            response = self.client.get("/dashboard/indicadores")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["alunos_ativos"], 0)
        self.assertEqual(response.json()["proximos_vencimentos"][0]["competencia"], "2026-10-01")


if __name__ == "__main__":
    unittest.main()
