import React from 'react';
import { User, Hospital } from '../types';
import { 
  Building2, 
  RefreshCw, 
  Sparkles, 
  AlertCircle,
  Stethoscope,
  HeartHandshake,
  Compass
} from 'lucide-react';

interface HeaderProps {
  currentUser: User;
  onSwitchUser: (user: User) => void;
  users: User[];
  hospitals: Hospital[];
  selectedHospitalId: string;
  onSelectHospitalId: (id: string) => void;
  activeSocketsCount: number;
  wsConnected: boolean;
  onToggleSimulation: () => void;
  isSimulationOpen: boolean;
  onResetSimulation: () => void;
  activeStaleCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  currentUser,
  onSwitchUser,
  users,
  hospitals,
  selectedHospitalId,
  onSelectHospitalId,
  activeSocketsCount,
  wsConnected,
  onToggleSimulation,
  isSimulationOpen,
  onResetSimulation,
  activeStaleCount,
}) => {
  return (
    <header className="bg-white/95 backdrop-blur-md border-b border-slate-200 sticky top-0 z-50 px-4 sm:px-6 py-3 transition-colors shadow-xs">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
        
        {/* Brand & Calm Clinical Identity */}
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-teal-600 via-teal-500 to-emerald-500 flex items-center justify-center shadow-md shadow-teal-900/10 text-white font-semibold">
            <Stethoscope className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold text-slate-900 tracking-tight flex items-center gap-2">
                Emergency Resource Coordinator
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-teal-50 text-teal-800 border border-teal-200/80">
                  HLTH-02 CareFlow
                </span>
              </h1>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
              <span className="flex items-center gap-1.5 font-medium">
                <span
                  className={`w-2 h-2 rounded-full ${
                    wsConnected ? 'bg-emerald-500' : 'bg-amber-400 animate-pulse'
                  }`}
                />
                <span className="text-slate-600 text-[11px]">
                  {wsConnected ? `Live Network Connected (${activeSocketsCount} active)` : 'Connecting to network...'}
                </span>
              </span>
              <span className="text-slate-300">·</span>
              <span className="text-slate-500 text-[11px]">National Emergency Care Network · NCR</span>
              {activeStaleCount > 0 && (
                <>
                  <span className="text-slate-300">·</span>
                  <span className="flex items-center gap-1 text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200 text-[11px] font-medium">
                    <AlertCircle className="w-3 h-3 text-amber-600" />
                    {activeStaleCount} hospital data aging
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Calm Role Switcher & Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Dispatcher Switch */}
          <button
            onClick={() => {
              const disp = users.find((u) => u.role === 'DISPATCHER') || users[0];
              onSwitchUser(disp);
            }}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
              currentUser.role === 'DISPATCHER'
                ? 'bg-teal-700 text-white shadow-sm ring-2 ring-teal-600/20'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
            }`}
          >
            <Compass className="w-3.5 h-3.5" />
            <span>Emergency Dispatch</span>
          </button>

          {/* Hospital Staff Switch */}
          <div className="flex items-center bg-slate-100 rounded-lg p-0.5 border border-slate-200">
            <button
              onClick={() => {
                const hospUser = users.find((u) => u.role === 'HOSPITAL_STAFF') || users[1];
                onSwitchUser(hospUser);
              }}
              className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
                currentUser.role === 'HOSPITAL_STAFF'
                  ? 'bg-white text-teal-800 shadow-sm font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>Hospital Station</span>
            </button>
            {currentUser.role === 'HOSPITAL_STAFF' && (
              <select
                value={selectedHospitalId}
                onChange={(e) => onSelectHospitalId(e.target.value)}
                className="bg-white text-slate-700 text-xs px-2.5 py-1 rounded-md border-l border-slate-200 font-medium focus:outline-none focus:ring-1 focus:ring-teal-500 cursor-pointer"
              >
                {hospitals.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name} ({h.resources.icuBeds.available} ICU available)
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Simulation & Demo Lab */}
          <button
            onClick={onToggleSimulation}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer border ${
              isSimulationOpen
                ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:text-slate-900 shadow-xs'
            }`}
            title="Open Demo & Testing Assistant"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>Testing Lab</span>
          </button>

          {/* Reset Demo Data */}
          <button
            onClick={onResetSimulation}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            title="Reset system state to baseline"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

      </div>
    </header>
  );
};
