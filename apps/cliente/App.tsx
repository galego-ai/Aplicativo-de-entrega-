import React, { useMemo, useState } from "react";
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

type Tab = "home" | "search" | "orders" | "favorites" | "profile";

const stores = [
  { name: "Pizza Mais", rating: "4,8", eta: "30–45 min", fee: "R$ 5,99", tag: "Pizza" },
  { name: "Burger House", rating: "4,9", eta: "25–35 min", fee: "Entrega grátis", tag: "Hambúrguer" },
  { name: "Doces da Ana", rating: "4,7", eta: "20–30 min", fee: "R$ 4,50", tag: "Doces" },
];

function StoreCard({ name, rating, eta, fee, tag }: (typeof stores)[number]) {
  return (
    <Pressable style={styles.storeCard}>
      <View style={styles.storeImage}><Text style={styles.storeEmoji}>🍽️</Text></View>
      <View style={styles.storeBody}>
        <View style={styles.rowBetween}>
          <Text style={styles.storeName}>{name}</Text>
          <Text style={styles.rating}>★ {rating}</Text>
        </View>
        <Text style={styles.storeMeta}>{tag} • {eta}</Text>
        <Text style={fee === "Entrega grátis" ? styles.freeDelivery : styles.storeMeta}>{fee}</Text>
      </View>
    </Pressable>
  );
}

function Home() {
  return (
    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <View>
          <Text style={styles.brand}><Text style={styles.brandYellow}>CLICK</Text>-FOOD</Text>
          <Text style={styles.addressLabel}>ENTREGAR EM</Text>
          <Text style={styles.address}>Casa • Rua Goiás, 120 ⌄</Text>
        </View>
        <View style={styles.avatar}><Text>ER</Text></View>
      </View>

      <View style={styles.searchBox}>
        <Text style={styles.searchIcon}>⌕</Text>
        <TextInput placeholder="O que você quer pedir hoje?" placeholderTextColor="#7a7a7a" style={styles.searchInput} />
      </View>

      <View style={styles.hero}>
        <View style={{ flex: 1 }}>
          <Text style={styles.heroKicker}>CLICK OFERTA</Text>
          <Text style={styles.heroTitle}>Seu jantar com até 30% OFF</Text>
          <Text style={styles.heroText}>Confira lojas participantes perto de você.</Text>
        </View>
        <Text style={styles.heroEmoji}>🍔</Text>
      </View>

      <Text style={styles.sectionTitle}>Categorias</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categories}>
        {["🍔\nHambúrguer", "🍕\nPizza", "🥤\nBebidas", "🛒\nMercado", "🍰\nDoces", "💊\nFarmácia"].map((item) => {
          const [emoji, label] = item.split("\n");
          return <Pressable key={label} style={styles.category}><Text style={styles.categoryEmoji}>{emoji}</Text><Text style={styles.categoryText}>{label}</Text></Pressable>;
        })}
      </ScrollView>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Lojas próximas</Text>
        <Text style={styles.link}>Ver todas</Text>
      </View>
      {stores.map((store) => <StoreCard key={store.name} {...store} />)}

      <Text style={styles.sectionTitle}>Peça novamente</Text>
      <View style={styles.reorderCard}>
        <View style={styles.reorderIcon}><Text>🍕</Text></View>
        <View style={{ flex: 1 }}><Text style={styles.storeName}>Pizza Mais</Text><Text style={styles.storeMeta}>Último pedido • R$ 60,79</Text></View>
        <Pressable style={styles.smallButton}><Text style={styles.smallButtonText}>REPETIR</Text></Pressable>
      </View>
    </ScrollView>
  );
}

function Search() {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => stores.filter((store) => `${store.name} ${store.tag}`.toLowerCase().includes(query.toLowerCase())), [query]);
  return <ScrollView contentContainerStyle={styles.scrollContent}><Text style={styles.pageTitle}>Buscar</Text><View style={styles.searchBox}><TextInput autoFocus value={query} onChangeText={setQuery} placeholder="Loja, produto ou categoria" style={styles.searchInput} /></View><View style={styles.filterRow}>{["Aberto agora", "Entrega grátis", "★ 4,5+"].map((filter) => <Pressable key={filter} style={styles.filter}><Text>{filter}</Text></Pressable>)}</View>{filtered.map((store) => <StoreCard key={store.name} {...store} />)}</ScrollView>;
}

