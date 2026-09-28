// ============================================================================
// EMERGENCY MEDICAL ROUTING & FACILITY DISPATCH MODULE
// ============================================================================

export const REGIONAL_HOSPITALS = [
  {
    id: 'hosp-1',
    type: 'hospital',
    name: 'Western Memorial Regional Hospital',
    tier: 'Regional Referral / Trauma Centre',
    lat: 48.9485,
    lng: -57.9490,
    address: '1 Brookfield Ave, Corner Brook, NL',
    phone: '(709) 637-5000',
    er_hours: '24/7 Full Emergency Department'
  },
  {
    id: 'hosp-2',
    type: 'hospital',
    name: 'Corner Brook Health Centre & Long Term Care',
    tier: 'Regional Clinic & Urgent Care',
    lat: 48.9450,
    lng: -57.9220,
    address: '40 University Dr, Corner Brook, NL',
    phone: '(709) 637-3999',
    er_hours: 'Urgent Ambulatory Care'
  },
  {
    id: 'hosp-3',
    type: 'hospital',
    name: 'Deer Lake Medical Clinic & Health Centre',
    tier: 'Community Health Centre & Primary Care',
    lat: 49.1725,
    lng: -57.4320,
    address: '4 Farm Rd, Deer Lake, NL',
    phone: '(709) 635-3541',
    er_hours: 'Day Clinic & Local Emergency Stabilization'
  },
  {
    id: 'hosp-4',
    type: 'hospital',
    name: 'Pasadena Health Centre',
    tier: 'Community Medical Clinic',
    lat: 49.0180,
    lng: -57.5950,
    address: '22 Midland Row, Pasadena, NL',
    phone: '(709) 686-2061',
    er_hours: 'Primary Care & Emergency Triage'
  },
  {
    id: 'hosp-5',
    type: 'hospital',
    name: 'Bonne Bay Health Centre',
    tier: 'Rural Emergency Health Centre',
    lat: 49.5210,
    lng: -57.8760,
    address: 'Norris Point / Bonne Bay, NL',
    phone: '(709) 458-2211',
    er_hours: '24/7 Rural Emergency Services'
  },
  {
    id: 'hosp-6',
    type: 'hospital',
    name: 'Sir Thomas Roddick Hospital',
    tier: 'Regional Hospital & Emergency Department',
    lat: 48.5520,
    lng: -58.5770,
    address: '142 Ohio Dr, Stephenville, NL',
    phone: '(709) 643-5111',
    er_hours: '24/7 Full Emergency Department'
  },
  {
    id: 'hosp-7',
    type: 'hospital',
    name: 'Central Newfoundland Regional Health Centre',
    tier: 'Regional Referral Hospital',
    lat: 48.9320,
    lng: -55.6550,
    address: '50 Union St, Grand Falls-Windsor, NL',
    phone: '(709) 292-2500',
    er_hours: '24/7 Full Emergency Department'
  },
  {
    id: 'hosp-8',
    type: 'hospital',
    name: 'Charles S. Curtis Memorial Hospital',
    tier: 'Northern Peninsula Regional Hospital',
    lat: 51.3650,
    lng: -55.6020,
    address: '178 West St, St. Anthony, NL',
    phone: '(709) 454-3333',
    er_hours: '24/7 Emergency & Inpatient Trauma Care'
  },
  {
    id: 'hosp-9',
    type: 'hospital',
    name: 'James Paton Memorial Regional Health Centre',
    tier: 'Regional Referral Hospital',
    lat: 48.9560,
    lng: -54.6180,
    address: '125 Trans-Canada Hwy, Gander, NL',
    phone: '(709) 256-2500',
    er_hours: '24/7 Full Emergency Department'
  },
  {
    id: 'hosp-10',
    type: 'hospital',
    name: 'Health Sciences Centre (Tertiary Referral Trauma)',
    tier: 'Level 1 Trauma & Tertiary Referral Hospital',
    lat: 47.5740,
    lng: -52.7440,
    address: '300 Prince Philip Dr, St. John\'s, NL',
    phone: '(709) 777-6300',
    er_hours: '24/7 Level 1 Trauma Centre'
  },
  {
    id: 'hosp-11',
    type: 'hospital',
    name: 'St. Clare\'s Mercy Hospital',
    tier: 'Adult Acute Care & Emergency Hospital',
    lat: 47.5580,
    lng: -52.7210,
    address: '154 LeMarchant Rd, St. John\'s, NL',
    phone: '(709) 777-5000',
    er_hours: '24/7 Emergency Department'
  }
];

