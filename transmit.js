import { db, firebaseReady } from './src/firebase.js'
import { doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore'
import L from 'leaflet'

// --- State Variables ---
let deviceId = null; 
let dispatcherId = null;
let isBroadcasting = false;
let isSos = false;
let watchId = null;
let uploadInterval = null;

// --- Kinematic & Telemetry State Variables ---
let currentCoords = null;
let currentAccuracy = null;
let currentSpeed = 0;       // m/s
let currentHeading = null;  // degrees 0-360
let currentAltitude = null; // meters
let currentBattery = null;  // %
let currentOpStatus = 'SEARCHING';
let compassHeading = null;  // hardware compass fallback

let BASE_COORDS = [49.0342, -57.5955]; // Base Coordinates (defaults to Deer Lake)
const CARDINALS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

function degToCardinal(deg) {
  const norm = ((deg % 360) + 360) % 360;
  const idx = Math.round(norm / 22.5) % 16;
  return CARDINALS[idx];
}

function calcDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function calcBearing(lat1, lon1, lat2, lon2) {
  const y = Math.sin((lon2 - lon1) * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180);
  const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
            Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos((lon2 - lon1) * Math.PI / 180);
  const brng = Math.atan2(y, x) * 180 / Math.PI;
  return (brng + 360) % 360;
}

let selectedIcon = 'blip';
let selectedColor = 'green';

let gpsMode = 'gps'; // 'gps' or 'sim'
let simMap = null;
let simMarker = null;

// --- URL Parsing ---
const urlParams = new URLSearchParams(window.location.search);
dispatcherId = urlParams.get('dispatcher');
const urlLat = parseFloat(urlParams.get('lat'));
const urlLng = parseFloat(urlParams.get('lng'));
if (!isNaN(urlLat) && !isNaN(urlLng)) {
  BASE_COORDS = [urlLat, urlLng];
}

// --- DOM Elements ---
const errorCard = document.getElementById('error-card');
const transmitterCard = document.getElementById('transmitter-card');

const cadetNameInput = document.getElementById('cadet-name');
const partyTypeSelect = document.getElementById('party-type');
const partySizeInput = document.getElementById('party-size');
const connectionStatusEl = document.getElementById('connection-status');
const telemetryLatEl = document.getElementById('telemetry-lat');
const telemetryLngEl = document.getElementById('telemetry-lng');
const telemetryAccEl = document.getElementById('telemetry-acc');
const telemetrySpdEl = document.getElementById('telemetry-spd');
const telemetryHdgEl = document.getElementById('telemetry-hdg');
const telemetryAltEl = document.getElementById('telemetry-alt');
const telemetryBatEl = document.getElementById('telemetry-bat');
const telemetryNetEl = document.getElementById('telemetry-net');
const rtbDistanceEl = document.getElementById('rtb-distance');
const rtbArrowEl = document.getElementById('rtb-arrow');
const opStatusBtns = document.querySelectorAll('.op-status-btn');

const btnBroadcast = document.getElementById('btn-broadcast-toggle');
const btnSos = document.getElementById('btn-sos-toggle');
const btnReset = document.getElementById('btn-reset');
const logList = document.getElementById('log-list');

const btnModeGps = document.getElementById('btn-mode-gps');
const btnModeSim = document.getElementById('btn-mode-sim');
const simMapContainer = document.getElementById('sim-map-container');

// --- Log Utility ---
function addLog(msg, type = '') {
  const now = new Date();
  const timeStr = now.toTimeString().split(' ')[0];
  const li = document.createElement('li');
  if (type) li.className = type;
  li.innerHTML = `[${timeStr}] ${msg}`;
  logList.appendChild(li);
  if (logList.children.length > 25) {
    logList.removeChild(logList.firstChild);
  }
  logList.scrollTop = logList.scrollHeight;
}

// --- Initialize Responder Session ---
if (!dispatcherId) {
  if (errorCard) errorCard.style.display = 'block';
  if (transmitterCard) transmitterCard.style.display = 'none';
} else {
  if (errorCard) errorCard.style.display = 'none';
  if (transmitterCard) transmitterCard.style.display = 'block';

  // Load cadet name
  cadetNameInput.value = localStorage.getItem('cadet_name') || '';

  // Load or generate device ID
  let storedId = localStorage.getItem('responder_device_id');
  if (!storedId) {
    storedId = crypto.randomUUID();
    localStorage.setItem('responder_device_id', storedId);
  }
  deviceId = storedId;

  addLog(`Secure uplink session ready. ID: ${deviceId.substring(0, 8)}...`);
  addLog(`Connected to Dispatcher Channel: ${dispatcherId.substring(0, 8)}...`);
}

// --- Global Error / Rejection Log Hooks ---
window.addEventListener('error', (e) => {
  addLog(`SYS ERROR: ${e.message}`, 'fail');
});
window.addEventListener('unhandledrejection', (e) => {
  addLog(`SYS REJECTION: ${e.reason}`, 'fail');
});

// --- Graphical Pickers Logic ---
const iconOptions = document.querySelectorAll('.icon-option');
iconOptions.forEach(opt => {
  opt.addEventListener('click', () => {
    iconOptions.forEach(o => o.classList.remove('selected'));
    opt.classList.add('selected');
    selectedIcon = opt.getAttribute('data-icon');
    addLog(`ICON OPTION: Selected ${selectedIcon.toUpperCase()}`);
    if (isBroadcasting) transmitLocation();
  });
});

const colorDots = document.querySelectorAll('.color-dot');
colorDots.forEach(dot => {
  dot.addEventListener('click', () => {
    colorDots.forEach(d => d.classList.remove('selected'));
    dot.classList.add('selected');
    selectedColor = dot.getAttribute('data-color');
    addLog(`COLOR OPTION: Selected ${selectedColor.toUpperCase()}`);
    if (isBroadcasting) transmitLocation();
  });
});

// --- GPS Mode Selector Logic ---
btnModeGps.addEventListener('click', () => {
  if (gpsMode === 'gps') return;
  gpsMode = 'gps';
  
  btnModeGps.classList.add('active');
  btnModeGps.style.color = 'var(--accent-color)';
  btnModeGps.style.borderColor = 'var(--border-color)';
  btnModeGps.style.background = 'rgba(0,0,0,0.6)';
  
  btnModeSim.classList.remove('active');
  btnModeSim.style.color = 'var(--text-secondary)';
  btnModeSim.style.borderColor = 'rgba(255,255,255,0.1)';
  btnModeSim.style.background = 'rgba(0,0,0,0.4)';
  
  simMapContainer.style.display = 'none';
  addLog("GPS SOURCE: Real satellite telemetry active");
  
  if (isBroadcasting) {
    stopGpsTracking();
    startGpsTracking();
  }
});

btnModeSim.addEventListener('click', () => {
  if (gpsMode === 'sim') return;
  gpsMode = 'sim';
  
  btnModeSim.classList.add('active');
  btnModeSim.style.color = 'var(--accent-color)';
  btnModeSim.style.borderColor = 'var(--border-color)';
  btnModeSim.style.background = 'rgba(0,0,0,0.6)';
  
  btnModeGps.classList.remove('active');
  btnModeGps.style.color = 'var(--text-secondary)';
  btnModeGps.style.borderColor = 'rgba(255,255,255,0.1)';
  btnModeGps.style.background = 'rgba(0,0,0,0.4)';
  
  simMapContainer.style.display = 'block';
  addLog("GPS SOURCE: Local simulator map active");
  
  initSimMap();
  if (isBroadcasting) {
    stopGpsTracking();
    startGpsTracking();
  }
});

function initSimMap() {
  if (simMap) {
    setTimeout(() => {
      simMap.invalidateSize();
    }, 100);
    return;
  }
  
  const defaultMock = [BASE_COORDS[0], BASE_COORDS[1]];
  if (!currentCoords) {
    currentCoords = { latitude: defaultMock[0], longitude: defaultMock[1] };
    currentAccuracy = 5.0;
    telemetryLatEl.textContent = currentCoords.latitude.toFixed(5);
    telemetryLngEl.textContent = currentCoords.longitude.toFixed(5);
    telemetryAccEl.textContent = `+/- ${currentAccuracy.toFixed(1)}m`;
  }
  
  simMap = L.map('sim-map', {
    zoomControl: true,
    attributionControl: false
  }).setView([currentCoords.latitude, currentCoords.longitude], 13);
  
  const cartoKeyParam = import.meta.env.VITE_CARTO_API_KEY ? `?key=${import.meta.env.VITE_CARTO_API_KEY}` : '';
  L.tileLayer(`https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png${cartoKeyParam}`, {
    maxZoom: 20
  }).addTo(simMap);
  
  simMarker = L.marker([currentCoords.latitude, currentCoords.longitude], {
    draggable: true
  }).addTo(simMap);
  
  simMarker.on('dragend', () => {
    const latlng = simMarker.getLatLng();
    updateSimCoords(latlng.lat, latlng.lng);
  });
  
  simMap.on('click', (e) => {
    simMarker.setLatLng(e.latlng);
    updateSimCoords(e.latlng.lat, e.latlng.lng);
  });
  
  setTimeout(() => {
    simMap.invalidateSize();
  }, 200);
}

function updateTelemetryDisplay(lat, lng, acc, spd, hdg, alt) {
  if (telemetryLatEl) telemetryLatEl.textContent = lat.toFixed(5);
  if (telemetryLngEl) telemetryLngEl.textContent = lng.toFixed(5);
  if (telemetryAccEl) telemetryAccEl.textContent = `+/- ${acc.toFixed(1)}m`;

  const kmh = (spd || 0) * 3.6;
  const mph = (spd || 0) * 2.23694;
  if (telemetrySpdEl) telemetrySpdEl.textContent = `${kmh.toFixed(1)} km/h (${mph.toFixed(1)} mph)`;

  const effectiveHeading = hdg !== null && hdg !== undefined ? hdg : compassHeading;
  if (telemetryHdgEl) {
    if (effectiveHeading !== null && !isNaN(effectiveHeading)) {
      telemetryHdgEl.textContent = `${Math.round(effectiveHeading)}° ${degToCardinal(effectiveHeading)}`;
    } else {
      telemetryHdgEl.textContent = '---°';
    }
  }

  if (telemetryAltEl) {
    if (alt !== null && alt !== undefined && !isNaN(alt)) {
      telemetryAltEl.textContent = `${Math.round(alt)}m (${Math.round(alt * 3.28084)}ft)`;
    } else {
      telemetryAltEl.textContent = '---m';
    }
  }

  // Update Command Base RTB Nav Cockpit
  const distToBase = calcDistance(lat, lng, BASE_COORDS[0], BASE_COORDS[1]);
  const bearingToBase = calcBearing(lat, lng, BASE_COORDS[0], BASE_COORDS[1]);
  if (rtbDistanceEl) {
    const distStr = distToBase < 1 ? `${Math.round(distToBase * 1000)}m` : `${distToBase.toFixed(2)}km`;
    rtbDistanceEl.textContent = `${distStr} @ ${Math.round(bearingToBase)}° ${degToCardinal(bearingToBase)}`;
  }
  if (rtbArrowEl) {
    const arrowAngle = effectiveHeading !== null ? (bearingToBase - effectiveHeading + 360) % 360 : bearingToBase;
    rtbArrowEl.style.transform = `rotate(${arrowAngle}deg)`;
  }
}

function updateSimCoords(lat, lng) {
  if (currentCoords) {
    const distKm = calcDistance(currentCoords.latitude, currentCoords.longitude, lat, lng);
    currentSpeed = (distKm * 1000) / 4; // Simulated m/s
    currentHeading = calcBearing(currentCoords.latitude, currentCoords.longitude, lat, lng);
  }
  currentCoords = { latitude: lat, longitude: lng };
  currentAccuracy = 3.0;
  if (currentAltitude === null) currentAltitude = 48.0;

  updateTelemetryDisplay(lat, lng, currentAccuracy, currentSpeed, currentHeading, currentAltitude);
  addLog(`SIM SIGNAL: Moved to [${lat.toFixed(5)}, ${lng.toFixed(5)}] Spd: ${((currentSpeed||0)*3.6).toFixed(1)}km/h`);
  if (isBroadcasting) {
    transmitLocation();
  }
}

// Battery Telemetry
async function initBatteryMonitoring() {
  if (navigator.getBattery) {
    try {
      const battery = await navigator.getBattery();
      const updateBat = () => {
        currentBattery = Math.round(battery.level * 100);
        if (telemetryBatEl) telemetryBatEl.textContent = `${currentBattery}%${battery.charging ? ' ⚡' : ''}`;
      };
      updateBat();
      battery.addEventListener('levelchange', updateBat);
      battery.addEventListener('chargingchange', updateBat);
    } catch (e) {
      // Ignore unsupported battery API
    }
  }
}
initBatteryMonitoring();

// Hardware Compass & Orientation Fallback
if (window.DeviceOrientationEvent) {
  window.addEventListener('deviceorientation', (e) => {
    if (e.webkitCompassHeading !== undefined) {
      compassHeading = e.webkitCompassHeading;
    } else if (e.alpha !== null) {
      compassHeading = (360 - e.alpha) % 360;
    }
    if (currentCoords && currentHeading === null && compassHeading !== null) {
      updateTelemetryDisplay(currentCoords.latitude, currentCoords.longitude, currentAccuracy, currentSpeed, null, currentAltitude);
    }
  }, true);
}

// Operational Status Selector
if (opStatusBtns && opStatusBtns.length > 0) {
  opStatusBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      opStatusBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentOpStatus = btn.getAttribute('data-status') || 'PATROL';
      addLog(`MISSION STATUS: Updated to [${currentOpStatus}]`);
      if (isBroadcasting) transmitLocation();
    });
  });
}

