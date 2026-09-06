import fs from 'node:fs';

function replaceOnce(source, oldText, newText, label){
  if(source.includes(newText)) return source;
  if(!source.includes(oldText)) throw new Error(`${label}: padrão não encontrado`);
  return source.replace(oldText,newText);
}

const clientPath='apps/cliente/App.tsx';
let client=fs.readFileSync(clientPath,'utf8');
const oldPoll='  useEffect(()=>{if(!session||tab!=="orders")return;const timer=setInterval(()=>loadOrders(),20000);return()=>clearInterval(timer);},[session?.user.id,tab]);';
const newPoll=`  useEffect(()=>{if(!session||tab!=="orders")return;const timer=setInterval(()=>loadOrders(),20000);return()=>clearInterval(timer);},[session?.user.id,tab]);\n  // RELEASE_PIX_AUTO_CONFIRM: enquanto houver PIX pendente, consulta a Efí automaticamente.\n  useEffect(()=>{\n    if(!session?.user.id||tab!=="orders"||!pixCharge?.orderId)return;\n    const orderId=pixCharge.orderId;\n    const expiresAt=pixCharge.expires_at;\n    let cancelled=false;let checking=false;\n    const check=async()=>{\n      if(cancelled||checking||new Date(expiresAt).getTime()<=Date.now())return;\n      checking=true;\n      try{\n        const result=await supabase.functions.invoke("efi-pix-status",{body:{orderId}});\n        if(!cancelled&&!result.error&&!result.data?.error&&result.data?.paid){\n          setPixCharge(null);\n          setMessage("Pagamento PIX confirmado! Seu pedido foi enviado para a loja.");\n          await loadOrders();\n        }\n      }finally{checking=false;}\n    };\n    void check();\n    const timer=setInterval(()=>void check(),4000);\n    return()=>{cancelled=true;clearInterval(timer);};\n  },[session?.user.id,tab,pixCharge?.orderId,pixCharge?.txid,pixCharge?.expires_at]);`;
client=replaceOnce(client,oldPoll,newPoll,'PIX auto confirm');
fs.writeFileSync(clientPath,client);

for(const path of ['apps/entregador/App.tsx','apps/entregador/DriverProfessionalShell.tsx']){
  let s=fs.readFileSync(path,'utf8');
  s=s.replaceAll('"clickfood-chamadas"','"clickfood-chamadas-v2"');
  fs.writeFileSync(path,s);
}

console.log('Release candidate hardening aplicado.');
