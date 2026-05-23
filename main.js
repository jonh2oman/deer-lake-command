import './style.css'
import L from 'leaflet'

// Map Themes
const MAP_THEMES = {
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
  sea: 'https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}',
  satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  street: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
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

// Buoys Map is independent and focused on the lake
const secondaryMap1 = L.map('secondary-map-1', {
  zoomControl: true,
  zoomAnimation: false
}).setView([49.0342, -57.5955], 14); // Centered on Buoys

// EMS Map is independent and focused on the Hospital
const secondaryMap2 = L.map('secondary-map-2', {
  zoomControl: true,
  zoomAnimation: false
}).setView([48.92898, -57.92175], 15); // Centered on Hospital

// Radar Map is independent and interactive
const secondaryMap3 = L.map('secondary-map-3', {
  zoomControl: true,
  zoomAnimation: false
}).setView([48.5, -56.0], 6); // Centered on Newfoundland

let currentTiles = [];

function setMapTiles(themeKey) {
  const url = MAP_THEMES[themeKey] || MAP_THEMES.dark;
  
  let maxNative = 20;
  if (themeKey === 'sea') maxNative = 13;
  if (themeKey === 'satellite') maxNative = 18;
  if (themeKey === 'street') maxNative = 19;
  
  currentTiles.forEach(t => t.remove());
  currentTiles = [];
  currentTiles.push(L.tileLayer(url, { maxZoom: 20, maxNativeZoom: maxNative }).addTo(primaryMap));
  currentTiles.push(L.tileLayer(url, { maxZoom: 20, maxNativeZoom: maxNative }).addTo(secondaryMap1));
  currentTiles.push(L.tileLayer(url, { maxZoom: 20, maxNativeZoom: maxNative }).addTo(secondaryMap2));
  currentTiles.push(L.tileLayer(url, { maxZoom: 20, maxNativeZoom: maxNative }).addTo(secondaryMap3));
}

// --- Theme Switcher Logic ---
const themeSelect = document.getElementById('theme-select');

function applyTheme(theme) {
  let activeTheme = theme;
  if (theme === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    activeTheme = prefersDark ? 'dark' : 'light';
  }
  document.documentElement.setAttribute('data-theme', activeTheme);
  setMapTiles(activeTheme);
}

themeSelect.addEventListener('change', (e) => {
  const newTheme = e.target.value;
  localStorage.setItem('cmd-theme', newTheme);
  applyTheme(newTheme);
});

const savedTheme = localStorage.getItem('cmd-theme') || 'dark';
themeSelect.value = savedTheme;
applyTheme(savedTheme);


// --- Functional Intel Feed ---
const feedEl = document.getElementById('activity-feed');

function logToFeed(msg, isAlert = false) {
  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
  
  const li = document.createElement('li');
  if (isAlert) li.className = 'alert';
  
  const prefix = `<span class="timestamp">[${timeStr}]</span> ${isAlert ? 'WARNING: ' : '> '}`;
  li.innerHTML = prefix + msg;
  
  feedEl.appendChild(li);
  
  if (feedEl.children.length > 8) {
    feedEl.removeChild(feedEl.firstChild);
  }
}

setTimeout(() => logToFeed("CMD CTR SYSTEM INITIALIZED"), 1500);


// --- Weather Radar Logic (RainViewer) ---
const radarToggle = document.getElementById('radar-toggle');
let radarLayer = null;

async function toggleRadar() {
  if (radarToggle.checked) {
    logToFeed("SYS: WEATHER RADAR ONLINE");
    try {
      const res = await fetch('https://api.rainviewer.com/public/weather-maps.json');
      const data = await res.json();
      const latestPath = data.radar.past[data.radar.past.length - 1].path;
      const radarUrl = `${data.host}${latestPath}/256/{z}/{x}/{y}/2/1_1.png`;
      
      radarLayer = L.tileLayer(radarUrl, { 
        opacity: 0.6, 
        zIndex: 1000,
        maxNativeZoom: 12
      });
      radarLayer.addTo(primaryMap);
    } catch (e) {
      logToFeed("RADAR UPLINK FAILED", true);
      radarToggle.checked = false;
    }
  } else {
    logToFeed("SYS: WEATHER RADAR OFFLINE");
    if (radarLayer) {
      radarLayer.remove();
      radarLayer = null;
    }
  }
}

radarToggle.addEventListener('change', toggleRadar);

// --- Reticle Toggle Logic ---
const reticleToggle = document.getElementById('reticle-toggle');
const crosshairEl = document.querySelector('.crosshair');

reticleToggle.addEventListener('change', (e) => {
  if (e.target.checked) {
    crosshairEl.style.display = 'block';
    logToFeed("SYS: TARGETING RETICLE ONLINE");
  } else {
    crosshairEl.style.display = 'none';
    logToFeed("SYS: TARGETING RETICLE OFFLINE");
  }
});

// Load Radar on Minimap 3 permanently
async function loadRadarMinimap() {
  try {
    const res = await fetch('https://api.rainviewer.com/public/weather-maps.json');
    const data = await res.json();
    const latestPath = data.radar.past[data.radar.past.length - 1].path;
    const radarUrl = `${data.host}${latestPath}/256/{z}/{x}/{y}/2/1_1.png`;
    
    L.tileLayer(radarUrl, { 
      opacity: 0.8, 
      zIndex: 1000,
      maxNativeZoom: 12 
    }).addTo(secondaryMap3);
  } catch (e) {
    console.error("Minimap Radar Error:", e);
  }
}
loadRadarMinimap();


// --- Open-Meteo Environmental & Marine HUD ---
const weatherReadout = document.getElementById('weather-readout');
let weatherDebounceTimer;

async function fetchWeatherAndMarine(lat, lng) {
  weatherReadout.innerHTML = `SCANNING ATMOSPHERE...`;
  try {
    // 1. Fetch Atmosphere
    const weatherRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,wind_speed_10m,wind_direction_10m,surface_pressure`);
    const weatherData = await weatherRes.json();
    
    // 2. Fetch Marine (Sea State)
    const marineRes = await fetch(`https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lng}&current=wave_height,wave_direction`);
    const marineData = await marineRes.json();
    
    if (weatherData && weatherData.current) {
      const t = weatherData.current.temperature_2m;
      const ws = weatherData.current.wind_speed_10m;
      const wd = weatherData.current.wind_direction_10m;
      const sp = weatherData.current.surface_pressure;
      
      let marineHtml = `WAVES: <span class="val">INLAND/NO DATA</span>`;
      let waveLog = ``;
      
      if (marineData && marineData.current && marineData.current.wave_height !== null) {
        const wh = marineData.current.wave_height;
        const wDir = marineData.current.wave_direction;
        marineHtml = `WAVES: <span class="val">${wh}m @ ${wDir}°</span>`;
        waveLog = ` | SEA: ${wh}m @ ${wDir}°`;
      }
      
      weatherReadout.innerHTML = `
        TEMP: <span class="val">${t}°C</span><br>
        WIND: <span class="val">${ws} km/h @ ${wd}°</span><br>
        PRES: <span class="val">${sp} hPa</span><br>
        ${marineHtml}
      `;

      logToFeed(`TELEMETRY RECV: WIND ${ws}km/h @ ${wd}°${waveLog}`);
    }
  } catch (e) {
    weatherReadout.innerHTML = `<span style="color:var(--danger-color)">SENSOR INTERFERENCE DETECTED</span>`;
    logToFeed("ENV SENSOR INTERFERENCE", true);
  }
}

function handleWeatherUpdate() {
  clearTimeout(weatherDebounceTimer);
  weatherDebounceTimer = setTimeout(() => {
    const center = primaryMap.getCenter();
    const lat = center.lat.toFixed(4);
    const lng = center.lng.toFixed(4);
    logToFeed(`RE-TARGETING SENSORS TO [${lat}, ${lng}]`);
    fetchWeatherAndMarine(lat, lng);
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

primaryMap.on('move', updateCoordinates);
primaryMap.on('moveend', handleWeatherUpdate); // Trigger weather fetch on pan end
primaryMap.on('zoom', updateCoordinates);
updateCoordinates();
handleWeatherUpdate(); // Initial fetch

// --- Expandable Minimap Logic ---
window.toggleExpand = function(panelId, mapVarName) {
  const panel = document.getElementById(panelId);
  const btn = panel.querySelector('.expand-btn');
  const isExpanded = panel.classList.contains('expanded');
  
  if (isExpanded) {
    panel.classList.remove('expanded');
    btn.textContent = '[+]';
    logToFeed(`MINIMIZING ${panelId}`);
  } else {
    panel.classList.add('expanded');
    btn.textContent = '[-]';
    logToFeed(`EXPANDING ${panelId} TO MAIN VIEW`);
  }
  
  // We must tell Leaflet the container size changed so it redraws tiles
  setTimeout(() => {
    if (mapVarName === 'secondaryMap1') secondaryMap1.invalidateSize();
    if (mapVarName === 'secondaryMap2') secondaryMap2.invalidateSize();
    if (mapVarName === 'secondaryMap3') secondaryMap3.invalidateSize();
  }, 300); // match CSS transition duration
};


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
  secondaryMap3.invalidateSize();
}, 100);