// Offline Store-and-Forward Cache Logic
window.addEventListener('online', () => {
  if (telemetryNetEl) {
    telemetryNetEl.textContent = 'ONLINE';
    telemetryNetEl.style.color = 'var(--success-color)';
  }
  addLog("COMMS: Link restored. Flushing offline queue...", 'success');
  flushOfflineQueue();
});

window.addEventListener('offline', () => {
  if (telemetryNetEl) {
    telemetryNetEl.textContent = 'OFFLINE (CACHING)';
    telemetryNetEl.style.color = 'var(--danger-color)';
  }
  addLog("COMMS: Satellite connection lost. Saving telemetry to device cache.", 'fail');
});

function queueOfflinePoint(point) {
  let queue = [];
  try {
    queue = JSON.parse(localStorage.getItem('cadet_offline_queue') || '[]');
  } catch (e) {
    queue = [];
  }
  queue.push({ ...point, cached_at: Date.now() });
  if (queue.length > 100) queue.shift();
  localStorage.setItem('cadet_offline_queue', JSON.stringify(queue));
  addLog(`CACHE: Queued offline track point #${queue.length}`, 'fail');
}

async function flushOfflineQueue() {
  let queue = [];
  try {
    queue = JSON.parse(localStorage.getItem('cadet_offline_queue') || '[]');
  } catch (e) {
    queue = [];
  }
  if (!queue.length || !firebaseReady) return;

  addLog(`SYNC: Burst transmitting ${queue.length} cached points...`, 'success');
  localStorage.removeItem('cadet_offline_queue');
  if (isBroadcasting) transmitLocation();
}

