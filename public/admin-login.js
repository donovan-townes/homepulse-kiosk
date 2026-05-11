const formElement = document.querySelector("#admin-login-form");
const statusElement = document.querySelector("#admin-login-status");

if (formElement instanceof HTMLFormElement) {
  formElement.addEventListener("submit", async (event) => {
    event.preventDefault();

    const formData = new FormData(formElement);
    const payload = {
      pin: String(formData.get("pin") ?? ""),
    };

    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      if (statusElement) {
        statusElement.textContent = "Invalid PIN. Try again.";
      }
      return;
    }

    window.location.assign("/admin");
  });
}
