import { 
  ServerState, 
  EmergencyRequest, 
  HospitalRanking, 
  ResourceRequirements, 
  UrgencyLevel, 
  Hospital,
  HospitalResources,
  DivertStatus
} from '../types';

export const api = {
  async getState(): Promise<ServerState> {
    const res = await fetch('/api/state');
    if (!res.ok) throw new Error('Failed to fetch state');
    return res.json();
  },

  async createEmergency(payload: {
    patientName: string;
    patientAge: number;
    patientGender: 'M' | 'F' | 'Other';
    condition: string;
    urgency: UrgencyLevel;
    location: { address: string; lat: number; lng: number };
    requiredResources: ResourceRequirements;
  }): Promise<{ success: boolean; emergency: EmergencyRequest }> {
    const res = await fetch('/api/emergencies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Failed to create emergency');
    return res.json();
  },

  async getRankings(
    requirements: ResourceRequirements,
    location: { lat: number; lng: number },
    urgency: UrgencyLevel,
    excludedHospitalIds: string[] = []
  ): Promise<{ rankings: HospitalRanking[] }> {
    const res = await fetch('/api/ranking', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requirements, location, urgency, excludedHospitalIds }),
    });
    if (!res.ok) throw new Error('Failed to calculate rankings');
    return res.json();
  },

  async reserveHospital(
    emergencyId: string,
    hospitalId: string,
    ambulanceId?: string
  ): Promise<{
    success: boolean;
    emergency?: EmergencyRequest;
    hospital?: Hospital;
    code?: string;
    message?: string;
    reasons?: string[];
    alternatives?: HospitalRanking[];
  }> {
    const res = await fetch(`/api/emergencies/${emergencyId}/reserve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hospitalId, ambulanceId }),
    });
    const data = await res.json();
    if (!res.ok && res.status !== 409) {
      throw new Error(data.message || 'Reservation failed');
    }
    return data;
  },

  async rejectEmergency(
    emergencyId: string,
    hospitalId: string,
    reason: string
  ): Promise<{
    success: boolean;
    emergency: EmergencyRequest;
    alternatives: HospitalRanking[];
  }> {
    const res = await fetch(`/api/emergencies/${emergencyId}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hospitalId, reason }),
    });
    if (!res.ok) throw new Error('Failed to reject emergency');
    return res.json();
  },

  async updateHospitalResources(
    hospitalId: string,
    payload: {
      resources?: HospitalResources;
      divertStatus?: DivertStatus;
      lastUpdatedAt?: string;
    }
  ): Promise<{ success: boolean; hospital: Hospital }> {
    const res = await fetch(`/api/hospitals/${hospitalId}/resources`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Failed to update hospital resources');
    return res.json();
  },

  async markPatientArrived(emergencyId: string): Promise<{ success: boolean; emergency: EmergencyRequest }> {
    const res = await fetch(`/api/emergencies/${emergencyId}/arrived`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) throw new Error('Failed to mark arrival');
    return res.json();
  },

  async completeHandover(
    emergencyId: string,
    receivingStaff: string,
    handoverNotes: string
  ): Promise<{ success: boolean; emergency: EmergencyRequest }> {
    const res = await fetch(`/api/emergencies/${emergencyId}/handover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ receivingStaff, handoverNotes }),
    });
    if (!res.ok) throw new Error('Failed to complete handover');
    return res.json();
  },

  async simulateRaceCondition(): Promise<{
    success: boolean;
    results: any[];
    hospitalState: Hospital;
  }> {
    const res = await fetch('/api/simulate/race-condition', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) throw new Error('Failed to simulate race condition');
    return res.json();
  },

  async simulateFreshness(
    hospitalId: string,
    ageMinutes: number
  ): Promise<{ success: boolean; hospital: Hospital }> {
    const res = await fetch('/api/simulate/hospital-freshness', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hospitalId, ageMinutes }),
    });
    if (!res.ok) throw new Error('Failed to modify freshness');
    return res.json();
  },

  async resetSimulation(): Promise<{ success: boolean }> {
    const res = await fetch('/api/simulate/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) throw new Error('Failed to reset simulation');
    return res.json();
  },
};
