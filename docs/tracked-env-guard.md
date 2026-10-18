# Tracked environment file guard

Report 3, MX-12b, asks CI to reject tracked runtime `.env` files. `check:env-files` checks Git's index and fails on `.env` and `.env.*` names at any depth, including case variants. Placeholder examples such as `.env.example` and `.env.staging.example` are allowed. Ignored local files are not read, and diagnostics print filenames only.

Frontend CI runs the guard and its isolated Git-index fixtures before installing dependencies. Run them locally with:

```sh
pnpm check:env-files
pnpm test:env-files
```

The fixtures prove that a tracked runtime env fails even when empty and that an ignored local env does not expose its contents. No dependency was added.

This is a regression guard, not a secret-history scanner. Historical variable classification, scanning, and rotation/revocation of any actual secret found still need separate evidence before MX-12b can be accepted in full.
