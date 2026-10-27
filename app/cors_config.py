from __future__ import annotations

from urllib.parse import urlsplit


DEFAULT_CORS_ORIGINS = (
    "http://localhost:5173",
    "http://127.0.0.1:5173",
)

# Exact Vercel preview origin observed in the production CORS failure report.
# Keep this explicit; do not replace it with a wildcard Vercel domain.
VERIFIED_VERCEL_PREVIEW_ORIGIN = "https://atrio-uu3m-be84k1mk7-mmdoces-projects.vercel.app"
VERIFIED_VERCEL_PRODUCTION_ORIGIN = "https://atrio-uu3m.vercel.app"


def parse_cors_origins(value: str | None) -> list[str]:
    """Parse explicit browser origins; never accept wildcard or URL paths."""
    if value is None or not value.strip():
        return list(DEFAULT_CORS_ORIGINS)

    origins: list[str] = []
    for raw_origin in value.split(","):
        origin = raw_origin.strip().rstrip("/")
        if not origin or "*" in origin:
            raise ValueError("CORS_ALLOWED_ORIGINS must contain explicit origins without wildcards.")

        parsed = urlsplit(origin)
        try:
            hostname = parsed.hostname
            port = parsed.port  # Validate malformed ports.
        except ValueError as exc:
            raise ValueError("CORS_ALLOWED_ORIGINS contains an invalid origin.") from exc

        if (
            parsed.scheme not in {"http", "https"}
            or not hostname
            or parsed.username is not None
            or parsed.password is not None
            or parsed.path
            or parsed.query
            or parsed.fragment
        ):
            raise ValueError("CORS_ALLOWED_ORIGINS must contain origins only (scheme and host, optional port).")

        local_http = parsed.scheme == "http" and hostname.lower() in {"localhost", "127.0.0.1", "::1"}
        if parsed.scheme != "https" and not local_http:
            raise ValueError("Non-local CORS origins must use HTTPS.")

        try:
            normalized_host = hostname.encode("idna").decode("ascii").lower()
        except UnicodeError as exc:
            raise ValueError("CORS_ALLOWED_ORIGINS contains an invalid hostname.") from exc
        if ":" in normalized_host:
            normalized_host = f"[{normalized_host}]"
        default_port = 443 if parsed.scheme == "https" else 80
        authority = normalized_host if port is None or port == default_port else f"{normalized_host}:{port}"
        origins.append(f"{parsed.scheme.lower()}://{authority}")

    if not origins:
        raise ValueError("CORS_ALLOWED_ORIGINS must contain at least one explicit origin.")
    return list(dict.fromkeys(origins))
