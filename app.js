import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const app = document.getElementById("app");
const cta = document.getElementById("cta");
const panel = document.getElementById("panel");
const statusLine = document.createElement("p");
statusLine.id = "status";
statusLine.textContent = "Loading character...";
panel.appendChild(statusLine);

const setStatus = (message) => {
    statusLine.textContent = message;
};

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1220);

const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    200
);

const ambient = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambient);

const sun = new THREE.DirectionalLight(0xffffff, 1.1);
sun.position.set(6, 12, 6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 0.5;
sun.shadow.camera.far = 50;
sun.shadow.camera.left = -20;
sun.shadow.camera.right = 20;
sun.shadow.camera.top = 20;
sun.shadow.camera.bottom = -20;
scene.add(sun);

const groundGeo = new THREE.PlaneGeometry(200, 200);
const groundMat = new THREE.MeshStandardMaterial({
    color: 0x1c2637,
    roughness: 0.95,
    metalness: 0.0
});
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const grid = new THREE.GridHelper(200, 200, 0x334155, 0x1f2937);
grid.position.y = 0.01;
scene.add(grid);

const player = new THREE.Object3D();
player.position.set(0, 0, 0);
scene.add(player);

const cameraPivot = new THREE.Object3D();
cameraPivot.position.set(0, 1.28, 0);
player.add(cameraPivot);
cameraPivot.add(camera);
const baseCameraDistance = 3.0;
const minCameraDistance = baseCameraDistance * 0.5;
const maxCameraDistance = baseCameraDistance * 2.0;
let cameraDistance = baseCameraDistance;
camera.position.set(0, 0.2, cameraDistance);

const gltfLoader = new GLTFLoader();
const modelPaths = [
    "./assets/characters/girl_003.glb",
    "./assets/characters/girl_004.glb",
    "./assets/characters/girl_001.glb",
    "./assets/characters/girl_002.glb"
];

let mixer = null;
const actions = {};
let activeAction = null;
let activeActionTimeScale = 1;

const findClipByKeywords = (clips, keywords) => {
    const lower = keywords.map((word) => word.toLowerCase());
    return clips.find((clip) => {
        const name = clip.name.toLowerCase();
        return lower.some((word) => name.includes(word));
    });
};

const playAction = (action, timeScale = 1) => {
    if (!action) return;
    action.reset();
    action.setEffectiveWeight(1);
    action.timeScale = timeScale;
    action.paused = timeScale === 0;
    action.play();
};

const setActiveAction = (action, timeScale = 1) => {
    if (!action) return;
    if (activeAction === action) {
        if (activeActionTimeScale !== timeScale) {
            activeAction.timeScale = timeScale;
            activeAction.paused = timeScale === 0;
            activeActionTimeScale = timeScale;
        }
        return;
    }
    if (activeAction) {
        activeAction.fadeOut(0.15);
    }
    playAction(action, timeScale);
    activeAction = action;
    activeActionTimeScale = timeScale;
};

const loadModel = async () => {
    for (const path of modelPaths) {
        try {
            const gltf = await gltfLoader.loadAsync(path);
            const model = gltf.scene;
            model.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });
            const box = new THREE.Box3().setFromObject(model);
            const size = box.getSize(new THREE.Vector3());
            const maxAxis = Math.max(size.x, size.y, size.z);
            const scale = 1.2 / maxAxis;
            model.scale.setScalar(scale);
            box.setFromObject(model);
            model.position.y = -box.min.y;
            model.rotation.y = Math.PI;
            player.add(model);

            if (gltf.animations && gltf.animations.length > 0) {
                mixer = new THREE.AnimationMixer(model);

                const clips = gltf.animations;
                const defaultClip = clips[0];
                const idleClip = findClipByKeywords(clips, ["idle", "tpose", "rest", "stand"]) || defaultClip;
                const walkClip = findClipByKeywords(clips, ["walk", "move"]) || defaultClip;
                const runClip = findClipByKeywords(clips, ["run", "sprint"]);
                const backClip = findClipByKeywords(clips, ["back", "backward", "reverse"]);
                const turnLeftClip = findClipByKeywords(clips, ["turnleft", "turn_left", "left", "rotateleft"]);
                const turnRightClip = findClipByKeywords(clips, ["turnright", "turn_right", "right", "rotateright"]);

                actions.idle = mixer.clipAction(idleClip);
                actions.walk = mixer.clipAction(walkClip);
                actions.run = runClip ? mixer.clipAction(runClip) : actions.walk;
                actions.walkBack = backClip ? mixer.clipAction(backClip) : actions.walk;
                actions.turnLeft = turnLeftClip ? mixer.clipAction(turnLeftClip) : actions.idle;
                actions.turnRight = turnRightClip ? mixer.clipAction(turnRightClip) : actions.idle;

                setActiveAction(actions.idle, 1);
                const clipNames = clips.map((clip) => clip.name || "(unnamed)").join(", ");
                console.info("Loaded animations:", clipNames);
                setStatus(`Animations loaded: ${clipNames}`);
            } else {
                console.warn("No animations found in GLB. Model will remain in T-pose.");
                setStatus("No animations found in GLB. Model will remain in T-pose.");
            }
            return;
        } catch (error) {
            console.warn("Failed to load model", path, error);
        }
    }
    const fallback = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.35, 1.2, 6, 12),
        new THREE.MeshStandardMaterial({ color: 0x60a5fa })
    );
    fallback.castShadow = true;
    fallback.position.y = 0.9;
    player.add(fallback);
};

