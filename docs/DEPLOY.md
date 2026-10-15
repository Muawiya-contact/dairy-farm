# Staging and production deployment

The Next.js static export is built into `out`. Public Supabase values are frozen into the browser bundle during `npm run build`. This repository contains no site credentials in `netlify.toml`.

| Environment | Netlify site | Git branch | Supabase project | Access |
|---|---|---|---|---|
| Staging demo | Existing `demo-dairy-app` site (optional rename) | `main` and PR previews | `dlirssfoazlxzyamsltv` | Fictional shared demo data |
| Production | Separate site, created for launch | `production` only | `ylipnghdygpyqlptqazx` | Owner and two invited editors; real data |

In **Project configuration → Environment variables**, set these as site-level **Builds** values for all deploy contexts on the existing staging site, before merging the environment-split PR:

```text
NEXT_PUBLIC_SUPABASE_URL=https://dlirssfoazlxzyamsltv.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<staging publishable key>
NEXT_PUBLIC_REQUIRE_AUTH=false
NEXT_PUBLIC_APP_ENV=staging
```

The publishable key is safe for the browser; service-role keys, access tokens and database passwords are not. A build fails if a required value is missing, if its Supabase project does not match `NEXT_PUBLIC_APP_ENV`, or if production does not require sign-in. Staging displays a demo banner on every screen.

For the future **separate production Netlify site**, connect this repository to the `production` branch, disable deploy previews and other branch deploys for that site, and set its site-level Builds variables:

```text
NEXT_PUBLIC_SUPABASE_URL=https://ylipnghdygpyqlptqazx.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<production publishable key>
NEXT_PUBLIC_REQUIRE_AUTH=true
NEXT_PUBLIC_APP_ENV=production
```

In the **production** Supabase project (`ylipnghdygpyqlptqazx`), set **Authentication → URL Configuration → Site URL** to the stable site address `https://dairy-app-prod.netlify.app/` and add that same exact URL to **Redirect URLs**. Use the normal site address, not a deploy-specific Netlify URL such as `https://<deploy-id>--dairy-app-prod.netlify.app/`. Dashboard invitations do not specify a redirect in this app, so Supabase uses the Site URL; leaving its default `http://localhost:3000` sends invited users to their own device's localhost. The app's password-reset request explicitly redirects to the current site's root, which must be on the allowed list. Verify both values before sending a test invitation. Keep production access limited to the named farm users. Production already has versioned migrations and generic defaults as of Step 8; check migration parity for later changes. Never apply `supabase/seed/dev-demo.sql`, `supabase/seed/test-*.sql`, or real client records to the staging demo.

## Three production users

The owner account is the first user. In the **production** SQL Editor, check `select user_id from private.app_owner;`. If it returns no rows, insert the intended owner's **production Auth User UID** before testing their login:

```sql
insert into private.app_owner (singleton, user_id)
values (true, '<owner-user-uid>'::uuid);
```

After migration `20261015000043_farm_editors.sql` is applied to **production**, invite two more people in that project's **Authentication → Users → Add user → Send invitation**. Each person uses their own email and password; they do not need access to the Supabase dashboard. Never send passwords or secret keys to the development team. Release the invite-password screen to the `production` branch before asking a new recipient to click the link. The invitation should then open `https://dairy-app-prod.netlify.app/` and show **Naya password banayein**; the recipient saves a password there, then uses the regular sign-in form next time. If an earlier invitation went to localhost, changing Site URL does not repair that already-issued link. Send a fresh invitation if the user is still unconfirmed; if they are already confirmed, use **Password bhool gaye?** on the released production site to create a password. A user who already has a password can just sign in.

The production sign-in page also has **Password bhool gaye?**. It asks Supabase Auth to email a reset link and redirects back to the same production site's root, where the password form uses `updateUser`. Add that exact root URL to production Auth's allowed redirect URLs, and verify the reset email with one authorized farm account after release. Supabase's default email sender only delivers to addresses belonging to the Supabase organization team and is limited to two emails per hour; configure a custom SMTP provider before expecting invitations or resets to reach other farm users. The form gives the same success response whether an email belongs to a farm account or not.

Copy the two new **User UIDs** from the production Auth user list. In the **production** SQL Editor, add exactly those IDs to the private allowlist:

```sql
insert into private.app_editors (user_id)
values ('<first-user-uid>'::uuid), ('<second-user-uid>'::uuid)
on conflict (user_id) do nothing;

select (select count(*) from private.app_owner) as owners,
       (select count(*) from private.app_editors) as editors;
```

The expected counts are `owners = 1` and `editors = 2`. Use the production site's normal URL for sign-in. All three users can read and edit the same production records; this is not a per-user workspace. A production Auth user who is not on the allowlist cannot access farm rows. To remove an editor's farm access, delete their UID from `private.app_editors`; deleting their Auth account also removes its allowlist row. Keep production self-signup disabled after invitations are set up so access stays invitation based. The staging demo has no editor entries and remains separate.

Release sequence: test a PR preview on staging; merge to `main` after owner review; update `production` from `main` only when the owner chooses to release; verify production build, owner login, read/write flow, reports and logs. No Git merge or production cutover happens automatically through this document. The owner handles periodic backups separately.
