import { createServer } from "node:http";
import { loadConfig } from "./config.js";
import { openDatabase } from "./db/database.js";
import { ItemsRepository } from "./repositories/itemsRepository.js";
import { createApp } from "./app.js";

const config = loadConfig();
const database = openDatabase(config.databasePath);
const itemsRepository = new ItemsRepository(database);
const app = createApp({ config, itemsRepository });
const server = createServer(app);

server.listen(config.port, config.host, () => {
  console.log(
    `HomePulse kiosk listening on http://${config.host}:${config.port}`,
  );
});

function shutdown(signal: string) {
  console.log(`Received ${signal}, shutting down HomePulse kiosk`);
  server.close(() => {
    database.close();
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
