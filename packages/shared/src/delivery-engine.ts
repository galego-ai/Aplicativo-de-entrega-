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
