import test from "node:test";
import assert from "node:assert/strict";
import { calculateOrder, canTransitionOrder, assertOrderTransition, allowedOrderTransitions } from "../src/order-engine.ts";

test("calculateOrder soma produtos, adicionais, entrega e desconto com arredondamento monetário", () => {
  const result = calculateOrder({
    items: [
      { productId: "a", name: "Combo", unitPrice: 19.9, quantity: 2, options: [{ id: "x", name: "Extra", unitPrice: 2.55, quantity: 2 }] },
      { productId: "b", name: "Bebida", unitPrice: 6.333, quantity: 1 },
    ],
    deliveryFee: 7.5,
    discount: 5,
  });
  assert.deepEqual(result, { subtotal: 56.33, deliveryFee: 7.5, discount: 5, total: 58.83 });
});

test("calculateOrder limita desconto ao total e nunca gera valor negativo", () => {
  const result = calculateOrder({ items: [{ productId: "a", name: "Item", unitPrice: 10, quantity: 1 }], deliveryFee: 3, discount: 100 });
  assert.deepEqual(result, { subtotal: 10, deliveryFee: 3, discount: 13, total: 0 });
});

test("calculateOrder rejeita carrinho e valores inválidos", () => {
  assert.throws(() => calculateOrder({ items: [] }), /EMPTY_CART/);
  assert.throws(() => calculateOrder({ items: [{ productId: "a", name: "Item", unitPrice: -1, quantity: 1 }] }), /INVALID_PRODUCT_PRICE/);
  assert.throws(() => calculateOrder({ items: [{ productId: "a", name: "Item", unitPrice: 1, quantity: 0 }] }), /INVALID_QUANTITY/);
  assert.throws(() => calculateOrder({ items: [{ productId: "a", name: "Item", unitPrice: 1, quantity: 1, options: [{ id: "x", name: "Extra", unitPrice: -1 }] }] }), /INVALID_OPTION_PRICE/);
  assert.throws(() => calculateOrder({ items: [{ productId: "a", name: "Item", unitPrice: 1, quantity: 1 }], deliveryFee: -1 }), /INVALID_DELIVERY_FEE/);
  assert.throws(() => calculateOrder({ items: [{ productId: "a", name: "Item", unitPrice: 1, quantity: 1 }], discount: -1 }), /INVALID_DISCOUNT/);
});

test("máquina de estados permite somente transições previstas", () => {
  assert.equal(canTransitionOrder("PENDING_PAYMENT", "WAITING_STORE"), true);
  assert.equal(canTransitionOrder("WAITING_STORE", "DELIVERED"), false);
  assert.equal(canTransitionOrder("ON_THE_WAY", "DELIVERED"), true);
  assert.deepEqual(allowedOrderTransitions("REFUNDED"), []);
  assert.doesNotThrow(() => assertOrderTransition("DELIVERED", "REFUNDED"));
  assert.throws(() => assertOrderTransition("REFUNDED", "WAITING_STORE"), /INVALID_ORDER_TRANSITION/);
});
