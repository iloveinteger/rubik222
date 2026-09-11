import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js";
import { affectedPositions } from "./cube.js";

const CORNERS = [
    [1, 1, 1],
    [-1, 1, 1],
    [-1, 1, -1],
    [1, 1, -1],
    [1, -1, 1],
    [-1, -1, 1],
    [-1, -1, -1],
    [1, -1, -1],
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
    bodyMaterial,
    stickerGeometry,
    stickerMaterials
) {
    const group = new THREE.Group();

    group.userData.identity = identity;

    const body =
        new THREE.Mesh(
            bodyGeometry,
            bodyMaterial
        );

    group.add(body);

    /*
     * Pre-create all three stickers.
     *
     * They are reused by rebuild() instead of creating
     * and destroying Mesh objects every time.
     */
    for (let i = 0; i < 3; ++i) {
        const sticker =
            new THREE.Mesh(
                stickerGeometry,
                stickerMaterials.U
            );

        sticker.visible = false;
        group.add(sticker);
    }

    return group;
}

/*
 * Move animation velocity cap.
 *
 * The original smootherstep derivative has a maximum
 * normalized velocity of 1.875.
 *
 * We cap the velocity and integrate it once into a
 * normalized cumulative position profile.
 */
const SPEED_CAP = 1.2;
const SPEED_SAMPLES = 1024;

function createSpeedProfile(cap) {
    const values =
        new Float64Array(
            SPEED_SAMPLES + 1
        );

    for (
        let i = 0;
        i <= SPEED_SAMPLES;
        ++i
    ) {
        const t =
            i / SPEED_SAMPLES;

        const raw =
            30 *
            t *
            t *
            (1 - t) *
            (1 - t);

        values[i] =
            Math.min(
                raw,
                cap
            );
    }

    const cumulative =
        new Float64Array(
            SPEED_SAMPLES + 1
        );

    const dt =
        1 / SPEED_SAMPLES;

    for (
        let i = 1;
        i <= SPEED_SAMPLES;
        ++i
    ) {
        cumulative[i] =
            cumulative[i - 1] +
            (
                values[i - 1] +
                values[i]
            ) *
            0.5 *
            dt;
    }

    const total =
        cumulative[SPEED_SAMPLES];

    for (
        let i = 0;
        i <= SPEED_SAMPLES;
        ++i
    ) {
        cumulative[i] /= total;
    }

    return cumulative;
}

const MOVE_SPEED_PROFILE =
    createSpeedProfile(
        SPEED_CAP
    );

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

function randomRange(min, max) {
    return (
        min +
        Math.random() *
        (max - min)
    );
}

function randomEntranceQuaternion() {
    /*
     * Keep X/Z moderate so the cube does not enter
     * at an absurdly tilted angle, while Y can rotate
     * through the full circle.
     */
    const euler =
        new THREE.Euler(
            randomRange(
                -0.55,
                0.55
            ),
            randomRange(
                -Math.PI,
                Math.PI
            ),
            randomRange(
                -0.55,
                0.55
            ),
            "XYZ"
        );

    return new THREE.Quaternion()
        .setFromEuler(euler);
}

function randomExitAxis(target) {
    target.set(
        randomRange(-1, 1),
        randomRange(-1, 1),
        randomRange(-1, 1)
    );

    if (target.lengthSq() < 0.01) {
        target.set(
            0.7,
            0.25,
            0.55
        );
    }

    target.normalize();

    return target;
}

