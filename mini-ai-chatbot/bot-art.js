function createComicBubble() {
  const bubble = document.createElement("span");
  bubble.className = "mai-comic-bubble";
  bubble.setAttribute("aria-hidden", "true");

  const text = document.createElement("span");
  text.className = "mai-comic-bubble__text";
  text.textContent = "";

  const caret = document.createElement("span");
  caret.className = "mai-comic-bubble__caret";
  caret.setAttribute("aria-hidden", "true");

  bubble.append(text, caret);
  return { bubble, text, caret };
}

export function createMiniAiBot({
  dock = false,
  label = "Open AI assistant"
} = {}) {
  const button = document.createElement("button");
  button.type = "button";
  button.setAttribute("aria-label", label);

  const comic = createComicBubble();

  if (dock) {
    button.className = "mai-dock-launcher";

    button.innerHTML = `
      <span class="mai-dock-orb" aria-hidden="true">
        <span class="mai-dock-orb__outer"></span>
        <span class="mai-dock-orb__orbit mai-dock-orb__orbit--a"></span>
        <span class="mai-dock-orb__orbit mai-dock-orb__orbit--b"></span>

        <span class="mai-dock-orb__bot">
          <span class="mai-dock-orb__antenna"></span>
          <span class="mai-dock-orb__face">
            <span class="mai-dock-orb__eye mai-dock-orb__eye--left"></span>
            <span class="mai-dock-orb__eye mai-dock-orb__eye--right"></span>
            <span class="mai-dock-orb__smile"></span>
          </span>
        </span>

        <span class="mai-dock-orb__scan"></span>

        <span class="mai-dock-orb__spark mai-dock-orb__spark--1"></span>
        <span class="mai-dock-orb__spark mai-dock-orb__spark--2"></span>
        <span class="mai-dock-orb__spark mai-dock-orb__spark--3"></span>
        <span class="mai-dock-orb__spark mai-dock-orb__spark--4"></span>
      </span>
    `;

    button.prepend(comic.bubble);

    return {
      root: button,
      bubble: comic.bubble,
      bubbleText: comic.text,
      bubbleCaret: comic.caret
    };
  }

  button.className = "mai-floating-launcher";

  button.innerHTML = `
    <span class="mai-bot" aria-hidden="true">
      <span class="mai-bot__aura"></span>

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
  `;

  button.prepend(comic.bubble);

  return {
    root: button,
    bubble: comic.bubble,
    bubbleText: comic.text,
    bubbleCaret: comic.caret
  };
}
