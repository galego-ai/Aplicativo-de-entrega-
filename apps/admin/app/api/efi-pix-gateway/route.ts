import { NextResponse } from "next/server";
import https from "node:https";
import { createHash, timingSafeEqual } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EXPECTED_TOKEN_HASH = "8b331573ba58225855686be43939ea3d8243a3bcac8e3d7d9073066427bf27ed";
const EXPECTED_P12_HASH = "1338c49c1ff55bbbd8fcd03141efded58fabf7611f526649a465efe45dee277f";
const EFI_BASE = "https://pix.api.efipay.com.br";

type GatewayBody = {
  gatewayToken?: string;
  p12Base64?: string;
  clientId?: string;
  clientSecret?: string;
  pixKey?: string;
  operation?: "AUTH_CHECK"|"CREATE"|"STATUS"|"CANCEL"|"REFUND_PUT"|"REFUND_GET"|"WEBHOOK_SETUP"|"WEBHOOK_GET"|"SEND"|"SEND_STATUS";
  data?: Record<string, unknown>;
};

function hash(value: Buffer|string){return createHash("sha256").update(value).digest("hex");}
function secureToken(value:string){
  const actual=Buffer.from(hash(value),"hex");
  const expected=Buffer.from(EXPECTED_TOKEN_HASH,"hex");
  return actual.length===expected.length&&timingSafeEqual(actual,expected);
}

function requestJson(input:{p12:Buffer;path:string;method:string;headers?:Record<string,string>;body?:unknown}){
  const url=new URL(input.path,EFI_BASE);
  const payload=input.body===undefined?undefined:JSON.stringify(input.body);
  return new Promise<{status:number;ok:boolean;data:any}>((resolve,reject)=>{
    const req=https.request({
      hostname:url.hostname,
      port:443,
      path:url.pathname+url.search,
      method:input.method,
      pfx:input.p12,
      passphrase:"",
      rejectUnauthorized:true,
      headers:{
        Accept:"application/json",
        "Content-Type":"application/json",
        "User-Agent":"CLICK-FOOD-EfiGateway/1.1",
        ...(input.headers??{}),
        ...(payload?{"Content-Length":Buffer.byteLength(payload).toString()}:{}),
      },
    },res=>{
      let raw="";
      res.on("data",chunk=>raw+=String(chunk));
      res.on("end",()=>{
        let data:any={};
        try{data=raw?JSON.parse(raw):{};}catch{data={raw:raw.slice(0,1000)};}
        const status=res.statusCode??500;
        resolve({status,ok:status>=200&&status<300,data});
      });
    });
    req.on("error",reject);
    req.setTimeout(20000,()=>req.destroy(new Error("EFI_TIMEOUT")));
    if(payload)req.write(payload);
    req.end();
  });
}

async function accessToken(p12:Buffer,clientId:string,clientSecret:string){
  const basic=Buffer.from(`${clientId}:${clientSecret}`,"utf8").toString("base64");
  const result=await requestJson({p12,path:"/oauth/token",method:"POST",headers:{Authorization:`Basic ${basic}`},body:{grant_type:"client_credentials"}});
  if(!result.ok||!result.data?.access_token)return {ok:false,status:result.status,token:null,scope:""};
  return {ok:true,status:result.status,token:String(result.data.access_token),scope:String(result.data?.scope??"")};
}

function safeProvider(result:{status:number;ok:boolean;data:any}){return {ok:result.ok,providerStatus:result.status,data:result.data};}

