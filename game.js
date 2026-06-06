// Scene setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 500, 1000);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 5, -15);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.appendChild(renderer.domElement);

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(100, 100, 50);
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.width = 2048;
directionalLight.shadow.mapSize.height = 2048;
directionalLight.shadow.camera.left = -200;
directionalLight.shadow.camera.right = 200;
directionalLight.shadow.camera.top = 200;
directionalLight.shadow.camera.bottom = -200;
scene.add(directionalLight);

// Physics world
const world = new CANNON.World();
world.gravity.set(0, -9.82, 0);
world.defaultContactMaterial.friction = 0.3;

// Ground
const groundGeometry = new THREE.PlaneGeometry(500, 500);
const groundMaterial = new THREE.MeshLambertMaterial({ color: 0x228b22 });
const ground = new THREE.Mesh(groundGeometry, groundMaterial);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const groundBody = new CANNON.Body({ mass: 0 });
const groundShape = new CANNON.Plane();
groundBody.addShape(groundShape);
groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
world.addBody(groundBody);

// Track (simple oval)
const trackGroup = new THREE.Group();
scene.add(trackGroup);

function createTrack() {
    const trackMaterial = new THREE.MeshLambertMaterial({ color: 0x333333 });
    
    // Outer circle
    const outerGeometry = new THREE.LatheGeometry(
        [
            new THREE.Vector2(0, 0),
            new THREE.Vector2(100, 0),
            new THREE.Vector2(100, 0.5),
            new THREE.Vector2(0, 0.5)
        ],
        64
    );
    
    const track = new THREE.Mesh(outerGeometry, trackMaterial);
    track.rotation.x = Math.PI / 2;
    track.scale.z = 2;
    track.castShadow = true;
    track.receiveShadow = true;
    trackGroup.add(track);
}

createTrack();

// Car object
let car = null;
let carBody = null;
const carAcceleration = 30;
const carMaxSpeed = 50;
const carTurnSpeed = 3;

const loader = new THREE.GLTFLoader();
loader.load('car.glb', (gltf) => {
    car = gltf.scene;
    car.position.set(0, 2, 0);
    car.scale.set(2, 2, 2);
    
    // Setup shadows
    car.traverse((child) => {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });
    
    scene.add(car);
    
    // Create car physics body
    const carShape = new CANNON.Box(new CANNON.Vec3(1, 0.7, 2));
    carBody = new CANNON.Body({ mass: 1 });
    carBody.addShape(carShape);
    carBody.position.set(0, 2, 0);
    carBody.linearDamping = 0.3;
    carBody.angularDamping = 0.3;
    world.addBody(carBody);
    
    document.getElementById('loading').style.display = 'none';
}, undefined, (error) => {
    console.error('Error loading car.glb:', error);
    document.getElementById('loading').textContent = 'Error loading car.glb. Make sure the file is in the same directory.';
});

// Input handling
const keys = {};

window.addEventListener('keydown', (e) => {
    keys[e.key.toLowerCase()] = true;
    
    if (e.key.toLowerCase() === 'r') {
        // Reset car position
        if (carBody) {
            carBody.position.set(0, 2, 0);
            carBody.velocity.set(0, 0, 0);
            carBody.angularVelocity.set(0, 0, 0);
            if (car) car.position.copy(carBody.position);
        }
    }
});

window.addEventListener('keyup', (e) => {
    keys[e.key.toLowerCase()] = false;
});

// Game variables
let carVelocity = 0;
let carRotation = 0;

// Game loop
function animate() {
    requestAnimationFrame(animate);
    
    if (car && carBody) {
        // Handle input
        const forward = keys['w'] || keys['arrowup'];
        const backward = keys['s'] || keys['arrowdown'];
        const left = keys['a'] || keys['arrowleft'];
        const right = keys['d'] || keys['arrowright'];
        const handbrake = keys[' '];
        
        // Acceleration
        if (forward) {
            carVelocity = Math.min(carVelocity + carAcceleration * 0.016, carMaxSpeed);
        } else if (backward) {
            carVelocity = Math.max(carVelocity - carAcceleration * 0.016, -carMaxSpeed / 2);
        } else {
            carVelocity *= 0.95; // Deceleration
        }
        
        // Apply handbrake
        if (handbrake) {
            carVelocity *= 0.9;
        }
        
        // Steering
        if (left && carVelocity !== 0) {
            carRotation += carTurnSpeed * 0.016 * (carVelocity / carMaxSpeed);
        }
        if (right && carVelocity !== 0) {
            carRotation -= carTurnSpeed * 0.016 * (carVelocity / carMaxSpeed);
        }
        
        // Update car direction
        carBody.velocity.x = Math.sin(carRotation) * carVelocity;
        carBody.velocity.z = Math.cos(carRotation) * carVelocity;
        
        // Rotate car to face direction
        carBody.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), carRotation);
        
        // Update car mesh
        car.position.copy(carBody.position);
        car.quaternion.copy(carBody.quaternion);
        
        // Camera follow
        const cameraDistance = 15;
        const cameraHeight = 5;
        const targetX = car.position.x - Math.sin(carRotation) * cameraDistance;
        const targetY = car.position.y + cameraHeight;
        const targetZ = car.position.z - Math.cos(carRotation) * cameraDistance;
        
        camera.position.x += (targetX - camera.position.x) * 0.1;
        camera.position.y += (targetY - camera.position.y) * 0.1;
        camera.position.z += (targetZ - camera.position.z) * 0.1;
        camera.lookAt(car.position.x, car.position.y + 2, car.position.z);
        
        // Update UI
        document.getElementById('speedometer').textContent = 
            `Speed: ${Math.abs(Math.round(carVelocity * 3.6))} km/h`;
        document.getElementById('position').textContent = 
            `Position: (${Math.round(car.position.x)}, ${Math.round(car.position.y)}, ${Math.round(car.position.z)})`;
    }
    
    // Physics step
    world.step(1 / 60);
    
    renderer.render(scene, camera);
}

animate();

// Handle window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});