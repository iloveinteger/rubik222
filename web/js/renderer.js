
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js";
import { affectedPositions } from "./cube.js";

const CORNERS = [
    [ 1, 1, 1], // 0 URF
    [-1, 1, 1], // 1 UFL
    [-1, 1,-1], // 2 ULB
    [ 1, 1,-1], // 3 UBR
    [ 1,-1, 1], // 4 DFR
    [-1,-1, 1], // 5 DLF
    [-1,-1,-1], // 6 DBL
    [ 1,-1,-1], // 7 DRB
];

/*
 * IMPORTANT:
 *
 * The order of the three directions is not simply
 *
 *     [U/D, R/L, F/B]
 *
 * for every corner.
 *
 * It must follow the Kociemba corner order:
 *
 *     URF = U R F
 *     UFL = U F L
 *     ULB = U L B
 *     UBR = U B R
 *     DFR = D F R
 *     DLF = D L F
 *     DBL = D B L
 *     DRB = D R B
 *
 * With this ordering, Kociemba co=1/co=2 corresponds
 * exactly to cyclically shifting these three directions.
 */
const FACE_DIRS = [
    // URF
    [
        [ 0, 1, 0], // U
        [ 1, 0, 0], // R
        [ 0, 0, 1], // F
    ],

    // UFL
    [
        [ 0, 1, 0], // U
        [ 0, 0, 1], // F
        [-1, 0, 0], // L
    ],

    // ULB
    [
        [ 0, 1, 0], // U
        [-1, 0, 0], // L
        [ 0, 0,-1], // B
    ],

    // UBR
    [
        [ 0, 1, 0], // U
        [ 0, 0,-1], // B
        [ 1, 0, 0], // R
    ],

    // DFR
    [
        [ 0,-1, 0], // D
        [ 0, 0, 1], // F
        [ 1, 0, 0], // R
    ],

    // DLF
    [
        [ 0,-1, 0], // D
        [-1, 0, 0], // L
        [ 0, 0, 1], // F
    ],

    // DBL
    [
        [ 0,-1, 0], // D
        [ 0, 0,-1], // B
        [-1, 0, 0], // L
    ],

    // DRB
    [
        [ 0,-1, 0], // D
        [ 1, 0, 0], // R
        [ 0, 0,-1], // B
    ],
];

const FACE_COLOR = {
    U: 0xf4f4f4,
    D: 0xf2cf35,
    R: 0xd93b32,
    L: 0xf08a35,
    F: 0x35a853,
    B: 0x3c6dcc,
};

function faceName(normal) {
    const [x, y, z] = normal;

    if (y > 0) return "U";
    if (y < 0) return "D";
    if (x > 0) return "R";
    if (x < 0) return "L";
    if (z > 0) return "F";
    return "B";
}

function stickerRotation(normal) {
    const [x, y, z] = normal;

    if (z > 0) return [0, 0, 0];
    if (z < 0) return [0, Math.PI, 0];

    if (x > 0) return [0, Math.PI / 2, 0];
    if (x < 0) return [0, -Math.PI / 2, 0];

    if (y > 0) return [-Math.PI / 2, 0, 0];

    return [Math.PI / 2, 0, 0];
}

function stickerMaterial(face) {
    return new THREE.MeshBasicMaterial({
        color: FACE_COLOR[face],
        side: THREE.DoubleSide,
    });
}

/*
 * Return the three original sticker colors of a cubie.
 *
 * identity 0 = URF -> [U, R, F]
 * identity 1 = UFL -> [U, F, L]
 * ...
 */
function identityColors(identity) {
    return FACE_DIRS[identity].map(faceName);
}

function makeCubie(identity) {
    const group = new THREE.Group();

    group.userData.identity = identity;

    const body = new THREE.Mesh(
        new THREE.BoxGeometry(0.96, 0.96, 0.96),
        new THREE.MeshStandardMaterial({
            color: 0x111111,
            roughness: 0.72,
            metalness: 0.04,
        })
    );

    group.add(body);

    return group;
}

