const PATTERN = [
  "0000000110000000",
  "0000000110000000",
  "0000001111000000",
  "0000011111100000",
  "0000111111110000",
  "0001111111111000",
  "0011111111111100",
  "0111000000001110",
  "1110000000000111",
  "1110011001100111",
  "1110011001100111",
  "1110000000000111",
  "1110000110000111",
  "0111001111001110",
  "0011111111111100",
  "0001111111111000",
  "0000111111110000",
  "0000011001100000"
];

function shuffledIndexes(length) {
  const indexes = Array.from({ length }, (_, index) => index);

  // Deterministic-ish reconstruction order: center outward with tiny random variation.
  return indexes.sort((a, b) => {
    const width = PATTERN[0].length;
    const ax = a % width;
    const ay = Math.floor(a / width);
    const bx = b % width;
    const by = Math.floor(b / width);

    const cx = (width - 1) / 2;
    const cy = (PATTERN.length - 1) / 2;

    const ad = Math.hypot(ax - cx, ay - cy) + Math.random() * 2.2;
    const bd = Math.hypot(bx - cx, by - cy) + Math.random() * 2.2;

    return ad - bd;
  });
}

export class PixelRebuild {
  constructor(grid, { buildDurationMs = 1900, disassembleDurationMs = 420 } = {}) {
    this.grid = grid;
    this.buildDurationMs = buildDurationMs;
    this.disassembleDurationMs = disassembleDurationMs;

    this.cells = [];
    this.activeCells = [];
    this.animationToken = 0;

    this.#render();
  }

  #render() {
    this.grid.innerHTML = "";

    PATTERN.forEach((row, y) => {
      [...row].forEach((value, x) => {
        const cell = document.createElement("span");
        cell.className = "mai-pixel";

        if (value === "1") {
          cell.classList.add("mai-pixel--drawable");

          const progress = y / Math.max(1, PATTERN.length - 1);

          if (progress < 0.34) {
            cell.dataset.tone = "mint";
          } else if (progress < 0.67) {
            cell.dataset.tone = "blue";
          } else {
            cell.dataset.tone = "gold";
          }

          this.activeCells.push(cell);
        } else {
          cell.classList.add("mai-pixel--empty");
        }

        this.cells.push(cell);
        this.grid.appendChild(cell);
      });
    });
  }

  reset() {
    this.animationToken += 1;
    this.activeCells.forEach((cell) => cell.classList.remove("is-on"));
  }

  async build() {
    const token = ++this.animationToken;
    this.activeCells.forEach((cell) => cell.classList.remove("is-on"));

    const order = shuffledIndexes(this.activeCells.length);
    const delay = Math.max(10, this.buildDurationMs / Math.max(1, order.length));

    for (const index of order) {
      if (token !== this.animationToken) return;

      this.activeCells[index].classList.add("is-on");
      await wait(delay);
    }
  }

  async disassemble() {
    const token = ++this.animationToken;
    const visible = this.activeCells.filter((cell) => cell.classList.contains("is-on"));
    const order = shuffledIndexes(visible.length).reverse();
    const delay = Math.max(4, this.disassembleDurationMs / Math.max(1, order.length));

    for (const index of order) {
      if (token !== this.animationToken) return;

      visible[index]?.classList.remove("is-on");
      await wait(delay);
    }
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
