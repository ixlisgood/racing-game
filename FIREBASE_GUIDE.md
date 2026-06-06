# Adding Firebase Multiplayer to Your Freeplay Driving Game

This guide walks you through integrating Firebase Realtime Database to make your game multiplayer, allowing players to see each other driving on the same track.

## Part 1: Firebase Setup

### Step 1: Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click **"Create a project"**
3. Enter your project name (e.g., "driving-game")
4. Disable Google Analytics (optional)
5. Click **Create Project**

### Step 2: Get Your Firebase Config

1. In the Firebase console, go to **Project Settings** (gear icon)
2. Under **Your apps**, click **Web** (the `</>` icon)
3. Register your app
4. Copy the Firebase config object that looks like:

```javascript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT-default-rtdb.firebaseio.com",
  projectId: "YOUR_PROJECT",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "SENDER_ID",
  appId: "APP_ID"
};
```

### Step 3: Enable Realtime Database

1. In Firebase console, go to **Realtime Database**
2. Click **Create Database**
3. Start in **Test mode** (for development)
4. Choose your region (closest to your users)
5. Click **Enable**

⚠️ **Important**: Before deploying, set up proper security rules in the **Rules** tab.

## Part 2: Update Your HTML

Add Firebase SDK and create a new section in your HTML before the closing `</body>` tag:

```html
<!-- Add Firebase before your script -->
<script src="https://www.gstatic.com/firebaseapp/8.10.1/firebase-app.js"></script>
<script src="https://www.gstatic.com/firebaseapp/8.10.1/firebase-database.js"></script>
```

## Part 3: Firebase Implementation

Add this code to your main `<script>` section. Place it BEFORE the camera setup:

```javascript
// ── Firebase Configuration ────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT-default-rtdb.firebaseio.com",
  projectId: "YOUR_PROJECT",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "SENDER_ID",
  appId: "APP_ID"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// ── Multiplayer State ────────────────────────────────────────────────────────
let playerId = 'player_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
let otherPlayers = new Map(); // Map of playerId -> { mesh, state }
const playerDataRef = database.ref('players');

// Called when we need to update our position on Firebase
function publishPlayerState() {
  playerDataRef.child(playerId).set({
    pos: { x: pState.pos.x, y: pState.pos.y, z: pState.pos.z },
    heading: pState.heading,
    speed: pState.speed,
    gear: pState.gear,
    rpm: pState.rpm,
    timestamp: firebase.database.ServerValue.TIMESTAMP
  }).catch(err => console.error('Failed to publish position:', err));
}

// Called when other players' data arrives
function updateOtherPlayers(snapshot) {
  const playersData = snapshot.val() || {};

  // Create/update remote player meshes
  for (const id in playersData) {
    if (id === playerId) continue; // Skip yourself

    const data = playersData[id];
    
    // Skip if data is too old (stale)
    if (Date.now() - data.timestamp > 2000) continue;

    if (!otherPlayers.has(id)) {
      // Create new remote player mesh
      const carGroup = new THREE.Group();
      
      // Simple placeholder car (customize as needed)
      const bm = new THREE.MeshStandardMaterial({ 
        color: Math.random() * 0xffffff, 
        metalness: 0.6, 
        roughness: 0.3 
      });
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.38, 4.4), bm);
      body.position.y = 0.28;
      carGroup.add(body);
      
      const pod = new THREE.Mesh(
        new THREE.BoxGeometry(0.7, 0.42, 2),
        new THREE.MeshStandardMaterial({ color: 0x111111 })
      );
      pod.position.set(0, 0.62, 0.15);
      carGroup.add(pod);
      
      // Wheels
      const wheels = [];
      const wgeo = new THREE.CylinderGeometry(0.37, 0.37, 0.44, 10);
      const wmat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
      const wheelPositions = [
        [0.93, 0.37, 1.55],
        [-0.93, 0.37, 1.55],
        [0.93, 0.37, -1.55],
        [-0.93, 0.37, -1.55]
      ];
      
      wheelPositions.forEach(pos => {
        const w = new THREE.Mesh(wgeo, wmat);
        w.rotation.z = Math.PI / 2;
        w.position.set(...pos);
        carGroup.add(w);
        wheels.push(w);
      });

      carGroup.traverse(c => {
        if (c.isMesh) {
          c.castShadow = true;
          c.receiveShadow = true;
        }
      });

      scene.add(carGroup);
      
      otherPlayers.set(id, {
        mesh: carGroup,
        wheels: wheels,
        lastUpdate: Date.now(),
        smoothPos: new THREE.Vector3(data.pos.x, data.pos.y, data.pos.z),
        smoothHeading: data.heading,
        data: data
      });
    }

    // Update existing remote player
    const player = otherPlayers.get(id);
    player.data = data;
    player.lastUpdate = Date.now();
    
    // Smooth position interpolation (for smooth movement)
    const targetPos = new THREE.Vector3(data.pos.x, data.pos.y, data.pos.z);
    player.smoothPos.lerp(targetPos, 0.15);
    player.mesh.position.copy(player.smoothPos);
    
    // Smooth heading interpolation
    let headingDiff = data.heading - player.smoothHeading;
    while (headingDiff > Math.PI) headingDiff -= Math.PI * 2;
    while (headingDiff < -Math.PI) headingDiff += Math.PI * 2;
    player.smoothHeading += headingDiff * 0.15;
    player.mesh.rotation.y = player.smoothHeading + MODEL_YAW_OFFSET;
  }

  // Remove players who haven't updated recently
  for (const [id, player] of otherPlayers) {
    if (Date.now() - player.lastUpdate > 3000) {
      scene.remove(player.mesh);
      otherPlayers.delete(id);
    }
  }
}

// Listen to all players' positions
playerDataRef.on('value', updateOtherPlayers);

// Clean up when player leaves
window.addEventListener('beforeunload', () => {
  playerDataRef.child(playerId).remove();
  playerDataRef.off('value', updateOtherPlayers);
});
```

