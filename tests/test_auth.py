from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi.testclient import TestClient

from app import main


class FakeQuery:
    def __init__(self, profile): self.profile = profile
    def select(self, *_): return self
    def eq(self, *_): return self
    def maybe_single(self): return self
    def execute(self): return SimpleNamespace(data=self.profile)


class FakeAuth:
    def __init__(self, profile): self.profile = profile
    def get_user(self, token):
        if token != "valid-token": raise ValueError("invalid or expired token")
        return SimpleNamespace(user=SimpleNamespace(id="00000000-0000-4000-8000-000000000001", email="user@example.invalid"))


class FakeSupabase:
    def __init__(self, profile): self.auth = FakeAuth(profile); self.profile = profile
    def table(self, _): return FakeQuery(self.profile)


class AuthApiTests(unittest.TestCase):
    def setUp(self):
        self.previous = main.app.state.supabase
        self.previous_service = main.supabase
        self.client = TestClient(main.app)

    def tearDown(self):
        main.app.state.supabase = self.previous
        main.supabase = self.previous_service

    def use_profile(self, role="DIRETOR", active=True):
        main.app.state.supabase = FakeSupabase({"role": role, "active": active})

    def test_private_read_without_token_is_401(self):
        response = self.client.get("/alunos")
        self.assertEqual(response.status_code, 401)

    def test_private_write_without_token_is_401(self):
        response = self.client.post("/alunos", json={})
        self.assertEqual(response.status_code, 401)

    def test_invalid_or_expired_token_is_401(self):
        self.use_profile()
        for token in ("invalid-token", "expired-token"):
            self.assertEqual(self.client.get("/auth/me", headers={"Authorization": f"Bearer {token}"}).status_code, 401)

    def test_missing_or_inactive_profile_is_403(self):
        for profile in (None, {"role": "MONITOR", "active": False}, {"role": "UNKNOWN", "active": True}):
            main.app.state.supabase = FakeSupabase(profile)
            response = self.client.get("/auth/me", headers={"Authorization": "Bearer valid-token"})
            self.assertEqual(response.status_code, 403)

    def test_monitor_is_denied_financial_reads_and_user_management(self):
        self.use_profile("MONITOR")
        main.supabase = object()
        headers = {"Authorization": "Bearer valid-token"}
        self.assertEqual(self.client.get("/mensalidades", headers=headers).status_code, 403)
        self.assertEqual(self.client.get("/pagamentos", headers=headers).status_code, 403)
        self.assertEqual(self.client.get("/dashboard/indicadores", headers=headers).status_code, 403)
        self.assertEqual(self.client.get("/admin/usuarios", headers=headers).status_code, 403)
        with patch.object(main.read_services, "list_contratos", return_value={"items": [], "total": 0, "limit": 50, "offset": 0}) as list_contracts:
            response = self.client.get("/contratos", headers=headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(list_contracts.call_args.kwargs["created_by_user_id"], "00000000-0000-4000-8000-000000000001")
        self.assertEqual(self.client.post("/mensalidades/baixa", headers=headers, data={}).status_code, 403)

    def test_director_can_use_financial_read_route(self):
        self.use_profile("DIRETOR")
        main.supabase = object()
        with patch.object(main.read_services, "list_pagamentos", return_value={"items": [], "total": 0, "limit": 50, "offset": 0}):
            response = self.client.get("/pagamentos", headers={"Authorization": "Bearer valid-token"})
        self.assertEqual(response.status_code, 200)

    def test_user_cannot_promote_own_profile(self):
        self.use_profile("DIRETOR")
        response = self.client.patch(
            "/admin/usuarios/00000000-0000-4000-8000-000000000001",
            headers={"Authorization": "Bearer valid-token"}, json={"role": "DIRETOR"},
        )
        self.assertEqual(response.status_code, 403)


if __name__ == "__main__":
    unittest.main()
