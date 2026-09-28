import 'leaflet/dist/leaflet.css'
import './style.css'
import L from 'leaflet'
import { db, auth, firebaseReady } from './src/firebase.js'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut
} from 'firebase/auth'

// --- Security: escape untrusted responder-supplied strings before HTML render ---
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// --- CARTO API Key support ---
const cartoKeyParam = import.meta.env.VITE_CARTO_API_KEY ? `?key=${import.meta.env.VITE_CARTO_API_KEY}` : '';

// --- Custom Transparent Map Overlays ---
const OpenSeaMapUrl = 'https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png';
const WaymarkedTrailsUrl = 'https://tile.waymarkedtrails.org/hiking/{z}/{x}/{y}.png';
const OpenTopoMapUrl = 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png';
const CartoDbLabelsUrl = `https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png${cartoKeyParam}`;

const nauticalLayer = L.tileLayer(OpenSeaMapUrl, {
  maxZoom: 18,
  opacity: 0.85,
  zIndex: 900
});

const trailsLayer = L.tileLayer(WaymarkedTrailsUrl, {
  maxZoom: 18,
  opacity: 0.8,
  zIndex: 900
});

const WaymarkedMtbUrl = 'https://tile.waymarkedtrails.org/mtb/{z}/{x}/{y}.png';
const mtbLayer = L.tileLayer(WaymarkedMtbUrl, {
  maxZoom: 18,
  opacity: 0.85,
  zIndex: 900
});

const topoOverlay = L.tileLayer(OpenTopoMapUrl, {
  maxZoom: 17,
  opacity: 0.55,
  zIndex: 890
});

const labelsLayer = L.tileLayer(CartoDbLabelsUrl, {
  maxZoom: 22,
  opacity: 0.9,
  zIndex: 950
});

// Map Themes
const MAP_THEMES = {
  dark: `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png${cartoKeyParam}`,
  light: `https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png${cartoKeyParam}`,
  sea: 'https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}',
  satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  'google-satellite': 'https://mt0.google.com/vt/lyrs=s&hl=en&x={x}&y={y}&z={z}',
  street: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  topo: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
  'night-vision': `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png${cartoKeyParam}`,
  'flir-thermal': `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png${cartoKeyParam}`,
  'cyberpunk': `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png${cartoKeyParam}`
};

// --- Dynamic Canvas Graticule (Lat/Lon Grid) ---
const CanvasGraticule = L.GridLayer.extend({
  createTile: function(coords) {
    const tile = document.createElement('canvas');
    const size = this.getTileSize();
    tile.width = size.x;
    tile.height = size.y;
    const ctx = tile.getContext('2d');
    
    const map = this._map || primaryMap;
    if (!map) return tile;

    const nwPoint = L.point(coords.x * size.x, coords.y * size.y);
    const sePoint = L.point((coords.x + 1) * size.x, (coords.y + 1) * size.y);
    const nw = map.unproject(nwPoint, coords.z);
    const se = map.unproject(sePoint, coords.z);
    
    const zoom = coords.z;
    let gridSpacing;
    if (zoom >= 18) gridSpacing = 0.001;
    else if (zoom >= 17) gridSpacing = 0.002;
    else if (zoom >= 16) gridSpacing = 0.005;
    else if (zoom >= 15) gridSpacing = 0.01;
    else if (zoom >= 14) gridSpacing = 0.02;
    else if (zoom >= 13) gridSpacing = 0.05;
    else if (zoom >= 12) gridSpacing = 0.1;
    else if (zoom >= 11) gridSpacing = 0.2;
    else if (zoom >= 10) gridSpacing = 0.5;
    else if (zoom >= 9) gridSpacing = 1.0;
    else if (zoom >= 8) gridSpacing = 2.0;
    else if (zoom >= 7) gridSpacing = 5.0;
    else if (zoom >= 6) gridSpacing = 10.0;
    else gridSpacing = 20.0;
    
    // Theme-specific colors
    const activeTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    let strokeColor = 'rgba(0, 210, 255, 0.2)';
    let textColor = 'rgba(0, 210, 255, 0.7)';
    
    if (activeTheme === 'light') {
      strokeColor = 'rgba(0, 86, 179, 0.15)';
      textColor = 'rgba(0, 86, 179, 0.7)';
    } else if (activeTheme === 'sea') {
      strokeColor = 'rgba(0, 229, 255, 0.15)';
      textColor = 'rgba(0, 229, 255, 0.7)';
    } else if (activeTheme === 'night-vision') {
      strokeColor = 'rgba(57, 255, 20, 0.15)';
      textColor = 'rgba(57, 255, 20, 0.7)';
    }
    
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1;
    ctx.font = '10px "Share Tech Mono", monospace';
    ctx.fillStyle = textColor;
    
    // Draw latitude lines (horizontal)
    const minLat = Math.min(nw.lat, se.lat);
    const maxLat = Math.max(nw.lat, se.lat);
    const latStart = Math.ceil(minLat / gridSpacing) * gridSpacing;
    
    // Only draw latitude labels on tiles crossing the center longitude of the viewport
    const center = map.getCenter();
    const minLng = Math.min(nw.lng, se.lng);
    const maxLng = Math.max(nw.lng, se.lng);
    const drawLatLabels = (center.lng >= minLng && center.lng <= maxLng);
    
    for (let lat = latStart; lat <= maxLat; lat += gridSpacing) {
      const latPoint = map.project([lat, nw.lng], coords.z);
      const y = latPoint.y - nwPoint.y;
      
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(size.x, y);
      ctx.stroke();
      
      if (drawLatLabels) {
        // Format latitude label
        const latDir = lat >= 0 ? 'N' : 'S';
        const labelText = Math.abs(lat).toFixed(4) + '° ' + latDir;
        ctx.fillText(labelText, 5, y - 3);
      }
    }
    
    // Draw longitude lines (vertical)
    const minLngTile = Math.min(nw.lng, se.lng);
    const maxLngTile = Math.max(nw.lng, se.lng);
    const lngStart = Math.ceil(minLngTile / gridSpacing) * gridSpacing;
    
    // Only draw longitude labels on tiles crossing the center latitude of the viewport
    const minLatTile = Math.min(nw.lat, se.lat);
    const maxLatTile = Math.max(nw.lat, se.lat);
    const drawLngLabels = (center.lat >= minLatTile && center.lat <= maxLatTile);
    
    for (let lng = lngStart; lng <= maxLngTile; lng += gridSpacing) {
      const lngPoint = map.project([nw.lat, lng], coords.z);
      const x = lngPoint.x - nwPoint.x;
      
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, size.y);
      ctx.stroke();
      
      if (drawLngLabels) {
        // Format longitude label
        const lngDir = lng >= 0 ? 'E' : 'W';
        const labelText = Math.abs(lng).toFixed(4) + '° ' + lngDir;
        
        // Label (rotated vertically)
        ctx.save();
        ctx.translate(x + 3, size.y - 5);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText(labelText, 0, 0);
        ctx.restore();
      }
    }
    
    return tile;
  }
});

const DEFAULT_STATION_NAME = "DEER LAKE";
const DEFAULT_BASE_LAT = 49.0342;
const DEFAULT_BASE_LNG = -57.5955;
const DEFAULT_BASE_ZOOM = 13;

function getStationProfile() {
  const name = localStorage.getItem('cmd-station-name') || DEFAULT_STATION_NAME;
  const lat = parseFloat(localStorage.getItem('cmd-default-lat')) || DEFAULT_BASE_LAT;
  const lng = parseFloat(localStorage.getItem('cmd-default-lng')) || DEFAULT_BASE_LNG;
  const zoom = parseInt(localStorage.getItem('cmd-default-zoom'), 10) || DEFAULT_BASE_ZOOM;
  return { name, lat, lng, zoom };
}

const initialStationProfile = getStationProfile();
const defaultCenter = [initialStationProfile.lat, initialStationProfile.lng]; 
const defaultZoom = initialStationProfile.zoom;

// --- Initialize Maps ---
const primaryMap = L.map('primary-map', {
  zoomControl: true,
  minZoom: 5,
  maxZoom: 22,
  zoomAnimation: false // Snappier for tactical feel
}).setView(defaultCenter, defaultZoom);

const graticuleLayer = new CanvasGraticule({ zIndex: 850 });

// --- Cadet GPS Tracking Layer ---
const cadetsLayer = L.layerGroup().addTo(primaryMap);
const cadetMarkers = new Map();
const cadetTrailsLayer = L.layerGroup().addTo(primaryMap);
const cadetTrails = new Map();
const cadetHistories = new Map();
let cadetTrailsEnabled = localStorage.getItem('cmd-cadet-trails') !== 'false';

// --- Dynamic Scale Control ---
let currentScaleMode = 0; // 0 = Both, 1 = Metric, 2 = Imperial
let isScaleVisible = true;
const scaleOptions = [
  { metric: true, imperial: true, position: 'bottomleft', maxWidth: 250 },
  { metric: true, imperial: false, position: 'bottomleft', maxWidth: 250 },
  { metric: false, imperial: true, position: 'bottomleft', maxWidth: 250 }
];

let scaleControl = L.control.scale(scaleOptions[currentScaleMode]).addTo(primaryMap);

function bindScaleClick() {
  const container = scaleControl.getContainer();
  if (!container) return;
  container.style.cursor = 'pointer';
  container.title = 'Click to toggle scale units (Metric/Imperial)';
  
  // Custom HUD styling for the scale - make it larger and chunkier
  container.style.background = 'rgba(0, 0, 0, 0.7)';
  container.style.border = '2px solid var(--border-color)';
  container.style.backdropFilter = 'blur(6px)';
  container.style.padding = '6px 12px';
  container.style.color = 'var(--accent-color)';
  container.style.fontFamily = 'var(--hud-font)';
  container.style.fontSize = '14px';
  container.style.fontWeight = 'bold';
  container.style.boxShadow = '0 0 10px rgba(0,0,0,0.8), inset 0 0 10px rgba(47, 129, 247, 0.2)';
  
  // Style inner lines generated by leaflet
  const lines = container.querySelectorAll('.leaflet-control-scale-line');
  lines.forEach(line => {
    line.style.color = 'var(--accent-color)';
    line.style.border = '2px solid var(--accent-color)';
    line.style.borderTop = 'none';
    line.style.background = 'transparent';
    line.style.textShadow = '0 0 5px var(--accent-glow)';
    line.style.paddingBottom = '4px';
    line.style.paddingTop = '4px';
    line.style.fontSize = '14px';
  });

  container.onclick = (e) => {
    e.stopPropagation();
    primaryMap.removeControl(scaleControl);
    currentScaleMode = (currentScaleMode + 1) % 3;
    scaleControl = L.control.scale(scaleOptions[currentScaleMode]).addTo(primaryMap);
    bindScaleClick();
  };
}
bindScaleClick();

// Visibility Toggle Logic
const scaleToggleBtn = document.getElementById('scale-toggle');
if (scaleToggleBtn) {
  scaleToggleBtn.addEventListener('change', (e) => {
    isScaleVisible = e.target.checked;
    if (isScaleVisible) {
      scaleControl.addTo(primaryMap);
      bindScaleClick();
      logToFeed("SYS: MAP SCALE ONLINE");
    } else {
      primaryMap.removeControl(scaleControl);
      logToFeed("SYS: MAP SCALE OFFLINE");
    }
  });
}

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

// EMS Map is independent and focused on station area emergency services
const secondaryMap2 = L.map('secondary-map-2', {
  zoomControl: true,
  zoomAnimation: false
}).setView([initialStationProfile.lat, initialStationProfile.lng], 13);

// Radar Map is independent and interactive
const secondaryMap3 = L.map('secondary-map-3', {
  zoomControl: true,
  zoomAnimation: false
}).setView([48.5, -56.0], 6); // Centered on Newfoundland

// Forestry Map is independent and focused on Pasadena Forestry Center
const secondaryMap4 = L.map('secondary-map-4', {
  zoomControl: true,
  zoomAnimation: false
}).setView([49.0149167, -57.5865278], 15); // Centered on Pasadena Forestry Center

// Active SOS Alerts Map is focused on active distress signals
const secondaryMap5 = L.map('secondary-map-5', {
  zoomControl: true,
  zoomAnimation: false
}).setView([initialStationProfile.lat, initialStationProfile.lng], 14);

// Feature: Click any minimap to sync the primary map to its exact view
[secondaryMap1, secondaryMap2, secondaryMap3, secondaryMap4, secondaryMap5].forEach(miniMap => {
  miniMap.on('click', () => {
    primaryMap.flyTo(miniMap.getCenter(), miniMap.getZoom(), {
      duration: 0.6,
      easeLinearity: 0.25
    });
  });
});

let currentTiles = [];

