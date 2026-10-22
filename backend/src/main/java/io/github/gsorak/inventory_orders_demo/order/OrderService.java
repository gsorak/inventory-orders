package io.github.gsorak.inventory_orders_demo.order;

import java.time.Clock;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import io.github.gsorak.inventory_orders_demo.common.BusinessException;
import io.github.gsorak.inventory_orders_demo.common.CreationResult;
import io.github.gsorak.inventory_orders_demo.common.DemoMode;
import io.github.gsorak.inventory_orders_demo.common.ErrorCode;
import io.github.gsorak.inventory_orders_demo.common.PageResponse;
import io.github.gsorak.inventory_orders_demo.reservation.Reservation;
import io.github.gsorak.inventory_orders_demo.reservation.ReservationService;

@Service
public class OrderService {

    private final OrderRepository orderRepository;
    private final ReservationService reservationService;
    private final DemoMode demoMode;
    private final Clock clock;

    public OrderService(OrderRepository orderRepository, ReservationService reservationService, DemoMode demoMode,
            Clock clock) {
        this.orderRepository = orderRepository;
        this.reservationService = reservationService;
        this.demoMode = demoMode;
        this.clock = clock;
    }

    /**
     * Confirms the reservation and creates its order. Inventory does not change:
     * the reserved units stay reserved,
     * now on behalf of the order, until they ship. The reservation row lock makes
     * this mutually exclusive with
     * cancellation and expiry; whichever runs first decides the outcome. Repeating
     * the confirmation with the same
     * payment reference returns the existing order.
     */
    @Transactional
    public CreationResult<OrderResponse> confirmPayment(long reservationId, String paymentReference) {
        demoMode.requirePaymentReference(reservationId, paymentReference);
        Reservation reservation = reservationService.lockReservation(reservationId);
        if (!reservation.confirm(clock.instant())) {
            CustomerOrder existing = orderRepository.findByReservationId(reservationId).orElseThrow();
            if (!existing.getPaymentReference().equals(paymentReference)) {
                throw new BusinessException(ErrorCode.INVALID_STATE_TRANSITION,
                        "Reservation %d was already confirmed with a different payment reference"
                                .formatted(reservationId));
            }
            return CreationResult.replayed(OrderResponse.of(existing));
        }
        if (orderRepository.existsByPaymentReference(paymentReference)) {
            throw new BusinessException(ErrorCode.ALREADY_EXISTS,
                    "Payment reference %s was already used for another order".formatted(paymentReference));
        }
        CustomerOrder order = orderRepository.save(
                CustomerOrder.fromConfirmedReservation(reservation, paymentReference));
        return CreationResult.created(OrderResponse.of(order));
    }

    @Transactional(readOnly = true)
    public OrderResponse get(long orderId) {
        return OrderResponse.of(orderRepository.findById(orderId)
                .orElseThrow(() -> BusinessException.notFound("Order", orderId)));
    }

    /**
     * The order created by confirming the reservation (at most one: reservation_id
     * is unique).
     */
    @Transactional(readOnly = true)
    public OrderResponse getByReservation(long reservationId) {
        return orderRepository.findByReservationId(reservationId).map(OrderResponse::of).orElseThrow(() -> {
            reservationService.get(reservationId); // 404 for an unknown reservation
            return new BusinessException(ErrorCode.NOT_FOUND,
                    "Reservation %d has no order".formatted(reservationId));
        });
    }

    @Transactional(readOnly = true)
    public PageResponse<OrderResponse> list(int page, int size) {
        return PageResponse.of(orderRepository.findAll(PageResponse.newestFirst(page, size)).map(OrderResponse::of));
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void requireExists(long orderId) {
        if (!orderRepository.existsById(orderId)) {
            throw BusinessException.notFound("Order", orderId);
        }
    }

    /** Must be the first lock a fulfilment or return transaction takes. */
    @Transactional(propagation = Propagation.MANDATORY)
    public CustomerOrder lockOrder(long orderId) {
        return orderRepository.findByIdForUpdate(orderId)
                .orElseThrow(() -> BusinessException.notFound("Order", orderId));
    }
}
