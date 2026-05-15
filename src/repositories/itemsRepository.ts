import Database from "better-sqlite3";

export const allowedCategories = [
  "maintenance",
  "chore",
  "reminder",
  "note",
  "family",
  "status",
] as const;

export const allowedPriorities = ["low", "normal", "high"] as const;
export const allowedStatuses = ["pending", "active", "done"] as const;

export type ItemCategory = (typeof allowedCategories)[number];
export type ItemPriority = (typeof allowedPriorities)[number];
export type ItemStatus = (typeof allowedStatuses)[number];

export type ItemRecord = {
  id: number;
  title: string;
  category: ItemCategory;
  due_date: string | null;
  status: ItemStatus;
  priority: ItemPriority;
  notes: string;
  source: string;
  is_recurring: 0 | 1;
  recurrence_frequency: "daily" | "weekly" | "biweekly" | "monthly" | null;
  recurrence_interval: number;
  recurrence_days_of_week: string | null;
  recurrence_day_of_month: number | null;
  created_at: string;
  updated_at: string;
};

type RecurrenceInput = {
  frequency: "daily" | "weekly" | "biweekly" | "monthly";
  interval?: number;
  daysOfWeek?: number[];
  dayOfMonth?: number;
};

export type CreateItemInput = {
  title: string;
  category: ItemCategory;
  dueDate?: string;
  status?: ItemStatus;
  priority?: ItemPriority;
  notes?: string;
  source?: string;
  recurrence?: RecurrenceInput;
};

export class ItemsRepository {
  private readonly listStatement;
  private readonly createStatement;
  private readonly createAuditStatement;
  private readonly getByIdStatement;
  private readonly listRecurringStatement;
  private readonly updateDueDateStatement;
  private readonly updateStatusStatement;
  private readonly deleteByIdStatement;
  private readonly deleteDoneStatement;

