import './style.css'
import L from 'leaflet'

// Map Themes
const MAP_THEMES = {
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
  sea: 'https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}',
  'night-vision': 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
};

const defaultCenter = [49.0342, -57.5955]; 
const defaultZoom = 13;

// --- Initialize Maps ---
const primaryMap = L.map('primary-map', {
  zoomControl: true,
  minZoom: 5,
  maxZoom: 18,
  zoomAnimation: false // Snappier for tactical feel
}).setView(defaultCenter, defaultZoom);

const minimapOptions = {
  zoomControl: false, attributionControl: false, dragging: false, 
  touchZoom: false, scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false,
  zoomAnimation: false
};

const secondaryMap1 = L.map('secondary-map-1', minimapOptions).setView(defaultCenter, defaultZoom);
const secondaryMap2 = L.map('secondary-map-2', minimapOptions).setView(defaultCenter, defaultZoom);

let currentTiles = [];

function setMapTiles(themeKey) {
  const url = MAP_THEMES[themeKey] || MAP_THEMES.dark;
  
  // Remove old tiles
  currentTiles.forEach(t => t.remove());
  currentTiles = [];

  // Add new tiles
  currentTiles.push(L.tileLayer(url, { maxZoom: 20 }).addTo(primaryMap));
  currentTiles.push(L.tileLayer(url, { maxZoom: 20 }).addTo(secondaryMap1));
  currentTiles.push(L.tileLayer(url, { maxZoom: 20 }).addTo(secondaryMap2));
}

// --- Theme Switcher Logic ---
const themeSelect = document.getElementById('theme-select');

function applyTheme(theme) {
  let activeTheme = theme;
  
  if (theme === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    activeTheme = prefersDark ? 'dark' : 'light';
  }

  // Update CSS Variables
  document.documentElement.setAttribute('data-theme', activeTheme);
  
  // Update Map Tiles
  setMapTiles(activeTheme);
}

// Listen for dropdown changes
themeSelect.addEventListener('change', (e) => {
  const newTheme = e.target.value;
  localStorage.setItem('cmd-theme', newTheme);
  applyTheme(newTheme);
});

// Load saved theme or default
const savedTheme = localStorage.getItem('cmd-theme') || 'dark';
themeSelect.value = savedTheme;
applyTheme(savedTheme);


// --- Weather Radar Logic (RainViewer) ---
const radarToggle = document.getElementById('radar-toggle');
let radarLayer = null;

async function toggleRadar() {
  if (radarToggle.checked) {
    try {
      // Fetch latest radar timestamps
      const res = await fetch('https://api.rainviewer.com/public/weather-maps.json');
      const data = await res.json();
      const latestPath = data.radar.past[data.radar.past.length - 1].path;
      const radarUrl = `${data.host}${latestPath}/256/{z}/{x}/{y}/2/1_1.png`;
      
      radarLayer = L.tileLayer(radarUrl, {
        opacity: 0.6,
        zIndex: 1000
      });
      radarLayer.addTo(primaryMap);
    } catch (e) {
      console.error("Failed to load radar:", e);
      addFeedAlert("SYS ALERT: RADAR OFFLINE");
      radarToggle.checked = false;
    }
  } else {
    if (radarLayer) {
      radarLayer.remove();
      radarLayer = null;
    }
  }
}

radarToggle.addEventListener('change', toggleRadar);


// --- Open-Meteo Weather HUD Logic ---
const weatherReadout = document.getElementById('weather-readout');
let weatherDebounceTimer;

