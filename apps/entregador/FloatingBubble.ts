import { NativeModules, Platform } from "react-native";

type FloatingBubbleNative={
  canDrawOverlays:()=>Promise<boolean>;
  requestOverlayPermission:()=>Promise<boolean>;
  start:()=>Promise<boolean>;
  stop:()=>Promise<boolean>;
};

const native=NativeModules.ClickFoodFloatingBubble as FloatingBubbleNative|undefined;

export function hasFloatingBubbleNativeModule(){
  return Platform.OS==="android"&&Boolean(native);
}

export async function canUseFloatingBubble(){
  if(Platform.OS!=="android")return false;
  if(!native)return false;
  try{return Boolean(await native.canDrawOverlays());}catch{return false;}
}

export async function requestFloatingBubblePermission(){
  if(Platform.OS!=="android"||!native)return false;
  try{return Boolean(await native.requestOverlayPermission());}catch{return false;}
}

export async function startFloatingBubble(){
  if(Platform.OS!=="android"||!native)return false;
  try{return Boolean(await native.start());}catch{return false;}
}

export async function stopFloatingBubble(){
  if(Platform.OS!=="android"||!native)return true;
  try{return Boolean(await native.stop());}catch{return false;}
}
