const clockElement = document.querySelector("#clock");
const dateLineElement = document.querySelector("#date-line");
const clockExtraElement = document.querySelector("#clock-extra");
const networkStatusElement = document.querySelector("#network-status");
const networkDetailsElement = document.querySelector("#network-details");
const itemsListElement = document.querySelector("#items-list");
const itemCountElement = document.querySelector("#item-count");
const statusHeadlineElement = document.querySelector("#status-headline");
const statusSubtextElement = document.querySelector("#status-subtext");
const maintenanceCountElement = document.querySelector("#maintenance-count");
const maintenanceListElement = document.querySelector("#maintenance-list");
const weatherLabelElement = document.querySelector("#weather-label");
const weatherUpdatedElement = document.querySelector("#weather-updated");
const weatherTempElement = document.querySelector("#weather-temp");
const weatherDescElement = document.querySelector("#weather-desc");
const weatherRangeElement = document.querySelector("#weather-range");
const weatherMetaElement = document.querySelector("#weather-meta");

const weatherCacheKey = "homepulse-weather-cache";

function renderClock() {
  if (!clockElement || !dateLineElement || !clockExtraElement) {
    return;
  }

  const now = new Date();
  clockElement.textContent = now.toLocaleString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  dateLineElement.textContent = now.toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  clockExtraElement.textContent = `Local time · ${timezone}`;
}

function applyAutoTheme(sunriseIso, sunsetIso) {
  const now = new Date();
  let isDark = false;

  if (sunriseIso && sunsetIso) {
    const sunrise = new Date(sunriseIso);
    const sunset = new Date(sunsetIso);
    isDark = now < sunrise || now > sunset;
  } else {
    const hour = now.getHours();
    isDark = hour < 5 || hour >= 19;
  }

  document.body.classList.toggle("theme-dark", isDark);
  document.body.classList.toggle("theme-light", !isDark);
}

function formatRelativeTime(isoString) {
  const timestamp = new Date(isoString).getTime();
  if (Number.isNaN(timestamp)) {
    return "unknown time";
  }

  const elapsedMinutes = Math.max(0, Math.round((Date.now() - timestamp) / 60000));
  if (elapsedMinutes < 1) {
    return "just now";
  }

  if (elapsedMinutes < 60) {
    return `${elapsedMinutes} min ago`;
  }

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) {
    return `${elapsedHours} hr${elapsedHours === 1 ? "" : "s"} ago`;
  }

  const elapsedDays = Math.floor(elapsedHours / 24);
  return `${elapsedDays} day${elapsedDays === 1 ? "" : "s"} ago`;
}

function setNetworkStatus(status) {
  if (!networkStatusElement || !networkDetailsElement) {
    return;
  }

  const state = status?.state ?? "unknown";
  const interfaceName = status?.interfaceName ?? status?.interface ?? "";
  const connection = status?.connection ?? "";
  const ssid = status?.ssid ?? "";
  const signalPct = status?.signalPct;

  networkStatusElement.className = `status-pill network-pill network-${state}`;
  networkStatusElement.textContent =
    state === "connected"
      ? "Network online"
      : state === "disconnected"
        ? "Network offline"
        : "Network unknown";

  const details = [];
  if (interfaceName) {
    details.push(interfaceName);
  }
  if (connection) {
    details.push(connection);
  }
  if (ssid && ssid !== connection) {
    details.push(ssid);
  }
  if (typeof signalPct === "number") {
    details.push(`${signalPct}% signal`);
  }

  networkDetailsElement.textContent = details.join(" · ");
}

function readWeatherCache() {
  try {
    const rawValue = localStorage.getItem(weatherCacheKey);
    if (!rawValue) {
      return null;
    }

    return JSON.parse(rawValue);
  } catch {
    return null;
  }
}

function writeWeatherCache(cacheValue) {
  try {
    localStorage.setItem(weatherCacheKey, JSON.stringify(cacheValue));
  } catch {
    // Ignore storage failures on kiosk browsers.
  }
}

