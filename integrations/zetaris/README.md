# Local Zetaris JDBC bridge

Prepared from the official platform bundle's connection instructions. Verified against the running local instance on October 23, 2026: SELECT 1, registration of all four sample sources, and the full --zetaris investigation run.

The gateway account alone does not run the engine. The official local platform must pass `preflight.sh`, `docker compose pull`, `docker compose up -d`, and `verify.sh` first. Keep its registry credentials outside the application repository.

The bundle includes `jdbc/ndp-jdbc-driver-2.4.3.1-7eff043-driver.jar`. Use that driver, not Hive or Spark. Java 21 is installed on this Mac.

Export `ZETARIS_JDBC_URL=jdbc:zetaris:lightning@localhost:10000`, `ZETARIS_USER`, and `ZETARIS_PASSWORD` in the local shell. Never place actual credentials into this README, source files, arguments, or chat.

Run from the project root, replacing the jar path with the downloaded bundle's absolute path:

```sh
printf 'SELECT 1' | java --class-path /absolute/path/to/jdbc/ndp-jdbc-driver-2.4.3.1-7eff043-driver.jar integrations/zetaris/Query.java
```

The bridge returns a JSON array of rows, executes a single SELECT and closes the result set, statement and connection. More than 1000 rows fails rather than silently truncating results. Fixed queries and a least-privilege account are still necessary; the SELECT prefix check is not a full SQL parser or a replacement for database access controls.

The four CSVs in `data/zetaris/` are synthetic source data. Register them in Zetaris, preserve original column names and timestamps, then verify retrieval before routing the application through this bridge. Do not claim live integration based on compilation alone.

## Adaptive retrieval and refresh

Investigations now use `openZetaris()` rather than eagerly loading every table. Orders are read first; each controller task queries its corresponding source. A refresh rereads that source, or an operator-configured same-schema `ZETARIS_REFRESH_WAREHOUSE_TABLE`, `ZETARIS_REFRESH_CARRIER_TABLE` or `ZETARIS_REFRESH_INVENTORY_TABLE`. Identifiers are validated; no model-generated SQL or table selection is accepted. The full loader remains available to `doctor --zetaris`.

For the separate synthetic adaptive test, copy `data/zetaris-adaptive/` into the driver container shared directory `/home/zetaris/customer-data/shared/shipment-rescue-adaptive/`, then execute `register-adaptive.sql` once with an authorized setup account. It creates `shipment_rescue_adaptive` and five new tables; it does not overwrite baseline tables. Export `ZETARIS_SCHEMA=shipment_rescue_adaptive`, `ZETARIS_REFRESH_WAREHOUSE_TABLE=warehouse_updates`, `SHIPMENT_AS_OF=2026-10-23T17:00:00Z` and `SHIPMENT_SYNTHETIC=true`. Run `npm run demo -- --zetaris`, adding `--live-model` for Nightshift. The refresh table is explicit synthetic test evidence, not a claimed live warehouse feed.