function setMapTiles(themeKey) {
  const url = MAP_THEMES[themeKey] || MAP_THEMES.dark;
  
  let maxNative = 20;
  if (themeKey === 'sea') maxNative = 13;
  if (themeKey === 'satellite') maxNative = 15; // ESRI Max resolution in rural areas is 15; stretching beyond prevents error tiles
  if (themeKey === 'google-satellite') maxNative = 19; // Google has high-res imagery up to zoom 19 in this region
  if (themeKey === 'street') maxNative = 19;
  if (themeKey === 'topo') maxNative = 17;
  
  currentTiles.forEach(t => t.remove());
  currentTiles = [];
  currentTiles.push(L.tileLayer(url, { maxZoom: 24, maxNativeZoom: maxNative, zIndex: 1 }).addTo(primaryMap));
  currentTiles.push(L.tileLayer(url, { maxZoom: 24, maxNativeZoom: maxNative, zIndex: 1 }).addTo(secondaryMap1));
  currentTiles.push(L.tileLayer(url, { maxZoom: 24, maxNativeZoom: maxNative, zIndex: 1 }).addTo(secondaryMap2));
  currentTiles.push(L.tileLayer(url, { maxZoom: 24, maxNativeZoom: maxNative, zIndex: 1 }).addTo(secondaryMap3));
  currentTiles.push(L.tileLayer(url, { maxZoom: 24, maxNativeZoom: maxNative, zIndex: 1 }).addTo(secondaryMap4));
  currentTiles.push(L.tileLayer(url, { maxZoom: 24, maxNativeZoom: maxNative, zIndex: 1 }).addTo(secondaryMap5));
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
  
  // Theme-aware updates for labels overlay
  if (labelsLayer) {
    const isLightTheme = activeTheme === 'light' || activeTheme === 'street' || activeTheme === 'topo';
    const labelType = isLightTheme ? 'light_only_labels' : 'dark_only_labels';
    labelsLayer.setUrl(`https://{s}.basemaps.cartocdn.com/${labelType}/{z}/{x}/{y}{r}.png${cartoKeyParam}`);
  }
  
  // Theme-aware updates for graticule grid lines
  if (graticuleLayer && primaryMap.hasLayer(graticuleLayer)) {
    graticuleLayer.redraw();
  }
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
  if (!feedEl) return;
  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
  
  const li = document.createElement('li');
  if (isAlert) li.className = 'alert';
  
  const prefix = `<span class="timestamp">[${timeStr}]</span> ${isAlert ? 'WARNING: ' : '> '}`;
  li.innerHTML = prefix + msg;
  
  feedEl.appendChild(li);
  
  if (feedEl.children.length > 25) {
    feedEl.removeChild(feedEl.firstChild);
  }
  feedEl.scrollTop = feedEl.scrollHeight;
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

// --- Map Overlays Logic ---
const nauticalToggle = document.getElementById('nautical-toggle');
const trailsToggle = document.getElementById('trails-toggle');

nauticalToggle.addEventListener('change', (e) => {
  if (e.target.checked) {
    nauticalLayer.addTo(primaryMap);
    logToFeed("SYS: NAUTICAL OVERLAY ONLINE");
  } else {
    nauticalLayer.remove();
    logToFeed("SYS: NAUTICAL OVERLAY OFFLINE");
  }
});

trailsToggle.addEventListener('change', (e) => {
  if (e.target.checked) {
    trailsLayer.addTo(primaryMap);
    logToFeed("SYS: HIKING TRAILS ONLINE");
  } else {
    trailsLayer.remove();
    logToFeed("SYS: HIKING TRAILS OFFLINE");
  }
});

const mtbToggle = document.getElementById('mtb-toggle');
const topoOverlayToggle = document.getElementById('topo-overlay-toggle');
const labelsToggle = document.getElementById('labels-toggle');
const gridToggle = document.getElementById('grid-toggle');
const compassToggle = document.getElementById('compass-toggle');
const compassRose = document.getElementById('compass-rose');
const defaultBuoysToggle = document.getElementById('default-buoys-toggle');

if (mtbToggle) {
  mtbToggle.addEventListener('change', (e) => {
    if (e.target.checked) {
      mtbLayer.addTo(primaryMap);
      logToFeed("SYS: MTB & OFF-ROAD TRAILS ONLINE");
    } else {
      mtbLayer.remove();
      logToFeed("SYS: MTB & OFF-ROAD TRAILS OFFLINE");
    }
  });
}

if (topoOverlayToggle) {
  topoOverlayToggle.addEventListener('change', (e) => {
    if (e.target.checked) {
      topoOverlay.addTo(primaryMap);
      logToFeed("SYS: TOPOGRAPHIC OVERLAY ONLINE");
    } else {
      topoOverlay.remove();
      logToFeed("SYS: TOPOGRAPHIC OVERLAY OFFLINE");
    }
  });
}

if (labelsToggle) {
  labelsToggle.addEventListener('change', (e) => {
    if (e.target.checked) {
      labelsLayer.addTo(primaryMap);
      logToFeed("SYS: ROADS & LABELS OVERLAY ONLINE");
    } else {
      labelsLayer.remove();
      logToFeed("SYS: ROADS & LABELS OVERLAY OFFLINE");
    }
  });
}

if (gridToggle) {
  gridToggle.addEventListener('change', (e) => {
    if (e.target.checked) {
      graticuleLayer.addTo(primaryMap);
      logToFeed("SYS: COORDINATE GRID ONLINE");
    } else {
      graticuleLayer.remove();
      logToFeed("SYS: COORDINATE GRID OFFLINE");
    }
  });
}

if (compassToggle) {
  compassToggle.addEventListener('change', (e) => {
    if (e.target.checked) {
      if (compassRose) compassRose.style.display = 'flex';
      logToFeed("SYS: COMPASS ROSE ONLINE");
    } else {
      if (compassRose) compassRose.style.display = 'none';
      logToFeed("SYS: COMPASS ROSE OFFLINE");
    }
  });
}

if (defaultBuoysToggle) {
  defaultBuoysToggle.addEventListener('change', (e) => {
    renderBuoys();
    if (e.target.checked) {
      logToFeed("SYS: DEFAULT BUOYS ONLINE");
    } else {
      logToFeed("SYS: DEFAULT BUOYS OFFLINE");
    }
  });
}

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
    const weatherRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m,surface_pressure`);
    const weatherData = await weatherRes.json();
    
    // 2. Fetch Marine (Sea State)
    const marineRes = await fetch(`https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lng}&current=wave_height,wave_direction`);
    const marineData = await marineRes.json();
    
    if (weatherData && weatherData.current) {
      const t = weatherData.current.temperature_2m;
      const ws = weatherData.current.wind_speed_10m;
      const wd = weatherData.current.wind_direction_10m;
      const wg = weatherData.current.wind_gusts_10m;
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

      if (typeof updateWindWidget === 'function') {
        updateWindWidget(ws, wd, wg, sp);
      }

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
primaryMap.on('moveend', () => {
  handleWeatherUpdate();
  if (graticuleLayer && primaryMap.hasLayer(graticuleLayer)) {
    graticuleLayer.redraw();
  }
});
primaryMap.on('zoom', updateCoordinates);
updateCoordinates();
handleWeatherUpdate(); // Initial fetch

// --- Expandable/Collapsible Minimap & Sidebar Logic ---
window.toggleSidebar = function() {
  const sidebar = document.getElementById('right-sidebar');
  const btn = document.getElementById('sidebar-toggle-btn');
  const expandBtn = document.getElementById('sidebar-expand-btn');
  const isCollapsed = sidebar.classList.contains('collapsed');
  
  if (isCollapsed) {
    sidebar.classList.remove('collapsed');
    btn.classList.remove('collapsed');
    btn.textContent = '[ < VIEWS ]';
    logToFeed("SYS: SIDEBAR RESTORED");
  } else {
    sidebar.classList.add('collapsed');
    btn.classList.add('collapsed');
    btn.textContent = '[ VIEWS > ]';
    // Remove expanded state if collapsing
    if (sidebar.classList.contains('expanded-sidebar')) {
      sidebar.classList.remove('expanded-sidebar');
      if (expandBtn) expandBtn.textContent = '[ EXPAND << ]';
    }
    logToFeed("SYS: SIDEBAR COLLAPSED");
  }
  
  // Wait for sidebar animation to finish then tell primary map to resize
  setTimeout(() => {
    primaryMap.invalidateSize();
  }, 350);
};

window.toggleSidebarExpand = function() {
  const sidebar = document.getElementById('right-sidebar');
  const expandBtn = document.getElementById('sidebar-expand-btn');
  const toggleBtn = document.getElementById('sidebar-toggle-btn');
  if (!sidebar || !expandBtn) return;
  
  const isExpanded = sidebar.classList.contains('expanded-sidebar');
  
  if (isExpanded) {
    sidebar.classList.remove('expanded-sidebar');
    expandBtn.textContent = '[ EXPAND << ]';
    logToFeed("SYS: SIDEBAR RESTORED TO NARROW VIEW");
  } else {
    // If collapsed, open it first
    if (sidebar.classList.contains('collapsed')) {
      sidebar.classList.remove('collapsed');
      if (toggleBtn) {
        toggleBtn.classList.remove('collapsed');
        toggleBtn.textContent = '[ < VIEWS ]';
      }
    }
    
    sidebar.classList.add('expanded-sidebar');
    expandBtn.textContent = '[ COLLAPSE >> ]';
    logToFeed("SYS: SIDEBAR EXPANDED TO WIDE VIEW");
  }
  
  // We must tell Leaflet the container size changed so it redraws tiles
  setTimeout(() => {
    primaryMap.invalidateSize();
    secondaryMap1.invalidateSize();
    secondaryMap2.invalidateSize();
    secondaryMap3.invalidateSize();
    secondaryMap4.invalidateSize();
    secondaryMap5.invalidateSize();
  }, 350); // match CSS transition duration
};

window.toggleRollup = function(panelId) {
  const panel = document.getElementById(panelId);
  const btn = panel.querySelector('.rollup-btn');
  const isRolledUp = panel.classList.contains('rolled-up');
  
  if (isRolledUp) {
    panel.classList.remove('rolled-up');
    btn.textContent = '[-]';
  } else {
    panel.classList.add('rolled-up');
    btn.textContent = '[+]';
  }
};

window.toggleMaximize = function(panelId, mapVarName) {
  const panel = document.getElementById(panelId);
  const container = panel.closest('.minimap-container');
  const allPanels = container.querySelectorAll('.minimap-panel');
  const btn = panel.querySelector('.maximize-btn');
  
  const isMaximized = panel.classList.contains('maximized-sidebar');
  
  if (isMaximized) {
    // Restore all panels
    allPanels.forEach(p => {
      p.classList.remove('maximized-sidebar');
      p.style.display = ''; // restore visibility
    });
    btn.textContent = '[⛶]';
    logToFeed(`SYS: RESTORED ${panelId.replace('panel-', '').toUpperCase()} MINIMAP`);
  } else {
    // If panel is rolled up, un-rollup it first
    if (panel.classList.contains('rolled-up')) {
      window.toggleRollup(panelId);
    }
    // Maximize this panel and hide the others
    allPanels.forEach(p => {
      if (p === panel) {
        p.classList.add('maximized-sidebar');
      } else {
        p.style.display = 'none'; // hide others
      }
    });
    btn.textContent = '[⧉]';
    logToFeed(`SYS: MAXIMIZED ${panelId.replace('panel-', '').toUpperCase()} MINIMAP IN SIDEBAR`);
  }
  
  // Invalidate Leaflet map size
  setTimeout(() => {
    if (mapVarName === 'secondaryMap1') secondaryMap1.invalidateSize();
    if (mapVarName === 'secondaryMap2') secondaryMap2.invalidateSize();
    if (mapVarName === 'secondaryMap3') secondaryMap3.invalidateSize();
    if (mapVarName === 'secondaryMap4') secondaryMap4.invalidateSize();
    if (mapVarName === 'secondaryMap5') secondaryMap5.invalidateSize();
  }, 300);
};

window.toggleExpand = function(panelId, mapVarName) {
  const panel = document.getElementById(panelId);
  const btn = panel.querySelector('.fullscreen-btn');
  const isExpanded = panel.classList.contains('expanded');
  
  if (isExpanded) {
    panel.classList.remove('expanded');
    btn.textContent = '[↗]';
    logToFeed(`MINIMIZING ${panelId}`);
  } else {
    panel.classList.add('expanded');
    btn.textContent = '[↙]';
    logToFeed(`EXPANDING ${panelId} TO MAIN VIEW`);
  }
  
  // We must tell Leaflet the container size changed so it redraws tiles
  setTimeout(() => {
    if (mapVarName === 'secondaryMap1') secondaryMap1.invalidateSize();
    if (mapVarName === 'secondaryMap2') secondaryMap2.invalidateSize();
    if (mapVarName === 'secondaryMap3') secondaryMap3.invalidateSize();
    if (mapVarName === 'secondaryMap4') secondaryMap4.invalidateSize();
    if (mapVarName === 'secondaryMap5') secondaryMap5.invalidateSize();
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
  if (now.getUTCHours() === 0 && now.getUTCMinutes() === 0) {
    dayCounter++;
  }
}
setInterval(updateClock, 1000);
updateClock();

// --- HUD Draggable & Resizable Logic ---
const hudPanels = document.querySelectorAll('.hud-panel');
hudPanels.forEach(panel => {
  const label = panel.querySelector('.hud-label');
  const panelId = panel.classList[1]; // e.g. clock-panel
  if (!label || !panelId) return;

  const contentContainer = panel.querySelector('div:not(.hud-label), ul');
  let baseWidth = panel.offsetWidth;

  // Restore saved state
  const HUD_VERSION = "v2";
  const savedState = localStorage.getItem('hud_state_' + HUD_VERSION + '_' + panelId);
  if (savedState) {
    const state = JSON.parse(savedState);
    if (state.top && state.left) {
      panel.style.top = state.top;
      panel.style.left = state.left;
      panel.style.bottom = 'auto';
      panel.style.right = 'auto';
    }
    if (state.width) panel.style.width = state.width;
    if (state.height) panel.style.height = state.height;
    if (state.zoom && contentContainer) contentContainer.style.zoom = state.zoom;
    baseWidth = state.baseWidth || panel.offsetWidth;
  }

  // Save state when resized (using ResizeObserver)
  const resizeObserver = new ResizeObserver((entries) => {
    for (let entry of entries) {
      if (!baseWidth) baseWidth = panel.offsetWidth;
      
      const newWidth = entry.borderBoxSize ? entry.borderBoxSize[0].inlineSize : panel.offsetWidth;
      if (newWidth && baseWidth && contentContainer) {
        const scale = newWidth / baseWidth;
        // Don't apply zoom if it's the first render or a tiny glitch
        if (scale > 0.1 && Math.abs(scale - 1.0) > 0.05) {
          contentContainer.style.zoom = scale;
        }
      }
    }
    savePanelState(panel, panelId, contentContainer ? contentContainer.style.zoom : null, baseWidth);
  });
  resizeObserver.observe(panel);

  // Drag logic
  let isDragging = false;
  let startX, startY, initialLeft, initialTop;

  label.addEventListener('mousedown', (e) => {
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;

    // Use offset to avoid jumping relative to parent
    initialLeft = panel.offsetLeft;
    initialTop = panel.offsetTop;

    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
    panel.style.left = initialLeft + 'px';
    panel.style.top = initialTop + 'px';

    hudPanels.forEach(p => p.style.zIndex = 1000);
    panel.style.zIndex = 1001;
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    panel.style.left = (initialLeft + dx) + 'px';
    panel.style.top = (initialTop + dy) + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      savePanelState(panel, panelId, contentContainer ? contentContainer.style.zoom : null, baseWidth);
    }
  });
});

function savePanelState(panel, panelId, zoomScale, baseWidth) {
  const state = {
    top: panel.style.top,
    left: panel.style.left,
    width: panel.style.width,
    height: panel.style.height,
    zoom: zoomScale,
    baseWidth: baseWidth
  };
  localStorage.setItem('hud_state_v2_' + panelId, JSON.stringify(state));
}

// --- Load Data Layers with Radar Blips ---
function getCustomIcon(feature) {
  const type = feature.properties.markerType || 'blip';
  const color = feature.properties.markerColor || 'red';
  
  if (type === 'blip') {
    return L.divIcon({
      className: `radar-blip blip-${color}`,
      iconSize: [20, 20],
      iconAnchor: [10, 10]
    });
  } else {
    // Marine SVGs & Infrastructure SVGs
    let svgPath = '';
    if (type === 'anchor') {
      svgPath = '<circle cx="12" cy="5" r="3"></circle><line x1="12" y1="22" x2="12" y2="8"></line><path d="M5 12H2a10 10 0 0 0 20 0h-3"></path>';
    } else if (type === 'warning') {
      svgPath = '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line>';
    } else if (type === 'buoy') {
      svgPath = '<path d="M12 2v20"></path><path d="M8 6h8"></path><path d="M6 14h12"></path><path d="M4 22h16"></path><path d="M6 10l6-4 6 4"></path>';
    } else if (type === 'target') {
      svgPath = '<circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle>';
    } else if (type === 'buoy-port') {
      svgPath = '<path d="M6 18h12V8H6v10zM4 18h16M2 21h20"></path>';
    } else if (type === 'buoy-starboard') {
      svgPath = '<path d="M12 4L6 18h12L12 4zM4 18h16M2 21h20"></path>';
    } else if (type === 'buoy-fairway') {
      svgPath = '<rect x="8" y="4" width="8" height="14" rx="2"></rect><line x1="12" y1="4" x2="12" y2="18"></line><path d="M4 18h16M2 21h20"></path>';
    } else if (type === 'buoy-bifurcation') {
      svgPath = '<path d="M12 4L7 9h10l-5-5zM12 18V9M4 18h16M2 21h20"></path><line x1="9" y1="12" x2="15" y2="12"></line>';
    } else if (type === 'buoy-isolated-danger') {
      svgPath = '<circle cx="12" cy="4" r="2" fill="currentColor"></circle><circle cx="12" cy="9" r="2" fill="currentColor"></circle><rect x="9" y="12" width="6" height="6"></rect><line x1="9" y1="15" x2="15" y2="15"></line><path d="M4 18h16M2 21h20"></path>';
    } else if (type === 'buoy-cardinal') {
      svgPath = '<path d="M12 2l-3 4h6zM12 11l-3-4h6zM9 12h6v6H9z"></path><path d="M4 18h16M2 21h20"></path>';
    } else if (type === 'buoy-hazard') {
      svgPath = '<rect x="8" y="4" width="8" height="14" rx="1"></rect><path d="M12 7l2 2-2 2-2-2 2-2z"></path><line x1="8" y1="6" x2="16" y2="6"></line><line x1="8" y1="16" x2="16" y2="16"></line><path d="M4 18h16M2 21h20"></path>';
    } else if (type === 'buoy-mooring') {
      svgPath = '<circle cx="12" cy="14" r="5"></circle><path d="M12 9V5a2 2 0 1 1 0-4 2 2 0 0 1 0 4v4"></path><path d="M4 18h16M2 21h20"></path>';
    } else if (type === 'buoy-information') {
      svgPath = '<rect x="7" y="4" width="10" height="14" rx="1"></rect><rect x="10" y="8" width="4" height="4"></rect><path d="M4 18h16M2 21h20"></path>';
    } else if (type === 'buoy-control') {
      svgPath = '<rect x="7" y="4" width="10" height="14" rx="1"></rect><circle cx="12" cy="10" r="2.5"></circle><path d="M4 18h16M2 21h20"></path>';
    } else if (type === 'buoy-keep-out') {
      svgPath = '<rect x="7" y="4" width="10" height="14" rx="1"></rect><path d="M12 7l2 3-2 3-2-3 2-3zM10 10h4M12 8v4"></path><path d="M4 18h16M2 21h20"></path>';
    } else if (type === 'buoy-cautionary') {
      svgPath = '<path d="M10 2l4 4M14 2l-4 4"></path><rect x="8" y="6" width="8" height="12" rx="1"></rect><path d="M4 18h16M2 21h20"></path>';
    } else if (type === 'hq') {
      svgPath = '<path d="M4 22V4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v18M12 18h.01"></path><polygon points="12,6 13,9 16,9 13.5,11 14.5,14 12,12.5 9.5,14 10.5,11 8,9 11,9"></polygon>';
    } else if (type === 'mod-tent') {
      svgPath = '<path d="M2 20L12 4l10 16H2zM12 4v16M2 20h20M7 12h10"></path>';
    } else if (type === 'bivouac') {
      svgPath = '<path d="M4 18L9 9l5 9M10 18l5-9 5 9M2 18h20"></path><circle cx="7" cy="18" r="1"></circle><circle cx="17" cy="18" r="1"></circle>';
    } else if (type === 'j4-warehouse') {
      svgPath = '<path d="M3 10V20a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V10M2 10l10-6 10 6M6 14h12v6H6zM10 14v6M14 14v6"></path>';
    } else if (type === 'admin-bldg') {
      svgPath = '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><path d="M9 21V9h6v12M8 6h2M14 6h2M8 10h2M14 10h2M8 14h2M14 14h2"></path>';
    } else if (type === 'mess-hall') {
      svgPath = '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"></path><path d="M7 2v20"></path><path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"></path>';
    } else if (type === 'medical-station') {
      svgPath = '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><path d="M12 8v8M8 12h8"></path>';
    } else if (type === 'comms-post') {
      svgPath = '<circle cx="12" cy="12" r="2"></circle><path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14"></path><path d="M12 14v8"></path>';
    } else if (type === 'security-checkpoint') {
      svgPath = '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM8 11h8M8 15h8"></path>';
    } else if (type === 'ammo-depot') {
      svgPath = '<path d="M12 2v6M12 8a4 4 0 0 0-4 4v7a3 3 0 0 0 6 0v-7a4 4 0 0 0-4-4zM8 15h8"></path>';
    } else if (type === 'helipad-lz') {
      svgPath = '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><path d="M8 8v8"></path><path d="M16 8v8"></path><path d="M8 12h8"></path>';
    } else if (type === 'motor-pool') {
      svgPath = '<path d="M2 17h20M5 17V8l7-4 7 4v9M9 13h6M8 17v-4h8v4"></path>';
    } else if (type === 'observation-post') {
      svgPath = '<path d="M6 22l2-14M18 22l-2-14M8 8h8M8 4h8v4H8zM12 8v14M5 4h14"></path>';
    } else if (type === 'power-unit') {
      svgPath = '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><polygon points="13 7 8 13 12 13 11 17 16 11 12 11 13 7"></polygon>';
    } else if (type === 'water-point') {
      svgPath = '<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"></path>';
    } else if (type === 'fuel-farm') {
      svgPath = '<ellipse cx="12" cy="5" rx="6" ry="2"></ellipse><path d="M6 5v14c0 1.1 2.7 2 6 2s6-.9 6-2V5"></path><ellipse cx="12" cy="12" rx="6" ry="2" opacity="0.7"></ellipse>';
    } else if (type === 'barracks') {
      svgPath = '<rect x="3" y="3" width="18" height="18" rx="2"></rect><path d="M6 8h12M6 14h12M6 17h12M6 11h1M17 11h1M6 5v14M18 5v14"></path>';
    } else if (type === 'retail-store') {
      svgPath = '<path d="M3 9h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9zm0 0L6 3h12l3 6M9 9a3 3 0 0 1-6 0m12 0a3 3 0 0 1-6 0m12 0a3 3 0 0 1-6 0"></path>';
    } else if (type === 'guard-tower') {
      svgPath = '<path d="M6 22L9 8M18 22L15 8M9 8h6M7 8h10v4H7zm3-4l2-2 2 2H10zM12 2v4"></path>';
    } else if (type === 'armory') {
      svgPath = '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4M12 15v3"></path>';
    } else if (type === 'runway') {
      svgPath = '<path d="M5 2h14v20H5V2zM12 4v3M12 11v3M12 18v2"></path><path d="M12 8l-4 4h3v4h2v-4h3l-4-4z"></path>';
    } else if (type === 'latrines') {
      svgPath = '<path d="M7 21h10M12 21V5a2 2 0 0 1 2-2h4M9 12a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm6 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm-3 4a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"></path>';
    } else if (type === 'fitness-center') {
      svgPath = '<rect x="2" y="6" width="3" height="12" rx="1"></rect><rect x="19" y="6" width="3" height="12" rx="1"></rect><line x1="5" y1="12" x2="19" y2="12" stroke-width="3"></line><rect x="5" y="8" width="2" height="8"></rect><rect x="17" y="8" width="2" height="8"></rect>';
    } else if (type === 'decon-station') {
      svgPath = '<path d="M4 4h16v16H4V4zm8 0v4M8 12a4 4 0 1 1 8 0M12 14v4"></path>';
    // Backward compatibility mappings
    } else if (type === 'building') {
      svgPath = '<rect x="4" y="2" width="16" height="20" rx="2" ry="2"></rect><path d="M9 22v-4h6v4"></path><path d="M8 6h.01"></path><path d="M16 6h.01"></path><path d="M12 6h.01"></path><path d="M12 10h.01"></path><path d="M12 14h.01"></path><path d="M16 10h.01"></path><path d="M16 14h.01"></path><path d="M8 10h.01"></path><path d="M8 14h.01"></path>';
    } else if (type === 'utensils') {
      svgPath = '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"></path><path d="M7 2v20"></path><path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"></path>';
    } else if (type === 'bath') {
      svgPath = '<path d="M9 6 6.5 3.5a1.5 1.5 0 0 0-1-.5C4.683 3 4 3.683 4 4.5V17a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5"></path><path d="M10 5 L10 5.01"></path><path d="M12 7 L12 7.01"></path><path d="M14 4 L14 4.01"></path>';
    } else if (type === 'warehouse') {
      svgPath = '<path d="M22 8.35V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8.35A2 2 0 0 1 3.26 6.5l8-3.2a2 2 0 0 1 1.48 0l8 3.2A2 2 0 0 1 22 8.35Z"></path><path d="M6 18h12"></path><path d="M6 14h12"></path><rect width="12" height="12" x="6" y="10"></rect>';
    } else if (type === 'tent') {
      svgPath = '<path d="M19 20 10 4"></path><path d="m5 20 9-16"></path><path d="M3 20h18"></path><path d="m12 15-3 5"></path><path d="m12 15 3 5"></path>';
    } else if (type === 'medical') {
      svgPath = '<path d="M11 2a2 2 0 0 0-2 2v5H4a2 2 0 0 0-2 2v2c0 1.1.9 2 2 2h5v5c0 1.1.9 2 2 2h2a2 2 0 0 0 2-2v-5h5a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2h-5V4a2 2 0 0 0-2-2h-2z"></path>';
    } else if (type === 'power') {
      svgPath = '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>';
    } else if (type === 'water') {
      svgPath = '<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"></path>';
    } else if (type === 'comms') {
      svgPath = '<circle cx="12" cy="12" r="2"></circle><path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14"></path><path d="M12 14v8"></path>';
    } else if (type === 'helipad') {
      svgPath = '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><path d="M8 8v8"></path><path d="M16 8v8"></path><path d="M8 12h8"></path>';
    } else if (type === 'parking') {
      svgPath = '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><path d="M9 17V7h4a3 3 0 0 1 0 6H9"></path>';
    } else if (type === 'shield') {
      svgPath = '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>';
    } else if (type === 'flame') {
      svgPath = '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"></path>';
    } else if (type === 'tree') {
      svgPath = '<path d="M12 20v-6M9 14h6"></path><path d="M12 2L8 8h3l-4 6h10l-4-6h3L12 2z"></path>';
    }
    
    return L.divIcon({
      className: `marine-icon`, // No background, just wrapper
      html: `<div class="marine-icon-wrapper"><svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" class="svg-${color}">${svgPath}</svg></div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });
  }
}

