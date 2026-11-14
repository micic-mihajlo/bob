"use client";

import { Check } from "lucide-react";
import { useBob } from "@/components/app/BobContext";
import { Avatar } from "@/components/common/Avatar";
import type { WorkOrder, WorkOrderStatus } from "@/lib/types";

const STATUS_LABEL: Record<WorkOrderStatus, string> = {
  open: "Open",
  running: "Running",
  review: "In review",
  done: "Done",
  stale: "Stale",
};

export function WorkOrderList({ orders, empty }: { orders: readonly WorkOrder[]; empty: string }) {
  const { agentsById, selectAgent } = useBob();
  if (orders.length === 0) return empty ? <p className="empty-line">{empty}</p> : null;

  return (
    <ul className="work-orders">
      {orders.map((order) => {
        const owner = order.ownerAgentId ? agentsById.get(order.ownerAgentId) : undefined;
        return (
          <li key={order.id} className="work-order" data-status={order.status}>
            <span className="work-order-box" aria-hidden="true">
              {order.status === "done" ? <Check className="icon" size={12} /> : null}
            </span>
            <span className="work-order-title">{order.title}</span>
            {owner ? (
              <button type="button" className="work-order-owner" title={`Open ${owner.name}'s thread`} onClick={() => selectAgent(owner.id)}>
                <Avatar agent={owner} size={16} />
                {owner.name}
              </button>
            ) : (
              <span className="work-order-owner work-order-unowned">No owner yet</span>
            )}
            <span className="status-badge" data-status={order.status}>
              {STATUS_LABEL[order.status]}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
