import fs from 'node:fs';

const path='apps/entregador/App.tsx';
let s=fs.readFileSync(path,'utf8');
const tag='CLICKFOOD_EXTERNAL_RELEASE_REFRESH';
if(s.includes(tag)){
  console.log('Atualização externa já aplicada.');
  process.exit(0);
}

const marker=`  },[driver?.id,driver?.online,driver?.status]);\n\n\n  useEffect(()=>{\n    if(!session?.user.id||!driver?.id||driver.status!==\"ACTIVE\"||!driver.online||active){setOffer(null);return;}`;
if(!s.includes(marker))throw new Error('Ponto de inserção da atualização externa não encontrado.');

const replacement=`  },[driver?.id,driver?.online,driver?.status]);\n\n  // ${tag}: se Loja/Matriz concluir ou liberar a entrega por contingência,\n  // o app deve abandonar a tela antiga automaticamente sem exigir ação do entregador.\n  useEffect(()=>{\n    if(!session?.user.id||!driver?.id||driver.status!==\"ACTIVE\")return;\n    let cancelled=false;\n    const refresh=async()=>{if(cancelled)return;try{await loadActive();}catch{}};\n    void refresh();\n    const timer=setInterval(()=>void refresh(),2500);\n    const channel=supabase.channel(\`driver-active-release-\${driver.id}\`)\n      .on(\"postgres_changes\",{event:\"*\",schema:\"public\",table:\"deliveries\",filter:\`driver_id=eq.\${driver.id}\`},()=>void refresh())\n      .subscribe();\n    return()=>{cancelled=true;clearInterval(timer);void supabase.removeChannel(channel);};\n  },[session?.user.id,driver?.id,driver?.status]);\n\n\n  useEffect(()=>{\n    if(!session?.user.id||!driver?.id||driver.status!==\"ACTIVE\"||!driver.online||active){setOffer(null);return;}`;

s=s.replace(marker,replacement);
fs.writeFileSync(path,s);
console.log('Atualização automática de entrega externa aplicada ao Entregador.');
