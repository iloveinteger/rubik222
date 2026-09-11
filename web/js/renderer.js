import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js";
import { affectedPositions } from "./cube.js";

const CORNERS = [
    [1, 1, 1], [-1, 1, 1], [-1, 1, -1], [1, 1, -1],
    [1, -1, 1], [-1, -1, 1], [-1, -1, -1], [1, -1, -1],
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

const CUBE_HALF = 0.51;
const CUBE_BOUND_RADIUS = CUBE_HALF * Math.sqrt(3);
const OFFSCREEN_MARGIN_PX = 24;
const SOLVE_COVERAGE_Y = 1.2;

const MOVE_DURATION = 600;
const ROTATION_DURATION = 1350;
const EXIT_DURATION = 800;

const SPRING_STIFFNESS = 10.5;
const SPRING_DAMPING = 5;
const INITIAL_VERTICAL_VELOCITY = -1.3;
const PHYSICS_STEP = 0.016;
const MAX_PHYSICS_ELAPSED = 0.1;

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

function randomRange(min, max) {
    return min + Math.random() * (max - min);
}

function randomRotVector() {
    const minLimit = 0.3 * Math.PI;
    const maxLimit = 0.9 * Math.PI;

    let amount = randomRange(minLimit, maxLimit);
    if (Math.random() < 0.5) amount = -amount;

    const theta = randomRange(0, 2 * Math.PI);
    const z = randomRange(-1, 1);
    const r = Math.sqrt(1 - z * z);

    return new THREE.Vector3(
        r * Math.cos(theta) * amount,
        r * Math.sin(theta) * amount,
        z * amount
    );
}

function rotationVectorToQuaternion(v, out) {
    const length = v.length();
    if (length < 1e-8) {
        out.identity();
        return out;
    }

    const axis = new THREE.Vector3(
        v.x / length,
        v.y / length,
        v.z / length
    );

    out.setFromAxisAngle(axis, length);
    return out;
}

function createSpeedProfile(cap) {
    const values = new Float64Array(SPEED_SAMPLES + 1);
    for (let i = 0; i <= SPEED_SAMPLES; ++i) {
        const t = i / SPEED_SAMPLES;
        const raw = 30 * t * t * (1 - t) * (1 - t);
        values[i] = Math.min(raw, cap);
    }

    const cumulative = new Float64Array(SPEED_SAMPLES + 1);
    const dt = 1 / SPEED_SAMPLES;

    for (let i = 1; i <= SPEED_SAMPLES; ++i) {
        cumulative[i] = cumulative[i - 1] +
            (values[i - 1] + values[i]) * 0.5 * dt;
    }

    const total = cumulative[SPEED_SAMPLES];
    for (let i = 0; i <= SPEED_SAMPLES; ++i) {
        cumulative[i] /= total;
    }

    return cumulative;
}

const MOVE_SPEED_PROFILE = createSpeedProfile(SPEED_CAP);

function cappedEasing(t) {
    if (t <= 0) return 0;
    if (t >= 1) return 1;

    const position = t * SPEED_SAMPLES;
    const index = Math.floor(position);
    const fraction = position - index;
    const a = MOVE_SPEED_PROFILE[index];
    const b = MOVE_SPEED_PROFILE[index + 1];

    return a + (b - a) * fraction;
}

export class CubeRenderer {
    constructor(container) {
        this.container = container;

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0b0b0b);

        this.camera = new THREE.OrthographicCamera(-4, 4, 4.5, -4.5, 0.1, 100);
        this.camera.position.set(6, 6, 6);
        this.camera.lookAt(0, 0, 0);

        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: false,
            powerPreference: "high-performance",
            preserveDrawingBuffer: false,
        });
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        this.renderer.setSize(
            Math.max(1, container.clientWidth),
            Math.max(1, container.clientHeight),
            false
        );
        container.appendChild(this.renderer.domElement);

        this.cubeRoot = new THREE.Group();
        this.scene.add(this.cubeRoot);

        this.bodyGeometry = new THREE.BoxGeometry(0.96, 0.96, 0.96);
        this.stickerGeometry = new THREE.PlaneGeometry(0.78, 0.78);
        this.bodyMaterial = new THREE.MeshBasicMaterial({ color: 0x101010 });
        this.stickerMaterials = {};

        for (const [face, color] of Object.entries(FACE_COLOR)) {
            this.stickerMaterials[face] = new THREE.MeshBasicMaterial({
                color,
                side: THREE.FrontSide,
            });
        }

        this.cubies = Array.from({ length: 8 }, (_, identity) => {
            const group = new THREE.Group();
            group.userData.identity = identity;

            group.add(new THREE.Mesh(this.bodyGeometry, this.bodyMaterial));

            for (let i = 0; i < 3; ++i) {
                const sticker = new THREE.Mesh(
                    this.stickerGeometry,
                    this.stickerMaterials.U
                );
                sticker.visible = false;
                group.add(sticker);
            }

            this.cubeRoot.add(group);
            return group;
        });

        this.state = null;
        this.animation = null;
        this.entrance = null;
        this.exit = null;

        this.axisX = new THREE.Vector3(1, 0, 0);
        this.axisY = new THREE.Vector3(0, 1, 0);
        this.axisZ = new THREE.Vector3(0, 0, 1);

        this.tmpQuaternion = new THREE.Quaternion();
        this.tmpAxis = new THREE.Vector3();
        this.tmpVector = new THREE.Vector3();
        this.tmpVector2 = new THREE.Vector3();

        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(container);
        this.resize();

        this.renderLoop = this.renderLoop.bind(this);
        requestAnimationFrame(this.renderLoop);
    }

    resize() {
        const width = Math.max(1, this.container.clientWidth);
        const height = Math.max(1, this.container.clientHeight);
        const aspect = width / height;
        const verticalHalf = 4.5;

        this.camera.left = -verticalHalf * aspect;
        this.camera.right = verticalHalf * aspect;
        this.camera.top = verticalHalf;
        this.camera.bottom = -verticalHalf;
        this.camera.updateProjectionMatrix();

        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        this.renderer.setSize(width, height, false);
    }

    renderLoop(now) {
        this.updateAnimation(now);
        this.renderer.render(this.scene, this.camera);
        requestAnimationFrame(this.renderLoop);
    }

    updateAnimation(now) {
        if (this.entrance) this.updateEntrance(now);
        if (this.exit) this.updateExit(now);
        if (this.animation) this.updateMoveAnimation(now);
    }

    getOffscreenMarginWorld() {
        const height = Math.max(1, this.container.clientHeight);
        return (this.camera.top - this.camera.bottom) *
            OFFSCREEN_MARGIN_PX / height;
    }

    getEntranceY() {
        return this.camera.top + CUBE_BOUND_RADIUS + this.getOffscreenMarginWorld();
    }

    getExitY() {
        return this.camera.bottom - CUBE_BOUND_RADIUS - this.getOffscreenMarginWorld();
    }

    canStartSolve() {
        if (!this.entrance) return true;
        return Math.abs(this.entrance.position.y) <= SOLVE_COVERAGE_Y;
    }

    isEntranceActive() {
        return !!this.entrance;
    }

    startEntrance() {
        if (this.entrance || this.exit) {
            return Promise.reject(new Error("Transition already running."));
        }

        const startRotation = randomRotVector();
        const startQuaternion = new THREE.Quaternion();
        rotationVectorToQuaternion(startRotation, startQuaternion);

        const now = performance.now();

        this.cubeRoot.position.set(0, this.getEntranceY(), 0);
        this.cubeRoot.quaternion.copy(startQuaternion);

        this.entrance = {
            position: this.cubeRoot.position.clone(),
            velocity: new THREE.Vector3(0, INITIAL_VERTICAL_VELOCITY, 0),
            target: new THREE.Vector3(0, 0, 0),
            startQuaternion,
            targetQuaternion: new THREE.Quaternion(),
            startTime: now,
            lastPhysicsTime: now,
            physicsAccumulator: 0,
            springFinished: false,
            rotationFinished: false,
            resolve: null,
        };

        return new Promise(resolve => {
            this.entrance.resolve = resolve;
        });
    }

    updateEntrance(now) {
        const entrance = this.entrance;
        if (!entrance) return;

        let elapsed = (now - entrance.lastPhysicsTime) / 1000;
        entrance.lastPhysicsTime = now;
        elapsed = Math.min(Math.max(elapsed, 0), MAX_PHYSICS_ELAPSED);
        entrance.physicsAccumulator += elapsed;

        while (entrance.physicsAccumulator >= PHYSICS_STEP) {
            this.updateEntrancePhysics(entrance, PHYSICS_STEP);
            entrance.physicsAccumulator -= PHYSICS_STEP;
        }

        const rotationT = Math.min(
            1,
            (now - entrance.startTime) / ROTATION_DURATION
        );
        const eased = rotationT * rotationT * (3 - 2 * rotationT);

        this.cubeRoot.quaternion.slerpQuaternions(
            entrance.startQuaternion,
            entrance.targetQuaternion,
            eased
        );

        entrance.rotationFinished = rotationT >= 1;

        if (entrance.springFinished && entrance.rotationFinished) {
            this.cubeRoot.position.set(0, 0, 0);
            this.cubeRoot.quaternion.identity();

            const resolve = entrance.resolve;
            this.entrance = null;
            if (resolve) resolve();
        }
    }

    updateEntrancePhysics(entrance, dt) {
        const position = entrance.position;
        const velocity = entrance.velocity;

        const acceleration = this.tmpVector.set(
            -position.x * SPRING_STIFFNESS - velocity.x * SPRING_DAMPING,
            -position.y * SPRING_STIFFNESS - velocity.y * SPRING_DAMPING,
            -position.z * SPRING_STIFFNESS - velocity.z * SPRING_DAMPING
        );

        velocity.addScaledVector(acceleration, dt);
        position.addScaledVector(velocity, dt);
        this.cubeRoot.position.copy(position);

        const distance = position.length();
        const speed = velocity.length();

        if (distance < 0.001 && speed < 0.001) {
            position.set(0, 0, 0);
            velocity.set(0, 0, 0);
            this.cubeRoot.position.set(0, 0, 0);
            entrance.springFinished = true;
        }
    }

    startExit() {
        if (this.entrance || this.exit || this.animation) {
            return Promise.reject(new Error("Animation already running."));
        }

        const start = this.cubeRoot.position.clone();
        const startQuaternion = this.cubeRoot.quaternion.clone();
        const rotation = randomRotVector();
        const rotationQuaternion = new THREE.Quaternion();
        rotationVectorToQuaternion(rotation, rotationQuaternion);

        const targetQuaternion = rotationQuaternion
            .clone()
            .premultiply(startQuaternion);

        const now = performance.now();

        this.exit = {
            start,
            target: new THREE.Vector3(0, this.getExitY(), 0),
            startQuaternion,
            targetQuaternion,
            startTime: now,
            duration: EXIT_DURATION,
            resolve: null,
        };

        return new Promise(resolve => {
            this.exit.resolve = resolve;
        });
    }

    updateExit(now) {
        const exit = this.exit;
        if (!exit) return;

        const t = Math.min(1, (now - exit.startTime) / exit.duration);
        const e = t * t;

        this.cubeRoot.position.lerpVectors(exit.start, exit.target, e);
        this.cubeRoot.quaternion.slerpQuaternions(
            exit.startQuaternion,
            exit.targetQuaternion,
            e
        );

        if (t >= 1) {
            this.cubeRoot.position.copy(exit.target);
            this.cubeRoot.quaternion.copy(exit.targetQuaternion);

            const resolve = exit.resolve;
            this.exit = null;
            if (resolve) resolve();
        }
    }

    resetWholeCubeTransform() {
        this.cubeRoot.position.set(0, 0, 0);
        this.cubeRoot.quaternion.identity();
    }

    rebuild(state, preserveTransform = false) {
        this.state = state;

        if (!preserveTransform) {
            this.resetWholeCubeTransform();
        }

        for (let slot = 0; slot < 8; ++slot) {
            const identity = state.cp[slot];
            const co = state.co[slot];
            const cubie = this.cubies[identity];

            cubie.position.set(
                CORNERS[slot][0] * CUBE_HALF,
                CORNERS[slot][1] * CUBE_HALF,
                CORNERS[slot][2] * CUBE_HALF
            );
            cubie.rotation.set(0, 0, 0);
            cubie.userData.slot = slot;
            cubie.userData.orientation = co;

            const colors = identityColors(identity);
            const dirs = FACE_DIRS[slot];

            for (let original = 0; original < 3; ++original) {
                const sticker = cubie.children[original + 1];
                const target = (original + co) % 3;
                const normal = dirs[target];
                const face = colors[original];

                sticker.material = this.stickerMaterials[face];
                sticker.visible = true;
                sticker.position.set(
                    normal[0] * 0.486,
                    normal[1] * 0.486,
                    normal[2] * 0.486
                );

                const [rx, ry, rz] = stickerRotation(normal);
                sticker.rotation.set(rx, ry, rz);
            }
        }
    }

    beginMove(move) {
        if (this.animation) {
            throw new Error("Move animation already running.");
        }

        const pivot = new THREE.Group();
        this.cubeRoot.add(pivot);
        this.cubeRoot.updateMatrixWorld(true);

        const affected = affectedPositions(move);
        const moving = affected.map(slot => {
            const identity = this.state.cp[slot];
            const cubie = this.cubies[identity];
            pivot.attach(cubie);
            return cubie;
        });

        pivot.position.set(0, 0, 0);
        pivot.quaternion.identity();
        pivot.scale.set(1, 1, 1);
        pivot.updateMatrixWorld(true);

        this.pivot = pivot;
        this.moving = moving;
    }

    animateMove(move, duration = MOVE_DURATION) {
        this.beginMove(move);

        let angle;
        if (move === 0) angle = -Math.PI / 2;
        else if (move === 1) angle = Math.PI / 2;
        else if (move === 2) angle = -Math.PI / 2;
        else if (move === 3) angle = Math.PI / 2;
        else if (move === 4) angle = -Math.PI / 2;
        else if (move === 5) angle = Math.PI / 2;
        else throw new Error(`Invalid move: ${move}`);

        let axis;
        if (move <= 1) axis = this.axisX;
        else if (move <= 3) axis = this.axisY;
        else axis = this.axisZ;

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

    updateMoveAnimation(now) {
        const animation = this.animation;
        if (!animation) return;

        const t = Math.min(1, (now - animation.startTime) / animation.duration);
        const eased = cappedEasing(t);

        animation.pivot.setRotationFromAxisAngle(
            animation.axis,
            animation.angle * eased
        );

        if (t < 1) return;

        animation.pivot.setRotationFromAxisAngle(
            animation.axis,
            animation.angle
        );

        this.cubeRoot.updateMatrixWorld(true);
        animation.pivot.updateMatrixWorld(true);

        for (const cubie of animation.moving) {
            this.cubeRoot.attach(cubie);
        }

        this.cubeRoot.remove(animation.pivot);

        const resolve = animation.resolve;
        this.animation = null;
        resolve();
    }
}

export { THREE };