// EMS Radar Blip Icons
const hospitalIcon = L.divIcon({
  className: 'radar-blip blip-hospital',
  iconSize: [20, 20],
  iconAnchor: [10, 10]
});

const fireIcon = L.divIcon({
  className: 'radar-blip blip-fire',
  iconSize: [20, 20],
  iconAnchor: [10, 10]
});

const policeIcon = L.divIcon({
  className: 'radar-blip blip-police',
  iconSize: [20, 20],
  iconAnchor: [10, 10]
});

// --- Edit Mode Logic ---
let isEditMode = false;
const editToggle = document.getElementById('edit-toggle');

editToggle.addEventListener('change', (e) => {
  isEditMode = e.target.checked;
  if (isEditMode) {
    document.getElementById('primary-map-container').style.cursor = 'crosshair';
    logToFeed("SYS: TACTICAL EDIT MODE ONLINE", true);
  } else {
    document.getElementById('primary-map-container').style.cursor = '';
    logToFeed("SYS: TACTICAL EDIT MODE OFFLINE");
  }
});

// Modal Logic
let pendingDeployCoords = null;
const modal = document.getElementById('deployment-modal');
const deployNameInput = document.getElementById('deploy-name');

document.querySelectorAll('.cat-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    
    document.getElementById('marker-grid-radar').style.display = 'none';
    document.getElementById('marker-grid-marine').style.display = 'none';
    document.getElementById('marker-grid-infrastructure').style.display = 'none';
    
    const targetGrid = document.getElementById(`marker-grid-${e.target.dataset.cat}`);
    targetGrid.style.display = 'grid';
    
    // Auto-select first option in the active grid
    document.querySelectorAll('.marker-option').forEach(o => o.classList.remove('selected'));
    targetGrid.querySelector('.marker-option').classList.add('selected');
  });
});

document.querySelectorAll('.marker-option').forEach(opt => {
  opt.addEventListener('click', (e) => {
    document.querySelectorAll('.marker-option').forEach(o => o.classList.remove('selected'));
    e.currentTarget.classList.add('selected');
  });
});

document.querySelectorAll('.color-circle').forEach(circle => {
  circle.addEventListener('click', (e) => {
    document.querySelectorAll('.color-circle').forEach(c => c.classList.remove('selected'));
    e.currentTarget.classList.add('selected');
  });
});

document.getElementById('btn-abort').addEventListener('click', () => {
  modal.style.display = 'none';
  pendingDeployCoords = null;
});

document.getElementById('btn-deploy').addEventListener('click', () => {
  const name = deployNameInput.value.trim() || "ALPHA-" + Math.floor(Math.random() * 100);
  const selectedOpt = document.querySelector('.marker-option.selected');
  const selectedColorOpt = document.querySelector('.color-circle.selected');
  
  const type = selectedOpt ? selectedOpt.dataset.type : 'blip';
  const color = selectedColorOpt ? selectedColorOpt.dataset.color : 'white';
  
  const newId = "CUSTOM-" + Date.now();
  logToFeed(`> DEPLOYING: ${name}...`);
  
  let customBuoys = JSON.parse(localStorage.getItem('custom_buoys') || '[]');
  customBuoys.push({ id: newId, name: name, lat: pendingDeployCoords.lat, lng: pendingDeployCoords.lng, markerType: type, markerColor: color });
  localStorage.setItem('custom_buoys', JSON.stringify(customBuoys));
  
  logToFeed(`> DEPLOYED NEW BUOY: ${name}`);
  modal.style.display = 'none';
  pendingDeployCoords = null;
  renderBuoys();
});

primaryMap.on('click', async (e) => {
  if (!isEditMode) return;
  pendingDeployCoords = e.latlng;
  deployNameInput.value = "";
  modal.style.display = 'flex';
  deployNameInput.focus();
});

// --- GPS Tracking Logic ---
let watchId = null;
let gpsMarker = null;

const gpsIcon = L.divIcon({
  className: 'gps-blip',
  iconSize: [24, 24],
  iconAnchor: [12, 12]
});

document.getElementById('gps-track-toggle').addEventListener('change', (e) => {
  if (e.target.checked) {
    if ("geolocation" in navigator) {
      logToFeed("SYS: GPS TRACKING ACTIVATED", true);
      watchId = navigator.geolocation.watchPosition(
        (position) => {
          const latlng = [position.coords.latitude, position.coords.longitude];
          if (!gpsMarker) {
            gpsMarker = L.marker(latlng, { icon: gpsIcon, zIndexOffset: 1000 }).addTo(primaryMap);
            gpsMarker.bindPopup("<strong>YOUR DEVICE</strong>");
          } else {
            gpsMarker.setLatLng(latlng);
          }
        },
        (error) => {
          logToFeed(`SYS ERROR: GPS SIGNAL LOST (${error.message})`, true);
          e.target.checked = false;
        },
        { enableHighAccuracy: true, maximumAge: 0 }
      );
    } else {
      logToFeed("SYS ERROR: GPS NOT SUPPORTED", true);
      e.target.checked = false;
    }
  } else {
    logToFeed("SYS: GPS TRACKING DEACTIVATED");
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    if (gpsMarker) {
      primaryMap.removeLayer(gpsMarker);
      gpsMarker = null;
    }
  }
});

document.getElementById('btn-gps-deploy').addEventListener('click', () => {
  if ("geolocation" in navigator) {
    logToFeed("> ACQUIRING GPS LOCK...");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        logToFeed("> GPS LOCK ACQUIRED");
        pendingDeployCoords = { lat: position.coords.latitude, lng: position.coords.longitude };
        deployNameInput.value = "";
        modal.style.display = 'flex';
        deployNameInput.focus();
      },
      (error) => {
        logToFeed(`SYS ERROR: GPS LOCK FAILED (${error.message})`, true);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  } else {
    logToFeed("SYS ERROR: GPS NOT SUPPORTED", true);
  }
});

// --- Buoy Rendering Logic ---
const buoysLayerPrimary = L.layerGroup().addTo(primaryMap);
const buoysLayerSecondary = L.layerGroup().addTo(secondaryMap1);

const sosLayerSecondary = L.layerGroup().addTo(secondaryMap5);
const sosMarkersSecondary = new Map();

async function renderBuoys() {
  logToFeed('[TRACE] renderBuoys started');
  buoysLayerPrimary.clearLayers();
  buoysLayerSecondary.clearLayers();
  
  const defaultBuoysToggle = document.getElementById('default-buoys-toggle');
  const showDefault = defaultBuoysToggle ? defaultBuoysToggle.checked : true;
  
  let allFeatures = [];
  if (showDefault && typeof window.json_Buoys_2 !== 'undefined' && window.json_Buoys_2.features) {
    allFeatures = [...window.json_Buoys_2.features];
    logToFeed(`[TRACE] Added ${allFeatures.length} Base Buoys`);
  } else {
    logToFeed('[TRACE] Base Buoys SKIPPED or UNDEFINED');
  }
  
  try {
    logToFeed('[TRACE] Fetching custom buoys...');
    const supaBuoys = JSON.parse(localStorage.getItem('custom_buoys') || '[]');
    const error = null;
      
    if (error) {
      logToFeed(`[TRACE] backend err: ${error.message}`);
    } else if (supaBuoys) {
      logToFeed(`[TRACE] Added ${supaBuoys.length} Custom Buoys`);
      supaBuoys.forEach(b => {
        if (b.lat === undefined || b.lng === undefined || isNaN(b.lat) || isNaN(b.lng)) {
          console.warn('Invalid buoy skipped:', b);
          return;
        }
        allFeatures.push({
          type: "Feature",
          properties: { id: b.id, Buoys: b.name, isCustom: true, markerType: b.markerType, markerColor: b.markerColor },
          geometry: { type: "Point", coordinates: [b.lng, b.lat] }
        });
      });
    }
  } catch (err) {
    logToFeed(`[TRACE] backend throw: ${err.message}`);
  }
  
  logToFeed(`[TRACE] Filtering deleted base buoys...`);
  let deletedBase = [];
  try {
    deletedBase = JSON.parse(localStorage.getItem('deleted_base_buoys') || '[]');
  } catch(e) {
    logToFeed(`[TRACE] localStorage err: ${e.message}`);
  }
  
  const visibleFeatures = allFeatures.filter(f => !deletedBase.includes(f.properties.id));
  logToFeed(`[TRACE] Rendering ${visibleFeatures.length} visible buoys...`);

  const onFeatureClick = (feature, layer) => {
    // Add click interceptor for Edit Mode
    layer.on('click', async (e) => {
      if (isEditMode) {
        logToFeed(`[TRACE] Click intercepted for buoy: ${feature.properties['Buoys']}`);
        if (confirm(`Remove Tactical Buoy: ${feature.properties['Buoys']}?`)) {
          if (feature.properties.isCustom) {
            logToFeed(`[TRACE] Removing custom buoy: ${feature.properties.id}`);
            // Remove from local storage
            let customBuoys = JSON.parse(localStorage.getItem('custom_buoys') || '[]');
            customBuoys = customBuoys.filter(b => b.id !== feature.properties.id);
            localStorage.setItem('custom_buoys', JSON.stringify(customBuoys));
            const error = null;
            if (!error) {
              logToFeed(`> REMOVED BUOY: ${feature.properties['Buoys']}`, true);
            } else {
              logToFeed(`[TRACE] backend delete err: ${error.message}`);
              logToFeed(`SYS ERROR: FAILED TO REMOVE BUOY`);
            }
          } else {
             // For base buoys, add to hidden list in local storage
             logToFeed(`[TRACE] Removing base buoy: ${feature.properties.id}`);
             let deletedBase = JSON.parse(localStorage.getItem('deleted_base_buoys') || '[]');
             deletedBase.push(feature.properties.id);
             localStorage.setItem('deleted_base_buoys', JSON.stringify(deletedBase));
             logToFeed(`> REMOVED BUOY: ${feature.properties['Buoys']}`, true);
          }
          renderBuoys();
        }
      }
    });
    
    // Setup normal popup
    const id = feature.properties['id'] || 'N/A';
    const name = feature.properties['Buoys'] || 'Unnamed Buoy';
    layer.bindPopup(`<strong>TACTICAL BUOY</strong><br/>ID: ${id}<br/>NAME: ${name}`);
  };

  try {
    L.geoJSON({ type: "FeatureCollection", features: visibleFeatures }, {
      pointToLayer: (feature, latlng) => L.marker(latlng, { icon: getCustomIcon(feature) }),
      onEachFeature: onFeatureClick
    }).addTo(buoysLayerPrimary);

    const geojsonSecondary = L.geoJSON({ type: "FeatureCollection", features: visibleFeatures }, {
      pointToLayer: (feature, latlng) => L.marker(latlng, { icon: getCustomIcon(feature) })
    }).addTo(buoysLayerSecondary);

    if (visibleFeatures.length > 0) {
      setTimeout(() => {
        secondaryMap1.fitBounds(geojsonSecondary.getBounds(), { padding: [10, 10], maxZoom: 16 });
      }, 100);
      logToFeed(`[TRACE] Added custom markers to primary/secondary maps.`);
    }
    logToFeed('[TRACE] L.geoJSON success');
  } catch(e) {
    logToFeed(`[TRACE] L.geoJSON ERROR: ${e.message}`, true);
  }
}

// Initial render handled by waitForDataAndRender()

// --- Tactical Buoys (localStorage-backed; no backend sync) ---
// --- Local Custom Buoys logic ---
// No realtime channel needed for local storage

// ============================================================================
// --- SELECTABLE EMERGENCY SERVICES (EMS) LAYERS ---
// Hospitals (White), Fire Stations (Orange), Police (Royal Blue)
// ============================================================================

const hospitalLayerPrimary = L.layerGroup();
const fireLayerPrimary = L.layerGroup();
const policeLayerPrimary = L.layerGroup();

const hospitalLayerSecondary = L.layerGroup();
const fireLayerSecondary = L.layerGroup();
const policeLayerSecondary = L.layerGroup();

let emsHospitalsEnabled = localStorage.getItem('cmd-ems-hospitals') !== 'false';
let emsFireEnabled = localStorage.getItem('cmd-ems-fire') !== 'false';
let emsPoliceEnabled = localStorage.getItem('cmd-ems-police') !== 'false';

