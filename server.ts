import express, { Request, Response } from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { 
  Hospital, 
  HospitalResources,
  EmergencyRequest, 
  Ambulance, 
  AuditLog, 
  ServerState, 
  User 
} from './src/types/index.ts';
import { 
  INITIAL_HOSPITALS, 
  INITIAL_AMBULANCES, 
  INITIAL_EMERGENCIES, 
  DEMO_USERS 
} from './src/data/mockData.ts';
import { rankHospitals } from './src/services/rankingEngine.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Mutex / Concurrency Lock helper for atomic reservation operations
class AsyncLock {
  private queue: Array<() => void> = [];
  private locked: boolean = false;

  async acquire(): Promise<() => void> {
    return new Promise((resolve) => {
      const run = () => {
        this.locked = true;
        resolve(() => {
          this.locked = false;
          const next = this.queue.shift();
          if (next) next();
        });
      };

      if (!this.locked) {
        run();
      } else {
        this.queue.push(run);
      }
    });
  }
}

const reservationLock = new AsyncLock();

// Authoritative In-Memory State
const state: ServerState = {
  hospitals: JSON.parse(JSON.stringify(INITIAL_HOSPITALS)),
  emergencies: JSON.parse(JSON.stringify(INITIAL_EMERGENCIES)),
  ambulances: JSON.parse(JSON.stringify(INITIAL_AMBULANCES)),
  logs: [
    {
      id: `log-init-1`,
      timestamp: new Date().toISOString(),
      action: 'SYSTEM_BOOT',
      category: 'SYSTEM',
      actor: 'Regional EMS Dispatch System',
      details: 'System initialized. 5 hospitals, 5 ALS/MICU units online. Live WebSocket server ready.',
      level: 'info',
    },
  ],
  activeUsersCount: 0,
  simulationConfig: {
    autoRejectHospitalId: null,
    networkDelayMs: 0,
  },
};

