"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

type ReviewRow = {
  id: string;
  order_id: string;
  customer_id: string;
  store_id: string;
  driver_id: string | null;
  store_rating: number;
  driver_rating: number | null;
  delivery_rating: number | null;
  delivery_time_rating: number | null;
  taste_rating: number | null;
  temperature_rating: number | null;
  comment: string | null;
  created_at: string;
  storeName: string;
  orderNumber: number | null;
  customerName: string;
};

type ReviewsDashboardResponse = { reviews?: ReviewRow[] };

const stars = (value: number | null) =>
  value
    ? "★".repeat(Math.round(value)) + "☆".repeat(5 - Math.round(value))
    : "—";

const average = (rows: ReviewRow[], key: keyof Pick<ReviewRow, "store_rating" | "driver_rating" | "delivery_rating" | "delivery_time_rating" | "taste_rating" | "temperature_rating">) => {
  const values = rows
    .map((row) => Number(row[key]))
    .filter((value) => Number.isFinite(value) && value > 0);
  return values.length
    ? (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1)
    : "—";
};

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() - days + 1);
  return date.toISOString().slice(0, 10);
};

function endExclusive(date: string) {
  const end = new Date(`${date}T00:00:00`);
  end.setDate(end.getDate() + 1);
  return end.toISOString();
}

async function fetchAllReviews(from: string, to: string): Promise<ReviewRow[]> {
  const { data, error } = await supabase.functions.invoke<ReviewsDashboardResponse>(
    "reviews-dashboard-read",
    {
      body: {
        from: new Date(`${from}T00:00:00`).toISOString(),
        to: endExclusive(to),
      },
    },
  );
  if (error) throw error;
  return (data?.reviews ?? []).map((row) => ({
    ...row,
    store_rating: Number(row.store_rating),
    driver_rating: row.driver_rating == null ? null : Number(row.driver_rating),
    delivery_rating: row.delivery_rating == null ? null : Number(row.delivery_rating),
    delivery_time_rating: row.delivery_time_rating == null ? null : Number(row.delivery_time_rating),
    taste_rating: row.taste_rating == null ? null : Number(row.taste_rating),
    temperature_rating: row.temperature_rating == null ? null : Number(row.temperature_rating),
    storeName: row.storeName || "Loja",
    customerName: row.customerName || "Cliente",
    orderNumber: row.orderNumber ? Number(row.orderNumber) : null,
  }));
}

export default function ReviewsPage() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [from, setFrom] = useState("2020-01-01");
  const [to, setTo] = useState(today());
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function load() {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const role = String(session?.user.app_metadata?.clickfood_role ?? "");
    const ok = !!session && ["SUPER_ADMIN", "ADMIN", "SUPPORT"].includes(role);
    setAllowed(ok);
    if (!ok) return;

    setLoading(true);
    try {
      setRows(await fetchAllReviews(from, to));
      setMessage("");
    } catch {
      setMessage("Não foi possível carregar todas as avaliações da Matriz.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // Filtros são aplicados pelo botão para evitar consultas a cada tecla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!allowed) return;
    const channel = supabase
      .channel("matrix-reviews-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "reviews" },
        () => void load(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed, from, to]);

  const metrics = useMemo(
    () => ({
      store: average(rows, "store_rating"),
      driver: average(rows, "driver_rating"),
      delivery: average(rows, "delivery_rating"),
    }),
    [rows],
  );

  if (allowed === null) {
    return <main className="adminPage"><div className="adminPanel">Carregando...</div></main>;
  }

  if (!allowed) {
    return <main className="adminPage"><div className="adminPanel"><h1>Acesso restrito</h1></div></main>;
  }

  return (
    <main className="adminPage">
      <header className="adminHeader">
        <div>
          <small>QUALIDADE • MATRIZ CLICK-FOOD</small>
          <h1>Todas as avaliações</h1>
          <p>A Matriz visualiza, sem filtro por loja, as avaliações de restaurantes, pedidos e entregadores de toda a plataforma.</p>
        </div>
        <a className="adminLink" href="/">← Matriz</a>
      </header>

      <section className="adminPanel" style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap" }}>
          <label>De<br /><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
          <label>Até<br /><input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
          <button onClick={() => void load()}>{loading ? "CARREGANDO..." : "FILTRAR"}</button>
          <button onClick={() => setFrom(daysAgo(7))}>7 DIAS</button>
          <button onClick={() => setFrom(daysAgo(30))}>30 DIAS</button>
          <button onClick={() => setFrom("2020-01-01")}>TODAS</button>
        </div>
      </section>

      {message && <div className="adminNotice">{message}</div>}

      <section className="adminPanel" style={{ marginBottom: 18 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10 }}>
          <div style={{ padding: 14, border: "1px solid #e5e5e5", borderRadius: 12 }}><small>Média restaurantes</small><div style={{ fontSize: 26, fontWeight: 900, marginTop: 4 }}>{metrics.store} <span style={{ fontSize: 13, color: "#b78f00" }}>★</span></div></div>
          <div style={{ padding: 14, border: "1px solid #e5e5e5", borderRadius: 12 }}><small>Média entregadores</small><div style={{ fontSize: 26, fontWeight: 900, marginTop: 4 }}>{metrics.driver} <span style={{ fontSize: 13, color: "#b78f00" }}>★</span></div></div>
          <div style={{ padding: 14, border: "1px solid #e5e5e5", borderRadius: 12 }}><small>Média entrega</small><div style={{ fontSize: 26, fontWeight: 900, marginTop: 4 }}>{metrics.delivery} <span style={{ fontSize: 13, color: "#b78f00" }}>★</span></div></div>
          <div style={{ padding: 14, border: "1px solid #e5e5e5", borderRadius: 12 }}><small>Total no período</small><div style={{ fontSize: 26, fontWeight: 900, marginTop: 4 }}>{rows.length}</div></div>
        </div>
      </section>

      <section className="adminPanel">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <div><h2>Avaliações do período</h2><p className="muted">Visão global da Matriz: todas as lojas e todos os entregadores.</p></div>
          <button onClick={() => void load()}>Atualizar</button>
        </div>

        <div className="adminList">
          {rows.map((review) => (
            <div key={review.id} style={{ display: "block", padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <b>{review.storeName} • {review.orderNumber ? `Pedido #${review.orderNumber}` : "Pedido"}</b>
                  <small>{review.customerName} • {new Date(review.created_at).toLocaleString("pt-BR")}</small>
                </div>
                <b style={{ color: "#9a7800" }}>{stars(review.store_rating)}</b>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 8, marginTop: 10, fontSize: 13 }}>
                <span>Restaurante: <b>{stars(review.store_rating)}</b></span>
                <span>Entregador: <b>{stars(review.driver_rating)}</b></span>
                <span>Entrega: <b>{stars(review.delivery_rating)}</b></span>
                <span>Tempo: <b>{stars(review.delivery_time_rating)}</b></span>
                <span>Sabor: <b>{stars(review.taste_rating)}</b></span>
                <span>Temperatura: <b>{stars(review.temperature_rating)}</b></span>
              </div>

              {review.comment && <p style={{ margin: "10px 0 0", padding: 10, background: "#f7f7f7", borderRadius: 10 }}>“{review.comment}”</p>}
            </div>
          ))}
          {!rows.length && <p className="muted">Nenhuma avaliação neste período.</p>}
        </div>
      </section>
    </main>
  );
}
