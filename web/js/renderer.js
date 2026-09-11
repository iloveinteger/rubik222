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
    For each Kociemba corner:

    [ U/D, L/R, F/B ]

    These vectors describe the three sticker normals
    in the cubie's local coordinate system.
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


/*
    Rotate a geometry whose local +Z direction is the sticker
    normal so that it faces the correct cube face.
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


function identityColors(identity) {
    return FACE_DIRS[identity].map(faceName);
}


/* =========================================================
   Geometry
   ========================================================= */

/*
    Rounded square sticker.

    Instead of PlaneGeometry, use a very shallow extruded
    rounded rectangle.

    This gives the sticker:
      - rounded corners
      - tiny bevel
      - smoother highlights
      - much less harsh aliasing
*/
function createStickerGeometry() {
    const width = 0.78;
    const radius = 0.065;

    const x = -width / 2;
    const y = -width / 2;
    const w = width;
    const r = radius;

    const shape = new THREE.Shape();

    shape.moveTo(x + r, y);

    shape.lineTo(x + w - r, y);
    shape.quadraticCurveTo(
        x + w,
        y,
        x + w,
        y + r
    );

    shape.lineTo(x + w, y + w - r);
    shape.quadraticCurveTo(
        x + w,
        y + w,
        x + w - r,
        y + w
    );

    shape.lineTo(x + r, y + w);
    shape.quadraticCurveTo(
        x,
        y + w,
        x,
        y + w - r
    );

    shape.lineTo(x, y + r);
    shape.quadraticCurveTo(
        x,
        y,
        x + r,
        y
    );

    const geometry = new THREE.ExtrudeGeometry(
        shape,
        {
            depth: 0.018,

            bevelEnabled: true,

            bevelThickness: 0.009,
            bevelSize: 0.018,
            bevelSegments: 3,

            curveSegments: 8,

            steps: 1,
        }
    );

    /*
        ExtrudeGeometry extends from z = 0 to depth.

        Center it around z = 0 so the sticker position
        represents its center rather than its back surface.
    */
    geometry.translate(
        0,
        0,
        -0.009
    );

    geometry.computeVertexNormals();

    return geometry;
}


function createCubieGeometry() {
    /*
        Slightly rounded cubie body.

        A tiny bevel prevents razor-sharp silhouette edges,
        which are one of the places where aliasing is most visible.
    */
    const geometry = new THREE.BoxGeometry(
        0.96,
        0.96,
        0.96,
        3,
        3,
        3
    );

    return geometry;
}


/* =========================================================
   Materials
   ========================================================= */

function stickerMaterial(face) {
    return new THREE.MeshStandardMaterial({
        color: FACE_COLOR[face],

        roughness: 0.38,
        metalness: 0.0,

        /*
            Keep the sticker colors clean while still allowing
            lighting to create a soft premium appearance.
        */
        side: THREE.FrontSide,
    });
}


function bodyMaterial() {
    return new THREE.MeshStandardMaterial({
        color: 0x101010,

        roughness: 0.58,
        metalness: 0.02,

        side: THREE.FrontSide,
    });
}


/* =========================================================
   Cubie creation
   ========================================================= */

function makeCubie(identity, stickerGeometry) {
    const group = new THREE.Group();

    group.userData.identity = identity;

    const bodyGeometry = createCubieGeometry();
    const body = new THREE.Mesh(
        bodyGeometry,
        bodyMaterial()
    );

    group.add(body);

    /*
        Keep the shared sticker geometry immutable.
        Meshes can safely reuse it.
    */
    group.userData.stickerGeometry = stickerGeometry;

    return group;
}


/* =========================================================
   Renderer
   ========================================================= */