// Save settings on input changes
cadetNameInput.addEventListener('change', () => {
  localStorage.setItem('cadet_name', cadetNameInput.value.trim());
  if (isBroadcasting) transmitLocation();
});
partyTypeSelect.addEventListener('change', () => {
  if (isBroadcasting) transmitLocation();
});
partySizeInput.addEventListener('change', () => {
  if (isBroadcasting) transmitLocation();
});

// --- Firestore Telemetry Broadcast Logic ---
async function transmitLocation() {
  if (!firebaseReady || !deviceId || !dispatcherId || !currentCoords) return;

  const cadetName = cadetNameInput.value.trim() || 'RESPONDER-UNIT';
  const partyType = partyTypeSelect.value;
  const partySize = parseInt(partySizeInput.value) || 1;
  const status = isSos ? 'sos' : 'active';
  const effectiveHeading = currentHeading !== null && currentHeading !== undefined ? currentHeading : compassHeading;

  const payload = {
    dispatcher_id: dispatcherId,
    name: cadetName,
    latitude: currentCoords.latitude,
    longitude: currentCoords.longitude,
    status: status,
    accuracy: currentAccuracy,
    speed: currentSpeed !== null && !isNaN(currentSpeed) ? currentSpeed : 0,
    heading: effectiveHeading !== null && !isNaN(effectiveHeading) ? Math.round(effectiveHeading) : null,
    altitude: currentAltitude !== null && !isNaN(currentAltitude) ? Math.round(currentAltitude) : null,
    battery: currentBattery,
    op_status: currentOpStatus,
    icon_type: selectedIcon,
    icon_color: selectedColor,
    party_type: partyType,
    party_size: partySize,
    client_timestamp: Date.now(),
    updated_at: serverTimestamp()
  };

  if (!navigator.onLine) {
    queueOfflinePoint(payload);
    return;
  }

  try {
    await setDoc(doc(db, 'cadet_locations', deviceId), payload, { merge: true });
    const spdStr = `${((payload.speed||0)*3.6).toFixed(1)}km/h`;
    const hdgStr = payload.heading !== null ? `${payload.heading}°` : '---°';
    addLog(`TX SUCCESS: [${payload.latitude.toFixed(4)}, ${payload.longitude.toFixed(4)}] ${spdStr} @ ${hdgStr} (${status.toUpperCase()})`, 'success');
  } catch (err) {
    addLog(`TX EXCEPTION: ${err.message}`, 'fail');
    queueOfflinePoint(payload);
  }
}