// Preloaded Comprehensive Regional Facilities Database
const EMS_PRELOAD_STATIONS = [
  // --- HOSPITALS & HEALTH CENTRES (WHITE) ---
  { id: 'hosp-1', type: 'hospital', name: 'Western Memorial Regional Hospital', lat: 48.9485, lng: -57.9490, address: '1 Brookfield Ave, Corner Brook, NL', phone: '(709) 637-5000' },
  { id: 'hosp-2', type: 'hospital', name: 'Corner Brook Health Centre & Long Term Care', lat: 48.9450, lng: -57.9220, address: '40 University Dr, Corner Brook, NL', phone: '(709) 637-3999' },
  { id: 'hosp-3', type: 'hospital', name: 'Deer Lake Medical Clinic & Health Centre', lat: 49.1725, lng: -57.4320, address: '4 Farm Rd, Deer Lake, NL', phone: '(709) 635-3541' },
  { id: 'hosp-4', type: 'hospital', name: 'Pasadena Health Centre', lat: 49.0180, lng: -57.5950, address: '22 Midland Row, Pasadena, NL', phone: '(709) 686-2061' },
  { id: 'hosp-5', type: 'hospital', name: 'Bonne Bay Health Centre', lat: 49.5210, lng: -57.8760, address: 'Norris Point / Bonne Bay, NL', phone: '(709) 458-2211' },
  { id: 'hosp-6', type: 'hospital', name: 'Sir Thomas Roddick Hospital', lat: 48.5520, lng: -58.5770, address: '142 Ohio Dr, Stephenville, NL', phone: '(709) 643-5111' },
  { id: 'hosp-7', type: 'hospital', name: 'Central Newfoundland Regional Health Centre', lat: 48.9320, lng: -55.6550, address: '50 Union St, Grand Falls-Windsor, NL', phone: '(709) 292-2500' },
  { id: 'hosp-8', type: 'hospital', name: 'Charles S. Curtis Memorial Hospital', lat: 51.3650, lng: -55.6020, address: '178 West St, St. Anthony, NL', phone: '(709) 454-3333' },
  { id: 'hosp-9', type: 'hospital', name: 'James Paton Memorial Regional Health Centre', lat: 48.9560, lng: -54.6180, address: '125 Trans-Canada Hwy, Gander, NL', phone: '(709) 256-2500' },
  { id: 'hosp-10', type: 'hospital', name: 'Health Sciences Centre (Tertiary Referral)', lat: 47.5740, lng: -52.7440, address: '300 Prince Philip Dr, St. John\'s, NL', phone: '(709) 777-6300' },
  { id: 'hosp-11', type: 'hospital', name: 'St. Clare\'s Mercy Hospital', lat: 47.5580, lng: -52.7210, address: '154 LeMarchant Rd, St. John\'s, NL', phone: '(709) 777-5000' },

  // --- FIRE & RESCUE STATIONS (ORANGE) ---
  { id: 'fire-1', type: 'fire', name: 'Deer Lake Volunteer Fire Department', lat: 49.1740, lng: -57.4310, address: '34 Nicholsville Rd, Deer Lake, NL', phone: 'Emergency: 911 / (709) 635-2244' },
  { id: 'fire-2', type: 'fire', name: 'Corner Brook Fire Department (Station 1 HQ)', lat: 48.9525, lng: -57.9510, address: '6 MT Bernie Dr, Corner Brook, NL', phone: 'Emergency: 911 / (709) 637-1660' },
  { id: 'fire-3', type: 'fire', name: 'Pasadena Volunteer Fire Department', lat: 49.0155, lng: -57.5990, address: '10th Ave, Pasadena, NL', phone: 'Emergency: 911 / (709) 686-2121' },
  { id: 'fire-4', type: 'fire', name: 'Steady Brook Volunteer Fire Department', lat: 48.9550, lng: -57.8250, address: 'Marble Dr, Steady Brook, NL', phone: 'Emergency: 911' },
  { id: 'fire-5', type: 'fire', name: 'Reidville Volunteer Fire Department', lat: 49.2210, lng: -57.3850, address: 'Reidville Community Way, NL', phone: 'Emergency: 911' },
  { id: 'fire-6', type: 'fire', name: 'Cormack Volunteer Fire Department', lat: 49.3120, lng: -57.4100, address: 'Veterans Dr, Cormack, NL', phone: 'Emergency: 911' },
  { id: 'fire-7', type: 'fire', name: 'Humber Arm South Volunteer Fire Dept', lat: 49.0450, lng: -58.1200, address: 'Main St, Benoit\'s Cove, NL', phone: 'Emergency: 911' },
  { id: 'fire-8', type: 'fire', name: 'Stephenville Fire & Rescue HQ', lat: 48.5510, lng: -58.5810, address: 'Carolina Ave, Stephenville, NL', phone: 'Emergency: 911 / (709) 643-2144' },
  { id: 'fire-9', type: 'fire', name: 'Rocky Harbour Volunteer Fire Department', lat: 49.5910, lng: -57.9200, address: 'West Link Rd, Rocky Harbour, NL', phone: 'Emergency: 911' },
  { id: 'fire-10', type: 'fire', name: 'Grand Falls-Windsor Fire Department', lat: 48.9350, lng: -55.6480, address: 'High St, Grand Falls-Windsor, NL', phone: 'Emergency: 911 / (709) 489-2121' },
  { id: 'fire-11', type: 'fire', name: 'Gander Fire Rescue HQ', lat: 48.9580, lng: -54.6120, address: '100 Elizabeth Dr, Gander, NL', phone: 'Emergency: 911 / (709) 651-5911' },

  // --- POLICE & LAW ENFORCEMENT (BRIGHT ROYAL BLUE) ---
  { id: 'police-1', type: 'police', name: 'RCMP Deer Lake Detachment', lat: 49.1710, lng: -57.4360, address: '18 George Aaron Dr, Deer Lake, NL', phone: '(709) 635-2173' },
  { id: 'police-2', type: 'police', name: 'RNC (Royal Newfoundland Constabulary) Corner Brook HQ', lat: 48.9540, lng: -57.9460, address: '44 MT Bernard Ave, Corner Brook, NL', phone: '(709) 637-4100' },
  { id: 'police-3', type: 'police', name: 'RCMP Corner Brook Detachment', lat: 48.9480, lng: -57.9350, address: '10 Confederation Dr, Corner Brook, NL', phone: '(709) 637-4433' },
  { id: 'police-4', type: 'police', name: 'RCMP Pasadena Satellite / Traffic Services', lat: 49.0165, lng: -57.5920, address: 'Main St / TCH, Pasadena, NL', phone: '(709) 686-2311' },
  { id: 'police-5', type: 'police', name: 'RCMP Stephenville Detachment', lat: 48.5530, lng: -58.5720, address: '10 Connecticut Dr, Stephenville, NL', phone: '(709) 643-2118' },
  { id: 'police-6', type: 'police', name: 'RCMP Rocky Harbour / Gros Morne Detachment', lat: 49.5890, lng: -57.9230, address: 'Main St, Rocky Harbour, NL', phone: '(709) 458-2222' },
  { id: 'police-7', type: 'police', name: 'RCMP Springdale Detachment', lat: 49.4980, lng: -56.0750, address: 'Little Bay Rd, Springdale, NL', phone: '(709) 673-3864' },
  { id: 'police-8', type: 'police', name: 'RCMP Grand Falls-Windsor Detachment', lat: 48.9360, lng: -55.6420, address: '30 Cromer Ave, Grand Falls-Windsor, NL', phone: '(709) 489-2121' },
  { id: 'police-9', type: 'police', name: 'RCMP Gander Detachment', lat: 48.9550, lng: -54.6190, address: '100 Elizabeth Dr, Gander, NL', phone: '(709) 256-6841' },
  { id: 'police-10', type: 'police', name: 'RNC Headquarters (Fort Townshend)', lat: 47.5615, lng: -52.7140, address: '1 Fort Townshend, St. John\'s, NL', phone: '(709) 729-8000' }
];

let allEmsStations = [...EMS_PRELOAD_STATIONS];

function createEmsPopupContent(station) {
  let badgeColor = '#ffffff';
  let badgeBg = 'rgba(255,255,255,0.15)';
  let typeLabel = 'HOSPITAL / MEDICAL';
  
  if (station.type === 'fire') {
    badgeColor = '#ff8800';
    badgeBg = 'rgba(255,136,0,0.15)';
    typeLabel = 'FIRE & RESCUE';
  } else if (station.type === 'police') {
    badgeColor = '#1e6bff';
    badgeBg = 'rgba(30,107,255,0.15)';
    typeLabel = 'POLICE / LAW ENFORCEMENT';
  }

  const phoneHtml = station.phone ? `<div style="margin-top: 4px; color: #fff;">📞 ${escapeHtml(station.phone)}</div>` : '';
  const addrHtml = station.address ? `<div style="margin-top: 2px; color: var(--text-secondary); font-size: 10px;">${escapeHtml(station.address)}</div>` : '';

  return `
    <div style="font-family: var(--hud-font); min-width: 190px; padding: 4px;">
      <div style="display: inline-block; padding: 2px 6px; font-size: 9px; font-weight: bold; color: ${badgeColor}; background: ${badgeBg}; border: 1px solid ${badgeColor}; border-radius: 2px; margin-bottom: 5px;">
        ${typeLabel}
      </div>
      <div style="font-size: 12px; font-weight: bold; color: #fff; margin-bottom: 4px;">
        ${escapeHtml(station.name)}
      </div>
      ${addrHtml}
      ${phoneHtml}
      <div style="margin-top: 4px; font-size: 10px; color: var(--text-secondary);">
        COORDS: ${station.lat.toFixed(5)}, ${station.lng.toFixed(5)}
      </div>
      <div style="margin-top: 8px; display: flex; gap: 4px;">
        <button onclick="window.primaryMap.flyTo([${station.lat}, ${station.lng}], 16)" style="flex: 1; background: rgba(0,255,204,0.15); border: 1px solid var(--accent-color); color: #fff; font-family: var(--hud-font); font-size: 9px; padding: 4px; cursor: pointer;">[ FOCUS ]</button>
      </div>
    </div>
  `;
}

function renderEmsLayers() {
  hospitalLayerPrimary.clearLayers();
  fireLayerPrimary.clearLayers();
  policeLayerPrimary.clearLayers();

  hospitalLayerSecondary.clearLayers();
  fireLayerSecondary.clearLayers();
  policeLayerSecondary.clearLayers();

  allEmsStations.forEach(st => {
    let icon = hospitalIcon;
    let targetPrimary = hospitalLayerPrimary;
    let targetSecondary = hospitalLayerSecondary;

    if (st.type === 'fire') {
      icon = fireIcon;
      targetPrimary = fireLayerPrimary;
      targetSecondary = fireLayerSecondary;
    } else if (st.type === 'police') {
      icon = policeIcon;
      targetPrimary = policeLayerPrimary;
      targetSecondary = policeLayerSecondary;
    }

    const popupHtml = createEmsPopupContent(st);

    const m1 = L.marker([st.lat, st.lng], { icon: icon }).bindPopup(popupHtml);
    targetPrimary.addLayer(m1);

    const m2 = L.marker([st.lat, st.lng], { icon: icon }).bindPopup(popupHtml);
    targetSecondary.addLayer(m2);
  });

  updateEmsLayerVisibility();
  logToFeed(`SYS: EMS TELEMETRY ONLINE (${allEmsStations.length} UNITS INDEXED)`);
}

function updateEmsLayerVisibility() {
  // 1. Hospitals (White)
  if (emsHospitalsEnabled) {
    if (!primaryMap.hasLayer(hospitalLayerPrimary)) hospitalLayerPrimary.addTo(primaryMap);
    if (!secondaryMap2.hasLayer(hospitalLayerSecondary)) hospitalLayerSecondary.addTo(secondaryMap2);
  } else {
    primaryMap.removeLayer(hospitalLayerPrimary);
    secondaryMap2.removeLayer(hospitalLayerSecondary);
  }

  // 2. Fire Stations (Orange)
  if (emsFireEnabled) {
    if (!primaryMap.hasLayer(fireLayerPrimary)) fireLayerPrimary.addTo(primaryMap);
    if (!secondaryMap2.hasLayer(fireLayerSecondary)) fireLayerSecondary.addTo(secondaryMap2);
  } else {
    primaryMap.removeLayer(fireLayerPrimary);
    secondaryMap2.removeLayer(fireLayerSecondary);
  }

  // 3. Police Stations (Bright Royal Blue)
  if (emsPoliceEnabled) {
    if (!primaryMap.hasLayer(policeLayerPrimary)) policeLayerPrimary.addTo(primaryMap);
    if (!secondaryMap2.hasLayer(policeLayerSecondary)) policeLayerSecondary.addTo(secondaryMap2);
  } else {
    primaryMap.removeLayer(policeLayerPrimary);
    secondaryMap2.removeLayer(policeLayerSecondary);
  }

  // Sync checkboxes in settings
  const emsHospitalToggle = document.getElementById('ems-hospital-toggle');
  const emsFireToggle = document.getElementById('ems-fire-toggle');
  const emsPoliceToggle = document.getElementById('ems-police-toggle');

  if (emsHospitalToggle) emsHospitalToggle.checked = emsHospitalsEnabled;
  if (emsFireToggle) emsFireToggle.checked = emsFireEnabled;
  if (emsPoliceToggle) emsPoliceToggle.checked = emsPoliceEnabled;

  // Sync sidebar quick-buttons
  const emsQuickHospital = document.getElementById('ems-quick-hospital');
  const emsQuickFire = document.getElementById('ems-quick-fire');
  const emsQuickPolice = document.getElementById('ems-quick-police');

  if (emsQuickHospital) emsQuickHospital.classList.toggle('inactive', !emsHospitalsEnabled);
  if (emsQuickFire) emsQuickFire.classList.toggle('inactive', !emsFireEnabled);
  if (emsQuickPolice) emsQuickPolice.classList.toggle('inactive', !emsPoliceEnabled);

  // Persist state
  localStorage.setItem('cmd-ems-hospitals', emsHospitalsEnabled);
  localStorage.setItem('cmd-ems-fire', emsFireEnabled);
  localStorage.setItem('cmd-ems-police', emsPoliceEnabled);
}

