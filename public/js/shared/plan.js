// The plan of San Cielo: where its streets run and what's between them.
// Streets run north-south at XS and east-west at ZS (downtown's blocks are
// smaller); each square between them is a block of some kind (see KINDS), or
// nothing at all where the city stops, and a few blocks take up more than one
// square (the park, City Hall's plaza, the rail yard, the container
// terminal). Shared by city.js, which builds the streets and blocks from it,
// and world.js, which flattens the land under them.
//
// x runs east, z runs south (north is -z).

export const XS = [-500, -420, -340, -260, -190, -120, -50, 20, 90, 160, 240, 320, 400, 480];
export const ZS = [-380, -300, -220, -150, -80, -10, 60, 130, 200];
export const CURB = 9;            // from the middle of a street to where its block starts

// north row first, west to east; '.' is no city
const MAP = [
  '.MMmtttPPHH..',
  'BMMMtthPPHHH.',
  'BSStTTTrSHHSg',
  'BSxTTCCTTSkSH',
  'BSSTTTTTSSSHH',
  'BSSFFoFFWWWW.',
  'BBSFfFyyWWvWW',
  '..SFFFFFsWDDD',
];
// blocks bigger than a square: [column, row, columns, rows]
const MERGE = [[7, 0, 2, 2], [5, 3, 2, 1], [6, 6, 2, 1], [10, 7, 3, 1]];

// what each letter is
export const KINDS = {
  M: 'mansions', m: 'estate', B: 'beach', t: 'starlight', T: 'down', C: 'plaza', P: 'park', h: 'hospital', H: 'res', F: 'flats',
  f: 'home', S: 'shops', r: 'strip', x: 'site', k: 'carlot', g: 'gas', o: 'police', W: 'mill', y: 'yard', v: 'freight', s: 'spray', D: 'docks',
};

export const COLS = XS.length - 1, ROWS = ZS.length - 1;

// the blocks: { id, i0, j0, i1, j1 (squares, inclusive), kind }
export const PLAN = [];
const CELL = new Int16Array(COLS * ROWS).fill(-1);
{
  const merged = (i, j) => MERGE.find(([c, r, w, h]) => i >= c && i < c + w && j >= r && j < r + h);
  for (let j = 0; j < ROWS; j++) {
    for (let i = 0; i < COLS; i++) {
      const ch = MAP[j][i];
      if (ch === '.' || CELL[j * COLS + i] >= 0) continue;
      const m = merged(i, j);
      const [i0, j0, w, h] = m || [i, j, 1, 1];
      const b = { id: PLAN.length, i0, j0, i1: i0 + w - 1, j1: j0 + h - 1, kind: KINDS[ch] };
      PLAN.push(b);
      for (let q = j0; q < j0 + h; q++) for (let p = i0; p < i0 + w; p++) CELL[q * COLS + p] = b.id;
    }
  }
}
// the block a square belongs to (-1 for none, or off the plan)
export const cellBlock = (i, j) => (i < 0 || j < 0 || i >= COLS || j >= ROWS ? -1 : CELL[j * COLS + i]);

// the harbour's quay, along the south of town from the Flats to the docks
export const HARBOR = { x0: XS[3] - CURB, x1: XS[COLS] + CURB, z0: ZS[ROWS] + CURB, z1: ZS[ROWS] + 36 };

// The city's own ground: every block's squares out to the far side of the
// streets round it (and their outer sidewalks), and the quay.
export const GROUND = PLAN.map((b) => ({ x0: XS[b.i0] - CURB, x1: XS[b.i1 + 1] + CURB, z0: ZS[b.j0] - CURB, z1: ZS[b.j1 + 1] + CURB }));
GROUND.push({ ...HARBOR });
export const TOWN = {
  x0: Math.min(...GROUND.map((r) => r.x0)), x1: Math.max(...GROUND.map((r) => r.x1)),
  z0: Math.min(...GROUND.map((r) => r.z0)), z1: Math.max(...GROUND.map((r) => r.z1)),
};

// which column / row (x, z) is in (clamped to the plan)
const find = (L, v) => { let k = 0; while (k < L.length - 2 && v >= L[k + 1]) k++; return k; };
export const colAt = (x) => find(XS, x);
export const rowAt = (z) => find(ZS, z);

// is (x, z) on the city's ground (a block, a street, a sidewalk, the quay)?
export function inTown(x, z) {
  if (x < TOWN.x0 || x > TOWN.x1 || z < TOWN.z0 || z > TOWN.z1) return false;
  if (x >= HARBOR.x0 && x <= HARBOR.x1 && z >= HARBOR.z0 && z <= HARBOR.z1) return true;
  const ci = colAt(x), cj = rowAt(z);
  for (let j = cj - 1; j <= cj + 1; j++) {
    for (let i = ci - 1; i <= ci + 1; i++) {
      if (cellBlock(i, j) < 0) continue;
      if (x >= XS[i] - CURB && x <= XS[i + 1] + CURB && z >= ZS[j] - CURB && z <= ZS[j + 1] + CURB) return true;
    }
  }
  return false;
}
