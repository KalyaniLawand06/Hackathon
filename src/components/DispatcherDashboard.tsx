import React, { useState, useEffect } from 'react';
import { 
  Hospital, 
  EmergencyRequest, 
  Ambulance, 
  HospitalRanking, 
  ResourceRequirements, 
  UrgencyLevel, 
  TraumaLevel, 
  BloodType 
} from '../types';
import { PRESET_INCIDENT_LOCATIONS } from '../data/mockData';
import { rankHospitals } from '../services/rankingEngine';
import { EmergencyMap } from './EmergencyMap';
import { 
  Clock, 
  ShieldCheck, 
  MapPin, 
  Plus, 
  ArrowRight,
  HeartPulse,
  Bed,
  Ambulance as AmbulanceIcon,
  CheckCircle,
  Building,
  AlertCircle
} from 'lucide-react';

interface DispatcherDashboardProps {
  hospitals: Hospital[];
  emergencies: EmergencyRequest[];
  ambulances: Ambulance[];
  onCreateEmergency: (data: any) => Promise<EmergencyRequest>;
  onReserveHospital: (emergencyId: string, hospitalId: string, ambulanceId?: string) => void;
  onOpenAlternatives: (emergency: EmergencyRequest, alternatives: HospitalRanking[]) => void;
  isSubmitting?: boolean;
}