// Global Dynamic Overpass OSM Scanner
async function scanAreaForEms() {
  const center = primaryMap.getCenter();
  const lat = center.lat;
  const lng = center.lng;

  logToFeed(`SYS: SCANNING OPENSTREETMAP FOR EMS AROUND [${lat.toFixed(4)}, ${lng.toFixed(4)}]...`);

  const btnScan = document.getElementById('btn-scan-osm-ems');
  if (btnScan) {
    btnScan.textContent = '[ SCANNING... ]';
    btnScan.disabled = true;
  }

  try {
    const query = `[out:json][timeout:15];(node["amenity"~"hospital|clinic|fire_station|police"](around:40000,${lat},${lng});way["amenity"~"hospital|clinic|fire_station|police"](around:40000,${lat},${lng}););out center;`;
    const res = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`);
    const data = await res.json();

    if (data && data.elements && data.elements.length > 0) {
      let addedCount = 0;
      data.elements.forEach(el => {
        const pLat = el.lat || (el.center && el.center.lat);
        const pLng = el.lon || (el.center && el.center.lon);
        if (!pLat || !pLng) return;

        const amenity = (el.tags && el.tags.amenity) || '';
        let type = 'hospital';
        if (amenity === 'fire_station') type = 'fire';
        else if (amenity === 'police') type = 'police';

        const name = (el.tags && (el.tags.name || el.tags['name:en'] || el.tags.operator)) || (type.toUpperCase() + ' STATION');
        const phone = (el.tags && (el.tags.phone || el.tags['contact:phone'])) || '';
        const address = (el.tags && [el.tags['addr:street'], el.tags['addr:city']].filter(Boolean).join(', ')) || '';

        // Check for duplicates
        const exists = allEmsStations.some(s => {
          const d = Math.hypot(s.lat - pLat, s.lng - pLng);
          return d < 0.002;
        });

        if (!exists) {
          allEmsStations.push({
            id: `osm-${el.id}`,
            type,
            name,
            lat: pLat,
            lng: pLng,
            address,
            phone
          });
          addedCount++;
        }
      });

      renderEmsLayers();
      logToFeed(`SYS: SATELLITE SCAN COMPLETE (+${addedCount} NEW EMS STATIONS)`);
    } else {
      logToFeed(`SYS: NO ADDITIONAL EMS STATIONS FOUND IN IMMEDIATE RADIUS`);
    }
  } catch (err) {
    logToFeed(`SYS: SATELLITE EMS SCAN ERROR: ${err.message}`, true);
  } finally {
    if (btnScan) {
      btnScan.textContent = '[ 📡 SCAN AREA (OSM) ]';
      btnScan.disabled = false;
    }
  }
}

// Data Initialization Poller
let retryCount = 0;
function waitForDataAndRender() {
  if (typeof window.json_Buoys_2 !== 'undefined') {
    logToFeed(`[DIAG] QGIS Buoy Data Loaded in ${retryCount * 100}ms`);
    renderBuoys().then(() => {
      const bCount = buoysLayerPrimary.getLayers().length;
      logToFeed(`[DIAG] BUOYS RENDERED: ${bCount} markers.`);
    }).catch(e => logToFeed(`[DIAG] BUOY ERR: ${e.message}`));
    renderEmsLayers();
  } else if (retryCount < 20) {
    retryCount++;
    setTimeout(waitForDataAndRender, 100);
  } else {
    logToFeed("SYS: LOCAL ASSETS READY");
    renderBuoys();
    renderEmsLayers();
  }
}

// Event Listeners for EMS Subset Toggles
function setupEmsEventListeners() {
  const emsHospitalToggle = document.getElementById('ems-hospital-toggle');
  const emsFireToggle = document.getElementById('ems-fire-toggle');
  const emsPoliceToggle = document.getElementById('ems-police-toggle');

  const emsQuickHospital = document.getElementById('ems-quick-hospital');
  const emsQuickFire = document.getElementById('ems-quick-fire');
  const emsQuickPolice = document.getElementById('ems-quick-police');

  const btnScan = document.getElementById('btn-scan-osm-ems');

  if (emsHospitalToggle) {
    emsHospitalToggle.addEventListener('change', (e) => {
      emsHospitalsEnabled = e.target.checked;
      updateEmsLayerVisibility();
      logToFeed(`EMS: HOSPITALS LAYER ${emsHospitalsEnabled ? 'ENABLED' : 'DISABLED'}`);
    });
  }

  if (emsFireToggle) {
    emsFireToggle.addEventListener('change', (e) => {
      emsFireEnabled = e.target.checked;
      updateEmsLayerVisibility();
      logToFeed(`EMS: FIRE STATIONS LAYER ${emsFireEnabled ? 'ENABLED' : 'DISABLED'}`);
    });
  }

  if (emsPoliceToggle) {
    emsPoliceToggle.addEventListener('change', (e) => {
      emsPoliceEnabled = e.target.checked;
      updateEmsLayerVisibility();
      logToFeed(`EMS: POLICE STATIONS LAYER ${emsPoliceEnabled ? 'ENABLED' : 'DISABLED'}`);
    });
  }

  if (emsQuickHospital) {
    emsQuickHospital.addEventListener('click', () => {
      emsHospitalsEnabled = !emsHospitalsEnabled;
      updateEmsLayerVisibility();
      logToFeed(`EMS: HOSPITALS LAYER ${emsHospitalsEnabled ? 'ENABLED' : 'DISABLED'}`);
    });
  }

  if (emsQuickFire) {
    emsQuickFire.addEventListener('click', () => {
      emsFireEnabled = !emsFireEnabled;
      updateEmsLayerVisibility();
      logToFeed(`EMS: FIRE STATIONS LAYER ${emsFireEnabled ? 'ENABLED' : 'DISABLED'}`);
    });
  }

  if (emsQuickPolice) {
    emsQuickPolice.addEventListener('click', () => {
      emsPoliceEnabled = !emsPoliceEnabled;
      updateEmsLayerVisibility();
      logToFeed(`EMS: POLICE STATIONS LAYER ${emsPoliceEnabled ? 'ENABLED' : 'DISABLED'}`);
    });
  }

  if (btnScan) {
    btnScan.addEventListener('click', scanAreaForEms);
  }
}

// Start data polling & attach event listeners
waitForDataAndRender();
setupEmsEventListeners();

setTimeout(() => {
  primaryMap.invalidateSize();
  secondaryMap1.invalidateSize();
  secondaryMap2.invalidateSize();
  secondaryMap3.invalidateSize();
  secondaryMap4.invalidateSize();
  secondaryMap5.invalidateSize();
}, 500);

// --- Welcome Modal Logic ---
const welcomeModal = document.getElementById('welcome-modal');
const btnWelcomeEnter = document.getElementById('btn-welcome-enter');
if (welcomeModal && !sessionStorage.getItem('welcome_dismissed')) {
  welcomeModal.style.display = 'flex';
}

if (btnWelcomeEnter && welcomeModal) {
  btnWelcomeEnter.addEventListener('click', () => {
    welcomeModal.style.display = 'none';
    sessionStorage.setItem('welcome_dismissed', 'true');
    logToFeed("SYS: COMMAND TERMINAL ONLINE", true);
  });
}

// --- Station Identity & Base Location Configuration ---
const stationNameDisplay = document.getElementById('station-name-display');
const windStationDisplay = document.getElementById('wind-station-display');
const settingStationName = document.getElementById('setting-station-name');
const settingLocationSearch = document.getElementById('setting-location-search');
const btnSearchLocation = document.getElementById('btn-search-location');
const locationSearchStatus = document.getElementById('location-search-status');
const locationSearchResults = document.getElementById('location-search-results');
const settingDefaultLat = document.getElementById('setting-default-lat');
const settingDefaultLng = document.getElementById('setting-default-lng');
const settingDefaultZoom = document.getElementById('setting-default-zoom');
const btnSetCurrentCenter = document.getElementById('btn-set-current-center');
const btnPickMapLoc = document.getElementById('btn-pick-map-loc');
const btnSaveStationProfile = document.getElementById('btn-save-station-profile');
const btnResetStationProfile = document.getElementById('btn-reset-station-profile');
const stationSettingsFeedback = document.getElementById('station-settings-feedback');
const locationPickerHudBanner = document.getElementById('location-picker-hud-banner');
const btnCancelLocationPicker = document.getElementById('btn-cancel-location-picker');

function applyStationProfile() {
  const profile = getStationProfile();
  if (stationNameDisplay) stationNameDisplay.textContent = profile.name;
  if (windStationDisplay) windStationDisplay.textContent = `${profile.name} // 10M SENSOR`;
  document.title = `${profile.name} - Tactical Command Screen`;
  
  if (typeof secondaryMap5 !== 'undefined' && secondaryMap5) {
    secondaryMap5.setView([profile.lat, profile.lng], secondaryMap5.getZoom() || 14);
  }
  if (typeof secondaryMap2 !== 'undefined' && secondaryMap2) {
    secondaryMap2.setView([profile.lat, profile.lng], secondaryMap2.getZoom() || 13);
  }

  if (currentUser) {
    const domain = window.location.origin + window.location.pathname.replace('index.html', '');
    const transmitUrl = `${domain}transmit.html?dispatcher=${currentUser.uid}&lat=${profile.lat}&lng=${profile.lng}&base=${encodeURIComponent(profile.name)}`;
    if (hudTransmitLink) hudTransmitLink.value = transmitUrl;
    if (settingsTransmitLink) settingsTransmitLink.value = transmitUrl;
  }
}

function populateStationSettingsUI() {
  const profile = getStationProfile();
  if (settingStationName) settingStationName.value = profile.name;
  if (settingDefaultLat) settingDefaultLat.value = profile.lat.toFixed(5);
  if (settingDefaultLng) settingDefaultLng.value = profile.lng.toFixed(5);
  if (settingDefaultZoom) settingDefaultZoom.value = profile.zoom;
  if (stationSettingsFeedback) stationSettingsFeedback.innerHTML = '';
  if (locationSearchStatus) {
    locationSearchStatus.style.display = 'none';
    locationSearchStatus.innerHTML = '';
  }
  if (locationSearchResults) {
    locationSearchResults.style.display = 'none';
    locationSearchResults.innerHTML = '';
  }
}

// 1. Geocoding Location Search
async function executeLocationSearch() {
  if (!settingLocationSearch) return;
  const query = settingLocationSearch.value.trim();
  if (!query) {
    if (locationSearchStatus) {
      locationSearchStatus.style.display = 'block';
      locationSearchStatus.innerHTML = '<span style="color: var(--danger-color);">ENTER A LOCATION QUERY OR COORDINATES</span>';
    }
    return;
  }

  // Check if query is direct coordinates (e.g. 49.034, -57.595)
  const coordMatch = query.match(/^([-+]?[0-9]*\.?[0-9]+)[,\s]+([-+]?[0-9]*\.?[0-9]+)$/);
  if (coordMatch) {
    const lat = parseFloat(coordMatch[1]);
    const lng = parseFloat(coordMatch[2]);
    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      if (settingDefaultLat) settingDefaultLat.value = lat.toFixed(5);
      if (settingDefaultLng) settingDefaultLng.value = lng.toFixed(5);
      primaryMap.flyTo([lat, lng], parseInt(settingDefaultZoom.value, 10) || 13);
      if (locationSearchStatus) {
        locationSearchStatus.style.display = 'block';
        locationSearchStatus.innerHTML = `<span style="color: #00ffcc;">✓ COORDS IDENTIFIED: [${lat.toFixed(4)}, ${lng.toFixed(4)}]</span>`;
      }
      if (stationSettingsFeedback) {
        stationSettingsFeedback.innerHTML = `<span style="color: #00ffcc;">Target centered. Click [ SAVE & APPLY ] to confirm.</span>`;
      }
      return;
    }
  }

  if (locationSearchStatus) {
    locationSearchStatus.style.display = 'block';
    locationSearchStatus.innerHTML = 'SCANNING GLOBAL SATELLITE DIRECTORY...';
  }
  if (locationSearchResults) {
    locationSearchResults.style.display = 'none';
    locationSearchResults.innerHTML = '';
  }

  try {
    const endpoint = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1`;
    const res = await fetch(endpoint);
    const data = await res.json();

    if (!data || data.length === 0) {
      if (locationSearchStatus) {
        locationSearchStatus.innerHTML = '<span style="color: var(--danger-color);">NO SATELLITE MATCHES FOUND. TRY A DIFFERENT QUERY.</span>';
      }
      return;
    }

    if (locationSearchStatus) {
      locationSearchStatus.innerHTML = `<span style="color: var(--accent-color);">FOUND ${data.length} MATCHES (CLICK TO POSITION):</span>`;
    }
    if (locationSearchResults) {
      locationSearchResults.innerHTML = '';
      locationSearchResults.style.display = 'block';

      data.forEach(item => {
        const div = document.createElement('div');
        div.className = 'search-result-item';
        const lat = parseFloat(item.lat);
        const lon = parseFloat(item.lon);
        const displayName = item.display_name;
        const shortName = (item.name || displayName.split(',')[0]).trim();

        div.innerHTML = `
          <div class="sr-title">📍 ${displayName}</div>
          <div class="sr-coords">LAT: ${lat.toFixed(5)} | LON: ${lon.toFixed(5)}</div>
        `;

        div.addEventListener('click', () => {
          if (settingDefaultLat) settingDefaultLat.value = lat.toFixed(5);
          if (settingDefaultLng) settingDefaultLng.value = lon.toFixed(5);

          if (settingStationName && (!settingStationName.value || settingStationName.value === DEFAULT_STATION_NAME)) {
            settingStationName.value = shortName.toUpperCase();
          }

          primaryMap.flyTo([lat, lon], 13);
          locationSearchResults.style.display = 'none';
          if (locationSearchStatus) {
            locationSearchStatus.innerHTML = `<span style="color: #00ffcc;">✓ SELECTED: ${shortName.toUpperCase()} [${lat.toFixed(4)}, ${lon.toFixed(4)}]</span>`;
          }
          if (stationSettingsFeedback) {
            stationSettingsFeedback.innerHTML = `<span style="color: #00ffcc;">Base re-targeted to ${shortName.toUpperCase()}. Click [ SAVE & APPLY ] to confirm.</span>`;
          }
        });

        locationSearchResults.appendChild(div);
      });
    }
  } catch (err) {
    if (locationSearchStatus) {
      locationSearchStatus.innerHTML = '<span style="color: var(--danger-color);">DIRECTORY SEARCH FAILED (OFFLINE / TIMEOUT).</span>';
    }
  }
}

if (btnSearchLocation) {
  btnSearchLocation.addEventListener('click', executeLocationSearch);
}
if (settingLocationSearch) {
  settingLocationSearch.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      executeLocationSearch();
    }
  });
}

// 2. Use Current Map View
if (btnSetCurrentCenter) {
  btnSetCurrentCenter.addEventListener('click', () => {
    const center = primaryMap.getCenter();
    const zoom = primaryMap.getZoom();
    if (settingDefaultLat) settingDefaultLat.value = center.lat.toFixed(5);
    if (settingDefaultLng) settingDefaultLng.value = center.lng.toFixed(5);
    if (settingDefaultZoom) settingDefaultZoom.value = zoom;
    if (stationSettingsFeedback) {
      stationSettingsFeedback.innerHTML = `<span style="color: #00ffcc;">✓ CAPTURED MAP VIEW: [${center.lat.toFixed(4)}, ${center.lng.toFixed(4)}] @ ZOOM ${zoom}</span>`;
    }
  });
}

// 3. Pick on Map
let isPickingLocation = false;
let locationPickerMarker = null;

function startLocationPicker() {
  isPickingLocation = true;
  if (settingsModal) settingsModal.style.display = 'none';
  if (locationPickerHudBanner) locationPickerHudBanner.style.display = 'flex';
  const mapEl = document.getElementById('primary-map');
  if (mapEl) mapEl.style.cursor = 'crosshair';

  const onMapPickClick = (e) => {
    if (!isPickingLocation) return;
    const lat = e.latlng.lat;
    const lng = e.latlng.lng;

    if (settingDefaultLat) settingDefaultLat.value = lat.toFixed(5);
    if (settingDefaultLng) settingDefaultLng.value = lng.toFixed(5);

    if (locationPickerMarker) primaryMap.removeLayer(locationPickerMarker);
    locationPickerMarker = L.circleMarker([lat, lng], {
      radius: 14,
      color: '#00ffcc',
      fillColor: '#00ffcc',
      fillOpacity: 0.35,
      weight: 2
    }).addTo(primaryMap);

    setTimeout(() => {
      if (locationPickerMarker) {
        primaryMap.removeLayer(locationPickerMarker);
        locationPickerMarker = null;
      }
    }, 4000);

    stopLocationPicker();
    if (settingsModal) settingsModal.style.display = 'flex';
    if (stationSettingsFeedback) {
      stationSettingsFeedback.innerHTML = `<span style="color: #00ffcc;">✓ PICKED COORDS: [${lat.toFixed(5)}, ${lng.toFixed(5)}]. Click [ SAVE & APPLY ] to confirm.</span>`;
    }
    logToFeed(`LOCATION PICKED: [${lat.toFixed(4)}, ${lng.toFixed(4)}]`);
  };

  primaryMap.once('click', onMapPickClick);

  const onPickKeyDown = (e) => {
    if (e.key === 'Escape') {
      primaryMap.off('click', onMapPickClick);
      stopLocationPicker();
      if (settingsModal) settingsModal.style.display = 'flex';
    }
  };
  window.addEventListener('keydown', onPickKeyDown, { once: true });
}

function stopLocationPicker() {
  isPickingLocation = false;
  if (locationPickerHudBanner) locationPickerHudBanner.style.display = 'none';
  const mapEl = document.getElementById('primary-map');
  if (mapEl) mapEl.style.cursor = '';
}

if (btnPickMapLoc) {
  btnPickMapLoc.addEventListener('click', startLocationPicker);
}
if (btnCancelLocationPicker) {
  btnCancelLocationPicker.addEventListener('click', () => {
    stopLocationPicker();
    if (settingsModal) settingsModal.style.display = 'flex';
  });
}

// 4. Save & Apply Station Profile
function saveAndApplyStationProfile() {
  const name = ((settingStationName && settingStationName.value) || DEFAULT_STATION_NAME).trim().toUpperCase();
  const lat = parseFloat(settingDefaultLat ? settingDefaultLat.value : DEFAULT_BASE_LAT);
  const lng = parseFloat(settingDefaultLng ? settingDefaultLng.value : DEFAULT_BASE_LNG);
  const zoom = parseInt(settingDefaultZoom ? settingDefaultZoom.value : DEFAULT_BASE_ZOOM, 10) || DEFAULT_BASE_ZOOM;

  if (isNaN(lat) || lat < -90 || lat > 90) {
    if (stationSettingsFeedback) stationSettingsFeedback.innerHTML = `<span style="color: var(--danger-color);">INVALID LATITUDE (-90 to 90)</span>`;
    return;
  }
  if (isNaN(lng) || lng < -180 || lng > 180) {
    if (stationSettingsFeedback) stationSettingsFeedback.innerHTML = `<span style="color: var(--danger-color);">INVALID LONGITUDE (-180 to 180)</span>`;
    return;
  }

  localStorage.setItem('cmd-station-name', name);
  localStorage.setItem('cmd-default-lat', lat);
  localStorage.setItem('cmd-default-lng', lng);
  localStorage.setItem('cmd-default-zoom', zoom);

  applyStationProfile();

  if (stationSettingsFeedback) {
    stationSettingsFeedback.innerHTML = `<span style="color: #00ffcc;">✓ STATION PROFILE SAVED & APPLIED</span>`;
  }
  logToFeed(`SYS: BASE RECONFIGURED TO ${name} [${lat.toFixed(4)}, ${lng.toFixed(4)}]`);

  primaryMap.flyTo([lat, lng], zoom, { duration: 1.0 });
  handleWeatherUpdate();
}

if (btnSaveStationProfile) {
  btnSaveStationProfile.addEventListener('click', saveAndApplyStationProfile);
}

// 5. Reset to Deer Lake
function resetToDefaultDeerLake() {
  localStorage.setItem('cmd-station-name', DEFAULT_STATION_NAME);
  localStorage.setItem('cmd-default-lat', DEFAULT_BASE_LAT);
  localStorage.setItem('cmd-default-lng', DEFAULT_BASE_LNG);
  localStorage.setItem('cmd-default-zoom', DEFAULT_BASE_ZOOM);

  populateStationSettingsUI();
  applyStationProfile();

  if (stationSettingsFeedback) {
    stationSettingsFeedback.innerHTML = `<span style="color: #00ffcc;">✓ RESET TO DEER LAKE BASE</span>`;
  }
  logToFeed(`SYS: BASE RESET TO DEFAULT (DEER LAKE)`);

  primaryMap.flyTo([DEFAULT_BASE_LAT, DEFAULT_BASE_LNG], DEFAULT_BASE_ZOOM, { duration: 1.0 });
  handleWeatherUpdate();
}

if (btnResetStationProfile) {
  btnResetStationProfile.addEventListener('click', resetToDefaultDeerLake);
}

// --- Settings Configuration Terminal Logic ---
const settingsModal = document.getElementById('settings-modal');
const settingsBtn = document.getElementById('settings-btn');
const btnCloseSettings = document.getElementById('btn-close-settings');

if (settingsBtn && settingsModal) {
  settingsBtn.addEventListener('click', () => {
    populateStationSettingsUI();
    settingsModal.style.display = 'flex';
  });
}
if (btnCloseSettings && settingsModal) {
  btnCloseSettings.addEventListener('click', () => {
    settingsModal.style.display = 'none';
  });
}
if (settingsModal) {
  settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) {
      settingsModal.style.display = 'none';
    }
  });
}

// Initial apply of saved station profile on boot
applyStationProfile();

// --- Help Terminal Logic ---
const helpBtn = document.getElementById('help-btn');
const helpModal = document.getElementById('help-modal');
const btnCloseHelp = document.getElementById('btn-close-help');
const helpSearch = document.getElementById('help-search');

helpBtn.addEventListener('click', () => {
  helpModal.style.display = 'flex';
  helpSearch.value = '';
  helpSearch.focus();
  document.querySelectorAll('.help-topic').forEach(t => t.style.display = 'block');
});

btnCloseHelp.addEventListener('click', () => {
  helpModal.style.display = 'none';
});

helpSearch.addEventListener('input', (e) => {
  const term = e.target.value.toLowerCase();
  document.querySelectorAll('.help-topic').forEach(topic => {
    const text = topic.innerText.toLowerCase();
    if (text.includes(term)) {
      topic.style.display = 'block';
    } else {
      topic.style.display = 'none';
    }
  });
});

// --- Cyber-Tactical Audio Engine (Procedural Web Audio) ---
let audioCtx = null;
let audioEnabled = localStorage.getItem('cmd-audio-enabled') === 'true';

function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

function playSfx(type) {
  if (!audioEnabled && type !== 'sos-override' && type !== 'sos') return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    if (type === 'click') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1600, now);
      osc.frequency.exponentialRampToValueAtTime(700, now + 0.04);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.045);
    } else if (type === 'sonar' || type === 'radar') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(950, now);
      osc.frequency.exponentialRampToValueAtTime(1400, now + 0.08);
      osc.frequency.exponentialRampToValueAtTime(1050, now + 0.45);
      gain.gain.setValueAtTime(0.16, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.52);
    } else if (type === 'telemetry') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(2400, now);
      gain.gain.setValueAtTime(0.04, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.02);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.025);
    } else if (type === 'deploy') {
      [523.25, 659.25, 783.99].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + i * 0.06);
        gain.gain.setValueAtTime(0.1, now + i * 0.06);
        gain.gain.exponentialRampToValueAtTime(0.001, now + (i + 1) * 0.06 + 0.1);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + i * 0.06);
        osc.stop(now + (i + 1) * 0.06 + 0.12);
      });
    } else if (type === 'sos' || type === 'sos-override') {
      for (let i = 0; i < 3; i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const start = now + i * 0.22;
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(i % 2 === 0 ? 880 : 660, start);
        gain.gain.setValueAtTime(0.2, start);
        gain.gain.exponentialRampToValueAtTime(0.01, start + 0.18);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.2);
      }
    }
  } catch (e) {
    console.error("Audio Context failed:", e);
  }
}

// Render cadet glowing vector trail
function renderCadetTrail(id, coords, status) {
  if (!cadetTrailsEnabled || coords.length < 2) return;
  const color = status === 'sos' ? '#ff3b30' : (status === 'warning' ? '#ffcc00' : '#00d2ff');
  if (cadetTrails.has(id)) {
    const polyline = cadetTrails.get(id);
    polyline.setLatLngs(coords);
    polyline.setStyle({ color: color });
  } else {
    const polyline = L.polyline(coords, {
      color: color,
      weight: 2.5,
      opacity: 0.8,
      className: 'cadet-trail-path',
      lineCap: 'round',
      lineJoin: 'round'
    }).addTo(cadetTrailsLayer);
    cadetTrails.set(id, polyline);
  }
}

function getCadetIcon(record, isLkp = false) {
  const name = escapeHtml(record.name || 'Unit');
  const type = record.icon_type || 'blip';
  let color = record.icon_color || 'green';
  const status = record.status || 'active';
  const heading = (record.heading !== undefined && record.heading !== null && !isNaN(record.heading)) ? record.heading : null;
  
  // SOS overrides color to red
  if (status === 'sos') {
    color = 'red';
  }
  
  const lkpClass = isLkp ? ' cadet-lkp' : '';

  // Sleek directional arrow for heading
  let headingArrowHtml = '';
  if (heading !== null) {
    const arrowColor = (status === 'sos') ? 'var(--danger-color)' : (isLkp ? '#ffaa00' : 'var(--accent-color)');
    headingArrowHtml = `<div class="cadet-heading-arrow" style="transform: translate(-50%, -100%) rotate(${heading}deg); border-bottom-color: ${arrowColor};" title="Heading: ${heading}°"></div>`;
  }
  
  if (type === 'blip') {
    const blipClass = (status === 'sos') ? `cadet-blip blip-red alert${lkpClass}` : `cadet-blip blip-${color}${lkpClass}`;
    return L.divIcon({
      className: blipClass,
      html: `${headingArrowHtml}<div class="cadet-blip-label">${name}</div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });
  } else {
    // Render selected SVG icon
    let svgPath = '';
    if (type === 'boat') {
      svgPath = '<path d="M2 17l1.5 2.5A1 1 0 004.4 20h15.2a1 1 0 00.9-.5l1.5-2.5v-3H2v3z M17 14l-1.5-4h-7L7 14"></path>';
    } else if (type === 'zodiac') {
      svgPath = '<path d="M4 14a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v1a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-1z M18 12.5L16.5 8h-6L9 12.5 M2 12h2v4H2z"></path>';
    } else if (type === 'sailboat') {
      svgPath = '<path d="M2 18h20l-3-4H5l-3 4z M12 3v11 M12 3l8 8h-8 M12 5l-7 6h7"></path>';
    } else if (type === 'ship') {
      svgPath = '<path d="M2 17l1.5 2.5A1 1 0 004.4 20h15.2a1 1 0 00.9-.5l1.5-2.5V13H2v4z M7 13V9h4v4 M13 13V7h6v6"></path>';
    } else if (type === 'truck') {
      svgPath = '<rect x="1" y="3" width="15" height="13"></rect><polygon points="16 8 20 8 23 11 23 16 16 16 8"></polygon><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle>';
    } else if (type === 'user') {
      svgPath = '<circle cx="12" cy="5" r="2"></circle><path d="M9 22l2-6M15 22l-2-6M12 10v6M9 12h6"></path>';
    } else if (type === 'anchor') {
      svgPath = '<circle cx="12" cy="5" r="3"></circle><line x1="12" y1="22" x2="12" y2="8"></line><path d="M5 12H2a10 10 0 0 0 20 0h-3"></path>';
    } else if (type === 'medical') {
      svgPath = '<path d="M11 2a2 2 0 0 0-2 2v5H4a2 2 0 0 0-2 2v2c0 1.1.9 2 2 2h5v5c0 1.1.9 2 2 2h2a2 2 0 0 0 2-2v-5h5a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2h-5V4a2 2 0 0 0-2-2h-2z"></path>';
    } else if (type === 'warning') {
      svgPath = '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line>';
    }
    
    let wrapperClass = (status === 'sos') ? 'marine-icon-wrapper sos-pulse' : 'marine-icon-wrapper';
    if (isLkp) wrapperClass += ' cadet-lkp';
    
    return L.divIcon({
      className: `marine-icon`,
      html: `<div class="${wrapperClass}">${headingArrowHtml}<svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" class="svg-${color}">${svgPath}</svg><div class="cadet-blip-label" style="top: 26px;">${name}</div></div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });
  }
}

// Track last-seen timestamps for LKP comms silence detector
const cadetLastSeen = new Map();
const cadetLkpState = new Map();

function formatCadetPopup(id, data, isLkp = false, elapsedSec = 0) {
  const name = escapeHtml(data.name || 'Unit');
  const status = data.status || 'active';
  const kmh = ((data.speed || 0) * 3.6).toFixed(1);
  const mph = ((data.speed || 0) * 2.23694).toFixed(1);
  const spdDisplay = (data.speed && data.speed > 0.2) ? `${kmh} km/h (${mph} mph)` : '<span style="color:var(--text-secondary)">STATIONARY</span>';
  const hdgDisplay = (data.heading !== null && data.heading !== undefined && !isNaN(data.heading)) ? `${Math.round(data.heading)}° ${degToCardinal(data.heading)}` : 'N/A';
  const altDisplay = (data.altitude !== null && data.altitude !== undefined && !isNaN(data.altitude)) ? `${Math.round(data.altitude)}m MSL (${Math.round(data.altitude * 3.28084)}ft)` : 'N/A';
  const batDisplay = (data.battery !== null && data.battery !== undefined) ? `${data.battery}% ⚡` : 'N/A';
  const opStatus = data.op_status || 'PATROL';
  const lkpWarning = isLkp ? `<div class="cadet-lkp-badge" style="display:block; margin: 4px 0;">⚠️ COMMS SILENCE: LKP ${elapsedSec}s AGO</div>` : '';

  return `
    <strong>TACTICAL TRANSMITTER</strong><br/>
    CALLSIGN: <strong>${name}</strong><br/>
    MISSION: <span class="cadet-op-status">${escapeHtml(opStatus)}</span><br/>
    STATUS: <span class="val-${status}">${status.toUpperCase()}</span><br/>
    ${lkpWarning}
    SPEED: <strong>${spdDisplay}</strong><br/>
    HEADING: <strong>${hdgDisplay}</strong><br/>
    ELEVATION: <strong>${altDisplay}</strong><br/>
    BATTERY: <strong>${batDisplay}</strong><br/>
    LAT: ${Number(data.latitude).toFixed(5)}<br/>
    LON: ${Number(data.longitude).toFixed(5)}<br/>
    ACCURACY: ${data.accuracy ? data.accuracy.toFixed(1) + 'm' : 'N/A'}<br/>
    PARTY: ${escapeHtml(data.party_type || 'Party')} (x${data.party_size || 1})
    <div style="margin-top: 8px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 6px;">
      <button class="btn-primary" style="width: 100%; font-size: 10px; padding: 4px;" onclick="window.startRangefinderFromUnit('${id}')">[ 🎯 RANGE & BEARING VECTOR ]</button>
    </div>
  `;
}

function updateCadetsHudList() {
  const listEl = document.getElementById('cadets-list');
  if (!listEl) return;
  
  if (cadetMarkers.size === 0) {
    listEl.innerHTML = 'NO ACTIVE TRANSMITTERS';
    return;
  }
  
  let html = '<ul style="list-style: none; padding: 0; margin: 0;">';
  const now = Date.now();
  cadetMarkers.forEach((marker, id) => {
    const data = marker.cadetData;
    const name = escapeHtml(data.name || id);
    const type = data.icon_type || 'blip';
    let color = data.icon_color || 'green';
    let statusClass = 'status-ok';
    if (data.status === 'sos') {
      statusClass = 'status-danger';
      color = 'red';
    }

    const lastSeen = cadetLastSeen.get(id) || now;
    const elapsedSec = Math.round((now - lastSeen) / 1000);
    const isLkp = elapsedSec > 25;
    
    let iconHtml = '';
    if (type === 'blip') {
      iconHtml = `<span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background-color: currentColor; margin-right: 6px; box-shadow: 0 0 5px currentColor;" class="svg-${color}"></span>`;
    } else {
      let svgPath = '';
      if (type === 'boat') {
        svgPath = '<path d="M2 17l1.5 2.5A1 1 0 004.4 20h15.2v-3H2z"></path>';
      } else if (type === 'zodiac') {
        svgPath = '<path d="M4 14a2 2 0 0 1 2-2h12v3H4z"></path>';
      } else if (type === 'sailboat') {
        svgPath = '<path d="M2 18h20l-3-4H5z M12 3v11"></path>';
      } else if (type === 'ship') {
        svgPath = '<path d="M2 17l1.5 2.5A1 1 0 004.4 20h15.2v-7H2z"></path>';
      } else if (type === 'truck') {
        svgPath = '<rect x="1" y="3" width="15" height="13"></rect><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle>';
      } else if (type === 'user') {
        svgPath = '<circle cx="12" cy="5" r="2"></circle><path d="M9 22l2-6M15 22l-2-6"></path>';
      } else if (type === 'anchor') {
        svgPath = '<circle cx="12" cy="5" r="3"></circle><line x1="12" y1="22" x2="12" y2="8"></line>';
      } else if (type === 'medical') {
        svgPath = '<path d="M11 2a2 2 0 0 0-2 2v5H4v2h5v5h2v-5h5V9h-5V4z"></path>';
      } else if (type === 'warning') {
        svgPath = '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>';
      }
      iconHtml = `<svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none" style="margin-right: 6px; vertical-align: middle;" class="svg-${color}">${svgPath}</svg>`;
    }
    
    const kmh = ((data.speed || 0) * 3.6).toFixed(1);
    const spdStr = (data.speed && data.speed > 0.2) ? `${kmh} km/h` : 'STATIONARY';
    const hdgStr = (data.heading !== null && data.heading !== undefined) ? `${Math.round(data.heading)}° ${degToCardinal(data.heading)}` : '';
    const batStr = (data.battery !== null && data.battery !== undefined) ? ` | ${data.battery}% ⚡` : '';
    const opBadge = data.op_status ? `<span class="cadet-op-status">${escapeHtml(data.op_status)}</span>` : '';
    const lkpBadge = isLkp ? `<span class="cadet-lkp-badge">LKP ${elapsedSec}s AGO</span>` : '';
    
    html += `<li style="margin-bottom: 8px; display: flex; flex-direction: column; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 6px;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span style="display: flex; align-items: center;">
          ${iconHtml}
          <strong>${name}</strong>
        </span>
        <div style="display: flex; gap: 4px; align-items: center;">
          ${opBadge}
          <button class="wind-mini-btn" title="Measure Range Vector from ${name}" onclick="window.startRangefinderFromUnit('${id}')">[🎯]</button>
          <span class="hud-status-badge ${statusClass}" style="font-size: 9px; padding: 1px 4px; font-weight: bold;">${data.status.toUpperCase()}</span>
        </div>
      </div>
      <div style="font-size: 10px; color: var(--text-secondary); margin-left: 14px; margin-top: 2px; display: flex; justify-content: space-between;">
        <span>${spdStr} ${hdgStr}${batStr}</span>
        ${lkpBadge}
      </div>
    </li>`;
  });
  html += '</ul>';
  listEl.innerHTML = html;
}

