import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  rankDriverCandidates,
  calculateDriverEarning,
  offerExpiresAt,
  allowedDriverDeliveryTransitions,
  canDriverTransitionDelivery,
  assertDriverDeliveryTransition,
} from "../src/delivery-engine.ts";
import type { DeliveryStatus } from "../src/index.ts";

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

test("máquina compartilhada de entrega cobre fluxo operacional e incidentes", () => {
  assert.equal(canDriverTransitionDelivery("DRIVER_ASSIGNED", "DRIVER_TO_STORE"), true);
  assert.equal(canDriverTransitionDelivery("DRIVER_ASSIGNED", "INCIDENT"), true);
  assert.equal(canDriverTransitionDelivery("PICKUP_CONFIRMED", "DRIVER_TO_CUSTOMER"), true);
  assert.equal(canDriverTransitionDelivery("DRIVER_AT_CUSTOMER", "CUSTOMER_UNAVAILABLE"), true);
  assert.equal(canDriverTransitionDelivery("CUSTOMER_UNAVAILABLE", "RETURN_REQUIRED"), true);
  assert.equal(canDriverTransitionDelivery("DELIVERED", "DRIVER_TO_STORE"), false);
  assert.doesNotThrow(() => assertDriverDeliveryTransition("RETURN_REQUIRED", "INCIDENT"));
  assert.throws(() => assertDriverDeliveryTransition("INCIDENT", "DELIVERED"), /INVALID_DELIVERY_TRANSITION/);
});

test("contrato SQL das transições dirigidas pelo entregador coincide com o TypeScript", () => {
  const sql = readFileSync("supabase/migrations/20260830230638_delivery_incident_transition_sync.sql", "utf8");
  const caseBlock = sql.match(/v_allowed\s*:=\s*case\s+v_delivery\.status([\s\S]*?)else\s+false/i)?.[1];
  assert.ok(caseBlock, "Bloco de transições não encontrado na migration");

  const parsed = new Map<string, string[]>();
  const rule = /when\s+'([^']+)'\s+then\s+p_next_status\s+in\s*\(([^)]+)\)/gi;
  for (const match of caseBlock.matchAll(rule)) {
    parsed.set(match[1], [...match[2].matchAll(/'([^']+)'/g)].map((item) => item[1]));
  }

  const controlled: DeliveryStatus[] = [
    "DRIVER_ASSIGNED",
    "DRIVER_TO_STORE",
    "DRIVER_AT_STORE",
    "PICKUP_CONFIRMED",
    "DRIVER_TO_CUSTOMER",
    "DRIVER_AT_CUSTOMER",
    "CUSTOMER_UNAVAILABLE",
    "RETURN_REQUIRED",
  ];

  assert.equal(parsed.size, controlled.length);
  for (const status of controlled) {
    assert.deepEqual(parsed.get(status), [...allowedDriverDeliveryTransitions(status)], `Divergência em ${status}`);
  }
});
