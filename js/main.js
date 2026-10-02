/*
  Forsiden: bli med i et spill med kode, eller lag et nytt spill som host.
*/

document.addEventListener("DOMContentLoaded", function() {
  const form = document.getElementById("join-form");
  const codeInput = document.getElementById("code-input");
  const hostButton = document.getElementById("host-button");
  const error = document.getElementById("landing-error");

  const params = new URLSearchParams(location.search);
  if (params.get("kode")) codeInput.value = params.get("kode").toUpperCase();

  codeInput.addEventListener("input", () => {
    codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  });

  form.addEventListener("submit", async event => {
    event.preventDefault();
    const code = codeInput.value.trim().toUpperCase();
    if (!code) return;
    error.textContent = "";
    try {
      await GS.api("/api/check", { code });
      location.href = `spill.html?kode=${encodeURIComponent(code)}`;
    } catch (e) {
      error.textContent = e.message;
    }
  });

  hostButton.addEventListener("click", async () => {
    hostButton.disabled = true;
    error.textContent = "";
    try {
      const { code, hostToken } = await GS.api("/api/create");
      GS.store(`gs-host-${code}`, hostToken);
      location.href = `host.html?kode=${encodeURIComponent(code)}`;
    } catch (e) {
      error.textContent = e.message;
      hostButton.disabled = false;
    }
  });
});
