from __future__ import annotations

import unittest

from fastapi.testclient import TestClient

from app.cors_config import DEFAULT_CORS_ORIGINS, parse_cors_origins
from app.main import app


class CorsConfigurationTests(unittest.TestCase):
    def test_defaults_to_local_development_origins(self) -> None:
        self.assertEqual(parse_cors_origins(None), list(DEFAULT_CORS_ORIGINS))
        self.assertEqual(parse_cors_origins("  "), list(DEFAULT_CORS_ORIGINS))

    def test_accepts_only_explicit_https_origins_and_removes_duplicates(self) -> None:
        self.assertEqual(
            parse_cors_origins("https://atrio.example, https://admin.example/, https://atrio.example"),
            ["https://atrio.example", "https://admin.example"],
        )
        self.assertEqual(parse_cors_origins("http://[::1]:5173"), ["http://[::1]:5173"])

    def test_rejects_wildcards_non_local_http_and_url_paths(self) -> None:
        for value in ("*", "https://*.vercel.app", "http://atrio.example", "https://atrio.example/app"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                parse_cors_origins(value)

    def test_preflight_allows_authorization_patch_and_local_development_origin(self) -> None:
        client = TestClient(app)
        response = client.options(
            "/admin/usuarios/00000000-0000-4000-8000-000000000001",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": "PATCH",
                "Access-Control-Request-Headers": "authorization,content-type",
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers.get("access-control-allow-origin"), "http://localhost:5173")
        self.assertIn("PATCH", response.headers.get("access-control-allow-methods", ""))
        self.assertIn("authorization", response.headers.get("access-control-allow-headers", "").lower())


if __name__ == "__main__":
    unittest.main()
