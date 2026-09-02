import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const vault=readFileSync("apps/cliente/SavedCardsHost.tsx","utf8");
const checkout=readFileSync("apps/cliente/EfiCardPayment.tsx","utf8");
const root=readFileSync("apps/cliente/index.js","utf8");
const edge=readFileSync("supabase/functions/customer-saved-card/index.ts","utf8");
const charge=readFileSync("supabase/functions/efi-card-charge/index.ts","utf8");
const migration=readFileSync("supabase/migrations/202609020150_customer_saved_cards.sql","utf8");

test("cartões novos usam token Efí reutilizável sem enviar número/CVV ao backend",()=>{
 assert.match(vault,/reuse:true/);
 assert.match(checkout,/reuse:true/);
 assert.doesNotMatch(edge,/\bnumber\b|\bcvv\b/i);
 assert.match(checkout,/savedCardId:String\(saved\.data\.card\.id\)/);
});

test("carteira segura permanece montada na raiz do App Cliente",()=>{
 assert.match(root,/import SavedCardsHost from "\.\/SavedCardsHost"/);
 assert.match(root,/<SavedCardsHost><CustomerProfessionalShell><App\/><\/CustomerProfessionalShell><\/SavedCardsHost>/);
});

test("token reutilizável fica somente no schema private",()=>{
 assert.match(migration,/private\.customer_saved_card_tokens/);
 assert.doesNotMatch(migration,/create table if not exists public\.customer_saved_card_tokens/);
 assert.match(migration,/revoke all on function public\.service_customer_saved_card_data[\s\S]*authenticated/);
 assert.match(migration,/grant execute on function public\.service_customer_saved_card_data[\s\S]*service_role/);
});

test("listagem de cartões devolve somente metadados",()=>{
 assert.match(edge,/select\("id,provider,brand,card_mask,holder_name,is_default,created_at"\)/);
 assert.doesNotMatch(edge,/select\("[^"]*payment_token/);
});

test("cobrança com cartão salvo recupera o token apenas no backend",()=>{
 assert.match(charge,/service_customer_saved_card_data/);
 assert.match(charge,/savedCardId/);
 assert.match(charge,/payment_token:paymentToken/);
});