function updateSosMinimap(newRecord, latlng, id, name, status) {
  if (status === 'sos') {
    if (sosMarkersSecondary.has(id)) {
      const marker5 = sosMarkersSecondary.get(id);
      marker5.setLatLng(latlng);
      marker5.setIcon(getCadetIcon(newRecord));
      marker5.cadetData = newRecord;
      marker5.getPopup().setContent(`
        <strong>ACTIVE SOS ALERT</strong><br/>
        CALLSIGN: <strong>${name}</strong><br/>
        LAT: ${latlng[0].toFixed(5)}<br/>
        LON: ${latlng[1].toFixed(5)}<br/>
        PARTY SIZE: ${newRecord.party_size || 1}
      `);
    } else {
      const marker5 = L.marker(latlng, { icon: getCadetIcon(newRecord) }).addTo(sosLayerSecondary);
      marker5.cadetData = newRecord;
      marker5.bindPopup(`
        <strong>ACTIVE SOS ALERT</strong><br/>
        CALLSIGN: <strong>${name}</strong><br/>
        LAT: ${latlng[0].toFixed(5)}<br/>
        LON: ${latlng[1].toFixed(5)}<br/>
        PARTY SIZE: ${newRecord.party_size || 1}
      `);
      sosMarkersSecondary.set(id, marker5);
    }
    // Auto zoom and center on the distress location
    secondaryMap5.setView(latlng, 16);
  } else {
    // If not SOS, remove from secondary SOS map
    if (sosMarkersSecondary.has(id)) {
      const marker5 = sosMarkersSecondary.get(id);
      sosLayerSecondary.removeLayer(marker5);
      sosMarkersSecondary.delete(id);
    }
  }
}

function handleCadetLocationUpdate(payload) {
  const { eventType, new: newRecord, old: oldRecord } = payload;
  
  if (eventType === 'DELETE') {
    const id = oldRecord.id;
    if (cadetMarkers.has(id)) {
      const marker = cadetMarkers.get(id);
      primaryMap.removeLayer(marker);
      cadetMarkers.delete(id);
      logToFeed(`SYS: RESPONDER DISCONNECTED [${escapeHtml(oldRecord.name) || 'UNIT'}]`);
    }
    if (sosMarkersSecondary.has(id)) {
      const marker5 = sosMarkersSecondary.get(id);
      sosLayerSecondary.removeLayer(marker5);
      sosMarkersSecondary.delete(id);
    }
    if (cadetTrails.has(id)) {
      cadetTrailsLayer.removeLayer(cadetTrails.get(id));
      cadetTrails.delete(id);
    }
    cadetHistories.delete(id);
    cadetLastSeen.delete(id);
    cadetLkpState.delete(id);
  } else {
    // INSERT or UPDATE
    const id = newRecord.id;
    const name = escapeHtml(newRecord.name);
    const lat = newRecord.latitude;
    const lng = newRecord.longitude;
    const status = newRecord.status || 'active';
    
    if (lat === undefined || lng === undefined || isNaN(lat) || isNaN(lng)) return;
    
    const latlng = [lat, lng];

    // Maintain breadcrumb trail history
    if (!cadetHistories.has(id)) {
      cadetHistories.set(id, []);
    }
    const history = cadetHistories.get(id);
    if (history.length === 0 || history[history.length - 1][0] !== lat || history[history.length - 1][1] !== lng) {
      history.push([lat, lng]);
      if (history.length > 30) history.shift();
    }
    if (cadetTrailsEnabled) {
      renderCadetTrail(id, history, status);
    }
    
    cadetLastSeen.set(id, Date.now());
    cadetLkpState.set(id, false);

    if (cadetMarkers.has(id)) {
      const marker = cadetMarkers.get(id);
      marker.setLatLng(latlng);
      marker.setIcon(getCadetIcon(newRecord));
      
      const oldStatus = marker.cadetData.status;
      marker.cadetData = newRecord;
      marker.getPopup().setContent(formatCadetPopup(id, newRecord));
      
      if (status === 'sos' && oldStatus !== 'sos') {
        logToFeed(`SOS TRANSMISSION RECEIVED: ${name} IS IN DISTRESS!`, true);
        playSfx('sos');
        triggerSosAlert(newRecord);
      } else {
        const kmh = ((newRecord.speed || 0) * 3.6).toFixed(1);
        const spdLog = newRecord.speed > 0.2 ? ` | ${kmh}km/h` : '';
        logToFeed(`SYS: LOCATION UPDATE: ${name} [${lat.toFixed(4)}, ${lng.toFixed(4)}]${spdLog}`);
      }
    } else {
      const marker = L.marker(latlng, { icon: getCadetIcon(newRecord) }).addTo(cadetsLayer);
      marker.cadetData = newRecord;
      marker.bindPopup(formatCadetPopup(id, newRecord));
      
      cadetMarkers.set(id, marker);
      logToFeed(`SYS: RESPONDER ONLINE [${name}]`);
      if (status === 'sos') {
        logToFeed(`SOS TRANSMISSION RECEIVED: ${name} IS IN DISTRESS!`, true);
        playSfx('sos');
        triggerSosAlert(newRecord);
      }
    }
    
    // Process SOS tracking update
    updateSosMinimap(newRecord, latlng, id, name, status);
  }
  updateCadetsHudList();
}

// Firestore replaces the Supabase realtime channel: one live listener scoped to
// this dispatcher's units. The initial snapshot arrives as 'added' changes,
// so no separate initial-load query is needed.
function subscribeToCadets() {
  if (!firebaseReady || !currentUser) {
    logToFeed("SYS: COLLABORATIVE DATABASE OFFLINE (NO CREDENTIALS)");
    return;
  }

  if (unsubscribeCadets) {
    unsubscribeCadets();
    unsubscribeCadets = null;
  }

  logToFeed("SYS: ESTABLISHING COLLABORATION CHANNELS...");

  const cadetsQuery = query(
    collection(db, 'cadet_locations'),
    where('dispatcher_id', '==', currentUser.uid)
  );

  let firstSnapshot = true;
  unsubscribeCadets = onSnapshot(cadetsQuery, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      const data = { id: change.doc.id, ...change.doc.data() };
      if (change.type === 'added') {
        handleCadetLocationUpdate({ eventType: 'INSERT', new: data });
      } else if (change.type === 'modified') {
        handleCadetLocationUpdate({ eventType: 'UPDATE', new: data });
      } else if (change.type === 'removed') {
        handleCadetLocationUpdate({ eventType: 'DELETE', old: data });
      }
    });
    if (firstSnapshot) {
      firstSnapshot = false;
      logToFeed("SYS: REAL-TIME COLLABORATION LINK ESTABLISHED");
    }
  }, (error) => {
    logToFeed(`SYS: REAL-TIME LINK ERROR - ${error.message}`, true);
  });
}

// --- Dispatcher Authentication & Link Copying Logic ---
let currentUser = null;
let unsubscribeCadets = null;

const dashAuthModal = document.getElementById('dashboard-auth-modal');
const tabDashLogin = document.getElementById('tab-dash-login');
const tabDashRegister = document.getElementById('tab-dash-register');
const dashAuthMessage = document.getElementById('dash-auth-message');
const dashAuthEmail = document.getElementById('dash-auth-email');
const dashAuthPassword = document.getElementById('dash-auth-password');
const groupDashConfirm = document.getElementById('group-dash-confirm');
const dashAuthConfirm = document.getElementById('dash-auth-confirm');
const btnDashAuthSubmit = document.getElementById('btn-dash-auth-submit');
const btnDashLogout = document.getElementById('btn-dash-logout');

const hudTransmitLink = document.getElementById('hud-transmit-link');
const settingsTransmitLink = document.getElementById('settings-transmit-link');
const btnCopyHudLink = document.getElementById('btn-copy-hud-link');
const btnCopySettingsLink = document.getElementById('btn-copy-settings-link');

let authMode = 'login'; // 'login' or 'register'

if (tabDashLogin && tabDashRegister) {
  tabDashLogin.addEventListener('click', () => {
    authMode = 'login';
    tabDashLogin.classList.add('active');
    tabDashRegister.classList.remove('active');
    tabDashLogin.style.color = 'var(--accent-color)';
    tabDashLogin.style.borderBottom = '2px solid var(--accent-color)';
    tabDashRegister.style.color = 'var(--text-secondary)';
    tabDashRegister.style.borderBottom = 'none';
    btnDashAuthSubmit.textContent = '[ AUTHENTICATE COMMANDER ]';
    dashAuthMessage.textContent = '';
    if (groupDashConfirm) groupDashConfirm.style.display = 'none';
  });

  tabDashRegister.addEventListener('click', () => {
    authMode = 'register';
    tabDashRegister.classList.add('active');
    tabDashLogin.classList.remove('active');
    tabDashRegister.style.color = 'var(--accent-color)';
    tabDashRegister.style.borderBottom = '2px solid var(--accent-color)';
    tabDashLogin.style.color = 'var(--text-secondary)';
    tabDashLogin.style.borderBottom = 'none';
    btnDashAuthSubmit.textContent = '[ CREATE OPERATOR KEY ]';
    dashAuthMessage.textContent = '';
    if (groupDashConfirm) groupDashConfirm.style.display = 'flex';
  });
}

// Check current session on load (onAuthStateChanged fires immediately
// with the current user, or null when signed out)
if (firebaseReady) {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      handleAuthSuccess(user);
    } else {
      showAuthScreen();
    }
  });
} else {
  if (dashAuthMessage) {
    dashAuthMessage.textContent = 'DATABASE OFFLINE (NO CONNECTION)';
  }
}

function handleAuthSuccess(user) {
  currentUser = user;
  if (dashAuthModal) dashAuthModal.style.display = 'none';
  
  // Show app layout
  const appContainer = document.getElementById('app');
  if (appContainer) appContainer.style.display = 'flex';
  
  // Recalculate leaflet map dimensions
  setTimeout(invalidateAllMaps, 200);

  // Generate & Display links
  const domain = window.location.origin + window.location.pathname.replace('index.html', '');
  const transmitUrl = `${domain}transmit.html?dispatcher=${user.uid}`;
  
  if (hudTransmitLink) hudTransmitLink.value = transmitUrl;
  if (settingsTransmitLink) settingsTransmitLink.value = transmitUrl;

  logToFeed("SYS: COMMAND TERMINAL ACCESS AUTHORIZED");
  logToFeed(`SYS: OPERATOR ACTIVE - ${user.email}`);

  // Subscribe to cadets
  subscribeToCadets();
}

