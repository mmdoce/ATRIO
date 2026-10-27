from __future__ import annotations

from urllib.parse import urlsplit


DEFAULT_CORS_ORIGINS = (
    "http://localhost:5173",
    "http://127.0.0.1:5173",
)


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
            parsed.port  # Validate malformed ports.
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
        origins.append(origin)

    if not origins:
        raise ValueError("CORS_ALLOWED_ORIGINS must contain at least one explicit origin.")
    return list(dict.fromkeys(origins))
