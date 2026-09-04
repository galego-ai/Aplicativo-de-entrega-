from pathlib import Path
import re


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        if new in text:
            return text
        raise SystemExit(f"Trecho não encontrado: {label}")
    return text.replace(old, new, 1)

# Cliente
p = Path("apps/cliente/App.tsx")
text = p.read_text(encoding="utf-8")
text = replace_once(text,
    'import CustomerOrderReceipt from "./CustomerOrderReceipt";\n',
    'import CustomerOrderReceipt from "./CustomerOrderReceipt";\nimport CustomerDetailedReview from "./CustomerDetailedReview";\n',
    "import CustomerDetailedReview")
text = replace_once(text,
    'type PaymentMethod = "CASH"|"PIX"|"CREDIT_CARD";',
    'type PaymentMethod = "CASH"|"PIX"|"CREDIT_CARD"|"CARD_ON_DELIVERY"|"DEBIT_CARD_ON_DELIVERY";',
    "PaymentMethod")
old_payment_loader = '''  async function loadPaymentMethods(){
    const{data,error}=await supabase.functions.invoke("payment-methods",{body:{}});
    if(error||data?.error){setAvailablePaymentMethods(["CASH"]);setPaymentMethod("CASH");setCardTokenization(null);return;}
    const methods=(data?.methods??[]).filter((m:string)=>m==="CASH"||m==="PIX"||m==="CREDIT_CARD") as PaymentMethod[];
    const next:PaymentMethod[]=methods.includes("CASH")?methods:(["CASH",...methods] as PaymentMethod[]);
    const tokenization=data?.cardTokenization;
    setCardTokenization(tokenization?.provider==="EFI"&&tokenization?.accountId?tokenization as CardTokenizationConfig:null);
    setAvailablePaymentMethods(next);setPaymentMethod(current=>next.includes(current)?current:"CASH");
  }'''
new_payment_loader = '''  async function loadPaymentMethods(storeId?:string){
    const{data,error}=await supabase.functions.invoke("payment-methods",{body:storeId?{storeId}:{}});
    if(error||data?.error){setAvailablePaymentMethods(storeId?["CASH"]:["CASH"]);setPaymentMethod("CASH");setCardTokenization(null);return;}
    const methods=(data?.methods??[]).filter((m:string)=>["CASH","PIX","CREDIT_CARD","CARD_ON_DELIVERY","DEBIT_CARD_ON_DELIVERY"].includes(m)) as PaymentMethod[];
    const next:PaymentMethod[]=methods;
    const tokenization=data?.cardTokenization;
    setCardTokenization(tokenization?.provider==="EFI"&&tokenization?.accountId?tokenization as CardTokenizationConfig:null);
    setAvailablePaymentMethods(next);setPaymentMethod(current=>next.includes(current)?current:(next[0]??"CASH"));
  }'''
text = replace_once(text, old_payment_loader, new_payment_loader, "loadPaymentMethods")
text = replace_once(text,
    '  async function openStore(store:Store){\n    setMessage("");setSelectedStore(store);setCart([]);setCartOpen(false);setSelectedProduct(null);setSelectedCategoryId("ALL");setDeliveryPreview(null);',
    '  async function openStore(store:Store){\n    setMessage("");setSelectedStore(store);setCart([]);setCartOpen(false);setSelectedProduct(null);setSelectedCategoryId("ALL");setDeliveryPreview(null);\n    await loadPaymentMethods(store.id);',
    "openStore payment config")
old_segment = '''      <Text style={styles.section}>Forma de pagamento</Text>
      <View style={styles.segment}>
        <Pressable style={[styles.segmentButton,paymentMethod==="CASH"&&styles.segmentActive]} onPress={()=>setPaymentMethod("CASH")}><Text style={paymentMethod==="CASH"?styles.segmentActiveText:undefined}>Dinheiro</Text></Pressable>
        {availablePaymentMethods.includes("PIX")&&<Pressable style={[styles.segmentButton,paymentMethod==="PIX"&&styles.segmentActive]} onPress={()=>setPaymentMethod("PIX")}><Text style={paymentMethod==="PIX"?styles.segmentActiveText:undefined}>PIX • Efí</Text></Pressable>}
        {availablePaymentMethods.includes("CREDIT_CARD")&&cardTokenization&&<Pressable style={[styles.segmentButton,paymentMethod==="CREDIT_CARD"&&styles.segmentActive]} onPress={()=>setPaymentMethod("CREDIT_CARD")}><Text style={paymentMethod==="CREDIT_CARD"?styles.segmentActiveText:undefined}>Cartão • Efí</Text></Pressable>}
      </View>
      {!availablePaymentMethods.includes("PIX")&&<Text style={styles.meta}>PIX será exibido automaticamente quando a Efí Bank estiver ativada pela Matriz.</Text>}'''