await loadModel();

const keys = new Set();
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();
const worldDirection = new THREE.Vector3();
const gravity = -18;
const jumpSpeed = 7.5;
const baseSpeed = 4.0;
const runMultiplier = 1.8;
let isGrounded = true;

const onKeyDown = (event) => {
    keys.add(event.code);
    if (event.code === "Space") {
        event.preventDefault();
    }
};

const onKeyUp = (event) => {
    keys.delete(event.code);
};

window.addEventListener("keydown", onKeyDown);
window.addEventListener("keyup", onKeyUp);

const mouse = {
    enabled: false,
    sensitivity: 0.002,
    pitch: 0
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const onMouseMove = (event) => {
    if (!mouse.enabled) return;
    player.rotation.y -= event.movementX * mouse.sensitivity;
    mouse.pitch = clamp(mouse.pitch - event.movementY * mouse.sensitivity, -1.1, 0.6);
    cameraPivot.rotation.x = mouse.pitch;
};

const requestPointerLock = () => {
    renderer.domElement.requestPointerLock();
};

renderer.domElement.addEventListener("click", () => {
    if (!mouse.enabled) {
        requestPointerLock();
    }
});

document.addEventListener("pointerlockchange", () => {
    mouse.enabled = document.pointerLockElement === renderer.domElement;
    cta.classList.toggle("hidden", mouse.enabled);
});

document.addEventListener("mousemove", onMouseMove);
document.addEventListener(
    "wheel",
    (event) => {
        const zoomSpeed = 0.0025;
        cameraDistance = clamp(
            cameraDistance + event.deltaY * zoomSpeed,
            minCameraDistance,
            maxCameraDistance
        );
        camera.position.z = cameraDistance;
    },
    { passive: true }
);

const clock = new THREE.Clock();

const updateMovement = (delta) => {
    direction.set(0, 0, 0);
    if (keys.has("KeyW")) direction.z -= 1;
    if (keys.has("KeyS")) direction.z += 1;
    if (keys.has("KeyA")) direction.x -= 1;
    if (keys.has("KeyD")) direction.x += 1;

    if (direction.lengthSq() > 0) {
        direction.normalize();
        const speed = baseSpeed * (keys.has("ShiftLeft") || keys.has("ShiftRight") ? runMultiplier : 1);
        worldDirection.copy(direction).applyAxisAngle(new THREE.Vector3(0, 1, 0), player.rotation.y);
        player.position.addScaledVector(worldDirection, speed * delta);
    }

    if (keys.has("Space") && isGrounded) {
        velocity.y = jumpSpeed;
        isGrounded = false;
    }

    velocity.y += gravity * delta;
    player.position.y += velocity.y * delta;

    if (player.position.y <= 0) {
        player.position.y = 0;
        velocity.y = 0;
        isGrounded = true;
    }

        if (mixer) {
            const isMoving =
                keys.has("KeyW") ||
                keys.has("KeyS") ||
                keys.has("KeyA") ||
                keys.has("KeyD");

            setActiveAction(actions.walk, isMoving ? 1 : 0);
        }
};

const animate = () => {
    const delta = Math.min(clock.getDelta(), 0.05);
    updateMovement(delta);
    if (mixer) {
        mixer.update(delta);
    }
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
};

animate();

const onResize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
};

window.addEventListener("resize", onResize);