export class CubeRenderer {
    constructor(container) {
        this.container =
            container;

        this.scene =
            new THREE.Scene();

        this.scene.background =
            new THREE.Color(
                0x0b0b0b
            );

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
                powerPreference:
                    "high-performance",
                preserveDrawingBuffer:
                    false,
            });

        this.renderer.outputColorSpace =
            THREE.SRGBColorSpace;

        this.renderer.shadowMap.enabled =
            false;

        this.renderer.setPixelRatio(
            Math.min(
                window.devicePixelRatio || 1,
                2
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
                (_, identity) =>
                    makeCubie(
                        identity,
                        this.bodyGeometry,
                        this.bodyMaterial,
                        this.stickerGeometry,
                        this.stickerMaterials
                    )
            );

        for (const cubie of this.cubies) {
            this.cubeRoot.add(cubie);
        }

        /*
         * Shared axes.
         */
        this.axisX =
            new THREE.Vector3(
                1,
                0,
                0
            );

        this.axisY =
            new THREE.Vector3(
                0,
                1,
                0
            );

        this.axisZ =
            new THREE.Vector3(
                0,
                0,
                1
            );

        /*
         * Reusable transition objects.
         */
        this.transitionPosition =
            new THREE.Vector3();

        this.transitionVelocity =
            new THREE.Vector3();

        this.transitionTarget =
            new THREE.Vector3();

        this.transitionStartQuaternion =
            new THREE.Quaternion();

        this.transitionTargetQuaternion =
            new THREE.Quaternion();

        this.transitionQuaternion =
            new THREE.Quaternion();

        this.transitionAxis =
            new THREE.Vector3();

        this.transition =
            null;

        this.animation =
            null;

        this.state =
            null;

        this.lastAnimationTime =
            0;

        this.resizeObserver =
            new ResizeObserver(() => {
                this.resize();
            });

        this.resizeObserver.observe(
            container
        );

        this.resize();

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

        const size =
            4.5;

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
                2
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
        if (this.transition) {
            this.updateTransition(now);
        }

        if (this.animation) {
            this.updateMoveAnimation(now);
        }
    }

    /*
     * ---------------------------------------------------------
     * Whole-cube entrance / exit animation
     * ---------------------------------------------------------
     */

    startEntrance() {
        if (
            this.transition ||
            this.animation
        ) {
            return Promise.reject(
                new Error(
                    "Another animation is running."
                )
            );
        }

        const height =
            this.container.clientHeight;

        /*
         * Bounding sphere radius of the cube.
         *
         * The actual cube extends to approximately 0.51
         * on each axis, so:
         *
         *     0.51 * sqrt(3) ~= 0.88335
         *
         * This keeps the entire rotated cube outside the
         * viewport before the entrance begins.
         */
        const cubeBoundRadius =
            0.88335;

        const scale =
            Math.min(
                this.container.clientWidth,
                height
            ) * 0.11;

        const margin =
            24;

        const spawnY =
            (
                height * 0.45 +
                margin
            ) / scale +
            cubeBoundRadius;

        this.transitionPosition.set(
            0,
            spawnY,
            0
        );

        this.transitionVelocity.set(
            0,
            -1.3,
            0
        );

        this.transitionTarget.set(
            0,
            0,
            0
        );

        this.transitionStartQuaternion.copy(
            randomEntranceQuaternion()
        );

        this.transitionTargetQuaternion.identity();

        this.cubeRoot.position.copy(
            this.transitionPosition
        );

        this.cubeRoot.quaternion.copy(
            this.transitionStartQuaternion
        );

        /*
         * Physics uses real elapsed time.
         *
         * k = 10.5
         * c = 5
         */
        this.transition = {
            type: "entrance",
            lastTime:
                performance.now(),
            springFinished: false,
            rotationDuration: 1350,
            startTime:
                performance.now(),
            resolve: null,
        };

        return new Promise(resolve => {
            this.transition.resolve =
                resolve;
        });
    }

    startExit() {
        if (
            this.transition ||
            this.animation
        ) {
            return Promise.reject(
                new Error(
                    "Another animation is running."
                )
            );
        }

        const height =
            this.container.clientHeight;

        const width =
            this.container.clientWidth;

        const scale =
            Math.min(
                width,
                height
            ) * 0.11;

        const cubeBoundRadius =
            0.88335;

        const margin =
            24;

        const exitY =
            -(
                height * 0.55 +
                margin
            ) / scale -
            cubeBoundRadius;

        this.transitionPosition.copy(
            this.cubeRoot.position
        );

        this.transitionTarget.set(
            0,
            exitY,
            0
        );

        this.transitionStartQuaternion.copy(
            this.cubeRoot.quaternion
        );

        randomExitAxis(
            this.transitionAxis
        );

        this.transitionQuaternion
            .setFromAxisAngle(
                this.transitionAxis,
                randomRange(
                    0.75,
                    1.35
                )
            );

        this.transitionTargetQuaternion
            .copy(
                this.transitionQuaternion
            )
            .premultiply(
                this.transitionStartQuaternion
            );

        const now =
            performance.now();

        this.transition = {
            type: "exit",
            startTime: now,
            lastTime: now,
            duration: 800,
            resolve: null,
        };

        return new Promise(resolve => {
            this.transition.resolve =
                resolve;
        });
    }

    updateTransition(now) {
        const transition =
            this.transition;

        if (!transition) {
            return;
        }

        if (
            transition.type ===
            "entrance"
        ) {
            this.updateEntrance(
                transition,
                now
            );
            return;
        }

        this.updateExit(
            transition,
            now
        );
    }

    updateEntrance(
        transition,
        now
    ) {
        /*
         * Real elapsed time.
         *
         * Clamp only huge frame gaps.
         */
        const dt =
            Math.min(
                0.05,
                Math.max(
                    0,
                    (now -
                        transition.lastTime) /
                        1000
                )
            );

        transition.lastTime =
            now;

        if (
            !transition.springFinished
        ) {
            /*
             * Spring:
             *
             * a = k(target - x) - c*v
             *
             * k = 10.5
             * c = 5
             */
            const acceleration =
                this.transitionTarget
                    .clone()
                    .sub(
                        this.transitionPosition
                    )
                    .multiplyScalar(
                        10.5
                    );

            acceleration.addScaledVector(
                this.transitionVelocity,
                -5
            );

            this.transitionVelocity
                .addScaledVector(
                    acceleration,
                    dt
                );

            this.transitionPosition
                .addScaledVector(
                    this.transitionVelocity,
                    dt
                );

            this.cubeRoot.position.copy(
                this.transitionPosition
            );

            const distance =
                this.transitionPosition
                    .distanceTo(
                        this.transitionTarget
                    );

            const velocity =
                this.transitionVelocity
                    .length();

            if (
                distance < 0.001 &&
                velocity < 0.001
            ) {
                /*
                 * Only the final residual is snapped.
                 *
                 * No intermediate damping change.
                 */
                this.transitionPosition.set(
                    0,
                    0,
                    0
                );

                this.transitionVelocity.set(
                    0,
                    0,
                    0
                );

                this.cubeRoot.position.set(
                    0,
                    0,
                    0
                );

                transition.springFinished =
                    true;
            }
        }

        /*
         * Rotation continues independently of whether
         * the spring has already settled.
         */
        const elapsed =
            now -
            transition.startTime;

        const t =
            Math.min(
                1,
                elapsed /
                    transition.rotationDuration
            );

        const eased =
            t * t * (3 - 2 * t);

        this.cubeRoot.quaternion
            .slerpQuaternions(
                this.transitionStartQuaternion,
                this.transitionTargetQuaternion,
                eased
            );

        /*
         * The entrance is complete only when BOTH
         * translation and rotation are complete.
         */
        if (
            transition.springFinished &&
            t >= 1
        ) {
            this.cubeRoot.position.set(
                0,
                0,
                0
            );

            this.cubeRoot.quaternion.identity();

            const resolve =
                transition.resolve;

            this.transition =
                null;

            if (resolve) {
                resolve();
            }
        }
    }

    updateExit(
        transition,
        now
    ) {
        const elapsed =
            now -
            transition.startTime;

        const t =
            Math.min(
                1,
                elapsed /
                    transition.duration
            );

        /*
         * Quadratic ease-out.
         */
        const e =
            t * t;

        this.cubeRoot.position.lerpVectors(
            this.transitionPosition,
            this.transitionTarget,
            e
        );

        this.cubeRoot.quaternion
            .slerpQuaternions(
                this.transitionStartQuaternion,
                this.transitionTargetQuaternion,
                e
            );

        if (t >= 1) {
            this.cubeRoot.position.copy(
                this.transitionTarget
            );

            this.cubeRoot.quaternion.copy(
                this.transitionTargetQuaternion
            );

            const resolve =
                transition.resolve;

            this.transition =
                null;

            if (resolve) {
                resolve();
            }
        }
    }

    /*
     * ---------------------------------------------------------
     * Cube state
     * ---------------------------------------------------------
     */

    resetWholeCubeTransform() {
        this.cubeRoot.position.set(
            0,
            0,
            0
        );

        this.cubeRoot.quaternion.identity();
    }

    rebuild(
        state,
        preserveTransform = false
    ) {
        this.state =
            state;

        /*
         * IMPORTANT:
         *
         * During entrance/exit we must NOT reset the
         * whole-cube transform.
         *
         * A normal rebuild after a face move can safely
         * return the cube to its canonical orientation.
         */
        if (!preserveTransform) {
            this.resetWholeCubeTransform();
        }

        for (
            let slot = 0;
            slot < 8;
            ++slot
        ) {
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

            const colors =
                identityColors(
                    identity
                );

            const dirs =
                FACE_DIRS[slot];

            /*
             * Reuse the three pre-created stickers.
             */
            for (
                let original = 0;
                original < 3;
                ++original
            ) {
                const sticker =
                    cubie.children[
                        original + 1
                    ];

                const target =
                    (original + co) % 3;

                const normal =
                    dirs[target];

                const face =
                    colors[original];

                sticker.material =
                    this.stickerMaterials[
                        face
                    ];

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

                sticker.visible =
                    true;
            }
        }
    }

    /*
     * ---------------------------------------------------------
     * Face move animation
     * ---------------------------------------------------------
     */

    beginMove(move) {
        if (
            this.animation ||
            this.transition
        ) {
            throw new Error(
                "Animation already running."
            );
        }

        const pivot =
            new THREE.Group();

        this.cubeRoot.add(
            pivot
        );

        this.cubeRoot.updateMatrixWorld(
            true
        );

        const affected =
            affectedPositions(
                move
            );

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

        this.pivot =
            pivot;

        this.moving =
            moving;
    }

    animateMove(
        move,
        duration = 600
    ) {
        this.beginMove(
            move
        );

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
                this.axisX;
        } else if (move <= 3) {
            axis =
                this.axisY;
        } else {
            axis =
                this.axisZ;
        }

        return new Promise(resolve => {
            this.animation = {
                pivot: this.pivot,
                moving: this.moving,
                axis,
                angle,
                duration,
                startTime:
                    performance.now(),
                resolve,
            };
        });
    }

    updateMoveAnimation(now) {
        const animation =
            this.animation;

        if (!animation) {
            return;
        }

        const elapsed =
            now -
            animation.startTime;

        const t =
            Math.min(
                1,
                elapsed /
                    animation.duration
            );

        const eased =
            cappedEasing(t);

        animation.pivot
            .setRotationFromAxisAngle(
                animation.axis,
                animation.angle *
                    eased
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

        this.cubeRoot.updateMatrixWorld(
            true
        );

        animation.pivot.updateMatrixWorld(
            true
        );

        for (
            const cubie of
            animation.moving
        ) {
            this.cubeRoot.attach(
                cubie
            );
        }

        this.cubeRoot.remove(
            animation.pivot
        );

        const resolve =
            animation.resolve;

        this.animation =
            null;

        resolve();
    }
}

export { THREE };
