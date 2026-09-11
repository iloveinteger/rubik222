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

const FACE_DIRS = [
    [[ 0, 1, 0],[ 1, 0, 0],[ 0, 0, 1]],
    [[ 0, 1, 0],[ 0, 0, 1],[-1, 0, 0]],
    [[ 0, 1, 0],[-1, 0, 0],[ 0, 0,-1]],
    [[ 0, 1, 0],[ 0, 0,-1],[ 1, 0, 0]],
    [[ 0,-1, 0],[ 0, 0, 1],[ 1, 0, 0]],
    [[ 0,-1, 0],[-1, 0, 0],[ 0, 0, 1]],
    [[ 0,-1, 0],[ 0, 0,-1],[-1, 0, 0]],
    [[ 0,-1, 0],[ 1, 0, 0],[ 0, 0,-1]],
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
    return new THREE.PlaneGeometry(0.78, 0.78);
}

function createCubieGeometry() {
    return new THREE.BoxGeometry(0.96, 0.96, 0.96);
}

function createStickerMaterials() {
    const materials = {};

    for (const [face, color] of Object.entries(FACE_COLOR)) {
        materials[face] = new THREE.MeshBasicMaterial({
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

function makeCubie(identity, bodyGeometry, bodyMaterial) {
    const group = new THREE.Group();

    group.userData.identity = identity;

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

        this.camera.position.set(6, 6, 6);
        this.camera.lookAt(0, 0, 0);

        this.renderer =
            new THREE.WebGLRenderer({
                antialias: true,
                alpha: false,
                powerPreference: "high-performance",
                preserveDrawingBuffer: false,
            });

        this.renderer.outputColorSpace =
            THREE.SRGBColorSpace;

        this.renderer.shadowMap.enabled = false;

        this.renderer.setPixelRatio(
            Math.min(
                window.devicePixelRatio || 1,
                3
            )
        );

        this.renderer.setSize(
            Math.max(1, container.clientWidth),
            Math.max(1, container.clientHeight),
            false
        );

        container.appendChild(
            this.renderer.domElement
        );

        this.cubeRoot = new THREE.Group();
        this.scene.add(this.cubeRoot);

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

                    this.cubeRoot.add(cubie);

                    return cubie;
                }
            );

        /*
         * Animation state.
         *
         * animateMove() no longer owns a separate RAF.
         * The main render loop updates animation first,
         * then renders the scene.
         */
        this.animation = null;

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

        const aspect = width / height;
        const size = 4.5;

        this.camera.left =
            -size * aspect;

        this.camera.right =
            size * aspect;

        this.camera.top = size;
        this.camera.bottom = -size;

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
        const animation = this.animation;

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
         * Quintic smootherstep.
         *
         * Compared with the previous smoothstep,
         * both velocity and acceleration approach zero
         * smoothly at the beginning and end.
         */
        const eased =
            6 * t ** 5 -
            15 * t ** 4 +
            10 * t ** 3;

        animation.pivot.setRotationFromAxisAngle(
            animation.axis,
            animation.angle * eased
        );

        if (t < 1) {
            return;
        }

        /*
         * Force the exact final angle.
         * No visual snap should occur because the previous
         * frame is already arbitrarily close to the target.
         */
        animation.pivot.setRotationFromAxisAngle(
            animation.axis,
            animation.angle
        );

        /*
         * Make sure the pivot's final world matrix is current
         * before detaching the cubies.
         */
        this.cubeRoot.updateMatrixWorld(true);
        animation.pivot.updateMatrixWorld(true);

        for (const cubie of animation.moving) {
            this.cubeRoot.attach(cubie);
        }

        this.cubeRoot.remove(animation.pivot);

        /*
         * Resolve the Promise only after the transform has
         * been completely transferred back to cubeRoot.
         */
        const resolve = animation.resolve;

        this.animation = null;

        resolve();
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
            const identity = state.cp[slot];
            const co = state.co[slot];

            const cubie =
                this.cubies[identity];

            cubie.position.set(
                CORNERS[slot][0] * 0.51,
                CORNERS[slot][1] * 0.51,
                CORNERS[slot][2] * 0.51
            );

            cubie.rotation.set(0, 0, 0);

            cubie.userData.slot = slot;
            cubie.userData.orientation = co;

            while (cubie.children.length > 1) {
                cubie.remove(
                    cubie.children[1]
                );
            }

            const colors =
                identityColors(identity);

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

                const [rx, ry, rz] =
                    stickerRotation(normal);

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
        if (this.animation) {
            throw new Error(
                "Animation already running."
            );
        }

        const pivot =
            new THREE.Group();

        this.cubeRoot.add(pivot);

        /*
         * Make the hierarchy current before attach().
         * This is especially important when a cubie is
         * coming from a previously rotated position.
         */
        this.cubeRoot.updateMatrixWorld(true);

        const affected =
            affectedPositions(move);

        const moving =
            affected.map(slot => {
                const identity =
                    this.state.cp[slot];

                const cubie =
                    this.cubies[identity];

                pivot.attach(cubie);

                return cubie;
            });

        /*
         * The pivot must start from the exact identity
         * transform. The attached cubies retain their
         * world-space positions.
         */
        pivot.position.set(0, 0, 0);
        pivot.quaternion.identity();
        pivot.scale.set(1, 1, 1);

        pivot.updateMatrixWorld(true);

        this.pivot = pivot;
        this.moving = moving;
    }

    animateMove(move, duration = 3000) {
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

        /*
         * Reuse these vectors.
         * No Vector3 allocation per animation frame.
         */
        let axis;

        if (move <= 1) {
            axis = new THREE.Vector3(1, 0, 0);
        } else if (move <= 3) {
            axis = new THREE.Vector3(0, 1, 0);
        } else {
            axis = new THREE.Vector3(0, 0, 1);
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
