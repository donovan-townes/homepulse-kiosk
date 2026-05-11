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

    const createResponse = await request(app).post("/api/items").send({
      title: "Replace HVAC filter",
      category: "filter",
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
      category: "filter",
      priority: "high",
      title: "Replace HVAC filter",
    });
  });

  it("rejects invalid item payloads", async () => {
    const { app, database } = buildTestApp();
    const response = await request(app).post("/api/items").send({
      title: "",
      category: "invalid-category",
    });
    database.close();

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Invalid item payload");
  });
});
