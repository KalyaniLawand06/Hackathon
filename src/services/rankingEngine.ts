import { 
  Hospital, 
  ResourceRequirements, 
  HospitalRanking, 
  FreshnessCategory,
  UrgencyLevel,
  TraumaLevel
} from '../types';

/**
 * Calculates distance in kilometers between two coordinates using Haversine formula
 */
export function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Estimates travel time in minutes based on distance and urgency (lights & siren factor)
 */
export function estimateTravelTimeMinutes(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
  urgency: UrgencyLevel,
  baseOffsetMinutes: number = 0
): number {
  const distanceKm = calculateDistanceKm(lat1, lon1, lat2, lon2);
  // Average urban emergency transit speed:
  // Critical (lights & sirens): ~45 km/h
  // Urgent: ~38 km/h
  // Standard: ~30 km/h
  let speedKmH = 38;
  if (urgency === 'CRITICAL_CODE_RED') speedKmH = 46;
  if (urgency === 'STANDARD_CODE_GREEN') speedKmH = 30;

  const transitMinutes = (distanceKm / speedKmH) * 60;
  const total = Math.max(3, Math.round(transitMinutes + baseOffsetMinutes * 0.4));
  return total;
}

/**
 * Evaluates Data Freshness based on timestamp
 * 🟢 Fresh: < 5 minutes
 * 🟡 Aging: 5–10 minutes
 * 🔴 Stale: > 10 minutes
 */
export function evaluateFreshness(lastUpdatedAt: string): {
  category: FreshnessCategory;
  durationSeconds: number;
  score: number;
  label: string;
} {
  const now = Date.now();
  const updatedTime = new Date(lastUpdatedAt).getTime();
  const elapsedSec = Math.max(0, Math.floor((now - updatedTime) / 1000));

  if (elapsedSec < 300) {
    // < 5 minutes
    const score = 100 - (elapsedSec / 300) * 10; // 90 - 100
    return {
      category: 'FRESH',
      durationSeconds: elapsedSec,
      score: Math.round(score),
      label: formatElapsed(elapsedSec),
    };
  } else if (elapsedSec <= 600) {
    // 5 - 10 minutes
    const score = 80 - ((elapsedSec - 300) / 300) * 20; // 60 - 80
    return {
      category: 'AGING',
      durationSeconds: elapsedSec,
      score: Math.round(score),
      label: formatElapsed(elapsedSec),
    };
  } else {
    // > 10 minutes
    const score = Math.max(20, 50 - ((elapsedSec - 600) / 600) * 20); // 20 - 50
    return {
      category: 'STALE',
      durationSeconds: elapsedSec,
      score: Math.round(score),
      label: formatElapsed(elapsedSec),
    };
  }
}

export function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s ago`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ${mins % 60}m ago`;
}

const TRAUMA_RANKS: Record<TraumaLevel, number> = {
  LEVEL_1: 4,
  LEVEL_2: 3,
  LEVEL_3: 2,
  COMMUNITY: 1,
};

/**
 * Multi-factor hospital ranking algorithm
 */
