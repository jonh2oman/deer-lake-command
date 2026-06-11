import 'leaflet/dist/leaflet.css'
import './style.css'
import L from 'leaflet'
import { createClient } from '@supabase/supabase-js'

// --- Supabase Setup ---
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

// --- Custom Transparent Map Overlays ---
const OpenSeaMapUrl = 'https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png';
const WaymarkedTrailsUrl = 'https://tile.waymarkedtrails.org/hiking/{z}/{x}/{y}.png';
const OpenTopoMapUrl = 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png';
const CartoDbLabelsUrl = 'https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png';

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
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
  sea: 'https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}',
  satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  'google-satellite': 'http://mt0.google.com/vt/lyrs=s&hl=en&x={x}&y={y}&z={z}',
  street: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  topo: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
  'night-vision': 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
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

const defaultCenter = [49.0342, -57.5955]; 
const defaultZoom = 13;

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

// Forestry Map is independent and focused on Pasadena Forestry Center
const secondaryMap4 = L.map('secondary-map-4', {
  zoomControl: true,
  zoomAnimation: false
}).setView([49.0149167, -57.5865278], 15); // Centered on Pasadena Forestry Center

// Feature: Click any minimap to sync the primary map to its exact view
[secondaryMap1, secondaryMap2, secondaryMap3, secondaryMap4].forEach(miniMap => {
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
    labelsLayer.setUrl(`https://{s}.basemaps.cartocdn.com/${labelType}/{z}/{x}/{y}{r}.png`);
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

const emergencyIcon = L.divIcon({
  className: 'radar-blip blip-cyan',
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
      logToFeed(`[TRACE] Supabase err: ${error.message}`);
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
    logToFeed(`[TRACE] Supabase throw: ${err.message}`);
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
              logToFeed(`[TRACE] Supabase delete err: ${error.message}`);
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

// --- Supabase Realtime Subscription ---
// --- Local Custom Buoys logic replaces Supabase Realtime ---
// No realtime channel needed for local storage

// Emergency Services
function emergencyPopup(feature, layer) {
  const id = feature.properties['id'] || 'N/A';
  const name = feature.properties['EMS Loc'] || 'Emergency Service';
  layer.bindPopup(`<strong>EMERGENCY UNIT</strong><br/>ID: ${id}<br/>LOC: ${name}`);
}

function renderEmergencyServices() {
  if (typeof window.json_emergency_3 !== 'undefined') {
    try {
      const layer1 = L.geoJSON(window.json_emergency_3, {
        pointToLayer: (feature, latlng) => L.marker(latlng, { icon: emergencyIcon }),
        onEachFeature: emergencyPopup
      }).addTo(primaryMap);

      const layer2 = L.geoJSON(window.json_emergency_3, {
        pointToLayer: (feature, latlng) => L.marker(latlng, { icon: emergencyIcon })
      }).addTo(secondaryMap2);
      
      const count = layer1.getLayers().length;
      logToFeed(`[DIAG] EMS RENDERED: ${count} markers.`);
    } catch(err) {
      logToFeed(`[DIAG] EMS ERROR: ${err.message}`, true);
    }
  } else {
    logToFeed(`[DIAG] EMS DATA MISSING`);
  }
}

// Data Initialization Poller
let retryCount = 0;
function waitForDataAndRender() {
  if (typeof window.json_Buoys_2 !== 'undefined' && typeof window.json_emergency_3 !== 'undefined') {
    logToFeed(`[DIAG] QGIS Data Loaded in ${retryCount * 100}ms`);
    renderBuoys().then(() => {
      const bCount = buoysLayerPrimary.getLayers().length;
      logToFeed(`[DIAG] BUOYS RENDERED: ${bCount} markers.`);
    }).catch(e => logToFeed(`[DIAG] BUOY ERR: ${e.message}`));
    renderEmergencyServices();
  } else if (retryCount < 20) {
    retryCount++;
    setTimeout(waitForDataAndRender, 100);
  } else {
    logToFeed("SYS ERROR: QGIS DATA FILES MISSING", true);
    renderBuoys();
  }
}

// Start data polling
waitForDataAndRender();

setTimeout(() => {
  primaryMap.invalidateSize();
  secondaryMap1.invalidateSize();
  secondaryMap2.invalidateSize();
  secondaryMap3.invalidateSize();
  secondaryMap4.invalidateSize();
}, 500);

// --- Welcome Modal Logic ---
const welcomeModal = document.getElementById('welcome-modal');
if (!sessionStorage.getItem('welcome_dismissed')) {
  welcomeModal.style.display = 'flex';
}

document.getElementById('btn-welcome-enter').addEventListener('click', () => {
  welcomeModal.style.display = 'none';
  sessionStorage.setItem('welcome_dismissed', 'true');
  logToFeed("SYS: COMMAND TERMINAL ONLINE", true);
});

// --- Settings Configuration Terminal Logic ---
const settingsModal = document.getElementById('settings-modal');
const settingsBtn = document.getElementById('settings-btn');
const btnCloseSettings = document.getElementById('btn-close-settings');

if (settingsBtn && settingsModal) {
  settingsBtn.addEventListener('click', () => {
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

// --- Cadet Real-time Tracking & Audio SFX ---
function playSfx(type) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (type === 'sos') {
      const now = ctx.currentTime;
      // High pitch double beep
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(880, now);
      gain1.gain.setValueAtTime(0.15, now);
      gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.3);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(880, now + 0.3);
      gain2.gain.setValueAtTime(0.15, now + 0.3);
      gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.55);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.3);
      osc2.stop(now + 0.6);
    }
  } catch (e) {
    console.error("Audio Context failed:", e);
  }
}
function getCadetIcon(record) {
  const name = record.name || 'Unit';
  const type = record.icon_type || 'blip';
  let color = record.icon_color || 'green';
  const status = record.status || 'active';
  
  // SOS overrides color to red
  if (status === 'sos') {
    color = 'red';
  }
  
  if (type === 'blip') {
    const blipClass = (status === 'sos') ? 'cadet-blip blip-red alert' : `cadet-blip blip-${color}`;
    return L.divIcon({
      className: blipClass,
      html: `<div class="cadet-blip-label">${name}</div>`,
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
      svgPath = '<rect x="1" y="3" width="15" height="13"></rect><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle>';
    } else if (type === 'user') {
      svgPath = '<circle cx="12" cy="5" r="2"></circle><path d="M9 22l2-6M15 22l-2-6M12 10v6M9 12h6"></path>';
    } else if (type === 'anchor') {
      svgPath = '<circle cx="12" cy="5" r="3"></circle><line x1="12" y1="22" x2="12" y2="8"></line><path d="M5 12H2a10 10 0 0 0 20 0h-3"></path>';
    } else if (type === 'medical') {
      svgPath = '<path d="M11 2a2 2 0 0 0-2 2v5H4a2 2 0 0 0-2 2v2c0 1.1.9 2 2 2h5v5c0 1.1.9 2 2 2h2a2 2 0 0 0 2-2v-5h5a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2h-5V4a2 2 0 0 0-2-2h-2z"></path>';
    } else if (type === 'warning') {
      svgPath = '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line>';
    }
    
    const wrapperClass = (status === 'sos') ? 'marine-icon-wrapper sos-pulse' : 'marine-icon-wrapper';
    
    return L.divIcon({
      className: `marine-icon`,
      html: `<div class="${wrapperClass}"><svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" class="svg-${color}">${svgPath}</svg><div class="cadet-blip-label" style="top: 26px;">${name}</div></div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });
  }
}


function updateCadetsHudList() {
  const listEl = document.getElementById('cadets-list');
  if (!listEl) return;
  
  if (cadetMarkers.size === 0) {
    listEl.innerHTML = 'NO ACTIVE TRANSMITTERS';
    return;
  }
  
  let html = '<ul style="list-style: none; padding: 0; margin: 0;">';
  cadetMarkers.forEach((marker, id) => {
    const data = marker.cadetData;
    const name = data.name || id;
    const type = data.icon_type || 'blip';
    let color = data.icon_color || 'green';
    let statusClass = 'status-ok';
    if (data.status === 'sos') {
      statusClass = 'status-danger';
      color = 'red';
    }
    
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
    
    const partyInfo = `${data.party_type || 'Party'} (x${data.party_size || 1})`;
    
    html += `<li style="margin-bottom: 8px; display: flex; flex-direction: column; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 6px;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span style="display: flex; align-items: center;">
          ${iconHtml}
          <strong>${name}</strong>
        </span>
        <span class="hud-status-badge ${statusClass}" style="font-size: 9px; padding: 1px 4px; font-weight: bold;">${data.status.toUpperCase()}</span>
      </div>
      <div style="font-size: 10px; color: var(--text-secondary); margin-left: 14px; margin-top: 2px;">
        ${partyInfo}
      </div>
    </li>`;
  });
  html += '</ul>';
  listEl.innerHTML = html;
}

function handleCadetLocationUpdate(payload) {
  const { eventType, new: newRecord, old: oldRecord } = payload;
  
  if (eventType === 'DELETE') {
    const id = oldRecord.id;
    if (cadetMarkers.has(id)) {
      const marker = cadetMarkers.get(id);
      primaryMap.removeLayer(marker);
      cadetMarkers.delete(id);
      logToFeed(`SYS: RESPONDER DISCONNECTED [${oldRecord.name || 'UNIT'}]`);
    }
  } else {
    // INSERT or UPDATE
    const id = newRecord.id;
    const name = newRecord.name;
    const lat = newRecord.latitude;
    const lng = newRecord.longitude;
    const status = newRecord.status || 'active';
    
    if (lat === undefined || lng === undefined || isNaN(lat) || isNaN(lng)) return;
    
    const latlng = [lat, lng];
    
    if (cadetMarkers.has(id)) {
      const marker = cadetMarkers.get(id);
      marker.setLatLng(latlng);
      marker.setIcon(getCadetIcon(newRecord));
      
      const oldStatus = marker.cadetData.status;
      marker.cadetData = newRecord;
      
      marker.getPopup().setContent(`
        <strong>TACTICAL TRANSMITTER</strong><br/>
        CALLSIGN: <strong>${name}</strong><br/>
        UNIT TYPE: ${newRecord.party_type || 'Party'}<br/>
        PARTY SIZE: ${newRecord.party_size || 1}<br/>
        STATUS: <span class="val-${status}">${status.toUpperCase()}</span><br/>
        LAT: ${lat.toFixed(4)}<br/>
        LON: ${lng.toFixed(4)}<br/>
        ACCURACY: ${newRecord.accuracy ? newRecord.accuracy.toFixed(1) + 'm' : 'N/A'}
      `);
      
      if (status === 'sos' && oldStatus !== 'sos') {
        logToFeed(`SOS TRANSMISSION RECEIVED: ${name} IS IN DISTRESS!`, true);
        playSfx('sos');
      } else {
        logToFeed(`SYS: LOCATION UPDATE: ${name} [${lat.toFixed(4)}, ${lng.toFixed(4)}]`);
      }
    } else {
      const marker = L.marker(latlng, { icon: getCadetIcon(newRecord) }).addTo(cadetsLayer);
      marker.cadetData = newRecord;
      marker.bindPopup(`
        <strong>TACTICAL TRANSMITTER</strong><br/>
        CALLSIGN: <strong>${name}</strong><br/>
        UNIT TYPE: ${newRecord.party_type || 'Party'}<br/>
        PARTY SIZE: ${newRecord.party_size || 1}<br/>
        STATUS: <span class="val-${status}">${status.toUpperCase()}</span><br/>
        LAT: ${lat.toFixed(4)}<br/>
        LON: ${lng.toFixed(4)}<br/>
        ACCURACY: ${newRecord.accuracy ? newRecord.accuracy.toFixed(1) + 'm' : 'N/A'}
      `);
      
      cadetMarkers.set(id, marker);
      logToFeed(`SYS: RESPONDER ONLINE [${name}]`);
      if (status === 'sos') {
        logToFeed(`SOS TRANSMISSION RECEIVED: ${name} IS IN DISTRESS!`, true);
        playSfx('sos');
      }
    }
  }
  updateCadetsHudList();
}

async function loadInitialCadets() {
  if (!supabase || !currentUser) return;
  try {
    const { data, error } = await supabase
      .from('cadet_locations')
      .select('*')
      .eq('dispatcher_id', currentUser.id);
    if (error) {
      console.error("Error loading initial cadets:", error.message);
    } else if (data) {
      data.forEach(cadet => {
        handleCadetLocationUpdate({ eventType: 'INSERT', new: cadet });
      });
    }
  } catch (err) {
    console.error("Initial load throw:", err);
  }
}

function subscribeToCadets() {
  if (!supabase || !currentUser) {
    logToFeed("SYS: COLLABORATIVE DATABASE OFFLINE (NO CREDENTIALS)");
    return;
  }
  
  if (realtimeChannel) {
    supabase.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }
  
  logToFeed("SYS: ESTABLISHING COLLABORATION CHANNELS...");
  
  realtimeChannel = supabase
    .channel('public:cadet_locations')
    .on('postgres_changes', { 
      event: '*', 
      schema: 'public', 
      table: 'cadet_locations',
      filter: `dispatcher_id=eq.${currentUser.id}`
    }, (payload) => {
      handleCadetLocationUpdate(payload);
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        logToFeed("SYS: REAL-TIME COLLABORATION LINK ESTABLISHED");
        loadInitialCadets();
      } else {
        logToFeed(`SYS: REAL-TIME LINK STATUS - ${status}`);
      }
    });
}

// --- Dispatcher Authentication & Link Copying Logic ---
let currentUser = null;
let realtimeChannel = null;

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

// Check current session on load
if (supabase) {
  supabase.auth.getSession().then(({ data: { session } }) => {
    if (session && session.user) {
      handleAuthSuccess(session.user);
    } else {
      showAuthScreen();
    }
  });

  // Listen for auth events
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && session) {
      handleAuthSuccess(session.user);
    } else if (event === 'SIGNED_OUT') {
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
  if (appContainer) appContainer.style.display = 'grid';
  
  // Recalculate leaflet map dimensions
  setTimeout(invalidateAllMaps, 200);

  // Generate & Display links
  const domain = window.location.origin + window.location.pathname.replace('index.html', '');
  const transmitUrl = `${domain}transmit.html?dispatcher=${user.id}`;
  
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
  
  // Clear realtime channel
  if (realtimeChannel && supabase) {
    supabase.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }
  
  // Clear cadet markers
  cadetMarkers.forEach((marker) => {
    primaryMap.removeLayer(marker);
  });
  cadetMarkers.clear();
  
  const cadetsList = document.getElementById('cadets-list');
  if (cadetsList) cadetsList.innerHTML = 'NO ACTIVE TRANSMITTERS';
}

function invalidateAllMaps() {
  if (primaryMap) primaryMap.invalidateSize();
  if (secondaryMap1) secondaryMap1.invalidateSize();
  if (secondaryMap2) secondaryMap2.invalidateSize();
  if (secondaryMap3) secondaryMap3.invalidateSize();
  if (secondaryMap4) secondaryMap4.invalidateSize();
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
    if (supabase) {
      logToFeed("SYS: DISCONNECTING CENTRAL OPERATIONS...");
      await supabase.auth.signOut();
    }
  });
}

// Auth Submit Listener
if (btnDashAuthSubmit) {
  btnDashAuthSubmit.addEventListener('click', async () => {
    if (!supabase) return;
    
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
        const { data, error } = await supabase.auth.signUp({
          email: email,
          password: password
        });
        if (error) throw error;
        dashAuthMessage.style.color = 'var(--success-color)';
        dashAuthMessage.textContent = 'Account created. Initializing key...';
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email,
          password: password
        });
        if (error) throw error;
        dashAuthMessage.style.color = 'var(--success-color)';
        dashAuthMessage.textContent = 'Session verified. Welcome.';
      }
    } catch(err) {
      dashAuthMessage.style.color = 'var(--danger-color)';
      dashAuthMessage.textContent = `ACCESS DENIED: ${err.message}`;
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

