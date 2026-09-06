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
  comment: string | null;
  created_at: string;
  storeName: string;
  orderNumber: number | null;
};

type RawReview = Omit<ReviewRow, "storeName" | "orderNumber">;

const stars = (value: number | null) =>
  value
    ? "★".repeat(Math.round(value)) + "☆".repeat(5 - Math.round(value))
    : "—";

const average = (rows: ReviewRow[], key: "store_rating" | "driver_rating") => {
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

async function fetchAllReviews(from: string, to: string): Promise<RawReview[]> {
  const pageSize = 1000;
  const result: RawReview[] = [];
  const end = new Date(`${to}T00:00:00`);
  end.setDate(end.getDate() + 1);

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from("reviews")
      .select(
        "id,order_id,customer_id,store_id,driver_id,store_rating,driver_rating,comment,created_at",
      )
      .gte("created_at", `${from}T00:00:00`)
      .lt("created_at", end.toISOString())
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) throw error;
    const batch = (data ?? []) as RawReview[];
    result.push(...batch);
    if (batch.length < pageSize) break;
  }

  return result;
}

async function loadNames(rows: RawReview[]) {
  const storeIds = [...new Set(rows.map((row) => row.store_id))];
  const orderIds = [...new Set(rows.map((row) => row.order_id))];
  const storeNames = new Map<string, string>();
  const orderNumbers = new Map<string, number>();

  for (let index = 0; index < storeIds.length; index += 200) {
    const ids = storeIds.slice(index, index + 200);
    const { data } = await supabase.from("stores").select("id,name").in("id", ids);
    for (const row of data ?? []) storeNames.set(String(row.id), String(row.name ?? "Loja"));
  }

  for (let index = 0; index < orderIds.length; index += 200) {
    const ids = orderIds.slice(index, index + 200);
    const { data } = await supabase.from("orders").select("id,order_number").in("id", ids);
    for (const row of data ?? []) orderNumbers.set(String(row.id), Number(row.order_number ?? 0));
  }

  return rows.map((row): ReviewRow => ({
    ...row,
    storeName: storeNames.get(row.store_id) ?? "Loja",
    orderNumber: orderNumbers.get(row.order_id) || null,
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
      const reviews = await fetchAllReviews(from, to);
      setRows(await loadNames(reviews));
      setMessage("");
    } catch {
      setMessage("Não foi possível carregar as avaliações da Matriz.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // load inicial; filtros são aplicados pelo botão para evitar consultas a cada tecla.
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
    }),
    [rows],
  );

  if (allowed === null) {
    return (
      <main className="adminPage">
        <div className="adminPanel">Carregando...</div>
      </main>
    );
  }

  if (!allowed) {
    return (
      <main className="adminPage">
        <div className="adminPanel">
          <h1>Acesso restrito</h1>
        </div>
      </main>
    );
  }

  return (
    <main className="adminPage">
      <header className="adminHeader">
        <div>
          <small>QUALIDADE • MATRIZ</small>
          <h1>Todas as avaliações dos clientes</h1>
          <p>
            A Matriz visualiza as avaliações de todas as lojas, pedidos e entregadores do CLICK-FOOD.
          </p>
        </div>
        <a className="adminLink" href="/">
          ← Matriz
        </a>
      </header>

      <section className="adminPanel" style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap" }}>
          <label>
            De
            <br />
            <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </label>
          <label>
            Até
            <br />
            <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </label>
          <button onClick={() => void load()}>{loading ? "CARREGANDO..." : "FILTRAR"}</button>
          <button onClick={() => setFrom(daysAgo(7))}>7 DIAS</button>
          <button onClick={() => setFrom(daysAgo(30))}>30 DIAS</button>
          <button onClick={() => setFrom("2020-01-01")}>TODAS</button>
        </div>
      </section>

      {message && <div className="adminNotice">{message}</div>}

      <section className="adminPanel" style={{ marginBottom: 18 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))",
            gap: 10,
          }}
        >
          <div style={{ padding: 14, border: "1px solid #e5e5e5", borderRadius: 12 }}>
            <small>Média restaurantes</small>
            <div style={{ fontSize: 26, fontWeight: 900, marginTop: 4 }}>
              {metrics.store} <span style={{ fontSize: 13, color: "#b78f00" }}>★</span>
            </div>
          </div>
          <div style={{ padding: 14, border: "1px solid #e5e5e5", borderRadius: 12 }}>
            <small>Média entregadores</small>
            <div style={{ fontSize: 26, fontWeight: 900, marginTop: 4 }}>
              {metrics.driver} <span style={{ fontSize: 13, color: "#b78f00" }}>★</span>
            </div>
          </div>
          <div style={{ padding: 14, border: "1px solid #e5e5e5", borderRadius: 12 }}>
            <small>Total no período</small>
            <div style={{ fontSize: 26, fontWeight: 900, marginTop: 4 }}>{rows.length}</div>
          </div>
        </div>
      </section>

      <section className="adminPanel">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <div>
            <h2>Avaliações do período</h2>
            <p className="muted">
              Sem limite por loja: a Matriz consulta todos os registros do período selecionado.
            </p>
          </div>
          <button onClick={() => void load()}>Atualizar</button>
        </div>

        <div className="adminList">
          {rows.map((review) => (
            <div key={review.id} style={{ display: "block", padding: 16 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <b>
                    {review.storeName} • {review.orderNumber ? `Pedido #${review.orderNumber}` : "Pedido"}
                  </b>
                  <small>{new Date(review.created_at).toLocaleString("pt-BR")}</small>
                </div>
                <b style={{ color: "#9a7800" }}>{stars(review.store_rating)}</b>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
                  gap: 8,
                  marginTop: 10,
                  fontSize: 13,
                }}
              >
                <span>
                  Restaurante: <b>{stars(review.store_rating)}</b>
                </span>
                <span>
                  Entregador: <b>{stars(review.driver_rating)}</b>
                </span>
              </div>

              {review.comment && (
                <p style={{ margin: "10px 0 0", padding: 10, background: "#f7f7f7", borderRadius: 10 }}>
                  “{review.comment}”
                </p>
              )}
            </div>
          ))}
          {!rows.length && <p className="muted">Nenhuma avaliação neste período.</p>}
        </div>
      </section>
    </main>
  );
}
