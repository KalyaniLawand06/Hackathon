import React, { useState, useEffect } from 'react';
import { Hospital, EmergencyRequest, Ambulance, HospitalResources, DivertStatus } from '../types';
import { 
  Building2, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  Plus, 
  Minus, 
  AlertCircle, 
  Check, 
  UserCheck, 
  Truck, 
  FileText,
  RefreshCw,
  Phone,
  User,
  HeartHandshake
} from 'lucide-react';
import { evaluateFreshness } from '../services/rankingEngine';
import { api } from '../services/api';

interface HospitalStaffPortalProps {
  hospital: Hospital;
  emergencies: EmergencyRequest[];
  ambulances: Ambulance[];
  onUpdateHospitalResources: (hospitalId: string, resources: HospitalResources) => void;
  onRefreshAvailabilityTimestamp: (hospitalId: string) => void;
  onAcceptEmergency: (emergencyId: string) => void;
  onRejectEmergency: (emergencyId: string, reason: string) => void;
  onMarkArrived: (emergencyId: string) => void;
  onCompleteHandover: (emergencyId: string, receivingStaff: string, notes: string) => void;
}

export const HospitalStaffPortal: React.FC<HospitalStaffPortalProps> = ({
  hospital,
  emergencies,
  ambulances,
  onUpdateHospitalResources,
  onRefreshAvailabilityTimestamp,
  onAcceptEmergency,
  onRejectEmergency,
  onMarkArrived,
  onCompleteHandover,
}) => {
  // Freshness tick every 5 seconds to update "Updated Xs ago"
  const [freshness, setFreshness] = useState(() => evaluateFreshness(hospital.lastUpdatedAt));
  const [rejectingEmergencyId, setRejectingEmergencyId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string>('Trauma Bay & Resuscitation Surge');
  const [handoverModalEmergencyId, setHandoverModalEmergencyId] = useState<string | null>(null);
  const [handoverPhysician, setHandoverPhysician] = useState<string>('Dr. Rajesh K. Sharma (Chief of Critical Care)');
  const [handoverNotes, setHandoverNotes] = useState<string>('Patient received and transferred to ICU Bay 2. Triage completed.');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setFreshness(evaluateFreshness(hospital.lastUpdatedAt));
    }, 5000);
    return () => clearInterval(interval);
  }, [hospital.lastUpdatedAt]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Filter requests targeting this hospital
  const incomingRequests = emergencies.filter(
    (e) => e.targetHospitalId === hospital.id && (e.status === 'RESERVATION_REQUESTED' || e.status === 'PENDING_MATCH')
  );

  const activePatients = emergencies.filter(
    (e) =>
      e.targetHospitalId === hospital.id &&
      (e.status === 'CONFIRMED' ||
        e.status === 'AMBULANCE_DISPATCHED' ||
        e.status === 'EN_ROUTE_HOSPITAL' ||
        e.status === 'ARRIVED_AT_ER')
  );

  const updateResourceValue = async (
    category: 'icuBeds' | 'ventilators' | 'traumaBays',
    field: 'available' | 'total',
    delta: number
  ) => {
    const updated = { ...hospital.resources };
    const current = updated[category][field];
    const nextVal = Math.max(0, current + delta);
    
    // Available cannot exceed total
    if (field === 'available' && nextVal > updated[category].total) {
      updated[category].total = nextVal;
    }
    updated[category][field] = nextVal;

    try {
      await api.updateHospitalResources(hospital.id, { resources: updated });
      showToast(`Updated ${category} ${field} to ${nextVal}`);
    } catch (e: any) {
      alert(e.message || 'Error updating resources');
    }
  };

  const updateBloodValue = async (type: keyof typeof hospital.resources.bloodInventory, delta: number) => {
    const updated = { ...hospital.resources };
    const current = updated.bloodInventory[type] || 0;
    const nextVal = Math.max(0, current + delta);
    updated.bloodInventory[type] = nextVal;

    try {
      await api.updateHospitalResources(hospital.id, { resources: updated });
      showToast(`Updated Blood ${type} to ${nextVal} units`);
    } catch (e: any) {
      alert(e.message || 'Error updating blood');
    }
  };

  const handleConfirmFreshness = async () => {
    try {
      await api.updateHospitalResources(hospital.id, { lastUpdatedAt: new Date().toISOString() });
      showToast('Hospital availability verified as fresh and accurate!');
    } catch (e: any) {
      alert(e.message || 'Error');
    }
  };

  const handleDivertChange = async (newStatus: DivertStatus) => {
    try {
      await api.updateHospitalResources(hospital.id, { divertStatus: newStatus });
      showToast(`Intake status updated: ${newStatus.replace('_', ' ')}`);
    } catch (e: any) {
      alert(e.message || 'Error');
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-20 right-6 z-50 bg-teal-900 text-white px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 shadow-lg animate-in fade-in">
          <Check className="w-4 h-4 text-teal-300" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Hospital Identity & Status Header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-teal-50 border border-teal-100 flex items-center justify-center text-teal-700 shrink-0 text-2xl font-bold">
              🏥
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-xl font-semibold text-slate-900">{hospital.name}</h2>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 font-medium">
                  {hospital.traumaLevel.replace('_', ' ')}
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  {hospital.code}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-3">
                <span>{hospital.address}</span>
                <span className="text-slate-300">·</span>
                <span className="flex items-center gap-1">
                  <User className="w-3.5 h-3.5 text-slate-400" />
                  {hospital.contactPerson}
                </span>
                <span className="text-slate-300">·</span>
                <span className="flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5 text-slate-400" />
                  {hospital.phone}
                </span>
              </p>
            </div>
          </div>

          {/* Freshness Status Card & Refresh Button */}
          <div className="flex items-center gap-3 bg-slate-50/80 p-3.5 rounded-xl border border-slate-200/80 self-start md:self-auto">
            <div>
              <div className="text-[11px] text-slate-500 font-medium">Ward Availability Status</div>
              <div className="flex items-center gap-2 mt-1">
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded-md flex items-center gap-1 ${
                    freshness.category === 'FRESH'
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : freshness.category === 'AGING'
                      ? 'bg-amber-50 text-amber-800 border border-amber-200'
                      : 'bg-rose-50 text-rose-800 border border-rose-200'
                  }`}
                >
                  {freshness.category === 'STALE' && <AlertCircle className="w-3.5 h-3.5" />}
                  {freshness.category === 'FRESH'
                    ? 'Fresh data'
                    : freshness.category === 'AGING'
                    ? 'Aging (5-10m)'
                    : 'Verification needed ⚠️'}
                </span>
                <span className="text-xs text-slate-500">{freshness.label}</span>
              </div>
            </div>

            <button
              onClick={handleConfirmFreshness}
              className="py-2 px-3 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-medium flex items-center gap-1.5 shadow-xs transition cursor-pointer"
              title="Confirm that your hospital availability data is accurate and current"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Confirm Current</span>
            </button>
          </div>
        </div>

        {/* Hospital Intake Divert Selector */}
        <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5">
            <span className="font-medium text-slate-700">Hospital Intake Status:</span>
            <div className="flex items-center gap-1.5">
              {(['ACCEPTING_ALL', 'TRAUMA_DIVERT', 'ICU_DIVERT', 'FULL_DIVERT'] as DivertStatus[]).map((status) => (
                <button
                  key={status}
                  onClick={() => handleDivertChange(status)}
                  className={`px-3 py-1 rounded-md text-[11px] font-medium transition cursor-pointer ${
                    hospital.divertStatus === status
                      ? status === 'ACCEPTING_ALL'
                        ? 'bg-teal-700 text-white shadow-xs'
                        : 'bg-rose-700 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                  }`}
                >
                  {status.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Ward Resource Inventory Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* ICU Beds Card */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-slate-600">
                ICU Beds
              </span>
              <span
                className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                  hospital.resources.icuBeds.available > 1
                    ? 'bg-emerald-50 text-emerald-800'
                    : hospital.resources.icuBeds.available === 1
                    ? 'bg-amber-50 text-amber-800'
                    : 'bg-rose-50 text-rose-800'
                }`}
              >
                {hospital.resources.icuBeds.available === 0 ? 'Full capacity' : 'Available'}
              </span>
            </div>
            <div className="flex items-baseline gap-2 my-2.5">
              <span className="text-3xl font-bold text-slate-900">
                {hospital.resources.icuBeds.available}
              </span>
              <span className="text-xs text-slate-500">
                / {hospital.resources.icuBeds.total} Total Beds
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100">
            <span className="text-xs text-slate-500 font-medium">Adjust Beds:</span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => updateResourceValue('icuBeds', 'available', -1)}
                className="w-7 h-7 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center font-bold cursor-pointer"
                title="Decrease available bed"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => updateResourceValue('icuBeds', 'available', 1)}
                className="w-7 h-7 rounded-md bg-teal-700 hover:bg-teal-800 text-white flex items-center justify-center font-bold cursor-pointer"
                title="Increase available bed"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Ventilators Card */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-slate-600">
                Ventilators
              </span>
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-800">
                Respiratory
              </span>
            </div>
            <div className="flex items-baseline gap-2 my-2.5">
              <span className="text-3xl font-bold text-slate-900">
                {hospital.resources.ventilators.available}
              </span>
              <span className="text-xs text-slate-500">
                / {hospital.resources.ventilators.total} Total Units
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100">
            <span className="text-xs text-slate-500 font-medium">Adjust Units:</span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => updateResourceValue('ventilators', 'available', -1)}
                className="w-7 h-7 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center font-bold cursor-pointer"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => updateResourceValue('ventilators', 'available', 1)}
                className="w-7 h-7 rounded-md bg-teal-700 hover:bg-teal-800 text-white flex items-center justify-center font-bold cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Trauma Resuscitation Bays */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-slate-600">
                Trauma Bays
              </span>
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-rose-50 text-rose-800">
                Resuscitation
              </span>
            </div>
            <div className="flex items-baseline gap-2 my-2.5">
              <span className="text-3xl font-bold text-slate-900">
                {hospital.resources.traumaBays.available}
              </span>
              <span className="text-xs text-slate-500">
                / {hospital.resources.traumaBays.total} Open Suites
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100">
            <span className="text-xs text-slate-500 font-medium">Adjust Bays:</span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => updateResourceValue('traumaBays', 'available', -1)}
                className="w-7 h-7 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center font-bold cursor-pointer"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => updateResourceValue('traumaBays', 'available', 1)}
                className="w-7 h-7 rounded-md bg-teal-700 hover:bg-teal-800 text-white flex items-center justify-center font-bold cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Blood Bank Reserves */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-slate-600">
                Blood Bank Units
              </span>
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-rose-50 text-rose-800">
                Transfusion
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 my-2 text-xs">
              <div className="flex items-center justify-between bg-slate-50 p-2 rounded-lg border border-slate-100">
                <span className="font-semibold text-slate-700">O- Neg:</span>
                <span className="font-bold text-slate-900">{hospital.resources.bloodInventory.O_NEG} units</span>
              </div>
              <div className="flex items-center justify-between bg-slate-50 p-2 rounded-lg border border-slate-100">
                <span className="font-semibold text-slate-700">O+ Pos:</span>
                <span className="font-bold text-slate-900">{hospital.resources.bloodInventory.O_POS} units</span>
              </div>
              <div className="flex items-center justify-between bg-slate-50 p-2 rounded-lg border border-slate-100">
                <span className="font-semibold text-slate-700">A+ Pos:</span>
                <span className="font-bold text-slate-900">{hospital.resources.bloodInventory.A_POS} units</span>
              </div>
              <div className="flex items-center justify-between bg-slate-50 p-2 rounded-lg border border-slate-100">
                <span className="font-semibold text-slate-700">A- Neg:</span>
                <span className="font-bold text-slate-900">{hospital.resources.bloodInventory.A_NEG} units</span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-100">
            <span className="text-slate-500 font-medium">Universal O-:</span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => updateBloodValue('O_NEG', -1)}
                className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center font-bold cursor-pointer"
              >
                -
              </button>
              <button
                onClick={() => updateBloodValue('O_NEG', 1)}
                className="w-6 h-6 rounded bg-teal-700 hover:bg-teal-800 text-white flex items-center justify-center font-bold cursor-pointer"
              >
                +
              </button>
            </div>
          </div>
        </div>

      </div>

      {/* Incoming Patient Requests Queue */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-xs">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
          <div>
            <h3 className="font-semibold text-base text-slate-900 flex items-center gap-2">
              <span>Incoming Emergency Placement Requests</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-medium">
                {incomingRequests.length}
              </span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Awaiting ward confirmation or diversion to regional partner facilities
            </p>
          </div>
        </div>

        {incomingRequests.length === 0 ? (
          <div className="text-center py-7 text-slate-500 text-xs bg-slate-50/70 rounded-xl border border-slate-100">
            No incoming emergency requests currently pending review at {hospital.name}.
          </div>
        ) : (
          <div className="space-y-3">
            {incomingRequests.map((req) => (
              <div
                key={req.id}
                className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs"
              >
                <div>
                  <div className="flex items-center gap-2.5">
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-rose-50 text-rose-800 border border-rose-200">
                      {req.urgency.replace('_', ' ')}
                    </span>
                    <span className="font-semibold text-sm text-slate-900">{req.patientName}</span>
                    <span className="text-xs text-slate-500">
                      ({req.patientAge}y, {req.patientGender})
                    </span>
                  </div>
                  <p className="text-xs text-slate-700 mt-1.5 font-medium">{req.condition}</p>
                  <div className="flex items-center gap-3 text-xs text-slate-500 mt-2">
                    <span>📍 {req.location.address}</span>
                    <span className="text-slate-300">·</span>
                    <span className="font-medium text-teal-800">
                      Required: {req.requiredResources.icuBed ? `${req.requiredResources.icuBedCount} ICU Bed ` : ''}
                      {req.requiredResources.ventilator ? `· ${req.requiredResources.ventilatorCount} Vent ` : ''}
                      {req.requiredResources.traumaFacility ? '· Trauma Bay ' : ''}
                      {req.requiredResources.bloodType !== 'NONE' ? `· Blood ${req.requiredResources.bloodType}` : ''}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 shrink-0">
                  <button
                    onClick={() => onAcceptEmergency(req.id)}
                    className="py-2 px-4 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-medium text-xs flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Accept & Reserve Bed</span>
                  </button>

                  <button
                    onClick={() => setRejectingEmergencyId(req.id)}
                    className="py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-xs flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <XCircle className="w-4 h-4 text-slate-500" />
                    <span>Divert / Re-route</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Active En Route & Patient Handover Workflow */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-xs">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
          <div>
            <h3 className="font-semibold text-base text-slate-900 flex items-center gap-2">
              <Truck className="w-4 h-4 text-teal-700" />
              <span>Inbound Ambulances & Clinical Handover Process</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Assignment ➔ En Route ➔ Arrival Confirmation ➔ Inpatient Admission Handover
            </p>
          </div>
        </div>

        {activePatients.length === 0 ? (
          <div className="text-center py-7 text-slate-500 text-xs bg-slate-50/70 rounded-xl border border-slate-100">
            No inbound ambulance units currently en route to {hospital.name}.
          </div>
        ) : (
          <div className="space-y-3">
            {activePatients.map((patient) => {
              const amb = ambulances.find((a) => a.id === patient.assignedAmbulanceId);
              const isArrived = patient.status === 'ARRIVED_AT_ER';

              return (
                <div
                  key={patient.id}
                  className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs"
                >
                  <div>
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          isArrived
                            ? 'bg-amber-50 text-amber-800 border border-amber-200'
                            : 'bg-teal-50 text-teal-800 border border-teal-200'
                        }`}
                      >
                        {isArrived ? 'Arrived at ER Bay' : 'En Route (ETA ~12 min)'}
                      </span>
                      <span className="font-semibold text-sm text-slate-900">{patient.patientName}</span>
                      <span className="text-xs text-slate-500">
                        {amb?.unitCode || 'Medic Unit'}
                      </span>
                    </div>

                    <p className="text-xs text-slate-600 mt-1">{patient.condition}</p>
                    
                    {/* Stepper progress indicator */}
                    <div className="flex items-center gap-2 mt-2.5 text-xs text-slate-500">
                      <span className="text-teal-700 font-medium">1. Bed Reserved ✓</span>
                      <span className="text-slate-300">➔</span>
                      <span className={isArrived ? 'text-teal-700 font-medium' : 'text-slate-800 font-semibold'}>
                        2. En Route
                      </span>
                      <span className="text-slate-300">➔</span>
                      <span className={isArrived ? 'text-amber-800 font-semibold' : 'text-slate-400'}>
                        3. Arrived at Bay
                      </span>
                      <span className="text-slate-300">➔</span>
                      <span className="text-slate-400">4. Handover & Admit</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {!isArrived ? (
                      <button
                        onClick={() => onMarkArrived(patient.id)}
                        className="py-2 px-3.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-medium text-xs flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                      >
                        <span>Confirm Patient Arrived at Bay</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => setHandoverModalEmergencyId(patient.id)}
                        className="py-2.5 px-4 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-medium text-xs flex items-center gap-2 shadow-xs transition cursor-pointer"
                      >
                        <UserCheck className="w-4 h-4" />
                        <span>Complete Clinical Handover & Admit</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Divert Modal */}
      {rejectingEmergencyId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 shadow-xl animate-in fade-in">
            <h3 className="text-base font-semibold text-slate-900 mb-1.5 flex items-center gap-2">
              <XCircle className="w-5 h-5 text-rose-600" />
              <span>Divert Patient Placement</span>
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Select reason for diverting. The coordinator system will <strong>instantly suggest the next nearest hospital with capacity</strong> for the dispatcher.
            </p>

            <div className="space-y-2 mb-4">
              {[
                'Trauma Bay & Resuscitation Surge',
                'ICU Bed capacity exhausted',
                'CT Scanner / Imaging hardware failure',
                'Emergency Staffing shortage',
                'Unscheduled trauma diverts active',
              ].map((r) => (
                <label
                  key={r}
                  className={`flex items-center gap-2.5 p-2.5 rounded-lg border text-xs cursor-pointer transition ${
                    rejectionReason === r
                      ? 'bg-rose-50 border-rose-300 text-rose-900 font-medium'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="reason"
                    checked={rejectionReason === r}
                    onChange={() => setRejectionReason(r)}
                  />
                  <span>{r}</span>
                </label>
              ))}
            </div>

            <div className="flex items-center justify-end gap-2.5">
              <button
                onClick={() => setRejectingEmergencyId(null)}
                className="px-3.5 py-1.5 rounded-lg text-xs text-slate-500 hover:text-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onRejectEmergency(rejectingEmergencyId, rejectionReason);
                  setRejectingEmergencyId(null);
                  showToast('Patient diverted. Suggested partner facilities routed to dispatch.');
                }}
                className="px-4 py-2 rounded-xl bg-rose-700 hover:bg-rose-800 text-white font-medium text-xs cursor-pointer shadow-xs"
              >
                Confirm Divert & Route Alternative
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clinical Handover Modal */}
      {handoverModalEmergencyId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 shadow-xl animate-in fade-in">
            <h3 className="text-base font-semibold text-slate-900 mb-1.5 flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-teal-700" />
              <span>Confirm Clinical Handover & Inpatient Admission</span>
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Acknowledge transfer of patient care from the ambulance paramedic crew to hospital inpatient ward.
            </p>

            <div className="space-y-3.5 mb-5">
              <div>
                <label className="text-xs font-medium text-slate-700 block mb-1">
                  Receiving Physician / Charge Nurse
                </label>
                <input
                  type="text"
                  value={handoverPhysician}
                  onChange={(e) => setHandoverPhysician(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-700 block mb-1">
                  Clinical Handover & Triage Notes
                </label>
                <textarea
                  rows={3}
                  value={handoverNotes}
                  onChange={(e) => setHandoverNotes(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5">
              <button
                onClick={() => setHandoverModalEmergencyId(null)}
                className="px-3.5 py-1.5 rounded-lg text-xs text-slate-500 hover:text-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onCompleteHandover(handoverModalEmergencyId, handoverPhysician, handoverNotes);
                  setHandoverModalEmergencyId(null);
                  showToast('Clinical handover complete! Bed occupied.');
                }}
                className="px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-medium text-xs flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>Confirm Handover & Release Ambulance</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
