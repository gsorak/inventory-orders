package io.github.gsorak.inventory_orders_demo.returns;

import static io.github.gsorak.inventory_orders_demo.returns.ReturnApiTest.itemId;
import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import io.github.gsorak.inventory_orders_demo.common.BusinessException;
import io.github.gsorak.inventory_orders_demo.common.ErrorCode;
import io.github.gsorak.inventory_orders_demo.inventory.StockLevels;
import io.github.gsorak.inventory_orders_demo.order.OrderResponse;
import io.github.gsorak.inventory_orders_demo.support.Concurrently;
import io.github.gsorak.inventory_orders_demo.support.Concurrently.Outcome;
import io.github.gsorak.inventory_orders_demo.support.IntegrationTest;

class ReturnConcurrencyTest extends IntegrationTest {

        @Autowired
        ReturnService returnService;

        @Test
        void concurrentReturnsNeverExceedDeliveredQuantityOrDoubleRefund() {
                long product = fixtures.createProduct("12.50", 10);
                OrderResponse order = fixtures.placeOrder(Map.of(product, 3));
                long item = itemId(order, product);
                fixtures.deliver(order.id(), Map.of(item, 3));
                CreateReturnRequest returnOne = new CreateReturnRequest(List.of(new CreateReturnRequest.Line(
                                item, 1, ReturnReason.NO_LONGER_NEEDED, ItemCondition.UNOPENED)));

                List<Outcome<ReturnResponse>> outcomes = Concurrently.run(8,
                                i -> returnService.createReturn(order.id(), returnOne, null).resource());

                assertThat(outcomes.stream().filter(Outcome::succeeded)).hasSize(3);
                assertThat(outcomes.stream().filter(outcome -> !outcome.succeeded()))
                                .allMatch(outcome -> outcome.error() instanceof BusinessException e
                                                && e.code() == ErrorCode.QUANTITY_EXCEEDED);
                OrderResponse after = fixtures.order(order.id());
                assertThat(after.creditedTotal()).isEqualByComparingTo("37.50");
                assertThat(after.netTotal()).isEqualByComparingTo("0.00");
                assertThat(fixtures.stock(product)).isEqualTo(new StockLevels(10, 0, 10));
                invariants.assertOrderItemsConsistent(order.id());
                invariants.assertOrderCreditConsistent(order.id());
                invariants.assertInventoryConsistent(product);
        }
}
