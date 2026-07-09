async function loadUpdates() {
  const res = await fetch("/api/updates");
  const data = await res.json();

  ["openai", "gemini", "claude", "deepseek"].forEach(source => {
    const box = document.querySelector(`[data-source="${source}"]`);
    const items = data[source] || [];

    box.innerHTML = items.length
      ? items.map(item => `
          <a class="item" href="${item.url}" target="_blank">
            <b>${item.title}</b>
            <span>${item.published_at ? new Date(item.published_at).toLocaleDateString() : "No date"}</span>
          </a>
        `).join("")
      : "<p>No updates yet.</p>";
  });
}

loadUpdates();