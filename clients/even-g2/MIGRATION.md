# Migration record

Source inspected: `/Users/derekspies/Projects/Various/even-g2-personal-hud`

Migrated on 2026-08-08 into `clients/even-g2` after inspecting the Language OS application, coaching/provider contracts, database boundary, test layout, and build configuration.

The source was intentionally copied as a migration rather than linked or merged. Generated `node_modules`, `dist`, `.DS_Store`, screenshots, and the old EHPK were not migrated. The Even Hub package ID remains unchanged for Prototype Mode continuity; the displayed app name and output artifact now identify Language OS.

The old standalone directory is retained as a read-only historical/rollback copy until the migrated client receives a final Prototype Mode smoke test. New development belongs here. Once that physical smoke test passes, the standalone project can be archived outside active Projects or deleted separately.

Version 0.3.0 adds the narrowly scoped R1 input-policy experiment. It does not alter the learning feed or introduce learner-data integration.
