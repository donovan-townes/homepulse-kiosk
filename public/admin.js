const formElement = document.querySelector("#item-form");
const formStatusElement = document.querySelector("#form-status");
const itemsListElement = document.querySelector("#admin-items-list");
const logoutButtonElement = document.querySelector("#logout-button");
const isRecurringElement = document.querySelector("#is-recurring");
const recurrenceFieldsElement = document.querySelector("#recurrence-fields");

function formatItem(item) {
  const dueDate = item.due_date
    ? new Date(item.due_date).toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "No due date";

  return `
    <li>
      <span class="pill${item.priority === "high" ? " high" : ""}">${item.priority}</span>
      <strong>${item.title}</strong>
      <span class="list-meta">${item.category} · ${dueDate}</span>
      <span class="list-meta">${item.notes || "No notes"}</span>
    </li>
  `;
}

async function loadItems() {
  const response = await fetch("/api/items");
  const payload = await response.json();

  if (!itemsListElement) {
    return;
  }

  itemsListElement.innerHTML = payload.items.map(formatItem).join("");
}

if (formElement instanceof HTMLFormElement) {
  const toggleRecurrenceFields = () => {
    if (
      !(isRecurringElement instanceof HTMLInputElement) ||
      !(recurrenceFieldsElement instanceof HTMLElement)
    ) {
      return;
    }

    recurrenceFieldsElement.hidden = !isRecurringElement.checked;
  };

  toggleRecurrenceFields();
  if (isRecurringElement instanceof HTMLInputElement) {
    isRecurringElement.addEventListener("change", toggleRecurrenceFields);
  }

  formElement.addEventListener("submit", async (event) => {
    event.preventDefault();

    const formData = new FormData(formElement);
    const dueDateValue = formData.get("dueDate");
    const recurrenceFrequency = String(
      formData.get("recurrenceFrequency") ?? "weekly",
    );
    const recurrenceIntervalRaw = Number(formData.get("recurrenceInterval") ?? 1);
    const recurrenceInterval = Number.isInteger(recurrenceIntervalRaw)
      ? Math.max(1, recurrenceIntervalRaw)
      : 1;
    const selectedDays = formData
      .getAll("daysOfWeek")
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6);
    const isRecurring =
      isRecurringElement instanceof HTMLInputElement
        ? isRecurringElement.checked
        : false;

    const payload = {
      title: String(formData.get("title") ?? ""),
      category: String(formData.get("category") ?? "reminder"),
      priority: String(formData.get("priority") ?? "normal"),
      notes: String(formData.get("notes") ?? ""),
      ...(typeof dueDateValue === "string" && dueDateValue
        ? { dueDate: new Date(dueDateValue).toISOString() }
        : {}),
      ...(isRecurring
        ? {
            recurrence: {
              frequency:
                recurrenceFrequency === "daily" ? "daily" : "weekly",
              interval: recurrenceInterval,
              ...(recurrenceFrequency === "weekly" && selectedDays.length > 0
                ? { daysOfWeek: selectedDays }
                : {}),
            },
          }
        : {}),
    };

    const response = await fetch("/api/items", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      if (response.status === 401) {
        window.location.assign("/admin");
        return;
      }

      if (formStatusElement) {
        formStatusElement.textContent =
          "Could not create item. Check the values and try again.";
      }
      return;
    }

    formElement.reset();
    if (formStatusElement) {
      formStatusElement.textContent = "Item created.";
    }
    await loadItems();
  });
}

if (logoutButtonElement instanceof HTMLButtonElement) {
  logoutButtonElement.addEventListener("click", async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    window.location.assign("/admin");
  });
}

void loadItems();
