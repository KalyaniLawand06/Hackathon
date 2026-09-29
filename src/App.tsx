import React, { useState, useEffect, useCallback } from 'react';
import { 
  ServerState, 
  User, 
  Hospital, 
  EmergencyRequest, 
  Ambulance, 
  HospitalRanking, 
  AuditLog 
} from './types';
import { DEMO_USERS, INITIAL_HOSPITALS, INITIAL_AMBULANCES } from './data/mockData';
import { api } from './services/api';
import { wsClient } from './services/websocket';
import { rankHospitals } from './services/rankingEngine';
import { Header } from './components/Header';
import { DispatcherDashboard } from './components/DispatcherDashboard';
import { HospitalStaffPortal } from './components/HospitalStaffPortal';
import { SimulationPanel } from './components/SimulationPanel';
import { AlternativeHospitalModal } from './components/AlternativeHospitalModal';
import { AuditLogView } from './components/AuditLogView';
import { AlertCircle, CheckCircle2, HeartPulse, Sparkles } from 'lucide-react';

export default function App() {
  // State
  const [currentUser, setCurrentUser] = useState<User>(DEMO_USERS[0]);
  const [users] = useState<User[]>(DEMO_USERS);
  const [hospitals, setHospitals] = useState<Hospital[]>(INITIAL_HOSPITALS);
  const [emergencies, setEmergencies] = useState<EmergencyRequest[]>([]);
  const [ambulances, setAmbulances] = useState<Ambulance[]>(INITIAL_AMBULANCES);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [activeSocketsCount, setActiveSocketsCount] = useState<number>(1);
  const [wsConnected, setWsConnected] = useState<boolean>(false);

  // Selected Hospital ID for Hospital Staff view
  const [selectedHospitalId, setSelectedHospitalId] = useState<string>(
    INITIAL_HOSPITALS[0].id
  );

  // Modals & Drawers
  const [isSimulationOpen, setIsSimulationOpen] = useState<boolean>(false);
  const [isRaceRunning, setIsRaceRunning] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Alternative Hospital Modal State (Key Differentiator)
  const [isAlternativeModalOpen, setIsAlternativeModalOpen] = useState<boolean>(false);
  const [alternativeTargetEmergency, setAlternativeTargetEmergency] = useState<EmergencyRequest | null>(null);
  const [alternativeRankings, setAlternativeRankings] = useState<HospitalRanking[]>([]);

  // Banner Toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'warn' | 'error' | 'info' } | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'warn' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast((prev) => (prev?.message === message ? null : prev));
    }, 4500);
  }, []);

  // Fetch Initial State from Server
  const loadInitialState = useCallback(async () => {
    try {
      const data = await api.getState();
      setHospitals(data.hospitals);
      setEmergencies(data.emergencies);
      setAmbulances(data.ambulances);
      setLogs(data.logs);
      setActiveSocketsCount(data.activeUsersCount || 1);
    } catch (err) {
      console.warn('Initial fetch error, waiting for WebSocket sync', err);
    }
  }, []);

  useEffect(() => {
    loadInitialState();

    // Connect WebSocket
    wsClient.connect();

    // Subscribe to real-time full state broadcasts
    const unsubscribe = wsClient.subscribe((state: ServerState, eventType: string) => {
      setHospitals(state.hospitals);
      setEmergencies(state.emergencies);
      setAmbulances(state.ambulances);
      setLogs(state.logs);
      setActiveSocketsCount(state.activeUsersCount || 1);
      setWsConnected(true);

      if (eventType === 'DOUBLE_BOOKING_PREVENTED') {
        showToast('Facility bed reserved by concurrent request. Alternate facilities prepared.', 'warn');
      } else if (eventType === 'RESERVATION_CONFIRMED') {
        showToast('Resource reserved and ambulance assigned successfully.', 'success');
      } else if (eventType === 'HOSPITAL_REJECTED') {
        showToast('Hospital staff diverted request. Alternate hospitals automatically ranked.', 'info');
      }
    });

    const statusInterval = setInterval(() => {
      setWsConnected(wsClient.isConnected);
    }, 2000);

    return () => {
      unsubscribe();
      clearInterval(statusInterval);
      wsClient.disconnect();
    };
  }, [loadInitialState, showToast]);

  // Create Emergency Request Handler
  const handleCreateEmergency = async (payload: any): Promise<EmergencyRequest> => {
    setIsSubmitting(true);
    try {
      const res = await api.createEmergency(payload);
      showToast(`Placement created for ${res.emergency.patientName}. Hospital matching ready.`, 'success');
      return res.emergency;
    } catch (err: any) {
      showToast(err.message || 'Failed to create emergency request', 'error');
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  };

  // Reserve Hospital with Concurrency Lock & Double-Booking / Re-route handling
  const handleReserveHospital = async (
    emergencyId: string,
    hospitalId: string,
    ambulanceId?: string
  ) => {
    setIsSubmitting(true);
    try {
      const res = await api.reserveHospital(emergencyId, hospitalId, ambulanceId);
      
      if (res.success) {
        showToast(`Bed successfully reserved at ${res.hospital?.name}. Ambulance en route.`, 'success');
        setIsAlternativeModalOpen(false);
      } else {
        // Double-booking blocked or hospital rejected!
        const emg = emergencies.find((e) => e.id === emergencyId) || null;
        if (emg) {
          const excluded = [hospitalId, ...(emg.previousRejections?.map((r) => r.hospitalId) || [])];
          const alternatives = res.alternatives || rankHospitals(
            hospitals,
            emg.requiredResources,
            emg.location,
            emg.urgency,
            excluded
          );
          setAlternativeTargetEmergency(emg);
          setAlternativeRankings(alternatives);
          setIsAlternativeModalOpen(true);
        }

        showToast(
          res.message || 'Facility capacity full. Alternate hospital options suggested.',
          'warn'
        );
      }
    } catch (err: any) {
      showToast(err.message || 'Reservation request error', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Dispatch to Alternative Hospital
  const handleSelectAlternativeHospital = async (altHospitalId: string) => {
    if (!alternativeTargetEmergency) return;
    await handleReserveHospital(alternativeTargetEmergency.id, altHospitalId);
  };

  // Hospital Staff Acceptance
  const handleAcceptEmergency = async (emergencyId: string) => {
    await handleReserveHospital(emergencyId, selectedHospitalId);
  };

  // Hospital Staff Manual Rejection
  const handleRejectEmergency = async (emergencyId: string, reason: string) => {
    try {
      const res = await api.rejectEmergency(emergencyId, selectedHospitalId, reason);
      showToast(`Patient diverted (${reason}). Alternative care options automatically routed.`, 'info');
      
      // Auto pop up alternative suggestion if dispatcher is looking at it
      setAlternativeTargetEmergency(res.emergency);
      setAlternativeRankings(res.alternatives);
      setIsAlternativeModalOpen(true);
    } catch (err: any) {
      showToast(err.message || 'Failed to divert emergency', 'error');
    }
  };

  // Clinical Handover Stage 1: Arrived
  const handleMarkArrived = async (emergencyId: string) => {
    try {
      await api.markPatientArrived(emergencyId);
      showToast('Patient arrived at emergency bay.', 'info');
    } catch (err: any) {
      showToast(err.message || 'Error marking arrival', 'error');
    }
  };

  // Clinical Handover Stage 2: Complete & Admit
  const handleCompleteHandover = async (emergencyId: string, receivingStaff: string, notes: string) => {
    try {
      await api.completeHandover(emergencyId, receivingStaff, notes);
      showToast('Clinical handover complete. Patient admitted, ambulance returned to service.', 'success');
    } catch (err: any) {
      showToast(err.message || 'Error completing handover', 'error');
    }
  };

  // Simulation Race Condition: Test Double-Booking Prevention
  const handleTriggerRaceCondition = async () => {
    setIsRaceRunning(true);
    try {
      const res = await api.simulateRaceCondition();
      showToast(
        'Simultaneous requests tested: 1 bed reserved, 2nd request prevented double-booking and re-routed.',
        'info'
      );
      // Open alternative hospital modal for the losing request
      const loserResult = res.results.find((r: any) => !r.winner);
      if (loserResult) {
        const loserEmg = emergencies.find((e) => e.id === loserResult.emgId);
        if (loserEmg) {
          const alts = rankHospitals(
            hospitals,
            loserEmg.requiredResources,
            loserEmg.location,
            loserEmg.urgency,
            [res.hospitalState.id]
          );
          setAlternativeTargetEmergency(loserEmg);
          setAlternativeRankings(alts);
          setIsAlternativeModalOpen(true);
        }
      }
    } catch (err: any) {
      showToast(err.message || 'Test failed', 'error');
    } finally {
      setIsRaceRunning(false);
    }
  };

  // Simulation Reset
  const handleResetSimulation = async () => {
    try {
      await api.resetSimulation();
      showToast('System state restored to baseline demonstration.', 'info');
    } catch (err: any) {
      showToast(err.message || 'Reset failed', 'error');
    }
  };

  // Count stale hospitals for header alert
  const now = Date.now();
  const activeStaleCount = hospitals.filter((h) => {
    const elapsed = Math.floor((now - new Date(h.lastUpdatedAt).getTime()) / 1000);
    return elapsed > 600; // > 10 minutes
  }).length;

  const currentHospital = hospitals.find((h) => h.id === selectedHospitalId) || hospitals[0];

  return (
    <div className="min-h-screen bg-hospital-canvas text-hospital-text flex flex-col font-sans selection:bg-calmTeal-100 selection:text-calmTeal-900">
      
      {/* Top Header */}
      <Header
        currentUser={currentUser}
        onSwitchUser={(user) => {
          setCurrentUser(user);
          if (user.hospitalId) {
            setSelectedHospitalId(user.hospitalId);
          }
        }}
        users={users}
        hospitals={hospitals}
        selectedHospitalId={selectedHospitalId}
        onSelectHospitalId={setSelectedHospitalId}
        activeSocketsCount={activeSocketsCount}
        wsConnected={wsConnected}
        onToggleSimulation={() => setIsSimulationOpen(!isSimulationOpen)}
        isSimulationOpen={isSimulationOpen}
        onResetSimulation={handleResetSimulation}
        activeStaleCount={activeStaleCount}
      />

      {/* Floating System Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl border shadow-lg flex items-center gap-3 text-xs max-w-md animate-in slide-in-from-bottom duration-150 ${
            toast.type === 'error'
              ? 'bg-white border-rose-200 text-rose-900 shadow-rose-900/5'
              : toast.type === 'warn'
              ? 'bg-white border-amber-200 text-amber-900 shadow-amber-900/5'
              : toast.type === 'success'
              ? 'bg-white border-teal-200 text-teal-900 shadow-teal-900/5'
              : 'bg-white border-slate-200 text-slate-800'
          }`}
        >
          {toast.type === 'error' && <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />}
          {toast.type === 'warn' && <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />}
          {toast.type === 'success' && <CheckCircle2 className="w-5 h-5 text-teal-600 shrink-0" />}
          {toast.type === 'info' && <HeartPulse className="w-5 h-5 text-teal-700 shrink-0" />}
          <span className="font-medium">{toast.message}</span>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        
        {/* DISPATCHER PORTAL */}
        {currentUser.role === 'DISPATCHER' && (
          <DispatcherDashboard
            hospitals={hospitals}
            emergencies={emergencies}
            ambulances={ambulances}
            onCreateEmergency={handleCreateEmergency}
            onReserveHospital={handleReserveHospital}
            onOpenAlternatives={(emg, alts) => {
              setAlternativeTargetEmergency(emg);
              setAlternativeRankings(alts);
              setIsAlternativeModalOpen(true);
            }}
            isSubmitting={isSubmitting}
          />
        )}

        {/* HOSPITAL STAFF PORTAL */}
        {currentUser.role === 'HOSPITAL_STAFF' && (
          <HospitalStaffPortal
            hospital={currentHospital}
            emergencies={emergencies}
            ambulances={ambulances}
            onUpdateHospitalResources={async (hId, res) => {
              await api.updateHospitalResources(hId, { resources: res });
            }}
            onRefreshAvailabilityTimestamp={async (hId) => {
              await api.updateHospitalResources(hId, { lastUpdatedAt: new Date().toISOString() });
            }}
            onAcceptEmergency={handleAcceptEmergency}
            onRejectEmergency={handleRejectEmergency}
            onMarkArrived={handleMarkArrived}
            onCompleteHandover={handleCompleteHandover}
          />
        )}

        {/* ADMIN & AUDIT LAB */}
        {currentUser.role === 'ADMIN' && (
          <div className="space-y-6">
            <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-teal-700" />
                  Regional Emergency Command & Care Coordination
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Monitor live atomic transactions, double-booking prevention events, and audit logs.
                </p>
              </div>
              <button
                onClick={() => setIsSimulationOpen(true)}
                className="px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-medium text-xs flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Open Simulation Tools</span>
              </button>
            </div>

            <AuditLogView logs={logs} />
          </div>
        )}

        {/* Activity log at bottom */}
        {currentUser.role !== 'ADMIN' && (
          <div className="pt-2">
            <AuditLogView logs={logs.slice(0, 10)} />
          </div>
        )}

      </main>

      {/* Alternative Hospital Modal (Automatic Re-Ranking & Suggestion - Key Differentiator) */}
      <AlternativeHospitalModal
        isOpen={isAlternativeModalOpen}
        onClose={() => setIsAlternativeModalOpen(false)}
        emergency={alternativeTargetEmergency}
        alternatives={alternativeRankings}
        onSelectAlternative={handleSelectAlternativeHospital}
        isSubmitting={isSubmitting}
      />

      {/* Admin / Simulation Controls Dock */}
      <SimulationPanel
        isOpen={isSimulationOpen}
        onClose={() => setIsSimulationOpen(false)}
        hospitals={hospitals}
        logs={logs}
        onTriggerRaceCondition={handleTriggerRaceCondition}
        isRaceRunning={isRaceRunning}
        onReset={handleResetSimulation}
      />

    </div>
  );
}
