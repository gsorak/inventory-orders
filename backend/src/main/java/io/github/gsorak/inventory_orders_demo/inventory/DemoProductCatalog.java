package io.github.gsorak.inventory_orders_demo.inventory;

import java.util.List;

import org.springframework.stereotype.Component;

import io.github.gsorak.inventory_orders_demo.common.BusinessException;
import io.github.gsorak.inventory_orders_demo.common.DemoMode;
import io.github.gsorak.inventory_orders_demo.common.ErrorCode;

/**
 * Public demo only (app.demo.enabled): visitor-created products must use a
 * fixed SKU and name from this list, so no
 * visitor can show free text to others. Each entry exists at most once, which
 * also caps visitor-created products.
 */
@Component
public class DemoProductCatalog {

    static final List<ProductTemplate> TEMPLATES = List.of(
            new ProductTemplate("KB-MECH", "Mechanical keyboard"),
            new ProductTemplate("MON-27", "27-inch monitor"),
            new ProductTemplate("ARM-MON", "Monitor arm"),
            new ProductTemplate("HUB-USBC", "USB-C hub"),
            new ProductTemplate("CHRG-65W", "USB-C charger 65W"),
            new ProductTemplate("STAND-LAP", "Laptop stand"),
            new ProductTemplate("CAM-HD", "HD webcam"),
            new ProductTemplate("HEAD-BT", "Bluetooth headset"),
            new ProductTemplate("SPK-USB", "USB speakers"),
            new ProductTemplate("SSD-1TB", "Portable SSD 1TB"),
            new ProductTemplate("MAT-XL", "Desk mat XL"),
            new ProductTemplate("LAMP-CLIP", "Clip-on lamp"),
            new ProductTemplate("NOTE-A5", "A5 notebook"),
            new ProductTemplate("PEN-GEL", "Gel pens, pack of 10"),
            new ProductTemplate("TRAY-DOC", "Document tray"));

    private final DemoMode demoMode;

    public DemoProductCatalog(DemoMode demoMode) {
        this.demoMode = demoMode;
    }

    public boolean isEnabled() {
        return demoMode.isEnabled();
    }

    public List<ProductTemplate> templates() {
        return TEMPLATES;
    }

    /**
     * In the demo, rejects any SKU and name that is not exactly a catalogue entry.
     */
    public void requireAllowed(String sku, String name) {
        if (isEnabled() && !TEMPLATES.contains(new ProductTemplate(sku, name))) {
            throw new BusinessException(ErrorCode.INVALID_REQUEST,
                    "In the public demo, products must be chosen from the demo catalogue.");
        }
    }
}
