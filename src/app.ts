import express from "express";
import crypto from "node:crypto";
import path from "node:path";
import { z } from "zod";
import { AppConfig } from "./config.js";
import {
  ItemsRepository,
  allowedCategories,
  allowedPriorities,
  allowedStatuses,
} from "./repositories/itemsRepository.js";

const createItemSchema = z.object({
  title: z.string().trim().min(1).max(120),
  category: z.enum(allowedCategories),
  dueDate: z.string().datetime().optional(),
  status: z.enum(allowedStatuses).optional(),
  priority: z.enum(allowedPriorities).optional(),
  notes: z.string().max(1000).optional(),
});

const loginSchema = z.object({
  pin: z.string().trim().min(4).max(12),
});

type CreateAppOptions = {
  config: AppConfig;
  itemsRepository: ItemsRepository;
};

export function createApp({ config, itemsRepository }: CreateAppOptions) {
  const app = express();
  const publicDir = path.resolve(process.cwd(), "public");
  const adminCookieName = "homepulse_admin_session";

  function parseCookies(rawCookies?: string) {
    const parsed: Record<string, string> = {};
    if (!rawCookies) {
      return parsed;
    }

    for (const entry of rawCookies.split(";")) {
      const [keyPart, ...valueParts] = entry.trim().split("=");
      if (!keyPart) {
        continue;
      }

      parsed[keyPart] = decodeURIComponent(valueParts.join("="));
    }

    return parsed;
  }

  function signSession(expiresAt: number) {
    return crypto
      .createHmac("sha256", config.adminSessionSecret)
      .update(String(expiresAt))
      .digest("hex");
  }

  function isAdminAuthenticated(request: express.Request) {
    const cookieValue = parseCookies(request.headers.cookie)[adminCookieName];
    if (!cookieValue) {
      return false;
    }

    const [expiresAtRaw, signature] = cookieValue.split(".");
    const expiresAt = Number(expiresAtRaw);
    if (!expiresAtRaw || !signature || Number.isNaN(expiresAt)) {
      return false;
    }

    if (Date.now() > expiresAt) {
      return false;
    }

    const expectedSignature = signSession(expiresAt);
    if (signature.length !== expectedSignature.length) {
      return false;
    }

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature),
    );
  }

  function setAdminSessionCookie(response: express.Response) {
    const maxAgeSeconds = config.adminSessionTtlMinutes * 60;
    const expiresAt = Date.now() + maxAgeSeconds * 1000;
    const signature = signSession(expiresAt);
    const cookieValue = `${expiresAt}.${signature}`;
    response.setHeader(
      "Set-Cookie",
      `${adminCookieName}=${encodeURIComponent(cookieValue)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}`,
    );
  }

  function clearAdminSessionCookie(response: express.Response) {
    response.setHeader(
      "Set-Cookie",
      `${adminCookieName}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`,
    );
  }

  function requireAdmin(
    request: express.Request,
    response: express.Response,
    next: express.NextFunction,
  ) {
    if (!isAdminAuthenticated(request)) {
      response.status(401).json({ error: "Admin authentication required" });
      return;
    }

    next();
  }

  app.use(express.json());

  // Auth-gated route MUST be registered before express.static so the static
  // file middleware cannot serve admin.html directly and bypass the PIN check.
  app.get("/admin", (request, response) => {
    if (!isAdminAuthenticated(request)) {
      response.sendFile(path.join(publicDir, "admin-login.html"));
      return;
    }

    response.sendFile(path.join(publicDir, "admin.html"));
  });

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

  app.get("/api/weather-config", (_request, response) => {
    response.json({
      latitude: config.weatherLatitude,
      longitude: config.weatherLongitude,
      temperatureUnit: config.weatherTemperatureUnit,
      enabled:
        typeof config.weatherLatitude === "number" &&
        typeof config.weatherLongitude === "number",
    });
  });

  app.get("/api/items", (request, response) => {
    const category =
      typeof request.query.category === "string"
        ? request.query.category
        : undefined;

    if (
      category &&
      !allowedCategories.includes(
        category as (typeof allowedCategories)[number],
      )
    ) {
      response.status(400).json({ error: "Invalid category filter" });
      return;
    }

    response.json({
      items: itemsRepository.list(
        category as (typeof allowedCategories)[number] | undefined,
      ),
    });
  });

  app.post("/api/admin/login", (request, response) => {
    const parsedBody = loginSchema.safeParse(request.body);

    if (!parsedBody.success) {
      response.status(400).json({ error: "Invalid login payload" });
      return;
    }

    if (parsedBody.data.pin !== config.adminPin) {
      response.status(401).json({ error: "Invalid PIN" });
      return;
    }

    setAdminSessionCookie(response);
    response.json({ ok: true });
  });

  app.post("/api/admin/logout", (_request, response) => {
    clearAdminSessionCookie(response);
    response.json({ ok: true });
  });

  app.post("/api/items", requireAdmin, (request, response) => {
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

  return app;
}
