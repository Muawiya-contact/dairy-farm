# Step 2: Janwar ki zindagi ka record

This focused Step 2 update records when each animal joined or left the farm and displays its dated history. It does not import animal spreadsheets or create a general edit log; those remain separate work.

## Owner workflow

1. Add a tag, species, sex, and the date the animal arrived. Choose purchased, born here, gift, transfer, or other. For an animal born here, enter its birth date; that is also its arrival date. For other animals, birth date is optional.
2. If the birth date is unknown, optionally enter the estimated years and months **at arrival**. The app stores that estimate separately from a real birth date and labels the displayed age `Taqreeban`. If neither is known, age says `Darj nahi`. Age grows from the dates as time passes and stops growing when the animal leaves.
3. On the animal page, see arrival, current or final age, health, breeding, calving, milk entries, and exit in date order. Correct the profile or add a dated health entry as needed.
4. Record sale, death, or another departure with a date. A sale requires a positive price and receiving account; it creates one `other_income` entry. Death and other departures create no money entry. Another departure requires a reason. After departure, the animal leaves the active and milk-entry lists but remains in historical records and exports.

## Data rules

- Migration `20261015000029_animal_lifecycle.sql` adds `arrival_date` and `estimated_age_months_at_arrival`, expands source and exit statuses, and checks date order and age range. It backfills historical arrival only when an existing birth or purchase date supplies evidence. Unknown historical dates remain null; no date is invented.
- New animals require an arrival date, cannot have a future birth/arrival/purchase date, and cannot have both an exact birth date and an age estimate. Farm-born animals require birth and arrival on the same day. UI and database validate these rules.
- Existing activity blocks moving birth or arrival after that activity. New milk, health, breeding, and calving entries must fall within the recorded farm stay. Exit cannot precede recorded activity or arrival. Existing month locks and owner-only production RLS still apply.
- Animal CSV/Excel/JSON exports include arrival and estimated age at arrival. This avoids exporting a changing computed age as a stored fact.

## Verification and remaining work

Run `npm run check`, including age/parser unit tests and PostgreSQL migration/trigger tests. Check a staging animal at phone and desktop widths: add with exact birth date, add with estimated age, inspect the timeline, and close it for each exit type. Confirm a sale changes the chosen account exactly once; a death or other departure does not. Check an old animal with no arrival date and the error shown when a historical event precedes arrival. Do not add real farm records to staging.

Spreadsheet import, a general audit trail of profile corrections, and a complete production launch review remain separate follow-ups.
