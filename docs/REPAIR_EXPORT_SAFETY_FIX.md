# Repair export boundary (F-05 / MX-10)

The existing browser formatter compacted whitespace but did not sanitize the final handoff. Synthetic authorization, password, cookie and custom-header values could survive in every target format. This establishes a missing boundary, not an observed production leak.

The formatter now sanitizes every supplied text field and validates the finished Markdown. It removes credential values, JSON header payloads, private keys, bearer/basic tokens, JWTs, URL userinfo/query/fragment data and signed artifact URLs. Ordinary routes, HTTP status evidence and non-sensitive findings remain usable. An incomplete private key, nested header payload, unsupported local/script URL or oversized field withholds the export. The reports screen displays the withholding reason and disables copy/download; the download callback also enforces the guard.

Compared before coding with the unchanged master blueprint (SHA-256 `59F134A6AE9DA929497470C481078421E3160CF254C567DBB77D09A1EC053CF7`), sections 8.7 and 29.4, and task report 2 section 10.3 / task report 3 MX-10. This is the remaining frontend boundary, alongside the team's separate persisted backend repair builder. Configured secret-pattern redaction in the backend remains necessary: arbitrary unlabeled plaintext cannot be recognized as a secret by a browser formatter. The current export does not embed image bytes.

Validation: six existing export cases, 36 cross-format synthetic-secret cases, four withholding cases and four boundary checks pass. Installed-dependency TypeScript validation and the client/SSR production build pass. Existing CI runs the extended regression script.
