# Lunch collection and freshness repair — 20 October 2026

The 19 October stable snapshot run `39239434049` failed on Tahiti and BlueBell. The separate BlueBell job reported success despite writing `validation-error.json` and replacing the previous output directory.

Confirmed defects and corrections:

- Tahiti's current 19–23 October menu includes a priced drink promotion after Menu 5. The parser counted that as a second meal price and rejected the menu. Recognized promotional lines are now preserved as notes. The official wrapper's menu iframe is followed directly.
- Stará Sýpka's 20 October PDF includes a Birel promotion between food blocks. It is now preserved as a note instead of being joined to the next food item. Collection starts at the current homepage's daily PDF link. The legacy restaurant/print page is not authoritative over that dated PDF.
- Weekly OCR, Tahiti originals, and complete Cool Bowling timetables were incorrectly subject to a same-day capture requirement. Validation now uses the printed validity interval and selected day; acquisition timestamps are kept unchanged. Daily-only sources and final daily email snapshots still require the correct date.
- Validated individual sources are now retained even if a different restaurant blocks the whole email. The collector can reuse the week's original sources from `results/source-cache/` and `results/stable-menu/`.
- A failed BlueBell refresh now fails its job and publishes diagnostics without deleting a previously validated original. Expired originals remain ineligible. Conflicting current evidence remains a blocker.

The email template, recipient, discounts, daily thought, duplicate protection, and all-restaurants gate are unchanged. No test email is sent by push-triggered validation.

Regression fixtures include the actual Tahiti HTML text and Stará Sýpka PDF text retrieved on 20 October. Tests cover promotions, weekday reuse, next-week expiration, rejection of daily-only stale captures, partial collection persistence, and failed BlueBell refresh preservation.

Operational limitation: an accessible, dated BlueBell original for the current week is still required. Facebook login walls or an undated online menu are acquisition/evidence failures, not proof that the restaurant has not updated its menu. Inspect `results/source-cache/YYYY-MM-DD/diagnostics.json` and `results/bluebell-hires/validation-error.json` when the daily snapshot is absent.
