import { encode, applyMove, MOVE_NAMES, INVERSE, solvedState } from "./cube.js";

export class OptimalSolver {
    constructor(url = "./data/optimal_move.bin") {
        this.url = url;
        this.data = null;
        this.loading = null;
    }

    async load() {
        if (this.data) return this;
        if (this.loading) return this.loading;

        this.loading = fetch(this.url).then(async response => {
            if (!response.ok) throw new Error(`Could not load ${this.url}: ${response.status}`);
            this.data = new Uint8Array(await response.arrayBuffer());
            return this;
        });

        return this.loading;
    }

    get3Bit(index) {
        const bit = index * 3;
        const byteIndex = bit >> 3;
        const shift = bit & 7;
        let value = this.data[byteIndex] >> shift;
        if (shift > 5) value |= this.data[byteIndex + 1] << (8 - shift);
        return value & 7;
    }

    getMove(state) {
        if (!this.data) throw new Error("Solver data is not loaded.");
        return this.get3Bit(encode(state.cp, state.co));
    }

    solve(state, maxMoves = 14) {
        const path = [];
        let current = state;

        for (let depth = 0; depth <= maxMoves; ++depth) {
            const value = this.getMove(current);

            if (value === 6) return path;
            if (value >= 6) throw new Error("Invalid optimal-move table value.");

            path.push(value);
            current = applyMove(current, value);
        }

        throw new Error("Optimal solution exceeded expected depth.");
    }
}
