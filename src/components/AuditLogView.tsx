import React from 'react';
import { AuditLog } from '../types';
import { ShieldCheck, ShieldAlert, RotateCcw, Activity, CheckCircle2, Clock } from 'lucide-react';

interface AuditLogViewProps {
  logs: AuditLog[];
}

export const AuditLogView: React.FC<AuditLogViewProps> = ({ logs }) => {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-xs">
      <div className="flex items-center justify-between pb-3.5 border-b border-slate-100 mb-4">
        <div>
          <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
            <Activity className="w-4 h-4 text-teal-700" />
            <span>Clinical Care Activity & Placement Log</span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time record of ward reservations, arrival handovers, and system events
          </p>
        </div>
        <span className="text-xs text-slate-400 font-mono">
          {logs.length} Logged Entries
        </span>
      </div>

      <div className="space-y-2 max-h-[380px] overflow-y-auto">
        {logs.map((log) => {
          let badgeBg = 'bg-slate-50 text-slate-700 border-slate-200';
          let icon = <Activity className="w-3.5 h-3.5 text-slate-500" />;

          if (log.category === 'DOUBLE_BOOKING') {
            badgeBg = 'bg-rose-50 text-rose-800 border-rose-200';
            icon = <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />;
          } else if (log.category === 'RESERVATION') {
            badgeBg = 'bg-emerald-50 text-emerald-800 border-emerald-200';
            icon = <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />;
          } else if (log.category === 'RE_RANK') {
            badgeBg = 'bg-amber-50 text-amber-800 border-amber-200';
            icon = <RotateCcw className="w-3.5 h-3.5 text-amber-600" />;
          } else if (log.category === 'HANDOVER') {
            badgeBg = 'bg-teal-50 text-teal-800 border-teal-200';
            icon = <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />;
          }

          return (
            <div
              key={log.id}
              className="p-3 bg-slate-50/60 border border-slate-200/80 rounded-xl text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 hover:bg-slate-50 transition"
            >
              <div className="flex items-start gap-2.5">
                <span className={`p-1.5 rounded-lg border shrink-0 mt-0.5 ${badgeBg}`}>
                  {icon}
                </span>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-slate-900">{log.action.replace(/_/g, ' ')}</span>
                    <span className="text-[11px] text-slate-500">
                      by {log.actor}
                    </span>
                  </div>
                  <p className="text-slate-600 mt-0.5 text-xs leading-relaxed">
                    {log.details}
                  </p>
                </div>
              </div>

              <div className="text-[11px] text-slate-400 shrink-0 self-end sm:self-center flex items-center gap-1">
                <Clock className="w-3 h-3 text-slate-300" />
                <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
