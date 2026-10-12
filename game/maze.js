/*
  Labyrint-generator for «Labyrint» og «Ball gjennom labyrint».
  Lager en perfekt labyrint (nøyaktig én vei mellom to ruter) med «recursive backtracker».
  Vegger per rute som bitmaske: N=1, Ø=2, S=4, V=8. Start øverst til venstre, mål nederst til høyre.
*/

const { shuffle } = require("./util");

const DIRS = {
  up: { bit: 1, dx: 0, dy: -1, back: 4 },
  right: { bit: 2, dx: 1, dy: 0, back: 8 },
  down: { bit: 4, dx: 0, dy: 1, back: 1 },
  left: { bit: 8, dx: -1, dy: 0, back: 2 }
};

function generate(w, h) {
  const walls = new Array(w * h).fill(15);
  const seen = new Array(w * h).fill(false);
  const stack = [[0, 0]];
  seen[0] = true;
  while (stack.length) {
    const [x, y] = stack[stack.length - 1];
    const next = shuffle(Object.values(DIRS)).find(d => {
      const nx = x + d.dx, ny = y + d.dy;
      return nx >= 0 && ny >= 0 && nx < w && ny < h && !seen[ny * w + nx];
    });
    if (!next) {
      stack.pop();
      continue;
    }
    const nx = x + next.dx, ny = y + next.dy;
    walls[y * w + x] &= ~next.bit;
    walls[ny * w + nx] &= ~next.back;
    seen[ny * w + nx] = true;
    stack.push([nx, ny]);
  }
  const maze = { w, h, walls, goal: { x: w - 1, y: h - 1 } };
  maze.dist = distances(maze);
  return maze;
}

// Antall steg fra hver rute til målet
function distances(maze) {
  const { w, h, walls, goal } = maze;
  const dist = new Array(w * h).fill(Infinity);
  const queue = [[goal.x, goal.y]];
  dist[goal.y * w + goal.x] = 0;
  while (queue.length) {
    const [x, y] = queue.shift();
    Object.values(DIRS).forEach(d => {
      if (walls[y * w + x] & d.bit) return;
      const nx = x + d.dx, ny = y + d.dy;
      if (dist[ny * w + nx] !== Infinity) return;
      dist[ny * w + nx] = dist[y * w + x] + 1;
      queue.push([nx, ny]);
    });
  }
  return dist;
}

function canMove(maze, x, y, dir) {
  const d = DIRS[dir];
  return !!d && !(maze.walls[y * maze.w + x] & d.bit);
}

// Andel av veien som er gått (0–1) fra start til mål
function progress(maze, x, y) {
  const start = maze.dist[0];
  return start ? 1 - maze.dist[y * maze.w + x] / start : 1;
}

/*
  Rutenett med fliser (1 = vegg) for ballspillet: (2w+1) × (2h+1).
  Rute (x, y) ligger i flis (2x+1, 2y+1).
*/
function toTiles(maze) {
  const W = maze.w * 2 + 1, H = maze.h * 2 + 1;
  const tiles = new Array(W * H).fill(1);
  for (let y = 0; y < maze.h; y++) {
    for (let x = 0; x < maze.w; x++) {
      const tx = 2 * x + 1, ty = 2 * y + 1;
      const wall = maze.walls[y * maze.w + x];
      tiles[ty * W + tx] = 0;
      if (!(wall & 2)) tiles[ty * W + tx + 1] = 0;
      if (!(wall & 4)) tiles[(ty + 1) * W + tx] = 0;
    }
  }
  return { W, H, tiles };
}

module.exports = { DIRS, generate, canMove, progress, toTiles };
