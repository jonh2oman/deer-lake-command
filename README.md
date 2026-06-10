# Deer Lake Tactical Command Center & Cadet Uplink GIS

Version: **1.1.0**

A feature-rich, high-performance, real-time collaboration GIS system designed for command center dispatchers and field responders. The system consists of a central multi-map dispatcher dashboard and a mobile-optimized responder transmitter app.

---

## Key Features

### 1. Central Dispatcher Dashboard (`index.html`)
* **Multi-Theme Base Maps:** Select from dark, light, street, satellite, high-resolution satellite, topographic, and full-screen Night Vision (monochrome phosphor green) modes.
* **Transparent Tactical Overlays:** Toggle-able layers including:
  * **OpenSeaMap:** Marine navigation markers, buoys, and sea-marks.
  * **Hiking Trails:** Official OSM hiking routes.
  * **MTB & Off-Road Trails:** Forest tracks, dirt paths, and multi-use railway beds.
  * **Topography overlay:** Elevation contour lines.
  * **Roads & Labels:** Dynamic labels overlay (essential for satellite views).
  * **Weather Radar:** Real-time precipitation Doppler radar (via RainViewer API).
  * **Coordinate Grid:** Dynamic latitude/longitude grid lines that dynamically scale grid spacing on zoom and center labels to prevent screen clutter.
  * **Targeting Reticle:** Viewport-centered crosshair HUD.
* **Holographic Minimaps Sidebar:** Four secondary maps that track specific areas (Buoys, Emergency Services, Pasadena Forestry, Doppler Radar).
  * **Expandable Layout:** Expand the sidebar from 350px to 750px to view minimaps in a 2x2 grid.
  * **Panel Rollup/Minimize:** Collapse or expand sections.
  * **Minimap Maximization:** Focus a single minimap to span both columns for detailed investigation.
  * **Full-Screen Hologram:** Pop a minimap out to a full-screen overlay.
  * **Click-to-Sync:** Click any minimap to instantly center the primary view on its coordinates.
* **Consolidated Time HUD:** Centered header box displaying synchronized Zulu and Local clocks.
* **Fixed Coordinates Panel:** Static instrumentation panel tracking the map center's exact coordinates.

### 2. Cadet Sensor Uplink (`transmit.html`)
* **Supabase Authentication:** Secure sign-up and sign-in tabs for responder credential verification.
* **Custom Tactical Icon Picker:** Grid of 10 inline SVG tactical icons:
  * *Radar Blip, Power Boat, Zodiac, Sailboat, Large Ship, Truck, Hiker, Anchor, Medical, Warning.*
* **Custom Tactical Color Picker:** Pick high-visibility colors:
  * *Green, Blue, Orange, Purple, Yellow, White, Red.*
* **Dual Telemetry Modes:**
  * **REAL GPS:** Streams real physical device coordinates (requires secure HTTPS connection).
  * **SIMULATOR:** Displays an interactive dark-themed mini-map. Click or drag the marker to simulate your location—highly useful for testing on desktops or connections without GPS locks.
* **Emergency SOS Trigger:** Triggers blinking red alarms, glowing map indicators, and sound alerts in the dispatcher's dashboard.
* **Live System Logs:** Shows real-time transmission success/failure logs, along with a global error boundary catcher that prints JavaScript exceptions directly into the activity log in red for easy debugging.

---

## Technical Architecture

* **Frontend Build Tool:** Vite (V8)
* **GIS Engine:** Leaflet JS
* **Real-time Backend:** Supabase (PostgreSQL with Realtime Replication)
* **Design Language:** Custom neon/futuristic dark CSS theme (responsive grid layout, glassmorphism panel backdrops).

---

## Setup & Local Installation

### Prerequisites
* Node.js (v18+)
* Supabase Account & Project

### 1. Database Setup
1. Open your **Supabase Dashboard**.
2. Navigate to the **SQL Editor** tab.
3. Paste and run the contents of [supabase_setup.sql](./supabase_setup.sql) to create the `cadet_locations` table, configure row-level security (RLS) policies, and register the table in the real-time publication.
4. Go to **Settings -> Auth** and ensure the **"Confirm email"** toggle is turned off (for immediate development/testing) or configure SMTP.

### 2. Local Environment Configuration
Create a `.env` file in the root directory and add your Supabase credentials:
```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anonymous-key-here
```

### 3. Install Dependencies & Start Server
```bash
# Install packages
npm install

# Start development server
npm run dev

# Compile production bundle
npm run build
```
The application will run locally at [http://localhost:5173/](http://localhost:5173/).
* View Central Map: `http://localhost:5173/`
* View Mobile Transmitter: `http://localhost:5173/transmit.html`
