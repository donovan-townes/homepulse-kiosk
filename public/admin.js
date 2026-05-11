const formElement = document.querySelector("#item-form");
const formStatusElement = document.querySelector("#form-status");
const itemsListElement = document.querySelector("#admin-items-list");

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
  formElement.addEventListener("submit", async (event) => {
    event.preventDefault();

    const formData = new FormData(formElement);
    const dueDateValue = formData.get("dueDate");
    const payload = {
      title: String(formData.get("title") ?? ""),
      category: String(formData.get("category") ?? "reminder"),
      priority: String(formData.get("priority") ?? "normal"),
      notes: String(formData.get("notes") ?? ""),
      ...(typeof dueDateValue === "string" && dueDateValue
        ? { dueDate: new Date(dueDateValue).toISOString() }
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

void loadItems();
