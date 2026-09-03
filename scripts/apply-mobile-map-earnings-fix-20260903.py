from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path: Path, old: str, new: str):
    text = path.read_text(encoding="utf-8")
    if old not in text:
        raise SystemExit(f"Trecho esperado não encontrado em {path}: {old[:120]!r}")
    text = text.replace(old, new, 1)
    path.write_text(text, encoding="utf-8")


# 1) Expo dynamic config: inject the Google Maps key in the native Android manifest
# without committing or printing the secret. Support the common names used in EAS.
config = r'''const MAPS_FALLBACK = "CLICK_FOOD_MAPS_KEY_NOT_CONFIGURED";

module.exports = ({ config }) => {
  const mapsApiKey =
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_MAPS_ANDROID_API_KEY ||
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY ||
    MAPS_FALLBACK;

  return {
    ...config,
    android: {
      ...(config.android || {}),
      config: {
        ...(config.android?.config || {}),
        googleMaps: {
          ...(config.android?.config?.googleMaps || {}),
          apiKey: mapsApiKey,
        },
      },
    },
  };
};
'''
for app in ("cliente", "entregador"):
    (ROOT / "apps" / app / "app.config.js").write_text(config, encoding="utf-8")

# 2) Customer: force Google provider on Android for the tracking map.
cliente = ROOT / "apps" / "cliente" / "App.tsx"
replace_once(
    cliente,
    'import { Alert, Image, Modal, Pressable, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TextInput, View } from "react-native";',
    'import { Alert, Image, Modal, Platform, Pressable, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TextInput, View } from "react-native";',
)
replace_once(
    cliente,
    'import MapView, { Marker } from "react-native-maps";',
    'import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";',
)
replace_once(
    cliente,
    '<MapView style={styles.trackingModalMap} region={{...mapCenter,latitudeDelta:0.018,longitudeDelta:0.018}}>',
    '<MapView provider={Platform.OS==="android"?PROVIDER_GOOGLE:undefined} style={styles.trackingModalMap} region={{...mapCenter,latitudeDelta:0.018,longitudeDelta:0.018}} showsCompass toolbarEnabled={false}>',
)

# 3) Driver map: force Google provider on Android. Keep the GPS data flowing to backend,
# but do not require the driver marker for the map to render.
driver_map = ROOT / "apps" / "entregador" / "DriverLiveMap.tsx"
replace_once(
    driver_map,
    'import { Linking, Pressable, StyleSheet, Text, View } from "react-native";',
    'import { Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";',
)
replace_once(
    driver_map,
    'import MapView, { Marker } from "react-native-maps";',
    'import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";',
)
replace_once(
    driver_map,
    '    {center ? <MapView\n      ref={mapRef}',
    '    {center ? <MapView\n      ref={mapRef}\n      provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}',
)

# 4) Driver earnings privacy: an always-available eye button on the delivery home screen.
driver = ROOT / "apps" / "entregador" / "App.tsx"
replace_once(
    driver,
    '  const [driverLocation,setDriverLocation]=useState<DriverLocation|null>(null); const [mapOpen,setMapOpen]=useState(false);',
    '  const [driverLocation,setDriverLocation]=useState<DriverLocation|null>(null); const [mapOpen,setMapOpen]=useState(false); const [earningsVisible,setEarningsVisible]=useState(true);',
)
replace_once(
    driver,
    '  const completedTotal=useMemo(()=>history.reduce((sum,item)=>sum+item.driverEarning,0),[history]);',
    '  const completedTotal=useMemo(()=>history.reduce((sum,item)=>sum+item.driverEarning,0),[history]);\n  const earningsText=(value:number)=>earningsVisible?brl(value):"R$ ••••";',
)
# Hide all earnings exposed by the main delivery/history/offer surface while privacy mode is on.
text = driver.read_text(encoding="utf-8")
for old, new in [
    ('brl(active.earning)', 'earningsText(active.earning)'),
    ('brl(completedTotal)', 'earningsText(completedTotal)'),
    ('brl(item.driverEarning)', 'earningsText(item.driverEarning)'),
    ('brl(offer.earning)', 'earningsText(offer.earning)'),
]:
    text = text.replace(old, new)
driver.write_text(text, encoding="utf-8")
replace_once(
    driver,
    '  const home=<View style={styles.mapHome}>\n    <DriverLiveMap online={driver.online} location={driverLocation} active={active}/>',
    '  const home=<View style={styles.mapHome}>\n    <Pressable accessibilityRole="button" accessibilityLabel={earningsVisible?"Ocultar ganhos":"Mostrar ganhos"} style={styles.earningsEyeButton} onPress={()=>setEarningsVisible(value=>!value)}><Text style={styles.earningsEyeIcon}>{earningsVisible?"👁️":"🙈"}</Text><Text style={styles.earningsEyeText}>{earningsVisible?"OCULTAR GANHOS":"MOSTRAR GANHOS"}</Text></Pressable>\n    <DriverLiveMap online={driver.online} location={driverLocation} active={active}/>',
)
replace_once(
    driver,
    'const styles=StyleSheet.create({problemButton:',
    'const styles=StyleSheet.create({earningsEyeButton:{position:"absolute",top:12,right:12,zIndex:30,elevation:9,backgroundColor:"rgba(17,17,17,0.94)",borderWidth:1,borderColor:"#f4c400",borderRadius:20,paddingVertical:7,paddingHorizontal:10,flexDirection:"row",alignItems:"center",gap:6},earningsEyeIcon:{fontSize:15},earningsEyeText:{color:"#f4c400",fontSize:8,fontWeight:"900",letterSpacing:.5},problemButton:',
)

print("Patch de mapas e privacidade de ganhos aplicado.")
