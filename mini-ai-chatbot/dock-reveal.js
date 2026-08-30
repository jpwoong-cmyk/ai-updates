export class DockReveal {
  constructor(root, {
    buildDurationMs = 1150,
    disassembleDurationMs = 300
  } = {}) {
    this.root = root;
    this.buildDurationMs = buildDurationMs;
    this.disassembleDurationMs = disassembleDurationMs;
    this.token = 0;
  }

  async build() {
    const token = ++this.token;

    this.root.classList.remove("is-disassembling", "is-built");
    this.root.classList.add("is-building");

    // Restart CSS animations reliably.
    void this.root.offsetWidth;

    await wait(this.buildDurationMs);

    if (token !== this.token) return;

    this.root.classList.remove("is-building");
    this.root.classList.add("is-built");
  }

  async disassemble() {
    const token = ++this.token;

    this.root.classList.remove("is-building", "is-built");
    this.root.classList.add("is-disassembling");

    await wait(this.disassembleDurationMs);

    if (token !== this.token) return;

    this.root.classList.remove("is-disassembling");
  }

  reset() {
    this.token += 1;
    this.root.classList.remove(
      "is-building",
      "is-built",
      "is-disassembling"
    );
  }
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
