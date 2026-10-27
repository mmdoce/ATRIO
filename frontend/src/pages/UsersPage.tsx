import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { inviteUser, listUsers, updateUserProfile } from "../api";
import type { UserProfile } from "../api";

export default function UsersPage() {
  const [users, setUsers] = useState<UserProfile[]>([]); const [email, setEmail] = useState(""); const [role, setRole] = useState<UserProfile["role"]>("MONITOR"); const [busy, setBusy] = useState(false); const [message, setMessage] = useState(""); const [error, setError] = useState("");
  const refresh = useCallback(async () => { setUsers(await listUsers()); }, []);
  useEffect(() => { void refresh().catch(() => setError("Não foi possível carregar os usuários.")); }, [refresh]);
  async function submit(event: FormEvent) { event.preventDefault(); setBusy(true); setError(""); setMessage(""); try { await inviteUser(email.trim(), role); setEmail(""); setMessage("Convite solicitado. A entrega depende do SMTP configurado no Supabase."); await refresh(); } catch { setError("Não foi possível convidar. Confira o e-mail, a migration e o SMTP do Supabase."); } finally { setBusy(false); } }
  async function toggle(user: UserProfile) { setError(""); try { await updateUserProfile(user.id, { active: !user.active }); await refresh(); } catch { setError("Não foi possível alterar o acesso. O último Diretor ativo não pode ser desativado."); } }
  async function changeRole(user: UserProfile, next: UserProfile["role"]) { setError(""); try { await updateUserProfile(user.id, { role: next }); await refresh(); } catch { setError("Não foi possível alterar o perfil. O último Diretor ativo deve ser preservado."); } }
  return <section className="management-panel user-admin"><div className="management-heading"><div><span className="management-eyebrow">ACESSO AO SISTEMA</span><h1>Usuários</h1><p>Convide pessoas e atribua o perfil autorizado.</p></div></div>
    <form className="user-invite-form" onSubmit={submit}><label>E-mail<input type="email" value={email} onChange={e => setEmail(e.target.value)} required maxLength={254} /></label><label>Perfil<select value={role} onChange={e => setRole(e.target.value as UserProfile["role"])}><option value="MONITOR">Monitor</option><option value="DIRETOR">Diretor</option></select></label><button className="management-button" disabled={busy}>{busy ? "Enviando…" : "Convidar usuário"}</button></form>
    {message && <p className="user-notice" role="status">{message}</p>}{error && <p className="user-error" role="alert">{error}</p>}
    <div className="user-table-wrap"><table className="user-table"><thead><tr><th>Conta</th><th>Perfil</th><th>Acesso</th><th>Ações</th></tr></thead><tbody>{users.map(user => <tr key={user.id}><td>{user.email || <code>{user.id}</code>}</td><td><select aria-label={`Perfil ${user.email || user.id}`} value={user.role} onChange={e => void changeRole(user, e.target.value as UserProfile["role"])}><option value="DIRETOR">Diretor</option><option value="MONITOR">Monitor</option></select></td><td>{user.active ? "Ativo" : "Desativado"}</td><td><button className="user-action" type="button" onClick={() => void toggle(user)}>{user.active ? "Desativar" : "Ativar"}</button></td></tr>)}</tbody></table></div>
  </section>;
}
