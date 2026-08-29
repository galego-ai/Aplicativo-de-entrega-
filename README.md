# CLICK-FOOD

Plataforma independente de **delivery + PDV + logística + fidelidade + bônus**. Este repositório é tecnicamente separado do CLICK-GO.

## Aplicações

- `apps/admin` — Painel Matriz CLICK-FOOD (Next.js)
- `apps/lojista` — Painel Lojista + PDV (Next.js)
- `apps/cliente` — App Cliente (Expo / React Native)
- `apps/entregador` — App Entregador (Expo / React Native)
- `packages/shared` — tipos, máquina de estados, cálculo de pedidos e regras de delivery
- `supabase/migrations` — schema, RLS e operações transacionais do banco exclusivo CLICK-FOOD
- `supabase/functions` — backend seguro para checkout, frete, despacho, delivery e chat

## Demonstrações web

- Matriz: https://click-food-admin.vercel.app
- Lojista/PDV: https://click-food-lojista.vercel.app

## Backend já implementado

- cálculo e cotação de frete emitida pelo servidor;
- checkout com preços recalculados no backend;
- validação de produtos, adicionais, mínimo do pedido e cupons;
- criação atômica de pedido, itens e pagamento;
- máquina de estados do pedido;
- despacho automático de entregadores por distância, carga, avaliação e aceitação;
- aceite atômico para impedir dois entregadores na mesma entrega;
- fluxo do entregador sincronizado com o pedido;
- códigos de 4 dígitos derivados por HMAC para retirada e entrega, sem armazenar código em texto puro;
- financeiro baseado em ledger e proteção contra postagem duplicada;
- chat moderado com bloqueio de telefone, e-mail, links e tentativa de contato externo;
- suporte, fidelidade do cliente e CLICK Pontos do lojista preparados no schema.

## Banco de dados

O schema foi preparado para um projeto Supabase exclusivo. A criação do projeto `click-food-production` está pendente somente por limite de projetos ativos no plano Free da conta Supabase. **O banco CLICK-GO não será reutilizado nem pausado pelo CLICK-FOOD.**

## Segurança

- RLS habilitado nas tabelas expostas.
- Escritas financeiras e checkout passam pelo backend.
- Valores de produto, frete, cupom, comissão e ganhos não são confiados ao frontend.
- Aceite de entrega é atômico para impedir dois entregadores no mesmo pedido.
- Chat passa por moderação e bloqueia tentativa de compartilhamento de contatos.
- Chaves secretas nunca devem ser incluídas em browser ou aplicativo móvel.

## Identificadores móveis

- Cliente Android/iOS: `br.com.clickfood.cliente`
- Entregador Android/iOS: `br.com.clickfood.entregador`

## Regra de isolamento

Nenhum recurso deste repositório deve apontar para banco, autenticação, variáveis, projetos Vercel ou configurações do CLICK-GO.
