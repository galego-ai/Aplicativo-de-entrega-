import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("supabase/functions/create-order/index.ts", "utf8");

test("create-order revalida entrega e retirada no instante do checkout", () => {
  assert.match(source, /select\("pickup_enabled,clickfood_delivery_enabled,own_delivery_enabled"\)/);
  assert.match(source, /body\.deliveryType === "DELIVERY"[\s\S]*DELIVERY_DISABLED/);
  assert.match(source, /body\.deliveryType === "PICKUP"[\s\S]*PICKUP_DISABLED/);

  const settingsCheck = source.indexOf('.select("pickup_enabled,clickfood_delivery_enabled,own_delivery_enabled")');
  const quoteCheck = source.indexOf('if (!body.addressId || !body.deliveryQuoteId)');
  const checkoutRpc = source.indexOf('rpc("checkout_order_atomic"');

  assert.ok(settingsCheck >= 0, "Revalidação de modalidades não encontrada");
  assert.ok(quoteCheck > settingsCheck, "Modalidade de entrega deve ser revalidada antes de aceitar cotação");
  assert.ok(checkoutRpc > settingsCheck, "Modalidades devem ser revalidadas antes de criar o pedido");
});
