import fs from 'node:fs';

const path = 'apps/cliente/App.tsx';
let s = fs.readFileSync(path, 'utf8');

function replaceOnce(oldText, newText, label) {
  if (!s.includes(oldText)) throw new Error(`Padrao nao encontrado: ${label}`);
  s = s.replace(oldText, newText);
}

replaceOnce(
  'const deliveryCodeStatuses=new Set(["PICKUP_CONFIRMED","DRIVER_TO_CUSTOMER","DRIVER_AT_CUSTOMER"]);',
  'const deliveryCodeStatuses=new Set(["PICKUP_CONFIRMED","DRIVER_TO_CUSTOMER","DRIVER_AT_CUSTOMER"]);\nconst customerTrackingStatuses=new Set(["DRIVER_TO_CUSTOMER","DRIVER_AT_CUSTOMER"]);',
  'status de rastreamento',
);

replaceOnce(
  'if(!session||tab!=="orders"||!tracking?.driverId)return;',
  'if(!session||tab!=="orders"||!tracking?.driverId||!customerTrackingStatuses.has(String(tracking.deliveryStatus??"")))return;',
  'assinatura realtime',
);

replaceOnce(
  '},[session?.user.id,tab,tracking?.driverId]);',
  '},[session?.user.id,tab,tracking?.driverId,tracking?.deliveryStatus]);',
  'dependencias realtime',
);

replaceOnce(
`    if(delivery.driver_id){
      const[locationResult,cardResult]=await Promise.all([
        supabase.from("driver_locations").select("latitude,longitude").eq("driver_id",delivery.driver_id).maybeSingle(),
        supabase.functions.invoke("customer-driver-card",{body:{orderId:activeOrder.id}}),
      ]);
      if(locationResult.data){driverLat=Number(locationResult.data.latitude);driverLng=Number(locationResult.data.longitude);}
      if(!cardResult.error&&cardResult.data?.driver)setDriverCard(cardResult.data.driver as DriverCard);else setDriverCard(null);
    }else setDriverCard(null);`,
`    if(delivery.driver_id){
      const cardResult=await supabase.functions.invoke("customer-driver-card",{body:{orderId:activeOrder.id}});
      if(!cardResult.error&&cardResult.data?.driver)setDriverCard(cardResult.data.driver as DriverCard);else setDriverCard(null);
      if(customerTrackingStatuses.has(String(delivery.status))){
        const{data:location}=await supabase.from("driver_locations").select("latitude,longitude").eq("driver_id",delivery.driver_id).maybeSingle();
        if(location){driverLat=Number(location.latitude);driverLng=Number(location.longitude);}
      }
    }else setDriverCard(null);`,
  'consulta da localizacao',
);

replaceOnce(
`{tracking.driverId&&<Pressable style={styles.trackDeliveryButton} onPress={()=>setTrackingMapOpen(true)}><Text style={styles.trackDeliveryButtonText}>⌖ RASTREAR ENTREGA</Text></Pressable>}
      {!tracking.driverId&&<Text style={styles.liveHint}>Assim que um entregador aceitar o chamado, o rastreamento ficará disponível.</Text>}`,
`{tracking.driverId&&customerTrackingStatuses.has(String(tracking.deliveryStatus))&&<Pressable style={styles.trackDeliveryButton} onPress={()=>setTrackingMapOpen(true)}><Text style={styles.trackDeliveryButtonText}>⌖ RASTREAR ENTREGA</Text></Pressable>}
      {tracking.driverId&&!customerTrackingStatuses.has(String(tracking.deliveryStatus))&&<Text style={styles.liveHint}>O rastreamento será liberado automaticamente quando o entregador sair do restaurante.</Text>}
      {!tracking.driverId&&<Text style={styles.liveHint}>Assim que um entregador aceitar o chamado, você verá os dados da entrega. O mapa será liberado somente após a saída do restaurante.</Text>}`,
  'botao de rastreamento',
);

replaceOnce(
  '<Modal visible={trackingMapOpen&&!!tracking} animationType="slide"',
  '<Modal visible={trackingMapOpen&&!!tracking&&customerTrackingStatuses.has(String(tracking?.deliveryStatus??""))} animationType="slide"',
  'modal do mapa',
);

fs.writeFileSync(path, s);
console.log('Cliente: rastreamento liberado apenas em DRIVER_TO_CUSTOMER/DRIVER_AT_CUSTOMER.');
