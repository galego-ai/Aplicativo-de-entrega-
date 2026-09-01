import fs from 'node:fs';

function patchShell(path){
  let text=fs.readFileSync(path,'utf8');
  text=text.replaceAll('StyleSheet.absoluteFillObject','StyleSheet.absoluteFill');
  const needle='if(!session)return <>{children}</>;\n return ';
  if(!text.includes(needle))throw new Error(`Marcador de sessão não encontrado em ${path}`);
  text=text.replace(needle,'if(!session)return <>{children}</>;\n const activeSession=session;\n return ');
  const marker='const activeSession=session;';
  const index=text.indexOf(marker);
  const before=text.slice(0,index+marker.length);
  const after=text.slice(index+marker.length).replaceAll('session.user','activeSession.user');
  fs.writeFileSync(path,before+after);
}

patchShell('apps/cliente/CustomerProfessionalShell.tsx');
patchShell('apps/entregador/DriverProfessionalShell.tsx');

const appPath='apps/cliente/App.tsx';
let app=fs.readFileSync(appPath,'utf8');
const oldBlock=`        <View style={styles.addressForm}>
          <Text style={styles.formTitle}>Adicionar endereço usando minha localização atual</Text>
          <TextInput style={styles.input} placeholder="Nome (Casa, Trabalho...)" value={addressForm.label} onChangeText={value=>setAddressForm({...addressForm,label:value})}/>
          <TextInput style={styles.input} placeholder="Rua/Avenida" value={addressForm.street} onChangeText={value=>setAddressForm({...addressForm,street:value})}/>
          <TextInput style={styles.input} placeholder="Número" value={addressForm.number} onChangeText={value=>setAddressForm({...addressForm,number:value})}/>
          <TextInput style={styles.input} placeholder="Bairro" value={addressForm.district} onChangeText={value=>setAddressForm({...addressForm,district:value})}/>
          <TextInput style={styles.input} placeholder="Referência" value={addressForm.reference} onChangeText={value=>setAddressForm({...addressForm,reference:value})}/>
          <Pressable style={styles.secondaryButton} onPress={saveAddressWithLocation} disabled={savingAddress}><Text style={styles.secondaryText}>{savingAddress?"SALVANDO...":"SALVAR ENDEREÇO + GPS"}</Text></Pressable>
        </View>`;
const newBlock=`        {!addresses.length&&<Text style={styles.notice}>Você ainda não possui endereço salvo. Use o menu ☰ no topo e abra “Meus endereços” para cadastrar o local exato no mapa.</Text>}
        <Text style={styles.meta}>Para adicionar, editar ou ajustar a localização GPS, use Menu ☰ → Meus endereços.</Text>`;
if(!app.includes(oldBlock))throw new Error('Formulário antigo de endereço não foi localizado no App Cliente.');
app=app.replace(oldBlock,newBlock);
fs.writeFileSync(appPath,app);