new_segment = '''      <Text style={styles.section}>Forma de pagamento</Text>
      <View style={styles.segment}>
        {availablePaymentMethods.includes("CASH")&&<Pressable style={[styles.segmentButton,paymentMethod==="CASH"&&styles.segmentActive]} onPress={()=>setPaymentMethod("CASH")}><Text style={paymentMethod==="CASH"?styles.segmentActiveText:undefined}>Dinheiro</Text></Pressable>}
        {availablePaymentMethods.includes("PIX")&&<Pressable style={[styles.segmentButton,paymentMethod==="PIX"&&styles.segmentActive]} onPress={()=>setPaymentMethod("PIX")}><Text style={paymentMethod==="PIX"?styles.segmentActiveText:undefined}>PIX • Efí</Text></Pressable>}
        {availablePaymentMethods.includes("CREDIT_CARD")&&cardTokenization&&<Pressable style={[styles.segmentButton,paymentMethod==="CREDIT_CARD"&&styles.segmentActive]} onPress={()=>setPaymentMethod("CREDIT_CARD")}><Text style={paymentMethod==="CREDIT_CARD"?styles.segmentActiveText:undefined}>Cartão online • Efí</Text></Pressable>}
        {availablePaymentMethods.includes("CARD_ON_DELIVERY")&&<Pressable style={[styles.segmentButton,paymentMethod==="CARD_ON_DELIVERY"&&styles.segmentActive]} onPress={()=>setPaymentMethod("CARD_ON_DELIVERY")}><Text style={paymentMethod==="CARD_ON_DELIVERY"?styles.segmentActiveText:undefined}>Crédito na entrega</Text></Pressable>}
        {availablePaymentMethods.includes("DEBIT_CARD_ON_DELIVERY")&&<Pressable style={[styles.segmentButton,paymentMethod==="DEBIT_CARD_ON_DELIVERY"&&styles.segmentActive]} onPress={()=>setPaymentMethod("DEBIT_CARD_ON_DELIVERY")}><Text style={paymentMethod==="DEBIT_CARD_ON_DELIVERY"?styles.segmentActiveText:undefined}>Débito na entrega</Text></Pressable>}
      </View>
      {!availablePaymentMethods.length&&<Text style={styles.meta}>A Matriz ainda não liberou uma forma de pagamento para esta loja.</Text>}'''
text = replace_once(text, old_segment, new_segment, "checkout payment buttons")
old_hint = '{paymentMethod==="PIX"?"No PIX, o pedido só é enviado à loja após a confirmação da Efí.":paymentMethod==="CREDIT_CARD"?"No cartão, número e CVV são tokenizados pela Efí dentro de uma tela segura e não ficam armazenados no CLICK-FOOD.":"No dinheiro, o pedido segue diretamente para a loja."}'
new_hint = '{paymentMethod==="PIX"?"No PIX, o pedido só é enviado à loja após a confirmação da Efí.":paymentMethod==="CREDIT_CARD"?"No cartão online, número e CVV são tokenizados pela Efí e não ficam armazenados no CLICK-FOOD.":paymentMethod==="CARD_ON_DELIVERY"?"No crédito na entrega, o pagamento é feito na maquininha ao receber ou retirar o pedido.":paymentMethod==="DEBIT_CARD_ON_DELIVERY"?"No débito na entrega, o pagamento é feito na maquininha ao receber ou retirar o pedido.":"No dinheiro, o pedido segue diretamente para a loja."}'
text = replace_once(text, old_hint, new_hint, "payment hint")
old_review = '''{ratingOrderId===order.id&&<View style={styles.reviewBox}><Text style={styles.formTitle}>Como foi seu pedido?</Text><View style={styles.stars}>{[1,2,3,4,5].map(value=><Pressable key={value} onPress={()=>setStars(value)}><Text style={[styles.star,value<=stars&&styles.starActive]}>★</Text></Pressable>)}</View><TextInput style={styles.input} placeholder="Comentário opcional" value={reviewComment} onChangeText={setReviewComment}/><Pressable style={[styles.checkout,submittingReview&&styles.disabled]} disabled={submittingReview} onPress={()=>submitReview(order)}><Text style={styles.checkoutText}>{submittingReview?"ENVIANDO...":"ENVIAR AVALIAÇÃO"}</Text></Pressable><Pressable onPress={()=>setRatingOrderId(null)}><Text style={styles.switchText}>Cancelar</Text></Pressable></View>}'''
new_review = '''{ratingOrderId===order.id&&<CustomerDetailedReview order={{id:order.id,store_id:order.store_id}} customerId={session.user.id} onDone={()=>{setReviewedOrderIds(current=>new Set([...current,order.id]));setRatingOrderId(null);setMessage("Avaliação enviada. Obrigado por ajudar o CLICK-FOOD a melhorar.");}} onCancel={()=>setRatingOrderId(null)}/>}'''
text = replace_once(text, old_review, new_review, "detailed review form")
p.write_text(text, encoding="utf-8")

