from pathlib import Path

p=Path('apps/cliente/App.tsx')
s=p.read_text()
legacy='''    {!!cart.length&&<Pressable accessibilityRole="button" accessibilityLabel={`Abrir carrinho com ${cartQuantity} ${cartQuantity===1?"item":"itens"}`} style={styles.bagFloating} onPress={()=>setCartOpen(true)}><View><Text style={styles.bagFloatingTitle}>🛒 VER CARRINHO</Text><Text style={styles.bagFloatingMeta}>{cartQuantity} {cartQuantity===1?"item":"itens"} • toque para finalizar</Text></View><Text style={styles.bagFloatingTotal}>{brl(cartSubtotal)}</Text></Pressable>}\n'''
if legacy not in s:
    raise SystemExit('Carrinho flutuante inferior legado não encontrado')
s=s.replace(legacy,'',1)
if 'style={styles.floatingCartTop}' not in s:
    raise SystemExit('Carrinho superior aprovado não encontrado')
p.write_text(s)
print('Carrinho inferior removido; carrinho superior preservado.')