export class CubeRenderer {
    constructor(container) {
        this.container = container;

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x111111);

        this.camera = new THREE.OrthographicCamera(
            -4,
            4,
            4,
            -4,
            0.1,
            100
        );

        this.camera.position.set(6, 6, 6);
        this.camera.lookAt(0, 0, 0);

        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: false,
        });

        this.renderer.setPixelRatio(
            Math.min(window.devicePixelRatio, 2)
        );

        this.renderer.setSize(
            container.clientWidth,
            container.clientHeight
        );

        this.renderer.outputColorSpace =
            THREE.SRGBColorSpace;

        container.appendChild(
            this.renderer.domElement
        );

        this.cubeRoot = new THREE.Group();
        this.scene.add(this.cubeRoot);

        /*
         * One persistent Three.js object for each physical
         * corner identity.
         */
        this.cubies = Array.from(
            { length: 8 },
            (_, identity) => {
                const cubie = makeCubie(identity);
                this.cubeRoot.add(cubie);
                return cubie;
            }
        );

        this.light = new THREE.HemisphereLight(
            0xffffff,
            0x555555,
            2.1
        );

        this.scene.add(this.light);

        this.keyLight = new THREE.DirectionalLight(
            0xffffff,
            2.2
        );

        this.keyLight.position.set(5, 8, 6);
        this.scene.add(this.keyLight);

        this.pivot = null;
        this.moving = null;

        this.resizeObserver =
            new ResizeObserver(() => {
                this.resize();
            });

        this.resizeObserver.observe(container);

        this.resize();

        this.state = null;

        this.renderLoop =
            this.renderLoop.bind(this);

        requestAnimationFrame(
            this.renderLoop
        );
    }

    resize() {
        const width = Math.max(
            1,
            this.container.clientWidth
        );

        const height = Math.max(
            1,
            this.container.clientHeight
        );

        const aspect = width / height;
        const size = 4.5;

        this.camera.left =
            -size * aspect;

        this.camera.right =
            size * aspect;

        this.camera.top = size;
        this.camera.bottom = -size;

        this.camera.updateProjectionMatrix();

        this.renderer.setSize(
            width,
            height,
            false
        );
    }

    renderLoop() {
        this.renderer.render(
            this.scene,
            this.camera
        );

        requestAnimationFrame(
            this.renderLoop
        );
    }

    setWholeCubeTransform(position, quaternion) {
        this.cubeRoot.position.copy(position);
        this.cubeRoot.quaternion.copy(quaternion);
    }

    resetWholeCubeTransform() {
        this.cubeRoot.position.set(0, 0, 0);
        this.cubeRoot.rotation.set(0, 0, 0);
    }

    rebuild(state) {
        this.state = state;

        this.resetWholeCubeTransform();

        for (let slot = 0; slot < 8; ++slot) {
            /*
             * cp[slot] tells us which physical cubie is
             * currently occupying this position.
             */
            const identity = state.cp[slot];
            const co = state.co[slot];

            const cubie =
                this.cubies[identity];

            /*
             * Position comes from CURRENT SLOT.
             */
            cubie.position.set(
                CORNERS[slot][0] * 0.51,
                CORNERS[slot][1] * 0.51,
                CORNERS[slot][2] * 0.51
            );

            /*
             * We don't rotate the cubie object itself.
             * Sticker positions represent its orientation.
             */
            cubie.rotation.set(0, 0, 0);

            cubie.userData.slot = slot;
            cubie.userData.orientation = co;

            /*
             * Remove old stickers.
             * Child 0 is the black body.
             */
            while (cubie.children.length > 1) {
                cubie.remove(
                    cubie.children[1]
                );
            }

            /*
             * Original sticker colors belong to
             * the cubie's identity.
             */
            const colors =
                identityColors(identity);

            /*
             * Target directions belong to
             * the current slot.
             */
            const dirs =
                FACE_DIRS[slot];

            /*
             * Kociemba corner orientation:
             *
             * co = 0:
             *     original 0 -> target 0
             *     original 1 -> target 1
             *     original 2 -> target 2
             *
             * co = 1:
             *     original 0 -> target 1
             *     original 1 -> target 2
             *     original 2 -> target 0
             *
             * co = 2:
             *     original 0 -> target 2
             *     original 1 -> target 0
             *     original 2 -> target 1
             */
            for (let original = 0;
                 original < 3;
                 ++original) {

                const target =
                    (original + co) % 3;

                const normal =
                    dirs[target];

                const face =
                    colors[original];

                const sticker =
                    new THREE.Mesh(
                        new THREE.PlaneGeometry(
                            0.78,
                            0.78
                        ),
                        stickerMaterial(face)
                    );

                sticker.position.set(
                    normal[0] * 0.486,
                    normal[1] * 0.486,
                    normal[2] * 0.486
                );

                const [
                    rx,
                    ry,
                    rz
                ] = stickerRotation(normal);

                sticker.rotation.set(
                    rx,
                    ry,
                    rz
                );

                cubie.add(sticker);
            }
        }
    }

    beginMove(move) {
        if (this.pivot) {
            throw new Error(
                "Animation already running."
            );
        }

        const pivot =
            new THREE.Group();

        this.cubeRoot.add(pivot);

        this.pivot = pivot;

        const affected =
            affectedPositions(move);

        /*
         * Select cubies using the CURRENT logical
         * positions before the physical animation.
         */
        this.moving = affected.map(slot => {
            const identity =
                this.state.cp[slot];

            const cubie =
                this.cubies[identity];

            pivot.attach(cubie);

            return cubie;
        });
    }

    animateMove(move, duration = 360) {
        this.beginMove(move);

        /*
         * These signs are matched directly against
         * MOVE_CP in cube.js.
         *
         * R:
         *     URF -> UBR
         *     UBR -> DRB
         *     ...
         *
         * U:
         *     URF -> UFL
         *     ...
         *
         * F:
         *     URF -> DFR
         */
        let angle;

        switch (move) {
            case 0: // R
                angle = -Math.PI / 2;
                break;

            case 1: // R'
                angle = Math.PI / 2;
                break;

            case 2: // U
                angle = -Math.PI / 2;
                break;

            case 3: // U'
                angle = Math.PI / 2;
                break;

            case 4: // F
                angle = -Math.PI / 2;
                break;

            case 5: // F'
                angle = Math.PI / 2;
                break;

            default:
                throw new Error(
                    `Invalid move: ${move}`
                );
        }

        let axis;

        if (move <= 1) {
            axis =
                new THREE.Vector3(
                    1,
                    0,
                    0
                );
        } else if (move <= 3) {
            axis =
                new THREE.Vector3(
                    0,
                    1,
                    0
                );
        } else {
            axis =
                new THREE.Vector3(
                    0,
                    0,
                    1
                );
        }

        const start =
            performance.now();

        return new Promise(resolve => {
            const frame = now => {
                const t =
                    Math.min(
                        1,
                        (now - start) /
                            duration
                    );

                /*
                 * Smoothstep easing.
                 */
                const eased =
                    t * t * (3 - 2 * t);

                this.pivot
                    .setRotationFromAxisAngle(
                        axis,
                        angle * eased
                    );

                if (t < 1) {
                    requestAnimationFrame(
                        frame
                    );

                    return;
                }

                /*
                 * Finish exactly at the
                 * target angle.
                 */
                this.pivot
                    .setRotationFromAxisAngle(
                        axis,
                        angle
                    );

                this.pivot.updateMatrixWorld(
                    true
                );

                /*
                 * Return cubies to cubeRoot.
                 * main.js immediately calls rebuild()
                 * with the new logical state.
                 */
                for (const cubie of this.moving) {
                    this.cubeRoot.attach(
                        cubie
                    );
                }

                this.cubeRoot.remove(
                    this.pivot
                );

                this.pivot = null;
                this.moving = null;

                resolve();
            };

            requestAnimationFrame(frame);
        });
    }
}

export { THREE };