export async function POST(req:Request){
  try{
    const body=(await req.json()) as GatewayBody;
    const gatewayToken=String(body.gatewayToken??"");
    if(!gatewayToken||!secureToken(gatewayToken))return NextResponse.json({ok:false,error:"GATEWAY_DENIED"},{status:401});

    const p12Base64=String(body.p12Base64??"").replace(/\s/g,"");
    const clientId=String(body.clientId??"").trim();
    const clientSecret=String(body.clientSecret??"").trim();
    const pixKey=String(body.pixKey??"").trim();
    if(!p12Base64||!clientId||!clientSecret)return NextResponse.json({ok:false,error:"EFI_CONFIG_MISSING"},{status:400});
    const p12=Buffer.from(p12Base64,"base64");
    if(hash(p12)!==EXPECTED_P12_HASH)return NextResponse.json({ok:false,error:"EFI_CERTIFICATE_REJECTED"},{status:403});

    const auth=await accessToken(p12,clientId,clientSecret);
    if(!auth.ok||!auth.token)return NextResponse.json({ok:false,error:"EFI_AUTH_FAILED",providerStatus:auth.status},{status:502});
    if(body.operation==="AUTH_CHECK")return NextResponse.json({ok:true,authenticated:true,providerStatus:auth.status,scope:auth.scope.split(/\s+/).filter(Boolean)});

    const token=auth.token;
    const headers={Authorization:`Bearer ${token}`};
    const data=body.data??{};

    if(body.operation==="CREATE"){
      const txid=String(data.txid??"").replace(/[^A-Za-z0-9]/g,"").slice(0,35);
      const amount=Number(data.amount??0);
      const expiration=Math.max(60,Math.min(86400,Number(data.expiration??900)));
      const description=String(data.description??"Pedido CLICK-FOOD").slice(0,140);
      if(!txid||!Number.isFinite(amount)||amount<=0||!pixKey)return NextResponse.json({ok:false,error:"INVALID_CREATE_INPUT"},{status:400});
      const cob=await requestJson({p12,path:`/v2/cob/${encodeURIComponent(txid)}`,method:"PUT",headers,body:{calendario:{expiracao:expiration},valor:{original:amount.toFixed(2)},chave:pixKey,solicitacaoPagador:description}});
      if(!cob.ok)return NextResponse.json(safeProvider(cob),{status:502});
      const locId=Number(cob.data?.loc?.id??0);
      if(!locId)return NextResponse.json({ok:false,error:"EFI_LOCATION_MISSING",providerStatus:cob.status},{status:502});
      const qr=await requestJson({p12,path:`/v2/loc/${locId}/qrcode`,method:"GET",headers});
      if(!qr.ok)return NextResponse.json(safeProvider(qr),{status:502});
      return NextResponse.json({ok:true,providerStatus:cob.status,cob:cob.data,qr:qr.data});
    }

    if(body.operation==="STATUS"){
      const txid=String(data.txid??"");if(!txid)return NextResponse.json({ok:false,error:"TXID_REQUIRED"},{status:400});
      const result=await requestJson({p12,path:`/v2/cob/${encodeURIComponent(txid)}`,method:"GET",headers});
      return NextResponse.json(safeProvider(result),{status:result.ok?200:502});
    }

    if(body.operation==="CANCEL"){
      const txid=String(data.txid??"");if(!txid)return NextResponse.json({ok:false,error:"TXID_REQUIRED"},{status:400});
      const result=await requestJson({p12,path:`/v2/cob/${encodeURIComponent(txid)}`,method:"PATCH",headers,body:{status:"REMOVIDA_PELO_USUARIO_RECEBEDOR"}});
      return NextResponse.json(safeProvider(result),{status:result.ok?200:502});
    }

    if(body.operation==="REFUND_PUT"||body.operation==="REFUND_GET"){
      const e2e=String(data.endToEndId??"");const refundId=String(data.refundId??"");
      if(!e2e||!refundId)return NextResponse.json({ok:false,error:"REFUND_REFERENCE_REQUIRED"},{status:400});
      const path=`/v2/pix/${encodeURIComponent(e2e)}/devolucao/${encodeURIComponent(refundId)}`;
      const result=await requestJson({p12,path,method:body.operation==="REFUND_PUT"?"PUT":"GET",headers,body:body.operation==="REFUND_PUT"?{valor:Number(data.amount??0).toFixed(2)}:undefined});
      return NextResponse.json(safeProvider(result),{status:result.ok?200:502});
    }

    if(body.operation==="WEBHOOK_SETUP"){
      const webhookUrl=String(data.webhookUrl??"");
      if(!pixKey||!webhookUrl.startsWith("https://"))return NextResponse.json({ok:false,error:"WEBHOOK_INPUT_INVALID"},{status:400});
      const result=await requestJson({p12,path:`/v2/webhook/${encodeURIComponent(pixKey)}`,method:"PUT",headers:{...headers,"x-skip-mtls-checking":"true"},body:{webhookUrl}});
      return NextResponse.json(safeProvider(result),{status:result.ok?200:502});
    }

    if(body.operation==="WEBHOOK_GET"){
      if(!pixKey)return NextResponse.json({ok:false,error:"PIX_KEY_REQUIRED"},{status:400});
      const result=await requestJson({p12,path:`/v2/webhook/${encodeURIComponent(pixKey)}`,method:"GET",headers});
      return NextResponse.json(safeProvider(result),{status:result.ok?200:502});
    }

    if(body.operation==="SEND"){
      const idEnvio=String(data.idEnvio??"").trim();
      const destinationKey=String(data.destinationKey??"").trim();
      const amount=Number(data.amount??0);
      const description=String(data.description??"Repasse CLICK-FOOD").slice(0,140);
      if(!idEnvio||!destinationKey||!pixKey||!Number.isFinite(amount)||amount<=0)return NextResponse.json({ok:false,error:"INVALID_SEND_INPUT"},{status:400});
      const result=await requestJson({p12,path:`/v3/gn/pix/${encodeURIComponent(idEnvio)}`,method:"PUT",headers,body:{valor:amount.toFixed(2),pagador:{chave:pixKey,infoPagador:description},favorecido:{chave:destinationKey}}});
      return NextResponse.json(safeProvider(result),{status:result.ok?200:502});
    }

    if(body.operation==="SEND_STATUS"){
      const idEnvio=String(data.idEnvio??"").trim();
      if(!idEnvio)return NextResponse.json({ok:false,error:"SEND_ID_REQUIRED"},{status:400});
      const result=await requestJson({p12,path:`/v2/gn/pix/enviados/id-envio/${encodeURIComponent(idEnvio)}`,method:"GET",headers});
      return NextResponse.json(safeProvider(result),{status:result.ok?200:502});
    }

    return NextResponse.json({ok:false,error:"OPERATION_NOT_ALLOWED"},{status:400});
  }catch{
    return NextResponse.json({ok:false,error:"EFI_GATEWAY_FAILURE"},{status:500});
  }
}