function renderWeatherDisplay({
  sourceLabel,
  payload,
  weatherConfig,
  updatedAt,
  isCached = false,
}) {
  const temp = payload?.current?.temperature_2m;
  const weatherCode = payload?.current?.weather_code;
  const highTemp = payload?.daily?.temperature_2m_max?.[0];
  const lowTemp = payload?.daily?.temperature_2m_min?.[0];
  const precipitationChance =
    payload?.daily?.precipitation_probability_max?.[0];
  const sunrise = payload?.daily?.sunrise?.[0];
  const sunset = payload?.daily?.sunset?.[0];
  const unit = weatherConfig.temperatureUnit === "celsius" ? "C" : "F";

  weatherLabelElement.textContent = isCached ? `${sourceLabel} (cached)` : sourceLabel;
  weatherTempElement.textContent =
    typeof temp === "number" ? `${Math.round(temp)}°${unit}` : "--";
  weatherDescElement.textContent = weatherCodeToDescription(weatherCode);
  weatherRangeElement.textContent =
    typeof highTemp === "number" && typeof lowTemp === "number"
      ? `Today: High ${Math.round(highTemp)}°${unit} · Low ${Math.round(lowTemp)}°${unit}`
      : "Today: forecast details unavailable";
  weatherMetaElement.textContent =
    typeof precipitationChance === "number"
      ? `Precipitation chance: ${Math.round(precipitationChance)}%`
      : "Precipitation chance unavailable";
  weatherUpdatedElement.textContent = `Updated ${formatRelativeTime(updatedAt)}`;

  applyAutoTheme(sunrise, sunset);
}

