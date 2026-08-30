export function createMiniAiBot({ pixel = false, label = "Open AI assistant" } = {}) {
  if (pixel) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "mai-pixel-launcher";
    button.setAttribute("aria-label", label);

    const grid = document.createElement("span");
    grid.className = "mai-pixel-grid";
    grid.setAttribute("aria-hidden", "true");

    button.appendChild(grid);
    return { root: button, grid };
  }

  const button = document.createElement("button");
  button.type = "button";
  button.className = "mai-floating-launcher";
  button.setAttribute("aria-label", label);
  button.innerHTML = `
    <span class="mai-bot" aria-hidden="true">
      <span class="mai-bot__antenna">
        <span class="mai-bot__antenna-light"></span>
      </span>

      <span class="mai-bot__ear mai-bot__ear--left"></span>
      <span class="mai-bot__ear mai-bot__ear--right"></span>

      <span class="mai-bot__screen">
        <span class="mai-bot__ai">AI</span>
        <span class="mai-bot__eyes">
          <span></span>
          <span></span>
        </span>
        <span class="mai-bot__mouth"></span>
      </span>
    </span>

    <span class="mai-launcher-tooltip">Ask Mini AI</span>
  `;

  return { root: button };
}
