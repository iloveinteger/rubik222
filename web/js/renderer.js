import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js";
import { affectedPositions } from "./cube.js";

const CORNERS = [
    [ 1, 1, 1], // URF
    [-1, 1, 1], // UFL
    [-1, 1,-1], // ULB
    [ 1, 1,-1], // UBR
    [ 1,-1, 1], // DFR
    [-1,-1, 1], // DLF
    [-1,-1,-1], // DBL
    [ 1,-1,-1], // DRB
];

// For each corner position: [U/D, R/L, F/B].
const FACE_DIRS = CORNERS.map(([x,y,z]) => [
    [0, y, 0],
    [x, 0, 0],
    [0, 0, z],
]);

const FACE_COLOR = {
    U: 0xf4f4f4,
    D: 0xf2cf35,
    R: 0xd93b32,
    L: 0xf08a35,
    F: 0x35a853,
    B: 0x3c6dcc,
};

function faceName(normal) {
    const [x,y,z] = normal;
    if (y > 0) return "U";
    if (y < 0) return "D";
    if (x > 0) return "R";
    if (x < 0) return "L";
    if (z > 0) return "F";
    return "B";
}

function stickerRotation(normal) {
    const [x,y,z] = normal;
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

function identityColors(identity) {
    return FACE_DIRS[identity].map(faceName);
}

function makeCubie(identity) {
    const group = new THREE.Group();
    group.userData.identity = identity;

    const body = new THREE.Mesh(
        new THREE.BoxGeometry(0.96, 0.96, 0.96),
        new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.72, metalness: 0.04 })
    );
    group.add(body);

    return group;
}

export class CubeRenderer {
    constructor(container) {
        this.container = container;
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x111111);

        this.camera = new THREE.OrthographicCamera(-4, 4, 4, -4, 0.1, 100);
        this.camera.position.set(6, 6, 6);
        this.camera.lookAt(0, 0, 0);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
        this.renderer.setSize(container.clientWidth, container.clientHeight);
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        container.appendChild(this.renderer.domElement);

        this.cubeRoot = new THREE.Group();
        this.scene.add(this.cubeRoot);

        this.cubies = Array.from({ length: 8 }, (_, i) => {
            const g = makeCubie(i);
            this.cubeRoot.add(g);
            return g;
        });

        this.light = new THREE.HemisphereLight(0xffffff, 0x555555, 2.1);
        this.scene.add(this.light);

        this.keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
        this.keyLight.position.set(5, 8, 6);
        this.scene.add(this.keyLight);

        this.pivot = null;
        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(container);
        this.resize();

        this.state = null;
        this.renderLoop = this.renderLoop.bind(this);
        requestAnimationFrame(this.renderLoop);
    }

    resize() {
        const w = Math.max(1, this.container.clientWidth);
        const h = Math.max(1, this.container.clientHeight);
        const aspect = w / h;
        const size = 4.5;
        this.camera.left = -size * aspect;
        this.camera.right = size * aspect;
        this.camera.top = size;
        this.camera.bottom = -size;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h, false);
    }

    renderLoop() {
        this.renderer.render(this.scene, this.camera);
        requestAnimationFrame(this.renderLoop);
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
            const cubie = this.cubies[identity];

            cubie.position.set(
                CORNERS[slot][0] * 1.02,
                CORNERS[slot][1] * 1.02,
                CORNERS[slot][2] * 1.02
            );
            cubie.rotation.set(0, 0, 0);
            cubie.userData.slot = slot;

            while (cubie.children.length > 1) cubie.remove(cubie.children[1]);

            const colors = identityColors(identity);
            const dirs = FACE_DIRS[slot];

            for (let original = 0; original < 3; ++original) {
                const target = (original + co) % 3;
                const normal = dirs[target];
                const face = colors[original];

                const sticker = new THREE.Mesh(
                    new THREE.PlaneGeometry(0.78, 0.78),
                    stickerMaterial(face)
                );

                sticker.position.set(
                    normal[0] * 0.486,
                    normal[1] * 0.486,
                    normal[2] * 0.486
                );

                const [rx,ry,rz] = stickerRotation(normal);
                sticker.rotation.set(rx, ry, rz);
                cubie.add(sticker);
            }
        }
    }

    beginMove(move) {
        if (this.pivot) throw new Error("Animation already running.");

        const pivot = new THREE.Group();
        this.cubeRoot.add(pivot);
        this.pivot = pivot;
        this.moving = affectedPositions(move).map(slot => {
            const identity = this.state.cp[slot];
            const cubie = this.cubies[identity];
            pivot.attach(cubie);
            return cubie;
        });

        this.moveStartRotation = this.cubeRoot.quaternion.clone();
        this.moveStartState = this.state;
    }

    animateMove(move, duration = 360) {
        this.beginMove(move);

        const angle = (move % 2 === 0) ? -Math.PI / 2 : Math.PI / 2;
        // Physical quarter-turn directions in the renderer coordinate system.
        let axis = new THREE.Vector3();
        if (move <= 1) axis.set(1, 0, 0);
        else if (move <= 3) axis.set(0, 1, 0);
        else axis.set(0, 0, 1);

        const start = performance.now();

        return new Promise(resolve => {
            const frame = now => {
                const t = Math.min(1, (now - start) / duration);
                // Smooth physical-looking angular acceleration/deceleration.
                const eased = t * t * (3 - 2 * t);
                this.pivot.setRotationFromAxisAngle(axis, angle * eased);

                if (t < 1) {
                    requestAnimationFrame(frame);
                    return;
                }

                this.pivot.setRotationFromAxisAngle(axis, angle);
                this.pivot.updateMatrixWorld(true);
                for (const cubie of this.moving) this.cubeRoot.attach(cubie);
                this.cubeRoot.remove(this.pivot);
                this.pivot = null;
                this.moving = null;
                resolve();
            };
            requestAnimationFrame(frame);
        });
    }
}

export { THREE };