function showAuthScreen() {
  currentUser = null;
  if (dashAuthModal) dashAuthModal.style.display = 'flex';
  
  const appContainer = document.getElementById('app');
  if (appContainer) appContainer.style.display = 'none';
  
  // Clear realtime listener
  if (unsubscribeCadets) {
    unsubscribeCadets();
    unsubscribeCadets = null;
  }
  
  // Clear cadet markers
  cadetMarkers.forEach((marker) => {
    primaryMap.removeLayer(marker);
  });
  cadetMarkers.clear();

  // Clear SOS markers
  if (sosMarkersSecondary) {
    sosMarkersSecondary.forEach((marker) => {
      secondaryMap5.removeLayer(marker);
    });
    sosMarkersSecondary.clear();
  }
  
  const cadetsList = document.getElementById('cadets-list');
  if (cadetsList) cadetsList.innerHTML = 'NO ACTIVE TRANSMITTERS';
}

function invalidateAllMaps() {
  if (primaryMap) primaryMap.invalidateSize();
  if (secondaryMap1) secondaryMap1.invalidateSize();
  if (secondaryMap2) secondaryMap2.invalidateSize();
  if (secondaryMap3) secondaryMap3.invalidateSize();
  if (secondaryMap4) secondaryMap4.invalidateSize();
  if (secondaryMap5) secondaryMap5.invalidateSize();
}

// Copy Links Event Listeners
function setupCopyBtn(btn, input, feedMsg) {
  if (btn && input) {
    btn.addEventListener('click', () => {
      navigator.clipboard.writeText(input.value)
        .then(() => {
          logToFeed(`SYS: ${feedMsg}`);
          const originalText = btn.textContent;
          btn.textContent = '[ COPIED! ]';
          setTimeout(() => {
            btn.textContent = originalText;
          }, 2000);
        })
        .catch(err => {
          logToFeed("SYS: FAILED TO COPY LINK", true);
        });
    });
  }
}

setupCopyBtn(btnCopyHudLink, hudTransmitLink, "TRANSMIT LINK COPIED TO CLIPBOARD");
setupCopyBtn(btnCopySettingsLink, settingsTransmitLink, "TRANSMIT LINK COPIED TO CLIPBOARD");

// Logout Button listener
if (btnDashLogout) {
  btnDashLogout.addEventListener('click', async () => {
    if (firebaseReady) {
      logToFeed("SYS: DISCONNECTING CENTRAL OPERATIONS...");
      await signOut(auth);
    }
  });
}

// Auth Submit Listener
if (btnDashAuthSubmit) {
  btnDashAuthSubmit.addEventListener('click', async () => {
    if (!firebaseReady) return;
    
    const email = dashAuthEmail.value.trim();
    const password = dashAuthPassword.value.trim();
    
    if (!email || !password) {
      dashAuthMessage.textContent = 'Email and password required.';
      return;
    }
    
    if (authMode === 'register') {
      const confirmPassword = dashAuthConfirm ? dashAuthConfirm.value.trim() : '';
      if (password !== confirmPassword) {
        dashAuthMessage.style.color = 'var(--danger-color)';
        dashAuthMessage.textContent = 'Passwords do not match.';
        return;
      }
    }
    
    dashAuthMessage.style.color = 'var(--accent-color)';
    dashAuthMessage.textContent = 'Authenticating operator credentials...';
    
    try {
      if (authMode === 'register') {
        await createUserWithEmailAndPassword(auth, email, password);
        dashAuthMessage.style.color = 'var(--success-color)';
        dashAuthMessage.textContent = 'Account created. Initializing key...';
      } else {
        await signInWithEmailAndPassword(auth, email, password);
        dashAuthMessage.style.color = 'var(--success-color)';
        dashAuthMessage.textContent = 'Session verified. Welcome.';
      }
    } catch(err) {
      dashAuthMessage.style.color = 'var(--danger-color)';
      dashAuthMessage.textContent = `ACCESS DENIED: ${err.message}`;
    }
  });
}

// --- Emergency SOS Alert Modal Logic ---
const sosAlertModal = document.getElementById('sos-alert-modal');
const btnCloseSosAlert = document.getElementById('btn-close-sos-alert');
const btnSosAck = document.getElementById('btn-sos-ack');
const btnSosZoom = document.getElementById('btn-sos-zoom');

let activeSosRecord = null;

function triggerSosAlert(record) {
  activeSosRecord = record;
  
  const unitNameEl = document.getElementById('sos-unit-name');
  const unitTypeEl = document.getElementById('sos-unit-type');
  const partySizeEl = document.getElementById('sos-party-size');
  const coordsEl = document.getElementById('sos-coords');
  const timeEl = document.getElementById('sos-time');
  
  if (unitNameEl) unitNameEl.textContent = record.name || 'UNKNOWN UNIT';
  if (unitTypeEl) unitTypeEl.textContent = record.party_type || 'PARTY';
  if (partySizeEl) partySizeEl.textContent = `${record.party_size || 1} PERSON(S)`;
  
  if (coordsEl) {
    const accuracyStr = record.accuracy ? ` (+/- ${record.accuracy.toFixed(1)}m)` : '';
    coordsEl.textContent = `LAT: ${record.latitude.toFixed(5)}, LON: ${record.longitude.toFixed(5)}${accuracyStr}`;
  }
  
  if (timeEl) {
    const now = new Date();
    const zuluTimeStr = now.toISOString().split('T')[1].substring(0, 8) + 'Z';
    const localTimeStr = now.toTimeString().split(' ')[0] + ' LOC';
    timeEl.textContent = `${zuluTimeStr} Zulu | ${localTimeStr} Local`;
  }
  
  if (sosAlertModal) {
    sosAlertModal.style.display = 'flex';
  }
}

if (btnCloseSosAlert && sosAlertModal) {
  btnCloseSosAlert.addEventListener('click', () => {
    sosAlertModal.style.display = 'none';
  });
}

if (btnSosAck && sosAlertModal) {
  btnSosAck.addEventListener('click', () => {
    sosAlertModal.style.display = 'none';
    logToFeed(`SYS: SOS ACKNOWLEDGED FOR [${activeSosRecord ? activeSosRecord.name : 'UNIT'}]`);
  });
}

if (btnSosZoom && sosAlertModal) {
  btnSosZoom.addEventListener('click', () => {
    sosAlertModal.style.display = 'none';
    if (activeSosRecord && primaryMap) {
      const latlng = [activeSosRecord.latitude, activeSosRecord.longitude];
      primaryMap.setView(latlng, 15);
      
      const marker = cadetMarkers.get(activeSosRecord.id);
      if (marker) {
        marker.openPopup();
      }
      logToFeed(`SYS: ZOOMED TO SOS UNIT [${activeSosRecord.name}]`);
    }
  });
}

// --- Global Error / Rejection Log Hooks ---
window.addEventListener('error', (e) => {
  logToFeed(`SYS ERROR: ${e.message}`, true);
});
window.addEventListener('unhandledrejection', (e) => {
  logToFeed(`SYS REJECTION: ${e.reason}`, true);
});

// ==========================================================================
// CYBER-HUD & ADVANCED OPS: AUDIO, RADAR, OSCILLOGRAM, FLIR, HOTKEYS
// ==========================================================================

// --- 1. Audio HUD Toggle & Controls ---
const quickBtnAudio = document.getElementById('quick-btn-audio');
const audioToggle = document.getElementById('audio-toggle');

function updateAudioUI() {
  if (quickBtnAudio) {
    quickBtnAudio.textContent = audioEnabled ? '[ 🔊 SFX: ON ]' : '[ 🔇 SFX: OFF ]';
    quickBtnAudio.classList.toggle('active', audioEnabled);
  }
  if (audioToggle) {
    audioToggle.checked = audioEnabled;
  }
}

function setAudioEnabled(state) {
  audioEnabled = state;
  localStorage.setItem('cmd-audio-enabled', audioEnabled);
  updateAudioUI();
  if (audioEnabled) {
    playSfx('sonar');
    logToFeed("SYS: TACTICAL AUDIO HUD ONLINE");
  } else {
    logToFeed("SYS: TACTICAL AUDIO HUD MUTED");
  }
}

if (quickBtnAudio) {
  quickBtnAudio.addEventListener('click', () => setAudioEnabled(!audioEnabled));
}
if (audioToggle) {
  audioToggle.addEventListener('change', (e) => setAudioEnabled(e.target.checked));
}
updateAudioUI();

// Tactile audio click on any button
document.addEventListener('click', (e) => {
  if (e.target.closest('button, .settings-btn, .help-btn, .marker-option, .toggle-switch, .quick-hud-btn')) {
    playSfx('click');
  }
});

// --- 2. Rotating Radar Sweep & Sonar Pulses ---
const radarOverlay = document.getElementById('radar-sweep-overlay');
const quickBtnRadar = document.getElementById('quick-btn-radar');
const sweepToggle = document.getElementById('sweep-toggle');
let radarSweepEnabled = localStorage.getItem('cmd-radar-sweep') === 'true';

function updateRadarUI() {
  if (radarOverlay) {
    radarOverlay.style.display = radarSweepEnabled ? 'block' : 'none';
  }
  if (quickBtnRadar) {
    quickBtnRadar.classList.toggle('active', radarSweepEnabled);
  }
  if (sweepToggle) {
    sweepToggle.checked = radarSweepEnabled;
  }
}

function setRadarSweep(state) {
  radarSweepEnabled = state;
  localStorage.setItem('cmd-radar-sweep', radarSweepEnabled);
  updateRadarUI();
  if (radarSweepEnabled) {
    playSfx('sonar');
    logToFeed("SYS: RADAR SCAN SWEEP ACTIVATED");
  } else {
    logToFeed("SYS: RADAR SCAN SWEEP DEACTIVATED");
  }
}

if (quickBtnRadar) {
  quickBtnRadar.addEventListener('click', () => setRadarSweep(!radarSweepEnabled));
}
if (sweepToggle) {
  sweepToggle.addEventListener('change', (e) => setRadarSweep(e.target.checked));
}
updateRadarUI();

// --- 3. FLIR Thermal, Night Vision & Visual Modes ---
const quickBtnFlir = document.getElementById('quick-btn-flir');
const flirToggle = document.getElementById('flir-toggle');
const visualThemesCycle = ['dark', 'night-vision', 'flir-thermal', 'cyberpunk', 'sea', 'satellite'];

function updateFlirUI(theme) {
  const isFlir = theme === 'flir-thermal';
  if (flirToggle) flirToggle.checked = isFlir;
  if (quickBtnFlir) {
    quickBtnFlir.classList.toggle('active', isFlir);
    quickBtnFlir.textContent = isFlir ? '[ 👁 FLIR: ON ]' : '[ 👁 FLIR ]';
  }
}

if (quickBtnFlir) {
  quickBtnFlir.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const nextIdx = (visualThemesCycle.indexOf(current) + 1) % visualThemesCycle.length;
    const nextTheme = visualThemesCycle[nextIdx];
    applyTheme(nextTheme);
    if (themeSelect) themeSelect.value = nextTheme;
    localStorage.setItem('cmd-theme', nextTheme);
    updateFlirUI(nextTheme);
    logToFeed(`SYS: VISUAL MODE SWITCHED TO [${nextTheme.toUpperCase()}]`);
  });
}

if (flirToggle) {
  flirToggle.addEventListener('change', (e) => {
    const targetTheme = e.target.checked ? 'flir-thermal' : 'dark';
    applyTheme(targetTheme);
    if (themeSelect) themeSelect.value = targetTheme;
    localStorage.setItem('cmd-theme', targetTheme);
    updateFlirUI(targetTheme);
    logToFeed(`SYS: FLIR THERMAL [${e.target.checked ? 'ENGAGED' : 'DISENGAGED'}]`);
  });
}

// Sync FLIR UI with current theme on init
updateFlirUI(document.documentElement.getAttribute('data-theme') || 'dark');

// --- 4. Live Telemetry Oscillogram & Wave Sparkline ---
const telemetryCanvas = document.getElementById('telemetry-canvas');
const telemetryGraphToggle = document.getElementById('telemetry-graph-toggle');
const telemetryContainer = document.getElementById('telemetry-sparkline-container');
let telemetryGraphEnabled = localStorage.getItem('cmd-telemetry-graph') !== 'false';

if (telemetryGraphToggle) {
  telemetryGraphToggle.checked = telemetryGraphEnabled;
  if (telemetryContainer) telemetryContainer.style.display = telemetryGraphEnabled ? 'block' : 'none';
  telemetryGraphToggle.addEventListener('change', (e) => {
    telemetryGraphEnabled = e.target.checked;
    localStorage.setItem('cmd-telemetry-graph', telemetryGraphEnabled);
    if (telemetryContainer) telemetryContainer.style.display = telemetryGraphEnabled ? 'block' : 'none';
    logToFeed(`SYS: TELEMETRY OSCILLOGRAM [${telemetryGraphEnabled ? 'ONLINE' : 'OFFLINE'}]`);
  });
}

if (telemetryCanvas) {
  const tCtx = telemetryCanvas.getContext('2d');
  let tPhase = 0;
  function renderOscilloscope() {
    if (telemetryGraphEnabled && telemetryCanvas.offsetParent !== null) {
      const w = telemetryCanvas.width;
      const h = telemetryCanvas.height;
      tCtx.clearRect(0, 0, w, h);

      // Grid line
      tCtx.strokeStyle = 'rgba(0, 210, 255, 0.15)';
      tCtx.lineWidth = 1;
      tCtx.beginPath();
      tCtx.moveTo(0, h / 2);
      tCtx.lineTo(w, h / 2);
      tCtx.stroke();

      // Oscilloscope phosphor wave
      tCtx.beginPath();
      tCtx.strokeStyle = 'rgba(0, 210, 255, 0.9)';
      tCtx.lineWidth = 1.5;
      tCtx.shadowBlur = 6;
      tCtx.shadowColor = '#00d2ff';

      const mid = h / 2;
      const amp = 8 + Math.sin(tPhase * 0.4) * 4;
      for (let x = 0; x < w; x++) {
        const envelope = Math.sin((x / w) * Math.PI);
        const y = mid + Math.sin((x * 0.1) + tPhase) * amp * envelope;
        if (x === 0) tCtx.moveTo(x, y);
        else tCtx.lineTo(x, y);
      }
      tCtx.stroke();
      tCtx.shadowBlur = 0;
      tPhase += 0.08;
    }
    requestAnimationFrame(renderOscilloscope);
  }
  requestAnimationFrame(renderOscilloscope);
}

// --- 5. Responder Breadcrumb Trails Settings Toggle ---
const trailsToggleCadet = document.getElementById('trails-toggle-cadet');
if (trailsToggleCadet) {
  trailsToggleCadet.checked = cadetTrailsEnabled;
  trailsToggleCadet.addEventListener('change', (e) => {
    cadetTrailsEnabled = e.target.checked;
    localStorage.setItem('cmd-cadet-trails', cadetTrailsEnabled);
    if (!cadetTrailsEnabled) {
      cadetTrailsLayer.clearLayers();
      cadetTrails.clear();
      logToFeed("SYS: RESPONDER BREADCRUMB TRAILS CLEARED");
    } else {
      cadetHistories.forEach((history, id) => {
        const marker = cadetMarkers.get(id);
        const status = marker && marker.cadetData ? marker.cadetData.status : 'active';
        renderCadetTrail(id, history, status);
      });
      logToFeed("SYS: RESPONDER BREADCRUMB TRAILS RESTORED");
    }
  });
}

// --- 6. CRT Scanlines & Vignette Toggle ---
const crtToggle = document.getElementById('crt-toggle');
const scanlinesEl = document.querySelector('.scanlines');
const vignetteEl = document.querySelector('.vignette');
let crtEnabled = localStorage.getItem('cmd-crt-fx') !== 'false';

function updateCrt(state) {
  crtEnabled = state;
  localStorage.setItem('cmd-crt-fx', crtEnabled);
  if (scanlinesEl) scanlinesEl.style.display = crtEnabled ? 'block' : 'none';
  if (vignetteEl) vignetteEl.style.display = crtEnabled ? 'block' : 'none';
  if (crtToggle) crtToggle.checked = crtEnabled;
}
if (crtToggle) {
  crtToggle.addEventListener('change', (e) => updateCrt(e.target.checked));
}
updateCrt(crtEnabled);

// --- 7. Recenter Base Button ---
const quickBtnRecenter = document.getElementById('quick-btn-recenter');
if (quickBtnRecenter) {
  quickBtnRecenter.addEventListener('click', () => {
    const profile = getStationProfile();
    primaryMap.flyTo([profile.lat, profile.lng], profile.zoom, { duration: 0.8 });
    logToFeed(`SYS: RE-CENTERED ON ${profile.name.toUpperCase()} BASE`);
  });
}

// --- 8. Hotkeys Modal & Global Keyboard Listeners ---
const hotkeysModal = document.getElementById('hotkeys-modal');
const quickBtnHotkeys = document.getElementById('quick-btn-hotkeys');
const btnOpenHotkeys = document.getElementById('btn-open-hotkeys');
const btnCloseHotkeys = document.getElementById('btn-close-hotkeys');

function toggleHotkeysModal() {
  if (!hotkeysModal) return;
  const isHidden = hotkeysModal.style.display === 'none';
  hotkeysModal.style.display = isHidden ? 'flex' : 'none';
}

if (quickBtnHotkeys) quickBtnHotkeys.addEventListener('click', toggleHotkeysModal);
if (btnOpenHotkeys) btnOpenHotkeys.addEventListener('click', toggleHotkeysModal);
if (btnCloseHotkeys) btnCloseHotkeys.addEventListener('click', toggleHotkeysModal);
if (hotkeysModal) {
  hotkeysModal.addEventListener('click', (e) => {
    if (e.target === hotkeysModal) toggleHotkeysModal();
  });
}

