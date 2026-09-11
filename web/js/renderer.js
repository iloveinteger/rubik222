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
 * Kociemba corner face order.
 *
 * URF = U R F
 * UFL = U F L
 * ULB = U L B
 * UBR = U B R
 * DFR = D F R
 * DLF = D L F
 * DBL = D B L
 * DRB = D R B
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
    U: 0xf7f7f7,
    D: 0xf2cf35,
    R: 0xd83b32,
    L: 0xef8734,
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

/*
 * PlaneGeometry faces the +Z direction by default.
 * Rotate it so the sticker lies flush with the corresponding cube face.
 */
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
    return new THREE.MeshStandardMaterial({
        color: FACE_COLOR[face],
        roughness: 0.48,
        metalness: 0.0,
        side: THREE.DoubleSide,
    });
}

function identityColors(identity) {
    return FACE_DIRS[identity].map(faceName);
}

function makeCubie(identity) {
    const group = new THREE.Group();

    group.userData.identity = identity;

    /*
     * Slightly smaller than the spacing between cubies.
     * This produces clean black seams without excessive gaps.
     */
    const bodyGeometry = new THREE.BoxGeometry(
        0.96,
        0.96,
        0.96
    );

    const bodyMaterial =
        new THREE.MeshStandardMaterial({
            color: 0x101010,
            roughness: 0.68,
            metalness: 0.02,
        });

    const body = new THREE.Mesh(
        bodyGeometry,
        bodyMaterial
    );

    group.add(body);

    return group;
}

export class CubeRenderer {
    constructor(container) {
        this.container = container;

        /* ---------------------------------------------------------
         * Scene
         * --------------------------------------------------------- */

        this.scene = new THREE.Scene();

        this.scene.background =
            new THREE.Color(0x0b0b0b);

        /* ---------------------------------------------------------
         * Camera
         * --------------------------------------------------------- */

        this.camera =
            new THREE.OrthographicCamera(
                -4,
                4,
                4,
                -4,
                0.1,
                100
            );

        this.camera.position.set(
            6,
            6,
            6
        );

        this.camera.lookAt(
            0,
            0,
            0
        );

        /* ---------------------------------------------------------
         * Renderer
         * --------------------------------------------------------- */

        this.renderer =
            new THREE.WebGLRenderer({
                antialias: true,
                alpha: false,
                powerPreference: "high-performance",
            });

        /*
         * 2x is a good quality/performance ceiling for this scene.
         * Higher values are usually unnecessary and expensive on mobile.
         */
        this.renderer.setPixelRatio(
            Math.min(
                window.devicePixelRatio || 1,
                2
            )
        );

        this.renderer.setSize(
            Math.max(1, container.clientWidth),
            Math.max(1, container.clientHeight),
            false
        );

        /*
         * Modern color pipeline.
         */
        this.renderer.outputColorSpace =
            THREE.SRGBColorSpace;

        /*
         * Filmic tone mapping makes the StandardMaterial lighting
         * look less harsh and more photographic.
         */
        this.renderer.toneMapping =
            THREE.ACESFilmicToneMapping;

        this.renderer.toneMappingExposure = 1.0;

        container.appendChild(
            this.renderer.domElement
        );

        /* ---------------------------------------------------------
         * Cube root
         * --------------------------------------------------------- */

        this.cubeRoot =
            new THREE.Group();

        this.scene.add(
            this.cubeRoot
        );

        /* ---------------------------------------------------------
         * Persistent cubies
         * --------------------------------------------------------- */

        this.cubies = Array.from(
            { length: 8 },
            (_, identity) => {
                const cubie =
                    makeCubie(identity);

                this.cubeRoot.add(
                    cubie
                );

                return cubie;
            }
        );

        /* ---------------------------------------------------------
         * Lighting
         * --------------------------------------------------------- */

        /*
         * Soft global fill.
         */
        this.ambientLight =
            new THREE.HemisphereLight(
                0xffffff,
                0x181818,
                1.65
            );

        this.scene.add(
            this.ambientLight
        );

        /*
         * Main soft-looking directional light.
         */
        this.keyLight =
            new THREE.DirectionalLight(
                0xffffff,
                2.25
            );

        this.keyLight.position.set(
            5,
            8,
            7
        );

        this.scene.add(
            this.keyLight
        );

        /*
         * Gentle secondary fill from the opposite side.
         * This prevents the back/right faces from becoming completely flat.
         */
        this.fillLight =
            new THREE.DirectionalLight(
                0xb8c8ff,
                0.55
            );

        this.fillLight.position.set(
                -5,
                2,
                -4
        );

        this.scene.add(
            this.fillLight
        );

        /* ---------------------------------------------------------
         * Animation state
         * --------------------------------------------------------- */

        this.pivot = null;
        this.moving = null;

        /* ---------------------------------------------------------
         * Resize
         * --------------------------------------------------------- */

        this.resizeObserver =
            new ResizeObserver(() => {
                this.resize();
            });

        this.resizeObserver.observe(
            container
        );

        this.resize();

        /* ---------------------------------------------------------
         * State
         * --------------------------------------------------------- */

        this.state = null;

        /* ---------------------------------------------------------
         * Render loop
         * --------------------------------------------------------- */

        this.renderLoop =
            this.renderLoop.bind(this);

        requestAnimationFrame(
            this.renderLoop
        );
    }

