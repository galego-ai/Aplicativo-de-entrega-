import fs from 'node:fs';
const path='apps/cliente/App.tsx';
let s=fs.readFileSync(path,'utf8');
const oldText='style={styles.productImageButton} onPress={()=>beginProduct(product)}>';
const newText='style={styles.productImageButton} onPress={()=>{setSelectedProduct(product);setMessage("");}}>';
if(!s.includes(oldText))throw new Error('imagem clicável do produto: padrão não encontrado');
s=s.replace(oldText,newText);
fs.writeFileSync(path,s);
console.log('Imagem do produto agora abre os detalhes antes de adicionar.');
