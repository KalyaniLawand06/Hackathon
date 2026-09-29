import React from 'react';
import { HospitalRanking, EmergencyRequest } from '../types';
import { 
  ArrowRight, 
  Clock, 
  ShieldCheck, 
  X,
  AlertCircle,
  Building,
  HeartHandshake
} from 'lucide-react';

interface AlternativeHospitalModalProps {
  isOpen: boolean;
  onClose: () => void;
  emergency: EmergencyRequest | null;
  alternatives: HospitalRanking[];
  onSelectAlternative: (hospitalId: string) => void;
  isSubmitting?: boolean;
}

export const AlternativeHospitalModal: React.FC<AlternativeHospitalModalProps> = ({
  isOpen,
  onClose,
  emergency,
  alternatives,
  onSelectAlternative,
  isSubmitting = false,
}) => {
  if (!isOpen || !emergency) return null;

  const rejectedEntry = emergency.previousRejections?.[emergency.previousRejections.length - 1];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white border border-slate-200 rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Calm Header Banner */}
        <div className="bg-gradient-to-r from-teal-50 via-slate-50 to-white p-5 sm:p-6 border-b border-slate-200 flex items-start justify-between">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-teal-100/70 border border-teal-200 flex items-center justify-center text-teal-800 shrink-0">
              <HeartHandshake className="w-5 h-5 text-teal-700" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                  Care Re-Routing Assistant
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  {emergency.id}
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-semibold text-slate-900 mt-1">
                Suggested Alternative Care Facilities
              </h2>
              <p className="text-xs text-slate-600 mt-1">
                <strong>{rejectedEntry?.hospitalName || 'Target Hospital'}</strong>: {rejectedEntry?.reason || emergency.rejectionReason || 'Ward currently at maximum surge capacity'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Patient Summary Snapshot */}
        <div className="bg-slate-50/80 px-6 py-3 border-b border-slate-200/80 flex flex-wrap items-center justify-between text-xs text-slate-600 gap-2">
          <div>
            Patient: <span className="font-semibold text-slate-900">{emergency.patientName}</span> ({emergency.patientAge}y, {emergency.patientGender})
          </div>
          <div>
            Condition: <span className="text-slate-800 font-medium">{emergency.condition}</span>
          </div>
          <div>
            Urgency: <span className="text-rose-700 font-semibold">{emergency.urgency.replace('_', ' ')}</span>
          </div>
        </div>

        {/* Content Body: Ranked Alternatives */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-3 flex-1">
          <div className="text-xs text-slate-500 flex items-center justify-between mb-2">
            <span>Nearest suitable facilities evaluated on bed availability and travel time:</span>
            <span className="text-teal-800 font-medium">{alternatives.length} Facilities Available</span>
          </div>

          {alternatives.length === 0 ? (
            <div className="text-center py-8 text-slate-500 text-sm bg-slate-50 rounded-xl">
              No suitable alternative facilities found in the regional district. Alerting regional medical command.
            </div>
          ) : (
            alternatives.map((rankItem, index) => {
              const isBest = index === 0;
              const hosp = rankItem.hospital;

              return (
                <div
                  key={hosp.id}
                  className={`p-4 rounded-xl border transition-all ${
                    isBest
                      ? 'bg-teal-50/40 border-teal-300 shadow-xs'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div
                        className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                          isBest
                            ? 'bg-teal-700 text-white'
                            : 'bg-slate-100 text-slate-700 border border-slate-200'
                        }`}
                      >
                        {rankItem.rank}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-sm text-slate-900">{hosp.name}</h3>
                          {isBest && (
                            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-teal-100 text-teal-800">
                              Recommended Next
                            </span>
                          )}
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                            {hosp.traumaLevel.replace('_', ' ')}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 text-xs mt-1.5 text-slate-600">
                          {/* Resource Match */}
                          <span className="flex items-center gap-1 font-medium text-emerald-700">
                            <ShieldCheck className="w-3.5 h-3.5" />
                            {rankItem.resourceMatchPercentage}% Match ({hosp.resources.icuBeds.available} ICU beds open)
                          </span>

                          {/* ETA */}
                          <span className="flex items-center gap-1 text-slate-700 font-medium">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            ETA: {rankItem.estimatedTravelTimeMinutes} min
                          </span>

                          {/* Freshness */}
                          <span
                            className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium ${
                              rankItem.freshnessCategory === 'FRESH'
                                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                : rankItem.freshnessCategory === 'AGING'
                                ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                : 'bg-rose-50 text-rose-800 border border-rose-200'
                            }`}
                          >
                            {rankItem.freshnessCategory === 'STALE' && (
                              <AlertCircle className="w-3 h-3 text-rose-600" />
                            )}
                            {rankItem.freshnessCategory === 'FRESH'
                              ? 'Fresh data'
                              : rankItem.freshnessCategory === 'AGING'
                              ? 'Aging (5-10m)'
                              : 'Verification needed'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Action Button */}
                    <button
                      onClick={() => onSelectAlternative(hosp.id)}
                      disabled={isSubmitting || !rankItem.meetsAllHardRequirements}
                      className={`px-4 py-2 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 transition cursor-pointer shrink-0 ${
                        isBest
                          ? 'bg-teal-700 hover:bg-teal-800 text-white shadow-xs'
                          : 'bg-slate-800 hover:bg-slate-900 text-white'
                      } disabled:opacity-40 disabled:cursor-not-allowed`}
                    >
                      <span>Select & Route</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer info */}
        <div className="bg-slate-50 px-6 py-3.5 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <span>Continuous care workflow · Automatically connects to receiving facility</span>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-800 hover:underline text-xs cursor-pointer"
          >
            Dismiss
          </button>
        </div>

      </div>
    </div>
  );
};