// Great-circle Haversine Distance (Kilometres)
export function haversineDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Calculate compass bearing from origin to destination
export function calculateCompassBearing(lat1, lon1, lat2, lon2) {
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const θ = Math.atan2(y, x);
  return (θ * 180 / Math.PI + 360) % 360;
}

export function bearingToCardinal(deg) {
  const cardinals = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return cardinals[Math.round(deg / 22.5) % 16];
}

// Retrieve combined hospital list (preloaded + any customized EMS stations in localStorage)
export function getAllHospitals(customList = null) {
  const list = customList || [];
  if (list.length > 0) {
    const hospOnly = list.filter(s => s.type === 'hospital');
    if (hospOnly.length > 0) return hospOnly;
  }
  
  try {
    const saved = localStorage.getItem('cmd-ems-custom-stations');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        const customHospitals = parsed.filter(s => s.type === 'hospital');
        if (customHospitals.length > 0) return customHospitals;
      }
    }
  } catch (err) {
    // Ignore localStorage parse errors
  }
  return REGIONAL_HOSPITALS;
}

// Find closest hospital to given coordinates
export function findClosestHospital(lat, lng, hospitalList = null) {
  const hospitals = getAllHospitals(hospitalList);
  if (!hospitals || hospitals.length === 0) return null;

  let closest = null;
  let minDistance = Infinity;

  hospitals.forEach(h => {
    const dist = haversineDistanceKm(lat, lng, h.lat, h.lng);
    if (dist < minDistance) {
      minDistance = dist;
      closest = { ...h, directDistanceKm: dist };
    }
  });

  if (closest) {
    closest.directBearing = calculateCompassBearing(lat, lng, closest.lat, closest.lng);
    closest.directCardinal = bearingToCardinal(closest.directBearing);
  }

  return closest;
}

// Format OSRM maneuver into concise, human-readable turn-by-turn instruction
export function formatManeuverInstruction(step, index, totalSteps) {
  const m = step.maneuver || {};
  const name = step.name ? step.name.trim() : '';
  const roadLabel = name ? `onto ${name}` : 'on road';
  const type = m.type || '';
  const modifier = m.modifier ? m.modifier.replace(/_/g, ' ') : '';

  if (index === totalSteps - 1 || type === 'arrive') {
    return 'Arrive at medical destination';
  }

  if (type === 'depart') {
    return name ? `Depart heading onto ${name}` : 'Depart towards route';
  }

  if (type === 'turn') {
    if (modifier.includes('right')) return `Turn right ${roadLabel}`;
    if (modifier.includes('left')) return `Turn left ${roadLabel}`;
    if (modifier.includes('straight')) return `Continue straight ${roadLabel}`;
    return `Turn ${modifier} ${roadLabel}`;
  }

  if (type === 'merge') {
    return `Merge ${modifier || 'safely'} ${roadLabel}`;
  }

  if (type === 'on ramp') {
    return `Take on-ramp ${modifier ? modifier + ' ' : ''}${roadLabel}`;
  }

  if (type === 'off ramp') {
    return `Take exit / off-ramp ${modifier ? modifier + ' ' : ''}${roadLabel}`;
  }

  if (type === 'fork') {
    return `Keep ${modifier || 'straight'} at fork ${roadLabel}`;
  }

  if (type === 'end of road') {
    return `At end of road, turn ${modifier || 'left/right'} ${roadLabel}`;
  }

  if (type === 'continue') {
    return `Continue ${modifier ? modifier + ' ' : ''}${roadLabel}`;
  }

  if (type === 'roundabout') {
    return `Enter roundabout, take exit ${roadLabel}`;
  }

  if (type === 'new name') {
    return `Road continues as ${name || 'main route'}`;
  }

  const prefix = (type + ' ' + modifier).trim();
  return `${prefix ? prefix.charAt(0).toUpperCase() + prefix.slice(1) + ' ' : ''}${roadLabel}`;
}

