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
let solverReady = false;

renderer.rebuild(currentState);

function setStatus(text) {
    status.textContent = text;
}

async function loadSolver() {
    setStatus("Loading optimal solver…");
    await solver.load();
    solverReady = true;
    setStatus("Tap to generate a cube.");
}

async function startNewCube() {
    if (busy || !solverReady) return;

    busy = true;
    phase = "exiting";

    try {
        await exitCube(renderer);

        currentState = randomState();
        solution = solver.solve(currentState);
        solutionIndex = 0;

        // The new cube starts fully outside the viewport.
        renderer.rebuild(currentState);

        phase = "entering";
        setStatus(
            `Scrambled · ${solution.length} optimal moves · tap to solve`
        );

        // Do NOT await this. Entrance and solving may overlap.
        const entrancePromise = enterCube(renderer);

        entrancePromise.then(() => {
            if (phase === "entering") {
                phase = "scrambled";
                setStatus(
                    `Scrambled · ${solution.length} optimal moves · tap to solve`
                );
            }
        }).catch(error => {
            console.error(error);
            if (phase === "entering") {
                phase = "solved";
                setStatus("Failed to enter cube.");
            }
        });

        // Input becomes available immediately. The coverage test is
        // performed in handleTap(), exactly like Android.
        busy = false;
    } catch (error) {
        console.error(error);
        phase = "solved";
        busy = false;
        setStatus("Failed to generate solution.");
    }
}

async function solveCurrentCube() {
    if (!solverReady || phase === "solving") return;

    busy = true;
    phase = "solving";

    try {
        for (; solutionIndex < solution.length; ++solutionIndex) {
            const move = solution[solutionIndex];

            setStatus(
                `${MOVE_NAMES[move]} · ${solutionIndex + 1}/${solution.length}`
            );

            // Face move runs while entrance/rotation can still be active.
            await renderer.animateMove(move);

            currentState = applyMove(currentState, move);

            // Preserve the current whole-cube transform. This is essential:
            // an entrance still in progress must not be reset by rebuild().
            renderer.rebuild(currentState, true);
        }

        phase = "solved";
        busy = false;
        setStatus("Solved · tap for the next cube");
    } catch (error) {
        console.error(error);
        phase = "scrambled";
        busy = false;
        setStatus("Failed while solving.");
    }
}

async function handleTap() {
    if (!solverReady) return;

    if (phase === "solved") {
        if (!busy) {
            await startNewCube();
        }
        return;
    }

    if (phase === "entering") {
        // Android behavior: no queued request. If the cube is within
        // the central coverage, start the first move immediately.
        if (renderer.canStartSolve()) {
            await solveCurrentCube();
        }
        return;
    }

    if (phase === "scrambled") {
        await solveCurrentCube();
    }
}

window.addEventListener(
    "pointerdown",
    handleTap,
    { passive: true }
);

loadSolver().catch(error => {
    console.error(error);
    solverReady = false;
    setStatus("Failed to load optimal_move.bin");
});
