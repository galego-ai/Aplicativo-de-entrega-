import React, { useEffect, useRef } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import MapView, { Marker } from "react-native-maps";

type Coordinate = { latitude: number; longitude: number };

type DriverLocation = Coordinate & {
  heading: number | null;
  recordedAt: string;
};

type ActiveDelivery = {
  status: string;
  orderNumber: number;
  pickup: { storeName: string; latitude: number | null; longitude: number | null };
  destination: {
    street: string;
    number: string | null;
    district: string | null;
    latitude: number | null;
    longitude: number | null;
  } | null;
};

function coordinate(latitude: number | null | undefined, longitude: number | null | undefined): Coordinate | null {
  if (latitude == null || longitude == null) return null;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

export default function DriverLiveMap({
  online,
  location,
  active,
}: {
  online: boolean;
  location: DriverLocation | null;
  active: ActiveDelivery | null;
}) {
  const mapRef = useRef<MapView | null>(null);
  const pickup = coordinate(active?.pickup.latitude, active?.pickup.longitude);
  const destination = coordinate(active?.destination?.latitude, active?.destination?.longitude);
  const current = location ? { latitude: location.latitude, longitude: location.longitude } : null;
  const center = current ?? pickup ?? destination;

  const customerPhase = Boolean(
    active && ["PICKUP_CONFIRMED", "DRIVER_TO_CUSTOMER", "DRIVER_AT_CUSTOMER", "CUSTOMER_UNAVAILABLE", "RETURN_REQUIRED"].includes(active.status),
  );
  const navigationTarget = customerPhase ? destination : pickup;
  const navigationLabel = customerPhase ? "ABRIR ROTA ATÉ O CLIENTE" : "ABRIR ROTA ATÉ A LOJA";
  const targetLabel = customerPhase ? "CLIENTE" : "LOJA";

  function fitMap() {
    if (!mapRef.current || !center) return;
    const points = [current, navigationTarget].filter((item): item is Coordinate => Boolean(item));
    if (points.length >= 2) {
      mapRef.current.fitToCoordinates(points, {
        animated: true,
        edgePadding: { top: 56, right: 48, bottom: 56, left: 48 },
      });
      return;
    }
    mapRef.current.animateToRegion({ ...center, latitudeDelta: 0.018, longitudeDelta: 0.018 }, 350);
  }

  useEffect(() => {
    const timer = setTimeout(fitMap, 120);
    return () => clearTimeout(timer);
  }, [location?.latitude, location?.longitude, active?.status, active?.orderNumber]);

  async function openNavigation() {
    if (!navigationTarget) return;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${navigationTarget.latitude},${navigationTarget.longitude}&travelmode=driving`;
    if (await Linking.canOpenURL(url)) await Linking.openURL(url);
  }

  return <View style={styles.card}>
    <View style={styles.header}>
      <View style={{ flex: 1 }}>
        <Text style={styles.kicker}>{active ? `PEDIDO #${active.orderNumber}` : online ? "DISPONÍVEL" : "OFFLINE"}</Text>
        <Text style={styles.title}>{active ? "Mapa da entrega" : online ? "Sua posição no mapa" : "Última posição conhecida"}</Text>
        {active && <Text style={styles.nextTarget}>PRÓXIMO DESTINO: {targetLabel}</Text>}
      </View>
      <View style={[styles.statusDot, online && styles.statusDotOnline]} />
    </View>

    {center ? <MapView
      ref={mapRef}
      style={styles.map}
      initialRegion={{ ...center, latitudeDelta: 0.018, longitudeDelta: 0.018 }}
      onMapReady={fitMap}
      onLayout={fitMap}
      showsCompass
      showsScale={false}
      toolbarEnabled={false}
    >
      {pickup && <Marker coordinate={pickup} title={active?.pickup.storeName ?? "Loja"} description="Retirada do pedido">
        <View style={styles.storePin}><Text style={styles.pinEmoji}>🏪</Text></View>
      </Marker>}
      {destination && <Marker coordinate={destination} title="Cliente" description="Destino da entrega">
        <View style={styles.customerPin}><Text style={styles.pinEmoji}>🏠</Text></View>
      </Marker>}
      {current && <Marker coordinate={current} title="Você" description={online ? "Localização sendo atualizada" : "Última localização registrada"} anchor={{ x: 0.5, y: 0.5 }}>
        <View style={styles.driverPin}><Text style={styles.driverEmoji}>🛵</Text></View>
      </Marker>}
    </MapView> : <View style={styles.waiting}>
      <Text style={styles.waitingEmoji}>📍</Text>
      <Text style={styles.waitingText}>{online ? "Aguardando a primeira leitura do GPS." : "Fique online para registrar sua localização."}</Text>
    </View>}

    <Text style={styles.hint}>
      {active && navigationTarget
        ? `O mapa acompanha sua posição e mantém o próximo destino (${targetLabel.toLowerCase()}) visível automaticamente.`
        : online
          ? "Sua posição é atualizada pelo GPS e enviada ao CLICK-FOOD enquanto você estiver online."
          : "O rastreamento fica pausado quando você está offline."}
    </Text>

    {active && navigationTarget && <Pressable style={styles.routeButton} onPress={openNavigation}>
      <Text style={styles.routeText}>↗ {navigationLabel}</Text>
    </Pressable>}
  </View>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: "#111", borderRadius: 22, marginTop: 18, overflow: "hidden" },
  header: { paddingHorizontal: 16, paddingTop: 15, paddingBottom: 12, flexDirection: "row", alignItems: "center", gap: 10 },
  kicker: { color: "#f4c400", fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
  title: { color: "#fff", fontSize: 17, fontWeight: "900", marginTop: 4 },
  nextTarget: { color: "#aaa", fontSize: 9, fontWeight: "800", marginTop: 5, letterSpacing: 0.5 },
  statusDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: "#777" },
  statusDotOnline: { backgroundColor: "#29a764" },
  map: { height: 270, width: "100%" },
  waiting: { height: 220, backgroundColor: "#242424", alignItems: "center", justifyContent: "center", padding: 24 },
  waitingEmoji: { fontSize: 42, marginBottom: 12 },
  waitingText: { color: "#ccc", textAlign: "center", fontSize: 12 },
  storePin: { backgroundColor: "#fff", borderRadius: 18, padding: 7, borderWidth: 2, borderColor: "#111" },
  customerPin: { backgroundColor: "#fff", borderRadius: 18, padding: 7, borderWidth: 2, borderColor: "#111" },
  driverPin: { backgroundColor: "#f4c400", borderRadius: 24, padding: 8, borderWidth: 2, borderColor: "#111" },
  pinEmoji: { fontSize: 20 },
  driverEmoji: { fontSize: 25 },
  hint: { color: "#aaa", fontSize: 10, lineHeight: 14, paddingHorizontal: 14, paddingTop: 11, paddingBottom: 12 },
  routeButton: { backgroundColor: "#f4c400", paddingVertical: 14, alignItems: "center" },
  routeText: { color: "#111", fontSize: 11, fontWeight: "900" },
});