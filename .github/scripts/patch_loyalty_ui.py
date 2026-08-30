from pathlib import Path

p=Path('apps/cliente/App.tsx')
s=p.read_text()
old='type DriverCard = { id:string; name:string; avatarUrl:string|null; rating:number; vehicle:{type:string;brand:string|null;model:string|null;plate:string|null}|null };\ntype ProductGroupLink = { product_id:string; option_group_id:string };'
new='''type DriverCard = { id:string; name:string; avatarUrl:string|null; rating:number; vehicle:{type:string;brand:string|null;model:string|null;plate:string|null}|null };
type LoyaltyReward = { id:string; name:string; points_cost:number; reward_type:string; reward_value:number|null; product_id:string|null; active:boolean };
type LoyaltyRedemption = { id:string; reward_id:string; points_spent:number; status:string; expires_at:string; used_at:string|null; rewardName:string; coupon:{id:string;code:string;discount_type:string;discount_value:number;active:boolean;ends_at:string|null}|null };
type LoyaltyWallet = { id:string; storeId:string; storeName:string; storeLogo:string|null; balance:number; pointsPerCurrency:number; rewards:LoyaltyReward[]; redemptions:LoyaltyRedemption[]; transactions:Array<{id:string;transaction_type:string;points:number;created_at:string}> };
type ProductGroupLink = { product_id:string; option_group_id:string };'''
if old not in s: raise SystemExit('client type marker not found')
s=s.replace(old,new,1)

old='  const[refundByOrder,setRefundByOrder]=useState<Record<string,RefundInfo>>({}); const[refundBusyOrderId,setRefundBusyOrderId]=useState<string|null>(null);\n  const[addressForm,setAddressForm]'
new='  const[refundByOrder,setRefundByOrder]=useState<Record<string,RefundInfo>>({}); const[refundBusyOrderId,setRefundBusyOrderId]=useState<string|null>(null);\n  const[loyaltyWallets,setLoyaltyWallets]=useState<LoyaltyWallet[]>([]); const[loyaltyTotal,setLoyaltyTotal]=useState(0); const[loyaltyBusyReward,setLoyaltyBusyReward]=useState<string|null>(null);\n  const[addressForm,setAddressForm]'
if old not in s: raise SystemExit('client state marker not found')
s=s.replace(old,new,1)

old='useEffect(()=>{if(session){loadStores();loadOrders();loadAddresses();loadReviewed();loadPaymentMethods();}else{setTracking(null);setDriverCard(null);setOrders([]);setPixCharge(null);}},[session]);'
new='useEffect(()=>{if(session){loadStores();loadOrders();loadAddresses();loadReviewed();loadPaymentMethods();loadLoyalty();}else{setTracking(null);setDriverCard(null);setOrders([]);setPixCharge(null);setLoyaltyWallets([]);setLoyaltyTotal(0);}},[session]);'
if old not in s: raise SystemExit('client session effect marker not found')
s=s.replace(old,new,1)

marker='  async function loadStores(){\n'
insert='''  async function loadLoyalty(){
    if(!session)return;
    const{data,error}=await supabase.functions.invoke("customer-loyalty",{body:{action:"SUMMARY"}});
    if(error||data?.error)return;
    setLoyaltyWallets((data?.wallets??[]) as LoyaltyWallet[]);
    setLoyaltyTotal(Number(data?.totalPoints??0));
  }

  async function redeemLoyaltyReward(wallet:LoyaltyWallet,reward:LoyaltyReward){
    if(wallet.balance<Number(reward.points_cost)||loyaltyBusyReward)return;
    setLoyaltyBusyReward(reward.id);setMessage("");
    const{data,error}=await supabase.functions.invoke("customer-loyalty",{body:{action:"REDEEM",rewardId:reward.id}});
    setLoyaltyBusyReward(null);
    if(error||data?.error){setMessage(data?.error==="INSUFFICIENT_LOYALTY_POINTS"?"Seu saldo de pontos mudou e não é suficiente para este resgate.":"Não foi possível resgatar esta recompensa agora.");await loadLoyalty();return;}
    const code=String(data?.redemption?.couponCode??"");
    setMessage(code?`Recompensa resgatada! Use o cupom ${code} no checkout.`:"Recompensa resgatada com sucesso.");
    await loadLoyalty();
  }

'''
if marker not in s: raise SystemExit('client loadStores marker not found')
s=s.replace(marker,insert+marker,1)