export function getManeuverIcon(step) {
  const m = step.maneuver || {};
  const type = m.type || '';
  const modifier = m.modifier || '';

  if (type === 'arrive') return '🏁';
  if (type === 'depart') return '🚗';
  if (modifier.includes('right')) return '↱';
  if (modifier.includes('left')) return '↰';
  if (modifier.includes('u-turn')) return '⤾';
  if (type.includes('ramp')) return '🛣️';
  if (type === 'roundabout') return '🔄';
  return '⬆️';
}

// Fetch complete shortest route and turn-by-turn directions from OSRM
export async function fetchHospitalRoute(startLat, startLng, hospital) {
  const startCoord = `${startLng},${startLat}`;
  const endCoord = `${hospital.lng},${hospital.lat}`;
  const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${startLat},${startLng}&destination=${hospital.lat},${hospital.lng}&travelmode=driving`;
  const appleMapsUrl = `https://maps.apple.com/?saddr=${startLat},${startLng}&daddr=${hospital.lat},${hospital.lng}&dirflg=d`;

  const fallbackResult = {
    success: false,
    hospital,
    distanceKm: haversineDistanceKm(startLat, startLng, hospital.lat, hospital.lng).toFixed(1),
    durationMin: Math.round(haversineDistanceKm(startLat, startLng, hospital.lat, hospital.lng) * 1.2),
    coordinates: [[startLat, startLng], [hospital.lat, hospital.lng]],
    steps: [
      {
        icon: '🚗',
        instruction: `Head directly toward ${hospital.name} (${bearingToCardinal(calculateCompassBearing(startLat, startLng, hospital.lat, hospital.lng))})`,
        distanceText: `${haversineDistanceKm(startLat, startLng, hospital.lat, hospital.lng).toFixed(1)} km`,
        durationText: 'Direct line'
      },
      {
        icon: '🏁',
        instruction: `Arrive at ${hospital.name} emergency entrance`,
        distanceText: '0 m',
        durationText: '0 min'
      }
    ],
    googleMapsUrl,
    appleMapsUrl,
    isDirectLine: true
  };

  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${startCoord};${endCoord}?overview=full&geometries=geojson&steps=true`;
    const response = await fetch(url, { signal: AbortSignal.timeout(6000) });
    
    if (!response.ok) {
      return fallbackResult;
    }

    const data = await response.json();
    if (!data || !data.routes || data.routes.length === 0) {
      return fallbackResult;
    }

    const primaryRoute = data.routes[0];
    const distanceKm = (primaryRoute.distance / 1000).toFixed(1);
    const durationMin = Math.round(primaryRoute.duration / 60);

    // OSRM coordinates are [lng, lat] GeoJSON format -> Leaflet needs [lat, lng]
    const leafletCoords = (primaryRoute.geometry && primaryRoute.geometry.coordinates)
      ? primaryRoute.geometry.coordinates.map(c => [c[1], c[0]])
      : [[startLat, startLng], [hospital.lat, hospital.lng]];

    // Format individual steps
    const rawSteps = (primaryRoute.legs && primaryRoute.legs[0] && primaryRoute.legs[0].steps) || [];
    const formattedSteps = rawSteps.map((s, idx) => {
      const distMeters = Math.round(s.distance);
      const distText = distMeters < 1000 ? `${distMeters} m` : `${(distMeters / 1000).toFixed(1)} km`;
      const durSec = Math.round(s.duration);
      const durText = durSec < 60 ? `${durSec}s` : `${Math.round(durSec / 60)} min`;
      const instruction = formatManeuverInstruction(s, idx, rawSteps.length);
      const icon = getManeuverIcon(s);

      return {
        stepNumber: idx + 1,
        icon,
        instruction,
        distanceM: distMeters,
        distanceText: distText,
        durationSec: durSec,
        durationText: durText,
        roadName: s.name || '',
        maneuverType: s.maneuver ? s.maneuver.type : '',
        modifier: s.maneuver ? s.maneuver.modifier : ''
      };
    });

    return {
      success: true,
      hospital,
      distanceKm,
      durationMin,
      coordinates: leafletCoords,
      steps: formattedSteps,
      googleMapsUrl,
      appleMapsUrl,
      isDirectLine: false
    };

  } catch (err) {
    console.warn('OSRM Route fetch failed, using direct bearing fallback', err);
    return fallbackResult;
  }
}