### Step 4: Update Your Render Loop

Modify the render loop to publish your position periodically. Find the `animate()` function and add this inside the `if (ready)` block:

```javascript
// Publish position every 100ms (10 times per second)
if (!window.lastPublish || Date.now() - window.lastPublish > 100) {
  publishPlayerState();
  window.lastPublish = Date.now();
}
```

**Example location in the render loop:**

```javascript
if (ready) {
  const thr = (K.has('KeyW') || K.has('ArrowUp'))    ? 1 : 0;
  const brk = (K.has('KeyS') || K.has('ArrowDown'))  ? 1 : 0;
  const str = (K.has('KeyA') || K.has('ArrowLeft'))  ? 1
            : (K.has('KeyD') || K.has('ArrowRight')) ?  -1 : 0;

  physStep(pState, dt, thr, brk, str);

  // ADD THIS:
  if (!window.lastPublish || Date.now() - window.lastPublish > 100) {
    publishPlayerState();
    window.lastPublish = Date.now();
  }

  // ... rest of render loop
}
```

## Part 4: Firebase Security Rules

⚠️ **Critical for production** - Replace test mode rules with these:

In Firebase Console → Realtime Database → Rules tab, set:

```json
{
  "rules": {
    "players": {
      "$uid": {
        ".read": true,
        ".write": "$uid === auth.uid || !auth.uid",
        ".validate": "newData.hasChildren(['pos', 'heading', 'speed', 'gear', 'rpm', 'timestamp'])",
        "pos": {
          ".validate": "newData.hasChildren(['x', 'y', 'z'])"
        }
      }
    }
  }
}
```

For better security with authentication:

```json
{
  "rules": {
    "players": {
      "$uid": {
        ".read": true,
        ".write": "$uid === auth.uid",
        ".validate": "newData.hasChildren(['pos', 'heading', 'speed', 'gear', 'rpm', 'timestamp'])",
        "pos": {
          ".validate": "newData.hasChildren(['x', 'y', 'z'])"
        }
      }
    }
  }
}
```

## Part 5: Add Authentication (Optional but Recommended)

```javascript
// Add Firebase Auth to your config script:
<script src="https://www.gstatic.com/firebaseapp/8.10.1/firebase-auth.js"></script>

// Then add this before the players setup:
firebase.auth().signInAnonymously()
  .then(() => {
    console.log('Signed in anonymously');
  })
  .catch(err => console.error('Auth error:', err));
```

## Performance Optimization Tips

1. **Reduce update frequency**: Currently sending every 100ms. Increase to 150-200ms for less bandwidth
2. **Use geographic regions**: Choose Firebase region closest to your players
3. **Cull distant players**: Only render/update players within X distance:

```javascript
// Add to updateOtherPlayers function:
const distToPlayer = pState.pos.distanceTo(
  new THREE.Vector3(data.pos.x, data.pos.y, data.pos.z)
);
if (distToPlayer > 500) continue; // Skip if too far
```

4. **Lazy wheel rotation**: Update wheels only for nearby players

## Debugging

Add this to your console to monitor:

```javascript
// Check active players
playerDataRef.once('value', (snap) => console.log('Players:', snap.val()));

// Monitor your own updates
playerDataRef.child(playerId).on('value', (snap) => {
  console.log('Your position updated:', snap.val());
});
```

## Common Issues

**Players not showing up:**
- Check Firebase config is correct
- Verify Database URL in config matches your Firebase project
- Check browser console for errors
- Ensure Rules allow reads/writes

**High latency:**
- Reduce update frequency
- Check Firebase region
- Limit players per room (implement later)

**Cars jittering:**
- Reduce `lerp` factor (currently 0.15) for smoother motion
- Increase update frequency slightly

## Next Steps: Advanced Features

1. **Rooms/Lobbies**: Add a `roomId` field to only sync players in same room
2. **Chat**: Send messages through Firebase database or Realtime listeners
3. **Persistent Stats**: Store high scores in Firestore
4. **Player Names**: Add displayName and render above cars
5. **Collision Detection**: Sync collision events between players

## Deployment Checklist

- [ ] Replace firebase config with your real credentials
- [ ] Set up proper security rules (not test mode)
- [ ] Enable authentication method
- [ ] Test with multiple browser tabs/windows
- [ ] Monitor Firebase usage (free tier has limits)
- [ ] Set up billing alerts
- [ ] Test on mobile
- [ ] Check network throttling at 3G speeds
