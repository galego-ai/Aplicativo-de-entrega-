from pathlib import Path

path = Path("apps/cliente/App.tsx")
text = path.read_text(encoding="utf-8")


def replace_once(old: str, new: str, label: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: esperado 1 trecho, encontrado {count}")
    text = text.replace(old, new, 1)


replace_once(
'''function promotionPrice(base:number,productId:string,promotions:CustomerPromotion[]){
  let value=base;
  for(const promo of promotions.filter(p=>p.product_id===productId)){
    const d=Number(promo.discount_value);
    if(promo.promotion_type==="PRODUCT_PRICE")value=Math.min(value,d);
    else if(promo.promotion_type==="PERCENTAGE"&&d>=0&&d<=100)value=Math.min(value,value*(1-d/100));
    else if(promo.promotion_type==="FIXED")value=Math.min(value,Math.max(0,value-d));
  }
  return Math.max(0,value);
}
''',
'''function promotionPrice(base:number,productId:string,promotions:CustomerPromotion[]){
  let value=base;
  for(const promo of promotions.filter(p=>p.product_id===productId)){
    const d=Number(promo.discount_value);
    if(promo.promotion_type==="PRODUCT_PRICE")value=Math.min(value,d);
    else if(promo.promotion_type==="PERCENTAGE"&&d>=0&&d<=100)value=Math.min(value,value*(1-d/100));
    else if(promo.promotion_type==="FIXED")value=Math.min(value,Math.max(0,value-d));
  }
  return Math.max(0,value);
}

function promotionOfferLabel(promo:CustomerPromotion){
  const value=Number(promo.discount_value);
  if(promo.promotion_type==="FREE_DELIVERY")return "Frete grátis";
  if(promo.promotion_type==="PRODUCT_PRICE")return `Por ${brl(value)}`;
  if(promo.promotion_type==="PERCENTAGE")return `${value}% OFF`;
  if(promo.promotion_type==="FIXED")return `${brl(value)} OFF`;
  return "Oferta";
}
''',
"helper de oferta",
)

replace_once(
'''      supabase.from("promotions").select("id,name,promotion_type,discount_value,product_id").eq("store_id",store.id).eq("active",true),''',
'''      supabase.from("promotions").select("id,name,promotion_type,discount_value,product_id,starts_at,ends_at").eq("store_id",store.id).eq("active",true),''',
"consulta de promoções",
)

replace_once(
'''    setVariants(loadedVariants);setProductGroupLinks(links);
    setPromotions((promoR.data??[]).map((p:any)=>({...p,discount_value:Number(p.discount_value)})) as CustomerPromotion[]);''',
'''    setVariants(loadedVariants);setProductGroupLinks(links);
    const promotionNow=Date.now();
    setPromotions((promoR.data??[]).filter((p:any)=>(!p.starts_at||new Date(p.starts_at).getTime()<=promotionNow)&&(!p.ends_at||new Date(p.ends_at).getTime()>=promotionNow)).map((p:any)=>({...p,discount_value:Number(p.discount_value)})) as CustomerPromotion[]);''',
"filtro temporal de promoções",
)

replace_once(
'''  const visibleProducts=useMemo(()=>selectedCategoryId==="ALL"?products:selectedCategoryId==="UNCATEGORIZED"?products.filter(product=>!product.category_id):products.filter(product=>product.category_id===selectedCategoryId),[products,selectedCategoryId]);''',
'''  const visibleProducts=useMemo(()=>selectedCategoryId==="ALL"?products:selectedCategoryId==="UNCATEGORIZED"?products.filter(product=>!product.category_id):products.filter(product=>product.category_id===selectedCategoryId),[products,selectedCategoryId]);
  const offerPromotions=useMemo(()=>promotions.filter(p=>p.promotion_type==="FREE_DELIVERY"||(Boolean(p.product_id)&&["PRODUCT_PRICE","PERCENTAGE","FIXED"].includes(p.promotion_type))),[promotions]);''',
"memo de ofertas",
)

replace_once(
'''      {promotions.some(p=>p.promotion_type==="FREE_DELIVERY")&&<Text style={styles.promoBanner}>🚚 Entrega grátis em promoção</Text>}
      {!!message&&<Text style={styles.notice}>{message}</Text>}

      <Text style={styles.section}>Cardápio</Text>
      {(menuCategories.length||hasUncategorized)&&<ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll} contentContainerStyle={styles.categoryChips}><Pressable style={[styles.categoryChip,selectedCategoryId==="ALL"&&styles.categoryChipActive]} onPress={()=>setSelectedCategoryId("ALL")}><Text style={[styles.categoryChipText,selectedCategoryId==="ALL"&&styles.categoryChipTextActive]}>Todos</Text></Pressable>{menuCategories.map(category=><Pressable key={category.id} style={[styles.categoryChip,selectedCategoryId===category.id&&styles.categoryChipActive]} onPress={()=>setSelectedCategoryId(category.id)}><Text style={[styles.categoryChipText,selectedCategoryId===category.id&&styles.categoryChipTextActive]}>{category.name}</Text></Pressable>)}{hasUncategorized&&<Pressable style={[styles.categoryChip,selectedCategoryId==="UNCATEGORIZED"&&styles.categoryChipActive]} onPress={()=>setSelectedCategoryId("UNCATEGORIZED")}><Text style={[styles.categoryChipText,selectedCategoryId==="UNCATEGORIZED"&&styles.categoryChipTextActive]}>Outros</Text></Pressable>}</ScrollView>}
''',
'''      {!!message&&<Text style={styles.notice}>{message}</Text>}

      {!!offerPromotions.length&&<>
        <View style={styles.offersHeader}><View><Text style={styles.offersKicker}>PROMOÇÕES ATIVAS</Text><Text style={styles.offersTitle}>Ofertas da loja</Text></View><Text style={styles.offersEmoji}>🔥</Text></View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.offersScroll} contentContainerStyle={styles.offersList}>
          {offerPromotions.map(promo=>{
            const product=promo.product_id?products.find(item=>item.id===promo.product_id):null;
            const freeDelivery=promo.promotion_type==="FREE_DELIVERY";
            return <View style={styles.offerCard} key={promo.id}>
              {product?.image_url?<Image source={{uri:product.image_url}} style={styles.offerImage}/>:<View style={styles.offerImageFallback}><Text style={styles.offerImageFallbackText}>{freeDelivery?"🛵":"🏷️"}</Text></View>}
              <View style={styles.offerBody}><Text style={styles.offerBadge}>{promotionOfferLabel(promo)}</Text><Text numberOfLines={1} style={styles.offerName}>{product?.name??promo.name}</Text><Text numberOfLines={2} style={styles.offerMeta}>{freeDelivery?(product?"Frete grátis ao incluir este item no pedido":"Frete grátis para pedidos elegíveis"):promo.name}</Text></View>
            </View>;
          })}
        </ScrollView>
      </>}

      <Text style={styles.section}>Cardápio</Text>
      {(menuCategories.length||hasUncategorized)&&<ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll} contentContainerStyle={styles.categoryVisualList}>
        <Pressable style={[styles.categoryVisualCard,selectedCategoryId==="ALL"&&styles.categoryVisualCardActive]} onPress={()=>setSelectedCategoryId("ALL")}><View style={styles.categoryVisualFallback}><Text style={styles.categoryVisualEmoji}>🍽️</Text></View><Text numberOfLines={1} style={[styles.categoryVisualText,selectedCategoryId==="ALL"&&styles.categoryVisualTextActive]}>Todos</Text></Pressable>
        {menuCategories.map(category=><Pressable key={category.id} style={[styles.categoryVisualCard,selectedCategoryId===category.id&&styles.categoryVisualCardActive]} onPress={()=>setSelectedCategoryId(category.id)}>{category.image_url?<Image source={{uri:category.image_url}} style={styles.categoryVisualImage}/>:<View style={styles.categoryVisualFallback}><Text style={styles.categoryVisualEmoji}>🍴</Text></View>}<Text numberOfLines={1} style={[styles.categoryVisualText,selectedCategoryId===category.id&&styles.categoryVisualTextActive]}>{category.name}</Text></Pressable>)}
        {hasUncategorized&&<Pressable style={[styles.categoryVisualCard,selectedCategoryId==="UNCATEGORIZED"&&styles.categoryVisualCardActive]} onPress={()=>setSelectedCategoryId("UNCATEGORIZED")}><View style={styles.categoryVisualFallback}><Text style={styles.categoryVisualEmoji}>✨</Text></View><Text numberOfLines={1} style={[styles.categoryVisualText,selectedCategoryId==="UNCATEGORIZED"&&styles.categoryVisualTextActive]}>Outros</Text></Pressable>}
      </ScrollView>}
''',
"bloco visual de ofertas e categorias",
)

replace_once(
'''  customHint:{fontSize:10,color:"#555",fontWeight:"800",marginTop:4},discountHint:{fontSize:10,color:"#26804a",fontWeight:"800",marginTop:3},promoBanner:{backgroundColor:"#dcf7e7",color:"#17673b",padding:10,borderRadius:11,fontWeight:"800",fontSize:11,marginTop:12},categoryScroll:{marginHorizontal:-2,marginBottom:10},categoryChips:{gap:7,paddingHorizontal:2,paddingVertical:2},categoryChip:{borderWidth:1,borderColor:"#ddd",backgroundColor:"#fff",borderRadius:999,paddingHorizontal:13,paddingVertical:9},categoryChipActive:{backgroundColor:"#111",borderColor:"#111"},categoryChipText:{fontSize:10,fontWeight:"900",color:"#4b4f56"},categoryChipTextActive:{color:"#f4c400"},categoryHeading:{backgroundColor:"#fffbea",borderRadius:14,padding:12,marginBottom:10},categoryHeadingTitle:{fontSize:17,fontWeight:"900"},''',
'''  customHint:{fontSize:10,color:"#555",fontWeight:"800",marginTop:4},discountHint:{fontSize:10,color:"#26804a",fontWeight:"800",marginTop:3},promoBanner:{backgroundColor:"#dcf7e7",color:"#17673b",padding:10,borderRadius:11,fontWeight:"800",fontSize:11,marginTop:12},offersHeader:{marginTop:18,marginBottom:9,flexDirection:"row",alignItems:"center",justifyContent:"space-between"},offersKicker:{fontSize:9,fontWeight:"900",letterSpacing:1.1,color:"#9a6900"},offersTitle:{fontSize:20,fontWeight:"900",marginTop:2},offersEmoji:{fontSize:27},offersScroll:{marginHorizontal:-2,marginBottom:4},offersList:{gap:10,paddingHorizontal:2,paddingBottom:2},offerCard:{width:184,backgroundColor:"#111",borderRadius:17,overflow:"hidden"},offerImage:{width:"100%",height:92,backgroundColor:"#333"},offerImageFallback:{height:92,backgroundColor:"#292929",alignItems:"center",justifyContent:"center"},offerImageFallbackText:{fontSize:34},offerBody:{padding:11},offerBadge:{alignSelf:"flex-start",backgroundColor:"#f4c400",color:"#111",fontSize:9,fontWeight:"900",paddingHorizontal:8,paddingVertical:5,borderRadius:999,overflow:"hidden"},offerName:{color:"#fff",fontSize:14,fontWeight:"900",marginTop:8},offerMeta:{color:"#bfc2c7",fontSize:9.5,lineHeight:13,marginTop:4},categoryScroll:{marginHorizontal:-2,marginBottom:10},categoryVisualList:{gap:8,paddingHorizontal:2,paddingBottom:2},categoryVisualCard:{width:102,backgroundColor:"#fff",borderWidth:1,borderColor:"#e3e3e3",borderRadius:15,padding:6},categoryVisualCardActive:{backgroundColor:"#111",borderColor:"#111"},categoryVisualImage:{width:"100%",height:58,borderRadius:10,backgroundColor:"#eee"},categoryVisualFallback:{height:58,borderRadius:10,backgroundColor:"#f1f1f1",alignItems:"center",justifyContent:"center"},categoryVisualEmoji:{fontSize:26},categoryVisualText:{fontSize:10,fontWeight:"900",color:"#4b4f56",textAlign:"center",marginTop:7,marginBottom:2},categoryVisualTextActive:{color:"#f4c400"},categoryHeading:{backgroundColor:"#fffbea",borderRadius:14,padding:12,marginBottom:10},categoryHeadingTitle:{fontSize:17,fontWeight:"900"},''',
"estilos de ofertas e categorias",
)

path.write_text(text, encoding="utf-8")
print("App Cliente atualizado com ofertas temporizadas e categorias visuais.")
