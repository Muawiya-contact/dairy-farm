# Step 2: Janwar ki zindagi ka record

This focused Step 2 update records when each animal joined or left the farm and displays its dated history. It does not import animal spreadsheets or create a general edit log; those remain separate work.

## Owner workflow

1. Add a tag, species, sex, and the date the animal arrived. Choose purchased, born here, gift, transfer, or other. For an animal born here, enter its birth date; that is also its arrival date. For other animals, birth date is optional.
2. If the birth date is unknown, optionally enter the estimated years and months **at arrival**. The app stores that estimate separately from a real birth date and labels the displayed age `Taqreeban`. If neither is known, age says `Darj nahi`. Age grows from the dates as time passes and stops growing when the animal leaves.
3. On the animal page, see arrival, current or final age, health, breeding, calving, milk entries, and exit in date order. Add a dated treatment, check-up, vaccine, or deworming entry. Record symptoms, a vet/owner-entered diagnosis, condition, medicine/product, dose, route, treatment dates, veterinarian, follow-up date, and notes when known. These are saved records only; the app does not recommend a diagnosis or dose.
4. Attach a prescription or report to its health event as a PDF, JPEG, or PNG up to 10 MB. Files stay in private storage and are opened through a short-lived signed link. Filter the animal's history to vaccinations or deworming, see recorded health costs, and include the details and attachment names in the animal dossier export.
5. Record sale, death, or another departure with a date. A sale requires a positive price and receiving account; it creates one `other_income` entry. Death and other departures create no money entry. Another departure requires a reason. After departure, the animal leaves the active and milk-entry lists but remains in historical records and exports.

## Data rules

- Migration `20261015000029_animal_lifecycle.sql` adds `arrival_date` and `estimated_age_months_at_arrival`, expands source and exit statuses, and checks date order and age range. It backfills historical arrival only when an existing birth or purchase date supplies evidence. Unknown historical dates remain null; no date is invented.
- Migration `20261015000030_guard_animal_sale_ledger.sql` requires the `close_animal` transaction for every departure. It prevents later changes to exit fields or the linked sale-income row, and rejects inactive or not-yet-open sale accounts. Ordinary non-sale income remains editable.
- New animals require an arrival date, cannot have a future birth/arrival/purchase date, and cannot have both an exact birth date and an age estimate. Farm-born animals require birth and arrival on the same day. UI and database validate these rules.
- Existing activity blocks moving birth or arrival after that activity. New milk, health, breeding, and calving entries must fall within the recorded farm stay. Exit cannot precede recorded activity or arrival. Existing month locks and owner-only production RLS still apply.
- Animal CSV/Excel/JSON exports include arrival and estimated age at arrival. This avoids exporting a changing computed age as a stored fact.
- Migration `20261121000008_health_veterinary_history.sql` adds optional veterinary details and treatment dates while preserving existing health rows with unknown fields unset. `record_detailed_health_event` writes the health event and, when the recorded cost is positive, its one linked farm expense in a single transaction. The previous `record_health_event` RPC remains as a compatibility wrapper.
- Migration `20261121000008_health_veterinary_history.sql` also creates `health_event_attachments` and the private `health-records` bucket. Attachment paths must belong to their health event; metadata, storage reads, uploads, and deletes are restricted to the designated owner even where farm editors can access other data. Migration `20261121000009_health_attachment_demo_owner_guard.sql` preserves anonymous access only for synthetic data when staging demo access is explicitly enabled. Signed URLs expire after 15 minutes and can be renewed from the history.

## Verification and remaining work

Run `npm run check`, including health-event and attachment policy tests. Check a staging animal at phone and desktop widths: add a detailed vaccination, attach a test PDF, confirm the private link opens, filter vaccination and deworming history, and check the dossier export. Also verify the existing arrival/age/timeline and exit flows. Confirm a sale changes the chosen account exactly once; a death or other departure does not. Check an old animal with no arrival date and the error shown when a historical event precedes arrival. Use only synthetic demo records in staging; do not add real farm records.

Spreadsheet import, a general audit trail of profile corrections, and a complete production launch review remain separate follow-ups.
