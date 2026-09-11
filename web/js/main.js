import { randomState, solvedState, MOVE_NAMES, applyMove } from "./cube.js";
import { OptimalSolver } from "./solver.js";
import { CubeRenderer } from "./renderer.js";
import { enterCube, exitCube } from "./animation.js";

const container = document.querySelector("#cube-container");
const status = document.querySelector("#status");

const renderer = new CubeRenderer(container);
const solver = new OptimalSolver("./data/optimal_move.bin");

let currentState = solvedState();
let phase = "solved";
let solution = [];
let solutionIndex = 0;
let busy = false;

renderer.rebuild(currentState);

async function loadSolver() {
    status.textContent = "Loading optimal solver…";
    await solver.load();
    status.textContent = "Tap / click to generate a cube.";
}

function setStatus(text) {
    status.textContent = text;
}

async function startNewCube() {
    if (busy) return;
    busy = true;
    phase = "transition";

    // The old solved cube leaves through the bottom.
    await exitCube(renderer);

    // Scramble is deliberately NOT animated.
    currentState = randomState();
    renderer.rebuild(currentState);

    solution = solver.solve(currentState);
    solutionIndex = 0;

    // The new scrambled cube falls in from above and settles at the center.
    await enterCube(renderer);

    phase = "scrambled";
    busy = false;
    setStatus(`Scrambled · ${solution.length} optimal moves · tap to solve`);
}

async function solveCurrentCube() {
    if (busy) return;
    busy = true;
    phase = "solving";

    for (; solutionIndex < solution.length; ++solutionIndex) {
        const move = solution[solutionIndex];
        setStatus(`${MOVE_NAMES[move]} · ${solutionIndex + 1}/${solution.length}`);
        await renderer.animateMove(move, 360);
        currentState = applyMove(currentState, move);
        renderer.rebuild(currentState);
    }

    phase = "solved";
    busy = false;
    setStatus("Solved · tap for the next cube");
}

async function handleTap() {
    if (busy) return;

    if (phase === "solved") {
        await startNewCube();
    } else if (phase === "scrambled") {
        await solveCurrentCube();
    }
}

window.addEventListener("pointerdown", handleTap, { passive: true });

loadSolver().catch(error => {
    console.error(error);
    setStatus("Failed to load optimal_move.bin");
});