export const DispatcherDashboard: React.FC<DispatcherDashboardProps> = ({
  hospitals,
  emergencies,
  ambulances,
  onCreateEmergency,
  onReserveHospital,
  onOpenAlternatives,
  isSubmitting = false,
}) => {
  // Form State for New Emergency Request
  const [patientName, setPatientName] = useState<string>('Rameshwar Sharma');
  const [patientAge, setPatientAge] = useState<number>(58);
  const [patientGender, setPatientGender] = useState<'M' | 'F' | 'Other'>('M');
  const [condition, setCondition] = useState<string>('Severe respiratory distress, SpO2 78%, impending respiratory arrest');
  const [urgency, setUrgency] = useState<UrgencyLevel>('CRITICAL_CODE_RED');
  
  // Location
  const [selectedPresetIndex, setSelectedPresetIndex] = useState<number>(0);
  const [customAddress, setCustomAddress] = useState<string>(PRESET_INCIDENT_LOCATIONS[0].name);
  const [locationLat, setLocationLat] = useState<number>(PRESET_INCIDENT_LOCATIONS[0].lat);
  const [locationLng, setLocationLng] = useState<number>(PRESET_INCIDENT_LOCATIONS[0].lng);

  // Resource Requirements
  const [reqIcuBed, setReqIcuBed] = useState<boolean>(true);
  const [reqIcuBedCount, setReqIcuBedCount] = useState<number>(1);
  const [reqVentilator, setReqVentilator] = useState<boolean>(true);
  const [reqVentilatorCount, setReqVentilatorCount] = useState<number>(1);
  const [reqTrauma, setReqTrauma] = useState<boolean>(false);
  const [minTraumaLevel, setMinTraumaLevel] = useState<TraumaLevel>('LEVEL_1');
  const [reqBloodType, setReqBloodType] = useState<BloodType>('O_NEG');
  const [reqBloodUnits, setReqBloodUnits] = useState<number>(2);

  // Selected Active Emergency in view
  const [selectedEmergencyId, setSelectedEmergencyId] = useState<string | null>(
    emergencies[0]?.id || null
  );

  // Live Hospital Rankings calculated for current requirements
  const [liveRankings, setLiveRankings] = useState<HospitalRanking[]>([]);

  // Re-calculate rankings when requirements or hospital states change
  useEffect(() => {
    const requirements: ResourceRequirements = {
      icuBed: reqIcuBed,
      icuBedCount: reqIcuBedCount,
      ventilator: reqVentilator,
      ventilatorCount: reqVentilatorCount,
      traumaFacility: reqTrauma,
      minTraumaLevel: reqTrauma ? minTraumaLevel : undefined,
      bloodType: reqBloodType,
      bloodUnits: reqBloodType !== 'NONE' ? reqBloodUnits : 0,
    };

    const calculated = rankHospitals(
      hospitals,
      requirements,
      { lat: locationLat, lng: locationLng },
      urgency
    );

    setLiveRankings(calculated);
  }, [
    hospitals,
    reqIcuBed,
    reqIcuBedCount,
    reqVentilator,
    reqVentilatorCount,
    reqTrauma,
    minTraumaLevel,
    reqBloodType,
    reqBloodUnits,
    locationLat,
    locationLng,
    urgency,
  ]);

  const handlePresetLocationChange = (index: number) => {
    setSelectedPresetIndex(index);
    const loc = PRESET_INCIDENT_LOCATIONS[index];
    setCustomAddress(loc.name);
    setLocationLat(loc.lat);
    setLocationLng(loc.lng);
  };

  const activeEmergency = emergencies.find((e) => e.id === selectedEmergencyId) || emergencies[0] || null;

  const handleCreateAndMatch = async (e: React.FormEvent) => {
    e.preventDefault();
    const requirements: ResourceRequirements = {
      icuBed: reqIcuBed,
      icuBedCount: reqIcuBedCount,
      ventilator: reqVentilator,
      ventilatorCount: reqVentilatorCount,
      traumaFacility: reqTrauma,
      minTraumaLevel: reqTrauma ? minTraumaLevel : undefined,
      bloodType: reqBloodType,
      bloodUnits: reqBloodType !== 'NONE' ? reqBloodUnits : 0,
    };

    try {
      const created = await onCreateEmergency({
        patientName,
        patientAge,
        patientGender,
        condition,
        urgency,
        location: {
          address: customAddress,
          lat: locationLat,
          lng: locationLng,
        },
        requiredResources: requirements,
      });

      setSelectedEmergencyId(created.id);
    } catch (err: any) {
      alert(err.message || 'Error creating emergency request');
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Calm Hospital Network Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-white border border-slate-200/90 rounded-xl p-4 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-500 font-medium">
              Active Patient Requests
            </div>
            <div className="text-2xl font-bold text-slate-900 mt-1">
              {emergencies.filter((e) => e.status !== 'HANDOVER_COMPLETE').length} Active
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-100 flex items-center justify-center text-teal-700">
            <HeartPulse className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200/90 rounded-xl p-4 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-500 font-medium">
              Connected Hospital Facilities
            </div>
            <div className="text-2xl font-bold text-slate-900 mt-1">
              {hospitals.length} Hospitals
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-700">
            <Building className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200/90 rounded-xl p-4 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-500 font-medium">
              Regional ICU Bed Capacity
            </div>
            <div className="text-2xl font-bold text-teal-800 mt-1">
              {hospitals.reduce((acc, h) => acc + h.resources.icuBeds.available, 0)} Available
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-700">
            <Bed className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200/90 rounded-xl p-4 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-500 font-medium">
              Ambulance Units Ready
            </div>
            <div className="text-2xl font-bold text-slate-900 mt-1">
              {ambulances.filter((a) => a.status === 'AVAILABLE').length}/{ambulances.length} On Standby
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-700">
            <AmbulanceIcon className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Main Grid: Left = Intake + Active Queue, Right = Matching & Spatial Map */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* LEFT COLUMN: Patient Intake Form & Queue (5 Cols) */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* Patient Emergency Intake Form */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-xs">
            <div className="pb-3 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  New Emergency Placement Request
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Enter patient details and required hospital clinical resources
                </p>
              </div>
            </div>

            <form onSubmit={handleCreateAndMatch} className="mt-4 space-y-4">
              
              {/* Urgency Level Buttons */}
              <div>
                <label className="text-xs font-medium text-slate-700 block mb-1.5">
                  Clinical Urgency Level
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setUrgency('CRITICAL_CODE_RED')}
                    className={`py-2 px-2.5 rounded-lg text-xs font-medium transition cursor-pointer border ${
                      urgency === 'CRITICAL_CODE_RED'
                        ? 'bg-rose-50 text-rose-800 border-rose-300 font-semibold shadow-xs'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    Code Red (Critical)
                  </button>
                  <button
                    type="button"
                    onClick={() => setUrgency('URGENT_CODE_YELLOW')}
                    className={`py-2 px-2.5 rounded-lg text-xs font-medium transition cursor-pointer border ${
                      urgency === 'URGENT_CODE_YELLOW'
                        ? 'bg-amber-50 text-amber-800 border-amber-300 font-semibold shadow-xs'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    Code Yellow (Urgent)
                  </button>
                  <button
                    type="button"
                    onClick={() => setUrgency('STANDARD_CODE_GREEN')}
                    className={`py-2 px-2.5 rounded-lg text-xs font-medium transition cursor-pointer border ${
                      urgency === 'STANDARD_CODE_GREEN'
                        ? 'bg-teal-50 text-teal-800 border-teal-300 font-semibold shadow-xs'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    Code Green (Standard)
                  </button>
                </div>
              </div>

              {/* Patient Demographics */}
              <div className="grid grid-cols-6 gap-2.5">
                <div className="col-span-3">
                  <label className="text-xs font-medium text-slate-700 block mb-1">
                    Patient Name
                  </label>
                  <input
                    type="text"
                    required
                    value={patientName}
                    onChange={(e) => setPatientName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600 transition"
                    placeholder="Full name"
                  />
                </div>
                <div className="col-span-1">
                  <label className="text-xs font-medium text-slate-700 block mb-1">
                    Age
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={120}
                    value={patientAge}
                    onChange={(e) => setPatientAge(parseInt(e.target.value, 10))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600 transition"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-medium text-slate-700 block mb-1">
                    Gender
                  </label>
                  <select
                    value={patientGender}
                    onChange={(e) => setPatientGender(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600 transition cursor-pointer"
                  >
                    <option value="M">Male</option>
                    <option value="F">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              {/* Clinical Presentation */}
              <div>
                <label className="text-xs font-medium text-slate-700 block mb-1">
                  Chief Complaint & Clinical Summary
                </label>
                <input
                  type="text"
                  required
                  value={condition}
                  onChange={(e) => setCondition(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600 transition"
                  placeholder="e.g. Acute chest pain, shortness of breath, or multiple trauma"
                />
              </div>

              {/* Incident Location Preset */}
              <div>
                <label className="text-xs font-medium text-slate-700 block mb-1 flex items-center justify-between">
                  <span>Incident Scene Location:</span>
                  <span className="text-[11px] text-slate-400 font-mono">
                    {locationLat.toFixed(3)}, {locationLng.toFixed(3)}
                  </span>
                </label>
                <select
                  value={selectedPresetIndex}
                  onChange={(e) => handlePresetLocationChange(parseInt(e.target.value, 10))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600 transition cursor-pointer"
                >
                  {PRESET_INCIDENT_LOCATIONS.map((loc, idx) => (
                    <option key={loc.name} value={idx}>
                      📍 {loc.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Clinical Resource Checklist */}
              <div className="bg-slate-50/70 p-4 rounded-xl border border-slate-200/80 space-y-3">
                <div className="text-xs font-semibold text-slate-800 flex items-center justify-between">
                  <span>Required Ward & Care Resources:</span>
                  <span className="text-[11px] text-slate-500 font-normal">Filters matching facilities</span>
                </div>

                {/* ICU Bed */}
                <div className="flex items-center justify-between text-xs">
                  <label className="flex items-center gap-2 cursor-pointer text-slate-700 font-medium">
                    <input
                      type="checkbox"
                      checked={reqIcuBed}
                      onChange={(e) => setReqIcuBed(e.target.checked)}
                      className="rounded border-slate-300 text-teal-700 focus:ring-teal-500 w-4 h-4 cursor-pointer"
                    />
                    <span>Intensive Care Unit (ICU) Bed</span>
                  </label>
                  {reqIcuBed && (
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="text-slate-500">Qty:</span>
                      <select
                        value={reqIcuBedCount}
                        onChange={(e) => setReqIcuBedCount(parseInt(e.target.value, 10))}
                        className="bg-white border border-slate-200 rounded px-2 py-0.5 text-xs text-slate-800 font-medium cursor-pointer"
                      >
                        <option value={1}>1 Bed</option>
                        <option value={2}>2 Beds</option>
                      </select>
                    </div>
                  )}
                </div>

                {/* Ventilator */}
                <div className="flex items-center justify-between text-xs">
                  <label className="flex items-center gap-2 cursor-pointer text-slate-700 font-medium">
                    <input
                      type="checkbox"
                      checked={reqVentilator}
                      onChange={(e) => setReqVentilator(e.target.checked)}
                      className="rounded border-slate-300 text-teal-700 focus:ring-teal-500 w-4 h-4 cursor-pointer"
                    />
                    <span>Mechanical Ventilator Unit</span>
                  </label>
                  {reqVentilator && (
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="text-slate-500">Qty:</span>
                      <select
                        value={reqVentilatorCount}
                        onChange={(e) => setReqVentilatorCount(parseInt(e.target.value, 10))}
                        className="bg-white border border-slate-200 rounded px-2 py-0.5 text-xs text-slate-800 font-medium cursor-pointer"
                      >
                        <option value={1}>1 Unit</option>
                        <option value={2}>2 Units</option>
                      </select>
                    </div>
                  )}
                </div>

                {/* Trauma Facility */}
                <div className="flex items-center justify-between text-xs">
                  <label className="flex items-center gap-2 cursor-pointer text-slate-700 font-medium">
                    <input
                      type="checkbox"
                      checked={reqTrauma}
                      onChange={(e) => setReqTrauma(e.target.checked)}
                      className="rounded border-slate-300 text-teal-700 focus:ring-teal-500 w-4 h-4 cursor-pointer"
                    />
                    <span>Trauma Resuscitation Suite</span>
                  </label>
                  {reqTrauma && (
                    <select
                      value={minTraumaLevel}
                      onChange={(e) => setMinTraumaLevel(e.target.value as TraumaLevel)}
                      className="bg-white border border-slate-200 rounded px-2 py-0.5 text-xs text-slate-800 font-medium cursor-pointer"
                    >
                      <option value="LEVEL_1">Level 1 Trauma</option>
                      <option value="LEVEL_2">Level 2 Trauma</option>
                      <option value="COMMUNITY">Any Facility</option>
                    </select>
                  )}
                </div>

                {/* Blood Bank */}
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-700 font-medium">Blood Transfusion:</span>
                  <div className="flex items-center gap-1.5">
                    <select
                      value={reqBloodType}
                      onChange={(e) => setReqBloodType(e.target.value as BloodType)}
                      className="bg-white border border-slate-200 rounded px-2 py-0.5 text-xs text-slate-800 font-medium cursor-pointer"
                    >
                      <option value="NONE">None Required</option>
                      <option value="O_NEG">O- Negative (Universal)</option>
                      <option value="O_POS">O+ Positive</option>
                      <option value="A_POS">A+ Positive</option>
                      <option value="B_POS">B+ Positive</option>
                    </select>
                    {reqBloodType !== 'NONE' && (
                      <select
                        value={reqBloodUnits}
                        onChange={(e) => setReqBloodUnits(parseInt(e.target.value, 10))}
                        className="bg-white border border-slate-200 rounded px-2 py-0.5 text-xs text-slate-800 font-medium cursor-pointer"
                      >
                        <option value={1}>1 Unit</option>
                        <option value={2}>2 Units</option>
                        <option value={4}>4 Units</option>
                      </select>
                    )}
                  </div>
                </div>

              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-2.5 px-4 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-medium text-xs flex items-center justify-center gap-2 shadow-xs transition cursor-pointer disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
                <span>Create Placement Request & Match Hospitals</span>
              </button>
            </form>
          </div>

          {/* Active Emergencies Queue */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <span>Active Patient Care Queue</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium">
                  {emergencies.length}
                </span>
              </h3>
            </div>

            <div className="mt-4 space-y-2.5 max-h-[360px] overflow-y-auto">
              {emergencies.map((emg) => {
                const isSelected = emg.id === activeEmergency?.id;
                const targetHosp = hospitals.find((h) => h.id === emg.targetHospitalId);
                const isRejectedOrDiverted =
                  emg.status === 'REJECTED_AUTO_ALTERNATIVES' || emg.status === 'REJECTED';

                return (
                  <div
                    key={emg.id}
                    onClick={() => setSelectedEmergencyId(emg.id)}
                    className={`p-3.5 rounded-xl border text-xs cursor-pointer transition ${
                      isSelected
                        ? 'bg-teal-50/60 border-teal-400 shadow-xs'
                        : isRejectedOrDiverted
                        ? 'bg-rose-50/70 border-rose-200 hover:border-rose-300'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 font-semibold text-slate-900">
                        <span>{emg.patientName}</span>
                        <span className="text-slate-500 font-normal">({emg.patientAge}y)</span>
                      </div>
                      <span
                        className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                          emg.urgency === 'CRITICAL_CODE_RED'
                            ? 'bg-rose-50 text-rose-700 border border-rose-200'
                            : 'bg-amber-50 text-amber-800 border border-amber-200'
                        }`}
                      >
                        {emg.urgency.replace('CRITICAL_', '').replace('CODE_', '')}
                      </span>
                    </div>

                    <p className="text-slate-600 line-clamp-1 mt-1 text-[11px]">{emg.condition}</p>

                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 text-[11px]">
                      <span className="text-slate-500 flex items-center gap-1">
                        <span>Status:</span>
                        <strong
                          className={
                            isRejectedOrDiverted
                              ? 'text-rose-700 font-medium'
                              : emg.status === 'CONFIRMED' || emg.status === 'HANDOVER_COMPLETE'
                              ? 'text-emerald-700 font-medium'
                              : 'text-teal-700 font-medium'
                          }
                        >
                          {emg.status.replace(/_/g, ' ')}
                        </strong>
                      </span>

                      {targetHosp && (
                        <span className="text-slate-700 font-medium">{targetHosp.name}</span>
                      )}
                    </div>

                    {/* Automatic Re-Route Suggestion Banner if Rejected or Contended */}
                    {isRejectedOrDiverted && (
                      <div className="mt-2.5 p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between">
                        <span className="flex items-center gap-1.5">
                          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                          <span>Alternate facility ready for placement</span>
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const excluded = emg.previousRejections?.map((r) => r.hospitalId) || [];
                            const alts = rankHospitals(
                              hospitals,
                              emg.requiredResources,
                              emg.location,
                              emg.urgency,
                              excluded
                            );
                            onOpenAlternatives(emg, alts);
                          }}
                          className="px-2.5 py-1 rounded-md bg-rose-700 hover:bg-rose-800 text-white font-medium text-xs flex items-center gap-1 shadow-xs cursor-pointer"
                        >
                          <span>Review Alternatives</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

        </div>

        {/* RIGHT COLUMN: Matching Hospital Ranking Table + Calm Map (7 Cols) */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* Hospital Ranking Table */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3.5 border-b border-slate-100 gap-2">
              <div>
                <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-teal-600" />
                  <span>Matching Hospitals & Availability Ranking</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Evaluated on clinical resource match, transit time, and verified freshness
                </p>
              </div>
            </div>

            {/* Rankings Table */}
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-slate-500 bg-slate-50/70 border-y border-slate-100 text-[11px]">
                    <th className="py-2.5 px-3 font-medium">Rank & Facility</th>
                    <th className="py-2.5 px-2 font-medium">Care Match</th>
                    <th className="py-2.5 px-2 font-medium">Travel ETA</th>
                    <th className="py-2.5 px-2 font-medium">Data Freshness</th>
                    <th className="py-2.5 pr-3 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {liveRankings.map((rankedItem, index) => {
                    const hosp = rankedItem.hospital;
                    const isTopRanked = index === 0;

                    return (
                      <tr
                        key={hosp.id}
                        className={`hover:bg-slate-50/70 transition-colors ${
                          isTopRanked ? 'bg-teal-50/30' : ''
                        }`}
                      >
                        {/* Hospital Name & Rank */}
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-2.5">
                            <span
                              className={`w-6 h-6 rounded-md flex items-center justify-center font-semibold text-xs shrink-0 ${
                                isTopRanked
                                  ? 'bg-teal-700 text-white shadow-xs'
                                  : 'bg-slate-100 text-slate-700 border border-slate-200'
                              }`}
                            >
                              {rankedItem.rank}
                            </span>
                            <div>
                              <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                                <span>{hosp.name}</span>
                                {isTopRanked && (
                                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-teal-50 text-teal-800 border border-teal-200">
                                    Best Choice
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                                <span>{hosp.traumaLevel.replace('_', ' ')}</span>
                                <span className="text-slate-300">·</span>
                                <span className="text-teal-700 font-medium">
                                  {hosp.resources.icuBeds.available} ICU / {hosp.resources.ventilators.available} Vents open
                                </span>
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Resource Match % */}
                        <td className="py-3 px-2">
                          <div className="flex flex-col">
                            <span
                              className={`font-semibold ${
                                rankedItem.meetsAllHardRequirements
                                  ? 'text-emerald-700'
                                  : 'text-rose-600'
                              }`}
                            >
                              {rankedItem.resourceMatchPercentage}% Match
                            </span>
                            {!rankedItem.meetsAllHardRequirements && (
                              <span className="text-[10px] text-rose-500 line-clamp-1">
                                {rankedItem.missingResources[0] || 'Capacity constrained'}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Travel Time ETA */}
                        <td className="py-3 px-2">
                          <span className="font-medium text-slate-800">
                            ~{rankedItem.estimatedTravelTimeMinutes} min
                          </span>
                        </td>

                        {/* Data Freshness Badge */}
                        <td className="py-3 px-2">
                          <div className="flex flex-col">
                            <span
                              className={`text-[11px] font-medium px-2 py-0.5 rounded-md flex items-center gap-1 w-fit ${
                                rankedItem.freshnessCategory === 'FRESH'
                                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                  : rankedItem.freshnessCategory === 'AGING'
                                  ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                  : 'bg-rose-50 text-rose-800 border border-rose-200'
                              }`}
                            >
                              <span>
                                {rankedItem.freshnessCategory === 'FRESH'
                                  ? 'Fresh data'
                                  : rankedItem.freshnessCategory === 'AGING'
                                  ? 'Aging (5-10m)'
                                  : 'Stale (>10m) ⚠️'}
                              </span>
                            </span>
                            <span className="text-[10px] text-slate-400 mt-0.5">
                              {rankedItem.hospital.lastUpdatedAt ? new Date(rankedItem.hospital.lastUpdatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recent'}
                            </span>
                          </div>
                        </td>

                        {/* Action: Reserve Button */}
                        <td className="py-3 pr-3 text-right">
                          <button
                            onClick={() => {
                              if (!activeEmergency) return;
                              onReserveHospital(activeEmergency.id, hosp.id);
                            }}
                            disabled={isSubmitting || !rankedItem.meetsAllHardRequirements}
                            className={`py-1.5 px-3 rounded-lg text-xs font-medium transition cursor-pointer shadow-xs ${
                              isTopRanked
                                ? 'bg-teal-700 hover:bg-teal-800 text-white'
                                : rankedItem.isStaleWarning
                                ? 'bg-amber-600 hover:bg-amber-700 text-white'
                                : 'bg-slate-800 hover:bg-slate-900 text-white'
                            } disabled:opacity-40 disabled:cursor-not-allowed`}
                            title={
                              !rankedItem.meetsAllHardRequirements
                                ? 'Facility does not meet required clinical resources'
                                : rankedItem.isStaleWarning
                                ? 'Data is over 10 minutes old - confirmation suggested'
                                : 'Reserve bed and dispatch ambulance'
                            }
                          >
                            <span>{rankedItem.isStaleWarning ? 'Verify & Route' : 'Reserve & Route'}</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Stale Warning explanation */}
            {liveRankings.some((r) => r.isStaleWarning) && (
              <div className="mt-3.5 p-3 rounded-xl bg-amber-50/70 border border-amber-200 text-amber-900 text-xs flex items-center gap-2.5">
                <AlertCircle className="w-4 h-4 shrink-0 text-amber-700" />
                <span>
                  <strong>Data Verification Note:</strong> One or more facilities have not confirmed ward bed availability in &gt;10 minutes. The dispatch system adjusts rankings accordingly and reminds coordinators to verify availability on arrival.
                </span>
              </div>
            )}
          </div>

          {/* Interactive Spatial Leaflet Map */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-xs">
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-100 mb-3.5">
              <div>
                <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-teal-600" />
                  <span>Regional Hospital Network & Route Map</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Live ambulance pathways, hospital coordinates, and incident locations
                </p>
              </div>
            </div>

            <div className="h-[360px] w-full">
              <EmergencyMap
                hospitals={hospitals}
                selectedHospitalId={activeEmergency?.targetHospitalId}
                activeEmergency={activeEmergency}
                ambulances={ambulances}
                onSelectHospital={(id) => {
                  if (activeEmergency) {
                    onReserveHospital(activeEmergency.id, id);
                  }
                }}
              />
            </div>
          </div>

        </div>

      </div>

    </div>
  );
};
