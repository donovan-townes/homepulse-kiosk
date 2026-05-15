# Phase 2 Implementation Cards

This card set is designed to be implemented incrementally with low risk to the stable kiosk path.

Current baseline (already in production):
- SQLite table: `items` + `audit_log`
- API: `GET /api/items`, `POST /api/items`, admin PIN auth
- Dashboard: today schedule + maintenance lane + weather

## Delivery Rules (Safety)

- Keep `GET /api/items` behavior intact until Card 5 is complete.
- Add migrations only forward (no destructive changes).
- Every card must ship with tests and rollback notes.
- Prefer additive schema and endpoints first, then UI switch-over.

---

## Card 1: Recurrence Schema (Additive, No Behavior Change)

Status: Ready
Risk: Low
Goal: Add recurrence and completion primitives without changing existing screens.

### Schema changes (migration version 2)

Add columns to `items`:

```sql
ALTER TABLE items ADD COLUMN task_type TEXT NOT NULL DEFAULT 'one_time';
ALTER TABLE items ADD COLUMN recurrence_rule TEXT;
ALTER TABLE items ADD COLUMN recurrence_interval INTEGER NOT NULL DEFAULT 1;
ALTER TABLE items ADD COLUMN recurrence_days_of_week TEXT;
ALTER TABLE items ADD COLUMN recurrence_day_of_month INTEGER;
ALTER TABLE items ADD COLUMN recurrence_until TEXT;
ALTER TABLE items ADD COLUMN template_item_id INTEGER;
ALTER TABLE items ADD COLUMN completed_at TEXT;
ALTER TABLE items ADD COLUMN completed_by TEXT;
ALTER TABLE items ADD COLUMN completion_note TEXT NOT NULL DEFAULT '';
ALTER TABLE items ADD COLUMN assigned_role TEXT NOT NULL DEFAULT 'any';
ALTER TABLE items ADD COLUMN is_operator_only INTEGER NOT NULL DEFAULT 0;
```

Indexes:

```sql
CREATE INDEX IF NOT EXISTS idx_items_due_date ON items(due_date);
CREATE INDEX IF NOT EXISTS idx_items_status_due_date ON items(status, due_date);
CREATE INDEX IF NOT EXISTS idx_items_task_type ON items(task_type);
CREATE INDEX IF NOT EXISTS idx_items_template_item_id ON items(template_item_id);
```

### Meaning

- `task_type`: `one_time` or `recurring_template` or `occurrence`
- `template_item_id`: points occurrence back to template
- `completed_at/completed_by`: completion tracking
- `assigned_role/is_operator_only`: future operator-aware filtering

### Acceptance criteria

- Existing items still load and render unchanged.
- New columns exist with sensible defaults.
- No API contract change yet.

### Test tasks

- DB migration test from v1 data file.
- Assert legacy `GET /api/items` still returns same records.

---

## Card 2: Recurrence Rule Contract + Admin Create UI Fields

Status: Ready
Risk: Medium
Goal: allow creating recurring templates from admin without changing dashboard behavior.

### API changes

Extend `POST /api/items` request schema (optional fields):

```json
{
  "title": "Trash to the curb",
  "category": "reminder",
  "priority": "normal",
  "taskType": "recurring_template",
  "recurrence": {
    "frequency": "weekly",
    "interval": 1,
    "daysOfWeek": [1],
    "until": null
  },
  "dueDate": "2026-05-18T19:00:00.000Z"
}
```

Rules:
- `taskType=one_time` (default): ignore recurrence fields
- `taskType=recurring_template`: recurrence is required
- `daysOfWeek` values: 0..6 (Sun..Sat)

Storage mapping:
- `task_type`
- `recurrence_rule` JSON string
- `recurrence_interval`
- `recurrence_days_of_week` as comma-separated list
- `recurrence_until`

### UI tasks

Files:
- `public/admin.html`
- `public/admin.js`

Add inputs:
- Task type selector (`One-time`, `Repeating`)
- Frequency selector (`weekly`, `monthly`)
- Weekly day checkboxes
- Optional end date

### Acceptance criteria

- Admin can create one-time items exactly as before.
- Admin can create recurring templates.
- Templates do not pollute current today schedule yet.

### Test tasks

- Contract test for valid recurring payload.
- Validation test for invalid recurrence combinations.

---

## Card 3: Recurrence Expansion Engine (Occurrence Generator)

Status: Ready
Risk: Medium
Goal: generate concrete occurrences for recurring templates so "trash every Monday" behaves correctly.

### Behavior

- For each recurring template, generate next occurrence when:
  - no open future occurrence exists
  - or last occurrence marked done and next date is due
- Generated row:
  - `task_type='occurrence'`
  - `template_item_id` set
  - copies title/category/priority/notes
  - `due_date` set to computed next time

### Implementation location

- New module: `src/application/scheduler/recurrenceEngine.ts`
- Trigger points:
  - app startup
  - before `GET /api/items` response
  - after completion endpoint (Card 6)

### Scheduling algorithm (v1)

Weekly:
1. Parse template base due time (hour/minute)
2. Compute next matching weekday using interval
3. Clamp by `recurrence_until`

