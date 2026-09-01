"use client";

import { FormEvent, useState } from "react";
import { supabase } from "../../lib/supabase";

export default function RecuperarSenhaPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    const redirectTo = `${window.location.origin}/redefinir-senha`;
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo,
    });

    setLoading(false);
    if (error) {
      if (error.status === 429) {
        setMessage("Aguarde alguns segundos antes de solicitar outro e-mail.");
      } else {
        setMessage("Não foi possível enviar o link agora. Confira o e-mail e tente novamente.");
      }
      return;
    }

    setSent(true);
    setMessage("Link enviado. Abra o e-mail mais recente e toque em Redefinir senha.");
  }

  return (
    <main style={styles.page}>
      <section style={styles.card}>
        <div style={styles.brand}><span style={styles.brandYellow}>CLICK</span>-FOOD</div>
        <div style={styles.badge}>ACESSO SEGURO</div>
        <h1 style={styles.title}>Recuperar senha</h1>
        <p style={styles.text}>Informe o e-mail da sua conta. Você receberá um link seguro para criar uma nova senha.</p>

        <form onSubmit={submit} style={styles.form}>
          <label style={styles.label}>
            E-mail
            <input
              style={styles.input}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="seuemail@exemplo.com"
              required
              disabled={loading || sent}
            />
          </label>

          {message && <div style={sent ? styles.success : styles.message}>{message}</div>}

          {!sent && (
            <button style={styles.button} type="submit" disabled={loading}>
              {loading ? "ENVIANDO..." : "ENVIAR LINK DE RECUPERAÇÃO"}
            </button>
          )}
        </form>

        <a style={styles.link} href="/">Voltar para o login</a>
        <p style={styles.hint}>Por segurança, use somente o e-mail mais recente. Links de recuperação são de uso único.</p>
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
  text: { color: "#555", lineHeight: 1.55, margin: "0 0 22px" },
  form: { display: "grid", gap: 16 },
  label: { display: "grid", gap: 8, color: "#222", fontWeight: 700, fontSize: 14 },
  input: { width: "100%", boxSizing: "border-box", border: "1px solid #d7d7d7", borderRadius: 12, padding: "14px 15px", fontSize: 16, outline: "none" },
  button: { border: 0, borderRadius: 12, padding: "15px 18px", background: "#f5b800", color: "#111", fontWeight: 900, cursor: "pointer" },
  message: { borderRadius: 12, padding: 13, background: "#fff4e5", color: "#7a4300", lineHeight: 1.4 },
  success: { borderRadius: 12, padding: 13, background: "#e9f8ed", color: "#176b2c", lineHeight: 1.4 },
  link: { display: "inline-block", marginTop: 20, color: "#111", fontWeight: 800, textDecoration: "none" },
  hint: { marginTop: 18, color: "#777", fontSize: 12, lineHeight: 1.5 },
};
