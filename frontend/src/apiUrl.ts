const LOCAL_API_BASE_URL = "http://127.0.0.1:8000";

export function resolveApiBaseUrl(configuredUrl: string | undefined, isDev: boolean): string {
  const value = configuredUrl?.trim();
  if (!value) return isDev ? LOCAL_API_BASE_URL : "";

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("VITE_API_BASE_URL precisa ser uma URL absoluta HTTP ou HTTPS.");
  }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("VITE_API_BASE_URL precisa ser uma URL HTTP ou HTTPS sem credenciais ou parâmetros.");
  }
  return value.replace(/\/+$/, "");
}

export function buildApiUrl(path: string, configuredUrl: string | undefined, isDev: boolean): string {
  const baseUrl = resolveApiBaseUrl(configuredUrl, isDev);
  if (!baseUrl) {
    throw new Error("Configure VITE_API_BASE_URL com a URL da API antes de usar o sistema.");
  }
  return `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}