function formatDueDate(dueDate) {
  if (!dueDate) {
    return "No due date";
  }

  return new Date(dueDate).toLocaleString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDayAndTime(dueDate) {
  if (!dueDate) {
    return "No due date";
  }

  return new Date(dueDate).toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isToday(dateValue) {
  const now = new Date();
  return (
    dateValue.getFullYear() === now.getFullYear() &&
    dateValue.getMonth() === now.getMonth() &&
    dateValue.getDate() === now.getDate()
  );
}

function renderMaintenance(items) {
  if (!maintenanceCountElement || !maintenanceListElement) {
    return;
  }

  const maintenanceItems = items
    .filter(
      (item) => item.category === "maintenance" || item.category === "filter",
    )
    .filter((item) => item.status !== "done")
    .slice(0, 4);

  maintenanceCountElement.textContent = `${maintenanceItems.length} pending`;
  maintenanceListElement.innerHTML = "";

  if (maintenanceItems.length === 0) {
    const row = document.createElement("li");
    row.textContent = "No maintenance items pending.";
    maintenanceListElement.append(row);
    return;
  }

  for (const item of maintenanceItems) {
    const row = document.createElement("li");
    row.innerHTML = `
      <strong>${item.title}</strong>
      <span class="list-meta">${item.category} · ${formatDayAndTime(item.due_date)}</span>
    `;
    maintenanceListElement.append(row);
  }
}

function renderItems(items) {
  if (
    !itemsListElement ||
    !itemCountElement ||
    !statusHeadlineElement ||
    !statusSubtextElement
  ) {
    return;
  }

  const scheduleItems = items
    .filter((item) => item.status !== "done")
    .sort((left, right) => {
      if (!left.due_date && !right.due_date) {
        return 0;
      }

      if (!left.due_date) {
        return 1;
      }

      if (!right.due_date) {
        return -1;
      }

      return (
        new Date(left.due_date).getTime() - new Date(right.due_date).getTime()
      );
    })
    .slice(0, 6);

  const todaysItems = scheduleItems.filter(
    (item) => item.due_date && isToday(new Date(item.due_date)),
  );

  itemCountElement.textContent = `${todaysItems.length || scheduleItems.length} item${(todaysItems.length || scheduleItems.length) === 1 ? "" : "s"}`;
  itemsListElement.innerHTML = "";

  if (scheduleItems.length === 0) {
    const emptyState = document.createElement("li");
    emptyState.textContent =
      "No household items yet. Add your first reminder from the admin page.";
    itemsListElement.append(emptyState);
    statusHeadlineElement.textContent = "No schedule items yet.";
    statusSubtextElement.textContent =
      "Open admin to add reminders or maintenance tasks.";
    return;
  }

  statusHeadlineElement.textContent =
    todaysItems.length > 0
      ? "Everything is running smoothly today."
      : "Upcoming schedule is ready.";
  statusSubtextElement.textContent =
    todaysItems.length > 0
      ? `${todaysItems.length} item${todaysItems.length === 1 ? "" : "s"} due today.`
      : "No items due today. Showing upcoming reminders.";

  const renderSource = todaysItems.length > 0 ? todaysItems : scheduleItems;

  for (const item of renderSource) {
    const row = document.createElement("li");
    const priorityClass = item.priority === "high" ? " high" : "";
    row.innerHTML = `
      <div class="schedule-row-head">
        <span class="schedule-time">${formatDueDate(item.due_date)}</span>
        <span class="pill${priorityClass}">${item.priority}</span>
      </div>
      <strong>${item.title}</strong>
      <span class="list-meta">${item.category} · ${formatDayAndTime(item.due_date)}</span>
      <span class="list-meta">${item.notes || "No notes"}</span>
    `;
    itemsListElement.append(row);
  }

  renderMaintenance(items);
}

function weatherCodeToDescription(weatherCode) {
  const labels = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Rime fog",
    51: "Light drizzle",
    53: "Drizzle",
    55: "Dense drizzle",
    61: "Slight rain",
    63: "Rain",
    65: "Heavy rain",
    71: "Slight snow",
    73: "Snow",
    75: "Heavy snow",
    80: "Rain showers",
    81: "Heavy showers",
    95: "Thunderstorm",
  };

  return labels[weatherCode] || "Current conditions";
}

async function loadWeather() {
  if (
    !weatherLabelElement ||
    !weatherUpdatedElement ||
    !weatherTempElement ||
    !weatherDescElement ||
    !weatherRangeElement ||
    !weatherMetaElement
  ) {
    return;
  }

  const configResponse = await fetch("/api/weather-config");
  if (!configResponse.ok) {
    return;
  }

  const weatherConfig = await configResponse.json();
  if (!weatherConfig.enabled) {
    weatherLabelElement.textContent = "Not configured";
    weatherTempElement.textContent = "--";
    weatherDescElement.textContent =
      "Set HOMEPULSE_WEATHER_LATITUDE and HOMEPULSE_WEATHER_LONGITUDE in env to enable weather.";
    weatherRangeElement.textContent = "";
    weatherMetaElement.textContent = "";
    weatherUpdatedElement.textContent = "";
    applyAutoTheme();
    return;
  }

  const cachedWeather = readWeatherCache();
  if (cachedWeather?.payload) {
    renderWeatherDisplay({
      sourceLabel: "Cached forecast",
      payload: cachedWeather.payload,
      weatherConfig: cachedWeather.weatherConfig ?? weatherConfig,
      updatedAt: cachedWeather.updatedAt ?? new Date().toISOString(),
      isCached: true,
    });
  }

  const params = new URLSearchParams({
    latitude: String(weatherConfig.latitude),
    longitude: String(weatherConfig.longitude),
    current: "temperature_2m,weather_code",
    daily:
      "temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset",
    forecast_days: "1",
    temperature_unit: weatherConfig.temperatureUnit,
  });

  const response = await fetch(
    `https://api.open-meteo.com/v1/forecast?${params.toString()}`,
  );
  if (!response.ok) {
    if (!cachedWeather?.payload) {
      weatherLabelElement.textContent = "Weather unavailable";
      weatherTempElement.textContent = "--";
      weatherDescElement.textContent = "No cached forecast available yet.";
      weatherRangeElement.textContent = "";
      weatherMetaElement.textContent = "";
      weatherUpdatedElement.textContent = "";
      applyAutoTheme();
    }
    return;
  }

  const payload = await response.json();
  const updatedAt = new Date().toISOString();
  writeWeatherCache({
    payload,
    weatherConfig,
    updatedAt,
  });
  renderWeatherDisplay({
    sourceLabel: "Live forecast",
    payload,
    weatherConfig,
    updatedAt,
    isCached: false,
  });
}

async function loadNetworkStatus() {
  if (!networkStatusElement || !networkDetailsElement) {
    return;
  }

  try {
    const response = await fetch("/api/network-status", { cache: "no-store" });
    if (!response.ok) {
      throw new Error("network status unavailable");
    }

    const payload = await response.json();
    setNetworkStatus(payload);
  } catch {
    setNetworkStatus({ state: "unknown" });
  }
}

async function loadItems() {
  const response = await fetch("/api/items");
  const payload = await response.json();
  renderItems(payload.items);
}

renderClock();
applyAutoTheme();
setInterval(renderClock, 60_000);
setInterval(() => applyAutoTheme(), 300_000);
setInterval(loadWeather, 10 * 60_000);
setInterval(loadNetworkStatus, 60_000);
void loadItems();
void loadWeather();
void loadNetworkStatus();
