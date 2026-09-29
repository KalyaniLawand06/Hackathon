export type UrgencyLevel = 'CRITICAL_CODE_RED' | 'URGENT_CODE_YELLOW' | 'STANDARD_CODE_GREEN';

export type EmergencyStatus = 
  | 'PENDING_MATCH'
  | 'RESERVATION_REQUESTED'
  | 'CONFIRMED'
  | 'REJECTED'
  | 'REJECTED_AUTO_ALTERNATIVES'
  | 'AMBULANCE_DISPATCHED'
  | 'EN_ROUTE_HOSPITAL'
  | 'ARRIVED_AT_ER'
  | 'HANDOVER_COMPLETE'
  | 'CANCELLED';

export type TraumaLevel = 'LEVEL_1' | 'LEVEL_2' | 'LEVEL_3' | 'COMMUNITY';

export type BloodType = 'O_NEG' | 'O_POS' | 'A_POS' | 'A_NEG' | 'B_POS' | 'B_NEG' | 'AB_POS' | 'AB_NEG' | 'NONE';

export interface HospitalResources {
  icuBeds: {
    available: number;
    total: number;
  };
  ventilators: {
    available: number;
    total: number;
  };
  traumaBays: {
    available: number;
    total: number;
  };
  bloodInventory: {
    'O_NEG': number;
    'O_POS': number;
    'A_POS': number;
    'A_NEG': number;
    'B_POS': number;
    'B_NEG': number;
    'AB_POS': number;
    'AB_NEG': number;
  };
}

export type DivertStatus = 'ACCEPTING_ALL' | 'TRAUMA_DIVERT' | 'ICU_DIVERT' | 'FULL_DIVERT';

export interface Hospital {
  id: string;
  name: string;
  code: string;
  address: string;
  lat: number;
  lng: number;
  traumaLevel: TraumaLevel;
  divertStatus: DivertStatus;
  resources: HospitalResources;
  lastUpdatedAt: string; // ISO String
  phone: string;
  baseTravelTimeMinutes: number; // approximate base travel time from city center
  contactPerson: string;
}

export interface ResourceRequirements {
  icuBed: boolean;
  icuBedCount: number;
  ventilator: boolean;
  ventilatorCount: number;
  traumaFacility: boolean;
  minTraumaLevel?: TraumaLevel;
  bloodType: BloodType;
  bloodUnits: number;
}

export interface EmergencyRequest {
  id: string;
  patientName: string;
  patientAge: number;
  patientGender: 'M' | 'F' | 'Other';
  condition: string;
  urgency: UrgencyLevel;
  location: {
    address: string;
    lat: number;
    lng: number;
  };
  requiredResources: ResourceRequirements;
  status: EmergencyStatus;
  targetHospitalId?: string;
  assignedAmbulanceId?: string;
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
  handoverCompletedAt?: string;
  receivingStaff?: string;
  handoverNotes?: string;
  previousRejections?: Array<{
    hospitalId: string;
    hospitalName: string;
    reason: string;
    timestamp: string;
  }>;
}

export interface Ambulance {
  id: string;
  unitCode: string;
  crew: string;
  type: 'ALS' | 'BLS' | 'MICU'; // Advanced Life Support / Basic Life Support / Mobile ICU
  status: 'AVAILABLE' | 'DISPATCHED' | 'EN_ROUTE_SCENE' | 'ON_SCENE' | 'EN_ROUTE_HOSPITAL' | 'AT_HOSPITAL';
  currentLat: number;
  currentLng: number;
  assignedEmergencyId?: string;
  targetHospitalId?: string;
  etaMinutes?: number;
}

export type FreshnessCategory = 'FRESH' | 'AGING' | 'STALE';

export interface HospitalRanking {
  hospital: Hospital;
  resourceMatchPercentage: number;
  meetsAllHardRequirements: boolean;
  missingResources: string[];
  estimatedTravelTimeMinutes: number;
  freshnessCategory: FreshnessCategory;
  freshnessDurationSeconds: number;
  freshnessScore: number; // 0 to 100
  travelTimeScore: number; // 0 to 100
  compositeScore: number; // 0 to 100
  rank: number;
  isStaleWarning: boolean;
  statusRecommendation: 'RECOMMENDED' | 'ACCEPTABLE' | 'NEEDS_CONFIRMATION' | 'UNSUITABLE';
}

export type UserRole = 'DISPATCHER' | 'HOSPITAL_STAFF' | 'ADMIN';

export interface User {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  hospitalId?: string; // If hospital staff
  token: string;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  action: string;
  category: 'RESERVATION' | 'DOUBLE_BOOKING' | 'RE_RANK' | 'RESOURCE_UPDATE' | 'HANDOVER' | 'SYSTEM';
  actor: string;
  details: string;
  level: 'info' | 'success' | 'warn' | 'error';
}

export interface ServerState {
  hospitals: Hospital[];
  emergencies: EmergencyRequest[];
  ambulances: Ambulance[];
  logs: AuditLog[];
  activeUsersCount: number;
  simulationConfig: {
    autoRejectHospitalId: string | null;
    networkDelayMs: number;
  };
}
