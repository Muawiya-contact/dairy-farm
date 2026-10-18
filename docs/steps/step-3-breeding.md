# Step 3: Nasl kashi and calving

## Owner workflow

1. Open **Janwar → Nasl kashi register** to see due or late work across the farm. Search by tag, animal name, semen name, or batch. Use the animal link to enter the actual result. A due date is a reminder, not a pregnancy diagnosis.
2. On an active female animal, record service date, semen type, optional semen/bull name, batch or bull ID, technician, and notes. The database fixes expected ultrasound, checkup, dry, and calving dates using the Settings offsets in effect for that service. Edits to the service date recalculate them.
3. Enter actual ultrasound and checkup dates/results, dry date, or abortion date when known. Close an unsuccessful service before starting another. Only one pending or pregnant service can be open for an animal.
4. Record calving with one or two separate offspring. For each calf, record alive or stillborn, sex (required for a live calf), and optional tag, name, birth weight, and note. Optional calving ease is a simple 1–5 owner observation; it is not veterinary advice.
5. A live calf is added to the herd with the mother, species, and birth/arrival date linked. If no tag exists, the app creates a `TEMP-...` tag, which the owner can change on the calf's animal page. A stillborn calf is recorded in the calving history without adding an active animal. The calves can have different outcomes, including twins.
6. Export the full breeding register as CSV, Excel, or PDF. The Settings backup also includes raw calvings and individual offspring.

The client semen sheet supplied the service, semen, ultrasound/check, dry, expected birth, and actual birth columns. The additional optional batch ID, birth weight, ease, and individual offspring notes help with traceability without slowing routine entry. [Penn State's dairy reproduction guidance](https://extension.psu.edu/animals-and-livestock/dairy/reproduction-and-genetics) supports keeping dated reproductive records and monitoring due animals; [University of Minnesota's calving traits guidance](https://extension.umn.edu/dairy-milking-cows/calving-traits) covers birth weight, stillbirth, and calving ease as useful recorded traits. The app does not infer an animal's medical condition from a date.

## Technical design

- Migration `20261015000031_breeding_register_offspring.sql` adds optional semen batch and calving ease, plus `calving_offspring` with one row per calf. Historical calvings are preserved; previously linked calves are backfilled. Legacy summary-only calvings are displayed as summaries and are never invented as new animals.
- `record_calving_with_offspring` writes the calving, calf animals, offspring, and service status in one PostgreSQL transaction. It rejects invalid dates, sex, weight, duplicate active tags, closed services, or an inactive mother. A request UUID and payload hash make an uncertain retry safe; the same request returns the existing calving, while changed details require a page reload.
- Triggers in migrations 31 and 32 protect the newborn's mother, birth/arrival dates, source, sex, and species once linked, while allowing its temporary tag to be replaced. The edit form hides those locked fields. Other linked calving facts are protected. Production RLS permits the owner only; staging retains its shared demo policy. The previous `record_calving` RPC remains for older deployed site versions during rollout.
- `FarmBreeding` uses the same Supabase farm query as animal details. The register's next due task is derived from saved dates/status and the current farm date. It does not mutate a record or automatically diagnose pregnancy.
- `AnimalBreeding` validates the form before RPC, shows field and database errors in Roman Urdu, and displays separate calf links. Full exports include optional fields and offspring rows. Blank optional numeric fields stay blank; a weight must be positive and at most 999.99 kg with two decimals.

## Acceptance and limits

- Tests cover one calf, mixed twins, temporary and later edited tags, idempotent retry, rollback on invalid weight/duplicate tag, direct-write protection, legacy RPC, form boundaries, and due task selection. Run the full Vitest suite, ESLint, TypeScript, and static build before opening the PR.
- Migrations must be recorded on both staging and production, with no demo data copied to production. Check the staging preview at phone and laptop widths, including empty and error states. A real farm owner should verify the wording and entry sequence before entering live data.
- The app supports one or two offspring per calving. For an unusual higher-order birth or correction of a completed calving, preserve the existing history and handle it through a separately designed audited correction workflow. No automatic reminders, semen inventory, veterinary advice, or spreadsheet import are included in this step.

The project-wide [definition of done](../DOCUMENTATION.md#definition-of-done-for-every-step) applies to each later step as well: research the real workflow, preserve data integrity, handle errors and edge cases, test relevant behavior, and report what was and was not verified before a PR.

## Validation on 2026-10-15

- `npm test -- --maxWorkers=2`: 102 tests across 25 files passed, including database rollback, idempotency, owner-only anonymous denial, and the prior animal lifecycle regression.
- `npm run lint`: passed with one pre-existing font warning in `src/app/layout.tsx`; `npx tsc --noEmit` and `npm run build`: passed.
- Supabase CLI applied migrations 31 and 32 to staging and production. A staging publishable-key smoke check read the empty offspring table and reached the new RPC's `BREEDING_NOT_OPEN` validation for a nonexistent service; it wrote no data.
- The local browser showed the register at laptop and phone widths, empty filter, one/two calf fields, and conditional stillborn fields. CSV, Excel, and PDF exports downloaded; the XLSX archive and PDF text were checked. The hosted PR #17 preview saved a fictional staging mother, service, mixed-outcome twins, and one linked live calf; its temporary tag was replaced successfully. These clearly labeled QA records remain in staging. A real-phone check remains unverified.
- Code review removed overdue tasks for animals that have left the farm while preserving their history in the full register. The export now shows the calf's current tag and birth tag when different, plus sex, weight, and calf notes.
# Breeding dates and in-app reminders (2026-10-18)

The confirmed farm formula for **new** inseminations is ultrasound = AI + 35 days; checkup = the expected or actual ultrasound date + 75 days; dry-off = AI + 210 days; calving = AI + 270 days. Settings changes affect new records only. When an existing AI date or actual ultrasound date changes, that record keeps its own frozen gaps. Migration `20261018000003_breeding_due_dates.sql` corrects open pending/pregnant records, including their checkup dates, while leaving closed history untouched and preserving a custom ultrasound-days setting.

The cow profile shows a current-cycle summary above the full history. After a cycle is marked **Khali**, the owner can open a new AI form with today's date; the app never creates that new cycle automatically.

Settings → **Nasl ke din** controls ordinary reminders 1–30 days before due (default 7) and calving reminders 1–60 days before due (default 30). Migration `20261018000004_herd_reminder_windows.sql` gives each visible task a countdown and severity. Overdue tasks remain visible until completed. The bell on every page lists all tasks, sorted by urgency, and links to the animal. A banner appears when a task is late, due today or soon. **Theek hai** dismisses the current alert IDs for that Pakistan day on this device; a new task or next day brings it back. Browser storage failure leaves reminders visible. These are in-app notices only.

Apply both migrations to staging before a preview. Check an ultrasound due two days ahead, dismiss/reload the banner, mark its result **Khali**, and confirm the new AI form button. PGlite tests cover due-date arithmetic, old-record backfill, reminder windows and completed tasks; component tests cover banner persistence and ordering. Playwright runs the end-to-end flow in CI against disposable local Supabase. Production remains untouched until the owner applies these migrations after review.
