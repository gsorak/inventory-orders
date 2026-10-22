import { order, orderItem, shipment } from '../test-utils/fixtures';
import { canPack, canReturn, changedOrderValues, nextOrderStep } from './orders';

describe('canPack and canReturn', () => {
  it('offer packing while units are unpacked and returns while delivered units are not returned', () => {
    expect(canPack(order())).toBe(true);
    expect(canPack(order({ items: [orderItem({ packedQuantity: 3 })] }))).toBe(false);
    expect(canReturn(order())).toBe(false);
    expect(canReturn(order({ items: [orderItem({ deliveredQuantity: 2, returnedQuantity: 1 })] }))).toBe(true);
    expect(canReturn(order({ items: [orderItem({ deliveredQuantity: 2, returnedQuantity: 2 })] }))).toBe(false);
  });
});

describe('nextOrderStep', () => {
  it('suggests a partial shipment for a new order', () => {
    expect(nextOrderStep(order(), [])).toMatch(/^Pack a shipment/);
  });

  it('suggests shipping, then delivering, then packing the rest', () => {
    const partly = order({ status: 'IN_FULFILMENT', items: [orderItem({ packedQuantity: 2 })] });

    expect(nextOrderStep(partly, [shipment()])).toMatch(/^Ship shipment #5/);
    expect(nextOrderStep(partly, [shipment({ status: 'SHIPPED' })])).toMatch(/^Deliver shipment #5/);
    expect(nextOrderStep(partly, [shipment({ status: 'DELIVERED' })])).toBe('Pack the remaining units in another shipment.');
  });

  it('suggests a return once everything is delivered, until all units are returned', () => {
    const delivered = { packedQuantity: 3, shippedQuantity: 3, deliveredQuantity: 3 };
    const shipments = [shipment({ status: 'DELIVERED' as const })];

    expect(nextOrderStep(order({ status: 'DELIVERED', items: [orderItem(delivered)] }), shipments)).toMatch(/^Return/);
    expect(
      nextOrderStep(order({ status: 'DELIVERED', items: [orderItem({ ...delivered, returnedQuantity: 3 })] }), shipments)
    ).toMatch(/^All delivered units have been returned/);
  });
});

describe('changedOrderValues', () => {
  it('reports nothing on the first load', () => {
    expect(changedOrderValues(undefined, order()).size).toBe(0);
  });

  it('reports changed totals, status and item counters', () => {
    const before = order();
    const after = order({ status: 'IN_FULFILMENT', items: [orderItem({ packedQuantity: 2 })] });

    expect([...changedOrderValues(before, after)]).toEqual(['status', '11.packedQuantity']);
  });
});