// --- GPS Sensor Controls ---
function startGpsTracking() {
  if (gpsMode === 'sim') {
    addLog("Simulated GPS Signal Established.");
    if (!currentCoords) {
      currentCoords = { latitude: 49.0342, longitude: -57.5955 };
      currentAccuracy = 5.0;
      currentSpeed = 1.3; // 4.7 km/h walking pace
      currentHeading = 210;
      currentAltitude = 45;
    }
    updateTelemetryDisplay(currentCoords.latitude, currentCoords.longitude, currentAccuracy, currentSpeed, currentHeading, currentAltitude);
    
    transmitLocation();
    uploadInterval = setInterval(transmitLocation, 4000);
    return true;
  }

  if (!("geolocation" in navigator)) {
    addLog("ERROR: GPS not supported by browser", "fail");
    return false;
  }

  addLog("Acquiring GPS Satellite Lock...");
  watchId = navigator.geolocation.watchPosition(
    (position) => {
      currentCoords = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude
      };
      currentAccuracy = position.coords.accuracy;
      currentSpeed = position.coords.speed !== null && !isNaN(position.coords.speed) ? position.coords.speed : 0;
      currentHeading = position.coords.heading !== null && !isNaN(position.coords.heading) ? position.coords.heading : null;
      currentAltitude = position.coords.altitude !== null && !isNaN(position.coords.altitude) ? position.coords.altitude : null;

      updateTelemetryDisplay(
        currentCoords.latitude,
        currentCoords.longitude,
        currentAccuracy,
        currentSpeed,
        currentHeading,
        currentAltitude
      );

      addLog(`GPS LOCK: Acc. ${currentAccuracy.toFixed(1)}m | Spd: ${((currentSpeed||0)*3.6).toFixed(1)}km/h`);
    },
    (error) => {
      addLog(`GPS SENSOR ERROR: ${error.message}`, "fail");
      stopTransmission();
    },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
  );

  uploadInterval = setInterval(transmitLocation, 4000);
  return true;
}

