package io.github.gsorak.inventory_orders_demo.inventory;

import java.util.Collection;
import java.util.Set;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface ProductRepository extends JpaRepository<Product, Long> {

    boolean existsBySku(String sku);

    @Query("SELECT p.sku FROM Product p WHERE p.sku IN :skus")
    Set<String> findExistingSkus(Collection<String> skus);
}