export function rankHospitals(
  hospitals: Hospital[],
  requirements: ResourceRequirements,
  emergencyLocation: { lat: number; lng: number },
  urgency: UrgencyLevel,
  excludedHospitalIds: string[] = []
): HospitalRanking[] {
  const rankings: HospitalRanking[] = hospitals
    .filter((h) => !excludedHospitalIds.includes(h.id))
    .map((hospital) => {
      const missingResources: string[] = [];
      let hardRequirementsMet = true;

      // Divert checks
      if (hospital.divertStatus === 'FULL_DIVERT') {
        hardRequirementsMet = false;
        missingResources.push('Hospital on Total Divert');
      }

      if (hospital.divertStatus === 'ICU_DIVERT' && requirements.icuBed) {
        hardRequirementsMet = false;
        missingResources.push('ICU on Divert');
      }

      if (hospital.divertStatus === 'TRAUMA_DIVERT' && requirements.traumaFacility) {
        hardRequirementsMet = false;
        missingResources.push('Trauma Center on Divert');
      }

      // 1. ICU Bed Check
      if (requirements.icuBed) {
        const needed = requirements.icuBedCount || 1;
        if (hospital.resources.icuBeds.available < needed) {
          hardRequirementsMet = false;
          missingResources.push(
            `ICU Beds insufficient (${hospital.resources.icuBeds.available}/${needed} available)`
          );
        }
      }

      // 2. Ventilator Check
      if (requirements.ventilator) {
        const needed = requirements.ventilatorCount || 1;
        if (hospital.resources.ventilators.available < needed) {
          hardRequirementsMet = false;
          missingResources.push(
            `Ventilators insufficient (${hospital.resources.ventilators.available}/${needed} available)`
          );
        }
      }

      // 3. Trauma Facility Check
      if (requirements.traumaFacility) {
        if (hospital.resources.traumaBays.available < 1) {
          hardRequirementsMet = false;
          missingResources.push('No Trauma Resuscitation Bays Available');
        }
        if (requirements.minTraumaLevel) {
          const reqRank = TRAUMA_RANKS[requirements.minTraumaLevel] || 1;
          const hospRank = TRAUMA_RANKS[hospital.traumaLevel] || 1;
          if (hospRank < reqRank) {
            hardRequirementsMet = false;
            missingResources.push(
              `Requires ${requirements.minTraumaLevel}, hospital is ${hospital.traumaLevel}`
            );
          }
        }
      }

      // 4. Blood Availability Check
      if (requirements.bloodType && requirements.bloodType !== 'NONE' && requirements.bloodUnits > 0) {
        const availableUnits = hospital.resources.bloodInventory[requirements.bloodType] || 0;
        if (availableUnits < requirements.bloodUnits) {
          // Universal O_NEG fallback if needed
          const oNegUnits = hospital.resources.bloodInventory['O_NEG'] || 0;
          if (requirements.bloodType !== 'O_NEG' && oNegUnits >= requirements.bloodUnits) {
            // Partially satisfied by O_NEG emergency reserve
          } else {
            hardRequirementsMet = false;
            missingResources.push(
              `Blood ${requirements.bloodType} insufficient (${availableUnits}/${requirements.bloodUnits} units)`
            );
          }
        }
      }

      // Resource Match Percentage
      let resourceMatchPercentage = 100;
      if (!hardRequirementsMet) {
        // Calculate partial match percentage
        let totalChecks = 0;
        let passedChecks = 0;

        if (requirements.icuBed) {
          totalChecks++;
          if (hospital.resources.icuBeds.available >= (requirements.icuBedCount || 1)) passedChecks++;
        }
        if (requirements.ventilator) {
          totalChecks++;
          if (hospital.resources.ventilators.available >= (requirements.ventilatorCount || 1)) passedChecks++;
        }
        if (requirements.traumaFacility) {
          totalChecks++;
          if (hospital.resources.traumaBays.available >= 1) passedChecks++;
        }
        if (requirements.bloodType && requirements.bloodType !== 'NONE') {
          totalChecks++;
          if ((hospital.resources.bloodInventory[requirements.bloodType] || 0) >= requirements.bloodUnits) passedChecks++;
        }

        resourceMatchPercentage = totalChecks > 0 ? Math.round((passedChecks / totalChecks) * 100) : 100;
        if (hospital.divertStatus === 'FULL_DIVERT') {
          resourceMatchPercentage = 0;
        }
      }

      // Travel Time calculation
      const etaMinutes = estimateTravelTimeMinutes(
        emergencyLocation.lat,
        emergencyLocation.lng,
        hospital.lat,
        hospital.lng,
        urgency,
        hospital.baseTravelTimeMinutes
      );

      // Travel Time Score (100 for <= 5m, declining to 20 for >= 40m)
      const travelTimeScore = Math.max(15, Math.min(100, Math.round(110 - (etaMinutes * 2.2))));

      // Freshness
      const freshness = evaluateFreshness(hospital.lastUpdatedAt);

      // Composite Score Weights based on Urgency
      let weightResource = 0.45;
      let weightEta = 0.40;
      let weightFreshness = 0.15;

      if (urgency === 'URGENT_CODE_YELLOW') {
        weightResource = 0.40;
        weightEta = 0.35;
        weightFreshness = 0.25;
      } else if (urgency === 'STANDARD_CODE_GREEN') {
        weightResource = 0.35;
        weightEta = 0.35;
        weightFreshness = 0.30;
      }

      // Calculate raw composite score
      let composite = 
        (resourceMatchPercentage * weightResource) +
        (travelTimeScore * weightEta) +
        (freshness.score * weightFreshness);

      // Penalty for missing hard requirements
      if (!hardRequirementsMet) {
        composite = composite * 0.35; // Severely demote
      }

      // Status Recommendation
      let statusRecommendation: HospitalRanking['statusRecommendation'] = 'RECOMMENDED';
      if (!hardRequirementsMet) {
        statusRecommendation = 'UNSUITABLE';
      } else if (freshness.category === 'STALE') {
        statusRecommendation = 'NEEDS_CONFIRMATION';
      } else if (resourceMatchPercentage >= 100 && etaMinutes <= 25) {
        statusRecommendation = 'RECOMMENDED';
      } else {
        statusRecommendation = 'ACCEPTABLE';
      }

      return {
        hospital,
        resourceMatchPercentage,
        meetsAllHardRequirements: hardRequirementsMet,
        missingResources,
        estimatedTravelTimeMinutes: etaMinutes,
        freshnessCategory: freshness.category,
        freshnessDurationSeconds: freshness.durationSeconds,
        freshnessScore: freshness.score,
        travelTimeScore,
        compositeScore: Math.round(composite * 10) / 10,
        rank: 1, // Will be set after sorting
        isStaleWarning: freshness.category === 'STALE',
        statusRecommendation,
      };
    });

  // Sort descending by composite score
  rankings.sort((a, b) => {
    // Hard requirement check first
    if (a.meetsAllHardRequirements !== b.meetsAllHardRequirements) {
      return a.meetsAllHardRequirements ? -1 : 1;
    }
    return b.compositeScore - a.compositeScore;
  });

  // Assign 1-indexed ranks
  return rankings.map((r, index) => ({
    ...r,
    rank: index + 1,
  }));
}
