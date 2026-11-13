import { Badge } from "@/components/ui/misc";
import { ORDER_STATUS_LABEL, type OrderStatusCode } from "@/lib/format";

const TONE: Record<OrderStatusCode, "neutral" | "green" | "warning" | "danger" | "outline"> = {
  PENDING: "warning",
  PREPARING: "neutral",
  READY: "green",
  COMPLETED: "outline",
  CANCELLED: "danger",
};

export function OrderStatusBadge({ status }: { status: OrderStatusCode }) {
  return <Badge tone={TONE[status]}>{ORDER_STATUS_LABEL[status]}</Badge>;
}
