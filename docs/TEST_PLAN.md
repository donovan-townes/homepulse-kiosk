# Test Plan

This project should be built as an appliance with explicit behavioral expectations. Tests are not just for correctness; they protect the operational model.

## Current Coverage

The scaffold already tests:

- `/health` reports a healthy app state
- `POST /api/items` creates a household item
- `GET /api/items` returns persisted items
- invalid payloads are rejected

## Required Test Layers

## Unit Tests

Focus on pure rules and cheap edge cases.

- category, status, and priority validation
- item ordering rules for display
- date formatting helpers if they move into shared code
- environment/config parsing

## Integration Tests

Focus on app plus SQLite working together.

- bootstrapping a fresh database creates required tables
- creating an item writes an audit log entry
- category filtering returns the right items
- database path override works correctly
- `/version` returns the configured application version

## Operational Tests

These can begin as manual checks and later become scripts.

- the app starts cleanly on an empty data directory
- the app restarts without data loss
- a database backup can be restored and still boot
- the kiosk waits for `/health` before launching the browser
- the update script fails fast on bad deploys

## Acceptance Tests For Phase 1

These are the behaviors the first appliance MVP must satisfy.

1. The display page loads without internet access.
2. An admin can create a reminder without editing code.
3. A newly created reminder appears on the kiosk display.
4. A maintenance item with high priority surfaces ahead of lower-priority items.
5. The app survives reboot and returns to the kiosk screen automatically.
6. The app survives a process crash through systemd restart.
7. The live database is not overwritten during a code update.

## Immediate Next Test Additions

1. Add a repository-level test for audit log creation.
2. Add an integration test for category filtering.
3. Add an integration test that verifies database bootstrap on a new path.
4. Add a shell-level check for `scripts/update-kiosk.sh`.
5. Add a manual acceptance checklist for the Wyse 3040 bring-up.