function Orders() {
  return <ScrollView contentContainerStyle={styles.scrollContent}><Text style={styles.pageTitle}>Meus pedidos</Text><View style={styles.activeOrder}><Text style={styles.activeBadge}>EM PREPARO</Text><Text style={styles.activeTitle}>Pizza Mais • #1842</Text><Text style={styles.storeMeta}>Seu pedido está sendo preparado.</Text><View style={styles.progress}><View style={[styles.progressPart, styles.progressDone]} /><View style={[styles.progressPart, styles.progressDone]} /><View style={styles.progressPart} /><View style={styles.progressPart} /></View><Pressable style={styles.primaryButton}><Text style={styles.primaryButtonText}>ACOMPANHAR PEDIDO</Text></Pressable></View><Text style={styles.sectionTitle}>Anteriores</Text>{["Burger House • R$ 42,50", "Doces da Ana • R$ 28,90"].map((item) => <View key={item} style={styles.historyRow}><View><Text style={styles.storeName}>{item}</Text><Text style={styles.storeMeta}>Entregue</Text></View><Text style={styles.link}>Pedir novamente</Text></View>)}</ScrollView>;
}

function Favorites() {
  return <ScrollView contentContainerStyle={styles.scrollContent}><Text style={styles.pageTitle}>Favoritos</Text>{stores.slice(0, 2).map((store) => <StoreCard key={store.name} {...store} />)}</ScrollView>;
}

function Profile() {
  return <ScrollView contentContainerStyle={styles.scrollContent}><Text style={styles.pageTitle}>Minha conta</Text><View style={styles.profileCard}><View style={styles.avatarLarge}><Text style={styles.avatarLargeText}>ER</Text></View><View><Text style={styles.storeName}>Cliente CLICK-FOOD</Text><Text style={styles.storeMeta}>Conta ativa</Text></View></View>{["Endereços", "Formas de pagamento", "Cupons", "Meus pontos", "Notificações", "Ajuda e suporte", "Termos e privacidade"].map((item) => <Pressable key={item} style={styles.menuRow}><Text style={styles.menuText}>{item}</Text><Text>›</Text></Pressable>)}</ScrollView>;
}

