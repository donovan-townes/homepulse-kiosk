import path from "node:path";

export type AppConfig = {
  port: number;
  host: string;
  dataDir: string;
  databasePath: string;
  appVersion: string;
  adminPin: string;
  adminSessionSecret: string;
  adminSessionTtlMinutes: number;
  weatherLatitude?: number;
  weatherLongitude?: number;
  weatherTemperatureUnit: "fahrenheit" | "celsius";
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
    adminPin: process.env.HOMEPULSE_ADMIN_PIN ?? "1234",
    adminSessionSecret:
      process.env.HOMEPULSE_ADMIN_SESSION_SECRET ?? "change-me-in-env",
    adminSessionTtlMinutes: Number(process.env.HOMEPULSE_ADMIN_SESSION_TTL_MINUTES ?? 480),
    weatherLatitude: process.env.HOMEPULSE_WEATHER_LATITUDE
      ? Number(process.env.HOMEPULSE_WEATHER_LATITUDE)
      : undefined,
    weatherLongitude: process.env.HOMEPULSE_WEATHER_LONGITUDE
      ? Number(process.env.HOMEPULSE_WEATHER_LONGITUDE)
      : undefined,
    weatherTemperatureUnit:
      process.env.HOMEPULSE_WEATHER_TEMPERATURE_UNIT === "celsius"
        ? "celsius"
        : "fahrenheit",
  };
}
