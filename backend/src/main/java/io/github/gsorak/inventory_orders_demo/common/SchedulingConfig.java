package io.github.gsorak.inventory_orders_demo.common;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

@Configuration(proxyBeanMethods = false)
@EnableScheduling
@ConditionalOnProperty(name = "inventory.scheduling.enabled", havingValue = "true", matchIfMissing = true)
public class SchedulingConfig {
}
