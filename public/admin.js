const formElement = document.querySelector("#item-form");
const formStatusElement = document.querySelector("#form-status");
const itemsListElement = document.querySelector("#admin-items-list");
const logoutButtonElement = document.querySelector("#logout-button");
const deleteDoneButtonElement = document.querySelector("#delete-done-button");
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
      <div class="admin-item-header">
        <span class="pill${item.priority === "high" ? " high" : ""}">${item.priority}</span>
        <div class="admin-item-actions">
          <label class="inline-check compact">
            <input class="status-toggle" data-item-id="${item.id}" type="checkbox" ${item.status === "done" ? "checked" : ""} />
            Done
          </label>
          <button class="button secondary small delete-item-button" data-item-id="${item.id}" type="button">Delete</button>
        </div>
      </div>
      <strong class="${item.status === "done" ? "item-done" : ""}">${item.title}</strong>
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
    const dayOfMonthRaw = Number(formData.get("dayOfMonth") ?? "");
    const dayOfMonth =
      Number.isInteger(dayOfMonthRaw) && dayOfMonthRaw >= 1 && dayOfMonthRaw <= 31
        ? dayOfMonthRaw
        : undefined;
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
                recurrenceFrequency === "daily"
                  ? "daily"
                  : recurrenceFrequency === "biweekly"
                    ? "biweekly"
                    : recurrenceFrequency === "monthly"
                      ? "monthly"
                      : "weekly",
              interval: recurrenceInterval,
              ...(recurrenceFrequency !== "daily" && selectedDays.length > 0
                ? { daysOfWeek: selectedDays }
                : {}),
              ...(recurrenceFrequency === "monthly" && dayOfMonth
                ? { dayOfMonth }
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

if (itemsListElement instanceof HTMLElement) {
  itemsListElement.addEventListener("change", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || !target.classList.contains("status-toggle")) {
      return;
    }

    const itemId = target.dataset.itemId;
    if (!itemId) {
      return;
    }

    const response = await fetch(`/api/items/${itemId}/status`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        status: target.checked ? "done" : "pending",
      }),
    });

    if (!response.ok) {
      target.checked = !target.checked;
      return;
    }

    await loadItems();
  });

  itemsListElement.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const deleteButton = target.closest(".delete-item-button");
    if (!(deleteButton instanceof HTMLButtonElement)) {
      return;
    }

    const itemId = deleteButton.dataset.itemId;
    if (!itemId) {
      return;
    }

    const response = await fetch(`/api/items/${itemId}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      return;
    }

    await loadItems();
  });
}

if (deleteDoneButtonElement instanceof HTMLButtonElement) {
  deleteDoneButtonElement.addEventListener("click", async () => {
    const response = await fetch("/api/items?status=done", {
      method: "DELETE",
    });

    if (!response.ok) {
      return;
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