function addLog(action: string, category: AuditLog['category'], actor: string, details: string, level: AuditLog['level'] = 'info') {
  const log: AuditLog = {
    id: `log-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    timestamp: new Date().toISOString(),
    action,
    category,
    actor,
    details,
    level,
  };
  state.logs.unshift(log);
  if (state.logs.length > 80) state.logs.pop();
  return log;
}

async function startServer() {
  const app = express();
  const server = http.createServer(app);

  app.use(express.json());

  // WebSocket Server
  const wss = new WebSocketServer({ server });
  const clients = new Set<WebSocket>();

  function broadcast(type: string, data: any) {
    const payload = JSON.stringify({ type, data, timestamp: new Date().toISOString() });
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }

  function broadcastFullState(reason: string = 'STATE_SYNC') {
    broadcast('FULL_STATE', {
      hospitals: state.hospitals,
      emergencies: state.emergencies,
      ambulances: state.ambulances,
      logs: state.logs,
      activeUsersCount: clients.size,
      reason,
    });
  }

  wss.on('connection', (ws) => {
    clients.add(ws);
    state.activeUsersCount = clients.size;

    // Send immediate initial state
    ws.send(
      JSON.stringify({
        type: 'FULL_STATE',
        data: {
          hospitals: state.hospitals,
          emergencies: state.emergencies,
          ambulances: state.ambulances,
          logs: state.logs,
          activeUsersCount: clients.size,
          reason: 'INITIAL_CONNECTION',
        },
      })
    );

    ws.on('message', (message) => {
      try {
        const parsed = JSON.parse(message.toString());
        if (parsed.type === 'PING') {
          ws.send(JSON.stringify({ type: 'PONG', timestamp: Date.now() }));
        }
      } catch (e) {
        // ignore invalid ping
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
      state.activeUsersCount = clients.size;
    });
  });

  // REST API Routes

  // Auth / Login
  app.post('/api/auth/login', (req: Request, res: Response) => {
    const { username } = req.body;
    const user = DEMO_USERS.find((u) => u.username.toLowerCase() === (username || '').toLowerCase());
    if (user) {
      return res.json({ success: true, user });
    }
    // Fallback: create dynamic dispatcher user
    const newUser: User = {
      id: `user-${Date.now()}`,
      username: username || 'dispatcher',
      name: username ? `Officer ${username}` : 'EMS Field Commander',
      role: 'DISPATCHER',
      token: `jwt_${Date.now()}_token`,
    };
    res.json({ success: true, user: newUser });
  });

  app.get('/api/users/demo', (_req: Request, res: Response) => {
    res.json({ users: DEMO_USERS });
  });

  // Get current system state
  app.get('/api/state', (_req: Request, res: Response) => {
    res.json({
      hospitals: state.hospitals,
      emergencies: state.emergencies,
      ambulances: state.ambulances,
      logs: state.logs,
      activeUsersCount: clients.size,
    });
  });

  // Create new emergency request
  app.post('/api/emergencies', (req: Request, res: Response) => {
    const {
      patientName,
      patientAge,
      patientGender,
      condition,
      urgency,
      location,
      requiredResources,
    } = req.body;

    const newEmergency: EmergencyRequest = {
      id: `emg-${Date.now()}`,
      patientName: patientName || 'Unidentified Patient',
      patientAge: Number(patientAge) || 45,
      patientGender: patientGender || 'M',
      condition: condition || 'Medical Emergency - Triage pending',
      urgency: urgency || 'URGENT_CODE_YELLOW',
      location: location || { address: 'Market St & 4th St', lat: 37.7858, lng: -122.4065 },
      requiredResources: requiredResources || {
        icuBed: true,
        icuBedCount: 1,
        ventilator: false,
        ventilatorCount: 0,
        traumaFacility: false,
        bloodType: 'NONE',
        bloodUnits: 0,
      },
      status: 'PENDING_MATCH',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    state.emergencies.unshift(newEmergency);

    addLog(
      'EMERGENCY_CREATED',
      'RESERVATION',
      'Dispatcher',
      `New ${newEmergency.urgency} incident for ${newEmergency.patientName} (${newEmergency.patientAge}y). Requested: ${newEmergency.requiredResources.icuBed ? 'ICU Bed' : ''} ${newEmergency.requiredResources.ventilator ? 'Ventilator' : ''}`,
      'info'
    );

    broadcastFullState('EMERGENCY_CREATED');
    res.status(201).json({ success: true, emergency: newEmergency });
  });

  // Hospital Rankings Endpoint
  app.post('/api/ranking', (req: Request, res: Response) => {
    const { requirements, location, urgency, excludedHospitalIds } = req.body;
    const rankings = rankHospitals(
      state.hospitals,
      requirements,
      location,
      urgency,
      excludedHospitalIds || []
    );
    res.json({ rankings });
  });

  // ATOMIC RESERVATION with Concurrency / Double-Booking Protection
  app.post('/api/emergencies/:id/reserve', async (req: Request, res: Response) => {
    const emergencyId = req.params.id;
    const { hospitalId, ambulanceId } = req.body;

    // Acquire atomic concurrency lock
    const releaseLock = await reservationLock.acquire();

    try {
      const emergency = state.emergencies.find((e) => e.id === emergencyId);
      if (!emergency) {
        releaseLock();
        return res.status(404).json({ success: false, message: 'Emergency not found' });
      }

      const hospital = state.hospitals.find((h) => h.id === hospitalId);
      if (!hospital) {
        releaseLock();
        return res.status(404).json({ success: false, message: 'Hospital not found' });
      }

      // Check if auto-reject is enabled for this hospital in simulation
      if (state.simulationConfig.autoRejectHospitalId === hospitalId) {
        emergency.status = 'REJECTED_AUTO_ALTERNATIVES';
        emergency.rejectionReason = 'Hospital ER saturated / Trauma Surge diversion';
        emergency.previousRejections = emergency.previousRejections || [];
        emergency.previousRejections.push({
          hospitalId: hospital.id,
          hospitalName: hospital.name,
          reason: emergency.rejectionReason,
          timestamp: new Date().toISOString(),
        });

        // Compute instant alternatives
        const excluded = emergency.previousRejections.map((r) => r.hospitalId);
        const alternatives = rankHospitals(
          state.hospitals,
          emergency.requiredResources,
          emergency.location,
          emergency.urgency,
          excluded
        );

        addLog(
          'RESERVATION_REJECTED',
          'RE_RANK',
          hospital.name,
          `Request for ${emergency.patientName} REJECTED due to Trauma Surge. Automatically re-ranking alternatives!`,
          'warn'
        );

        broadcastFullState('RESERVATION_REJECTED');
        releaseLock();
        return res.status(409).json({
          success: false,
          code: 'HOSPITAL_REJECTED',
          message: `${hospital.name} rejected the reservation. Suggested alternatives available.`,
          alternatives,
        });
      }

      // Check Resource Constraints ATOMICALLY
      const reqs = emergency.requiredResources;
      const icuNeeded = reqs.icuBed ? (reqs.icuBedCount || 1) : 0;
      const ventNeeded = reqs.ventilator ? (reqs.ventilatorCount || 1) : 0;
      const traumaNeeded = reqs.traumaFacility ? 1 : 0;
      const bloodNeeded = (reqs.bloodType && reqs.bloodType !== 'NONE') ? (reqs.bloodUnits || 0) : 0;

      let shortage = false;
      const shortageReasons: string[] = [];

      if (icuNeeded > 0 && hospital.resources.icuBeds.available < icuNeeded) {
        shortage = true;
        shortageReasons.push(`ICU Beds available: ${hospital.resources.icuBeds.available}, needed: ${icuNeeded}`);
      }

      if (ventNeeded > 0 && hospital.resources.ventilators.available < ventNeeded) {
        shortage = true;
        shortageReasons.push(`Ventilators available: ${hospital.resources.ventilators.available}, needed: ${ventNeeded}`);
      }

      if (traumaNeeded > 0 && hospital.resources.traumaBays.available < 1) {
        shortage = true;
        shortageReasons.push(`No Trauma Bay available`);
      }

      if (bloodNeeded > 0 && reqs.bloodType !== 'NONE') {
        const bloodKey = reqs.bloodType as 'O_NEG' | 'O_POS' | 'A_POS' | 'A_NEG' | 'B_POS' | 'B_NEG' | 'AB_POS' | 'AB_NEG';
        if ((hospital.resources.bloodInventory[bloodKey] || 0) < bloodNeeded) {
          shortage = true;
          shortageReasons.push(`Blood ${reqs.bloodType} units insufficient`);
        }
      }

      if (hospital.divertStatus === 'FULL_DIVERT') {
        shortage = true;
        shortageReasons.push('Hospital is on FULL DIVERT');
      }

      // If shortage: ATOMIC DOUBLE-BOOKING PREVENTION TRIGGERED!
      if (shortage) {
        emergency.status = 'REJECTED_AUTO_ALTERNATIVES';
        emergency.rejectionReason = `Capacity Exhausted / Contended: ${shortageReasons.join(', ')}`;
        emergency.previousRejections = emergency.previousRejections || [];
        emergency.previousRejections.push({
          hospitalId: hospital.id,
          hospitalName: hospital.name,
          reason: emergency.rejectionReason,
          timestamp: new Date().toISOString(),
        });

        const excluded = emergency.previousRejections.map((r) => r.hospitalId);
        const alternatives = rankHospitals(
          state.hospitals,
          emergency.requiredResources,
          emergency.location,
          emergency.urgency,
          excluded
        );

        addLog(
          'DOUBLE_BOOKING_PREVENTED',
          'DOUBLE_BOOKING',
          'Atomic Concurrency Engine',
          `DOUBLE-BOOKING PREVENTED at ${hospital.name}! Resource contention detected for ${emergency.patientName}. Auto re-ranked ${alternatives.length} alternatives.`,
          'error'
        );

        broadcastFullState('DOUBLE_BOOKING_PREVENTED');
        releaseLock();

        return res.status(409).json({
          success: false,
          code: 'DOUBLE_BOOKING_PREVENTED',
          message: `Double-booking prevented: ${hospital.name} has no remaining capacity for requested resources.`,
          reasons: shortageReasons,
          alternatives,
        });
      }

      // Atomic Deductions
      if (icuNeeded > 0) hospital.resources.icuBeds.available -= icuNeeded;
      if (ventNeeded > 0) hospital.resources.ventilators.available -= ventNeeded;
      if (traumaNeeded > 0) hospital.resources.traumaBays.available -= 1;
      if (bloodNeeded > 0 && reqs.bloodType !== 'NONE') {
        const bloodKey = reqs.bloodType as 'O_NEG' | 'O_POS' | 'A_POS' | 'A_NEG' | 'B_POS' | 'B_NEG' | 'AB_POS' | 'AB_NEG';
        hospital.resources.bloodInventory[bloodKey] -= bloodNeeded;
      }
      
      hospital.lastUpdatedAt = new Date().toISOString();

      // Find or assign ambulance
      let assignedAmb = state.ambulances.find((a) => a.id === ambulanceId);
      if (!assignedAmb || assignedAmb.status !== 'AVAILABLE') {
        assignedAmb = state.ambulances.find((a) => a.status === 'AVAILABLE') || state.ambulances[0];
      }

      if (assignedAmb) {
        assignedAmb.status = 'EN_ROUTE_HOSPITAL';
        assignedAmb.assignedEmergencyId = emergency.id;
        assignedAmb.targetHospitalId = hospital.id;
        assignedAmb.etaMinutes = 14;
      }

      emergency.status = 'CONFIRMED';
      emergency.targetHospitalId = hospital.id;
      emergency.assignedAmbulanceId = assignedAmb?.id;
      emergency.updatedAt = new Date().toISOString();

      addLog(
        'RESERVATION_CONFIRMED',
        'RESERVATION',
        'Atomic Concurrency Engine',
        `✅ RESERVATION LOCKED: 1 ICU Bed reserved at ${hospital.name} for ${emergency.patientName}. Ambulance ${assignedAmb?.unitCode} assigned.`,
        'success'
      );

      broadcastFullState('RESERVATION_CONFIRMED');
      releaseLock();

      return res.json({
        success: true,
        emergency,
        hospital,
        ambulance: assignedAmb,
      });
    } catch (err: any) {
      releaseLock();
      return res.status(500).json({ success: false, message: err?.message || 'Server error' });
    }
  });

  // Hospital Staff: Reject a reservation request manually
  app.post('/api/emergencies/:id/reject', (req: Request, res: Response) => {
    const { reason, hospitalId } = req.body;
    const emergency = state.emergencies.find((e) => e.id === req.params.id);
    if (!emergency) return res.status(404).json({ success: false, message: 'Emergency not found' });

    const hospital = state.hospitals.find((h) => h.id === hospitalId) || 
      state.hospitals.find((h) => h.id === emergency.targetHospitalId);

    // Rollback resources if was previously confirmed
    if (emergency.status === 'CONFIRMED' && emergency.targetHospitalId) {
      const prevHosp = state.hospitals.find((h) => h.id === emergency.targetHospitalId);
      if (prevHosp) {
        if (emergency.requiredResources.icuBed) prevHosp.resources.icuBeds.available += emergency.requiredResources.icuBedCount || 1;
        if (emergency.requiredResources.ventilator) prevHosp.resources.ventilators.available += emergency.requiredResources.ventilatorCount || 1;
        if (emergency.requiredResources.traumaFacility) prevHosp.resources.traumaBays.available += 1;
        prevHosp.lastUpdatedAt = new Date().toISOString();
      }
    }

    emergency.status = 'REJECTED_AUTO_ALTERNATIVES';
    emergency.rejectionReason = reason || 'ER at maximum surge capacity';
    emergency.previousRejections = emergency.previousRejections || [];
    emergency.previousRejections.push({
      hospitalId: hospital?.id || 'unknown',
      hospitalName: hospital?.name || 'Hospital',
      reason: emergency.rejectionReason || 'Rejected',
      timestamp: new Date().toISOString(),
    });

    const excluded = emergency.previousRejections.map((r) => r.hospitalId);
    const alternatives = rankHospitals(
      state.hospitals,
      emergency.requiredResources,
      emergency.location,
      emergency.urgency,
      excluded
    );

    addLog(
      'HOSPITAL_REJECTED',
      'RE_RANK',
      hospital?.name || 'Hospital Staff',
      `Manual Rejection for ${emergency.patientName} (${emergency.rejectionReason}). Triggering Automatic Alternative Suggestion!`,
      'warn'
    );

    broadcastFullState('HOSPITAL_REJECTED');
    res.json({ success: true, emergency, alternatives });
  });

  // Update Hospital Resources
  app.put('/api/hospitals/:id/resources', (req: Request, res: Response) => {
    const hospital = state.hospitals.find((h) => h.id === req.params.id);
    if (!hospital) return res.status(404).json({ success: false, message: 'Hospital not found' });

    const { resources, divertStatus, lastUpdatedAt } = req.body;
    if (resources) {
      hospital.resources = resources;
    }
    if (divertStatus) {
      hospital.divertStatus = divertStatus;
    }
    hospital.lastUpdatedAt = lastUpdatedAt || new Date().toISOString();

    addLog(
      'RESOURCE_UPDATED',
      'RESOURCE_UPDATE',
      hospital.name,
      `Resources updated: ICU Available=${hospital.resources.icuBeds.available}, Vents=${hospital.resources.ventilators.available}, Divert=${hospital.divertStatus}`,
      'info'
    );

    broadcastFullState('RESOURCE_UPDATED');
    res.json({ success: true, hospital });
  });

  // Handover Workflow Stages:
  // 1. Mark Arrived at ER
  app.post('/api/emergencies/:id/arrived', (req: Request, res: Response) => {
    const emergency = state.emergencies.find((e) => e.id === req.params.id);
    if (!emergency) return res.status(404).json({ success: false, message: 'Emergency not found' });

    emergency.status = 'ARRIVED_AT_ER';
    emergency.updatedAt = new Date().toISOString();

    if (emergency.assignedAmbulanceId) {
      const amb = state.ambulances.find((a) => a.id === emergency.assignedAmbulanceId);
      if (amb) amb.status = 'AT_HOSPITAL';
    }

    addLog(
      'PATIENT_ARRIVED',
      'HANDOVER',
      'Ambulance Crew',
      `Ambulance arrived at ${emergency.targetHospitalId} with patient ${emergency.patientName}. Ready for clinical triage handover.`,
      'info'
    );

    broadcastFullState('PATIENT_ARRIVED');
    res.json({ success: true, emergency });
  });

  // 2. Complete Handover
  app.post('/api/emergencies/:id/handover', (req: Request, res: Response) => {
    const { receivingStaff, handoverNotes } = req.body;
    const emergency = state.emergencies.find((e) => e.id === req.params.id);
    if (!emergency) return res.status(404).json({ success: false, message: 'Emergency not found' });

    emergency.status = 'HANDOVER_COMPLETE';
    emergency.handoverCompletedAt = new Date().toISOString();
    emergency.receivingStaff = receivingStaff || 'Dr. Rajesh K. Sharma (Chief of Critical Care)';
    emergency.handoverNotes = handoverNotes || 'Patient admitted to ICU Bay 3. Vitals stabilized. Handover protocol complete.';
    emergency.updatedAt = new Date().toISOString();

    // Release ambulance back to available fleet
    if (emergency.assignedAmbulanceId) {
      const amb = state.ambulances.find((a) => a.id === emergency.assignedAmbulanceId);
      if (amb) {
        amb.status = 'AVAILABLE';
        amb.assignedEmergencyId = undefined;
        amb.targetHospitalId = undefined;
      }
    }

    addLog(
      'HANDOVER_COMPLETE',
      'HANDOVER',
      emergency.receivingStaff || 'Hospital Staff',
      `Patient ${emergency.patientName} handover complete! Resources occupied. Ambulance returned to active service.`,
      'success'
    );

    broadcastFullState('HANDOVER_COMPLETE');
    res.json({ success: true, emergency });
  });

  // SIMULATION CONTROLS

  // 1. Simultaneous Race Condition Test (Double Booking Prevention Demo)
  app.post('/api/simulate/race-condition', async (_req: Request, res: Response) => {
    // Select Hospital A (AIIMS Apex Super Speciality Hospital)
    const hospital = state.hospitals[0];
    // Force available ICU to exactly 1
    hospital.resources.icuBeds.available = 1;
    hospital.lastUpdatedAt = new Date().toISOString();

    // Create 2 simultaneous emergency requests
    const emg1: EmergencyRequest = {
      id: `emg-race-1-${Date.now()}`,
      patientName: '108 EMS (Patient Suresh Narang, 42y)',
      patientAge: 42,
      patientGender: 'M',
      condition: 'Multi-system blunt trauma from highway collision on DND Expressway',
      urgency: 'CRITICAL_CODE_RED',
      location: { address: 'Delhi-Noida Direct (DND) Flyway Toll Plaza', lat: 28.5780, lng: 77.2880 },
      requiredResources: {
        icuBed: true,
        icuBedCount: 1,
        ventilator: true,
        ventilatorCount: 1,
        traumaFacility: true,
        bloodType: 'NONE',
        bloodUnits: 0,
      },
      status: 'PENDING_MATCH',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const emg2: EmergencyRequest = {
      id: `emg-race-2-${Date.now()}`,
      patientName: 'CATS Unit (Patient Shanti Devi, 68y)',
      patientAge: 68,
      patientGender: 'F',
      condition: 'Post-ROSC refractory ventricular tachycardia, intubated',
      urgency: 'CRITICAL_CODE_RED',
      location: { address: 'Lajpat Nagar Central Market Ring Road', lat: 28.5700, lng: 77.2400 },
      requiredResources: {
        icuBed: true,
        icuBedCount: 1,
        ventilator: true,
        ventilatorCount: 1,
        traumaFacility: false,
        bloodType: 'NONE',
        bloodUnits: 0,
      },
      status: 'PENDING_MATCH',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    state.emergencies.unshift(emg1);
    state.emergencies.unshift(emg2);

    addLog(
      'SIMULATION_RACE_START',
      'DOUBLE_BOOKING',
      'Simulation Controller',
      `⚡ SIMULTANEOUS RACE TRIGGERED: Setting ${hospital.name} ICU Beds = 1. Firing 2 parallel reservation requests at same millisecond!`,
      'warn'
    );

    // Run both reservations simultaneously using Promise.all
    const runReservation = async (emg: EmergencyRequest) => {
      const release = await reservationLock.acquire();
      try {
        const hosp = state.hospitals.find((h) => h.id === hospital.id)!;
        if (hosp.resources.icuBeds.available >= 1) {
          // Winner
          hosp.resources.icuBeds.available -= 1;
          hosp.lastUpdatedAt = new Date().toISOString();
          emg.status = 'CONFIRMED';
          emg.targetHospitalId = hosp.id;
          emg.assignedAmbulanceId = state.ambulances[0]?.id;
          release();
          return { emgId: emg.id, status: 'RESERVED', winner: true };
        } else {
          // Double-booking caught & prevented
          emg.status = 'REJECTED_AUTO_ALTERNATIVES';
          emg.rejectionReason = 'DOUBLE-BOOKING PREVENTED: Resource already claimed by competing ambulance';
          emg.previousRejections = [{
            hospitalId: hosp.id,
            hospitalName: hosp.name,
            reason: emg.rejectionReason,
            timestamp: new Date().toISOString(),
          }];
          release();
          return { emgId: emg.id, status: 'DOUBLE_BOOKING_PREVENTED', winner: false };
        }
      } catch (e) {
        release();
        return { emgId: emg.id, status: 'ERROR', winner: false };
      }
    };

    const results = await Promise.all([runReservation(emg1), runReservation(emg2)]);

    const winner = results.find((r) => r.winner);
    const loser = results.find((r) => !r.winner);

    addLog(
      'SIMULATION_RACE_RESULT',
      'DOUBLE_BOOKING',
      'Atomic Concurrency Engine',
      `🏆 Race outcome: Request ${winner?.emgId.slice(-4)} ✅ RESERVED bed. Request ${loser?.emgId.slice(-4)} ❌ REJECTED (Double-booking blocked). Auto-rerouting loser!`,
      'success'
    );

    broadcastFullState('SIMULATION_RACE_COMPLETED');
    res.json({ success: true, results, hospitalState: hospital });
  });

  // 2. Set Hospital Timestamp (Stale data demo)
  app.post('/api/simulate/hospital-freshness', (req: Request, res: Response) => {
    const { hospitalId, ageMinutes } = req.body;
    const hospital = state.hospitals.find((h) => h.id === hospitalId);
    if (!hospital) return res.status(404).json({ success: false, message: 'Hospital not found' });

    const newTimestamp = new Date(Date.now() - (ageMinutes || 18) * 60 * 1000).toISOString();
    hospital.lastUpdatedAt = newTimestamp;

    addLog(
      'SIMULATION_FRESHNESS',
      'RESOURCE_UPDATE',
      'Simulation Controller',
      `Modified data timestamp for ${hospital.name}: Set to ${ageMinutes} minutes ago (${ageMinutes > 10 ? '🔴 STALE' : ageMinutes >= 5 ? '🟡 AGING' : '🟢 FRESH'}).`,
      ageMinutes > 10 ? 'warn' : 'info'
    );

    broadcastFullState('FRESHNESS_MODIFIED');
    res.json({ success: true, hospital });
  });

  // 3. Reset State to Initial Baseline
  app.post('/api/simulate/reset', (_req: Request, res: Response) => {
    state.hospitals = JSON.parse(JSON.stringify(INITIAL_HOSPITALS));
    state.ambulances = JSON.parse(JSON.stringify(INITIAL_AMBULANCES));
    state.emergencies = JSON.parse(JSON.stringify(INITIAL_EMERGENCIES));
    state.simulationConfig.autoRejectHospitalId = null;

    addLog(
      'SYSTEM_RESET',
      'SYSTEM',
      'Simulation Controller',
      'All hospital beds, ambulances, and emergency requests reset to baseline demonstration state.',
      'info'
    );

    broadcastFullState('SYSTEM_RESET');
    res.json({ success: true, state });
  });

  // Vite Integration in Development / Production
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[Emergency Allocator] Server running at http://0.0.0.0:${PORT}`);
    console.log(`[Emergency Allocator] WebSocket server attached to port ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal error starting server:', err);
  process.exit(1);
});
