import assert from "node:assert/strict";
import test from "node:test";
import { buildApiUrl, resolveApiBaseUrl } from "../src/apiUrl.ts";

test("uses localhost fallback only in Vite development", () => {
  assert.equal(resolveApiBaseUrl(undefined, true), "http://127.0.0.1:8000");
  assert.equal(resolveApiBaseUrl(undefined, false), "");
});

test("uses configured API URL and removes trailing slash", () => {
  assert.equal(resolveApiBaseUrl(" https://api.example.test/ ", false), "https://api.example.test");
  assert.equal(buildApiUrl("/auth/me", "https://api.example.test/", false), "https://api.example.test/auth/me");
});

test("fails clearly when production API URL is missing or malformed", () => {
  assert.throws(() => buildApiUrl("/health", undefined, false), /Configure VITE_API_BASE_URL/);
  assert.throws(() => resolveApiBaseUrl("api.example.test", false), /URL absoluta/);
  assert.throws(() => resolveApiBaseUrl("https://user:pass@example.test", false), /sem credenciais/);
});
