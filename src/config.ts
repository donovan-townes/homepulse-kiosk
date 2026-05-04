import path from "node:path";

export type AppConfig = {
  port: number;
  host: string;
  dataDir: string;
  databasePath: string;
  appVersion: string;
};

const defaultDataDir = path.resolve(process.cwd(), "data");

export function loadConfig(): AppConfig {
  const dataDir = process.env.HOMEPULSE_DATA_DIR
    ? path.resolve(process.env.HOMEPULSE_DATA_DIR)
    : defaultDataDir;

  return {
    port: Number(process.env.PORT ?? 3000),
    host: process.env.HOST ?? "127.0.0.1",
    dataDir,
    databasePath: process.env.HOMEPULSE_DB_PATH
      ? path.resolve(process.env.HOMEPULSE_DB_PATH)
      : path.join(dataDir, "homepulse.db"),
    appVersion: process.env.HOMEPULSE_APP_VERSION ?? "0.1.0",
  };
}