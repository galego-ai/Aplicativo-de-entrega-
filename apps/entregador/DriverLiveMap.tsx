import React, { useEffect, useRef } from "react";
import { Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";

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
  const customerPhase = Boolean(
    active && ["PICKUP_CONFIRMED", "DRIVER_TO_CUSTOMER", "DRIVER_AT_CUSTOMER", "CUSTOMER_UNAVAILABLE", "RETURN_REQUIRED"].includes(active.status),
  );
  const navigationTarget = customerPhase ? destination : pickup;
  const navigationLabel = customerPhase ? "ROTA ATÉ O CLIENTE" : "ROTA ATÉ A LOJA";
  const targetLabel = customerPhase ? "CLIENTE" : "LOJA";
  const center = current ?? navigationTarget ?? pickup ?? destination;

  function fitMap() {
    if (!mapRef.current || !center) return;
    const points = [current, navigationTarget].filter((item): item is Coordinate => Boolean(item));
    if (points.length >= 2) {
      mapRef.current.fitToCoordinates(points, {
        animated: true,
        edgePadding: { top: 120, right: 55, bottom: 170, left: 55 },
      });
      return;
    }
    mapRef.current.animateToRegion({ ...center, latitudeDelta: 0.014, longitudeDelta: 0.014 }, 300);
  }

  useEffect(() => {
    const timer = setTimeout(fitMap, 100);
    return () => clearTimeout(timer);
  }, [active?.status, active?.orderNumber, location?.latitude, location?.longitude]);

  async function openNavigation() {
    if (!navigationTarget) return;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${navigationTarget.latitude},${navigationTarget.longitude}&travelmode=driving`;
    if (await Linking.canOpenURL(url)) await Linking.openURL(url);
  }

  return <View style={styles.root}>
    {center ? <MapView
      ref={mapRef}
      provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
      style={styles.map}
      initialRegion={{ ...center, latitudeDelta: 0.014, longitudeDelta: 0.014 }}
      onMapReady={fitMap}
      showsCompass
      showsScale={false}
      toolbarEnabled={false}
      rotateEnabled
    >
      {current && <Marker coordinate={current} title="Você" description={online ? "Sua localização atual" : "Última localização conhecida"}>
        <View style={styles.driverPin}><Text style={styles.driverEmoji}>🛵</Text></View>
      </Marker>}
      {pickup && <Marker coordinate={pickup} title={active?.pickup.storeName ?? "Loja"} description="Retirada do pedido">
        <View style={styles.storePin}><Text style={styles.pinEmoji}>🏪</Text></View>
      </Marker>}
      {destination && <Marker coordinate={destination} title="Cliente" description="Destino da entrega">
        <View style={styles.customerPin}><Text style={styles.pinEmoji}>🏠</Text></View>
      </Marker>}
    </MapView> : <View style={styles.waiting}>
      <Text style={styles.waitingEmoji}>📍</Text>
      <Text style={styles.waitingText}>{online ? "Obtendo sua localização pelo GPS..." : "Fique online para mostrar sua localização no mapa."}</Text>
    </View>}

    <View style={styles.statusCard} pointerEvents="none">
      <View style={{ flex: 1 }}>
        <Text style={styles.kicker}>{active ? `PEDIDO #${active.orderNumber}` : online ? "VOCÊ ESTÁ ONLINE" : "VOCÊ ESTÁ OFFLINE"}</Text>
        <Text style={styles.title}>{active ? `Próximo destino: ${targetLabel}` : current ? "Sua localização em tempo real" : "Aguardando GPS"}</Text>
      </View>
      <View style={[styles.statusDot, online && styles.statusDotOnline]} />
    </View>

    {active && navigationTarget && <Pressable style={styles.routeButton} onPress={openNavigation}>
      <Text style={styles.routeText}>↗ {navigationLabel}</Text>
    </Pressable>}
  </View>;
}

const fill = { position: "absolute" as const, left: 0, right: 0, top: 0, bottom: 0 };

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#111" },
  map: { ...fill },
  waiting: { ...fill, backgroundColor: "#242424", alignItems: "center", justifyContent: "center", padding: 24 },
  waitingEmoji: { fontSize: 42, marginBottom: 12 },
  waitingText: { color: "#ccc", textAlign: "center", fontSize: 12 },
  statusCard: { position: "absolute", top: 10, left: 10, right: 10, backgroundColor: "rgba(17,17,17,0.90)", borderWidth: 1, borderColor: "#343434", borderRadius: 14, paddingHorizontal: 13, paddingVertical: 11, flexDirection: "row", alignItems: "center", gap: 10 },
  kicker: { color: "#f4c400", fontSize: 9, fontWeight: "900", letterSpacing: 1.1 },
  title: { color: "#fff", fontSize: 14, fontWeight: "900", marginTop: 3 },
  statusDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: "#777" },
  statusDotOnline: { backgroundColor: "#29a764" },
  storePin: { backgroundColor: "#fff", borderRadius: 18, padding: 7, borderWidth: 2, borderColor: "#111" },
  customerPin: { backgroundColor: "#fff", borderRadius: 18, padding: 7, borderWidth: 2, borderColor: "#111" },
  driverPin: { backgroundColor: "#f4c400", borderRadius: 24, padding: 8, borderWidth: 2, borderColor: "#111" },
  pinEmoji: { fontSize: 20 },
  driverEmoji: { fontSize: 24 },
  routeButton: { position: "absolute", top: 78, right: 10, backgroundColor: "#f4c400", borderRadius: 11, paddingVertical: 10, paddingHorizontal: 12, elevation: 5 },
  routeText: { color: "#111", fontSize: 10, fontWeight: "900" },
});