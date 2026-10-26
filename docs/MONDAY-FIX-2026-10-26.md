# Monday acquisition repair — 26 October 2026

The 09:30 and 10:15 connected tasks saw a new BlueBell menu for 26–30 October but stopped because no current snapshot existed. No scheduled GitHub collection had started before those attempts. Cache absence was incorrectly treated as the end of the acquisition path.

`automation/refresh-snapshot.mjs` now provides the explicit fallback: reuse a complete same-day snapshot; otherwise wait for an active stable-snapshot build or rerun its completed collection job once. It scopes run discovery to the correct workflow, rejects obsolete collector code, waits for the new attempt, and requires a complete same-day published snapshot. It never sends email. The four existing delivery tasks call this before their source fallback. Their schedules, strict content gate, recipient, and Sent checks stay in place.

A live diagnostic rerun also exposed an infrastructure failure: `ubuntu-latest` selected Ubuntu 26.04, unsupported by pinned Playwright 1.55.0. The stable, BlueBell and autonomous collection workflows now pin Ubuntu 24.04.

The 23 October diagnostic identified a separate parser defect: Cool Bowling joined `rukolou/B,7/` without whitespace. The parser now accepts this delimiter placement while still requiring the recognized allergen block, one price, and the full dish text. Regression cases reject missing/extra prices and unknown allergen text.

The legacy connected bridge's template pin now matches the approved template, with a regression check to detect future drift. The template itself is unchanged.

Validation: `npm test` covers acquisition on a missing Monday cache, reuse of a current snapshot, waiting for an active collection, obsolete/failed/incomplete collectors, attached allergens, fixed-template integrity, source freshness and delivery deduplication. Push-triggered collection remains a dry run and never sends a test email.
