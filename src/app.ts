import express from "express";
import path from "node:path";
import { z } from "zod";
import { AppConfig } from "./config.js";
import { ItemsRepository, allowedCategories, allowedPriorities, allowedStatuses } from "./repositories/itemsRepository.js";

const createItemSchema = z.object({
  title: z.string().trim().min(1).max(120),
  category: z.enum(allowedCategories),
  dueDate: z.string().datetime().optional(),
  status: z.enum(allowedStatuses).optional(),
  priority: z.enum(allowedPriorities).optional(),
  notes: z.string().max(1000).optional(),
});

type CreateAppOptions = {
  config: AppConfig;
  itemsRepository: ItemsRepository;
};

export function createApp({ config, itemsRepository }: CreateAppOptions) {
  const app = express();
  const publicDir = path.resolve(process.cwd(), "public");

  app.use(express.json());
  app.use(express.static(publicDir));

  app.get("/health", (_request, response) => {
    response.json({
      status: "ok",
      version: config.appVersion,
      databasePath: config.databasePath,
      timestamp: new Date().toISOString(),
    });
  });

  app.get("/version", (_request, response) => {
    response.json({ version: config.appVersion });
  });

  app.get("/api/items", (request, response) => {
    const category = typeof request.query.category === "string" ? request.query.category : undefined;

    if (category && !allowedCategories.includes(category as (typeof allowedCategories)[number])) {
      response.status(400).json({ error: "Invalid category filter" });
      return;
    }

    response.json({ items: itemsRepository.list(category as (typeof allowedCategories)[number] | undefined) });
  });

  app.post("/api/items", (request, response) => {
    const parsedBody = createItemSchema.safeParse(request.body);

    if (!parsedBody.success) {
      response.status(400).json({
        error: "Invalid item payload",
        issues: parsedBody.error.issues,
      });
      return;
    }

    const item = itemsRepository.create(parsedBody.data, "admin");
    response.status(201).json({ item });
  });

  app.get("/admin", (_request, response) => {
    response.sendFile(path.join(publicDir, "admin.html"));
  });

  return app;
}