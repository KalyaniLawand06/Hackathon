import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { Hospital, EmergencyRequest, Ambulance } from '../types';

interface EmergencyMapProps {
  hospitals: Hospital[];
  selectedHospitalId?: string;
  activeEmergency?: EmergencyRequest | null;
  ambulances: Ambulance[];
  onSelectHospital?: (hospitalId: string) => void;
}

export const EmergencyMap: React.FC<EmergencyMapProps> = ({
  hospitals,
  selectedHospitalId,
  activeEmergency,
  ambulances,
  onSelectHospital,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const routeLayerRef = useRef<L.Polyline | null>(null);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      // Initialize Leaflet map centered at Delhi / National Capital Region coordinates
      const map = L.map(mapContainerRef.current, {
        center: [28.59, 77.20],
        zoom: 11,
        zoomControl: false,
      });

      L.control.zoom({ position: 'bottomright' }).addTo(map);

      // Clean, calm, serene CartoDB Positron light tile layer
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
        subdomains: 'abcd',
        maxZoom: 19,
      }).addTo(map);

      const layerGroup = L.layerGroup().addTo(map);
      layerGroupRef.current = layerGroup;
      mapInstanceRef.current = map;
    }

    return () => {
      // Map cleanup if container unmounts
    };
  }, []);

  // Update markers and route lines when data changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    const layerGroup = layerGroupRef.current;
    if (!map || !layerGroup) return;

    layerGroup.clearLayers();

    if (routeLayerRef.current) {
      routeLayerRef.current.remove();
      routeLayerRef.current = null;
    }

    // 1. Render Hospitals
    hospitals.forEach((hospital) => {
      const isSelected = hospital.id === selectedHospitalId;
      const isFull = hospital.resources.icuBeds.available === 0;
      const isDiverted = hospital.divertStatus !== 'ACCEPTING_ALL';

      let bgClass = 'bg-teal-700 border-white text-white';
      if (isFull || isDiverted) {
        bgClass = 'bg-rose-600 border-white text-white';
      } else if (hospital.resources.icuBeds.available <= 1) {
        bgClass = 'bg-amber-600 border-white text-white';
      }

      const iconHtml = `
        <div class="relative flex items-center justify-center cursor-pointer">
          <div class="w-8 h-8 rounded-xl ${bgClass} border-2 shadow-md flex items-center justify-center text-xs font-bold transition-all ${
        isSelected ? 'ring-4 ring-teal-400 ring-offset-2 scale-110' : 'hover:scale-105'
      }">
            <span>🏥</span>
          </div>
          <div class="absolute -top-2.5 -right-2 bg-white text-slate-800 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border border-slate-200 shadow-xs">
            ${hospital.resources.icuBeds.available} ICU
          </div>
        </div>
      `;

      const customIcon = L.divIcon({
        className: 'custom-hospital-marker',
        html: iconHtml,
        iconSize: [34, 34],
        iconAnchor: [17, 17],
      });

      const marker = L.marker([hospital.lat, hospital.lng], { icon: customIcon });

      marker.bindPopup(`
        <div class="p-2 font-sans text-slate-800 min-w-[210px]">
          <div class="font-bold text-sm text-slate-900">${hospital.name}</div>
          <div class="text-xs text-slate-500 mt-0.5">${hospital.address}</div>
          <div class="mt-2 text-xs grid grid-cols-2 gap-1.5 bg-slate-50 p-2 rounded-lg border border-slate-200/80">
            <div>ICU Beds: <strong class="text-slate-900">${hospital.resources.icuBeds.available}/${hospital.resources.icuBeds.total}</strong></div>
            <div>Ventilators: <strong class="text-slate-900">${hospital.resources.ventilators.available}/${hospital.resources.ventilators.total}</strong></div>
            <div>Trauma Bays: <strong class="text-slate-900">${hospital.resources.traumaBays.available}</strong></div>
            <div>Trauma: <strong class="text-slate-900">${hospital.traumaLevel.replace('_', ' ')}</strong></div>
          </div>
          <div class="mt-2 text-xs font-medium ${isDiverted ? 'text-rose-700' : 'text-teal-700'}">
            Status: ${hospital.divertStatus.replace('_', ' ')}
          </div>
        </div>
      `);

      marker.on('click', () => {
        if (onSelectHospital) onSelectHospital(hospital.id);
      });

      marker.addTo(layerGroup);
    });

    // 2. Render Active Emergency Incident
    if (activeEmergency && activeEmergency.location) {
      const emgIconHtml = `
        <div class="relative flex items-center justify-center">
          <span class="absolute inline-flex h-9 w-9 rounded-full bg-rose-400/40 animate-ping"></span>
          <div class="relative w-7 h-7 rounded-full bg-rose-600 border-2 border-white shadow-md flex items-center justify-center text-white text-[11px] font-bold">
            📍
          </div>
        </div>
      `;

      const emgIcon = L.divIcon({
        className: 'emergency-marker',
        html: emgIconHtml,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      });

      const emgMarker = L.marker([activeEmergency.location.lat, activeEmergency.location.lng], {
        icon: emgIcon,
        zIndexOffset: 1000,
      });

      emgMarker.bindPopup(`
        <div class="p-2 text-slate-800 font-sans">
          <div class="font-bold text-xs text-rose-700 flex items-center gap-1">
            <span>Patient:</span> ${activeEmergency.patientName} (${activeEmergency.patientAge}y)
          </div>
          <div class="text-xs text-slate-600 mt-1">${activeEmergency.condition}</div>
          <div class="text-xs font-semibold text-slate-800 mt-1.5">Status: ${activeEmergency.status.replace(/_/g, ' ')}</div>
          <div class="text-[11px] text-slate-500 mt-0.5">${activeEmergency.location.address}</div>
        </div>
      `);

      emgMarker.addTo(layerGroup);

      // 3. Draw Route Line if target or selected hospital exists
      const targetHospId = activeEmergency.targetHospitalId || selectedHospitalId;
      const targetHospital = hospitals.find((h) => h.id === targetHospId);

      if (targetHospital) {
        const latlngs: [number, number][] = [
          [activeEmergency.location.lat, activeEmergency.location.lng],
          [
            (activeEmergency.location.lat + targetHospital.lat) / 2 + 0.002,
            (activeEmergency.location.lng + targetHospital.lng) / 2 - 0.003,
          ],
          [targetHospital.lat, targetHospital.lng],
        ];

        const route = L.polyline(latlngs, {
          color: '#0d9488', // calm teal-600
          weight: 4,
          opacity: 0.85,
          dashArray: '6, 6',
        }).addTo(map);

        routeLayerRef.current = route;
      }
    }

    // 4. Render Ambulances
    ambulances.forEach((amb) => {
      const isAssigned = amb.status === 'EN_ROUTE_HOSPITAL' || amb.status === 'AT_HOSPITAL';
      const ambIconHtml = `
        <div class="relative flex items-center justify-center">
          <div class="w-6 h-6 rounded-lg ${
            isAssigned ? 'bg-amber-600' : 'bg-slate-700'
          } border border-white shadow-sm flex items-center justify-center text-white text-[10px] font-bold">
            🚑
          </div>
        </div>
      `;

      const ambIcon = L.divIcon({
        className: 'amb-marker',
        html: ambIconHtml,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      });

      const ambMarker = L.marker([amb.currentLat, amb.currentLng], { icon: ambIcon });
      ambMarker.bindPopup(`
        <div class="p-1.5 text-slate-800 text-xs font-sans">
          <div class="font-bold text-slate-900">${amb.unitCode}</div>
          <div class="text-slate-500">${amb.crew}</div>
          <div class="font-medium text-teal-700 mt-1">Status: ${amb.status.replace(/_/g, ' ')}</div>
        </div>
      `);
      ambMarker.addTo(layerGroup);
    });
  }, [hospitals, selectedHospitalId, activeEmergency, ambulances, onSelectHospital]);

  return (
    <div className="relative w-full h-full min-h-[340px] rounded-xl overflow-hidden border border-slate-200 shadow-sm bg-slate-100">
      <div ref={mapContainerRef} className="w-full h-full" style={{ zIndex: 1 }} />
      
      {/* Calm Map Legend Overlay */}
      <div className="absolute top-3 left-3 bg-white/90 backdrop-blur-md border border-slate-200/90 rounded-lg p-2.5 text-xs text-slate-600 shadow-sm pointer-events-auto" style={{ zIndex: 999 }}>
        <div className="font-semibold text-slate-900 mb-1.5 flex items-center gap-1.5">
          <span>Metro Health Spatial View</span>
        </div>
        <div className="flex flex-col gap-1 text-[11px]">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-teal-600"></span>
            <span>Hospital Available</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
            <span>Limited Capacity</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
            <span>Full / Divert</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-600"></span>
            <span>Emergency Location</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-teal-600 font-bold font-mono">---</span>
            <span>Transit Pathway</span>
          </div>
        </div>
      </div>
    </div>
  );
};
