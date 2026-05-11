import Database from "better-sqlite3";

export const allowedCategories = [
  "filter",
  "maintenance",
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
  created_at: string;
  updated_at: string;
};

export type CreateItemInput = {
  title: string;
  category: ItemCategory;
  dueDate?: string;
  status?: ItemStatus;
  priority?: ItemPriority;
  notes?: string;
  source?: string;
};

export class ItemsRepository {
  private readonly listStatement;
  private readonly createStatement;
  private readonly createAuditStatement;
  private readonly getByIdStatement;

  constructor(private readonly database: Database.Database) {
    this.listStatement = database.prepare<
      [ItemCategory | null, ItemCategory | null],
      ItemRecord
    >(`
      SELECT
        id,
        title,
        category,
        due_date,
        status,
        priority,
        notes,
        source,
        created_at,
        updated_at
      FROM items
      WHERE (? IS NULL OR category = ?)
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
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.getByIdStatement = database.prepare<[number], ItemRecord>(`
      SELECT
        id,
        title,
        category,
        due_date,
        status,
        priority,
        notes,
        source,
        created_at,
        updated_at
      FROM items
      WHERE id = ?
    `);

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
    const categoryFilter = category ?? null;
    return this.listStatement.all(categoryFilter, categoryFilter);
  }

  create(input: CreateItemInput, actor = "system"): ItemRecord {
    const now = new Date().toISOString();
    const createItem = this.database.transaction(() => {
      const result = this.createStatement.run(
        input.title,
        input.category,
        input.dueDate ?? null,
        input.status ?? "pending",
        input.priority ?? "normal",
        input.notes ?? "",
        input.source ?? "manual",
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
}
