import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js";
import { affectedPositions } from "./cube.js";

const CORNERS = [
    [1, 1, 1],    // 0 URF
    [-1, 1, 1],   // 1 UFL
    [-1, 1, -1],  // 2 ULB
    [1, 1, -1],   // 3 UBR
    [1, -1, 1],   // 4 DFR
    [-1, -1, 1],  // 5 DLF
    [-1, -1, -1], // 6 DBL
    [1, -1, -1],  // 7 DRB
];

const FACE_DIRS = [
    [[0, 1, 0], [1, 0, 0], [0, 0, 1]],
    [[0, 1, 0], [0, 0, 1], [-1, 0, 0]],
    [[0, 1, 0], [-1, 0, 0], [0, 0, -1]],
    [[0, 1, 0], [0, 0, -1], [1, 0, 0]],
    [[0, -1, 0], [0, 0, 1], [1, 0, 0]],
    [[0, -1, 0], [-1, 0, 0], [0, 0, 1]],
    [[0, -1, 0], [0, 0, -1], [-1, 0, 0]],
    [[0, -1, 0], [1, 0, 0], [0, 0, -1]],
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

function stickerRotation(normal) {
    const [x, y, z] = normal;

    if (z > 0) return [0, 0, 0];
    if (z < 0) return [0, Math.PI, 0];
    if (x > 0) return [0, Math.PI / 2, 0];
    if (x < 0) return [0, -Math.PI / 2, 0];
    if (y > 0) return [-Math.PI / 2, 0, 0];

    return [Math.PI / 2, 0, 0];
}

function identityColors(identity) {
    return FACE_DIRS[identity].map(faceName);
}

function createStickerGeometry() {
    return new THREE.PlaneGeometry(
        0.78,
        0.78
    );
}

function createCubieGeometry() {
    return new THREE.BoxGeometry(
        0.96,
        0.96,
        0.96
    );
}

function createStickerMaterials() {
    const materials = {};

    for (const [face, color] of Object.entries(FACE_COLOR)) {
        materials[face] =
            new THREE.MeshBasicMaterial({
                color,
                side: THREE.FrontSide,
            });
    }

    return materials;
}

function createBodyMaterial() {
    return new THREE.MeshBasicMaterial({
        color: 0x101010,
    });
}

function makeCubie(
    identity,
    bodyGeometry,
    bodyMaterial
) {
    const group = new THREE.Group();

    group.userData.identity = identity;

    const body =
        new THREE.Mesh(
            bodyGeometry,
            bodyMaterial
        );

    group.add(body);

    return group;
}

/*
 * Move animation speed cap.
 *
 * The original smootherstep:
 *
 *     p(t) = 6t^5 - 15t^4 + 10t^3
 *
 * has a maximum normalized velocity of 1.875.
 *
 * Here we keep the same basic acceleration/deceleration shape,
 * but cap its velocity and normalize the integral so that:
 *
 *     p(0) = 0
 *     p(1) = 1
 *
 * Therefore the cube still rotates exactly 90 degrees
 * in exactly 600 ms.
 *
 * Lower value = lower maximum speed.
 *
 * Examples:
 *
 *     1.875 = original smootherstep
 *     1.4   = slightly slower peak
 *     1.2   = noticeably slower peak
 *     1.0   = strongly capped
 */
const SPEED_CAP = 1.2;

/*
 * Number of samples used to construct the normalized
 * cumulative velocity curve.
 *
 * This is calculated only once for the current cap,
 * not every animation frame.
 */
const SPEED_SAMPLES = 1024;

function createSpeedProfile(cap) {
    const values = new Float64Array(
        SPEED_SAMPLES + 1
    );

    /*
     * Original smootherstep derivative:
     *
     *     30t²(1-t)²
     *
     * Apply the velocity cap here.
     */
    for (let i = 0; i <= SPEED_SAMPLES; ++i) {
        const t =
            i / SPEED_SAMPLES;

        const raw =
            30 *
            t *
            t *
            (1 - t) *
            (1 - t);

        values[i] =
            Math.min(raw, cap);
    }

    /*
     * Integrate the velocity using the trapezoidal rule.
     *
     * cumulative[i] represents the distance travelled
     * from t = 0 to t = i / SPEED_SAMPLES.
     */
    const cumulative =
        new Float64Array(
            SPEED_SAMPLES + 1
        );

    const dt =
        1 / SPEED_SAMPLES;

    for (let i = 1; i <= SPEED_SAMPLES; ++i) {
        cumulative[i] =
            cumulative[i - 1] +
            (values[i - 1] + values[i]) *
            0.5 *
            dt;
    }

    /*
     * Normalize the total distance to exactly 1.
     */
    const total =
        cumulative[SPEED_SAMPLES];

    for (let i = 0; i <= SPEED_SAMPLES; ++i) {
        cumulative[i] /= total;
    }

    return cumulative;
}

const MOVE_SPEED_PROFILE =
    createSpeedProfile(SPEED_CAP);

function cappedEasing(t) {
    if (t <= 0) {
        return 0;
    }

    if (t >= 1) {
        return 1;
    }

    const position =
        t * SPEED_SAMPLES;

    const index =
        Math.floor(position);

    const fraction =
        position - index;

    const a =
        MOVE_SPEED_PROFILE[index];

    const b =
        MOVE_SPEED_PROFILE[index + 1];

    return (
        a +
        (b - a) * fraction
    );
}

export class CubeRenderer {
    constructor(container) {
        this.container = container;

        this.scene = new THREE.Scene();

        this.scene.background =
            new THREE.Color(0x0b0b0b);

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

        this.renderer =
            new THREE.WebGLRenderer({
                antialias: true,
                alpha: false,
                powerPreference: "high-performance",
                preserveDrawingBuffer: false,
            });

        this.renderer.outputColorSpace =
            THREE.SRGBColorSpace;

        this.renderer.shadowMap.enabled =
            false;

        this.renderer.setPixelRatio(
            Math.min(
                window.devicePixelRatio || 1,
                3
            )
        );

        this.renderer.setSize(
            Math.max(
                1,
                container.clientWidth
            ),
            Math.max(
                1,
                container.clientHeight
            ),
            false
        );

        container.appendChild(
            this.renderer.domElement
        );

        this.cubeRoot =
            new THREE.Group();

        this.scene.add(
            this.cubeRoot
        );

        this.stickerGeometry =
            createStickerGeometry();

        this.bodyGeometry =
            createCubieGeometry();

        this.stickerMaterials =
            createStickerMaterials();

        this.bodyMaterial =
            createBodyMaterial();

        this.cubies =
            Array.from(
                { length: 8 },
                (_, identity) => {
                    const cubie =
                        makeCubie(
                            identity,
                            this.bodyGeometry,
                            this.bodyMaterial
                        );

                    this.cubeRoot.add(
                        cubie
                    );

                    return cubie;
                }
            );

        /*
         * Animation state.
         *
         * animateMove() does not create its own
         * requestAnimationFrame loop.
         *
         * The single render loop updates animation
         * and then renders the scene.
         */
        this.animation = null;

        this.resizeObserver =
            new ResizeObserver(() => {
                this.resize();
            });

        this.resizeObserver.observe(
            container
        );

        this.resize();

        this.state = null;

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

        this.renderer.setPixelRatio(
            Math.min(
                window.devicePixelRatio || 1,
                3
            )
        );

        this.renderer.setSize(
            width,
            height,
            false
        );
    }

    renderLoop(now) {
        this.updateAnimation(now);

        this.renderer.render(
            this.scene,
            this.camera
        );

        requestAnimationFrame(
            this.renderLoop
        );
    }

    updateAnimation(now) {
        const animation =
            this.animation;

        if (!animation) {
            return;
        }

        const elapsed =
            now - animation.startTime;

        const t =
            Math.min(
                1,
                elapsed / animation.duration
            );

        /*
         * Capped velocity profile.
         *
         * Unlike simply applying min() to the old
         * position function, this caps VELOCITY
         * and then integrates it.
         *
         * The result is normalized to [0, 1],
         * so the final angle is still exact.
         */
        const eased =
            cappedEasing(t);

        animation.pivot
            .setRotationFromAxisAngle(
                animation.axis,
                animation.angle * eased
            );

        if (t < 1) {
            return;
        }

        /*
         * Exact final rotation.
         */
        animation.pivot
            .setRotationFromAxisAngle(
                animation.axis,
                animation.angle
            );

        /*
         * Update matrices before transferring
         * the cubies back to cubeRoot.
         */
        this.cubeRoot
            .updateMatrixWorld(true);

        animation.pivot
            .updateMatrixWorld(true);

        for (const cubie of animation.moving) {
            this.cubeRoot.attach(
                cubie
            );
        }

        this.cubeRoot.remove(
            animation.pivot
        );

        const resolve =
            animation.resolve;

        this.animation = null;

        resolve();
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

        for (let slot = 0; slot < 8; ++slot) {
            const identity =
                state.cp[slot];

            const co =
                state.co[slot];

            const cubie =
                this.cubies[identity];

            cubie.position.set(
                CORNERS[slot][0] * 0.51,
                CORNERS[slot][1] * 0.51,
                CORNERS[slot][2] * 0.51
            );

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
             * Keep body, remove only stickers.
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

            const dirs =
                FACE_DIRS[slot];

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
                        this.stickerGeometry,
                        this.stickerMaterials[face]
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
                ] =
                    stickerRotation(
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
        if (this.animation) {
            throw new Error(
                "Animation already running."
            );
        }

        const pivot =
            new THREE.Group();

        this.cubeRoot.add(
            pivot
        );

        /*
         * Ensure the world matrices are current
         * before attach().
         */
        this.cubeRoot
            .updateMatrixWorld(true);

        const affected =
            affectedPositions(move);

        const moving =
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

        pivot.position.set(
            0,
            0,
            0
        );

        pivot.quaternion.identity();

        pivot.scale.set(
            1,
            1,
            1
        );

        pivot.updateMatrixWorld(
            true
        );

        this.pivot = pivot;
        this.moving = moving;
    }

    animateMove(
        move,
        duration = 600
    ) {
        this.beginMove(move);

        let angle;

        switch (move) {
            case 0:
                angle = -Math.PI / 2;
                break;

            case 1:
                angle = Math.PI / 2;
                break;

            case 2:
                angle = -Math.PI / 2;
                break;

            case 3:
                angle = Math.PI / 2;
                break;

            case 4:
                angle = -Math.PI / 2;
                break;

            case 5:
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

        return new Promise(resolve => {
            this.animation = {
                pivot: this.pivot,
                moving: this.moving,
                axis,
                angle,
                duration,
                startTime: performance.now(),
                resolve,
            };
        });
    }
}

export { THREE };
