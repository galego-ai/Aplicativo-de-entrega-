# CLICK-FOOD

Plataforma independente de **delivery + PDV + logística + fidelidade + bônus**. Este repositório é tecnicamente separado do CLICK-GO.

## Aplicações

- `apps/admin` — Painel Matriz CLICK-FOOD (Next.js + Supabase Auth)
- `apps/lojista` — Painel Lojista + PDV (Next.js + Supabase Auth)
- `apps/cliente` — App Cliente (Expo / React Native + Supabase)
- `apps/entregador` — App Entregador (Expo / React Native + Supabase + GPS)
- `packages/shared` — tipos, máquina de estados, cálculo de pedidos e regras de delivery
- `supabase/migrations` — schema, RLS, índices e operações transacionais
- `supabase/functions` — backend seguro para checkout, frete, despacho, delivery, chat e cadastro do entregador

## Supabase de produção

Projeto exclusivo criado e ativo:

- Nome: `click-food-production`
- Região: São Paulo (`sa-east-1`)
- Project ref: `rmlbmacoqnynqdqmxecz`

O CLICK-FOOD **não reutiliza** banco, usuários ou autenticação do CLICK-GO.

## Vercel — produção

Os dois painéis estão publicados em projetos independentes e apontando para o Supabase exclusivo do CLICK-FOOD:

- Matriz: https://click-food-admin.vercel.app
- Lojista/PDV: https://click-food-lojista.vercel.app

A versão publicada foi validada pelo CI com build do Painel Matriz, build do Painel Lojista e type-check dos aplicativos Cliente e Entregador.

## Backend implementado

- cálculo e cotação de frete emitida pelo servidor;
- checkout com preços recalculados no backend;
- validação de produtos, adicionais, pedido mínimo e cupons;
- criação atômica de pedido, itens e pagamento;
- máquina de estados de pedido e entrega;
- despacho automático por distância, carga, avaliação e taxa de aceitação;
- aceite atômico para impedir dois entregadores no mesmo pedido;
- online/offline do entregador protegido por backend;
- chamados do entregador sem revelar endereço do cliente antes do aceite;
- rota/destino liberados apenas ao entregador atribuído;
- recusa registrada de chamados;
- códigos de 4 dígitos derivados por HMAC para retirada e entrega;
- financeiro baseado em ledger e proteção contra postagem duplicada;
- chat moderado com bloqueio de telefone, e-mail, links e contatos externos;
- suporte, fidelidade do cliente e CLICK Pontos do lojista;
- cadastro de entregador com status `PENDING` para aprovação;
- métricas agregadas no banco para Matriz e Lojista;
- cadastro de cidades pela Matriz;
- criação e ativação de lojas por código de uso único;
- configuração de GPS, pedido mínimo e frete pelo lojista;
- PDV com abertura/fechamento de caixa e venda transacional;
- cancelamento do cliente e avaliações por estrelas;
- rastreamento do entregador com localização protegida por RLS;
- canais de chat seguros por pedido.

## Segurança

- RLS habilitado nas tabelas públicas;
- operações financeiras e checkout passam pelo backend;
- frontend não define preço, frete, cupom, comissão ou ganho do entregador;
- documentos e rotas privadas seguem escopo de acesso;
- Edge Functions operacionais exigem JWT;
- nenhuma chave `service_role` está no browser ou nos apps;
- todos os recursos são separados do CLICK-GO.

## Aplicativos móveis

Identificadores:

- Cliente Android/iOS: `br.com.clickfood.cliente`
- Entregador Android/iOS: `br.com.clickfood.entregador`

O App Cliente já usa autenticação real, lojas ativas, carrinho, endereço com GPS, frete, checkout, histórico, rastreamento, cancelamento e avaliação. O App Entregador já usa autenticação, cadastro por cidade, aprovação, localização, online/offline, chamados, aceite/recusa e fluxo de entrega.

## CI

`.github/workflows/ci.yml` compila os dois painéis web e executa type-check dos dois apps móveis a cada push.

## Regra de isolamento

Nenhum recurso deste repositório deve apontar para banco, autenticação, variáveis, projetos Vercel ou configurações do CLICK-GO.
