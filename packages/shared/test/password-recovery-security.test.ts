import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source=readFileSync("supabase/functions/password-recovery/index.ts","utf8");
const cliente=readFileSync("apps/cliente/AccountLifecycle.tsx","utf8");
const entregador=readFileSync("apps/entregador/AccountLifecycle.tsx","utf8");
const admin=readFileSync("apps/admin/app/layout.tsx","utf8");
const lojista=readFileSync("apps/lojista/app/layout.tsx","utf8");

const recoveryUrl="https://rmlbmacoqnynqdqmxecz.supabase.co/functions/v1/password-recovery";

test("portal de recuperação usa configuração do ambiente e não chave hardcoded",()=>{
 assert.match(source,/Deno\.env\.get\("SUPABASE_URL"\)/);
 assert.match(source,/Deno\.env\.get\("SUPABASE_ANON_KEY"\)/);
 assert.doesNotMatch(source,/sb_publishable_[A-Za-z0-9_-]+/);
 assert.doesNotMatch(source,/service_role/i);
});

test("portal de recuperação aplica cabeçalhos de segurança",()=>{
 assert.match(source,/cache-control[^\n]*no-store/i);
 assert.match(source,/x-content-type-options[^\n]*nosniff/i);
 assert.match(source,/referrer-policy[^\n]*no-referrer/i);
 assert.match(source,/content-security-policy/i);
 assert.match(source,/frame-ancestors 'none'/);
});

test("recuperação exige link/token e troca senha somente no endpoint Auth",()=>{
 assert.match(source,/access_token/);
 assert.match(source,/type==='recovery'/);
 assert.match(source,/\/auth\/v1\/user/);
 assert.match(source,/Authorization:'Bearer '\+accessToken/);
 assert.doesNotMatch(source,/admin\.updateUserById|auth\.admin/i);
});

test("Cliente, Entregador e painéis apontam para o portal HTTPS central",()=>{
 assert.ok(cliente.includes(recoveryUrl));
 assert.ok(entregador.includes(recoveryUrl));
 assert.ok(admin.includes(recoveryUrl));
 assert.ok(lojista.includes(recoveryUrl));
});
