import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("supabase/functions/create-order/index.ts", "utf8");
const compact = source.replace(/\s+/g, "");

test("create-order revalida horário da loja antes de criar qualquer pedido", () => {
  assert.match(compact, /rpc\("store_is_open",\{p_store_id:body\.storeId\}\)/);
  assert.match(source, /STORE_HOURS_LOOKUP_FAILED/);
  assert.match(compact, /if\(!isOpen\)returnResponse\.json\(\{error:"STORE_CLOSED"\},\{status:409\}\)/);

  const hoursCheck = compact.indexOf('rpc("store_is_open"');
  const deliveryFlow = compact.indexOf('if(body.deliveryType==="DELIVERY")');
  const checkoutRpc = compact.indexOf('rpc("checkout_order_atomic"');

  assert.ok(hoursCheck >= 0, "Validação de horário não encontrada");
  assert.ok(deliveryFlow > hoursCheck, "O horário deve ser validado antes de entrega/retirada");
  assert.ok(checkoutRpc > hoursCheck, "O horário deve ser validado antes da persistência atômica do pedido");
});
