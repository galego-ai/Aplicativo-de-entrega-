"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

type Store = { id: string; name: string; status: string; role: string };
type Product = { id: string; name: string; price: number; promotional_price: number | null };
type Order = { id: string; order_number: number; total: number; status: string; payment_status: string; created_at: string };
type Metrics = { sales_today: number; orders_today: number; average_ticket_today: number; delivery_orders_today: number; pos_orders_today: number; cancelled_today: number; open_orders: number; products: number; low_stock: number };
type CartItem = Product & { quantity: number };

const emptyMetrics: Metrics = { sales_today: 0, orders_today: 0, average_ticket_today: 0, delivery_orders_today: 0, pos_orders_today: 0, cancelled_today: 0, open_orders: 0, products: 0, low_stock: 0 };
const menu = ["Dashboard","Pedidos","PDV","Produtos","Estoque","Entregas","Clientes","Cupons","Financeiro","Bônus","Configurações"];
const brl = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);

export default function Home() {
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [store, setStore] = useState<Store | null>(null);
  const [metrics, setMetrics] = useState<Metrics>(emptyMetrics);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);

  const cartTotal = useMemo(() => cart.reduce((sum, item) => sum + Number(item.promotional_price ?? item.price) * item.quantity, 0), [cart]);

  async function hydrate() {
    setLoading(true);
    setMessage("");
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) { setStore(null); setLoading(false); return; }

    const { data: memberships, error: membershipError } = await supabase
      .from("store_memberships")
      .select("store_id,role,stores!inner(id,name,status)")
      .eq("user_id", sessionData.session.user.id)
      .eq("active", true)
      .limit(1);

    if (membershipError || !memberships?.length) {
      setStore(null);
      setMessage("Esta conta ainda não está vinculada a uma loja CLICK-FOOD.");
      setLoading(false);
      return;
    }

    const membership = memberships[0] as any;
    const linkedStore = Array.isArray(membership.stores) ? membership.stores[0] : membership.stores;
    const currentStore: Store = { id: membership.store_id, name: linkedStore?.name ?? "Minha loja", status: linkedStore?.status ?? "PENDING", role: membership.role };
    setStore(currentStore);

    const [metricsResult, productsResult, ordersResult] = await Promise.all([
      supabase.rpc("store_dashboard_metrics", { p_store_id: currentStore.id }),
      supabase.from("products").select("id,name,price,promotional_price").eq("store_id", currentStore.id).eq("active", true).eq("available_pos", true).order("name").limit(60),
      supabase.from("orders").select("id,order_number,total,status,payment_status,created_at").eq("store_id", currentStore.id).order("created_at", { ascending: false }).limit(10),
    ]);

    if (metricsResult.data) setMetrics({ ...emptyMetrics, ...(metricsResult.data as Metrics) });
    if (productsResult.data) setProducts(productsResult.data.map((p: any) => ({ ...p, price: Number(p.price), promotional_price: p.promotional_price == null ? null : Number(p.promotional_price) })));
    if (ordersResult.data) setOrders(ordersResult.data.map((o: any) => ({ ...o, total: Number(o.total) })));
    if (metricsResult.error || productsResult.error || ordersResult.error) setMessage("Alguns dados da loja não puderam ser carregados.");
    setLoading(false);
  }

  useEffect(() => {
    hydrate();
    const { data } = supabase.auth.onAuthStateChange(() => hydrate());
    return () => data.subscription.unsubscribe();
  }, []);

  async function login(event: FormEvent) {
    event.preventDefault(); setLoading(true); setMessage("");
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) { setMessage("E-mail ou senha inválidos."); setLoading(false); }
  }

  async function logout() { await supabase.auth.signOut(); setStore(null); setCart([]); }

  function addProduct(product: Product) {
    setCart((current) => {
      const found = current.find((item) => item.id === product.id);
      return found ? current.map((item) => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item) : [...current, { ...product, quantity: 1 }];
    });
  }

  function changeQuantity(id: string, delta: number) {
    setCart((current) => current.map((item) => item.id === id ? { ...item, quantity: item.quantity + delta } : item).filter((item) => item.quantity > 0));
  }

  if (loading) return <main className="authPage"><div className="authCard"><div className="logo"><span>CLICK</span>-FOOD</div><p>Carregando sua operação...</p></div></main>;

  if (!store) {
    return <main className="authPage"><form className="authCard" onSubmit={login}><div className="logo"><span>CLICK</span>-FOOD</div><p className="authRole">PAINEL DO LOJISTA + PDV</p><h1>Entrar na loja</h1><label>E-mail<input type="email" value={email} onChange={(e)=>setEmail(e.target.value)} required /></label><label>Senha<input type="password" value={password} onChange={(e)=>setPassword(e.target.value)} required /></label>{message && <div className="authMessage">{message}</div>}<button className="loginButton">ENTRAR</button></form></main>;
  }

  return (
    <main className="app">
      <aside className="side"><div className="logo"><span>CLICK</span>-FOOD</div><p>{store.name}</p><nav>{menu.map((x,i)=><button key={x} className={i===2?"active":""}>{x}</button>)}</nav></aside>
      <section className="workspace">
        <header><div><small>{store.status === "ACTIVE" ? "LOJA ATIVA" : `LOJA ${store.status}`} • {store.role}</small><h1>PDV</h1></div><div className="headerActions"><button className="refresh" onClick={hydrate}>Atualizar</button><button className="refresh" onClick={logout}>Sair</button></div></header>
        {message && <div className="notice">{message}</div>}
        <div className="kpis"><article><span>Vendas hoje</span><b>{brl(metrics.sales_today)}</b></article><article><span>Pedidos hoje</span><b>{metrics.orders_today}</b></article><article><span>Ticket médio</span><b>{brl(metrics.average_ticket_today)}</b></article><article><span>Estoque baixo</span><b>{metrics.low_stock}</b></article></div>
        <div className="pos">
          <section className="catalog">
            <div className="search">Produtos reais cadastrados no CLICK-FOOD</div>
            <div className="productGrid">{products.length ? products.map((product)=><button className="product" onClick={()=>addProduct(product)} key={product.id}><span>{product.name}</span><strong>{brl(Number(product.promotional_price ?? product.price))}</strong></button>) : <div className="emptyCatalog">Nenhum produto cadastrado ainda.</div>}</div>
            <article className="incoming"><div><small>PEDIDOS RECENTES</small><h2>Fila da loja</h2></div><div className="orderRows">{orders.length ? orders.map((order)=><div key={order.id}><b>#{order.order_number}</b><span>{order.status}</span><span>{order.payment_status}</span><strong>{brl(order.total)}</strong></div>) : <div className="emptyRow">Nenhum pedido ainda.</div>}</div></article>
          </section>
          <aside className="cart">
            <div className="cartHead"><div><small>PEDIDO ATUAL</small><h2>Balcão</h2></div><button onClick={()=>setCart([])}>Limpar</button></div>
            <div className="cartItems">{cart.length ? cart.map((item)=><div className="item" key={item.id}><div><b>{item.quantity}× {item.name}</b><div className="quantity"><button onClick={()=>changeQuantity(item.id,-1)}>−</button><button onClick={()=>changeQuantity(item.id,1)}>+</button></div></div><strong>{brl(Number(item.promotional_price ?? item.price)*item.quantity)}</strong></div>) : <div className="emptyCart">Toque em um produto para iniciar a venda.</div>}</div>
            <div className="totals"><div className="grand"><span>Total</span><strong>{brl(cartTotal)}</strong></div></div>
            <button className="checkout" disabled={!cart.length} onClick={()=>setMessage("Carrinho pronto. O próximo bloco conecta pagamento e fechamento de caixa ao backend.")}>FINALIZAR VENDA</button>
          </aside>
        </div>
      </section>
    </main>
  );
}