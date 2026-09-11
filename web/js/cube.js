// Logical 2x2x2 cube engine.
// Must stay bit-for-bit compatible with precompute/main.cpp.

export const STATE_COUNT = 88179840;
export const ORI_COUNT = 2187;
export const PERM_COUNT = 40320;

export const Move = Object.freeze({ R: 0, RP: 1, U: 2, UP: 3, F: 4, FP: 5 });
export const MOVE_NAMES = ["R", "R'", "U", "U'", "F", "F'"];
export const INVERSE = [1, 0, 3, 2, 5, 4];

const FACT = [1, 1, 2, 6, 24, 120, 720, 5040, 40320];

// Kociemba corner order:
// URF UFL ULB UBR DFR DLF DBL DRB
const MOVE_CP = [
    [4,1,2,0,7,5,6,3], // R
    [3,1,2,7,0,5,6,4], // R'
    [3,0,1,2,4,5,6,7], // U
    [1,2,3,0,4,5,6,7], // U'
    [1,5,2,3,0,4,6,7], // F
    [4,0,2,3,5,1,6,7], // F'
];

const MOVE_CO = [
    [2,0,0,1,1,0,0,2],
    [1,0,0,2,2,0,0,1],
    [0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0],
    [1,2,0,0,2,1,0,0],
    [2,1,0,0,1,2,0,0],
];

export function permRank(p) {
    let rank = 0;
    for (let i = 0; i < 8; ++i) {
        let smaller = 0;
        for (let j = i + 1; j < 8; ++j) {
            if (p[j] < p[i]) ++smaller;
        }
        rank += smaller * FACT[7 - i];
    }
    return rank;
}

export function oriRank(o) {
    let rank = 0;
    for (let i = 0; i < 7; ++i) rank = rank * 3 + o[i];
    return rank;
}

export function encode(cp, co) {
    return permRank(cp) * ORI_COUNT + oriRank(co);
}

export function solvedState() {
    return {
        cp: [0,1,2,3,4,5,6,7],
        co: [0,0,0,0,0,0,0,0],
    };
}

export function applyMove(state, move) {
    const cp = new Array(8);
    const co = new Array(8);
    const mcp = MOVE_CP[move];
    const mco = MOVE_CO[move];

    for (let i = 0; i < 8; ++i) {
        const old = mcp[i];
        cp[i] = state.cp[old];
        co[i] = (state.co[old] + mco[i]) % 3;
    }

    return { cp, co };
}

export function stateIdAfterMove(id, move) {
    const p = Math.floor(id / ORI_COUNT);
    const o = id - p * ORI_COUNT;
    // This intentionally decodes only the two compact coordinates.
    // For the UI solution path, the full state is kept separately.
    const cp = permUnrank(p);
    const co = oriUnrank(o);
    return encode(...Object.values(applyMove({cp, co}, move)));
}

export function permUnrank(rank) {
    const result = new Array(8);
    const available = [0,1,2,3,4,5,6,7];

    for (let i = 0; i < 8; ++i) {
        const f = FACT[7 - i];
        const index = Math.floor(rank / f);
        rank %= f;
        result[i] = available[index];
        available.splice(index, 1);
    }
    return result;
}

export function oriUnrank(rank) {
    const result = new Array(8).fill(0);
    let sum = 0;

    for (let i = 6; i >= 0; --i) {
        result[i] = rank % 3;
        rank = Math.floor(rank / 3);
        sum += result[i];
    }
    result[7] = (3 - (sum % 3)) % 3;
    return result;
}

export function randomState(rng = Math.random) {
    const cp = [0,1,2,3,4,5,6,7];
    for (let i = 7; i > 0; --i) {
        const j = Math.floor(rng() * (i + 1));
        [cp[i], cp[j]] = [cp[j], cp[i]];
    }

    const co = new Array(8).fill(0);
    let sum = 0;
    for (let i = 0; i < 7; ++i) {
        co[i] = Math.floor(rng() * 3);
        sum += co[i];
    }
    co[7] = (3 - sum % 3) % 3;

    return { cp, co };
}

export function affectedPositions(move) {
    if (move === Move.R || move === Move.RP) return [0,3,4,7];
    if (move === Move.U || move === Move.UP) return [0,1,2,3];
    return [0,1,4,5];
}

export function isSolvedIdValue(value) {
    return value === 6;
}

export function verifyMoveTables() {
    const s = solvedState();
    for (let m = 0; m < 6; ++m) {
        let x = s;
        for (let k = 0; k < 4; ++k) x = applyMove(x, m);
        if (encode(x.cp, x.co) !== 0) return false;
    }
    return true;
}