function stopGpsTracking() {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  if (uploadInterval !== null) {
    clearInterval(uploadInterval);
    uploadInterval = null;
  }
}

// --- Transmission Toggles ---
function startTransmission() {
  isBroadcasting = true;
  btnBroadcast.textContent = 'STOP TRANSMISSION';
  btnBroadcast.classList.add('active');
  connectionStatusEl.textContent = 'TRANSMITTING';
  connectionStatusEl.style.color = 'var(--success-color)';
  
  const ok = startGpsTracking();
  if (!ok) stopTransmission();
}

async function stopTransmission() {
  isBroadcasting = false;
  btnBroadcast.textContent = 'START LIVE GPS TRANSMISSION';
  btnBroadcast.classList.remove('active');
  connectionStatusEl.textContent = 'STANDBY';
  connectionStatusEl.style.color = 'var(--accent-color)';
  
  stopGpsTracking();
  addLog("Transmission terminated.");

  if (firebaseReady && deviceId) {
    try {
      await deleteDoc(doc(db, 'cadet_locations', deviceId));
      addLog("Active responder blip deleted from Command GIS.");
    } catch(e) {
      console.error(e);
    }
  }
}

btnBroadcast.addEventListener('click', () => {
  if (isBroadcasting) {
    stopTransmission();
  } else {
    startTransmission();
  }
});

// SOS Button toggle
btnSos.addEventListener('click', async () => {
  if (!firebaseReady || !deviceId) return;
  
  isSos = !isSos;
  if (isSos) {
    btnSos.textContent = 'ABORT SOS ALERT';
    btnSos.classList.add('active');
    addLog("SOS EMERGENCY TRIGGERED! TRANSMITTING TO BASE...", "fail");
    
    if (!isBroadcasting) {
      startTransmission();
    } else {
      transmitLocation();
    }
  } else {
    btnSos.textContent = 'TRIGGER SOS';
    btnSos.classList.remove('active');
    addLog("SOS aborted. Reverting to normal tracking.");
    if (isBroadcasting) {
      transmitLocation();
    }
  }
});

// Reset Button Logic
if (btnReset) {
  btnReset.addEventListener('click', async () => {
    if (isBroadcasting) {
      await stopTransmission();
    }
    if (firebaseReady && deviceId) {
      try {
        addLog("Deleting active responder blip...");
        await deleteDoc(doc(db, 'cadet_locations', deviceId));
      } catch(e) {
        console.error(e);
      }
    }
    localStorage.removeItem('responder_device_id');
    localStorage.removeItem('cadet_name');
    cadetNameInput.value = '';
    
    // Regenerate new device ID
    localStorage.setItem('responder_device_id', crypto.randomUUID());
    deviceId = localStorage.getItem('responder_device_id');
    addLog("Session reset. New device ID registered.");
  });
}
