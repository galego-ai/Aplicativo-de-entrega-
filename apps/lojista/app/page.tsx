"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import StoreSetup from "./StoreSetup";
import { supabase } from "../lib/supabase";

type Tab = "Dashboard" | "Pedidos" | "PDV" | "Produtos" | "Estoque" | "Entregas" | "Clientes" | "Cupons" | "Financeiro" | "Bônus" | "Configurações";
type Store = { id: string; name: string; status: string; role: string };
type Product = { id: string; name: string; price: number; promotional_price: number | null; active: boolean };
type Order = { id: string; order_number: number; customer_id: string | null; total: number; status: string; payment_status: string; delivery_type: string; source: string; created_at: string };
type RefundInfo = { payment_id: string; status: string; amount: number; created_at: string; completed_at: string | null };
type Metrics = { sales_today: number; orders_today: number; average_ticket_today: number; delivery_orders_today: number; pos_orders_today: number; cancelled_today: number; open_orders: number; products: number; low_stock: number };
type CashSession = { id: string; opening_balance: number; opened_at: string; status: string };
type CartItem = Product & { quantity: number };
type PaymentMethod = "CASH" | "PIX" | "CREDIT_CARD" | "DEBIT_CARD";
type Inventory = { id: string; product_id: string; quantity: number; minimum_quantity: number; products?: { name: string } | { name: string }[] | null };
type Coupon = { id: string; code: string; discount_type: string; discount_value: number; minimum_order: number; max_uses: number | null; ends_at: string | null; active: boolean };
type Finance = { id: string; transaction_type: string; direction: string; amount: number; status: string; created_at: string };
type Delivery = { id: string; status: string; delivery_fee: number; driver_earning: number; created_at: string; orders?: { order_number: number; total: number } | { order_number: number; total: number }[] | null };
type BonusTx = { id: string; transaction_type: string; points: number; description: string | null; created_at: string };
type Reward = { id: string; name: string; points_cost: number; reward_type: string; reward_value: number | null; active: boolean };

const tabs: Tab[] = ["Dashboard", "Pedidos", "PDV", "Produtos", "Estoque", "Entregas", "Clientes", "Cupons", "Financeiro", "Bônus", "Configurações"];
const emptyMetrics: Metrics = { sales_today: 0, orders_today: 0, average_ticket_today: 0, delivery_orders_today: 0, pos_orders_today: 0, cancelled_today: 0, open_orders: 0, products: 0, low_stock: 0 };
const brl = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
const dateTime = (value: string) => new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
const paymentLabels: Record<string,string> = { PENDING:"Pagamento pendente", PAID:"Pago", FAILED:"Pagamento falhou", CANCELLED:"Pagamento cancelado", PARTIALLY_REFUNDED:"Estorno parcial", REFUNDED:"Estornado" };
const refundLabels: Record<string,string> = { PENDING:"Estorno solicitado", PROCESSING:"Estorno em processamento", COMPLETED:"PIX devolvido", FAILED:"Falha no estorno", CANCELLED:"Estorno cancelado" };

