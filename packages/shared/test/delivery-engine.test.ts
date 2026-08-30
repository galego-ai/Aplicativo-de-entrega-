import test from "node:test";
import assert from "node:assert/strict";
import { rankDriverCandidates, calculateDriverEarning, offerExpiresAt } from "../src/delivery-engine.ts";

test("rankDriverCandidates prioriza melhor score e descarta candidatos inválidos", () => {
  const ranked = rankDriverCandidates([
    { driverId: "perto", distanceToStoreKm: 1, activeDeliveries: 0, rating: 4.8, acceptanceRate: 95, levelWeight: 80 },
    { driverId: "longe", distanceToStoreKm: 5, activeDeliveries: 0, rating: 5, acceptanceRate: 100, levelWeight: 100 },
    { driverId: "ocupado", distanceToStoreKm: 0.5, activeDeliveries: 2, rating: 4.9, acceptanceRate: 90, levelWeight: 50 },
    { driverId: "invalido", distanceToStoreKm: -1, activeDeliveries: 0, rating: 5, acceptanceRate: 100 },
  ]);
  assert.equal(ranked.length, 3);
  assert.equal(ranked[0].driverId, "perto");
  assert.ok(ranked[0].score >= ranked[1].score);
  assert.equal(ranked.some((item) => item.driverId === "invalido"), false);
});

test("calculateDriverEarning respeita fórmula e valor mínimo", () => {
  assert.equal(calculateDriverEarning({ base: 3, pickupDistanceKm: 2, deliveryDistanceKm: 4, perKm: 1.5, bonus: 2 }), 14);
  assert.equal(calculateDriverEarning({ base: 2, pickupDistanceKm: 1, deliveryDistanceKm: 1, perKm: 1, minimum: 8 }), 8);
});

test("calculateDriverEarning rejeita parâmetros negativos ou não finitos", () => {
  assert.throws(() => calculateDriverEarning({ base: -1, pickupDistanceKm: 0, deliveryDistanceKm: 1, perKm: 1 }), /INVALID_DELIVERY_PRICING/);
  assert.throws(() => calculateDriverEarning({ base: 1, pickupDistanceKm: Number.NaN, deliveryDistanceKm: 1, perKm: 1 }), /INVALID_DELIVERY_PRICING/);
});

test("offerExpiresAt aplica timeout e valida limites", () => {
  const offeredAt = new Date("2026-08-30T12:00:00.000Z");
  assert.equal(offerExpiresAt(offeredAt).toISOString(), "2026-08-30T12:00:15.000Z");
  assert.equal(offerExpiresAt(offeredAt, 30).toISOString(), "2026-08-30T12:00:30.000Z");
  assert.throws(() => offerExpiresAt(offeredAt, 4), /INVALID_OFFER_TIMEOUT/);
  assert.throws(() => offerExpiresAt(offeredAt, 121), /INVALID_OFFER_TIMEOUT/);
});
