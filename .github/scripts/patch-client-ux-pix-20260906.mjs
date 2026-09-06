import fs from 'node:fs';

const path='apps/cliente/App.tsx';
let s=fs.readFileSync(path,'utf8');

function requireText(text,label){if(!s.includes(text))throw new Error(`${label}: não encontrado`);}

// As correções de UI já estão no layout atual. Validamos para não regredir.
requireText('style={styles.productImageButton}', 'imagem do produto clicável');
requireText('accessibilityLabel="Limpar carrinho"', 'limpar carrinho');
requireText('style={styles.qtyInput}', 'quantidade digitável');
requireText('{bottomNav}', 'barra inferior persistente');
if(s.includes('const quickCategories=')){
  s=s.replace(/\n\s*const quickCategories=\[[^\n]+\];\n/, '\n');
}

// Recuperação de PIX pendente sempre via backend autenticado, sem depender de leitura direta da tabela.
const start=s.indexOf('  async function loadPendingPix(currentOrders:Order[]){');
const end=s.indexOf('\n\n  async function loadPendingCard',start);
if(start<0||end<0)throw new Error('bloco loadPendingPix não encontrado');
const pending=`  async function loadPendingPix(currentOrders:Order[]){
    const pendingOrders=currentOrders.filter(order=>order.status==="PENDING_PAYMENT"&&order.payment_status!=="PAID");
    if(!pendingOrders.length){setPixCharge(null);return;}
    const pendingIds=pendingOrders.map(order=>order.id);
    const{data:paymentRows}=await supabase.from("payments").select("order_id,method,created_at").in("order_id",pendingIds).order("created_at",{ascending:false});
    const pixOrderId=(paymentRows??[]).find((row:any)=>String(row.method)==="PIX")?.order_id;
    if(!pixOrderId){setPixCharge(null);return;}
    const orderId=String(pixOrderId);
    const statusResult=await supabase.functions.invoke("efi-pix-status",{body:{orderId}});
    if(!statusResult.error&&statusResult.data?.paid){setPixCharge(null);return;}
    const{data:createData,error:createError}=await supabase.functions.invoke("efi-pix-create",{body:{orderId}});
    if(!createError&&!createData?.error&&createData?.charge?.brcode){
      const charge=createData.charge;
      setPixCharge({orderId,txid:charge.txid,brcode:charge.brcode,status:charge.status,expires_at:charge.expires_at});
    }else setPixCharge(null);
  }`;
s=s.slice(0,start)+pending+s.slice(end);

// Consulta automática enquanto o QR está aberto. Webhook continua sendo a confirmação principal;
// este polling é redundância para o app refletir a confirmação rapidamente mesmo em redes móveis instáveis.
if(!s.includes('const pixAutoStatusTimer=')){
  const marker='  const checkoutEstimatedTotal=cartSubtotal+(estimatedDeliveryFee??0);\n';
  if(!s.includes(marker))throw new Error('marcador do total do checkout não encontrado');
  s=s.replace(marker,`${marker}\n  useEffect(()=>{\n    if(!pixCharge?.orderId)return;\n    let running=false;\n    const check=async()=>{\n      if(running)return;\n      running=true;\n      try{\n        const result=await supabase.functions.invoke("efi-pix-status",{body:{orderId:pixCharge.orderId}});\n        if(!result.error&&result.data?.paid){\n          setPixCharge(null);\n          setMessage("Pagamento PIX confirmado! Seu pedido foi enviado para a loja.");\n          await loadOrders();\n          setTab("orders");\n        }\n      }finally{running=false;}\n    };\n    const pixAutoStatusTimer=setInterval(()=>{void check();},4000);\n    void check();\n    return()=>clearInterval(pixAutoStatusTimer);\n  },[pixCharge?.orderId,pixCharge?.txid]);\n`);
}

// Uma segunda tentativa cobre falhas transitórias de rede/gateway antes de cancelar o pedido.
const oldCreate='      const pixResult=await supabase.functions.invoke("efi-pix-create",{body:{orderId}});\n      if(pixResult.error||pixResult.data?.error||!pixResult.data?.charge?.brcode){';
const newCreate='      let pixResult=await supabase.functions.invoke("efi-pix-create",{body:{orderId}});\n      if(pixResult.error||pixResult.data?.error||!pixResult.data?.charge?.brcode){await new Promise(resolve=>setTimeout(resolve,1200));pixResult=await supabase.functions.invoke("efi-pix-create",{body:{orderId}});}\n      if(pixResult.error||pixResult.data?.error||!pixResult.data?.charge?.brcode){';
if(s.includes(oldCreate))s=s.replace(oldCreate,newCreate);
else if(!s.includes('let pixResult=await supabase.functions.invoke("efi-pix-create"'))throw new Error('criação PIX do checkout não encontrada');

fs.writeFileSync(path,s);
console.log('Cliente validado e PIX reforçado: recuperação, retry e confirmação automática.');