  constructor(private readonly database: Database.Database) {
    this.listStatement = database.prepare<
      [ItemCategory | null, ItemCategory | null, ItemCategory | null],
      ItemRecord
    >(`
      SELECT
        id,
        title,
        CASE WHEN category = 'filter' THEN 'maintenance' ELSE category END AS category,
        due_date,
        status,
        priority,
        notes,
        source,
        is_recurring,
        recurrence_frequency,
        recurrence_interval,
        recurrence_days_of_week,
        recurrence_day_of_month,
        created_at,
        updated_at
      FROM items
      WHERE (
        ? IS NULL
        OR category = ?
        OR (? = 'maintenance' AND category = 'filter')
      )
      ORDER BY
        CASE priority
          WHEN 'high' THEN 0
          WHEN 'normal' THEN 1
          ELSE 2
        END,
        COALESCE(due_date, '9999-12-31T23:59:59.999Z') ASC,
        created_at DESC
    `);

    this.createStatement = database.prepare(`
      INSERT INTO items (
        title,
        category,
        due_date,
        status,
        priority,
        notes,
        source,
        is_recurring,
        recurrence_frequency,
        recurrence_interval,
        recurrence_days_of_week,
        recurrence_day_of_month,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.getByIdStatement = database.prepare<[number], ItemRecord>(`
      SELECT
        id,
        title,
        CASE WHEN category = 'filter' THEN 'maintenance' ELSE category END AS category,
        due_date,
        status,
        priority,
        notes,
        source,
        is_recurring,
        recurrence_frequency,
        recurrence_interval,
        recurrence_days_of_week,
        recurrence_day_of_month,
        created_at,
        updated_at
      FROM items
      WHERE id = ?
    `);

    this.listRecurringStatement = database.prepare<[], ItemRecord>(`
      SELECT
        id,
        title,
        CASE WHEN category = 'filter' THEN 'maintenance' ELSE category END AS category,
        due_date,
        status,
        priority,
        notes,
        source,
        is_recurring,
        recurrence_frequency,
        recurrence_interval,
        recurrence_days_of_week,
        recurrence_day_of_month,
        created_at,
        updated_at
      FROM items
      WHERE is_recurring = 1
        AND recurrence_frequency IS NOT NULL
        AND due_date IS NOT NULL
        AND status != 'done'
    `);

    this.updateDueDateStatement = database.prepare(
      "UPDATE items SET due_date = ?, updated_at = ? WHERE id = ?",
    );

    this.updateStatusStatement = database.prepare(
      "UPDATE items SET status = ?, updated_at = ? WHERE id = ?",
    );

    this.deleteByIdStatement = database.prepare("DELETE FROM items WHERE id = ?");

    this.deleteDoneStatement = database.prepare(
      "DELETE FROM items WHERE status = 'done'",
    );

    this.createAuditStatement = database.prepare(`
      INSERT INTO audit_log (
        actor,
        action,
        entity_type,
        entity_id,
        payload,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);
  }

  list(category?: ItemCategory): ItemRecord[] {
    this.rollForwardRecurringItems();
    const categoryFilter = category ?? null;
    return this.listStatement.all(categoryFilter, categoryFilter, categoryFilter);
  }

  create(input: CreateItemInput, actor = "system"): ItemRecord {
    const now = new Date().toISOString();
    const recurrenceInterval = Math.max(1, input.recurrence?.interval ?? 1);
    const recurrenceDayOfMonth =
      input.recurrence?.frequency === "monthly"
        ? Math.min(
            31,
            Math.max(
              1,
              input.recurrence.dayOfMonth ??
                (input.dueDate ? new Date(input.dueDate).getDate() : 1),
            ),
          )
        : null;
    const recurrenceDays = input.recurrence?.daysOfWeek?.length
      ? input.recurrence.daysOfWeek.map((value) => Number(value)).join(",")
      : null;

    const createItem = this.database.transaction(() => {
      const result = this.createStatement.run(
        input.title,
        input.category,
        input.dueDate ?? null,
        input.status ?? "pending",
        input.priority ?? "normal",
        input.notes ?? "",
        input.source ?? "manual",
        input.recurrence ? 1 : 0,
        input.recurrence?.frequency ?? null,
        recurrenceInterval,
        recurrenceDays,
        recurrenceDayOfMonth,
        now,
        now,
      );

      const itemId = Number(result.lastInsertRowid);

      this.createAuditStatement.run(
        actor,
        "create",
        "item",
        String(itemId),
        JSON.stringify(input),
        now,
      );

      return this.getByIdStatement.get(itemId);
    });

    const createdItem = createItem();
    if (!createdItem) {
      throw new Error("Failed to load item after creation");
    }

    return createdItem;
  }

  updateStatus(id: number, status: ItemStatus, actor = "system"): ItemRecord | undefined {
    const now = new Date().toISOString();
    const transaction = this.database.transaction(() => {
      const result = this.updateStatusStatement.run(status, now, id);
      if (result.changes === 0) {
        return undefined;
      }

      this.createAuditStatement.run(
        actor,
        "update_status",
        "item",
        String(id),
        JSON.stringify({ status }),
        now,
      );

      return this.getByIdStatement.get(id);
    });

    return transaction();
  }

  deleteById(id: number, actor = "system"): boolean {
    const now = new Date().toISOString();
    const transaction = this.database.transaction(() => {
      const existing = this.getByIdStatement.get(id);
      if (!existing) {
        return false;
      }

      const result = this.deleteByIdStatement.run(id);
      if (result.changes === 0) {
        return false;
      }

      this.createAuditStatement.run(
        actor,
        "delete",
        "item",
        String(id),
        JSON.stringify(existing),
        now,
      );

      return true;
    });

    return transaction();
  }

  deleteDone(actor = "system"): number {
    const now = new Date().toISOString();
    const transaction = this.database.transaction(() => {
      const result = this.deleteDoneStatement.run();
      const deleted = Number(result.changes);

      this.createAuditStatement.run(
        actor,
        "delete_done",
        "item",
        "batch",
        JSON.stringify({ deleted }),
        now,
      );

      return deleted;
    });

    return transaction();
  }

  private rollForwardRecurringItems() {
    const rows = this.listRecurringStatement.all();
    if (rows.length === 0) {
      return;
    }

    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    const transaction = this.database.transaction(() => {
      for (const row of rows) {
        const dueDate = row.due_date ? new Date(row.due_date) : null;
        if (!dueDate || Number.isNaN(dueDate.getTime()) || dueDate >= startOfToday) {
          continue;
        }

        let nextDueDate = new Date(dueDate);
        const frequency = row.recurrence_frequency;
        const interval = Math.max(1, row.recurrence_interval || 1);
        const dayValues = (row.recurrence_days_of_week ?? "")
          .split(",")
          .map((value) => Number(value))
          .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6)
          .sort((left, right) => left - right);

        let safetyCounter = 0;
        while (nextDueDate < startOfToday && safetyCounter < 366) {
          if (frequency === "daily") {
            nextDueDate.setDate(nextDueDate.getDate() + interval);
          } else if (frequency === "weekly" || frequency === "biweekly") {
            const weekMultiplier = frequency === "biweekly" ? 2 : 1;
            if (dayValues.length === 0) {
              nextDueDate.setDate(
                nextDueDate.getDate() + 7 * interval * weekMultiplier,
              );
            } else {
              const currentDay = nextDueDate.getDay();
              const nextDayInWeek = dayValues.find((day) => day > currentDay);
              if (typeof nextDayInWeek === "number") {
                nextDueDate.setDate(nextDueDate.getDate() + (nextDayInWeek - currentDay));
              } else {
                const firstDay = dayValues[0];
                nextDueDate.setDate(
                  nextDueDate.getDate() +
                    (7 - currentDay + firstDay) +
                    (interval * weekMultiplier - 1) * 7,
                );
              }
            }
          } else if (frequency === "monthly") {
            const dayOfMonth = Math.min(
              31,
              Math.max(1, row.recurrence_day_of_month ?? nextDueDate.getDate()),
            );

            const year = nextDueDate.getFullYear();
            const month = nextDueDate.getMonth() + interval;
            const targetMonthDate = new Date(year, month, 1);
            const daysInMonth = new Date(
              targetMonthDate.getFullYear(),
              targetMonthDate.getMonth() + 1,
              0,
            ).getDate();
            const clampedDay = Math.min(dayOfMonth, daysInMonth);

            nextDueDate = new Date(nextDueDate);
            nextDueDate.setFullYear(targetMonthDate.getFullYear());
            nextDueDate.setMonth(targetMonthDate.getMonth(), clampedDay);
          } else {
            break;
          }

          safetyCounter += 1;
        }

        if (nextDueDate > dueDate) {
          this.updateDueDateStatement.run(
            nextDueDate.toISOString(),
            new Date().toISOString(),
            row.id,
          );
        }
      }
    });

    transaction();
  }
}