export class CubeRenderer {
    constructor(container) {
        this.container = container;

        /* ---------------------------------------------
           Scene
        --------------------------------------------- */

        this.scene = new THREE.Scene();

        this.scene.background =
            new THREE.Color(0x0b0b0b);


        /* ---------------------------------------------
           Camera
        --------------------------------------------- */

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


        /* ---------------------------------------------
           WebGL renderer
        --------------------------------------------- */

        this.renderer =
            new THREE.WebGLRenderer({
                antialias: true,
                alpha: false,

                powerPreference:
                    "high-performance",

                preserveDrawingBuffer:
                    false,
            });


        /*
            High-DPI rendering.

            3 is intentionally used as the upper limit:
            - 1x : normal displays
            - 2x : Retina / high-DPI
            - 3x : very high-DPI displays

            Going above 3 usually costs a lot of GPU time
            for relatively little visual improvement.
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
            Color management.
        */
        this.renderer.outputColorSpace =
            THREE.SRGBColorSpace;

        /*
            ACES gives smoother highlight rolloff,
            especially on white stickers.
        */
        this.renderer.toneMapping =
            THREE.ACESFilmicToneMapping;

        this.renderer.toneMappingExposure =
            1.0;


        /*
            Better shadow quality if shadows are enabled
            later. Currently no shadow map is required,
            which keeps the renderer lightweight.
        */
        this.renderer.shadowMap.enabled = false;


        container.appendChild(
            this.renderer.domElement
        );


        /* ---------------------------------------------
           Cube root
        --------------------------------------------- */

        this.cubeRoot =
            new THREE.Group();

        this.scene.add(
            this.cubeRoot
        );


        /* ---------------------------------------------
           Shared geometry
        --------------------------------------------- */

        this.stickerGeometry =
            createStickerGeometry();


        /* ---------------------------------------------
           Cubies
        --------------------------------------------- */

        this.cubies =
            Array.from(
                { length: 8 },
                (_, identity) => {
                    const cubie =
                        makeCubie(
                            identity,
                            this.stickerGeometry
                        );

                    this.cubeRoot.add(
                        cubie
                    );

                    return cubie;
                }
            );


        /* ---------------------------------------------
           Lighting
        --------------------------------------------- */

        /*
            Soft overall illumination.
        */
        this.ambientLight =
            new THREE.HemisphereLight(
                0xffffff,
                0x141414,
                1.45
            );

        this.scene.add(
            this.ambientLight
        );


        /*
            Main soft key light.
        */
        this.keyLight =
            new THREE.DirectionalLight(
                0xffffff,
                2.15
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
            Very soft cool fill from behind.
        */
        this.fillLight =
            new THREE.DirectionalLight(
                0xb8c8ff,
                0.42
            );

        this.fillLight.position.set(
            -5,
            2,
            -4
        );

        this.scene.add(
            this.fillLight
        );


        /* ---------------------------------------------
           Animation state
        --------------------------------------------- */

        this.pivot = null;
        this.moving = null;


        /* ---------------------------------------------
           Resize handling
        --------------------------------------------- */

        this.resizeObserver =
            new ResizeObserver(() => {
                this.resize();
            });

        this.resizeObserver.observe(
            container
        );


        this.resize();

        this.state = null;


        /* ---------------------------------------------
           Render loop
        --------------------------------------------- */

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
            Reapply DPR after resizing so the canvas remains
            correctly sized on high-DPI displays.
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
       Rebuild cube from logical state
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


            /*
                Position cubie.
            */
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
                Remove old stickers.

                Child 0 is always the black cubie body.
            */
            while (
                cubie.children.length > 1
            ) {
                cubie.remove(
                    cubie.children[1]
                );
            }


            const colors =
                identityColors(identity);

            const dirs =
                FACE_DIRS[slot];


            /*
                Recreate three stickers.
            */
            for (
                let original = 0;
                original < 3;
                ++original
            ) {
                /*
                    Corner orientation convention:
                    original sticker moves by `co`.
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
                        stickerMaterial(face)
                    );


                /*
                    Place sticker slightly outside
                    the cubie surface.
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
       Animate move
       ===================================================== */

    animateMove(
        move,
        duration = 360
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
                    Smoothstep:
                    zero velocity at both ends.
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
                    Put cubies back into cubeRoot
                    while preserving world transforms.
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
    main.js / animation.js can import THREE
    from this module.
*/
export { THREE };