    resize() {
        const width =
            Math.max(
                1,
                this.container.clientWidth
            );

        const height =
            Math.max(
                1,
                this.container.clientHeight
            );

        const aspect =
            width / height;

        /*
         * Keep the cube approximately the same visual size
         * regardless of screen aspect ratio.
         */
        const size = 4.5;

        this.camera.left =
            -size * aspect;

        this.camera.right =
            size * aspect;

        this.camera.top =
            size;

        this.camera.bottom =
            -size;

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

    setWholeCubeTransform(
        position,
        quaternion
    ) {
        this.cubeRoot.position.copy(
            position
        );

        this.cubeRoot.quaternion.copy(
            quaternion
        );
    }

    resetWholeCubeTransform() {
        this.cubeRoot.position.set(
            0,
            0,
            0
        );

        this.cubeRoot.rotation.set(
            0,
            0,
            0
        );
    }

    rebuild(state) {
        this.state = state;

        this.resetWholeCubeTransform();

        for (
            let slot = 0;
            slot < 8;
            ++slot
        ) {
            /*
             * cp[slot] = physical cubie occupying this slot.
             */
            const identity =
                state.cp[slot];

            const co =
                state.co[slot];

            const cubie =
                this.cubies[identity];

            /*
             * Position is determined by the current slot.
             */
            cubie.position.set(
                CORNERS[slot][0] * 0.51,
                CORNERS[slot][1] * 0.51,
                CORNERS[slot][2] * 0.51
            );

            /*
             * Orientation is represented by sticker placement,
             * not by rotating the cubie itself.
             */
            cubie.rotation.set(
                0,
                0,
                0
            );

            cubie.userData.slot =
                slot;

            cubie.userData.orientation =
                co;

            /*
             * Child 0 = black cubie body.
             * Remove all previous stickers.
             */
            while (
                cubie.children.length > 1
            ) {
                cubie.remove(
                    cubie.children[1]
                );
            }

            const colors =
                identityColors(
                    identity
                );

            /*
             * Target face order is determined by the current slot.
             */
            const dirs =
                FACE_DIRS[slot];

            /*
             * Kociemba corner orientation:
             *
             * target = (original + co) mod 3
             */
            for (
                let original = 0;
                original < 3;
                ++original
            ) {
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
                ] = stickerRotation(
                    normal
                );

                sticker.rotation.set(
                    rx,
                    ry,
                    rz
                );

                cubie.add(
                    sticker
                );
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

        this.cubeRoot.add(
            pivot
        );

        this.pivot =
            pivot;

        const affected =
            affectedPositions(
                move
            );

        this.moving =
            affected.map(slot => {
                const identity =
                    this.state.cp[slot];

                const cubie =
                    this.cubies[identity];

                pivot.attach(
                    cubie
                );

                return cubie;
            });
    }

    animateMove(
        move,
        duration = 360
    ) {
        this.beginMove(move);

        /*
         * Physical rotation signs matched to cube.js.
         *
         * Coordinate system:
         *   +X = R
         *   +Y = U
         *   +Z = F
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
                 * Smoothstep gives a soft acceleration and deceleration.
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
                 * Exact final angle.
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
                 * Attach moving cubies back to cubeRoot
                 * while preserving their world transform.
                 */
                for (
                    const cubie
                    of this.moving
                ) {
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

            requestAnimationFrame(
                frame
            );
        });
    }
}

export { THREE };
