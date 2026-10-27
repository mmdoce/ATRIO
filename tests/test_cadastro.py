from __future__ import annotations

import unittest
from datetime import date, timedelta
from pathlib import Path

from fastapi.testclient import TestClient
from pydantic import ValidationError

from app import main
from app.schemas import CadastroAlunoCreate


ROOT = Path(__file__).resolve().parents[1]


def payload(**contract_changes: object) -> dict:
    contract = {
        "data_contrato": date.today().isoformat(),
        "tipo_vaga": "SOCIAL",
        "mensalidade_valor": "1250.00",
        "matricula_valor": "300.00",
        "cobrar_matricula": True,
        "vencimento_dia": 25,
    }
    contract.update(contract_changes)
    person = {
        "nome": "Pessoa Exemplo",
        "rg": "RG-0001",
        "cpf": "529.982.247-25",
        "telefone": "11987654321",
        "cep": "01001000",
        "endereco": "Rua das Flores, 10",
        "bairro": "Centro",
        "cidade": "São Paulo",
        "estado": "sp",
    }
    return {
        "aluno": {**person, "data_nascimento": "1990-01-01"},
        "responsavel_financeiro": {**person, "nome": "Responsável Exemplo", "cpf": "111.444.777-35"},
        "contrato": contract,
    }


class FakeResponse:
    def __init__(self, data: dict):
        self.data = data


class FakeRpc:
    def __init__(self, client: "FakeClient", name: str, args: dict):
        self.client, self.name, self.args = client, name, args

    def execute(self) -> FakeResponse:
        self.client.calls.append((self.name, self.args))
        if self.client.error:
            raise self.client.error
        if self.name == "encerrar_contrato":
            return FakeResponse({"contrato_id": self.args["p_contrato_id"], "situacao": "encerrado"})
        if self.name == "baixar_mensalidade":
            return FakeResponse({"status": "paga"})
        due = date.fromisoformat(self.args["p_data_contrato"]) + timedelta(days=30)
        return FakeResponse({
            "aluno_id": "00000000-0000-0000-0000-000000000001",
            "responsavel_financeiro_id": "00000000-0000-0000-0000-000000000002",
            "contrato_id": "00000000-0000-0000-0000-000000000003",
            "numero_contrato": 101,
            "primeiro_vencimento": due.isoformat(),
            "mensalidade_id": "00000000-0000-0000-0000-000000000004",
            "matricula_id": "00000000-0000-0000-0000-000000000005" if self.args["p_cobrar_matricula"] else None,
            "situacao": "ativo",
        })


class FakeClient:
    def __init__(self, error: Exception | None = None):
        self.error, self.calls = error, []

    def rpc(self, name: str, args: dict) -> FakeRpc:
        return FakeRpc(self, name, args)


class CadastroApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = FakeClient()
        self.previous = main.supabase
        main.supabase = self.client  # type: ignore[assignment]
        self.http = TestClient(main.app)

    def tearDown(self) -> None:
        main.supabase = self.previous

    def test_cadastro_de_aluno_responsavel_e_contrato(self) -> None:
        response = self.http.post("/alunos", json=payload())
        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertEqual(body["numero_contrato"], 101)
        self.assertEqual(body["mensalidade_valor_por_extenso"], "mil duzentos e cinquenta reais")
        self.assertEqual(len(self.client.calls), 1)
        self.assertEqual(self.client.calls[0][0], "cadastrar_aluno_contrato")
        args = self.client.calls[0][1]
        self.assertEqual(
            set(args),
            {
                "p_aluno", "p_responsavel", "p_data_contrato", "p_tipo_vaga",
                "p_mensalidade_valor", "p_matricula_valor", "p_cobrar_matricula", "p_vencimento_dia",
            },
        )
        self.assertEqual(
            set(args["p_aluno"]),
            {"nome", "rg", "cpf", "telefone", "cep", "endereco", "bairro", "cidade", "estado", "data_nascimento"},
        )
        self.assertEqual(
            set(args["p_responsavel"]),
            {"nome", "rg", "cpf", "telefone", "cep", "endereco", "bairro", "cidade", "estado"},
        )
        self.assertNotEqual(
            args["p_aluno"]["cpf"],
            args["p_responsavel"]["cpf"],
        )

    def test_limites_monetarios_minimo_maximo_e_sem_arredondamento(self) -> None:
        minimum = self.http.post(
            "/alunos", json=payload(mensalidade_valor="0.01", matricula_valor="0.00", cobrar_matricula=False)
        )
        self.assertEqual(minimum.status_code, 201)
        maximum = self.http.post(
            "/alunos", json=payload(mensalidade_valor="99999999.99", matricula_valor="99999999.99")
        )
        self.assertEqual(maximum.status_code, 201)
        self.assertEqual(len(self.client.calls), 2)

        over_limit = self.http.post("/alunos", json=payload(mensalidade_valor="100000000.00"))
        excess_precision = self.http.post("/alunos", json=payload(mensalidade_valor="1.005"))
        self.assertEqual(over_limit.status_code, 422)
        self.assertEqual(excess_precision.status_code, 422)
        self.assertEqual(len(self.client.calls), 2, "valores inválidos não devem chamar a RPC")

    def test_limites_monetarios_da_matricula_e_baixa_validam_antes_do_banco(self) -> None:
        invalid_enrollment = self.http.post("/alunos", json=payload(matricula_valor="100000000.00"))
        excess_scale_enrollment = self.http.post("/alunos", json=payload(matricula_valor="1.005"))
        invalid_payment = self.http.post(
            "/mensalidades/baixa",
            data={
                "mensalidade_id": "00000000-0000-0000-0000-000000000004",
                "valor_pago": "100000000.00",
                "forma_pagamento": "pix",
            },
        )
        self.assertEqual(invalid_enrollment.status_code, 422)
        self.assertEqual(excess_scale_enrollment.status_code, 422)
        self.assertEqual(invalid_payment.status_code, 422)
        self.assertEqual(self.client.calls, [])

    def test_pagamento_minimo_e_maximo_aceitos_pelo_schema(self) -> None:
        common = {
            "mensalidade_id": "00000000-0000-0000-0000-000000000004",
            "forma_pagamento": "pix",
        }
        minimum = self.http.post("/mensalidades/baixa", data={**common, "valor_pago": "0.01"})
        maximum = self.http.post("/mensalidades/baixa", data={**common, "valor_pago": "99999999.99"})
        self.assertEqual(minimum.status_code, 200)
        self.assertEqual(maximum.status_code, 200)
        self.assertEqual([name for name, _ in self.client.calls], ["baixar_mensalidade", "baixar_mensalidade"])

    def test_rpc_rejeitada_para_mensalidade_ausente_duplicada_ou_com_vinculo_invalido(self) -> None:
        # O mock valida a resposta HTTP; a garantia SQL é exercitada no arquivo
        # tests/sql/test_cadastro_atomic.sql, que não é executado nesta etapa.
        for failure in (
            "Esperada exatamente uma mensalidade recorrente; encontradas 0",
            "Esperada exatamente uma mensalidade recorrente; encontradas 2",
            "A mensalidade recorrente criada pelo trigger diverge dos dados do contrato",
        ):
            with self.subTest(failure=failure):
                self.client.error = RuntimeError(failure)
                response = self.http.post("/alunos", json=payload())
                self.assertEqual(response.status_code, 500)
                self.assertNotIn(failure, response.text)
                self.client.error = None

    def test_rpc_ausente_responde_503_e_registra_traceback_sem_dados_pessoais(self) -> None:
        self.client.error = RuntimeError(
            'PGRST202 schema cache; p_aluno={"nome":"Nome Fictício Confidencial",'
            '"cpf":"529.982.247-25","telefone":"11987654321","cep":"01001-000"}'
        )
        with self.assertLogs("app.main", level="ERROR") as captured:
            response = self.http.post("/alunos", json=payload())

        self.assertEqual(response.status_code, 503)
        self.assertNotIn("Nome Fictício Confidencial", response.text)
        self.assertNotIn("529.982.247-25", response.text)
        log_output = "\n".join(captured.output)
        self.assertIn("PGRST202", log_output)
        self.assertIn("Traceback (most recent call last)", log_output)
        self.assertIn("RuntimeError", log_output)
        self.assertNotIn("Nome Fictício Confidencial", log_output)
        self.assertNotIn("529.982.247-25", log_output)
        self.assertNotIn("11987654321", log_output)
        self.assertNotIn("01001-000", log_output)

    def test_primeiro_vencimento_30_dias_corridos(self) -> None:
        request = CadastroAlunoCreate.model_validate(payload())
        self.assertEqual((request.primeiro_vencimento - request.contrato.data_contrato).days, 30)
        response = self.http.post("/alunos", json=payload())
        self.assertEqual(response.json()["primeiro_vencimento"], request.primeiro_vencimento.isoformat())

    def test_previa_usa_data_mais_30_sem_chamar_rpc(self) -> None:
        response = self.http.post("/contratos/previa-vencimento", json={"data_contrato": "2026-10-01"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"primeiro_vencimento": "2026-10-31"})
        self.assertEqual(self.client.calls, [])

    def test_openapi_publica_schemas_de_cadastro_e_resposta(self) -> None:
        spec = main.app.openapi()
        request_ref = spec["paths"]["/alunos"]["post"]["requestBody"]["content"]["application/json"]["schema"]["$ref"]
        self.assertEqual(request_ref, "#/components/schemas/CadastroAlunoCreate")
        schema = spec["components"]["schemas"]
        self.assertEqual(
            set(schema["CadastroAlunoCreate"]["properties"]),
            {"aluno", "responsavel_financeiro", "contrato"},
        )
        self.assertIn("matricula_id", schema["CadastroAlunoResponse"]["properties"])
        self.assertIn("primeiro_vencimento", schema["PreviaVencimentoResponse"]["properties"])

    def test_cors_permite_somente_origens_locais_do_vite(self) -> None:
        allowed = self.http.options(
            "/alunos",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
        )
        denied = self.http.options(
            "/alunos",
            headers={
                "Origin": "https://example.invalid",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
        )
        self.assertEqual(allowed.headers.get("access-control-allow-origin"), "http://localhost:5173")
        self.assertNotIn("access-control-allow-origin", denied.headers)

    def test_contrato_com_cobranca_de_matricula(self) -> None:
        response = self.http.post("/alunos", json=payload(cobrar_matricula=True))
        self.assertIsNotNone(response.json()["matricula_id"])

    def test_contrato_sem_cobranca_de_matricula(self) -> None:
        response = self.http.post("/alunos", json=payload(cobrar_matricula=False))
        args = self.client.calls[0][1]
        self.assertFalse(args["p_cobrar_matricula"])
        self.assertIsNone(response.json()["matricula_id"])

    def test_dois_contratos_ativos_rejeitados_pelo_banco(self) -> None:
        self.client.error = RuntimeError("contrato ativo já existente")
        response = self.http.post("/alunos", json=payload())
        self.assertEqual(response.status_code, 409)
        self.assertNotIn("52998224725", response.text)
        sql = (ROOT / "supabase/migrations/20261026_01_alunos_contratos.sql").read_text(encoding="utf-8")
        self.assertIn("where situacao = 'ativo'", sql)

    def test_contrato_duplicado_na_rota_sucessiva_responde_409_sem_detalhe_rpc(self) -> None:
        self.client.error = RuntimeError("contrato ativo para aluno 00000000-0000-0000-0000-000000000001")
        request = {
            **payload()["contrato"],
            "aluno_id": "00000000-0000-0000-0000-000000000001",
            "responsavel_financeiro_id": "00000000-0000-0000-0000-000000000002",
        }
        response = self.http.post("/contratos", json=request)
        self.assertEqual(response.status_code, 409)
        self.assertNotIn("00000000-0000-0000-0000-000000000001", response.text)

    def test_validacao_http_nao_retorna_cpf_enviado(self) -> None:
        invalid = payload()
        invalid["aluno"]["cpf"] = "12345678900"
        response = self.http.post("/alunos", json=invalid)
        self.assertEqual(response.status_code, 422)
        self.assertNotIn("12345678900", response.text)
        self.assertNotIn('"input"', response.text)

    def test_contrato_novo_apos_encerramento_permitido_por_indice_parcial(self) -> None:
        contrato_id = "00000000-0000-0000-0000-000000000003"
        encerrado = self.http.post(f"/contratos/{contrato_id}/encerrar")
        next_contract = {
            **payload()["contrato"],
            "aluno_id": "00000000-0000-0000-0000-000000000001",
            "responsavel_financeiro_id": "00000000-0000-0000-0000-000000000002",
        }
        created = self.http.post("/contratos", json=next_contract)
        self.assertEqual(encerrado.status_code, 200)
        self.assertEqual(created.status_code, 201)
        self.assertEqual([name for name, _ in self.client.calls], ["encerrar_contrato", "cadastrar_contrato_existente"])
        sql = (ROOT / "supabase/migrations/20261026_01_alunos_contratos.sql").read_text(encoding="utf-8")
        self.assertIn("create unique index if not exists contratos_um_ativo_por_aluno_idx", sql)
        self.assertIn("where situacao = 'ativo'", sql)
        self.assertIn("'encerrado'", sql)

    def test_reativacao_chama_rpc_propria_com_novo_contrato_e_matricula_opcional(self) -> None:
        request = {
            **payload()["contrato"],
            "responsavel_financeiro_id": "00000000-0000-4000-8000-000000000002",
            "cobrar_matricula": False,
            "matricula_valor": "0.00",
        }
        response = self.http.post("/alunos/00000000-0000-4000-8000-000000000001/reativar", json=request)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["numero_contrato"], 101)
        name, args = self.client.calls[0]
        self.assertEqual(name, "reativar_aluno_contrato")
        self.assertEqual(args["p_aluno_id"], "00000000-0000-4000-8000-000000000001")
        self.assertEqual(args["p_responsavel_id"], request["responsavel_financeiro_id"])
        self.assertFalse(args["p_cobrar_matricula"])

    def test_reativacao_invalida_nao_chama_rpc(self) -> None:
        request = {
            **payload(mensalidade_valor="0.00")["contrato"],
            "responsavel_financeiro_id": "00000000-0000-4000-8000-000000000002",
        }
        response = self.http.post("/alunos/00000000-0000-4000-8000-000000000001/reativar", json=request)
        self.assertEqual(response.status_code, 422)
        self.assertEqual(self.client.calls, [])

    def test_migracao_estado_aluno_e_reativacao_atomica_preserva_historico(self) -> None:
        sql = (ROOT / "supabase/migrations/20261026_02_encerramento_reativacao.sql").read_text(encoding="utf-8")
        self.assertIn("set ativo = false", sql)
        self.assertIn("public.cadastrar_contrato_existente", sql)
        self.assertIn("set ativo = true", sql)
        self.assertIn("contratos where aluno_id = p_aluno_id and situacao = 'encerrado'", sql)
        self.assertIn("contratos where aluno_id = p_aluno_id and situacao = 'ativo'", sql)
        self.assertNotIn("delete from", sql.lower())

    def test_valor_historico_da_parcela_nao_e_atualizado_por_edicao_de_contrato(self) -> None:
        sql = (ROOT / "supabase/migrations/20261026_01_alunos_contratos.sql").read_text(encoding="utf-8")
        self.assertIn("mensalidades_contrato_competencia_tipo_uidx", sql)
        self.assertIn("v_mensalidades_encontradas <> 1", sql)
        self.assertIn("valor_devido is distinct from p_mensalidade_valor", sql)
        self.assertIn("set contrato_id = v_contrato_id, atualizado_em = now()", sql)
        self.assertIn("where id = v_mensalidade_id", sql)
        # No endpoint de edição contratual existe; cadastro inicial apenas associa a cobrança nova.
        self.assertEqual([name for name, _ in self.client.calls], [])

    def test_migracao_impede_parcelas_duplicadas_e_reaproveita_trigger(self) -> None:
        sql = (ROOT / "supabase/migrations/20261026_01_alunos_contratos.sql").read_text(encoding="utf-8")
        self.assertIn("alunos_criar_primeira_mensalidade", sql)
        self.assertIn("contrato_id, competencia, tipo_cobranca", sql)
        self.assertIn("select count(*) into v_mensalidades_encontradas", sql)
        self.assertIn("v_mensalidades_encontradas <> 1", sql)
        self.assertIn("select * into strict v_mensalidade", sql)
        self.assertIn("índice UNIQUE independente em mensalidades(aluno_id, competencia)", sql)
        self.assertIn("tests/sql/test_cadastro_atomic.sql", (ROOT / "README.md").read_text(encoding="utf-8"))

    def test_cpf_campos_obrigatorios_e_valores_invalidos(self) -> None:
        invalid_cpf = payload()
        invalid_cpf["aluno"]["cpf"] = "12345678900"
        with self.assertRaises(ValidationError):
            CadastroAlunoCreate.model_validate(invalid_cpf)
        missing_field = payload()
        del missing_field["responsavel_financeiro"]["cep"]
        with self.assertRaises(ValidationError):
            CadastroAlunoCreate.model_validate(missing_field)
        invalid_value = payload(mensalidade_valor="0")
        self.assertEqual(self.http.post("/alunos", json=invalid_value).status_code, 422)

    def test_operacao_atomica_e_falha_nao_vaza_detalhes_pessoais(self) -> None:
        self.client.error = RuntimeError("database failure for CPF 52998224725")
        response = self.http.post("/alunos", json=payload())
        self.assertEqual(response.status_code, 500)
        self.assertNotIn("52998224725", response.text)
        sql = (ROOT / "supabase/migrations/20261026_01_alunos_contratos.sql").read_text(encoding="utf-8")
        self.assertIn("begin;", sql.lower())
        self.assertIn("commit;", sql.lower())


if __name__ == "__main__":
    unittest.main()
