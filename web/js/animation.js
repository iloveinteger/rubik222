// Physical-looking entrance/exit controller.
// The cube is pulled toward a central attractor with a spring-damper model.

import { THREE } from "./renderer.js";

export function springMotion({
    object,
    from,
    to = new THREE.Vector3(0, 0, 0),
    initialVelocity = new THREE.Vector3(0, -2, 0),
    duration = 1350,
    stiffness = 42,
    damping = 10,
    gravity = 0,
    onUpdate,
}) {
    const position = from.clone();
    const velocity = initialVelocity.clone();
    const start = performance.now();
    let last = start;

    return new Promise(resolve => {
        const frame = now => {
            const dt = Math.min(0.032, Math.max(0.001, (now - last) / 1000));
            last = now;

            const acceleration = to.clone().sub(position).multiplyScalar(stiffness);
            acceleration.y += gravity;
            acceleration.addScaledVector(velocity, -damping);

            velocity.addScaledVector(acceleration, dt);
            position.addScaledVector(velocity, dt);

            if (onUpdate) {
                onUpdate(position, now - start);
            } else {
                object.position.copy(position);
            }

            const elapsed = now - start;

            const settled =
                elapsed >= duration ||
                (
                    position.distanceTo(to) < 0.008 &&
                    velocity.length() < 0.02
                );

            if (!settled) {
                requestAnimationFrame(frame);
                return;
            }

            // Do not snap directly to the target.
            // Give the final tiny error a short smooth settle.
            const settleStart = performance.now();
            const settleFrom = position.clone();

            const settleFrame = current => {
                const t = Math.min(
                    1,
                    (current - settleStart) / 120
                );

                // Smoothstep
                const e = t * t * (3 - 2 * t);

                const finalPosition = settleFrom.clone().lerp(to, e);

                if (onUpdate) {
                    onUpdate(finalPosition, duration);
                } else {
                    object.position.copy(finalPosition);
                }

                if (t < 1) {
                    requestAnimationFrame(settleFrame);
                } else {
                    if (onUpdate) {
                        onUpdate(to, duration);
                    } else {
                        object.position.copy(to);
                    }

                    resolve();
                }
            };

            requestAnimationFrame(settleFrame);
        };

        requestAnimationFrame(frame);
    });
}

export async function enterCube(renderer) {
    const h = renderer.container.clientHeight;
    const spawnY = Math.max(5.0, 3.8 + h / 260);

    renderer.cubeRoot.position.set(0, spawnY, 0);
    renderer.cubeRoot.rotation.set(-0.32, 0.45, 0.18);

    const startQ = renderer.cubeRoot.quaternion.clone();
    const targetQ = new THREE.Quaternion().identity();

    await springMotion({
        object: renderer.cubeRoot,
        from: renderer.cubeRoot.position.clone(),
        initialVelocity: new THREE.Vector3(0, -2.2, 0),
        stiffness: 42,
        damping: 10,
        gravity: -2.2,
        duration: 1350,

        onUpdate: (position, elapsed) => {
            renderer.cubeRoot.position.copy(position);

            const t = Math.min(1, elapsed / 1350);

            // Smooth rotational settling.
            const eased = t * t * (3 - 2 * t);

            renderer.cubeRoot.quaternion.slerpQuaternions(
                startQ,
                targetQ,
                eased
            );
        },
    });

    renderer.cubeRoot.position.set(0, 0, 0);
    renderer.cubeRoot.quaternion.identity();
}

export async function exitCube(renderer) {
    const start = renderer.cubeRoot.position.clone();

    const h = renderer.container.clientHeight;

    const end = new THREE.Vector3(
        0,
        -Math.max(5.0, 3.8 + h / 260),
        0
    );

    const startTime = performance.now();
    const duration = 620;

    const startQ = renderer.cubeRoot.quaternion.clone();

    return new Promise(resolve => {
        const frame = now => {
            const t = Math.min(
                1,
                (now - startTime) / duration
            );

            const e = t * t;

            renderer.cubeRoot.position.lerpVectors(
                start,
                end,
                e
            );

            const q = new THREE.Quaternion();

            q.setFromAxisAngle(
                new THREE.Vector3(0.7, 0.25, 0.55).normalize(),
                0.9 * t
            );

            renderer.cubeRoot.quaternion
                .copy(startQ)
                .premultiply(q);

            if (t < 1) {
                requestAnimationFrame(frame);
            } else {
                resolve();
            }
        };

        requestAnimationFrame(frame);
    });
}