export default function Home() {
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [claimCode, setClaimCode] = useState("");
  const [message, setMessage] = useState("");
  const [store, setStore] = useState<Store | null>(null);
  const [tab, setTab] = useState<Tab>("Dashboard");

  const [metrics, setMetrics] = useState<Metrics>(emptyMetrics);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [refundByOrder, setRefundByOrder] = useState<Record<string, RefundInfo>>({});
  const [refundBusyOrderId, setRefundBusyOrderId] = useState<string | null>(null);
  const [inventory, setInventory] = useState<Inventory[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [finance, setFinance] = useState<Finance[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [bonusBalance, setBonusBalance] = useState(0);
  const [bonusTransactions, setBonusTransactions] = useState<BonusTx[]>([]);
  const [loyaltyProgramId, setLoyaltyProgramId] = useState("");
  const [loyaltyPoints, setLoyaltyPoints] = useState("1");
  const [rewards, setRewards] = useState<Reward[]>([]);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [cashSession, setCashSession] = useState<CashSession | null>(null);
  const [openingBalance, setOpeningBalance] = useState("0");
  const [countedCash, setCountedCash] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [processingSale, setProcessingSale] = useState(false);
  const [processingOrder, setProcessingOrder] = useState<string | null>(null);
  const [inventoryDraft, setInventoryDraft] = useState<Record<string, string>>({});
  const [cashMove, setCashMove] = useState({ type: "SUPPLY", amount: "", reason: "" });
  const [couponForm, setCouponForm] = useState({ code: "", discountType: "PERCENTAGE", discountValue: "10", minimumOrder: "0", maxUses: "" });
  const [rewardForm, setRewardForm] = useState({ name: "", pointsCost: "500", rewardType: "DISCOUNT_FIXED", rewardValue: "20" });

  const cartTotal = useMemo(() => cart.reduce((sum, item) => sum + Number(item.promotional_price ?? item.price) * item.quantity, 0), [cart]);
  const marketplaceOrders = useMemo(() => orders.filter((order) => order.source !== "POS"), [orders]);
  const customerIds = useMemo(() => Array.from(new Set(orders.map((order) => order.customer_id).filter(Boolean))) as string[], [orders]);
  const financeSummary = useMemo(() => finance.reduce((acc, item) => {
    if (item.direction === "CREDIT") acc.credit += item.amount;
    else acc.debit += item.amount;
    return acc;
  }, { credit: 0, debit: 0 }), [finance]);

  async function hydrate() {
    setLoading(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (!session) {
      setSignedIn(false);
      setStore(null);
      setLoading(false);
      return;
    }
    setSignedIn(true);
    const { data: memberships } = await supabase
      .from("store_memberships")
      .select("store_id,role,stores!inner(id,name,status)")
      .eq("user_id", session.user.id)
      .eq("active", true)
      .limit(1);
    if (!memberships?.length) {
      setStore(null);
      setLoading(false);
      return;
    }
    const membership = memberships[0] as any;
    const related = Array.isArray(membership.stores) ? membership.stores[0] : membership.stores;
    const currentStore: Store = { id: membership.store_id, name: related?.name ?? "Minha loja", status: related?.status ?? "PENDING", role: membership.role };
    setStore(currentStore);
    await loadStoreData(currentStore);
    setLoading(false);
  }

  async function loadStoreRefunds(orderRows: any[]) {
    const orderIds = orderRows.map((order) => String(order.id));
    if (!orderIds.length) { setRefundByOrder({}); return; }
    const { data: payments, error: paymentError } = await supabase.from("payments").select("id,order_id").in("order_id", orderIds).eq("method", "PIX");
    if (paymentError || !payments?.length) { setRefundByOrder({}); return; }
    const paymentToOrder = new Map(payments.map((payment: any) => [String(payment.id), String(payment.order_id)]));
    const { data: refunds, error: refundError } = await supabase.from("refunds").select("payment_id,status,amount,created_at,completed_at").in("payment_id", payments.map((payment: any) => payment.id)).order("created_at", { ascending: false });
    if (refundError) { setRefundByOrder({}); return; }
    const next: Record<string, RefundInfo> = {};
    for (const raw of refunds ?? []) {
      const orderId = paymentToOrder.get(String((raw as any).payment_id));
      if (orderId && !next[orderId]) next[orderId] = { ...(raw as any), amount: Number((raw as any).amount) } as RefundInfo;
    }
    setRefundByOrder(next);
  }

  async function loadStoreData(currentStore = store) {
    if (!currentStore) return;
    const [metricsResult, productsResult, ordersResult, cashResult, inventoryResult, couponsResult, financeResult, deliveriesResult, bonusWalletResult, bonusTxResult, loyaltyResult] = await Promise.all([
      supabase.rpc("store_dashboard_metrics", { p_store_id: currentStore.id }),
      supabase.from("products").select("id,name,price,promotional_price,active").eq("store_id", currentStore.id).order("name"),
      supabase.from("orders").select("id,order_number,customer_id,total,status,payment_status,delivery_type,source,created_at").eq("store_id", currentStore.id).order("created_at", { ascending: false }).limit(100),
      supabase.functions.invoke("cash-session-action", { body: { action: "STATUS", storeId: currentStore.id } }),
      supabase.from("inventory_items").select("id,product_id,quantity,minimum_quantity,products(name)").eq("store_id", currentStore.id),
      supabase.from("coupons").select("id,code,discount_type,discount_value,minimum_order,max_uses,ends_at,active").eq("store_id", currentStore.id).order("created_at", { ascending: false }),
      supabase.from("financial_transactions").select("id,transaction_type,direction,amount,status,created_at").eq("store_id", currentStore.id).order("created_at", { ascending: false }).limit(100),
      supabase.from("deliveries").select("id,status,delivery_fee,driver_earning,created_at,orders!inner(order_number,total,store_id)").eq("orders.store_id", currentStore.id).order("created_at", { ascending: false }).limit(50),
      supabase.from("store_bonus_wallets").select("id,balance").eq("store_id", currentStore.id).maybeSingle(),
      supabase.from("store_bonus_transactions").select("id,transaction_type,points,description,created_at,store_bonus_wallets!inner(store_id)").eq("store_bonus_wallets.store_id", currentStore.id).order("created_at", { ascending: false }).limit(50),
      supabase.from("loyalty_programs").select("id,points_per_currency,active").eq("store_id", currentStore.id).maybeSingle(),
    ]);

    if (metricsResult.data) setMetrics({ ...emptyMetrics, ...(metricsResult.data as Metrics) });
    if (productsResult.data) setProducts(productsResult.data.map((item: any) => ({ ...item, price: Number(item.price), promotional_price: item.promotional_price == null ? null : Number(item.promotional_price) })));
    if (ordersResult.data) { const normalizedOrders=ordersResult.data.map((item: any) => ({ ...item, total: Number(item.total) })); setOrders(normalizedOrders); await loadStoreRefunds(normalizedOrders); }
    setCashSession(cashResult.data?.session ? { ...cashResult.data.session, opening_balance: Number(cashResult.data.session.opening_balance) } : null);
    if (inventoryResult.data) setInventory(inventoryResult.data.map((item: any) => ({ ...item, quantity: Number(item.quantity), minimum_quantity: Number(item.minimum_quantity) })));
    if (couponsResult.data) setCoupons(couponsResult.data.map((item: any) => ({ ...item, discount_value: Number(item.discount_value), minimum_order: Number(item.minimum_order) })));
    if (financeResult.data) setFinance(financeResult.data.map((item: any) => ({ ...item, amount: Number(item.amount) })));
    if (deliveriesResult.data) setDeliveries(deliveriesResult.data.map((item: any) => ({ ...item, delivery_fee: Number(item.delivery_fee), driver_earning: Number(item.driver_earning) })));
    setBonusBalance(Number(bonusWalletResult.data?.balance ?? 0));
    if (bonusTxResult.data) setBonusTransactions(bonusTxResult.data as unknown as BonusTx[]);
    if (loyaltyResult.data) {
      setLoyaltyProgramId(loyaltyResult.data.id);
      setLoyaltyPoints(String(Number(loyaltyResult.data.points_per_currency)));
      const rewardResult = await supabase.from("loyalty_rewards").select("id,name,points_cost,reward_type,reward_value,active").eq("program_id", loyaltyResult.data.id).order("points_cost");
      setRewards((rewardResult.data ?? []).map((item: any) => ({ ...item, reward_value: item.reward_value == null ? null : Number(item.reward_value) })));
    }
  }

  useEffect(() => {
    hydrate();
    const { data } = supabase.auth.onAuthStateChange(() => hydrate());
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!store) return;
    const timer = setInterval(() => loadStoreData(store), 20000);
    return () => clearInterval(timer);
  }, [store?.id]);

  async function submitAuth(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    if (authMode === "signup") {
      const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { data: { full_name: "Lojista CLICK-FOOD" } } });
      if (error) setMessage(error.message);
      else if (!data.session) setMessage("Conta criada. Confirme seu e-mail e depois faça login.");
      else await hydrate();
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) setMessage("E-mail ou senha inválidos.");
    }
    setLoading(false);
  }

  async function claimStore() {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("claim-store", { body: { code: claimCode } });
    if (error || data?.error) {
      setMessage(data?.error === "CODE_EXPIRED" ? "Código expirado. Peça outro à Matriz." : "Código inválido ou já utilizado.");
      setLoading(false);
      return;
    }
    await hydrate();
  }

  async function logout() {
    await supabase.auth.signOut();
    setSignedIn(false);
    setStore(null);
    setCart([]);
  }

  function addProduct(product: Product) {
    setCart((current) => {
      const found = current.find((item) => item.id === product.id);
      return found ? current.map((item) => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item) : [...current, { ...product, quantity: 1 }];
    });
  }

  function changeQuantity(id: string, delta: number) {
    setCart((current) => current.map((item) => item.id === id ? { ...item, quantity: item.quantity + delta } : item).filter((item) => item.quantity > 0));
  }

  async function openCash() {
    if (!store) return;
    const value = Number(openingBalance.replace(",", "."));
    const { data, error } = await supabase.functions.invoke("cash-session-action", { body: { action: "OPEN", storeId: store.id, openingBalance: value } });
    if (error || data?.error) return setMessage(data?.error === "CASH_ALREADY_OPEN" ? "O caixa já está aberto." : "Não foi possível abrir o caixa.");
    setCashSession({ ...data.session, opening_balance: Number(data.session.opening_balance) });
    setMessage("Caixa aberto.");
  }

  async function closeCash() {
    if (!store || !cashSession) return;
    const value = Number(countedCash.replace(",", "."));
    if (!Number.isFinite(value) || value < 0) return setMessage("Informe o dinheiro contado.");
    const { data, error } = await supabase.functions.invoke("cash-session-action", { body: { action: "CLOSE", storeId: store.id, countedCash: value } });
    if (error || data?.error) return setMessage("Não foi possível fechar o caixa.");
    setCashSession(null);
    setCountedCash("");
    setMessage(`Caixa fechado. Diferença: ${brl(Number(data.session.difference ?? 0))}.`);
    await loadStoreData(store);
  }

  async function cashMovement() {
    if (!store || !cashSession) return;
    const amount = Number(cashMove.amount.replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0 || !cashMove.reason.trim()) return setMessage("Informe valor e motivo.");
    const { data, error } = await supabase.functions.invoke("cash-session-action", { body: { action: cashMove.type, storeId: store.id, amount, reason: cashMove.reason } });
    if (error || data?.error) return setMessage("Não foi possível movimentar o caixa.");
    setCashMove({ ...cashMove, amount: "", reason: "" });
    setMessage("Movimentação registrada.");
  }

  async function finalizeSale() {
    if (!store || !cashSession || !cart.length) return;
    setProcessingSale(true);
    const { data, error } = await supabase.functions.invoke("create-pos-sale", { body: { storeId: store.id, cashSessionId: cashSession.id, items: cart.map((item) => ({ productId: item.id, quantity: item.quantity })), payments: [{ method: paymentMethod, amount: cartTotal }], discount: 0 } });
    setProcessingSale(false);
    if (error || data?.error) return setMessage(data?.error === "INSUFFICIENT_STOCK" ? "Estoque insuficiente." : "Não foi possível concluir a venda.");
    setCart([]);
    setMessage("Venda concluída com sucesso.");
    await loadStoreData(store);
  }

  async function orderAction(order: Order, action: "ACCEPT" | "REJECT" | "START_PREPARING" | "MARK_READY") {
    if (!store) return;
    let reason: string | undefined;
    if (action === "REJECT") {
      reason = window.prompt("Motivo da recusa:")?.trim() || undefined;
      if (!reason) return setMessage("A recusa exige motivo.");
    }
    setProcessingOrder(order.id);
    const { data, error } = await supabase.functions.invoke("store-order-action", { body: { orderId: order.id, action, reason } });
    if (!error && !data?.error && data.dispatchRequired) {
      const dispatch = await supabase.functions.invoke("dispatch-delivery", { body: { orderId: order.id } });
      setMessage(dispatch.error || dispatch.data?.error ? "Pedido pronto, mas nenhum entregador disponível agora." : "Pedido pronto e chamado enviado.");
    } else {
      if (error || data?.error) setMessage("Não foi possível atualizar o pedido.");
      else if (data?.refundRequired) { const status=String(data?.refundStatus??"PENDING"); setMessage(status==="COMPLETED"?"Pedido recusado e PIX devolvido ao cliente.":status==="FAILED"?"Pedido recusado. A devolução PIX falhou e precisa ser reconciliada.":"Pedido recusado. A devolução PIX foi solicitada e está em processamento."); }
      else setMessage("Pedido atualizado.");
    }
    setProcessingOrder(null);
    await loadStoreData(store);
  }

  async function reconcileStoreRefund(order: Order) {
    setRefundBusyOrderId(order.id); setMessage("");
    const { data, error } = await supabase.functions.invoke("efi-pix-refund", { body: { orderId: order.id, reason: "Reconciliação de estorno pelo Painel Lojista" } });
    if (error || data?.error) setMessage("Não foi possível consultar a devolução PIX agora.");
    else { const status=String(data?.refundStatus??""); setMessage(status==="COMPLETED"?"PIX devolvido ao cliente.":status==="FAILED"?"A devolução falhou na Efí e pode ser tentada novamente.":"A devolução continua em processamento."); }
    await loadStoreData(store); setRefundBusyOrderId(null);
  }

  async function retryDispatch(order: Order) {
    setProcessingOrder(order.id);
    const { data, error } = await supabase.functions.invoke("dispatch-delivery", { body: { orderId: order.id } });
    setProcessingOrder(null);
    setMessage(error || data?.error ? "Nenhum entregador disponível agora." : "Novo chamado enviado.");
  }

  async function adjustStock(productId: string) {
    if (!store) return;
    const quantity = Number((inventoryDraft[productId] ?? "").replace(",", "."));
    if (!Number.isFinite(quantity) || quantity < 0) return setMessage("Informe um estoque válido.");
    const { data, error } = await supabase.functions.invoke("store-management", { body: { action: "INVENTORY_ADJUST", storeId: store.id, productId, quantity, movementType: "ADJUSTMENT", reason: "Ajuste manual pelo Painel Lojista" } });
    setMessage(error || data?.error ? "Não foi possível ajustar o estoque." : "Estoque atualizado.");
    await loadStoreData(store);
  }

  async function createCoupon(event: FormEvent) {
    event.preventDefault();
    if (!store) return;
    const { data, error } = await supabase.functions.invoke("store-management", { body: { action: "CREATE_COUPON", storeId: store.id, code: couponForm.code, discountType: couponForm.discountType, discountValue: Number(couponForm.discountValue.replace(",", ".")), minimumOrder: Number(couponForm.minimumOrder.replace(",", ".")), maxUses: couponForm.maxUses ? Number(couponForm.maxUses) : null } });
    setMessage(error || data?.error ? (data?.error === "COUPON_EXISTS" ? "Esse cupom já existe." : "Não foi possível criar o cupom.") : "Cupom criado.");
    if (!error && !data?.error) setCouponForm({ ...couponForm, code: "" });
    await loadStoreData(store);
  }

  async function toggleCoupon(coupon: Coupon) {
    if (!store) return;
    await supabase.functions.invoke("store-management", { body: { action: "TOGGLE_COUPON", storeId: store.id, couponId: coupon.id, active: !coupon.active } });
    await loadStoreData(store);
  }

  async function saveLoyalty() {
    if (!store) return;
    const { data, error } = await supabase.functions.invoke("store-management", { body: { action: "UPDATE_LOYALTY", storeId: store.id, pointsPerCurrency: Number(loyaltyPoints.replace(",", ".")), active: true } });
    setMessage(error || data?.error ? "Não foi possível salvar a fidelidade." : "Fidelidade atualizada.");
    await loadStoreData(store);
  }

  async function createReward(event: FormEvent) {
    event.preventDefault();
    if (!store) return;
    const { data, error } = await supabase.functions.invoke("store-management", { body: { action: "CREATE_LOYALTY_REWARD", storeId: store.id, name: rewardForm.name, pointsCost: Number(rewardForm.pointsCost), rewardType: rewardForm.rewardType, rewardValue: rewardForm.rewardValue ? Number(rewardForm.rewardValue.replace(",", ".")) : null } });
    setMessage(error || data?.error ? "Não foi possível criar a recompensa." : "Recompensa criada.");
    if (!error && !data?.error) setRewardForm({ ...rewardForm, name: "" });
    await loadStoreData(store);
  }

  if (loading) return <main className="authPage"><div className="authCard"><div className="logo"><span>CLICK</span>-FOOD</div><p>Carregando sua operação...</p></div></main>;

  if (!signedIn) return (
    <main className="authPage">
      <form className="authCard" onSubmit={submitAuth}>
        <div className="logo"><span>CLICK</span>-FOOD</div>
        <p className="authRole">PAINEL DO LOJISTA + PDV</p>
        <h1>{authMode === "login" ? "Entrar na loja" : "Criar conta de lojista"}</h1>
        <label>E-mail<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
        <label>Senha<input type="password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
        {message && <div className="authMessage">{message}</div>}
        <button className="loginButton">{authMode === "login" ? "ENTRAR" : "CRIAR CONTA"}</button>
        <button type="button" className="textButton" onClick={() => setAuthMode(authMode === "login" ? "signup" : "login")}>{authMode === "login" ? "Ainda não tenho conta" : "Já tenho conta"}</button>
      </form>
    </main>
  );

  if (!store) return (
    <main className="authPage">
      <div className="authCard">
        <div className="logo"><span>CLICK</span>-FOOD</div>
        <p className="authRole">ATIVAÇÃO DA LOJA</p>
        <h1>Vincular minha loja</h1>
        <label>Código da loja<input value={claimCode} onChange={(event) => setClaimCode(event.target.value.toUpperCase())} placeholder="CF-LOJA-XXXXXXXXXXXX" /></label>
        {message && <div className="authMessage">{message}</div>}
        <button className="loginButton" onClick={claimStore}>ATIVAR MINHA LOJA</button>
        <button className="textButton" onClick={logout}>Sair</button>
      </div>
    </main>
  );

  function OrdersPanel() {
    return (
      <section className="orderQueue">
        <div className="queueHeader"><div><small>DELIVERY / RETIRADA</small><h2>Fila operacional</h2></div><span>{metrics.open_orders} em aberto</span></div>
        {marketplaceOrders.length ? <div className="queueGrid">{marketplaceOrders.map((order) => (
          <article className={`queueCard status-${order.status.toLowerCase()}`} key={order.id}>
            <div className="queueTop"><b>#{order.order_number}</b><span>{order.delivery_type}</span></div>
            <strong>{brl(order.total)}</strong><p>{order.status} • {paymentLabels[order.payment_status] ?? order.payment_status}</p>
            {refundByOrder[order.id] && <div style={{margin:"8px 0",padding:"9px 10px",borderRadius:10,background:refundByOrder[order.id].status==="COMPLETED"?"#e5f7ea":refundByOrder[order.id].status==="FAILED"?"#fde9e7":"#fff7d9",fontSize:12,fontWeight:800}}>{refundLabels[refundByOrder[order.id].status] ?? refundByOrder[order.id].status} • {brl(refundByOrder[order.id].amount)}{["PENDING","PROCESSING","FAILED"].includes(refundByOrder[order.id].status) && <button style={{marginLeft:8}} disabled={refundBusyOrderId===order.id} onClick={() => reconcileStoreRefund(order)}>{refundBusyOrderId===order.id?"Consultando...":"Atualizar estorno"}</button>}</div>}
            {!refundByOrder[order.id] && ["CANCELLED","REJECTED"].includes(order.status) && ["PAID","PARTIALLY_REFUNDED"].includes(order.payment_status) && <button style={{marginBottom:8}} disabled={refundBusyOrderId===order.id} onClick={() => reconcileStoreRefund(order)}>{refundBusyOrderId===order.id?"Consultando...":"Consultar estorno PIX"}</button>}
            <div className="queueActions">
              {order.status === "WAITING_STORE" && <><button disabled={processingOrder === order.id} onClick={() => orderAction(order, "ACCEPT")}>Aceitar</button><button className="dangerAction" disabled={processingOrder === order.id} onClick={() => orderAction(order, "REJECT")}>Recusar</button></>}
              {order.status === "ACCEPTED" && <button onClick={() => orderAction(order, "START_PREPARING")}>Iniciar preparo</button>}
              {order.status === "PREPARING" && <button onClick={() => orderAction(order, "MARK_READY")}>Marcar pronto</button>}
              {order.status === "READY" && order.delivery_type === "DELIVERY" && <button onClick={() => retryDispatch(order)}>Chamar entregador</button>}
              {["WAITING_DRIVER", "DRIVER_ASSIGNED", "PICKED_UP", "ON_THE_WAY"].includes(order.status) && <span className="inProgress">Entrega em andamento</span>}
            </div>
          </article>
        ))}</div> : <div className="emptyQueue">Nenhum pedido aguardando ação.</div>}
      </section>
    );
  }

  function CashPanel() {
    return (
      <section className="cashPanel">
        <div><small>CAIXA</small><h2>{cashSession ? "Caixa 01 aberto" : "Caixa fechado"}</h2>{cashSession && <p>Saldo inicial: {brl(cashSession.opening_balance)}</p>}</div>
        {!cashSession ? <div className="cashActions"><input value={openingBalance} onChange={(event) => setOpeningBalance(event.target.value)} inputMode="decimal" /><button className="primaryCash" onClick={openCash}>ABRIR CAIXA</button></div> : <div className="cashActions"><input value={countedCash} onChange={(event) => setCountedCash(event.target.value)} inputMode="decimal" placeholder="Dinheiro contado" /><button className="secondaryCash" onClick={closeCash}>FECHAR CAIXA</button></div>}
      </section>
    );
  }

  return (
    <main className="app">
      <aside className="side">
        <div className="logo"><span>CLICK</span>-FOOD</div><p>{store.name}</p>
        <nav>{tabs.map((item) => <button key={item} onClick={() => setTab(item)} className={tab === item ? "active" : ""}>{item}</button>)}</nav>
      </aside>
      <section className="workspace">
        <header><div><small>{store.status === "ACTIVE" ? "LOJA ATIVA" : `LOJA ${store.status}`} • {store.role}</small><h1>{tab}</h1></div><div className="headerActions"><button className="refresh" onClick={() => loadStoreData(store)}>Atualizar</button><button className="refresh" onClick={logout}>Sair</button></div></header>
        {message && <div className="notice">{message}</div>}

        {tab === "Dashboard" && <><div className="kpis"><article><span>Vendas hoje</span><b>{brl(metrics.sales_today)}</b></article><article><span>Pedidos hoje</span><b>{metrics.orders_today}</b></article><article><span>Ticket médio</span><b>{brl(metrics.average_ticket_today)}</b></article><article><span>Pedidos em aberto</span><b>{metrics.open_orders}</b></article></div><div className="managementGrid"><article className="mgCard"><h2>Operação</h2><p>Delivery hoje: <b>{metrics.delivery_orders_today}</b></p><p>PDV hoje: <b>{metrics.pos_orders_today}</b></p><p>Cancelados: <b>{metrics.cancelled_today}</b></p></article><article className="mgCard"><h2>Financeiro</h2><p>Créditos: <b>{brl(financeSummary.credit)}</b></p><p>Débitos: <b>{brl(financeSummary.debit)}</b></p><p>Saldo: <b>{brl(financeSummary.credit - financeSummary.debit)}</b></p></article><article className="mgCard"><h2>CLICK Pontos</h2><strong className="bigValue">{bonusBalance}</strong><p>Pontos disponíveis</p></article></div><OrdersPanel /></>}
        {tab === "Pedidos" && <OrdersPanel />}
        {tab === "PDV" && <><CashPanel /><div className="pos"><section className="catalog"><div className="search">Toque em um produto para adicionar</div><div className="productGrid">{products.filter((item) => item.active).map((item) => <button className="product" onClick={() => addProduct(item)} key={item.id}><span>{item.name}</span><strong>{brl(Number(item.promotional_price ?? item.price))}</strong></button>)}</div></section><aside className="cart"><div className="cartHead"><div><small>PEDIDO ATUAL</small><h2>Balcão</h2></div><button onClick={() => setCart([])}>Limpar</button></div><div className="cartItems">{cart.map((item) => <div className="item" key={item.id}><div><b>{item.quantity}× {item.name}</b><div className="quantity"><button onClick={() => changeQuantity(item.id, -1)}>−</button><button onClick={() => changeQuantity(item.id, 1)}>+</button></div></div><strong>{brl(Number(item.promotional_price ?? item.price) * item.quantity)}</strong></div>)}{!cart.length && <div className="emptyCart">Carrinho vazio.</div>}</div><div className="paymentMethods">{[["CASH", "Dinheiro"], ["PIX", "PIX"], ["DEBIT_CARD", "Débito"], ["CREDIT_CARD", "Crédito"]].map(([value, label]) => <button key={value} className={paymentMethod === value ? "payActive" : ""} onClick={() => setPaymentMethod(value as PaymentMethod)}>{label}</button>)}</div><div className="totals"><div className="grand"><span>Total</span><strong>{brl(cartTotal)}</strong></div></div><button className="checkout" disabled={!cart.length || !cashSession || processingSale} onClick={finalizeSale}>{cashSession ? "FINALIZAR VENDA" : "ABRA O CAIXA"}</button></aside></div></>}
        {tab === "Produtos" && <StoreSetup storeId={store.id} onChanged={() => loadStoreData(store)} />}
        {tab === "Estoque" && <section className="mgCard"><h2>Controle de estoque</h2><p className="muted">Cada ajuste gera histórico.</p><div className="dataList">{products.map((product) => { const stock = inventory.find((item) => item.product_id === product.id); return <div className="dataRow" key={product.id}><div><b>{product.name}</b><small>Atual: {stock ? stock.quantity : "não controlado"}</small></div><div className="rowActions"><input value={inventoryDraft[product.id] ?? String(stock?.quantity ?? 0)} onChange={(event) => setInventoryDraft({ ...inventoryDraft, [product.id]: event.target.value })} /><button onClick={() => adjustStock(product.id)}>Ajustar</button></div></div>; })}</div></section>}
        {tab === "Entregas" && <section className="mgCard"><h2>Entregas</h2><div className="dataList">{deliveries.map((delivery) => { const order = Array.isArray(delivery.orders) ? delivery.orders[0] : delivery.orders; return <div className="dataRow" key={delivery.id}><div><b>Pedido #{order?.order_number ?? "-"}</b><small>{delivery.status} • {dateTime(delivery.created_at)}</small></div><div><b>{brl(delivery.delivery_fee)}</b><small>Entregador {brl(delivery.driver_earning)}</small></div></div>; })}{!deliveries.length && <div className="emptyRow">Nenhuma entrega registrada.</div>}</div></section>}
        {tab === "Clientes" && <section className="mgCard"><h2>Clientes da loja</h2><div className="summaryStrip"><div><b>{customerIds.length}</b><span>clientes únicos</span></div><div><b>{orders.length}</b><span>pedidos registrados</span></div></div><div className="dataList">{customerIds.map((id, index) => { const customerOrders = orders.filter((order) => order.customer_id === id); return <div className="dataRow" key={id}><div><b>Cliente {index + 1}</b><small>{customerOrders.length} pedido(s)</small></div><b>{brl(customerOrders.reduce((sum, order) => sum + order.total, 0))}</b></div>; })}</div></section>}
        {tab === "Cupons" && <div className="managementGrid two"><form className="mgCard" onSubmit={createCoupon}><h2>Novo cupom</h2><label>Código<input value={couponForm.code} onChange={(event) => setCouponForm({ ...couponForm, code: event.target.value.toUpperCase() })} required /></label><label>Tipo<select value={couponForm.discountType} onChange={(event) => setCouponForm({ ...couponForm, discountType: event.target.value })}><option value="PERCENTAGE">Percentual</option><option value="FIXED">Valor fixo</option><option value="FREE_DELIVERY">Entrega grátis</option></select></label><label>Valor<input value={couponForm.discountValue} onChange={(event) => setCouponForm({ ...couponForm, discountValue: event.target.value })} /></label><label>Pedido mínimo<input value={couponForm.minimumOrder} onChange={(event) => setCouponForm({ ...couponForm, minimumOrder: event.target.value })} /></label><label>Limite de usos<input value={couponForm.maxUses} onChange={(event) => setCouponForm({ ...couponForm, maxUses: event.target.value })} /></label><button className="setupPrimary">CRIAR CUPOM</button></form><section className="mgCard"><h2>Cupons cadastrados</h2><div className="dataList">{coupons.map((coupon) => <div className="dataRow" key={coupon.id}><div><b>{coupon.code}</b><small>{coupon.discount_type} • mínimo {brl(coupon.minimum_order)}</small></div><button onClick={() => toggleCoupon(coupon)}>{coupon.active ? "Pausar" : "Ativar"}</button></div>)}{!coupons.length && <div className="emptyRow">Nenhum cupom.</div>}</div></section></div>}
        {tab === "Financeiro" && <><div className="kpis"><article><span>Créditos</span><b>{brl(financeSummary.credit)}</b></article><article><span>Débitos</span><b>{brl(financeSummary.debit)}</b></article><article><span>Saldo contábil</span><b>{brl(financeSummary.credit - financeSummary.debit)}</b></article><article><span>Caixa</span><b>{cashSession ? "ABERTO" : "FECHADO"}</b></article></div><CashPanel />{cashSession && <div className="mgCard compactForm"><h2>Movimentar caixa</h2><select value={cashMove.type} onChange={(event) => setCashMove({ ...cashMove, type: event.target.value })}><option value="SUPPLY">Suprimento</option><option value="WITHDRAWAL">Sangria</option><option value="EXPENSE">Despesa</option></select><input placeholder="Valor" value={cashMove.amount} onChange={(event) => setCashMove({ ...cashMove, amount: event.target.value })} /><input placeholder="Motivo" value={cashMove.reason} onChange={(event) => setCashMove({ ...cashMove, reason: event.target.value })} /><button onClick={cashMovement}>REGISTRAR</button></div>}<section className="mgCard"><h2>Extrato</h2><div className="dataList">{finance.map((item) => <div className="dataRow" key={item.id}><div><b>{item.transaction_type}</b><small>{dateTime(item.created_at)} • {item.status}</small></div><b>{item.direction === "DEBIT" ? "−" : "+"} {brl(item.amount)}</b></div>)}{!finance.length && <div className="emptyRow">Sem lançamentos.</div>}</div></section></>}
        {tab === "Bônus" && <div className="managementGrid two"><section className="mgCard"><h2>CLICK Pontos</h2><strong className="bigValue">{bonusBalance}</strong><div className="dataList">{bonusTransactions.map((item) => <div className="dataRow" key={item.id}><div><b>{item.transaction_type}</b><small>{item.description || dateTime(item.created_at)}</small></div><b>{item.points > 0 ? "+" : ""}{item.points}</b></div>)}</div></section><section className="mgCard"><h2>Fidelidade do cliente</h2><p className="muted">Programa: {loyaltyProgramId ? "ativo" : "será criado ao salvar"}</p><label>Pontos por R$ 1<input value={loyaltyPoints} onChange={(event) => setLoyaltyPoints(event.target.value)} /></label><button className="setupPrimary" onClick={saveLoyalty}>SALVAR REGRA</button><form onSubmit={createReward} className="rewardForm"><h3>Nova recompensa</h3><input placeholder="Nome" value={rewardForm.name} onChange={(event) => setRewardForm({ ...rewardForm, name: event.target.value })} required /><input placeholder="Custo em pontos" value={rewardForm.pointsCost} onChange={(event) => setRewardForm({ ...rewardForm, pointsCost: event.target.value })} /><select value={rewardForm.rewardType} onChange={(event) => setRewardForm({ ...rewardForm, rewardType: event.target.value })}><option value="DISCOUNT_FIXED">Desconto fixo</option><option value="DISCOUNT_PERCENTAGE">Desconto %</option><option value="FREE_DELIVERY">Entrega grátis</option></select><input placeholder="Valor" value={rewardForm.rewardValue} onChange={(event) => setRewardForm({ ...rewardForm, rewardValue: event.target.value })} /><button className="setupPrimary">CRIAR RECOMPENSA</button></form><div className="dataList">{rewards.map((reward) => <div className="dataRow" key={reward.id}><div><b>{reward.name}</b><small>{reward.points_cost} pontos</small></div><span>{reward.active ? "ATIVA" : "PAUSADA"}</span></div>)}</div></section></div>}
        {tab === "Configurações" && <StoreSetup storeId={store.id} onChanged={() => loadStoreData(store)} />}
      </section>
    </main>
  );
}
