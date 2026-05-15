import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { openDatabase } from "../../src/db/database.js";
import { ItemsRepository } from "../../src/repositories/itemsRepository.js";

const tempDirectories: string[] = [];

afterEach(() => {
  while (tempDirectories.length > 0) {
    const directory = tempDirectories.pop();
    if (directory) {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  }
});

function buildTestApp() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "homepulse-kiosk-"));
  tempDirectories.push(tempDir);

  const databasePath = path.join(tempDir, "homepulse-test.db");
  const database = openDatabase(databasePath);
  const itemsRepository = new ItemsRepository(database);
  const app = createApp({
    config: {
      port: 0,
      host: "127.0.0.1",
      dataDir: tempDir,
      databasePath,
      appVersion: "test",
      adminPin: "1234",
      adminSessionSecret: "test-secret",
      adminSessionTtlMinutes: 60,
      weatherTemperatureUnit: "fahrenheit",
    },
    itemsRepository,
  });

  return { app, database };
}

describe("HomePulse app", () => {
  it("returns a healthy status payload", async () => {
    const { app, database } = buildTestApp();
    const response = await request(app).get("/health");
    database.close();

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("ok");
    expect(response.body.version).toBe("test");
  });

  it("creates and lists household items", async () => {
    const { app, database } = buildTestApp();

    const loginResponse = await request(app).post("/api/admin/login").send({
      pin: "1234",
    });

    expect(loginResponse.status).toBe(200);
    const cookie = loginResponse.headers["set-cookie"];
    expect(cookie).toBeDefined();

    const createResponse = await request(app)
      .post("/api/items")
      .set("Cookie", cookie)
      .send({
        title: "Replace HVAC filter",
        category: "maintenance",
        priority: "high",
        notes: "Order two MERV-13 filters",
        dueDate: "2026-06-01T16:00:00.000Z",
      });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.item.title).toBe("Replace HVAC filter");

    const listResponse = await request(app).get("/api/items");
    database.close();

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.items).toHaveLength(1);
    expect(listResponse.body.items[0]).toMatchObject({
      category: "maintenance",
      priority: "high",
      title: "Replace HVAC filter",
    });
  });

  it("rolls recurring reminders forward after their due date passes", async () => {
    const { app, database } = buildTestApp();

    const loginResponse = await request(app).post("/api/admin/login").send({
      pin: "1234",
    });
    const cookie = loginResponse.headers["set-cookie"];

    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    twoDaysAgo.setHours(19, 0, 0, 0);

    const createResponse = await request(app)
      .post("/api/items")
      .set("Cookie", cookie)
      .send({
        title: "Trash to curb",
        category: "chore",
        priority: "normal",
        dueDate: twoDaysAgo.toISOString(),
        recurrence: {
          frequency: "weekly",
          interval: 1,
          daysOfWeek: [twoDaysAgo.getDay()],
        },
      });

    expect(createResponse.status).toBe(201);

    const listResponse = await request(app).get("/api/items");
    database.close();

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.items).toHaveLength(1);

    const rolledDueDate = new Date(listResponse.body.items[0].due_date);
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    expect(rolledDueDate.getTime()).toBeGreaterThanOrEqual(startOfToday.getTime());
  });

  it("accepts monthly recurring items", async () => {
    const { app, database } = buildTestApp();

    const loginResponse = await request(app).post("/api/admin/login").send({
      pin: "1234",
    });
    const cookie = loginResponse.headers["set-cookie"];

    const createResponse = await request(app)
      .post("/api/items")
      .set("Cookie", cookie)
      .send({
        title: "Monthly deep clean",
        category: "chore",
        priority: "normal",
        dueDate: "2026-06-01T18:00:00.000Z",
        recurrence: {
          frequency: "monthly",
          interval: 1,
          dayOfMonth: 1,
        },
      });

    database.close();
    expect(createResponse.status).toBe(201);
  });

  it("rejects invalid item payloads", async () => {
    const { app, database } = buildTestApp();

    const loginResponse = await request(app).post("/api/admin/login").send({
      pin: "1234",
    });
    const cookie = loginResponse.headers["set-cookie"];

    const response = await request(app)
      .post("/api/items")
      .set("Cookie", cookie)
      .send({
        title: "",
        category: "invalid-category",
      });
    database.close();

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Invalid item payload");
  });

  it("returns a network status payload", async () => {
    const { app, database } = buildTestApp();
    const response = await request(app).get("/api/network-status");
    database.close();

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("state");
    expect(response.body).toHaveProperty("lastCheckedAt");
  });

  it("updates item status and deletes completed items", async () => {
    const { app, database } = buildTestApp();

    const loginResponse = await request(app).post("/api/admin/login").send({
      pin: "1234",
    });
    const cookie = loginResponse.headers["set-cookie"];

    const createResponse = await request(app)
      .post("/api/items")
      .set("Cookie", cookie)
      .send({
        title: "Test completion flow",
        category: "chore",
        priority: "normal",
      });

    expect(createResponse.status).toBe(201);
    const itemId = createResponse.body.item.id;

    const updateStatusResponse = await request(app)
      .patch(`/api/items/${itemId}/status`)
      .set("Cookie", cookie)
      .send({ status: "done" });

    expect(updateStatusResponse.status).toBe(200);
    expect(updateStatusResponse.body.item.status).toBe("done");

    const deleteDoneResponse = await request(app)
      .delete("/api/items?status=done")
      .set("Cookie", cookie);

    expect(deleteDoneResponse.status).toBe(200);
    expect(deleteDoneResponse.body.deleted).toBeGreaterThanOrEqual(1);

    const listResponse = await request(app).get("/api/items");
    database.close();

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.items.find((item: { id: number }) => item.id === itemId)).toBeUndefined();
  });

  it("blocks item creation without admin auth", async () => {
    const { app, database } = buildTestApp();
    const response = await request(app).post("/api/items").send({
      title: "Trash to curb",
      category: "reminder",
      priority: "normal",
    });
    database.close();

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("Admin authentication required");
  });
});
