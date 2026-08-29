import React, { useEffect, useMemo, useState } from "react";
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

type Tab = "home" | "search" | "orders" | "favorites" | "profile";
type Store = { id: string; name: string; description: string | null; minimum_order: number; average_preparation_time: number };
type Order = { id: string; order_number: number; total: number; status: string; created_at: string; stores: { name: string } | { name: string }[] | null };

const brl = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);

function AuthScreen() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true); setMessage("");
    if (mode === "register") {
      if (!name.trim() || !phone.trim() || password.length < 6) {
        setMessage("Informe nome, telefone e uma senha com pelo menos 6 caracteres."); setBusy(false); return;
      }
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(), password,
        options: { data: { full_name: name.trim(), phone: phone.trim() } },
      });
      if (error) setMessage(error.message);
      else if (!data.session) setMessage("Cadastro criado. Confirme seu e-mail para entrar.");
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) setMessage("E-mail ou senha inválidos.");
    }
    setBusy(false);
  }

  return (
    <SafeAreaView style={styles.authSafe}>
      <StatusBar barStyle="dark-content" backgroundColor="#f7f7f7" />
      <ScrollView contentContainerStyle={styles.authWrap} keyboardShouldPersistTaps="handled">
        <Text style={styles.brand}><Text style={styles.brandYellow}>CLICK</Text>-FOOD</Text>
        <Text style={styles.authKicker}>DELIVERY, FIDELIDADE E BENEFÍCIOS</Text>
        <Text style={styles.authTitle}>{mode === "login" ? "Entre para pedir" : "Crie sua conta"}</Text>
        {mode === "register" && <><TextInput style={styles.authInput} placeholder="Nome completo" value={name} onChangeText={setName} /><TextInput style={styles.authInput} placeholder="Telefone" keyboardType="phone-pad" value={phone} onChangeText={setPhone} /></>}
        <TextInput style={styles.authInput} placeholder="E-mail" keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail} />
        <TextInput style={styles.authInput} placeholder="Senha" secureTextEntry value={password} onChangeText={setPassword} />
        {!!message && <Text style={styles.authMessage}>{message}</Text>}
        <Pressable style={[styles.primaryButton, busy && { opacity: .5 }]} onPress={submit} disabled={busy}><Text style={styles.primaryButtonText}>{busy ? "AGUARDE..." : mode === "login" ? "ENTRAR" : "CRIAR CONTA"}</Text></Pressable>
        <Pressable onPress={() => { setMode(mode === "login" ? "register" : "login"); setMessage(""); }}><Text style={styles.switchText}>{mode === "login" ? "Ainda não tenho conta" : "Já tenho uma conta"}</Text></Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function StoreCard({ store }: { store: Store }) {
  return (
    <Pressable style={styles.storeCard}>
      <View style={styles.storeImage}><Text style={styles.storeEmoji}>🍽️</Text></View>
      <View style={styles.storeBody}>
        <View style={styles.rowBetween}><Text style={styles.storeName}>{store.name}</Text><Text style={styles.liveBadge}>ABERTA</Text></View>
        <Text style={styles.storeMeta}>{store.description || "Cardápio disponível no CLICK-FOOD"}</Text>
        <Text style={styles.storeMeta}>Preparo médio: {store.average_preparation_time} min • Mínimo {brl(store.minimum_order)}</Text>
      </View>
    </Pressable>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [tab, setTab] = useState<Tab>("home");
  const [stores, setStores] = useState<Store[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false); });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    loadStores(); loadOrders();
  }, [session]);

  async function loadStores() {
    const { data } = await supabase.from("stores").select("id,name,description,minimum_order,average_preparation_time").eq("status", "ACTIVE").order("name").limit(30);
    setStores((data ?? []).map((s: any) => ({ ...s, minimum_order: Number(s.minimum_order), average_preparation_time: Number(s.average_preparation_time) })));
  }

  async function loadOrders() {
    if (!session) return;
    const { data } = await supabase.from("orders").select("id,order_number,total,status,created_at,stores(name)").eq("customer_id", session.user.id).order("created_at", { ascending: false }).limit(30);
    setOrders((data ?? []).map((o: any) => ({ ...o, total: Number(o.total) })));
  }

  const filteredStores = useMemo(() => stores.filter((store) => `${store.name} ${store.description ?? ""}`.toLowerCase().includes(query.toLowerCase())), [stores, query]);

  if (loading) return <SafeAreaView style={styles.center}><Text style={styles.brand}><Text style={styles.brandYellow}>CLICK</Text>-FOOD</Text><Text>Carregando...</Text></SafeAreaView>;
  if (!session) return <AuthScreen />;

  const home = <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
    <View style={styles.header}><View><Text style={styles.brand}><Text style={styles.brandYellow}>CLICK</Text>-FOOD</Text><Text style={styles.addressLabel}>DELIVERY NA SUA CIDADE</Text></View><View style={styles.avatar}><Text>{(session.user.user_metadata?.full_name ?? "CF").slice(0,2).toUpperCase()}</Text></View></View>
    <Pressable style={styles.searchBox} onPress={() => setTab("search")}><Text style={styles.searchIcon}>⌕</Text><Text style={styles.searchPlaceholder}>O que você quer pedir hoje?</Text></Pressable>
    <View style={styles.hero}><View style={{ flex: 1 }}><Text style={styles.heroKicker}>CLICK-FOOD</Text><Text style={styles.heroTitle}>Delivery e benefícios em um só app</Text><Text style={styles.heroText}>Lojas ativas aparecem aqui automaticamente.</Text></View><Text style={styles.heroEmoji}>🍔</Text></View>
    <Text style={styles.sectionTitle}>Lojas disponíveis</Text>
    {stores.length ? stores.map((store) => <StoreCard key={store.id} store={store} />) : <View style={styles.empty}><Text style={styles.emptyTitle}>Ainda não há lojas ativas.</Text><Text style={styles.storeMeta}>Assim que uma loja for liberada pela plataforma ela aparecerá aqui.</Text></View>}
  </ScrollView>;

  const search = <ScrollView contentContainerStyle={styles.scrollContent}><Text style={styles.pageTitle}>Buscar</Text><View style={styles.searchBox}><TextInput autoFocus value={query} onChangeText={setQuery} placeholder="Loja ou produto" style={styles.searchInput} /></View>{filteredStores.map((store) => <StoreCard key={store.id} store={store} />)}</ScrollView>;

  const ordersView = <ScrollView contentContainerStyle={styles.scrollContent}><View style={styles.rowBetween}><Text style={styles.pageTitle}>Meus pedidos</Text><Pressable onPress={loadOrders}><Text style={styles.link}>Atualizar</Text></Pressable></View>{orders.length ? orders.map((order) => { const storeRel = Array.isArray(order.stores) ? order.stores[0] : order.stores; return <View key={order.id} style={styles.historyRow}><View><Text style={styles.storeName}>{storeRel?.name ?? "CLICK-FOOD"} • #{order.order_number}</Text><Text style={styles.storeMeta}>{order.status}</Text></View><Text style={styles.orderTotal}>{brl(order.total)}</Text></View>; }) : <View style={styles.empty}><Text style={styles.emptyTitle}>Nenhum pedido ainda.</Text></View>}</ScrollView>;

  const favorites = <ScrollView contentContainerStyle={styles.scrollContent}><Text style={styles.pageTitle}>Favoritos</Text><View style={styles.empty}><Text style={styles.emptyTitle}>Seus favoritos aparecerão aqui.</Text></View></ScrollView>;

  const profile = <ScrollView contentContainerStyle={styles.scrollContent}><Text style={styles.pageTitle}>Minha conta</Text><View style={styles.profileCard}><View style={styles.avatarLarge}><Text style={styles.avatarLargeText}>{(session.user.user_metadata?.full_name ?? "CF").slice(0,2).toUpperCase()}</Text></View><View style={{flex:1}}><Text style={styles.storeName}>{session.user.user_metadata?.full_name ?? "Cliente CLICK-FOOD"}</Text><Text style={styles.storeMeta}>{session.user.email}</Text></View></View>{["Endereços", "Formas de pagamento", "Cupons", "Meus pontos", "Notificações", "Ajuda e suporte", "Termos e privacidade"].map((item) => <Pressable key={item} style={styles.menuRow}><Text style={styles.menuText}>{item}</Text><Text>›</Text></Pressable>)}<Pressable style={styles.signOut} onPress={() => supabase.auth.signOut()}><Text style={styles.signOutText}>SAIR</Text></Pressable></ScrollView>;

  const screen = tab === "home" ? home : tab === "search" ? search : tab === "orders" ? ordersView : tab === "favorites" ? favorites : profile;
  const tabs: Array<[Tab,string,string]> = [["home","⌂","Início"],["search","⌕","Buscar"],["orders","▤","Pedidos"],["favorites","♡","Favoritos"],["profile","○","Perfil"]];

  return <SafeAreaView style={styles.safe}><StatusBar barStyle="dark-content" backgroundColor="#f7f7f7"/><View style={styles.body}>{screen}</View><View style={styles.bottomBar}>{tabs.map(([key,icon,label])=><Pressable key={key} style={styles.tab} onPress={()=>setTab(key)}><Text style={[styles.tabIcon,tab===key&&styles.tabActive]}>{icon}</Text><Text style={[styles.tabLabel,tab===key&&styles.tabActive]}>{label}</Text></Pressable>)}</View></SafeAreaView>;
}

const styles = StyleSheet.create({
  safe:{flex:1,backgroundColor:"#f7f7f7"},body:{flex:1},center:{flex:1,alignItems:"center",justifyContent:"center",gap:10,backgroundColor:"#f7f7f7"},scrollContent:{padding:18,paddingBottom:30},
  authSafe:{flex:1,backgroundColor:"#f7f7f7"},authWrap:{flexGrow:1,justifyContent:"center",padding:26},authKicker:{fontSize:10,fontWeight:"900",color:"#977800",letterSpacing:1.3,marginTop:12},authTitle:{fontSize:30,fontWeight:"900",marginVertical:22},authInput:{backgroundColor:"#fff",borderWidth:1,borderColor:"#e1e1e1",borderRadius:14,padding:14,marginBottom:10,fontSize:15},authMessage:{backgroundColor:"#fff5d2",padding:12,borderRadius:12,marginVertical:8,color:"#6c5800"},switchText:{textAlign:"center",fontWeight:"800",color:"#8d7000",padding:18},
  header:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",marginBottom:18},brand:{fontSize:24,fontWeight:"900",color:"#111"},brandYellow:{color:"#f4c400"},addressLabel:{fontSize:10,fontWeight:"800",color:"#777",marginTop:8},avatar:{width:42,height:42,borderRadius:21,backgroundColor:"#f4c400",alignItems:"center",justifyContent:"center"},
  searchBox:{minHeight:52,borderRadius:16,backgroundColor:"#fff",flexDirection:"row",alignItems:"center",paddingHorizontal:15,borderWidth:1,borderColor:"#ececec",marginBottom:18},searchIcon:{fontSize:22,marginRight:8},searchPlaceholder:{color:"#777"},searchInput:{flex:1,fontSize:15,color:"#111"},
  hero:{backgroundColor:"#111",borderRadius:22,padding:20,minHeight:145,flexDirection:"row",alignItems:"center",marginBottom:24},heroKicker:{color:"#f4c400",fontWeight:"900",fontSize:11},heroTitle:{color:"#fff",fontWeight:"900",fontSize:23,marginTop:8,maxWidth:245},heroText:{color:"#c9c9c9",marginTop:8,fontSize:12},heroEmoji:{fontSize:54},
  sectionTitle:{fontSize:19,fontWeight:"900",color:"#111",marginVertical:12},pageTitle:{fontSize:28,fontWeight:"900",marginBottom:20},rowBetween:{flexDirection:"row",justifyContent:"space-between",alignItems:"center"},link:{color:"#9c7900",fontWeight:"800",fontSize:12},
  storeCard:{backgroundColor:"#fff",borderRadius:20,overflow:"hidden",marginBottom:14,borderWidth:1,borderColor:"#ececec"},storeImage:{height:95,backgroundColor:"#f1f1f1",alignItems:"center",justifyContent:"center"},storeEmoji:{fontSize:42},storeBody:{padding:14},storeName:{fontSize:15,fontWeight:"900",color:"#111"},storeMeta:{color:"#777",fontSize:12,marginTop:4},liveBadge:{fontSize:9,fontWeight:"900",color:"#16784b",backgroundColor:"#e9f8ef",paddingHorizontal:8,paddingVertical:4,borderRadius:9},
  bottomBar:{minHeight:72,flexDirection:"row",backgroundColor:"#fff",borderTopWidth:1,borderTopColor:"#e7e7e7",paddingTop:8,paddingBottom:6},tab:{flex:1,alignItems:"center",justifyContent:"center"},tabIcon:{fontSize:20,color:"#777"},tabLabel:{fontSize:9,color:"#777",marginTop:3,fontWeight:"700"},tabActive:{color:"#9c7900",fontWeight:"900"},
  primaryButton:{backgroundColor:"#111",paddingVertical:15,borderRadius:14,alignItems:"center",marginTop:8},primaryButtonText:{color:"#fff",fontWeight:"900",fontSize:12},historyRow:{backgroundColor:"#fff",padding:15,borderRadius:16,flexDirection:"row",justifyContent:"space-between",alignItems:"center",marginBottom:10},orderTotal:{fontWeight:"900",color:"#8d7000"},
  profileCard:{flexDirection:"row",gap:14,alignItems:"center",backgroundColor:"#fff",padding:16,borderRadius:18,marginBottom:18},avatarLarge:{width:58,height:58,borderRadius:29,backgroundColor:"#f4c400",alignItems:"center",justifyContent:"center"},avatarLargeText:{fontWeight:"900"},menuRow:{backgroundColor:"#fff",minHeight:54,borderBottomWidth:1,borderBottomColor:"#eee",flexDirection:"row",justifyContent:"space-between",alignItems:"center",paddingHorizontal:15},menuText:{fontWeight:"700"},signOut:{backgroundColor:"#fff1f0",padding:14,borderRadius:14,alignItems:"center",marginTop:18},signOutText:{color:"#a12f2a",fontWeight:"900"},empty:{backgroundColor:"#fff",padding:26,borderRadius:18,alignItems:"center"},emptyTitle:{fontWeight:"900",marginBottom:4},
});