Monthly (optional in v1):
- support same day-of-month only

### Acceptance criteria

- Monday trash due at 7pm appears on Monday.
- Once completed, it disappears from next-day today lane.
- New occurrence appears the following week.

### Test tasks

- Unit tests for weekly next-date calculation.
- Integration test: complete one occurrence and verify next generated.

---

## Card 4: Two Query Lanes (Today vs Backlog Maintenance)

Status: Ready
Risk: Low
Goal: cleanly separate urgent daily chores from long-horizon maintenance backlog.

### New API endpoints

1. `GET /api/items/today`
- Returns only due-today, not done, item types: `one_time` + `occurrence`
- Optional categories: chores/reminders/events

2. `GET /api/items/maintenance-upcoming?days=45`
- Returns non-done maintenance/filter items with due date between now and +N days
- Excludes recurring templates from direct display

### Query behavior

Today lane:
- due_date local-day window [00:00, 23:59:59]
- status != done

Maintenance lane:
- category in (`maintenance`, `filter`)
- due_date between now and now+N
- status != done

### UI tasks

File: `public/app.js`
- Replace single `/api/items` fetch for dashboard with two lane fetches.
- Keep current list rendering components.

### Acceptance criteria

- Daily chores remain clear and concise.
- Long-term maintenance backlog no longer crowds today lane.

### Test tasks

- Endpoint contract tests for both lanes.
- Date-window boundary tests (timezone-safe).

---

## Card 5: Completion Workflow (Touch + Optional Phone)

Status: Ready
Risk: Medium
Goal: allow marking tasks done with minimal friction, without requiring keyboard.

### New endpoint

`POST /api/items/:id/complete`

Body:
```json
{
  "completedBy": "kiosk-touch",
  "note": "Optional"
}
```

Server behavior:
- set `status='done'`
- set `completed_at`, `completed_by`, `completion_note`
- audit log action `complete`
- if `task_type='occurrence'`, trigger recurrence engine to create next one

### New optional endpoint

`POST /api/items/:id/uncomplete`

Use for accidental tap correction.

### UI tasks

Dashboard:
- Add large `Done` button on each today card
- Optional confirmation toast with undo

Admin:
- Completion history in list detail (phase 2.1)

### Acceptance criteria

- Touch completion works from kiosk without keyboard.
- Recurring task completion rolls to next occurrence.

### Test tasks

- Complete endpoint test updates row fields correctly.
- Recurrence roll-forward integration test.

---

## Card 6: QR and NFC Completion Bridge

Status: Ready
Risk: Medium
Goal: optional no-keyboard completion via physical interaction.

### Pattern

- Each task gets stable token: `completion_token` (random)
- Completion URL:
  - `/complete/<token>` (GET shows confirm page)
  - `/api/complete/<token>` (POST finalize)

### Schema addition (migration version 3)

```sql
ALTER TABLE items ADD COLUMN completion_token TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_items_completion_token ON items(completion_token);
```

### QR flow

- Show QR icon on task detail/admin page.
- Phone scan opens confirm page, one tap done.

### NFC flow

- NFC tag stores URL with completion token.
- Tap phone -> completion page.
- No app install required.

### Acceptance criteria

- Task can be completed without kiosk keyboard.
- Token flow can be revoked/regenerated from admin.

### Test tasks

- Token uniqueness test.
- Complete-by-token endpoint tests.

---

## Card 7: Operator Availability Model

Status: Ready
Risk: Medium
Goal: represent operator-away windows and adjust recommendations.

### Schema (new table, migration version 4)

```sql
CREATE TABLE IF NOT EXISTS operator_availability (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_operator_availability_window
  ON operator_availability(starts_at, ends_at);
```

### API endpoints

- `GET /api/operator-availability/current`
- `POST /api/operator-availability`
- `DELETE /api/operator-availability/:id`

### UI tasks

- Header badge: `Operator away today` if active window
- Filter helper for today lane:
  - if away, highlight tasks where `is_operator_only=0`

### Acceptance criteria

- Household sees operator-away status clearly.
- Task prompts remain useful during away windows.

---

## Card 8: Quiet Hours + PIR Presence Integration (After Hardware)

Status: Ready
Risk: Medium
Goal: reduce burn-in and power use with realistic appliance policy.

### App policy

- Quiet hours config in env:
  - `HOMEPULSE_QUIET_HOURS_START=00:00`
  - `HOMEPULSE_QUIET_HOURS_END=05:00`
- During quiet hours:
  - app still runs
  - display sleeps via OS policy

### Hardware policy

- Pico PIR sends wake key
- Linux DPMS wakes display on key event

### Acceptance criteria

- Display sleeps automatically overnight.
- PIR wake restores visibility without app restart.

---

## Suggested Incremental Sequence

1. Card 1 (schema additive)
2. Card 2 (admin recurring templates)
3. Card 3 (recurrence engine)
4. Card 4 (two query lanes)
5. Card 5 (touch completion)
6. Card 6 (QR/NFC bridge)
7. Card 7 (operator availability)
8. Card 8 (quiet hours + PIR)

This order keeps current production behavior stable while adding capability in small reversible slices.
