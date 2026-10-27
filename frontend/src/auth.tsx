import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type { ReactNode } from "react";
import { supabase } from "./supabase";

type Profile = { id: string; email: string | null; role: "DIRETOR" | "MONITOR" };
type AuthContextValue = { session: Session | null; profile: Profile | null; loading: boolean; recoveryValid: boolean; signIn(email: string, password: string): Promise<Profile>; signOut(): Promise<void>; requestReset(email: string): Promise<void>; updatePassword(password: string): Promise<void> };
const Context = createContext<AuthContextValue | null>(null);
const recoveryKey = "atrio:password-recovery";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [recoveryValid, setRecoveryValid] = useState(() => sessionStorage.getItem(recoveryKey) === "valid");

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    const client = supabase;
    let active = true;
    const loadProfile = async (next: Session | null) => {
      setSession(next);
      if (!next) { setProfile(null); return; }
      try {
        const response = await fetch(`${(import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000").replace(/\/$/, "")}/auth/me`, { headers: { Authorization: `Bearer ${next.access_token}` } });
        if (!response.ok) {
          if (response.status === 401) await client.auth.signOut();
          throw new Error("Conta sem acesso ativo.");
        }
        setProfile(await response.json() as Profile);
      } catch { setProfile(null); }
    };
    client.auth.getSession().then(({ data }) => loadProfile(data.session)).finally(() => { if (active) setLoading(false); });
    const { data: { subscription } } = client.auth.onAuthStateChange((event, next) => {
      if (event === "PASSWORD_RECOVERY") { sessionStorage.setItem(recoveryKey, "valid"); setRecoveryValid(true); }
      void loadProfile(next);
      setLoading(false);
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    session, profile, loading, recoveryValid,
    async signIn(email, password) {
      if (!supabase) throw new Error("Autenticação não configurada neste frontend.");
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Não foi possível recuperar a sessão. Tente novamente.");
      const response = await fetch(`${(import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000").replace(/\/$/, "")}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
      if (response.status === 401 || response.status === 403) { await supabase.auth.signOut(); throw new Error("Conta sem perfil ativo. Solicite acesso ao Diretor do sistema."); }
      if (!response.ok) throw new Error("Não foi possível validar o acesso no servidor. Tente novamente.");
      const nextProfile = await response.json() as Profile;
      setProfile(nextProfile);
      return nextProfile;
    },
    async signOut() { if (supabase) await supabase.auth.signOut(); setProfile(null); },
    async requestReset(email) {
      if (!supabase) throw new Error("Autenticação não configurada neste frontend.");
      sessionStorage.removeItem(recoveryKey); setRecoveryValid(false);
      const redirectTo = `${window.location.origin}/redefinir-senha`;
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) throw error;
    },
    async updatePassword(password) {
      if (!supabase || !recoveryValid) throw new Error("O link de redefinição é inválido ou expirou.");
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      sessionStorage.removeItem(recoveryKey); setRecoveryValid(false);
      await supabase.auth.signOut();
    },
  }), [session, profile, loading, recoveryValid]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useAuth() { const value = useContext(Context); if (!value) throw new Error("useAuth precisa de AuthProvider"); return value; }
