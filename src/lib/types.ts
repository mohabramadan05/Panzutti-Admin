/** Row shapes the panel reads. Column names match database/panzutti_supabase*.sql in the website repo. */

export type Role = "customer" | "staff" | "admin";

export type OrderStatus = "pending" | "confirmed" | "preparing" | "ready" | "out_for_delivery" | "completed" | "cancelled";

export type Order = {
  id: string;
  order_number: number;
  branch_id: string;
  type: "pickup" | "delivery";
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  delivery_address: string | null;
  delivery_notes: string | null;
  status: OrderStatus;
  payment_method: "cash" | "instapay";
  payment_status: "paid" | "unpaid";
  scheduled_for: string | null;
  promo_code: string | null;
  subtotal: number;
  discount_total: number;
  delivery_fee: number;
  total: number;
  note: string | null;
  cancel_reason: string | null;
  locale: string;
  created_at: string;
  updated_at: string;
};

export type OrderItem = {
  id: string;
  item_name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  note: string | null;
  order_item_addons: { id: string; group_name: string; addon_name: string; quantity: number }[];
};

export type PaymentProof = {
  id: string;
  order_id: string;
  file_path: string;
  reference: string | null;
  status: "pending" | "approved" | "rejected";
  review_note: string | null;
  created_at: string;
};

export const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: "New",
  confirmed: "Confirmed",
  preparing: "In the oven",
  ready: "Ready",
  out_for_delivery: "Out for delivery",
  completed: "Completed",
  cancelled: "Cancelled",
};

/** Same transitions update_order_status() allows (cancel is offered separately). */
export function nextStatus(o: Pick<Order, "status" | "type">): OrderStatus | null {
  switch (o.status) {
    case "pending":
      return "confirmed";
    case "confirmed":
      return "preparing";
    case "preparing":
      return "ready";
    case "ready":
      return o.type === "pickup" ? "completed" : "out_for_delivery";
    case "out_for_delivery":
      return "completed";
    default:
      return null;
  }
}

export const NEXT_LABEL: Partial<Record<OrderStatus, string>> = {
  confirmed: "Confirm order",
  preparing: "Start baking",
  ready: "Mark ready",
  out_for_delivery: "Send with driver",
  completed: "Complete",
};
