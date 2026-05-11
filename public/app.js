const clockElement = document.querySelector("#clock");
const itemsListElement = document.querySelector("#items-list");
const itemCountElement = document.querySelector("#item-count");

function renderClock() {
  if (!clockElement) {
    return;
  }

  const now = new Date();
  clockElement.textContent = now.toLocaleString([], {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  });
}

function formatDueDate(dueDate) {
  if (!dueDate) {
    return "No due date";
  }

  return new Date(dueDate).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function renderItems(items) {
  if (!itemsListElement || !itemCountElement) {
    return;
  }

  itemCountElement.textContent = `${items.length} item${items.length === 1 ? "" : "s"}`;
  itemsListElement.innerHTML = "";

  if (items.length === 0) {
    const emptyState = document.createElement("li");
    emptyState.textContent =
      "No household items yet. Add your first reminder from the admin page.";
    itemsListElement.append(emptyState);
    return;
  }

  for (const item of items) {
    const row = document.createElement("li");
    const priorityClass = item.priority === "high" ? " high" : "";
    row.innerHTML = `
      <span class="pill${priorityClass}">${item.priority}</span>
      <strong>${item.title}</strong>
      <span class="list-meta">${item.category} · ${formatDueDate(item.due_date)}</span>
      <span class="list-meta">${item.notes || "No notes"}</span>
    `;
    itemsListElement.append(row);
  }
}

async function loadItems() {
  const response = await fetch("/api/items");
  const payload = await response.json();
  renderItems(payload.items);
}

renderClock();
setInterval(renderClock, 30_000);
void loadItems();