old='''  const profile=<ScrollView contentContainerStyle={styles.scroll}>
    <Text style={styles.pageTitle}>Minha conta</Text>
    <View style={styles.profile}><View style={styles.avatar}><Text>{String(session.user.user_metadata?.full_name??"CF").slice(0,2).toUpperCase()}</Text></View><View><Text style={styles.productName}>{session.user.user_metadata?.full_name??"Cliente CLICK-FOOD"}</Text><Text style={styles.meta}>{session.user.email}</Text></View></View>
    <Text style={styles.section}>Endereços salvos</Text>{addresses.map(address=><View style={styles.addressCard} key={address.id}><Text style={styles.productName}>{address.label||"Endereço"}</Text><Text style={styles.meta}>{address.street}, {address.number}</Text></View>)}
    <Pressable style={styles.signOut} onPress={()=>supabase.auth.signOut()}><Text style={styles.signOutText}>SAIR</Text></Pressable>
  </ScrollView>;'''
new='''  const profile=<ScrollView contentContainerStyle={styles.scroll}>
    <Text style={styles.pageTitle}>Minha conta</Text>
    <View style={styles.profile}><View style={styles.avatar}><Text>{String(session.user.user_metadata?.full_name??"CF").slice(0,2).toUpperCase()}</Text></View><View><Text style={styles.productName}>{session.user.user_metadata?.full_name??"Cliente CLICK-FOOD"}</Text><Text style={styles.meta}>{session.user.email}</Text></View></View>
    {!!message&&<Text style={styles.notice}>{message}</Text>}
    <View style={styles.loyaltyHero}><View><Text style={styles.loyaltyKicker}>MEUS PONTOS</Text><Text style={styles.loyaltyTotal}>{loyaltyTotal}</Text></View><Text style={styles.loyaltyHeroEmoji}>★</Text></View>
    <Text style={styles.section}>Fidelidade</Text>
    {loyaltyWallets.length?loyaltyWallets.map(wallet=><View style={styles.loyaltyCard} key={wallet.id}>
      <View style={styles.loyaltyStoreRow}>{wallet.storeLogo?<Image source={{uri:wallet.storeLogo}} style={styles.loyaltyLogo}/>:<View style={styles.loyaltyLogoFallback}><Text style={styles.loyaltyLogoText}>CF</Text></View>}<View style={{flex:1}}><Text style={styles.productName}>{wallet.storeName}</Text><Text style={styles.meta}>{wallet.balance} pontos disponíveis{wallet.pointsPerCurrency>0?` • ${wallet.pointsPerCurrency} por R$ 1`:""}</Text></View></View>
      {!!wallet.rewards.length&&<><Text style={styles.loyaltySubtitle}>Recompensas</Text>{wallet.rewards.filter(reward=>["DISCOUNT_FIXED","DISCOUNT_PERCENTAGE","FREE_DELIVERY"].includes(reward.reward_type)).map(reward=>{const enough=wallet.balance>=Number(reward.points_cost);const detail=reward.reward_type==="FREE_DELIVERY"?"Entrega grátis":reward.reward_type==="DISCOUNT_PERCENTAGE"?`${Number(reward.reward_value??0)}% de desconto`:`${brl(Number(reward.reward_value??0))} de desconto`;return <View style={styles.loyaltyRewardRow} key={reward.id}><View style={{flex:1}}><Text style={styles.productName}>{reward.name}</Text><Text style={styles.meta}>{detail} • {reward.points_cost} pontos</Text>{!enough&&<Text style={styles.loyaltyMissing}>Faltam {Number(reward.points_cost)-wallet.balance} pontos</Text>}</View><Pressable style={[styles.loyaltyRedeem,!enough&&styles.disabled]} disabled={!enough||!!loyaltyBusyReward} onPress={()=>redeemLoyaltyReward(wallet,reward)}><Text style={styles.loyaltyRedeemText}>{loyaltyBusyReward===reward.id?"...":"RESGATAR"}</Text></Pressable></View>})}</>}
      {!!wallet.redemptions.length&&<><Text style={styles.loyaltySubtitle}>Meus cupons resgatados</Text>{wallet.redemptions.slice(0,5).map(item=><View style={styles.loyaltyCoupon} key={item.id}><View style={{flex:1}}><Text style={styles.productName}>{item.rewardName}</Text><Text selectable style={styles.loyaltyCode}>{item.coupon?.code??"Cupom indisponível"}</Text><Text style={styles.meta}>{item.status==="AVAILABLE"?"Disponível para uso":item.status==="USED"?"Utilizado":item.status==="EXPIRED"?"Expirado • pontos devolvidos":item.status}</Text></View><Text style={styles.loyaltyPointsSpent}>−{item.points_spent}</Text></View>)}</>}
    </View>):<Text style={styles.empty}>Você ainda não acumulou pontos. Pedidos entregues em lojas com fidelidade ativa geram pontos automaticamente.</Text>}
    <Text style={styles.section}>Endereços salvos</Text>{addresses.map(address=><View style={styles.addressCard} key={address.id}><Text style={styles.productName}>{address.label||"Endereço"}</Text><Text style={styles.meta}>{address.street}, {address.number}</Text></View>)}
    <Pressable style={styles.signOut} onPress={()=>supabase.auth.signOut()}><Text style={styles.signOutText}>SAIR</Text></Pressable>
  </ScrollView>;'''
