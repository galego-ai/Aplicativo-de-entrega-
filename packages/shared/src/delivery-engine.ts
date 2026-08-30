import type { DeliveryStatus } from "./index";

export type DriverCandidate = {
  driverId: string;
  distanceToStoreKm: number;
  activeDeliveries: number;
  rating: number;
  acceptanceRate: number;
  levelWeight?: number;
};

export type RankedDriver = DriverCandidate & {
  score: number;
};

export function rankDriverCandidates(candidates: DriverCandidate[]): RankedDriver[] {
  return candidates
    .filter((candidate) =>
      Number.isFinite(candidate.distanceToStoreKm) &&
      candidate.distanceToStoreKm >= 0 &&
      candidate.activeDeliveries >= 0 &&
      candidate.rating >= 0 &&
      candidate.rating <= 5 &&
      candidate.acceptanceRate >= 0 &&
      candidate.acceptanceRate <= 100
    )
    .map((candidate) => {
      const proximityScore = Math.max(0, 100 - candidate.distanceToStoreKm * 12);
      const workloadScore = Math.max(0, 100 - candidate.activeDeliveries * 35);
      const ratingScore = candidate.rating * 20;
      const acceptanceScore = candidate.acceptanceRate;
      const levelScore = Math.max(0, Math.min(candidate.levelWeight ?? 0, 100));

      const score =
        proximityScore * 0.5 +
        workloadScore * 0.2 +
        ratingScore * 0.15 +
        acceptanceScore * 0.1 +
        levelScore * 0.05;

      return { ...candidate, score: Math.round(score * 100) / 100 };
    })
    .sort((a, b) => b.score - a.score || a.distanceToStoreKm - b.distanceToStoreKm);
}

export function calculateDriverEarning(params: {
  base: number;
  pickupDistanceKm: number;
  deliveryDistanceKm: number;
  perKm: number;
  bonus?: number;
  minimum?: number;
}): number {
  const { base, pickupDistanceKm, deliveryDistanceKm, perKm } = params;
  const bonus = params.bonus ?? 0;
  const minimum = params.minimum ?? 0;

  const values = [base, pickupDistanceKm, deliveryDistanceKm, perKm, bonus, minimum];
  if (values.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error("INVALID_DELIVERY_PRICING");
  }

  const calculated = base + (pickupDistanceKm + deliveryDistanceKm) * perKm + bonus;
  return Math.round(Math.max(calculated, minimum) * 100) / 100;
}

export function offerExpiresAt(offeredAt: Date, timeoutSeconds = 15): Date {
  if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 5 || timeoutSeconds > 120) {
    throw new Error("INVALID_OFFER_TIMEOUT");
  }
  return new Date(offeredAt.getTime() + timeoutSeconds * 1000);
}

const driverControlledTransitions: Partial<Record<DeliveryStatus, readonly DeliveryStatus[]>> = {
  DRIVER_ASSIGNED: ["DRIVER_TO_STORE", "INCIDENT"],
  DRIVER_TO_STORE: ["DRIVER_AT_STORE", "INCIDENT"],
  DRIVER_AT_STORE: ["PICKUP_CONFIRMED", "INCIDENT"],
  PICKUP_CONFIRMED: ["DRIVER_TO_CUSTOMER", "INCIDENT"],
  DRIVER_TO_CUSTOMER: ["DRIVER_AT_CUSTOMER", "INCIDENT"],
  DRIVER_AT_CUSTOMER: ["DELIVERED", "CUSTOMER_UNAVAILABLE", "INCIDENT"],
  CUSTOMER_UNAVAILABLE: ["RETURN_REQUIRED", "DELIVERED"],
  RETURN_REQUIRED: ["DELIVERED", "INCIDENT"],
};

export function allowedDriverDeliveryTransitions(status: DeliveryStatus): readonly DeliveryStatus[] {
  return driverControlledTransitions[status] ?? [];
}

export function canDriverTransitionDelivery(from: DeliveryStatus, to: DeliveryStatus): boolean {
  return allowedDriverDeliveryTransitions(from).includes(to);
}

export function assertDriverDeliveryTransition(from: DeliveryStatus, to: DeliveryStatus): void {
  if (!canDriverTransitionDelivery(from, to)) {
    throw new Error(`INVALID_DELIVERY_TRANSITION:${from}->${to}`);
  }
}