async function fetchWeather(lat, lng) {
  weatherReadout.innerHTML = `SCANNING ATMOSPHERE...`;
  try {
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,wind_speed_10m,wind_direction_10m,surface_pressure`);
    const data = await res.json();
    
    if (data && data.current) {
      const t = data.current.temperature_2m;
      const ws = data.current.wind_speed_10m;
      const wd = data.current.wind_direction_10m;
      const sp = data.current.surface_pressure;
      
      weatherReadout.innerHTML = `
        TEMP: <span class="val">${t}°C</span><br>
        WIND: <span class="val">${ws} km/h @ ${wd}°</span><br>
        PRES: <span class="val">${sp} hPa</span>
      `;
    }
  } catch (e) {
    weatherReadout.innerHTML = `<span style="color:var(--danger-color)">SENSOR INTERFERENCE DETECTED</span>`;
  }
}

function handleWeatherUpdate() {
  clearTimeout(weatherDebounceTimer);
  weatherDebounceTimer = setTimeout(() => {
    const center = primaryMap.getCenter();
    fetchWeather(center.lat.toFixed(4), center.lng.toFixed(4));
  }, 1000); // Wait 1 second after panning stops to fetch
}


// --- Synchronization & Coordinates ---
const coordReadout = document.getElementById('coord-readout');

function updateCoordinates() {
  const center = primaryMap.getCenter();
  const lat = center.lat.toFixed(4);
  const lng = center.lng.toFixed(4);
  coordReadout.innerHTML = `LAT: ${lat}<br>LON: ${lng}`;
}

let isSyncing = false;
function syncMaps() {
  if (isSyncing) return;
  isSyncing = true;
  
  const center = primaryMap.getCenter();
  const zoom = primaryMap.getZoom();
  
  secondaryMap1.setView(center, zoom, { animate: false });
  secondaryMap2.setView(center, zoom, { animate: false });
  
  updateCoordinates();
  isSyncing = false;
}

primaryMap.on('move', syncMaps);
primaryMap.on('moveend', handleWeatherUpdate); // Trigger weather fetch on pan end
primaryMap.on('zoom', syncMaps);
updateCoordinates();
handleWeatherUpdate(); // Initial fetch


// --- Clock Logic ---
const zuluEl = document.getElementById('time-zulu');
const localEl = document.getElementById('time-local');

function updateClock() {
  const now = new Date();
  
  // Zulu time
  const zh = String(now.getUTCHours()).padStart(2, '0');
  const zm = String(now.getUTCMinutes()).padStart(2, '0');
  const zs = String(now.getUTCSeconds()).padStart(2, '0');
  zuluEl.textContent = `${zh}:${zm}:${zs}Z`;

  // Local time
  const lh = String(now.getHours()).padStart(2, '0');
  const lm = String(now.getMinutes()).padStart(2, '0');
  const ls = String(now.getSeconds()).padStart(2, '0');
  localEl.textContent = `${lh}:${lm}:${ls} LOC`;
}
setInterval(updateClock, 1000);
updateClock();

// --- Live Intel Feed ---
const feedEl = document.getElementById('activity-feed');
const mockMessages = [
  "SENSOR PING DETECTED",
  "UNIT 7 EN ROUTE TO SECTOR",
  "BUOY TELEMETRY UPDATED",
  "SCANNING REGION...",
  "COMMUNICATION LINK ESTABLISHED",
  "ANOMALY DETECTED AT 49.03, -57.59",
  "EMERGENCY FREQUENCY MONITORING ACTIVE"
];

function addFeedMessage() {
  const msg = mockMessages[Math.floor(Math.random() * mockMessages.length)];
  const isAlert = Math.random() > 0.8;
  
  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
  
  const li = document.createElement('li');
  if (isAlert) li.className = 'alert';
  li.innerHTML = `<span class="timestamp">[${timeStr}]</span> ${isAlert ? 'WARNING: ' : ''}${msg}`;
  
  feedEl.appendChild(li);
  
  if (feedEl.children.length > 6) {
    feedEl.removeChild(feedEl.firstChild);
  }
}
setInterval(addFeedMessage, 3500);

function addFeedAlert(msg) {
  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
  const li = document.createElement('li');
  li.className = 'alert';
  li.innerHTML = `<span class="timestamp">[${timeStr}]</span> WARNING: ${msg}`;
  feedEl.appendChild(li);
  if (feedEl.children.length > 6) feedEl.removeChild(feedEl.firstChild);
}


// --- Load Data Layers with Radar Blips ---
const buoyIcon = L.divIcon({
  className: 'radar-blip blip-red',
  iconSize: [20, 20],
  iconAnchor: [10, 10]
});

const emergencyIcon = L.divIcon({
  className: 'radar-blip blip-cyan',
  iconSize: [20, 20],
  iconAnchor: [10, 10]
});

// Buoys
function buoysPopup(feature, layer) {
  const id = feature.properties['id'] || 'N/A';
  const name = feature.properties['Buoys'] || 'Unnamed Buoy';
  layer.bindPopup(`<strong>TACTICAL BUOY</strong><br/>ID: ${id}<br/>NAME: ${name}`);
}

if (typeof json_Buoys_2 !== 'undefined') {
  L.geoJSON(json_Buoys_2, {
    pointToLayer: (feature, latlng) => L.marker(latlng, { icon: buoyIcon }),
    onEachFeature: buoysPopup
  }).addTo(primaryMap);

  L.geoJSON(json_Buoys_2, {
    pointToLayer: (feature, latlng) => L.marker(latlng, { icon: buoyIcon })
  }).addTo(secondaryMap1);
}

// Emergency Services
function emergencyPopup(feature, layer) {
  const id = feature.properties['id'] || 'N/A';
  const name = feature.properties['EMS Loc'] || 'Emergency Service';
  layer.bindPopup(`<strong>EMERGENCY UNIT</strong><br/>ID: ${id}<br/>LOC: ${name}`);
}

if (typeof json_emergency_3 !== 'undefined') {
  L.geoJSON(json_emergency_3, {
    pointToLayer: (feature, latlng) => L.marker(latlng, { icon: emergencyIcon }),
    onEachFeature: emergencyPopup
  }).addTo(primaryMap);

  L.geoJSON(json_emergency_3, {
    pointToLayer: (feature, latlng) => L.marker(latlng, { icon: emergencyIcon })
  }).addTo(secondaryMap2);
}

setTimeout(() => {
  primaryMap.invalidateSize();
  secondaryMap1.invalidateSize();
  secondaryMap2.invalidateSize();
}, 100);