if old not in s: raise SystemExit('client profile marker not found')
s=s.replace(old,new,1)

old='  profile:{backgroundColor:"#fff",padding:15,borderRadius:16,flexDirection:"row",alignItems:"center",gap:12},signOut:{borderWidth:1,borderColor:"#e3b7b7",borderRadius:13,padding:14,marginTop:24,alignItems:"center"},signOutText:{color:"#9d2c2c",fontWeight:"900"},'
new='  profile:{backgroundColor:"#fff",padding:15,borderRadius:16,flexDirection:"row",alignItems:"center",gap:12},loyaltyHero:{backgroundColor:"#111",borderRadius:18,padding:18,marginTop:14,flexDirection:"row",justifyContent:"space-between",alignItems:"center"},loyaltyKicker:{color:"#f4c400",fontSize:10,fontWeight:"900",letterSpacing:1.2},loyaltyTotal:{color:"#fff",fontSize:34,fontWeight:"900",marginTop:3},loyaltyHeroEmoji:{color:"#f4c400",fontSize:38},loyaltyCard:{backgroundColor:"#fff",borderWidth:1,borderColor:"#e4e4e4",borderRadius:16,padding:13,marginBottom:10},loyaltyStoreRow:{flexDirection:"row",alignItems:"center",gap:10},loyaltyLogo:{width:44,height:44,borderRadius:12,backgroundColor:"#eee"},loyaltyLogoFallback:{width:44,height:44,borderRadius:12,backgroundColor:"#f4c400",alignItems:"center",justifyContent:"center"},loyaltyLogoText:{fontWeight:"900"},loyaltySubtitle:{fontSize:12,fontWeight:"900",marginTop:14,marginBottom:6},loyaltyRewardRow:{borderTopWidth:1,borderTopColor:"#eee",paddingVertical:10,flexDirection:"row",alignItems:"center",gap:8},loyaltyRedeem:{backgroundColor:"#111",borderRadius:9,paddingVertical:9,paddingHorizontal:10},loyaltyRedeemText:{color:"#f4c400",fontSize:9,fontWeight:"900"},loyaltyMissing:{fontSize:9,color:"#a86b00",fontWeight:"800",marginTop:3},loyaltyCoupon:{backgroundColor:"#fffbea",borderRadius:11,padding:10,marginTop:6,flexDirection:"row",alignItems:"center",gap:8},loyaltyCode:{fontSize:15,fontWeight:"900",letterSpacing:1,marginTop:4},loyaltyPointsSpent:{fontWeight:"900",color:"#a36d00"},signOut:{borderWidth:1,borderColor:"#e3b7b7",borderRadius:13,padding:14,marginTop:24,alignItems:"center"},signOutText:{color:"#9d2c2c",fontWeight:"900"},'
if old not in s: raise SystemExit('client profile style marker not found')
s=s.replace(old,new,1)
p.write_text(s)

p=Path('apps/lojista/app/page.tsx')
s=p.read_text()
old='const { data, error } = await supabase.functions.invoke("store-management", { body: { action: "UPDATE_LOYALTY", storeId: store.id, pointsPerCurrency: Number(loyaltyPoints.replace(",", ".")), active: true } });'
new='const { data, error } = await supabase.functions.invoke("store-loyalty", { body: { action: "SET_PROGRAM", storeId: store.id, pointsPerCurrency: Number(loyaltyPoints.replace(",", ".")), active: true } });'
if old not in s: raise SystemExit('lojista save loyalty marker not found')
s=s.replace(old,new,1)
old='const { data, error } = await supabase.functions.invoke("store-management", { body: { action: "CREATE_LOYALTY_REWARD", storeId: store.id, name: rewardForm.name, pointsCost: Number(rewardForm.pointsCost), rewardType: rewardForm.rewardType, rewardValue: rewardForm.rewardValue ? Number(rewardForm.rewardValue.replace(",", ".")) : null } });'
new='const { data, error } = await supabase.functions.invoke("store-loyalty", { body: { action: "SAVE_REWARD", storeId: store.id, reward: { name: rewardForm.name, pointsCost: Number(rewardForm.pointsCost), rewardType: rewardForm.rewardType, rewardValue: rewardForm.rewardValue ? Number(rewardForm.rewardValue.replace(",", ".")) : null } } });'
if old not in s: raise SystemExit('lojista create reward marker not found')
s=s.replace(old,new,1)
p.write_text(s)
