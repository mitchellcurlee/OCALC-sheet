import { useNavigate } from "react-router-dom";
import { ClipboardList } from "lucide-react";
import { TravelTracker } from "./TravelTracker";
import { useDailyReport } from "./useDailyReport";
import { todayISO } from "@/lib/dfr";

/** Job Detail widget: GPS travel tracking for THIS job's row on today's Daily Field Report (row created on first tap). */
export const JobTravelTracker = ({ job }) => {
  const navigate = useNavigate();
  const date = todayISO();
  const { report, saving, dirty, activeRow, rowIndex, onTrack, changeRow } = useDailyReport({ jobId: job?.id, date, job, autoRow: false });
  if (!job || !report) return null;
  return (
    <div className="mb-6 space-y-1" data-testid="job-travel-tracker">
      <TravelTracker report={report} activeRow={activeRow} rowIndex={rowIndex} onTrack={onTrack} onRowChange={changeRow} />
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-500 px-1">
        <span data-testid="job-travel-tracker-status">Today's Daily Field Report ({date}) · {saving ? "Saving…" : dirty ? "Unsaved changes" : "Saved"}</span>
        <button type="button" onClick={() => navigate(`/jobs/${job.id}/field-report`)} className="inline-flex items-center gap-1 font-semibold text-orange-700 hover:underline" data-testid="job-open-dfr-link">
          <ClipboardList className="w-3.5 h-3.5" />Open Daily Report →
        </button>
      </div>
    </div>
  );
};

export default JobTravelTracker;
