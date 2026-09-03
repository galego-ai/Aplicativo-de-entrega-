from pathlib import Path

cliente = Path('apps/cliente/App.tsx')
entregador = Path('apps/entregador/App.tsx')

c = cliente.read_text(encoding='utf-8')
d = entregador.read_text(encoding='utf-8')

old = '''  async function loadPendingPix(currentOrders:Order[]){
    const pending=currentOrders.find(order=>order.status==="PENDING_PAYMENT"&&order.payment_status!=="PAID");
    if(!pending){setPixCharge(null);return;}
    const{data}=await supabase.from("efi_pix_charges").select("txid,brcode,status,expires_at").eq("order_id",pending.id).order("created_at",{ascending:false}).limit(1).maybeSingle();
    if(data?.brcode)setPixCharge({orderId:pending.id,txid:data.txid,brcode:data.brcode,status:data.status,expires_at:data.expires_at});
  }
'''
new = '''  async function loadPendingPix(currentOrders:Order[]){
    const pendingOrders=currentOrders.filter(order=>order.status==="PENDING_PAYMENT"&&order.payment_status!=="PAID");
    if(!pendingOrders.length){setPixCharge(null);return;}
    const pendingIds=pendingOrders.map(order=>order.id);
    const{data:paymentRows}=await supabase.from("payments").select("order_id,method,created_at").in("order_id",pendingIds).order("created_at",{ascending:false});
    const pixOrderId=(paymentRows??[]).find((row:any)=>String(row.method)==="PIX")?.order_id;
    if(!pixOrderId){setPixCharge(null);return;}
    const{data}=await supabase.from("efi_pix_charges").select("txid,brcode,status,expires_at").eq("order_id",pixOrderId).order("created_at",{ascending:false}).limit(1).maybeSingle();
    if(data?.brcode)setPixCharge({orderId:String(pixOrderId),txid:data.txid,brcode:data.brcode,status:data.status,expires_at:data.expires_at});
    else setPixCharge(null);
  }
'''
if old not in c:
    raise SystemExit('loadPendingPix pattern not found')
c = c.replace(old, new, 1)

old = '''    const statusResult=await supabase.functions.invoke("efi-pix-status",{body:{orderId}});
'''
new = '''    const{data:payment}=await supabase.from("payments").select("method").eq("order_id",orderId).order("created_at",{ascending:false}).limit(1).maybeSingle();
    if(payment?.method!=="PIX"){setPixCharge(null);setMessage("Este pedido não é PIX.");setPixBusy(false);return false;}
    const statusResult=await supabase.functions.invoke("efi-pix-status",{body:{orderId}});
'''
if old not in c:
    raise SystemExit('refreshPix guard pattern not found')
c = c.replace(old, new, 1)

old = '''    {pixCharge&&<PixPaymentCard charge={pixCharge} busy={pixBusy} onRefresh={()=>refreshPix(pixCharge.orderId)}/>}
'''
if old not in c:
    raise SystemExit('global PixPaymentCard pattern not found')
c = c.replace(old, '', 1)

old = '''      return <View style={styles.orderBlock} key={order.id}>
'''
new = '''      return <View style={styles.orderBlock} key={order.id}>
        {pixCharge?.orderId===order.id&&<View style={styles.pixOrderWrap}><Text style={styles.pixOrderContext}>PIX DO PEDIDO #{order.order_number}</Text><PixPaymentCard charge={pixCharge} busy={pixBusy} onRefresh={()=>refreshPix(order.id)}/></View>}
'''
if old not in c:
    raise SystemExit('orderBlock pattern not found')
c = c.replace(old, new, 1)

old = '''  bottom:{minHeight:90,backgroundColor:"#fff",borderTopWidth:1,borderTopColor:"#e5e5e5",flexDirection:"row",paddingTop:6,paddingBottom:22},tab:{flex:1,alignItems:"center",justifyContent:"center"},tabIcon:{fontSize:19,color:"#777"},tabLabel:{fontSize:9,color:"#777",fontWeight:"700",marginTop:3},tabActive:{color:"#8d7000",fontWeight:"900"}
'''
new = '''  bottom:{minHeight:116,backgroundColor:"#fff",borderTopWidth:1,borderTopColor:"#e5e5e5",flexDirection:"row",paddingTop:10,paddingBottom:34,elevation:16},tab:{flex:1,minHeight:68,alignItems:"center",justifyContent:"center",paddingHorizontal:2},tabIcon:{fontSize:28,lineHeight:32,color:"#777"},tabLabel:{fontSize:11,color:"#777",fontWeight:"800",marginTop:4},tabActive:{color:"#8d7000",fontWeight:"900"}
'''
if old not in c:
    raise SystemExit('cliente bottom pattern not found')
c = c.replace(old, new, 1)

anchor = '''  productTileSoldOut:{opacity:.62},productImageSoldOut:{opacity:.55},soldOutText:{marginTop:7,fontSize:10,fontWeight:"900",color:"#9b1c1c",letterSpacing:.7},addButtonSoldOut:{backgroundColor:"#bdbdbd"},
'''
if anchor not in c:
    raise SystemExit('cliente style anchor not found')
c = c.replace(anchor, anchor + '  pixOrderWrap:{marginBottom:10},pixOrderContext:{fontSize:11,fontWeight:"900",color:"#7b6200",letterSpacing:.7,marginBottom:7,marginLeft:2},\n', 1)

old = '''bottom:{minHeight:90,backgroundColor:"#101010",borderTopWidth:1,borderTopColor:"#2a2a2a",flexDirection:"row",paddingTop:6,paddingBottom:22},tab:{flex:1,alignItems:"center",justifyContent:"center"},tabIcon:{fontSize:19,color:"#777"},tabText:{fontSize:9,fontWeight:"700",color:"#888",marginTop:3},tabActive:{color:"#f4c400",fontWeight:"900"}'''
new = '''bottom:{minHeight:116,backgroundColor:"#101010",borderTopWidth:1,borderTopColor:"#2a2a2a",flexDirection:"row",paddingTop:10,paddingBottom:34,elevation:16},tab:{flex:1,minHeight:68,alignItems:"center",justifyContent:"center",paddingHorizontal:2},tabIcon:{fontSize:28,lineHeight:32,color:"#8b8b8b"},tabText:{fontSize:11,fontWeight:"800",color:"#999",marginTop:4},tabActive:{color:"#f4c400",fontWeight:"900"}'''
if old not in d:
    raise SystemExit('entregador bottom pattern not found')
d = d.replace(old, new, 1)

cliente.write_text(c, encoding='utf-8')
entregador.write_text(d, encoding='utf-8')
print('Correções aplicadas: PIX associado ao pedido correto + navegação inferior ampliada.')
