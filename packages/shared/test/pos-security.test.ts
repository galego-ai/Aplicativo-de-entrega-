import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("PDV exige gerente para desconto de operador caixa", () => {
  const source = readFileSync("supabase/functions/create-pos-sale/index.ts", "utf8");
  assert.match(source, /membershipRole\s*===\s*"CASHIER"\s*&&\s*discount\s*>\s*0/);
  assert.match(source, /DISCOUNT_REQUIRES_MANAGER/);
  assert.match(source, /!Number\.isFinite\(rawDiscount\)\s*\|\|\s*rawDiscount\s*<\s*0/);
  assert.match(source, /rawDiscount\s*>\s*subtotal\s*\+\s*0\.009/);
  assert.match(source, /DISCOUNT_EXCEEDS_SUBTOTAL/);
});

test("PDV valida pagamentos antes de somar e persistir", () => {
  const source = readFileSync("supabase/functions/create-pos-sale/index.ts", "utf8");
  const validation = source.indexOf("INVALID_PAYMENT");
  const paymentTotal = source.indexOf("const paymentTotal");
  const rpc = source.indexOf('rpc("create_pos_sale_atomic"');
  assert.ok(validation > 0);
  assert.ok(paymentTotal > validation, "A soma deve ocorrer depois da validação dos pagamentos");
  assert.ok(rpc > paymentTotal, "A persistência deve ocorrer depois da conferência do total pago");
});

test("banco impõe invariantes contábeis do pedido", () => {
  const sql = readFileSync("supabase/migrations/20260830231350_order_accounting_invariants.sql", "utf8");
  assert.match(sql, /orders_discount_within_gross_check/);
  assert.match(sql, /discount\s*<=\s*subtotal\s*\+\s*delivery_fee\s*\+\s*0\.009/);
  assert.match(sql, /orders_total_accounting_check/);
  assert.match(sql, /abs\(\(subtotal\s*\+\s*delivery_fee\s*-\s*discount\)\s*-\s*total\)\s*<=\s*0\.009/);
});