# Lojista - detalhes e impressão
p = Path("apps/lojista/app/OrderDetailsPanel.tsx")
text = p.read_text(encoding="utf-8")
text = replace_once(text,
    'import { supabase } from "../lib/supabase";\n',
    'import { supabase } from "../lib/supabase";\nimport OrderThermalPrintButton from "./OrderThermalPrintButton";\n',
    "OrderThermalPrintButton import")
text = replace_once(text,
    ' customer:{name:string}|null;',
    ' customer:{name:string;phone:string|null}|null;',
    "receipt customer phone type")
text = replace_once(text,
    '<div><small style={{color:"#777"}}>CLIENTE</small><b style={{display:"block"}}>{data.customer?.name??"Cliente CLICK-FOOD"}</b></div>',
    '<div><small style={{color:"#777"}}>CLIENTE</small><b style={{display:"block"}}>{data.customer?.name??"Cliente CLICK-FOOD"}</b>{data.customer?.phone&&<span style={{display:"block",fontSize:12,color:"#555",marginTop:2}}>☎ {data.customer.phone}</span>}</div>',
    "customer phone display")
text = replace_once(text,
    '    {canGeneratePickupCode&&<div style={{marginTop:12,padding:14,borderRadius:14,background:"#111",color:"#fff",border:"2px solid #f4c400"}}>',
    '    <OrderThermalPrintButton orderId={orderId}/>\n    {canGeneratePickupCode&&<div style={{marginTop:12,padding:14,borderRadius:14,background:"#111",color:"#fff",border:"2px solid #f4c400"}}>',
    "thermal print button")
p.write_text(text, encoding="utf-8")

# Lojista - acesso às avaliações
p = Path("apps/lojista/app/page.tsx")
text = p.read_text(encoding="utf-8")
text = replace_once(text,
    '</nav><a href="/entregadores"',
    '</nav><a href="/avaliacoes" style={{display:"block",margin:"10px 0",padding:"12px 14px",borderRadius:10,background:"#111",color:"#f4c400",fontWeight:900,textDecoration:"none",textAlign:"center"}}>Avaliações dos clientes</a><a href="/entregadores"',
    "lojista reviews navigation")
p.write_text(text, encoding="utf-8")

# Matriz - navegação avaliações
p = Path("apps/admin/app/AdminNavigationTools.tsx")
text = p.read_text(encoding="utf-8")
text = replace_once(text,
    '  ["Clientes", "/clientes"],\n',
    '  ["Clientes", "/clientes"],\n  ["Avaliações", "/avaliacoes"],\n',
    "admin reviews navigation")
p.write_text(text, encoding="utf-8")

# Matriz - gerenciador por loja na tela de pagamentos
p = Path("apps/admin/app/pagamentos/page.tsx")
text = p.read_text(encoding="utf-8")
text = replace_once(text,
    'import { supabase } from "../../lib/supabase";\n',
    'import { supabase } from "../../lib/supabase";\nimport StorePaymentMethodsManager from "./StorePaymentMethodsManager";\n',
    "StorePaymentMethodsManager import")
text = replace_once(text,
    '  {message&&<div className="adminNotice">{message}</div>}\n',
    '  {message&&<div className="adminNotice">{message}</div>}\n  <StorePaymentMethodsManager/>\n',
    "store payment manager render")
p.write_text(text, encoding="utf-8")

print("CLICK-FOOD: avaliações, pagamentos por loja, dados do cliente e impressão térmica integrados.")
