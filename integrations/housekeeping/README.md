# Housekeeping integration

Housekeeping now runs inside the main backend and frontend. Use the root README. The backend app/server/migration entry points here delegate to the canonical backend; do not run a second copy on a different database. Legacy HTTP connector helpers are retained only for reference and their isolated unit tests, and are not imported by the application. HOSIS_API_BASE_URL and HOSIS_INTEGRATION_TOKEN are no longer used.

On the main HOSIS sign-in screen, choose **Housekeeping**. Housekeeping staff and administrators land on `/#/housekeeping/overview`. Front Office accounts land on the read-only Room Status page at `/#/housekeeping/rooms`. The **Open Housekeeping** shortcut in the Administrator console also opens the integrated dashboard.

Keep `HOSIS-Housekeeping/hosis-housekeeping` next to the main `HOSIS` repository. The main frontend loads the sibling project's Housekeeping module directly and passes the signed-in session. The module uses the main HOSIS API and database.