export default function App() {
  const [tab, setTab] = useState<Tab>("home");
  const screen = tab === "home" ? <Home /> : tab === "search" ? <Search /> : tab === "orders" ? <Orders /> : tab === "favorites" ? <Favorites /> : <Profile />;
  const tabs: Array<[Tab, string, string]> = [["home", "⌂", "Início"], ["search", "⌕", "Buscar"], ["orders", "▤", "Pedidos"], ["favorites", "♡", "Favoritos"], ["profile", "○", "Perfil"]];

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor="#f7f7f7" />
      <View style={styles.body}>{screen}</View>
      <View style={styles.bottomBar}>{tabs.map(([key, icon, label]) => <Pressable key={key} style={styles.tab} onPress={() => setTab(key)}><Text style={[styles.tabIcon, tab === key && styles.tabActive]}>{icon}</Text><Text style={[styles.tabLabel, tab === key && styles.tabActive]}>{label}</Text></Pressable>)}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f7f7f7" }, body: { flex: 1 }, scrollContent: { padding: 18, paddingBottom: 30 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 18 },
  brand: { fontSize: 24, fontWeight: "900", color: "#111" }, brandYellow: { color: "#f4c400" }, addressLabel: { fontSize: 10, fontWeight: "800", color: "#777", marginTop: 12 }, address: { fontSize: 14, fontWeight: "700", marginTop: 3 },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: "#f4c400", alignItems: "center", justifyContent: "center" },
  searchBox: { minHeight: 52, borderRadius: 16, backgroundColor: "#fff", flexDirection: "row", alignItems: "center", paddingHorizontal: 15, borderWidth: 1, borderColor: "#ececec", marginBottom: 18 }, searchIcon: { fontSize: 22, marginRight: 8 }, searchInput: { flex: 1, fontSize: 15, color: "#111" },
  hero: { backgroundColor: "#111", borderRadius: 22, padding: 20, minHeight: 145, flexDirection: "row", alignItems: "center", marginBottom: 24 }, heroKicker: { color: "#f4c400", fontWeight: "900", fontSize: 11 }, heroTitle: { color: "#fff", fontWeight: "900", fontSize: 23, marginTop: 8, maxWidth: 245 }, heroText: { color: "#c9c9c9", marginTop: 8, fontSize: 12 }, heroEmoji: { fontSize: 54 },
  sectionTitle: { fontSize: 19, fontWeight: "900", color: "#111", marginVertical: 12 }, sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, link: { color: "#9c7900", fontWeight: "800", fontSize: 12 },
  categories: { gap: 10, paddingBottom: 10 }, category: { width: 80, height: 88, backgroundColor: "#fff", borderRadius: 18, justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: "#ededed" }, categoryEmoji: { fontSize: 28 }, categoryText: { fontSize: 11, fontWeight: "700", marginTop: 6 },
  storeCard: { backgroundColor: "#fff", borderRadius: 20, overflow: "hidden", marginBottom: 14, borderWidth: 1, borderColor: "#ececec" }, storeImage: { height: 105, backgroundColor: "#f1f1f1", alignItems: "center", justifyContent: "center" }, storeEmoji: { fontSize: 45 }, storeBody: { padding: 14 }, rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, storeName: { fontSize: 15, fontWeight: "900", color: "#111" }, rating: { fontSize: 12, fontWeight: "800" }, storeMeta: { color: "#777", fontSize: 12, marginTop: 4 }, freeDelivery: { color: "#16784b", fontSize: 12, fontWeight: "800", marginTop: 4 },
  reorderCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#fff", padding: 14, borderRadius: 18, borderWidth: 1, borderColor: "#ececec" }, reorderIcon: { width: 42, height: 42, borderRadius: 12, backgroundColor: "#f2f2f2", alignItems: "center", justifyContent: "center" }, smallButton: { backgroundColor: "#f4c400", paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10 }, smallButtonText: { fontSize: 10, fontWeight: "900" },
  bottomBar: { minHeight: 72, flexDirection: "row", backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: "#e7e7e7", paddingTop: 8, paddingBottom: 6 }, tab: { flex: 1, alignItems: "center", justifyContent: "center" }, tabIcon: { fontSize: 20, color: "#777" }, tabLabel: { fontSize: 9, color: "#777", marginTop: 3, fontWeight: "700" }, tabActive: { color: "#9c7900", fontWeight: "900" },
  pageTitle: { fontSize: 28, fontWeight: "900", marginBottom: 20 }, filterRow: { flexDirection: "row", gap: 8, marginBottom: 18 }, filter: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#ddd", paddingVertical: 8, paddingHorizontal: 11, borderRadius: 20 },
  activeOrder: { backgroundColor: "#fff", borderRadius: 20, padding: 18, marginBottom: 24, borderWidth: 1, borderColor: "#ececec" }, activeBadge: { color: "#9c7900", fontSize: 10, fontWeight: "900" }, activeTitle: { fontSize: 18, fontWeight: "900", marginTop: 7 }, progress: { flexDirection: "row", gap: 5, marginVertical: 18 }, progressPart: { flex: 1, height: 5, borderRadius: 3, backgroundColor: "#ddd" }, progressDone: { backgroundColor: "#f4c400" }, primaryButton: { backgroundColor: "#111", paddingVertical: 14, borderRadius: 14, alignItems: "center" }, primaryButtonText: { color: "#fff", fontWeight: "900", fontSize: 12 },
  historyRow: { backgroundColor: "#fff", padding: 15, borderRadius: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  profileCard: { flexDirection: "row", gap: 14, alignItems: "center", backgroundColor: "#fff", padding: 16, borderRadius: 18, marginBottom: 18 }, avatarLarge: { width: 58, height: 58, borderRadius: 29, backgroundColor: "#f4c400", alignItems: "center", justifyContent: "center" }, avatarLargeText: { fontWeight: "900" }, menuRow: { backgroundColor: "#fff", minHeight: 54, borderBottomWidth: 1, borderBottomColor: "#eee", flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 15 }, menuText: { fontWeight: "700" },
});
