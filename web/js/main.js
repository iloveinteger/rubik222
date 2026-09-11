import {
    randomState,
    solvedState,
    MOVE_NAMES,
    applyMove
} from "./cube.js";

import {
    OptimalSolver
} from "./solver.js";

import {
    CubeRenderer
} from "./renderer.js";

import {
    enterCube,
    exitCube
} from "./animation.js";

const container =
    document.querySelector(
        "#cube-container"
    );

const status =
    document.querySelector(
        "#status"
    );

const renderer =
    new CubeRenderer(
        container
    );

const solver =
    new OptimalSolver(
        "./data/optimal_move.bin"
    );

let currentState =
    solvedState();

let phase =
    "solved";

let solution =
    [];

let solutionIndex =
    0;

let busy =
    false;

let solverReady =
    false;

renderer.rebuild(
    currentState
);

function setStatus(text) {
    status.textContent =
        text;
}

async function loadSolver() {
    setStatus(
        "Loading optimal solver…"
    );

    await solver.load();

    solverReady =
        true;

    setStatus(
        "Tap to generate a cube."
    );
}

async function startNewCube() {
    if (
        busy ||
        !solverReady
    ) {
        return;
    }

    busy =
        true;

    phase =
        "transition";

    try {
        /*
         * Old solved cube exits first.
         */
        await exitCube(
            renderer
        );

        /*
         * Scramble is not animated.
         */
        currentState =
            randomState();

        renderer.rebuild(
            currentState
        );

        /*
         * Solver data is already loaded,
         * but keeping load() here preserves
         * the original safety behavior.
         */
        await solver.load();

        solution =
            solver.solve(
                currentState
            );

        solutionIndex =
            0;

        /*
         * New scrambled cube enters
         * with the spring-damper motion.
         */
        await enterCube(
            renderer
        );

        phase =
            "scrambled";

        setStatus(
            `Scrambled · ${solution.length} optimal moves · tap to solve`
        );

    } catch (error) {
        console.error(
            error
        );

        phase =
            "solved";

        setStatus(
            "Failed to generate solution."
        );

    } finally {
        busy =
            false;
    }
}

async function solveCurrentCube() {
    if (
        busy ||
        !solverReady
    ) {
        return;
    }

    busy =
        true;

    phase =
        "solving";

    try {
        for (
            ;
            solutionIndex <
                solution.length;
            ++solutionIndex
        ) {
            const move =
                solution[
                    solutionIndex
                ];

            setStatus(
                `${MOVE_NAMES[move]} · ${solutionIndex + 1}/${solution.length}`
            );

            await renderer.animateMove(
                move
            );

            currentState =
                applyMove(
                    currentState,
                    move
                );

            renderer.rebuild(
                currentState
            );
        }

        phase =
            "solved";

        setStatus(
            "Solved · tap for the next cube"
        );

    } catch (error) {
        console.error(
            error
        );

        phase =
            "scrambled";

        setStatus(
            "Failed while solving."
        );

    } finally {
        busy =
            false;
    }
}

async function handleTap() {
    if (
        busy ||
        !solverReady
    ) {
        return;
    }

    if (
        phase === "solved"
    ) {
        await startNewCube();

    } else if (
        phase === "scrambled"
    ) {
        await solveCurrentCube();
    }
}

window.addEventListener(
    "pointerdown",
    handleTap,
    {
        passive: true
    }
);

loadSolver()
    .catch(error => {
        console.error(
            error
        );

        solverReady =
            false;

        setStatus(
            "Failed to load optimal_move.bin"
        );
    });
