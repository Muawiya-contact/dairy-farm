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
- A trigger protects the newborn's mother, birth/arrival dates, and source once linked, while allowing its temporary tag to be replaced. Other linked calving facts are protected. Production RLS permits the owner only; staging retains its shared demo policy. The previous `record_calving` RPC remains for older deployed site versions during rollout.
- `FarmBreeding` uses the same Supabase farm query as animal details. The register's next due task is derived from saved dates/status and the current farm date. It does not mutate a record or automatically diagnose pregnancy.
- `AnimalBreeding` validates the form before RPC, shows field and database errors in Roman Urdu, and displays separate calf links. Full exports include optional fields and offspring rows. Blank optional numeric fields stay blank; a weight must be positive and at most 999.99 kg with two decimals.

## Acceptance and limits

- Tests cover one calf, mixed twins, temporary and later edited tags, idempotent retry, rollback on invalid weight/duplicate tag, direct-write protection, legacy RPC, form boundaries, and due task selection. Run the full Vitest suite, ESLint, TypeScript, and static build before opening the PR.
- Migrations must be recorded on both staging and production, with no demo data copied to production. Check the staging preview at phone and laptop widths, including empty and error states. A real farm owner should verify the wording and entry sequence before entering live data.
- The app supports one or two offspring per calving. For an unusual higher-order birth or correction of a completed calving, preserve the existing history and handle it through a separately designed audited correction workflow. No automatic reminders, semen inventory, veterinary advice, or spreadsheet import are included in this step.

The project-wide [definition of done](../DOCUMENTATION.md#definition-of-done-for-every-step) applies to each later step as well: research the real workflow, preserve data integrity, handle errors and edge cases, test relevant behavior, and report what was and was not verified before a PR.

## Validation on 2026-10-15

- `npm test -- --maxWorkers=2`: 101 tests across 25 files passed, including database rollback, idempotency, owner-only anonymous denial, and the prior animal lifecycle regression.
- `npm run lint`: passed with one pre-existing font warning in `src/app/layout.tsx`; `npx tsc --noEmit` and `npm run build`: passed.
- Supabase CLI applied migration 31 to staging and production. A staging publishable-key smoke check read the empty offspring table and reached the new RPC's `BREEDING_NOT_OPEN` validation for a nonexistent service; it wrote no data.
- The local browser showed the register at laptop and phone widths, empty filter, one/two calf fields, and conditional stillborn fields. CSV, Excel, and PDF exports downloaded; the XLSX archive and PDF text were checked. A completed calving save through the hosted preview and a real-phone check remain to verify with disposable test data after deployment.
