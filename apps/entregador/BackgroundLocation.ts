import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { supabase } from "./supabase";

export const DRIVER_BACKGROUND_LOCATION_TASK="clickfood-driver-background-location";
const DRIVER_ID_KEY="@clickfood/driver/background-driver-id";

TaskManager.defineTask(DRIVER_BACKGROUND_LOCATION_TASK,async({data,error})=>{
  if(error||!data)return;
  const driverId=await AsyncStorage.getItem(DRIVER_ID_KEY);
  if(!driverId)return;
  const locations=(data as {locations?:Location.LocationObject[]}).locations??[];
  const latest=locations[locations.length-1];
  if(!latest)return;
  await supabase.from("driver_locations").upsert({
    driver_id:driverId,
    latitude:latest.coords.latitude,
    longitude:latest.coords.longitude,
    heading:latest.coords.heading,
    speed:latest.coords.speed,
    accuracy:latest.coords.accuracy,
    recorded_at:new Date(latest.timestamp||Date.now()).toISOString(),
  },{onConflict:"driver_id"});
});

async function startTask(driverId:string){
  await AsyncStorage.setItem(DRIVER_ID_KEY,driverId);
  const started=await Location.hasStartedLocationUpdatesAsync(DRIVER_BACKGROUND_LOCATION_TASK);
  if(started)return true;
  await Location.startLocationUpdatesAsync(DRIVER_BACKGROUND_LOCATION_TASK,{
    accuracy:Location.Accuracy.High,
    distanceInterval:20,
    timeInterval:10000,
    deferredUpdatesDistance:40,
    deferredUpdatesInterval:15000,
    pausesUpdatesAutomatically:false,
    showsBackgroundLocationIndicator:true,
    foregroundService:{
      notificationTitle:"CLICK-FOOD Entregador online",
      notificationBody:"Localização ativa para chamadas e acompanhamento da entrega.",
      killServiceOnDestroy:false,
    },
  });
  return true;
}

export async function enableBackgroundTracking(driverId:string){
  try{
    const available=await Location.isBackgroundLocationAvailableAsync();
    if(!available)return false;
    let foreground=await Location.getForegroundPermissionsAsync();
    if(foreground.status!=="granted")foreground=await Location.requestForegroundPermissionsAsync();
    if(foreground.status!=="granted")return false;
    let background=await Location.getBackgroundPermissionsAsync();
    if(background.status!=="granted")background=await Location.requestBackgroundPermissionsAsync();
    if(background.status!=="granted")return false;
    return await startTask(driverId);
  }catch{return false;}
}

export async function resumeBackgroundTrackingIfAuthorized(driverId:string){
  try{
    const background=await Location.getBackgroundPermissionsAsync();
    if(background.status!=="granted")return false;
    return await startTask(driverId);
  }catch{return false;}
}

export async function disableBackgroundTracking(){
  try{
    if(await Location.hasStartedLocationUpdatesAsync(DRIVER_BACKGROUND_LOCATION_TASK)){
      await Location.stopLocationUpdatesAsync(DRIVER_BACKGROUND_LOCATION_TASK);
    }
  }finally{
    await AsyncStorage.removeItem(DRIVER_ID_KEY);
  }
}