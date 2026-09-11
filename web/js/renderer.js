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

const MOVE_DURATION = 600;
const ROTATION_DURATION = 1350;
const EXIT_DURATION = 800;

const SPRING_STIFFNESS = 10.5;
const SPRING_DAMPING = 5.0;
const INITIAL_VERTICAL_VELOCITY = -1.3;

const SPRING_SETTLE_DISTANCE = 0.001;
const SPRING_SETTLE_SPEED = 0.001;

const SPEED_CAP = 1.2;
const SPEED_SAMPLES = 1024;

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
            Math.min(raw, cap);
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
        this.container =
            container;

        this.scene =
            new THREE.Scene();

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
                powerPreference:
                    "high-performance",
                preserveDrawingBuffer: false,
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
                (_, identity) => {
                    const cubie =
                        new THREE.Group();

                    cubie.userData.identity =
                        identity;

                    const body =
                        new THREE.Mesh(
                            this.bodyGeometry,
                            this.bodyMaterial
                        );

                    cubie.add(body);

                    /*
                     * Pre-create the three stickers.
                     *
                     * rebuild() only changes their
                     * material and transform.
                     */
                    cubie.userData.stickers =
                        Array.from(
                            { length: 3 },
                            () => {
                                const sticker =
                                    new THREE.Mesh(
                                        this.stickerGeometry,
                                        this.stickerMaterials.U
                                    );

                                cubie.add(
                                    sticker
                                );

                                return sticker;
                            }
                        );

                    this.cubeRoot.add(
                        cubie
                    );

                    return cubie;
                }
            );

        this.state = null;

        this.animation = null;

        this.transition = null;

        this.lastAnimationTime = 0;

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
        if (this.lastAnimationTime === 0) {
            this.lastAnimationTime =
                now;
        }

        let dt =
            (now - this.lastAnimationTime) /
            1000;

        this.lastAnimationTime =
            now;

        dt =
            Math.min(
                dt,
                0.05
            );

        this.updateTransition(
            now,
            dt
        );

        this.updateMoveAnimation(
            now
        );

        this.renderer.render(
            this.scene,
            this.camera
        );

        requestAnimationFrame(
            this.renderLoop
        );
    }

    // ------------------------------------------------------------------------
    // Entrance / exit transition
    // ------------------------------------------------------------------------

    startEntrance() {
        if (this.transition) {
            throw new Error(
                "Transition already running."
            );
        }

        const height =
            this.container.clientHeight;

        const spawnY =
            Math.max(
                5.0,
                3.8 + height / 260
            );

        this.cubeRoot.position.set(
            0,
            spawnY,
            0
        );

        this.cubeRoot.rotation.set(
            -0.32,
            0.45,
            0.18
        );

        const startQuaternion =
            this.cubeRoot.quaternion.clone();

        const targetQuaternion =
            new THREE.Quaternion();

        this.transition = {
            type: "enter",

            position:
                this.cubeRoot.position.clone(),

            velocity:
                new THREE.Vector3(
                    0,
                    INITIAL_VERTICAL_VELOCITY,
                    0
                ),

            target:
                new THREE.Vector3(
                    0,
                    0,
                    0
                ),

            startQuaternion,

            targetQuaternion,

            rotationElapsed: 0,

            resolve: null,
        };

        return new Promise(resolve => {
            this.transition.resolve =
                resolve;
        });
    }

    startExit() {
        if (this.transition) {
            throw new Error(
                "Transition already running."
            );
        }

        const height =
            this.container.clientHeight;

        const endY =
            -Math.max(
                5.0,
                3.8 + height / 260
            );

        const start =
            this.cubeRoot.position.clone();

        const startQuaternion =
            this.cubeRoot.quaternion.clone();

        const axis =
            new THREE.Vector3(
                0.7,
                0.25,
                0.55
            ).normalize();

        this.transition = {
            type: "exit",

            start,

            end:
                new THREE.Vector3(
                    0,
                    endY,
                    0
                ),

            startQuaternion,

            axis,

            elapsed: 0,

            duration:
                EXIT_DURATION,

            resolve: null,
        };

        return new Promise(resolve => {
            this.transition.resolve =
                resolve;
        });
    }

    updateTransition(
        now,
        dt
    ) {
        const transition =
            this.transition;

        if (!transition) {
            return;
        }

        if (
            transition.type === "enter"
        ) {
            this.updateEntrance(
                transition,
                dt
            );

            return;
        }

        this.updateExit(
            transition,
            dt
        );
    }

    updateEntrance(
        transition,
        dt
    ) {
        const position =
            transition.position;

        const velocity =
            transition.velocity;

        const target =
            transition.target;

        const dx =
            target.x - position.x;

        const dy =
            target.y - position.y;

        const dz =
            target.z - position.z;

        const ax =
            dx * SPRING_STIFFNESS -
            velocity.x * SPRING_DAMPING;

        const ay =
            dy * SPRING_STIFFNESS -
            velocity.y * SPRING_DAMPING;

        const az =
            dz * SPRING_STIFFNESS -
            velocity.z * SPRING_DAMPING;

        velocity.x +=
            ax * dt;

        velocity.y +=
            ay * dt;

        velocity.z +=
            az * dt;

        position.x +=
            velocity.x * dt;

        position.y +=
            velocity.y * dt;

        position.z +=
            velocity.z * dt;

        this.cubeRoot.position.copy(
            position
        );

        transition.rotationElapsed +=
            dt * 1000;

        const rotationT =
            Math.min(
                1,
                transition.rotationElapsed /
                    ROTATION_DURATION
            );

        const eased =
            rotationT *
            rotationT *
            (
                3 -
                2 * rotationT
            );

        this.cubeRoot.quaternion.slerpQuaternions(
            transition.startQuaternion,
            transition.targetQuaternion,
            eased
        );

        const distance =
            Math.hypot(
                position.x - target.x,
                position.y - target.y,
                position.z - target.z
            );

        const speed =
            Math.hypot(
                velocity.x,
                velocity.y,
                velocity.z
            );

        if (
            distance <
                SPRING_SETTLE_DISTANCE &&
            speed <
                SPRING_SETTLE_SPEED
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
        dt
    ) {
        transition.elapsed +=
            dt * 1000;

        const t =
            Math.min(
                1,
                transition.elapsed /
                    transition.duration
            );

        const eased =
            t * t;

        this.cubeRoot.position.lerpVectors(
            transition.start,
            transition.end,
            eased
        );

        const angle =
            0.9 * t;

        const q =
            new THREE.Quaternion();

        q.setFromAxisAngle(
            transition.axis,
            angle
        );

        this.cubeRoot.quaternion
            .copy(
                transition.startQuaternion
            )
            .premultiply(q);

        if (t < 1) {
            return;
        }

        this.cubeRoot.position.copy(
            transition.end
        );

        const resolve =
            transition.resolve;

        this.transition =
            null;

        if (resolve) {
            resolve();
        }
    }

    // ------------------------------------------------------------------------
    // Move animation
    // ------------------------------------------------------------------------

    updateMoveAnimation(now) {
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

        animation.pivot
            .setRotationFromAxisAngle(
                animation.axis,
                animation.angle
            );

        this.cubeRoot
            .updateMatrixWorld(true);

        animation.pivot
            .updateMatrixWorld(true);

        for (
            const cubie
            of animation.moving
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

    // ------------------------------------------------------------------------
    // Cube state
    // ------------------------------------------------------------------------

    rebuild(state) {
        this.state =
            state;

        this.resetWholeCubeTransform();

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

            const stickers =
                cubie.userData.stickers;

            for (
                let original = 0;
                original < 3;
                ++original
            ) {
                const target =
                    (
                        original +
                        co
                    ) % 3;

                const normal =
                    dirs[target];

                const face =
                    colors[original];

                const sticker =
                    stickers[original];

                sticker.material =
                    this.stickerMaterials[
                        face
                    ];

                sticker.position.set(
                    normal[0] * 0.486,
                    normal[1] * 0.486,
                    normal[2] * 0.486
                );

                const rotation =
                    stickerRotation(
                        normal
                    );

                sticker.rotation.set(
                    rotation[0],
                    rotation[1],
                    rotation[2]
                );
            }
        }
    }

    // ------------------------------------------------------------------------
    // Face move
    // ------------------------------------------------------------------------

    beginMove(move) {
        if (this.animation) {
            throw new Error(
                "Animation already running."
            );
        }

        if (this.transition) {
            throw new Error(
                "Transition already running."
            );
        }

        const pivot =
            new THREE.Group();

        this.cubeRoot.add(
            pivot
        );

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

        this.pivot =
            pivot;

        this.moving =
            moving;
    }

    animateMove(
        move,
        duration = MOVE_DURATION
    ) {
        this.beginMove(
            move
        );

        let angle;

        switch (move) {
            case 0:
                angle =
                    -Math.PI / 2;
                break;

            case 1:
                angle =
                    Math.PI / 2;
                break;

            case 2:
                angle =
                    -Math.PI / 2;
                break;

            case 3:
                angle =
                    Math.PI / 2;
                break;

            case 4:
                angle =
                    -Math.PI / 2;
                break;

            case 5:
                angle =
                    Math.PI / 2;
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
                pivot:
                    this.pivot,

                moving:
                    this.moving,

                axis,

                angle,

                duration,

                startTime:
                    performance.now(),

                resolve,
            };
        });
    }
}

export { THREE };
