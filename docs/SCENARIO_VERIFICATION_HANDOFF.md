# Server verification handoff (F-09 / MX-05)

The catalog now retains the completed dry-run job ID and sends it when saving. The handoff refuses a passed result without its job ID, after steps have changed, or after the selected environment has changed. The backend companion requires a passed, scoped server job for the submitted steps; the browser flag remains only a request to mark verified.

Compared with master blueprint sections 8.2/8.4 and task report 2 §4.3 / task report 3 MX-05 before coding. Merge with the backend server-verification-proof change, whose DTO accepts the job ID. Older browser clients remain supported by the backend's exact-step/scoped-job lookup. This does not implement configurable variables or variations.

The dedicated handoff regressions run in Frontend CI. Existing catalog edit handlers clear the displayed verification state; the payload guard also catches stale in-flight verification responses.
