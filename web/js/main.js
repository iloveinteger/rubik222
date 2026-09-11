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

let solverReady =
    false;

/*
 * IMPORTANT:
 *
 * A tap during entrance is not discarded.
 *
 * It becomes a request that is consumed
 * immediately after the entrance transition
 * naturally finishes.
 */
let solveRequested =
    false;

/*
 * Prevent starting two completely separate
 * cube-generation flows.
 *
 * This is NOT used to block solve requests
 * during entrance.
 */
let generationRunning =
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
        generationRunning ||
        !solverReady
    ) {
        return;
    }

    generationRunning =
        true;

    solveRequested =
        false;

    phase =
        "exiting";

    try {
        /*
         * The current solved cube leaves the screen
         * with a random exit rotation.
         */
        await exitCube(
            renderer
        );

        /*
         * Generate the next cube only after the
         * old cube has completely left.
         */
        currentState =
            randomState();

        solution =
            solver.solve(
                currentState
            );

        solutionIndex =
            0;

        /*
         * Build the new cube in its canonical
         * orientation, then entrance animation
         * applies its random whole-cube rotation.
         */
        renderer.rebuild(
            currentState
        );

        phase =
            "entering";

        setStatus(
            `Scrambled · ${solution.length} optimal moves · tap to solve`
        );

        /*
         * Entrance runs independently of the input
         * handler. If the user taps during this await,
         * handleTap() sets solveRequested = true.
         */
        await enterCube(
            renderer
        );

        /*
         * Entrance is now genuinely finished:
         *
         * - spring settled
         * - rotation finished
         * - cube is exactly at the origin
         * - cube rotation is exactly identity
         */
        if (solveRequested) {
            solveRequested =
                false;

            phase =
                "solving";

            await solveCurrentCube();
        } else {
            phase =
                "scrambled";

            setStatus(
                `Scrambled · ${solution.length} optimal moves · tap to solve`
            );
        }
    } catch (error) {
        console.error(error);

        phase =
            "solved";

        solveRequested =
            false;

        setStatus(
            "Failed to generate solution."
        );
    } finally {
        generationRunning =
            false;
    }
}

async function solveCurrentCube() {
    if (
        !solverReady
    ) {
        return;
    }

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

            /*
             * Renderer handles the complete 600 ms
             * face rotation in the same RAF used
             * by the rest of the page.
             */
            await renderer.animateMove(
                move
            );

            /*
             * Apply the logical move only after
             * the visual move has completed.
             */
            currentState =
                applyMove(
                    currentState,
                    move
                );

            /*
             * Rebuild the logical cube.
             *
             * At this point there is no entrance/exit
             * transition, so returning to the canonical
             * whole-cube transform is safe.
             */
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
        console.error(error);

        phase =
            "scrambled";

        setStatus(
            "Failed while solving."
        );
    }
}

async function handleTap() {
    if (
        !solverReady
    ) {
        return;
    }

    /*
     * -------------------------------------------------------
     * Entrance:
     *
     * Do NOT ignore the tap.
     *
     * Just remember that the user wants to solve.
     * The current entrance animation continues naturally.
     * -------------------------------------------------------
     */
    if (
        phase === "entering"
    ) {
        solveRequested =
            true;

        setStatus(
            "Preparing solution…"
        );

        return;
    }

    /*
     * -------------------------------------------------------
     * Normal scrambled cube.
     * -------------------------------------------------------
     */
    if (
        phase === "scrambled"
    ) {
        if (
            generationRunning
        ) {
            return;
        }

        phase =
            "solving";

        await solveCurrentCube();

        return;
    }

    /*
     * -------------------------------------------------------
     * Solved cube:
     *
     * Generate the next cube.
     * -------------------------------------------------------
     */
    if (
        phase === "solved"
    ) {
        await startNewCube();

        return;
    }

    /*
     * During solving/exiting, taps are ignored.
     */
}

window.addEventListener(
    "pointerdown",
    handleTap,
    {
        passive: true
    }
);

loadSolver().catch(error => {
    console.error(error);

    setStatus(
        "Failed to load optimal solver."
    );
});
