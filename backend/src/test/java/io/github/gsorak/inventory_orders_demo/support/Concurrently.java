package io.github.gsorak.inventory_orders_demo.support;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.function.IntFunction;

/**
 * Runs tasks on separate threads, releasing them at the same instant so that
 * their transactions overlap.
 */
public final class Concurrently {

    public record Outcome<T>(T value, Throwable error) {

        public boolean succeeded() {
            return error == null;
        }
    }

    private Concurrently() {
    }

    public static <T> List<Outcome<T>> run(int taskCount, IntFunction<T> task) {
        ExecutorService executor = Executors.newFixedThreadPool(taskCount);
        CountDownLatch ready = new CountDownLatch(taskCount);
        CountDownLatch start = new CountDownLatch(1);
        try {
            List<Future<Outcome<T>>> futures = new ArrayList<>();
            for (int i = 0; i < taskCount; i++) {
                int taskIndex = i;
                futures.add(executor.submit(() -> {
                    ready.countDown();
                    start.await();
                    try {
                        return new Outcome<>(task.apply(taskIndex), null);
                    } catch (Throwable e) {
                        return new Outcome<T>(null, e);
                    }
                }));
            }
            ready.await();
            start.countDown();
            List<Outcome<T>> outcomes = new ArrayList<>();
            for (Future<Outcome<T>> future : futures) {
                outcomes.add(future.get(60, TimeUnit.SECONDS));
            }
            return outcomes;
        } catch (Exception e) {
            throw new IllegalStateException("Concurrent run failed", e);
        } finally {
            executor.shutdownNow();
        }
    }
}
