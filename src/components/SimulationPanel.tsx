import React, { useState } from 'react';
import { Hospital, AuditLog } from '../types';
import { 
  Sparkles, 
  Clock, 
  RotateCcw, 
  X, 
  Check, 
  Bed, 
  Sliders,
  ShieldCheck,
  Building
} from 'lucide-react';
import { api } from '../services/api';

interface SimulationPanelProps {
  isOpen: boolean;
  onClose: () => void;
  hospitals: Hospital[];
  logs: AuditLog[];
  onTriggerRaceCondition: () => void;
  isRaceRunning: boolean;
  onReset: () => void;
}

export const SimulationPanel: React.FC<SimulationPanelProps> = ({
  isOpen,
  onClose,
  hospitals,
  logs,
  onTriggerRaceCondition,
  isRaceRunning,
  onReset,
}) => {
  const [selectedHospitalId, setSelectedHospitalId] = useState<string>(hospitals[0]?.id || '');
  const [isUpdatingFreshness, setIsUpdatingFreshness] = useState<boolean>(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  if (!isOpen) return null;

  const currentHospital = hospitals.find((h) => h.id === selectedHospitalId) || hospitals[0];

  const showToast = (msg: string) => {
    setSuccessToast(msg);
    setTimeout(() => setSuccessToast(null), 3500);
  };

  const handleSetFreshness = async (minutes: number) => {
    if (!currentHospital) return;
    setIsUpdatingFreshness(true);
    try {
      await api.simulateFreshness(currentHospital.id, minutes);
      showToast(`Set ${currentHospital.name} timestamp to ${minutes}m ago!`);
    } catch (e: any) {
      alert(e.message || 'Error');
    } finally {
      setIsUpdatingFreshness(false);
    }
  };

  const handleSetIcuBeds = async (count: number) => {
    if (!currentHospital) return;
    try {
      const updated = { ...currentHospital.resources };
      updated.icuBeds.available = count;
      await api.updateHospitalResources(currentHospital.id, { resources: updated });
      showToast(`Updated ${currentHospital.name} ICU beds available to ${count}`);
    } catch (e: any) {
      alert(e.message || 'Error');
    }
  };

  const handleToggleDivert = async () => {
    if (!currentHospital) return;
    const newStatus = currentHospital.divertStatus === 'ACCEPTING_ALL' ? 'FULL_DIVERT' : 'ACCEPTING_ALL';
    try {
      await api.updateHospitalResources(currentHospital.id, { divertStatus: newStatus });
      showToast(`${currentHospital.name} status: ${newStatus}`);
    } catch (e: any) {
      alert(e.message || 'Error');
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-[460px] bg-white border-l border-slate-200 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
      
      {/* Top Header */}
      <div className="p-5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-teal-100/70 border border-teal-200 flex items-center justify-center text-teal-800">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              Demonstration & Testing Lab
            </h2>
            <p className="text-xs text-slate-500">
              Test double-booking protection, stale data warnings, and re-routing
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-200/60 transition cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Toast Notification */}
      {successToast && (
        <div className="bg-teal-50 border-b border-teal-200 px-4 py-2 text-xs text-teal-800 flex items-center gap-2 animate-in fade-in">
          <Check className="w-4 h-4 text-teal-600" />
          <span>{successToast}</span>
        </div>
      )}

      {/* Main Simulation Tools */}
      <div className="p-5 overflow-y-auto space-y-5 flex-1">
        
        {/* SIMULATION 1: Double-Booking Prevention */}
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 shadow-xs">
          <div className="flex items-center gap-2 text-slate-900 font-semibold text-xs mb-1">
            <ShieldCheck className="w-4 h-4 text-teal-700" />
            <span>Test Double-Booking Prevention</span>
          </div>
          <p className="text-xs text-slate-600 mb-3.5 leading-relaxed">
            Sets <strong>AIIMS Apex Super Speciality Hospital</strong> to exactly <strong>1 ICU bed</strong>, then issues two simultaneous ambulance requests. Proves atomic locking: Ambulance 1 gets confirmed, while Ambulance 2 is prevented from double-booking and automatically re-routed.
          </p>

          <button
            onClick={onTriggerRaceCondition}
            disabled={isRaceRunning}
            className="w-full py-2.5 px-4 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-medium text-xs flex items-center justify-center gap-2 shadow-xs transition cursor-pointer disabled:opacity-50"
          >
            {isRaceRunning ? (
              <>
                <RotateCcw className="w-4 h-4 animate-spin" />
                <span>Simulating Concurrent Requests...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-teal-200" />
                <span>Test Simultaneous Requests (1 Bed Left)</span>
              </>
            )}
          </button>
        </div>

        {/* SIMULATION 2: Stale Data Detection */}
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 shadow-xs">
          <div className="flex items-center gap-2 text-slate-900 font-semibold text-xs mb-1">
            <Clock className="w-4 h-4 text-amber-600" />
            <span>Test Stale Data Warnings</span>
          </div>
          <p className="text-xs text-slate-600 mb-3">
            Change a hospital's last-updated timestamp to observe ranking adjustments and verification badges:
          </p>

          <div className="space-y-3">
            <div>
              <label className="text-[11px] font-medium text-slate-600 block mb-1">
                Select Facility:
              </label>
              <select
                value={selectedHospitalId}
                onChange={(e) => setSelectedHospitalId(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg text-xs p-2 text-slate-800 focus:outline-none focus:border-teal-600 cursor-pointer"
              >
                {hospitals.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name} (ICU: {h.resources.icuBeds.available})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => handleSetFreshness(0)}
                disabled={isUpdatingFreshness}
                className="p-2 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-xs font-medium text-slate-700 text-center transition cursor-pointer shadow-xs"
              >
                Fresh (Now)
              </button>
              <button
                onClick={() => handleSetFreshness(7)}
                disabled={isUpdatingFreshness}
                className="p-2 rounded-lg bg-amber-50 hover:bg-amber-100 border border-amber-200 text-xs font-medium text-amber-900 text-center transition cursor-pointer"
              >
                Aging (7m ago)
              </button>
              <button
                onClick={() => handleSetFreshness(18)}
                disabled={isUpdatingFreshness}
                className="p-2 rounded-lg bg-rose-50 hover:bg-rose-100 border border-rose-200 text-xs font-medium text-rose-900 text-center transition cursor-pointer"
              >
                Stale (18m ago)
              </button>
            </div>
          </div>
        </div>

        {/* SIMULATION 3: Capacity Tweaker */}
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 shadow-xs">
          <div className="flex items-center gap-2 text-slate-900 font-semibold text-xs mb-1">
            <Bed className="w-4 h-4 text-teal-700" />
            <span>Simulate Real-Time Ward Changes</span>
          </div>
          <p className="text-xs text-slate-600 mb-3">
            Change bed numbers to see live updates sync immediately across all connected screens:
          </p>

          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-600">{currentHospital?.name} ICU Beds:</span>
              <span className="font-bold text-teal-800">
                {currentHospital?.resources.icuBeds.available} Available
              </span>
            </div>

            <div className="grid grid-cols-4 gap-1.5">
              <button
                onClick={() => handleSetIcuBeds(0)}
                className="py-1.5 px-2 bg-rose-50 border border-rose-200 hover:bg-rose-100 text-rose-800 rounded text-xs font-medium cursor-pointer"
              >
                ICU = 0 (Full)
              </button>
              <button
                onClick={() => handleSetIcuBeds(1)}
                className="py-1.5 px-2 bg-amber-50 border border-amber-200 hover:bg-amber-100 text-amber-800 rounded text-xs font-medium cursor-pointer"
              >
                ICU = 1
              </button>
              <button
                onClick={() => handleSetIcuBeds(3)}
                className="py-1.5 px-2 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded text-xs font-medium cursor-pointer"
              >
                ICU = 3
              </button>
              <button
                onClick={() => handleSetIcuBeds(6)}
                className="py-1.5 px-2 bg-teal-50 border border-teal-200 hover:bg-teal-100 text-teal-800 rounded text-xs font-medium cursor-pointer"
              >
                ICU = 6
              </button>
            </div>

            <div className="pt-2 border-t border-slate-200">
              <button
                onClick={handleToggleDivert}
                className={`w-full py-2 px-3 rounded-lg text-xs font-medium border transition cursor-pointer ${
                  currentHospital?.divertStatus === 'FULL_DIVERT'
                    ? 'bg-rose-50 border-rose-300 text-rose-800 hover:bg-rose-100'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                {currentHospital?.divertStatus === 'FULL_DIVERT'
                  ? 'Facility is on Divert (Click to restore)'
                  : 'Toggle Hospital Divert Status'}
              </button>
            </div>
          </div>
        </div>

        {/* Global Reset */}
        <div className="pt-2">
          <button
            onClick={() => {
              onReset();
              showToast('System state restored to baseline!');
            }}
            className="w-full py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium flex items-center justify-center gap-2 transition cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Reset Demo Baseline</span>
          </button>
        </div>

      </div>

      {/* Footer */}
      <div className="p-3 bg-slate-50 border-t border-slate-200 text-center text-[11px] text-slate-500">
        CareFlow EMS Coordinator Lab
      </div>
    </div>
  );
};
