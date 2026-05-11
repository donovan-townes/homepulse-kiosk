const clockElement = document.querySelector("#clock");
const dateLineElement = document.querySelector("#date-line");
const itemsListElement = document.querySelector("#items-list");
const itemCountElement = document.querySelector("#item-count");
const statusHeadlineElement = document.querySelector("#status-headline");
const statusSubtextElement = document.querySelector("#status-subtext");
const maintenanceCountElement = document.querySelector("#maintenance-count");
const maintenanceListElement = document.querySelector("#maintenance-list");
const weatherLabelElement = document.querySelector("#weather-label");
const weatherTempElement = document.querySelector("#weather-temp");
const weatherDescElement = document.querySelector("#weather-desc");

function renderClock() {
  if (!clockElement || !dateLineElement) {
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
    .filter((item) => item.category === "maintenance" || item.category === "filter")
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
  if (!itemsListElement || !itemCountElement || !statusHeadlineElement || !statusSubtextElement) {
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

      return new Date(left.due_date).getTime() - new Date(right.due_date).getTime();
    })
    .slice(0, 6);

  const todaysItems = scheduleItems.filter((item) => item.due_date && isToday(new Date(item.due_date)));

  itemCountElement.textContent = `${todaysItems.length || scheduleItems.length} item${(todaysItems.length || scheduleItems.length) === 1 ? "" : "s"}`;
  itemsListElement.innerHTML = "";

  if (scheduleItems.length === 0) {
    const emptyState = document.createElement("li");
    emptyState.textContent =
      "No household items yet. Add your first reminder from the admin page.";
    itemsListElement.append(emptyState);
    statusHeadlineElement.textContent = "No schedule items yet.";
    statusSubtextElement.textContent = "Open admin to add reminders or maintenance tasks.";
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
  if (!weatherLabelElement || !weatherTempElement || !weatherDescElement) {
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
    return;
  }

  weatherLabelElement.textContent = "Live forecast";
  const params = new URLSearchParams({
    latitude: String(weatherConfig.latitude),
    longitude: String(weatherConfig.longitude),
    current: "temperature_2m,weather_code",
    temperature_unit: weatherConfig.temperatureUnit,
  });

  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`);
  if (!response.ok) {
    weatherLabelElement.textContent = "Unavailable";
    return;
  }

  const payload = await response.json();
  const temp = payload?.current?.temperature_2m;
  const weatherCode = payload?.current?.weather_code;
  const unit = weatherConfig.temperatureUnit === "celsius" ? "C" : "F";

  weatherTempElement.textContent =
    typeof temp === "number" ? `${Math.round(temp)}°${unit}` : "--";
  weatherDescElement.textContent = weatherCodeToDescription(weatherCode);
}

async function loadItems() {
  const response = await fetch("/api/items");
  const payload = await response.json();
  renderItems(payload.items);
}

renderClock();
setInterval(renderClock, 30_000);
void loadItems();
void loadWeather();
