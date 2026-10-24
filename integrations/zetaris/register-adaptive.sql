-- Separate synthetic schema; never overwrite the baseline tables.
CREATE LIGHTNING DATABASE shipment_rescue_adaptive DESCRIBE BY "Shipment Rescue adaptive synthetic evidence";
CREATE LIGHTNING FILESTORE TABLE orders FROM shipment_rescue_adaptive FORMAT CSV OPTIONS (path "file:///home/zetaris/customer-data/shared/shipment-rescue-adaptive/orders.csv", header "true", inferSchema "false");
CREATE LIGHTNING FILESTORE TABLE carrier FROM shipment_rescue_adaptive FORMAT CSV OPTIONS (path "file:///home/zetaris/customer-data/shared/shipment-rescue-adaptive/carrier.csv", header "true", inferSchema "false");
CREATE LIGHTNING FILESTORE TABLE warehouse FROM shipment_rescue_adaptive FORMAT CSV OPTIONS (path "file:///home/zetaris/customer-data/shared/shipment-rescue-adaptive/warehouse.csv", header "true", inferSchema "false");
CREATE LIGHTNING FILESTORE TABLE inventory FROM shipment_rescue_adaptive FORMAT CSV OPTIONS (path "file:///home/zetaris/customer-data/shared/shipment-rescue-adaptive/inventory.csv", header "true", inferSchema "false");
CREATE LIGHTNING FILESTORE TABLE warehouse_updates FROM shipment_rescue_adaptive FORMAT CSV OPTIONS (path "file:///home/zetaris/customer-data/shared/shipment-rescue-adaptive/warehouse_updates.csv", header "true", inferSchema "false");
