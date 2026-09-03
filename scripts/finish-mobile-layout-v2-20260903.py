from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
path = ROOT / "apps/entregador/App.tsx"
text = path.read_text(encoding="utf-8")


def required_replace(old: str, new: str, label: str):
    global text
    if new in text:
        print(f"[skip] {label}: já aplicado")
        return
    if old not in text:
        raise SystemExit(f"[erro] trecho não encontrado: {label}")
    text = text.replace(old, new, 1)
    print(f"[ok] {label}")


def style_replace(name: str, new_body: str):
    global text
    pattern = rf'{re.escape(name)}:\{{[^}}]*\}}'
    new = f'{name}:{{{new_body}}}'
    if new in text:
        print(f"[skip] estilo {name}: já aplicado")
        return
    text2, count = re.subn(pattern, new, text, count=1)
    if count != 1:
        raise SystemExit(f"[erro] estilo não encontrado: {name}")
    text = text2
    print(f"[ok] estilo {name}")

style_replace(
    "mapActionButton",
    'backgroundColor:"#f4c400",borderRadius:10,paddingVertical:14,alignItems:"center",marginTop:15',
)
style_replace(
    "nextStepCard",
    'backgroundColor:"#101010",borderRadius:16,padding:16,borderWidth:1,borderColor:"#252525",marginTop:12',
)

required_replace(
    'const nextStepText=active?.status==="DRIVER_AT_CUSTOMER"?"Aguardando código do cliente para finalizar a entrega.":active?.status==="DRIVER_AT_STORE"?"Aguardando o código de retirada fornecido pela loja.":nextAction?.[1]??"Aguardando próxima atualização.";',
    'const nextStepText=active?.status==="DRIVER_AT_CUSTOMER"?"Aguardando código do cliente para finalizar a entrega.":active?.status==="DRIVER_AT_STORE"?"Aguardando o código de retirada fornecido pela loja.":nextAction?.[1]??"Aguardando próxima atualização.";\n  const codeButtonLabel=active?.status==="DRIVER_AT_CUSTOMER"?"JÁ TENHO O CÓDIGO":active?.status==="DRIVER_AT_STORE"?"DIGITAR CÓDIGO DE RETIRADA":null;',
    "rótulo do código",
)

required_replace(
    '{needsCode&&<TextInput style={styles.codeInput} placeholder="Código de 4 dígitos" placeholderTextColor="#777" keyboardType="number-pad" maxLength={4} value={code} onChangeText={setCode}/>} {nextAction&&<Pressable style={styles.actionButton} onPress={()=>deliveryAction(nextAction[0])}><Text style={styles.actionText}>{nextAction[1]}</Text></Pressable>}',
    '{needsCode&&<><Text style={styles.codePrompt}>{codeButtonLabel}</Text><TextInput style={styles.codeInput} placeholder="Código de 4 dígitos" placeholderTextColor="#777" keyboardType="number-pad" maxLength={4} value={code} onChangeText={setCode}/></>} {nextAction&&<Pressable style={styles.actionButton} onPress={()=>deliveryAction(nextAction[0])}><Text style={styles.actionText}>{needsCode&&codeButtonLabel?codeButtonLabel:nextAction[1]}</Text></Pressable>}',
    "ação para digitar código",
)

# Adiciona label visual e refina o campo de código.
if 'codePrompt:{' not in text:
    old = 'codeInput:{borderWidth:1,borderColor:"#444",backgroundColor:"#0f0f0f",color:"#fff",borderRadius:11,padding:13,fontSize:18,textAlign:"center",letterSpacing:5,marginTop:12}'
    new = 'codePrompt:{fontSize:10,color:"#f4c400",fontWeight:"900",marginTop:14,marginBottom:2},codeInput:{borderWidth:1,borderColor:"#555",backgroundColor:"#0b0b0b",color:"#fff",borderRadius:11,padding:13,fontSize:20,textAlign:"center",letterSpacing:7,marginTop:8}'
    required_replace(old, new, "estilo do código")

path.write_text(text, encoding="utf-8")
print("Patch restante do Entregador aplicado.")
