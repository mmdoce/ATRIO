import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { LogoAtrio } from "../components/LogoAtrio";

function AuthCard({ children }: { children: ReactNode }) {
  return <main className="auth-page"><section className="auth-card">{children}</section><p className="auth-footnote">Acesso restrito à equipe autorizada</p></main>;
}
function AuthBrand() { return <header className="auth-brand"><LogoAtrio size={88} showName={false} /><h1>Átrio</h1><p>Sistema de Gestão</p></header>; }
function friendly(error: unknown) {
  const message = error instanceof Error ? error.message : "Tente novamente em instantes.";
  if (/invalid login credentials/i.test(message)) return "E-mail ou senha incorretos.";
  if (/network|fetch/i.test(message)) return "Não foi possível conectar. Verifique sua conexão e tente novamente.";
  if (/rate limit/i.test(message)) return "Muitas tentativas. Aguarde um pouco e tente novamente.";
  return message || "Não foi possível concluir a solicitação.";
}

export function LoginPage() {
  const { signIn, loading, profile } = useAuth(); const navigate = useNavigate(); const location = useLocation();
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [visible, setVisible] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  if (!loading && profile) return <Navigate to={(location.state as { from?: string } | null)?.from || "/dashboard"} replace />;
  async function submit(event: FormEvent) { event.preventDefault(); setError(""); setBusy(true); try { const user = await signIn(email.trim(), password); navigate(user.role === "DIRETOR" ? "/dashboard" : "/acolhidos", { replace: true }); } catch (e) { setError(friendly(e)); } finally { setBusy(false); } }
  return <AuthCard><AuthBrand /><form className="auth-form" onSubmit={submit}>
    <div className="auth-intro"><h2>Bem-vindo de volta</h2><p>Entre com seus dados de acesso.</p></div>
    <label className="auth-field">E-mail<input type="email" name="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required maxLength={254} placeholder="seu@email.com" /></label>
    <label className="auth-field">Senha<span className="password-control"><input type={visible ? "text" : "password"} name="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required /><button type="button" aria-label={visible ? "Ocultar senha" : "Mostrar senha"} aria-pressed={visible} onClick={() => setVisible(v => !v)}>{visible ? "Ocultar" : "Mostrar"}</button></span></label>
    {error && <p className="auth-message error" role="alert">{error}</p>}
    <Link className="auth-link forgot-link" to="/recuperar-senha">Esqueci minha senha</Link>
    <button className="auth-submit" type="submit" disabled={busy || loading}>{busy ? <><span className="auth-spinner" aria-hidden="true" /> Entrando…</> : "Entrar"}</button>
  </form></AuthCard>;
}

export function RecoveryPage() {
  const { requestReset, profile, loading } = useAuth(); const [email, setEmail] = useState(""); const [done, setDone] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  if (!loading && profile) return <Navigate to="/dashboard" replace />;
  async function submit(event: FormEvent) { event.preventDefault(); setBusy(true); setError(""); try { await requestReset(email.trim()); setDone(true); } catch (e) { setError(friendly(e)); } finally { setBusy(false); } }
  return <AuthCard><AuthBrand /><div className="auth-intro"><h2>Redefinir senha</h2><p>Informe seu e-mail para receber as instruções de redefinição.</p></div>
    {done ? <p className="auth-message success" role="status">Se existir uma conta associada a esse e-mail, você receberá as instruções para redefinir sua senha.</p> : <form className="auth-form" onSubmit={submit}><label className="auth-field">E-mail<input type="email" name="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required maxLength={254} placeholder="seu@email.com" /></label>{error && <p className="auth-message error" role="alert">{error}</p>}<button className="auth-submit" disabled={busy}>{busy ? "Enviando…" : "Enviar instruções"}</button></form>}
    <Link className="auth-link auth-back" to="/login">Voltar para entrar</Link>
  </AuthCard>;
}

export function PasswordResetPage() {
  const { updatePassword, recoveryValid, loading } = useAuth(); const navigate = useNavigate(); const [password, setPassword] = useState(""); const [confirm, setConfirm] = useState(""); const [show, setShow] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [complete, setComplete] = useState(false);
  async function submit(event: FormEvent) { event.preventDefault(); setError(""); if (password.length < 10 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) { setError("Use ao menos 10 caracteres, incluindo letras maiúsculas, minúsculas e um número."); return; } if (password !== confirm) { setError("As senhas não coincidem."); return; } setBusy(true); try { await updatePassword(password); setComplete(true); } catch (e) { setError(friendly(e)); } finally { setBusy(false); } }
  if (loading) return <AuthCard><AuthBrand /><p className="auth-message" role="status">Validando o link…</p></AuthCard>;
  if (!recoveryValid && !complete) return <AuthCard><AuthBrand /><div className="auth-intro"><h2>Link indisponível</h2><p>Este link é inválido, expirou ou já foi utilizado. Solicite uma nova redefinição.</p></div><Link className="auth-submit auth-submit-link" to="/recuperar-senha">Solicitar novo link</Link></AuthCard>;
  if (complete) return <AuthCard><AuthBrand /><p className="auth-message success" role="status">Senha atualizada. Entre novamente com sua nova senha.</p><button className="auth-submit" onClick={() => navigate("/login", { replace: true })}>Ir para entrar</button></AuthCard>;
  return <AuthCard><AuthBrand /><div className="auth-intro"><h2>Escolha uma nova senha</h2><p>Use ao menos 10 caracteres, letras maiúsculas e minúsculas e um número.</p></div><form className="auth-form" onSubmit={submit}><label className="auth-field">Nova senha<span className="password-control"><input type={show ? "text" : "password"} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} required /><button type="button" onClick={() => setShow(v => !v)} aria-label={show ? "Ocultar senha" : "Mostrar senha"}>{show ? "Ocultar" : "Mostrar"}</button></span></label><label className="auth-field">Confirmar nova senha<input type={show ? "text" : "password"} autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} required /></label>{error && <p className="auth-message error" role="alert">{error}</p>}<button className="auth-submit" disabled={busy}>{busy ? "Salvando…" : "Salvar nova senha"}</button></form></AuthCard>;
}
