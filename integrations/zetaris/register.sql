-- One statement per call. Run once after copying CSVs into the shared directory
-- in the platform driver container. Do not drop existing tables automatically.
CREATE LIGHTNING DATABASE shipment_rescue DESCRIBE BY "Shipment Rescue synthetic evaluation sources";
CREATE LIGHTNING FILESTORE TABLE orders FROM shipment_rescue FORMAT CSV OPTIONS (path "file:///home/zetaris/customer-data/shared/shipment-rescue/orders.csv", header "true", inferSchema "false");
CREATE LIGHTNING FILESTORE TABLE carrier FROM shipment_rescue FORMAT CSV OPTIONS (path "file:///home/zetaris/customer-data/shared/shipment-rescue/carrier.csv", header "true", inferSchema "false");
CREATE LIGHTNING FILESTORE TABLE warehouse FROM shipment_rescue FORMAT CSV OPTIONS (path "file:///home/zetaris/customer-data/shared/shipment-rescue/warehouse.csv", header "true", inferSchema "false");
CREATE LIGHTNING FILESTORE TABLE inventory FROM shipment_rescue FORMAT CSV OPTIONS (path "file:///home/zetaris/customer-data/shared/shipment-rescue/inventory.csv", header "true", inferSchema "false");
