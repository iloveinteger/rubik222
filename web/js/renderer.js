import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js";
import { affectedPositions } from "./cube.js";


/* =========================================================
   Cube definition
   ========================================================= */

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
    Sticker normals for each Kociemba corner.

    The three entries correspond to the original
    sticker order of that corner.
*/
const FACE_DIRS = [
    // URF = U R F
    [
        [ 0, 1, 0],
        [ 1, 0, 0],
        [ 0, 0, 1],
    ],

    // UFL = U F L
    [
        [ 0, 1, 0],
        [ 0, 0, 1],
        [-1, 0, 0],
    ],

    // ULB = U L B
    [
        [ 0, 1, 0],
        [-1, 0, 0],
        [ 0, 0,-1],
    ],

    // UBR = U B R
    [
        [ 0, 1, 0],
        [ 0, 0,-1],
        [ 1, 0, 0],
    ],

    // DFR = D F R
    [
        [ 0,-1, 0],
        [ 0, 0, 1],
        [ 1, 0, 0],
    ],

    // DLF = D L F
    [
        [ 0,-1, 0],
        [-1, 0, 0],
        [ 0, 0, 1],
    ],

    // DBL = D B L
    [
        [ 0,-1, 0],
        [ 0, 0,-1],
        [-1, 0, 0],
    ],

    // DRB = D R B
    [
        [ 0,-1, 0],
        [ 1, 0, 0],
        [ 0, 0,-1],
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


/* =========================================================
   Helpers
   ========================================================= */

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


/* =========================================================
   Geometry
   ========================================================= */

/*
    Simple sharp square sticker.

    No rounded corners.
    No bevel.
    No lighting-dependent geometry.

    High-DPI rendering + MSAA handle the edge quality.
*/
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


/* =========================================================
   Materials
   ========================================================= */

/*
    MeshBasicMaterial is intentional.

    Sticker colors remain constant regardless of lighting.
*/
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


/* =========================================================
   Cubie
   ========================================================= */

function makeCubie(
    identity,
    bodyGeometry,
    bodyMaterial
) {
    const group = new THREE.Group();

    group.userData.identity =
        identity;

    const body =
        new THREE.Mesh(
            bodyGeometry,
            bodyMaterial
        );

    group.add(body);

    return group;
}


/* =========================================================
   Renderer
   ========================================================= */

export class CubeRenderer {
    constructor(container) {
        this.container = container;


        /* -------------------------------------------------
           Scene
           ------------------------------------------------- */

        this.scene =
            new THREE.Scene();

        this.scene.background =
            new THREE.Color(0x0b0b0b);


        /* -------------------------------------------------
           Camera
           ------------------------------------------------- */

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


        /* -------------------------------------------------
           WebGL renderer
           ------------------------------------------------- */

        this.renderer =
            new THREE.WebGLRenderer({
                /*
                    Hardware MSAA.

                    This is the first line of defense against
                    jagged cube/sticker edges.
                */
                antialias: true,

                alpha: false,

                powerPreference:
                    "high-performance",

                preserveDrawingBuffer:
                    false,
            });


        /*
            High-DPI rendering.

            1x  -> normal display
            2x  -> Retina / high-DPI
            3x  -> very high-DPI

            3 is a practical upper limit.
        */
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


        /*
            Use standard sRGB output.

            No tone mapping:
            sticker colors stay faithful to FACE_COLOR.
        */
        this.renderer.outputColorSpace =
            THREE.SRGBColorSpace;


        /*
            No shadows.
            No lighting.
            No reflections.
        */
        this.renderer.shadowMap.enabled =
            false;


        container.appendChild(
            this.renderer.domElement
        );


        /* -------------------------------------------------
           Cube root
           ------------------------------------------------- */

        this.cubeRoot =
            new THREE.Group();

        this.scene.add(
            this.cubeRoot
        );


        /* -------------------------------------------------
           Shared geometry / materials
           ------------------------------------------------- */

        this.stickerGeometry =
            createStickerGeometry();

        this.bodyGeometry =
            createCubieGeometry();

        this.stickerMaterials =
            createStickerMaterials();

        this.bodyMaterial =
            createBodyMaterial();


        /* -------------------------------------------------
           Cubies
           ------------------------------------------------- */

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


        /* -------------------------------------------------
           Animation state
           ------------------------------------------------- */

        this.pivot = null;
        this.moving = null;


        /* -------------------------------------------------
           Resize
           ------------------------------------------------- */

        this.resizeObserver =
            new ResizeObserver(() => {
                this.resize();
            });

        this.resizeObserver.observe(
            container
        );


        this.resize();

        this.state = null;


        /* -------------------------------------------------
           Render loop
           ------------------------------------------------- */

        this.renderLoop =
            this.renderLoop.bind(this);

        requestAnimationFrame(
            this.renderLoop
        );
    }


    /* =====================================================
       Resize
       ===================================================== */

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


        /*
            Reapply device pixel ratio.
        */
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


    /* =====================================================
       Render
       ===================================================== */

    renderLoop() {
        this.renderer.render(
            this.scene,
            this.camera
        );

        requestAnimationFrame(
            this.renderLoop
        );
    }


    /* =====================================================
       Whole cube transform
       ===================================================== */

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


    /* =====================================================
       Rebuild
       ===================================================== */

    rebuild(state) {
        this.state = state;

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


            /* ---------------------------------------------
               Position
               --------------------------------------------- */

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


            /* ---------------------------------------------
               Remove old stickers
               --------------------------------------------- */

            while (
                cubie.children.length > 1
            ) {
                cubie.remove(
                    cubie.children[1]
                );
            }


            /* ---------------------------------------------
               Sticker data
               --------------------------------------------- */

            const colors =
                identityColors(identity);

            const dirs =
                FACE_DIRS[slot];


            /* ---------------------------------------------
               Create stickers
               --------------------------------------------- */

            for (
                let original = 0;
                original < 3;
                ++original
            ) {
                /*
                    Corner orientation.

                    The original sticker moves by `co`
                    positions around the corner.
                */
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


                /*
                    Tiny offset prevents z-fighting
                    between sticker and cubie body.
                */
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


    /* =====================================================
       Begin move
       ===================================================== */

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
            affectedPositions(move);


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


    /* =====================================================
       Move animation
       ===================================================== */

    animateMove(
        move,
        duration = 420
    ) {
        this.beginMove(move);


        let angle;

        switch (move) {
            case 0:
                // R
                angle = -Math.PI / 2;
                break;

            case 1:
                // R'
                angle = Math.PI / 2;
                break;

            case 2:
                // U
                angle = -Math.PI / 2;
                break;

            case 3:
                // U'
                angle = Math.PI / 2;
                break;

            case 4:
                // F
                angle = -Math.PI / 2;
                break;

            case 5:
                // F'
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
                    Smoothstep easing.

                    Starts and ends with zero velocity.
                */
                const eased =
                      6 * t ** 5 -
                      15 * t ** 4 +
                      10 * t ** 3;


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
                    Exact final rotation.
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
                    Return moving cubies to the
                    cube root while preserving
                    their world transforms.
                */
                for (
                    const cubie of this.moving
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


/*
    animation.js imports THREE from here.
*/
export { THREE };
