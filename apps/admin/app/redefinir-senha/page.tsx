"use client";

import { FormEvent, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

export default function RedefinirSenhaPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [checking, setChecking] = useState(true);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let active = true;

    async function prepareRecovery() {
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const query = new URLSearchParams(window.location.search);
      const errorDescription = hash.get("error_description") || query.get("error_description");

      if (errorDescription) {
        if (active) {
          setMessage("Este link é inválido ou expirou. Solicite um novo link de recuperação.");
          setChecking(false);
        }
        return;
      }

      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");
      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (!error && active) {
          setReady(true);
          setChecking(false);
          return;
        }
      }

      const { data } = await supabase.auth.getSession();
      if (data.session && active) {
        setReady(true);
        setChecking(false);
        return;
      }

      window.setTimeout(async () => {
        const { data: retry } = await supabase.auth.getSession();
        if (!active) return;
        if (retry.session) setReady(true);
        else setMessage("Este link é inválido ou expirou. Solicite um novo link de recuperação.");
        setChecking(false);
      }, 1200);
    }

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if ((event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") && session) {
        setReady(true);
        setChecking(false);
        setMessage("");
      }
    });

    void prepareRecovery();
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage("");

    if (password.length < 8) {
      setMessage("A nova senha precisa ter pelo menos 8 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      setMessage("As duas senhas não são iguais.");
      return;
    }

    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);

    if (error) {
      setMessage("Não foi possível alterar a senha. Solicite um novo link e tente novamente.");
      return;
    }

    setSuccess(true);
    setReady(false);
    setPassword("");
    setConfirmPassword("");
    setMessage("Senha alterada com sucesso. Agora você já pode entrar usando a nova senha.");
    await supabase.auth.signOut();
  }

  return (
    <main style={styles.page}>
      <section style={styles.card}>
        <div style={styles.brand}><span style={styles.brandYellow}>CLICK</span>-FOOD</div>
        <div style={styles.badge}>RECUPERAÇÃO DE CONTA</div>
        <h1 style={styles.title}>Criar nova senha</h1>

        {checking && <div style={styles.info}>Validando seu link de recuperação...</div>}

        {!checking && ready && !success && (
          <form onSubmit={submit} style={styles.form}>
            <p style={styles.text}>Digite uma nova senha para sua conta CLICK-FOOD.</p>
            <label style={styles.label}>
              Nova senha
              <input
                style={styles.input}
                type="password"
                minLength={8}
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </label>
            <label style={styles.label}>
              Confirmar nova senha
              <input
                style={styles.input}
                type="password"
                minLength={8}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
              />
            </label>
            {message && <div style={styles.message}>{message}</div>}
            <button style={styles.button} type="submit" disabled={saving}>
              {saving ? "SALVANDO..." : "ALTERAR SENHA"}
            </button>
          </form>
        )}

        {!checking && !ready && message && (
          <div style={success ? styles.success : styles.message}>{message}</div>
        )}

        {!checking && !ready && !success && (
          <a style={styles.buttonLink} href="/recuperar-senha">SOLICITAR NOVO LINK</a>
        )}

        <a style={styles.link} href="/">Voltar para o login</a>
      </section>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", display: "grid", placeItems: "center", background: "#0a0a0a", padding: 20, fontFamily: "Arial, sans-serif" },
  card: { width: "100%", maxWidth: 460, background: "#fff", borderRadius: 22, padding: 32, boxShadow: "0 24px 80px rgba(0,0,0,.35)" },
  brand: { fontSize: 28, fontWeight: 900, color: "#111", letterSpacing: -1 },
  brandYellow: { color: "#f5b800" },
  badge: { display: "inline-block", marginTop: 14, padding: "7px 10px", borderRadius: 999, background: "#fff4bf", color: "#6d5200", fontSize: 11, fontWeight: 800, letterSpacing: 1 },
  title: { margin: "20px 0 8px", color: "#111", fontSize: 28 },
  text: { color: "#555", lineHeight: 1.55, margin: "0 0 4px" },
  form: { display: "grid", gap: 16, marginTop: 18 },
  label: { display: "grid", gap: 8, color: "#222", fontWeight: 700, fontSize: 14 },
  input: { width: "100%", boxSizing: "border-box", border: "1px solid #d7d7d7", borderRadius: 12, padding: "14px 15px", fontSize: 16, outline: "none" },
  button: { border: 0, borderRadius: 12, padding: "15px 18px", background: "#f5b800", color: "#111", fontWeight: 900, cursor: "pointer" },
  buttonLink: { display: "block", marginTop: 18, borderRadius: 12, padding: "15px 18px", background: "#f5b800", color: "#111", fontWeight: 900, textAlign: "center", textDecoration: "none" },
  message: { borderRadius: 12, padding: 13, background: "#fff4e5", color: "#7a4300", lineHeight: 1.4 },
  success: { borderRadius: 12, padding: 13, background: "#e9f8ed", color: "#176b2c", lineHeight: 1.4 },
  info: { marginTop: 20, borderRadius: 12, padding: 13, background: "#f3f3f3", color: "#444", lineHeight: 1.4 },
  link: { display: "inline-block", marginTop: 20, color: "#111", fontWeight: 800, textDecoration: "none" },
};
