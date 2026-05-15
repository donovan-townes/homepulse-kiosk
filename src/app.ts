import express from "express";
import { execFile } from "node:child_process";
import crypto from "node:crypto";
import path from "node:path";
import { promisify } from "node:util";
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
  recurrence: z
    .object({
      frequency: z.enum(["daily", "weekly"]),
      interval: z.number().int().min(1).max(52).optional(),
      daysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
    })
    .optional(),
}).superRefine((value, context) => {
  if (value.recurrence && !value.dueDate) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Recurring items require a dueDate",
      path: ["dueDate"],
    });
  }
});

const loginSchema = z.object({
  pin: z.string().trim().min(4).max(12),
});

type CreateAppOptions = {
  config: AppConfig;
  itemsRepository: ItemsRepository;
};

const execFileAsync = promisify(execFile);

type NetworkStatus = {
  state: "connected" | "disconnected" | "unknown";
  interfaceName?: string;
  connection?: string;
  ssid?: string;
  signalPct?: number;
  lastCheckedAt: string;
};

async function inspectNetworkStatus(): Promise<NetworkStatus> {
  const lastCheckedAt = new Date().toISOString();

  try {
    const { stdout } = await execFileAsync(
      "nmcli",
      ["-t", "-f", "DEVICE,TYPE,STATE,CONNECTION", "device", "status"],
      { timeout: 4000, encoding: "utf8" },
    );

    const wifiLine = stdout
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.length > 0 && line.split(":")[1] === "wifi");

    if (!wifiLine) {
      return { state: "disconnected", lastCheckedAt };
    }

    const [interfaceName = "", deviceType = "", state = "", ...rest] =
      wifiLine.split(":");
    const connection = rest.join(":") || undefined;

    if (deviceType !== "wifi") {
      return { state: "unknown", lastCheckedAt };
    }

    if (state !== "connected") {
      return {
        state: state === "disconnected" ? "disconnected" : "unknown",
        interfaceName: interfaceName || undefined,
        connection,
        lastCheckedAt,
      };
    }

    let ssid: string | undefined;
    let signalPct: number | undefined;

    try {
      const { stdout: wifiStdout } = await execFileAsync(
        "nmcli",
        ["-t", "-f", "IN-USE,SSID,SIGNAL", "device", "wifi"],
        { timeout: 4000, encoding: "utf8" },
      );

      const activeLine = wifiStdout
        .split("\n")
        .map((line) => line.trim())
        .find((line) => line.startsWith("*:"));

      if (activeLine) {
        const [, activeSsid = "", activeSignal = ""] = activeLine.split(":");
        ssid = activeSsid || undefined;
        const parsedSignal = Number(activeSignal);
        if (!Number.isNaN(parsedSignal)) {
          signalPct = parsedSignal;
        }
      }
    } catch {
      // Ignore secondary lookup failure; the connection state is still useful.
    }

    return {
      state: "connected",
      interfaceName: interfaceName || undefined,
      connection,
      ssid,
      signalPct,
      lastCheckedAt,
    };
  } catch {
    return { state: "unknown", lastCheckedAt };
  }
}

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

  app.get("/api/network-status", async (_request, response) => {
    response.json(await inspectNetworkStatus());
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
