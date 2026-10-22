import type { Order, Shipment } from '../api/types';

/** Whether some ordered units are not packed yet. A hint only: the backend validates every shipment. */
export function canPack(order: Order): boolean {
  return order.status !== 'DELIVERED' && order.items.some((i) => i.packedQuantity < i.quantity);
}

/** Whether some delivered units have not been returned yet. */
export function canReturn(order: Order): boolean {
  return order.items.some((i) => i.returnedQuantity < i.deliveredQuantity);
}

/**
 * Suggests the next demo step for an order from the state reported by the backend. Remaining quantities
 * are hints only; the backend decides whether an operation is allowed.
 */
export function nextOrderStep(order: Order, shipments: Shipment[]): string {
  const packed = shipments.find((s) => s.status === 'PACKED');
  if (packed) {
    return `Ship shipment #${packed.id}: its units leave the warehouse and on-hand stock decreases.`;
  }
  const shipped = shipments.find((s) => s.status === 'SHIPPED');
  if (shipped) {
    return `Deliver shipment #${shipped.id} to make its units returnable.`;
  }
  if (canPack(order)) {
    return shipments.length === 0
      ? 'Pack a shipment. Pack fewer units than ordered to demonstrate partial fulfilment.'
      : 'Pack the remaining units in another shipment.';
  }
  if (canReturn(order)) {
    return 'Return delivered units to issue a credit note. Unopened units are restocked; opened or damaged ones are discarded.';
  }
  return 'All delivered units have been returned. Check the Reports page for cycle time and stock.';
}

/** Keys of order values that differ between two loads, used to highlight what an operation changed. */
export function changedOrderValues(before: Order | undefined, after: Order): Set<string> {
  const changed = new Set<string>();
  if (!before || before.id !== after.id) {
    return changed;
  }
  for (const key of ['status', 'grossTotal', 'creditedTotal', 'netTotal'] as const) {
    if (before[key] !== after[key]) {
      changed.add(key);
    }
  }
  for (const item of after.items) {
    const previous = before.items.find((i) => i.id === item.id);
    for (const key of ['packedQuantity', 'shippedQuantity', 'deliveredQuantity', 'returnedQuantity'] as const) {
      if (previous && previous[key] !== item[key]) {
        changed.add(`${item.id}.${key}`);
      }
    }
  }
  return changed;
}
