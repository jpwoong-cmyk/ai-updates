const PATTERN = [
  "000001110000",
  "000011111000",
  "000111111100",
  "001110001110",
  "011100000111",
  "011001110011",
  "111001110011",
  "111000000011",
  "111000110011",
  "011100111110",
  "001111111100",
  "000111011000",
  "000010001000"
];

function shuffledIndexes(length) {
  const indexes = Array.from({ length }, (_, index) => index);

  return indexes.sort((a, b) => {
    const width = PATTERN[0].length;
    const ax = a % width;
    const ay = Math.floor(a / width);
    const bx = b % width;
    const by = Math.floor(b / width);

    const cx = (width - 1) / 2;
    const cy = (PATTERN.length - 1) / 2;

    const ad = Math.hypot(ax - cx, ay - cy) + Math.random() * 2.1;
    const bd = Math.hypot(bx - cx, by - cy) + Math.random() * 2.1;

    return ad - bd;
  });
}

export class PixelRebuild {
  constructor(grid, { buildDurationMs = 1700, disassembleDurationMs = 320 } = {}) {
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
    this.cells = [];
    this.activeCells = [];

    PATTERN.forEach((row, y) => {
      [...row].forEach((value) => {
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
    const delay = Math.max(8, this.buildDurationMs / Math.max(1, order.length));

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
