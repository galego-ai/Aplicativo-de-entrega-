# CLICK-FOOD

Plataforma independente de delivery, PDV, fidelidade e logística. Este repositório é separado do CLICK-GO.

## Estrutura

- `apps/admin`: Painel Matriz CLICK-FOOD
- `apps/lojista`: Painel Lojista + PDV
- `apps/cliente`: App Cliente (estrutura reservada)
- `apps/entregador`: App Entregador (estrutura reservada)
- `packages/shared`: tipos e regras compartilhadas
- `supabase`: migrations e configuração do banco exclusivo CLICK-FOOD

## Regra de isolamento

Nenhum recurso deste repositório deve apontar para banco, autenticação, variáveis, projetos Vercel ou configurações do CLICK-GO.