window.addEventListener('keydown', (e) => {
  if (e.target && e.target.matches('input, textarea, select')) return;

  if (e.code === 'Space') {
    e.preventDefault();
    if (quickBtnRecenter) quickBtnRecenter.click();
  } else if (e.code === 'KeyW') {
    toggleWindWidget();
  } else if (e.code === 'KeyX') {
    if (typeof toggleRangefinder === 'function') toggleRangefinder();
  } else if (e.code === 'Escape') {
    if (typeof cancelRangefinder === 'function' && rangefinderActive) cancelRangefinder();
  } else if (e.code === 'KeyT') {
    const editToggle = document.getElementById('edit-toggle');
    if (editToggle) {
      editToggle.checked = !editToggle.checked;
      editToggle.dispatchEvent(new Event('change'));
    }
  } else if (e.code === 'KeyN') {
    if (quickBtnFlir) quickBtnFlir.click();
  } else if (e.code === 'KeyR') {
    if (quickBtnRadar) quickBtnRadar.click();
  } else if (e.code === 'KeyM') {
    if (quickBtnAudio) quickBtnAudio.click();
  } else if (e.code === 'KeyS') {
    if (activeSosRecord && primaryMap) {
      primaryMap.flyTo([activeSosRecord.latitude, activeSosRecord.longitude], 16, { duration: 0.8 });
      logToFeed(`SYS: EMERGENCY FOCUS ON SOS [${activeSosRecord.name}]`);
    } else {
      logToFeed("SYS: NO ACTIVE SOS DISTRESS SIGNALS REPORTED");
    }
  } else if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
    toggleHotkeysModal();
  }
});

// --- 9. Movable Wind Speed & Direction HUD Instrument ---
const windHudWidget = document.getElementById('wind-hud-widget');
const windDragHandle = document.getElementById('wind-widget-drag-handle');
const btnWindReset = document.getElementById('btn-wind-reset');
const btnWindCollapse = document.getElementById('btn-wind-collapse');
const quickBtnWind = document.getElementById('quick-btn-wind');
const windVectorToggle = document.getElementById('wind-vector-toggle');
const windArrowWrapper = document.getElementById('wind-arrow-wrapper');
const windValKmh = document.getElementById('wind-val-kmh');
const windValMph = document.getElementById('wind-val-mph');
const windValKts = document.getElementById('wind-val-kts');
const windBearingReadout = document.getElementById('wind-bearing-readout');
const windConditionTag = document.getElementById('wind-condition-tag');

let lastWindKmh = 14.0;
let lastWindDeg = 240;

const CARDINALS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

function degToCardinal(deg) {
  const norm = ((deg % 360) + 360) % 360;
  const idx = Math.round(norm / 22.5) % 16;
  return CARDINALS[idx];
}

function getBeaufortScale(kmh) {
  if (kmh < 1) return { level: 0, desc: 'CALM', color: '#00d2ff' };
  if (kmh <= 5) return { level: 1, desc: 'LIGHT AIR', color: '#00e5ff' };
  if (kmh <= 11) return { level: 2, desc: 'LIGHT BREEZE', color: '#00ffaa' };
  if (kmh <= 19) return { level: 3, desc: 'GENTLE BREEZE', color: '#44dd88' };
  if (kmh <= 28) return { level: 4, desc: 'MODERATE BREEZE', color: '#eedd22' };
  if (kmh <= 38) return { level: 5, desc: 'FRESH BREEZE', color: '#ffaa00' };
  if (kmh <= 49) return { level: 6, desc: 'STRONG BREEZE', color: '#ff7700' };
  if (kmh <= 61) return { level: 7, desc: 'HIGH WIND', color: '#ff4444' };
  if (kmh <= 74) return { level: 8, desc: 'GALE FORCE', color: '#ff1144' };
  if (kmh <= 88) return { level: 9, desc: 'STRONG GALE', color: '#dd0066' };
  if (kmh <= 102) return { level: 10, desc: 'STORM CELL', color: '#cc00ff' };
  return { level: 11, desc: 'VIOLENT STORM', color: '#ff0055' };
}

function updateWindWidget(wsKmh, wdDeg, gustsKmh, pressureHpa) {
  if (wsKmh !== undefined && wsKmh !== null && !isNaN(wsKmh)) lastWindKmh = Number(wsKmh);
  if (wdDeg !== undefined && wdDeg !== null && !isNaN(wdDeg)) lastWindDeg = Number(wdDeg);

  const kmh = lastWindKmh;
  const mph = lastWindKmh * 0.621371;
  const kts = lastWindKmh * 0.539957;

  if (windValKmh) windValKmh.textContent = kmh.toFixed(1);
  if (windValMph) windValMph.textContent = mph.toFixed(1);
  if (windValKts) windValKts.textContent = kts.toFixed(1);

  // In meteorology, wind direction is origin (where it comes FROM).
  // The aerodynamic arrow points towards where the wind is BLOWING TO.
  const fromCard = degToCardinal(lastWindDeg);
  const blowToDeg = (lastWindDeg + 180) % 360;
  const toCard = degToCardinal(blowToDeg);

  if (windBearingReadout) {
    windBearingReadout.innerHTML = `FROM <span style="color:var(--accent-cyan); font-weight:700;">${Math.round(lastWindDeg)}° ${fromCard}</span> ➔ <span style="color:#ffffff;">${toCard}</span>`;
  }

  if (windArrowWrapper) {
    windArrowWrapper.style.transform = `rotate(${blowToDeg}deg)`;
  }

  const beaufort = getBeaufortScale(kmh);
  if (windConditionTag) {
    windConditionTag.textContent = `BFT ${beaufort.level} • ${beaufort.desc}`;
    windConditionTag.style.borderColor = beaufort.color;
    windConditionTag.style.color = beaufort.color;
  }

  const windValGusts = document.getElementById('wind-val-gusts');
  if (windValGusts) {
    const gustVal = (gustsKmh !== undefined && gustsKmh !== null && !isNaN(gustsKmh)) 
      ? Number(gustsKmh).toFixed(1) 
      : (kmh * 1.35).toFixed(1);
    const pressVal = pressureHpa ? ` | ${Math.round(pressureHpa)} hPa` : '';
    windValGusts.textContent = `GUSTS: ${gustVal} KM/H${pressVal}`;
  }
}

function setWindWidgetVisibility(visible, log = true) {
  // Always visible permanent banner across bottom of screen
  if (windHudWidget) {
    windHudWidget.style.display = 'flex';
  }
  if (quickBtnWind) {
    quickBtnWind.classList.add('active');
  }
  if (windVectorToggle) {
    windVectorToggle.checked = true;
  }
}

function toggleWindWidget() {
  // Highlight / pulse the permanent bottom banner to direct operator focus
  if (windHudWidget) {
    windHudWidget.classList.remove('telemetry-highlight');
    void windHudWidget.offsetWidth; // trigger CSS reflow
    windHudWidget.classList.add('telemetry-highlight');
    setTimeout(() => {
      if (windHudWidget) windHudWidget.classList.remove('telemetry-highlight');
    }, 1800);
  }
  playSfx('sonar');
  logToFeed(`SYS: WIND TELEMETRY ACTIVE // BEARING ${Math.round(lastWindDeg)}° @ ${lastWindKmh.toFixed(1)} KM/H`);
}

function initMovableWindWidget() {
  if (!windHudWidget) return;

  // Clear any legacy dragging positions from older versions
  localStorage.removeItem('cmd-wind-pos');
  localStorage.removeItem('cmd-wind-collapsed');

  windHudWidget.style.display = 'flex';
  if (quickBtnWind) quickBtnWind.classList.add('active');
  if (windVectorToggle) windVectorToggle.checked = true;

  // Render initial readout
  updateWindWidget(lastWindKmh, lastWindDeg);
}

if (quickBtnWind) {
  quickBtnWind.addEventListener('click', toggleWindWidget);
}
if (windVectorToggle) {
  windVectorToggle.addEventListener('change', toggleWindWidget);
}

// Initialize Wind Widget on page load
initMovableWindWidget();

// --- 10. Advanced GPS Telemetry, Rangefinder & Mission Export Tools ---

// 1. Comms Silence & Last Known Position (LKP) Watchdog
function checkCommsSilence() {
  const now = Date.now();
  let updatedAny = false;
  cadetMarkers.forEach((marker, id) => {
    const lastSeen = cadetLastSeen.get(id) || now;
    const elapsedSec = Math.round((now - lastSeen) / 1000);
    const wasLkp = cadetLkpState.get(id) || false;
    const name = marker.cadetData ? (marker.cadetData.name || id) : id;

    if (elapsedSec > 25) {
      if (!wasLkp) {
        cadetLkpState.set(id, true);
        marker.setIcon(getCadetIcon(marker.cadetData, true));
        marker.getPopup().setContent(formatCadetPopup(id, marker.cadetData, true, elapsedSec));
        logToFeed(`⚠️ WARN: COMMS SILENCE ON [${name}] (${elapsedSec}s) - MARKING LKP`, true);
        playSfx('click');
        updatedAny = true;
      }
    } else {
      if (wasLkp) {
        cadetLkpState.set(id, false);
        marker.setIcon(getCadetIcon(marker.cadetData, false));
        marker.getPopup().setContent(formatCadetPopup(id, marker.cadetData, false, 0));
        logToFeed(`SYS: COMMS RESTORED WITH [${name}]`);
        updatedAny = true;
      }
    }
  });
  if (updatedAny) updateCadetsHudList();
}
setInterval(checkCommsSilence, 4000);

// 2. Tactical Range & Bearing Intercept Vector Tool
let rangefinderActive = false;
let rangefinderOrigin = null; // { lat, lng, name, speed }
let rangefinderLine = null;
let rangefinderTooltip = null;

const rangefinderBanner = document.getElementById('rangefinder-hud-banner');
const rangefinderStatusText = document.getElementById('rangefinder-status-text');
const btnCancelRangefinder = document.getElementById('btn-cancel-rangefinder');
const quickBtnRangefinder = document.getElementById('quick-btn-rangefinder');
const quickBtnExport = document.getElementById('quick-btn-export');
const btnExportMission = document.getElementById('btn-export-mission');

function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function calculateBearingDeg(lat1, lon1, lat2, lon2) {
  const y = Math.sin((lon2 - lon1) * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180);
  const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
            Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos((lon2 - lon1) * Math.PI / 180);
  const brng = Math.atan2(y, x) * 180 / Math.PI;
  return (brng + 360) % 360;
}

function startRangefinder(origin = null) {
  rangefinderActive = true;
  rangefinderOrigin = origin;
  if (rangefinderBanner) rangefinderBanner.style.display = 'flex';
  if (quickBtnRangefinder) quickBtnRangefinder.classList.add('active');
  if (rangefinderStatusText) {
    rangefinderStatusText.textContent = origin
      ? `ORIGIN: [${origin.name}] ➔ CLICK TARGET POINT / CADET`
      : `RANGEFINDER: CLICK 1ST OBJECT (ORIGIN) ➔ 2ND OBJECT (TARGET)`;
  }
  primaryMap.getContainer().style.cursor = 'crosshair';
  logToFeed("SYS: TACTICAL RANGEFINDER / INTERCEPT MODE ACTIVE");
}

function cancelRangefinder() {
  rangefinderActive = false;
  rangefinderOrigin = null;
  if (rangefinderBanner) rangefinderBanner.style.display = 'none';
  if (quickBtnRangefinder) quickBtnRangefinder.classList.remove('active');
  if (rangefinderLine) {
    primaryMap.removeLayer(rangefinderLine);
    rangefinderLine = null;
  }
  if (rangefinderTooltip) {
    primaryMap.removeLayer(rangefinderTooltip);
    rangefinderTooltip = null;
  }
  primaryMap.getContainer().style.cursor = '';
  logToFeed("SYS: RANGEFINDER DISENGAGED");
}

function toggleRangefinder() {
  if (rangefinderActive) cancelRangefinder();
  else startRangefinder();
}

window.startRangefinderFromUnit = function(cadetId) {
  const marker = cadetMarkers.get(cadetId);
  if (!marker || !marker.cadetData) return;
  const data = marker.cadetData;
  startRangefinder({
    lat: data.latitude,
    lng: data.longitude,
    name: data.name || 'UNIT',
    speed: data.speed || 0
  });
  if (marker.isPopupOpen()) marker.closePopup();
};

if (quickBtnRangefinder) {
  quickBtnRangefinder.addEventListener('click', toggleRangefinder);
}
if (btnCancelRangefinder) {
  btnCancelRangefinder.addEventListener('click', cancelRangefinder);
}

// Map interaction for Rangefinder Vector
primaryMap.on('mousemove', (e) => {
  if (!rangefinderActive || !rangefinderOrigin) return;

  const originLat = rangefinderOrigin.lat;
  const originLng = rangefinderOrigin.lng;
  const targetLat = e.latlng.lat;
  const targetLng = e.latlng.lng;

  const distKm = calculateDistanceKm(originLat, originLng, targetLat, targetLng);
  const bearing = calculateBearingDeg(originLat, originLng, targetLat, targetLng);
  const cardinal = degToCardinal(bearing);

  // Speed: use origin unit's speed if > 0.5 km/h, otherwise standard SAR foot-search pace (4.8 km/h)
  const spdKmh = (rangefinderOrigin.speed && rangefinderOrigin.speed > 0.15) ? (rangefinderOrigin.speed * 3.6) : 4.8;
  const travelHours = distKm / spdKmh;
  const travelMinutes = Math.round(travelHours * 60);
  const etaStr = travelMinutes < 60 ? `${travelMinutes}m` : `${Math.floor(travelMinutes/60)}h ${travelMinutes%60}m`;
  const distStr = distKm < 1 ? `${Math.round(distKm * 1000)}m` : `${distKm.toFixed(2)}km (${(distKm * 0.539957).toFixed(2)}NM)`;

  const lineCoords = [[originLat, originLng], [targetLat, targetLng]];
  if (rangefinderLine) {
    rangefinderLine.setLatLngs(lineCoords);
  } else {
    rangefinderLine = L.polyline(lineCoords, {
      color: '#00d2ff',
      weight: 2,
      dashArray: '6, 6',
      opacity: 0.95
    }).addTo(primaryMap);
  }

  const tooltipHtml = `
    <div style="font-family: var(--hud-font); font-size: 11px; line-height: 1.3;">
      <span style="color: var(--accent-cyan); font-weight: bold;">VECTOR:</span> ${distStr}<br/>
      <span style="color: #fff;">BEARING:</span> ${Math.round(bearing)}° ${cardinal}<br/>
      <span style="color: var(--tactical-green); font-weight: bold;">EST. TIME:</span> ~${etaStr} @ ${spdKmh.toFixed(1)}km/h
    </div>
  `;

  if (rangefinderTooltip) {
    rangefinderTooltip.setLatLng(e.latlng).setContent(tooltipHtml);
  } else {
    rangefinderTooltip = L.popup({
      closeButton: false,
      autoPan: false,
      className: 'rangefinder-popup'
    }).setLatLng(e.latlng).setContent(tooltipHtml).openOn(primaryMap);
  }
});

primaryMap.on('click', (e) => {
  if (!rangefinderActive) return;

  if (!rangefinderOrigin) {
    // Check if clicked near an existing cadet
    let selectedCadet = null;
    cadetMarkers.forEach((marker, id) => {
      const dist = primaryMap.distance(e.latlng, marker.getLatLng());
      if (dist < 40) selectedCadet = marker.cadetData;
    });

    rangefinderOrigin = {
      lat: selectedCadet ? selectedCadet.latitude : e.latlng.lat,
      lng: selectedCadet ? selectedCadet.longitude : e.latlng.lng,
      name: selectedCadet ? (selectedCadet.name || 'CADET') : `PT [${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)}]`,
      speed: selectedCadet ? (selectedCadet.speed || 0) : 0
    };

    if (rangefinderStatusText) {
      rangefinderStatusText.textContent = `ORIGIN: [${rangefinderOrigin.name}] ➔ CLICK TARGET TO LOCK VECTOR`;
    }
    logToFeed(`SYS: RANGEFINDER ORIGIN LOCKED ON [${rangefinderOrigin.name}]`);
    playSfx('click');
  } else {
    // Lock vector
    const distKm = calculateDistanceKm(rangefinderOrigin.lat, rangefinderOrigin.lng, e.latlng.lat, e.latlng.lng);
    const bearing = calculateBearingDeg(rangefinderOrigin.lat, rangefinderOrigin.lng, e.latlng.lat, e.latlng.lng);
    const cardinal = degToCardinal(bearing);
    const distStr = distKm < 1 ? `${Math.round(distKm * 1000)}m` : `${distKm.toFixed(2)}km`;

    logToFeed(`🎯 VECTOR: [${rangefinderOrigin.name}] ➔ [TARGET]: ${distStr} @ ${Math.round(bearing)}° ${cardinal}`, true);
    playSfx('radar');

    // Keep vector visible, clear prompt
    if (rangefinderStatusText) {
      rangefinderStatusText.textContent = `LOCKED: ${distStr} @ ${Math.round(bearing)}° ${cardinal} (PRESS ESC TO CLEAR)`;
    }
  }
});

// 3. Mission Data GeoJSON / GPX Export
function exportMissionData() {
  const profile = getStationProfile();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const exportDoc = {
    type: "FeatureCollection",
    mission: `${profile.name} Tactical Command Mission`,
    exported_at: new Date().toISOString(),
    features: []
  };

  // 1. Export active field cadets
  cadetMarkers.forEach((marker, id) => {
    const data = marker.cadetData;
    const history = cadetHistories.get(id) || [];
    exportDoc.features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [data.longitude, data.latitude] },
      properties: {
        category: "cadet_current",
        id: id,
        callsign: data.name,
        party_type: data.party_type,
        party_size: data.party_size,
        status: data.status,
        op_status: data.op_status || 'PATROL',
        speed_kmh: data.speed ? (data.speed * 3.6).toFixed(1) : 0,
        heading_deg: data.heading,
        altitude_m: data.altitude,
        battery_pct: data.battery,
        accuracy_m: data.accuracy,
        last_updated: data.updated_at
      }
    });

    if (history.length > 1) {
      exportDoc.features.push({
        type: "Feature",
        geometry: { type: "LineString", coordinates: history.map(pt => [pt[1], pt[0]]) },
        properties: {
          category: "cadet_track",
          id: id,
          callsign: data.name,
          points_count: history.length
        }
      });
    }
  });

  // 2. Export custom tactical markers & buoys
  try {
    const customBuoys = JSON.parse(localStorage.getItem('custom_buoys') || '[]');
    customBuoys.forEach(b => {
      exportDoc.features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [b.lng, b.lat] },
        properties: {
          category: "tactical_marker",
          id: b.id,
          name: b.name,
          markerType: b.markerType,
          markerColor: b.markerColor
        }
      });
    });
  } catch(e) {}

  const jsonString = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportDoc, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute("href", jsonString);
  downloadAnchor.setAttribute("download", `deer-lake-mission-${timestamp}.geojson`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();

  logToFeed(`SYS: MISSION DATA EXPORT COMPLETE (${exportDoc.features.length} FEATURES SAVED)`);
  playSfx('click');
}

if (quickBtnExport) quickBtnExport.addEventListener('click', exportMissionData);
if (btnExportMission) btnExportMission.addEventListener('click', exportMissionData);


