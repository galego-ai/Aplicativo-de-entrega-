"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

type Metrics = {
  gmv_today: number;
  platform_revenue_today: number;
  orders_today: number;
  active_stores: number;
  online_drivers: number;
  customers: number;
  average_ticket_today: number;
  past_due_invoices: number;
  pending_drivers: number;
  failed_payments: number;
  critical_tickets: number;
};

const emptyMetrics: Metrics = {
  gmv_today: 0, platform_revenue_today: 0, orders_today: 0, active_stores: 0,
  online_drivers: 0, customers: 0, average_ticket_today: 0, past_due_invoices: 0,
  pending_drivers: 0, failed_payments: 0, critical_tickets: 0,
};

const menu = ["Dashboard", "Pedidos", "Lojas", "Entregadores", "Clientes", "Cidades", "Planos", "Financeiro", "Bônus lojistas", "Suporte", "Auditoria"];
const brl = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
const number = (value: number) => new Intl.NumberFormat("pt-BR").format(value || 0);

export default function Home() {
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [authorized, setAuthorized] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [metrics, setMetrics] = useState<Metrics>(emptyMetrics);

  const cards = useMemo(() => [
    ["GMV hoje", brl(metrics.gmv_today)],
    ["Receita CLICK-FOOD", brl(metrics.platform_revenue_today)],
    ["Pedidos hoje", number(metrics.orders_today)],
    ["Lojas ativas", number(metrics.active_stores)],
    ["Entregadores online", number(metrics.online_drivers)],
    ["Clientes ativos", number(metrics.customers)],
    ["Ticket médio", brl(metrics.average_ticket_today)],
    ["Inadimplentes", number(metrics.past_due_invoices)],
  ], [metrics]);

  async function loadSession() {
    const { data } = await supabase.auth.getSession();
    const session = data.session;
    if (!session) {
      setAuthorized(false);
      setLoading(false);
      return;
    }
    const role = String(session.user.app_metadata?.clickfood_role ?? "");
    const isAdmin = ["SUPER_ADMIN", "ADMIN", "SUPPORT"].includes(role);
    setUserEmail(session.user.email ?? "");
    setAuthorized(isAdmin);
    if (!isAdmin) setMessage("Esta conta não possui permissão de Matriz CLICK-FOOD.");
    if (isAdmin) await loadMetrics();
    setLoading(false);
  }

  async function loadMetrics() {
    const { data, error } = await supabase.rpc("admin_dashboard_metrics");
    if (error) {
      setMessage("Não foi possível carregar os indicadores da Matriz.");
      return;
    }
    setMetrics({ ...emptyMetrics, ...(data as Metrics) });
  }

  useEffect(() => {
    loadSession();
    const { data } = supabase.auth.onAuthStateChange(() => loadSession());
    return () => data.subscription.unsubscribe();
  }, []);

  async function login(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      setMessage("E-mail ou senha inválidos.");
      setLoading(false);
    }
  }

  async function logout() {
    await supabase.auth.signOut();
    setAuthorized(false);
    setMetrics(emptyMetrics);
  }

  if (loading) return <main className="authPage"><div className="authCard"><div className="brand"><span>CLICK</span>-FOOD</div><p>Carregando ambiente seguro...</p></div></main>;

  if (!authorized) {
    return (
      <main className="authPage">
        <form className="authCard" onSubmit={login}>
          <div className="brand dark"><span>CLICK</span>-FOOD</div>
          <p className="authRole">ADMINISTRAÇÃO CENTRAL</p>
          <h1>Entrar na Matriz</h1>
          <label>E-mail<input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
          <label>Senha<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
          {message && <div className="authMessage">{message}</div>}
          <button className="loginButton" type="submit">ENTRAR</button>
        </form>
      </main>
    );
  }

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand"><span>CLICK</span>-FOOD</div>
        <p className="role">MATRIZ</p>
        <nav>{menu.map((item, index) => <button key={item} className={index === 0 ? "active" : ""}>{item}</button>)}</nav>
      </aside>
      <section className="content">
        <header className="topbar">
          <div><p className="eyebrow">Visão geral em tempo real</p><h1>Dashboard</h1><small>{userEmail}</small></div>
          <div className="topActions"><div className="status">Supabase conectado</div><button className="logout" onClick={logout}>Sair</button></div>
        </header>
        {message && <div className="notice">{message}</div>}
        <div className="metricGrid">{cards.map(([label, value]) => <article className="metric" key={label}><p>{label}</p><strong>{value}</strong></article>)}</div>
        <div className="panels">
          <article className="panel wide"><div className="panelTitle"><h2>Operação</h2><span>Dados reais do CLICK-FOOD</span></div><div className="emptyState">Os gráficos serão preenchidos automaticamente conforme os pedidos começarem a entrar.</div></article>
          <article className="panel"><div className="panelTitle"><h2>Atenção</h2></div><ul className="alerts"><li>{number(metrics.past_due_invoices)} lojas inadimplentes</li><li>{number(metrics.pending_drivers)} entregadores aguardando aprovação</li><li>{number(metrics.failed_payments)} pagamentos com falha hoje</li><li>{number(metrics.critical_tickets)} chamados críticos</li></ul></article>
        </div>
        <article className="panel"><div className="panelTitle"><h2>Banco de produção</h2><button className="primary" onClick={loadMetrics}>Atualizar indicadores</button></div><div className="emptyState">CLICK-FOOD está usando banco, autenticação e regras RLS próprios, sem compartilhar infraestrutura com o CLICK-GO.</div></article>
      </section>
    </main>
  );
}