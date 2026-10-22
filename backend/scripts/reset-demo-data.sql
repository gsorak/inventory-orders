-- Deletes all business data, so that V2__sample_data.sql can be loaded again. Used by reset-demo-data.sh, which runs
-- both in one transaction. Identity sequences are deliberately NOT restarted: IDs held by visitors' browsers (cart,
-- open checkout) must not point at different new rows after a reset. DemoDataResetTest checks no table is missed.
TRUNCATE TABLE credit_note, return_item, order_return, shipment_item, shipment, order_item, customer_order,
    reservation_item, reservation, stock_receipt, inventory, product;
