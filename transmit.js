import { createClient } from '@supabase/supabase-js'
import L from 'leaflet'

// --- Supabase Setup ---
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

// --- State Variables ---
let deviceId = null; 
let dispatcherId = null;
let isBroadcasting = false;
let isSos = false;
let watchId = null;
let uploadInterval = null;

let currentCoords = null;
let currentAccuracy = null;

let selectedIcon = 'blip';
let selectedColor = 'green';

let gpsMode = 'gps'; // 'gps' or 'sim'
let simMap = null;
let simMarker = null;

// --- URL Parsing ---
const urlParams = new URLSearchParams(window.location.search);
dispatcherId = urlParams.get('dispatcher');

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
  if (logList.children.length > 20) {
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
  
  const defaultMock = [49.0342, -57.5955]; // Deer Lake Center
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
  
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
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

function updateSimCoords(lat, lng) {
  currentCoords = { latitude: lat, longitude: lng };
  currentAccuracy = 3.0;
  telemetryLatEl.textContent = lat.toFixed(5);
  telemetryLngEl.textContent = lng.toFixed(5);
  telemetryAccEl.textContent = `+/- ${currentAccuracy.toFixed(1)}m`;
  
  addLog(`SIM SIGNAL: Coordinates set to [${lat.toFixed(5)}, ${lng.toFixed(5)}]`);
  if (isBroadcasting) {
    transmitLocation();
  }
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

// --- Supabase Telemetry Broadcast Logic ---
async function transmitLocation() {
  if (!supabase || !deviceId || !dispatcherId || !currentCoords) return;

  const cadetName = cadetNameInput.value.trim() || 'RESPONDER-UNIT';
  const partyType = partyTypeSelect.value;
  const partySize = parseInt(partySizeInput.value) || 1;
  const status = isSos ? 'sos' : 'active';
  
  const payload = {
    id: deviceId,
    dispatcher_id: dispatcherId,
    name: cadetName,
    latitude: currentCoords.latitude,
    longitude: currentCoords.longitude,
    status: status,
    accuracy: currentAccuracy,
    icon_type: selectedIcon,
    icon_color: selectedColor,
    party_type: partyType,
    party_size: partySize
  };

  try {
    const { error } = await supabase
      .from('cadet_locations')
      .upsert(payload, { onConflict: 'id' });

    if (error) {
      addLog(`TX FAIL: ${error.message}`, 'fail');
    } else {
      addLog(`TX SUCCESS: [${payload.latitude.toFixed(4)}, ${payload.longitude.toFixed(4)}] (${status.toUpperCase()})`, 'success');
    }
  } catch (err) {
    addLog(`TX EXCEPTION: ${err.message}`, 'fail');
  }
}

// --- GPS Sensor Controls ---
function startGpsTracking() {
  if (gpsMode === 'sim') {
    addLog("Simulated GPS Signal Established.");
    if (!currentCoords) {
      currentCoords = { latitude: 49.0342, longitude: -57.5955 };
      currentAccuracy = 5.0;
    }
    telemetryLatEl.textContent = currentCoords.latitude.toFixed(5);
    telemetryLngEl.textContent = currentCoords.longitude.toFixed(5);
    telemetryAccEl.textContent = `+/- ${currentAccuracy.toFixed(1)}m`;
    
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

      telemetryLatEl.textContent = currentCoords.latitude.toFixed(5);
      telemetryLngEl.textContent = currentCoords.longitude.toFixed(5);
      telemetryAccEl.textContent = `+/- ${currentAccuracy.toFixed(1)}m`;

      addLog(`GPS LOCK ACQUIRED: Acc. ${currentAccuracy.toFixed(1)}m`);
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

  if (supabase && deviceId) {
    try {
      await supabase.from('cadet_locations').delete().eq('id', deviceId);
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
  if (!supabase || !deviceId) return;
  
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
    if (supabase && deviceId) {
      try {
        addLog("Deleting active responder blip...");
        await supabase.from('cadet_locations').delete().eq('id', deviceId);
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
