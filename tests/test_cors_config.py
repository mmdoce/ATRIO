from __future__ import annotations

import unittest

from fastapi.testclient import TestClient

from app.cors_config import (
    DEFAULT_CORS_ORIGINS,
    VERIFIED_VERCEL_PREVIEW_ORIGIN,
    VERIFIED_VERCEL_PRODUCTION_ORIGIN,
    parse_cors_origins,
)
from app.main import app


class CorsConfigurationTests(unittest.TestCase):
    def test_defaults_to_local_development_origins(self) -> None:
        self.assertEqual(parse_cors_origins(None), list(DEFAULT_CORS_ORIGINS))
        self.assertEqual(parse_cors_origins("  "), list(DEFAULT_CORS_ORIGINS))

    def test_accepts_only_explicit_https_origins_and_removes_duplicates(self) -> None:
        self.assertEqual(
            parse_cors_origins("HTTPS://ATRIO.EXAMPLE:443/, https://admin.example/, https://atrio.example"),
            ["https://atrio.example", "https://admin.example"],
        )
        self.assertEqual(parse_cors_origins("http://[::1]:5173, http://LOCALHOST:80"), ["http://[::1]:5173", "http://localhost"])

    def test_app_keeps_local_origins_and_both_exact_vercel_origins(self) -> None:
        cors = next(middleware for middleware in app.user_middleware if middleware.cls.__name__ == "CORSMiddleware")
        self.assertEqual(
            cors.kwargs["allow_origins"],
            [*DEFAULT_CORS_ORIGINS, VERIFIED_VERCEL_PRODUCTION_ORIGIN, VERIFIED_VERCEL_PREVIEW_ORIGIN],
        )

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

    def test_preflight_allows_both_exact_vercel_origins(self) -> None:
        for origin in (VERIFIED_VERCEL_PRODUCTION_ORIGIN, VERIFIED_VERCEL_PREVIEW_ORIGIN):
            with self.subTest(origin=origin):
                response = TestClient(app).options(
                    "/auth/me",
                    headers={
                        "Origin": origin,
                        "Access-Control-Request-Method": "GET",
                        "Access-Control-Request-Headers": "authorization,content-type",
                    },
                )
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.headers.get("access-control-allow-origin"), origin)
                self.assertIn("GET", response.headers.get("access-control-allow-methods", ""))
                allowed_headers = response.headers.get("access-control-allow-headers", "").lower()
                self.assertIn("authorization", allowed_headers)
                self.assertIn("content-type", allowed_headers)


if __name__ == "__main__":
    unittest.main()
