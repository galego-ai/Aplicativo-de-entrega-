# CLICK-FOOD

Plataforma independente de **delivery + PDV + logística + fidelidade + bônus**. Este repositório é tecnicamente separado do CLICK-GO.

## Aplicações

- `apps/admin` — Painel Matriz CLICK-FOOD (Next.js + Supabase Auth)
- `apps/lojista` — Painel Lojista + PDV (Next.js + Supabase Auth)
- `apps/cliente` — App Cliente (Expo / React Native + Supabase)
- `apps/entregador` — App Entregador (Expo / React Native + Supabase + GPS)
- `packages/shared` — tipos, máquina de estados, cálculo de pedidos e regras de delivery
- `supabase/migrations` — schema, RLS, índices e operações transacionais
- `supabase/functions` — backend seguro para checkout, frete, despacho, delivery, chat, estoque, horários e configurações operacionais

## Supabase de produção

Projeto exclusivo criado e ativo:

- Nome: `click-food-production`
- Região: São Paulo (`sa-east-1`)
- Project ref: `rmlbmacoqnynqdqmxecz`

O CLICK-FOOD **não reutiliza** banco, usuários ou autenticação do CLICK-GO.

## Vercel — produção

Projetos web independentes:

- Matriz: https://click-food-admin.vercel.app
- Lojista/PDV: https://click-food-lojista.vercel.app

O CI valida build do Painel Matriz, build do Painel Lojista e type-check dos aplicativos Cliente e Entregador a cada push. A publicação web é feita somente quando o deploy pode ser direcionado inequivocamente ao projeto CLICK-FOOD correspondente.

## Backend implementado

- cálculo e cotação de frete emitida pelo servidor;
- checkout com preços recalculados no backend;
- validação de produtos, variações, adicionais, promoções, pedido mínimo e cupons;
- criação atômica de pedido, itens e pagamento;
- verificação de horário da loja usando o fuso configurado para cada cidade;
- vitrine com estado `ABERTA/FECHADA` calculado pelo backend;
- reserva e devolução transacional de estoque em pedidos;
- movimentos de estoque auditáveis, estoque mínimo e alerta automático de estoque baixo;
- atualização atômica dos sete dias de horário da loja;
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
- notificações internas, Realtime e infraestrutura de push;
- suporte, fidelidade do cliente e CLICK Pontos do lojista;
- cadastro de entregador com status `PENDING`, documentos privados e revisão pela Matriz;
- métricas agregadas no banco para Matriz e Lojista;
- cadastro de cidades e configuração de fuso horário pela Matriz;
- criação e ativação de lojas por código de uso único;
- configuração de GPS, pedido mínimo, horários e frete pelo lojista;
- regras de entrega alteradas somente por backend autorizado e auditado;
- PDV com abertura/fechamento de caixa e venda transacional;
- cancelamento do cliente e avaliações por estrelas;
- rastreamento do entregador com localização protegida por RLS;
- canais de chat seguros por pedido;
- repasses de lojas e entregadores com reserva transacional do saldo;
- cobrança/inadimplência automática por agendador;
- camada neutra de configuração de gateway para PIX/cartões, sem armazenar segredos no navegador ou em tabelas públicas.

## Pagamentos online

A arquitetura aceita provedores configuráveis para `PIX`, `CREDIT_CARD` e `DEBIT_CARD`. A Matriz possui uma configuração administrativa que registra somente nome do provedor, ambiente, métodos e estado operacional.

A integração Efí PIX possui geração e reutilização segura de cobrança, QR Code e Pix Copia e Cola, reconciliação direta de status, confirmação idempotente por webhook, validação de valor recebido, expiração automática de cobranças abandonadas e devolução PIX idempotente. Cancelamentos/rejeições elegíveis podem solicitar devolução automaticamente; o webhook também reconcilia o estado da devolução e a liquidação atualiza atomicamente estorno, pagamento, pedido e cobrança. O App Cliente exibe o estado do pagamento e da devolução e permite reconciliar uma devolução pendente sem criar estorno duplicado.

