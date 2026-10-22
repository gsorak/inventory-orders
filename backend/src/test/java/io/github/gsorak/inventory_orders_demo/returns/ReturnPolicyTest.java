package io.github.gsorak.inventory_orders_demo.returns;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

class ReturnPolicyTest {

    @ParameterizedTest(name = "{0} + {1} -> {2}")
    @CsvSource({
            "NO_LONGER_NEEDED,   UNOPENED, RESTOCK",
            "WRONG_ITEM_SENT,    UNOPENED, RESTOCK",
            "DEFECTIVE,          UNOPENED, DISCARD",
            "DAMAGED_IN_TRANSIT, UNOPENED, DISCARD",
            "NO_LONGER_NEEDED,   OPENED,   DISCARD",
            "WRONG_ITEM_SENT,    OPENED,   DISCARD",
            "DEFECTIVE,          OPENED,   DISCARD",
            "DAMAGED_IN_TRANSIT, OPENED,   DISCARD",
            "NO_LONGER_NEEDED,   DAMAGED,  DISCARD",
            "WRONG_ITEM_SENT,    DAMAGED,  DISCARD",
            "DEFECTIVE,          DAMAGED,  DISCARD",
            "DAMAGED_IN_TRANSIT, DAMAGED,  DISCARD"
    })
    void onlyUnopenedGoodsReturnedForNonFaultReasonsAreRestocked(ReturnReason reason, ItemCondition condition,
            Disposition expected) {
        assertThat(ReturnPolicy.dispositionFor(reason, condition)).isEqualTo(expected);
    }
}
