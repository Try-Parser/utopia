# Data access and performance

Use for data/query changes or a measured performance investigation. Identify the slow path from profiling, traces or query plans; the database is a possible bottleneck, not an assumption.

Check affected queries for N+1 access, missing indexes, unbounded reads, eager loads and leading-wildcard scans. Bound lists that can grow, selecting pagination from actual access patterns and contracts. Preserve transaction, validation, ownership and migration behavior. Test relevant fresh-install/upgrade paths when schemas change.

Prefer established storage and runtime choices. Compare latency, resource use and operating cost before adding infrastructure. Record environment, representative inputs, baseline and candidate; do not infer production gains from a synthetic fixture alone.