**API keys, client secrets, certificados e tokens nunca são armazenados nessa configuração.** Credenciais reais permanecem exclusivamente em Secrets do backend/Edge Functions. A infraestrutura de cartão Efí existe no código, mas cartão permanece oculto ao cliente enquanto a validação específica não for concluída e o método não for explicitamente habilitado.

## Repasses Pix pela Efí

O CLICK-FOOD possui uma camada separada para **envio de repasses Pix** a lojas e entregadores. Ela reutiliza as credenciais Efí protegidas do backend, mas tem configuração operacional própria (`EFI_PIX_SEND`) para que cobrança de clientes e repasses não sejam ligados/desligados juntos.

- nasce `DESATIVADA` e não envia dinheiro apenas porque o PIX de cobrança está ativo;
- a Matriz precisa validar explicitamente os escopos de envio e consulta antes de liberar o recurso;
- uma solicitação precisa ser **APROVADA** antes de poder entrar no envio Efí;
- cada tentativa usa `idEnvio` idempotente e é persistida para auditoria;
- respostas incertas não geram outro Pix: o mesmo `idEnvio` é reconciliado por consulta/webhook;
- somente um envio Efí fica em processamento por vez;
- `REALIZADO` liquida o repasse como `PAGO`; `NAO_REALIZADO` devolve o repasse para `FALHOU` e libera a reserva para nova tentativa;
- a chave Pix do favorecido é mascarada no Painel Matriz;
- existe modo automático opcional, **OFF por padrão**; quando ativado pela Matriz, o worker processa somente repasses PIX já aprovados, um por vez;
- o worker é chamado por `pg_cron` e usa autenticação interna gerada no banco, sem segredo fixo no frontend ou repositório.

A implementação do envio está pronta no backend, mas deve permanecer desativada até a validação administrativa em homologação. Nenhum teste de repasse deve ser confundido com a cobrança PIX já validada.

## Segurança

- RLS habilitado nas tabelas públicas;
- operações financeiras e checkout passam pelo backend;
- frontend não define preço, frete, cupom, comissão ou ganho do entregador;
- regras de entrega e horários não aceitam escrita direta do navegador;
- frontend tem somente leitura das configurações de gateway, limitada por RLS à Matriz;
- documentos do entregador ficam em bucket privado; mídia pública da loja fica em bucket separado;
- tabelas técnicas de gateway/worker usam RLS e ficam acessíveis apenas ao backend/service role;
- Edge Functions operacionais exigem JWT; webhooks/workers sem JWT usam autenticação própria e validação de segredo/token;
- nenhuma chave `service_role` está no browser ou nos apps;
- todos os recursos são separados do CLICK-GO.

## Aplicativos móveis

Identificadores:

- Cliente Android/iOS: `br.com.clickfood.cliente`
- Entregador Android/iOS: `br.com.clickfood.entregador`

O App Cliente usa autenticação real, vitrine com status de funcionamento, logos/fotos, cardápio, personalização de produtos, carrinho, endereço com GPS, frete, checkout, histórico, rastreamento, cancelamento, status de pagamento/estorno PIX, chat, suporte, fidelidade e avaliação. Loja fechada pode ser consultada, mas o envio de pedido é bloqueado visualmente e novamente pelo servidor.

O App Entregador usa autenticação, cadastro por cidade, aprovação, documentos, localização, online/offline, chamados, aceite/recusa, chat, notificações, suporte e solicitação/acompanhamento de repasses.

## CI

`.github/workflows/ci.yml` compila os dois painéis web e executa type-check dos dois apps móveis a cada push.

## Mapas

A estrutura de localização e rastreamento já existe, porém a configuração definitiva de **Google Maps / Mapbox** fica deliberadamente para a etapa final, depois que os módulos funcionais e financeiros forem concluídos e validados.

## Regra de isolamento

Nenhum recurso deste repositório deve apontar para banco, autenticação, variáveis, projetos Vercel ou configurações do CLICK-GO.
