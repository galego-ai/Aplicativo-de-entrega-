import type { OrderStatus } from "./index";

export type CartOption = {
  id: string;
  name: string;
  unitPrice: number;
  quantity?: number;
};

export type CartItem = {
  productId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  options?: CartOption[];
};

export type OrderCalculationInput = {
  items: CartItem[];
  deliveryFee?: number;
  discount?: number;
};

export type OrderCalculation = {
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
};

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function calculateOrder(input: OrderCalculationInput): OrderCalculation {
  if (!input.items.length) throw new Error("EMPTY_CART");

  const subtotal = input.items.reduce((orderTotal, item) => {
    if (!Number.isFinite(item.unitPrice) || item.unitPrice < 0) throw new Error("INVALID_PRODUCT_PRICE");
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) throw new Error("INVALID_QUANTITY");

    const optionsTotal = (item.options ?? []).reduce((sum, option) => {
      const qty = option.quantity ?? 1;
      if (!Number.isFinite(option.unitPrice) || option.unitPrice < 0) throw new Error("INVALID_OPTION_PRICE");
      if (!Number.isFinite(qty) || qty <= 0) throw new Error("INVALID_OPTION_QUANTITY");
      return sum + option.unitPrice * qty;
    }, 0);

    return orderTotal + (item.unitPrice + optionsTotal) * item.quantity;
  }, 0);

  const deliveryFee = input.deliveryFee ?? 0;
  const requestedDiscount = input.discount ?? 0;

  if (!Number.isFinite(deliveryFee) || deliveryFee < 0) throw new Error("INVALID_DELIVERY_FEE");
  if (!Number.isFinite(requestedDiscount) || requestedDiscount < 0) throw new Error("INVALID_DISCOUNT");

  const maxDiscount = subtotal + deliveryFee;
  const discount = Math.min(requestedDiscount, maxDiscount);
  const total = Math.max(0, subtotal + deliveryFee - discount);

  return {
    subtotal: money(subtotal),
    deliveryFee: money(deliveryFee),
    discount: money(discount),
    total: money(total),
  };
}

const transitions: Record<OrderStatus, readonly OrderStatus[]> = {
  PENDING_PAYMENT: ["WAITING_STORE", "PAYMENT_FAILED", "CANCELLED"],
  WAITING_STORE: ["ACCEPTED", "REJECTED", "CANCELLED"],
  ACCEPTED: ["PREPARING", "CANCELLED"],
  PREPARING: ["READY", "CANCELLED"],
  READY: ["WAITING_DRIVER", "DRIVER_ASSIGNED", "PICKED_UP", "CANCELLED"],
  WAITING_DRIVER: ["DRIVER_ASSIGNED", "CANCELLED"],
  DRIVER_ASSIGNED: ["PICKED_UP", "CANCELLED"],
  PICKED_UP: ["ON_THE_WAY", "CANCELLED"],
  ON_THE_WAY: ["DELIVERED", "CANCELLED"],
  DELIVERED: ["REFUNDED"],
  REJECTED: ["REFUNDED"],
  CANCELLED: ["REFUNDED"],
  PAYMENT_FAILED: ["PENDING_PAYMENT", "CANCELLED"],
  REFUNDED: [],
};

export function canTransitionOrder(from: OrderStatus, to: OrderStatus): boolean {
  return transitions[from].includes(to);
}

export function assertOrderTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransitionOrder(from, to)) {
    throw new Error(`INVALID_ORDER_TRANSITION:${from}->${to}`);
  }
}

export function allowedOrderTransitions(status: OrderStatus): readonly OrderStatus[] {
  return transitions[status];
}
