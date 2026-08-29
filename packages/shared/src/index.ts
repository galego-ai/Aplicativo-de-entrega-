export type UserRole =
  | "SUPER_ADMIN"
  | "ADMIN"
  | "SUPPORT"
  | "STORE_OWNER"
  | "STORE_MANAGER"
  | "CASHIER"
  | "KITCHEN"
  | "EXPEDITION"
  | "DRIVER"
  | "CUSTOMER";

export type OrderStatus =
  | "PENDING_PAYMENT"
  | "WAITING_STORE"
  | "ACCEPTED"
  | "PREPARING"
  | "READY"
  | "WAITING_DRIVER"
  | "DRIVER_ASSIGNED"
  | "PICKED_UP"
  | "ON_THE_WAY"
  | "DELIVERED"
  | "REJECTED"
  | "CANCELLED"
  | "PAYMENT_FAILED"
  | "REFUNDED";

export type DeliveryStatus =
  | "SEARCHING_DRIVER"
  | "OFFER_SENT"
  | "DRIVER_ASSIGNED"
  | "DRIVER_TO_STORE"
  | "DRIVER_AT_STORE"
  | "PICKUP_CONFIRMED"
  | "DRIVER_TO_CUSTOMER"
  | "DRIVER_AT_CUSTOMER"
  | "DELIVERED"
  | "DELIVERY_CANCELLED"
  | "CUSTOMER_UNAVAILABLE"
  | "RETURN_REQUIRED"
  | "INCIDENT";

export type PaymentMethod = "PIX" | "CREDIT_CARD" | "DEBIT_CARD" | "CASH" | "WALLET" | "OTHER";
export type OrderSource = "APP" | "POS" | "PHONE" | "MANUAL";

export * from "./order-engine";
export * from "./delivery-engine";
