import { useNavigate, useParams } from "react-router-dom";
import { Home } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Job Home: inside a job → that job's Poles & Underground list. Outside a job → the true Home page. */
export const HomeButton = ({ className = "text-zinc-600 hover:text-zinc-900", jobId: jobIdProp }) => {
  const navigate = useNavigate();
  const { jobId: jobIdParam } = useParams();
  const jobId = jobIdProp || jobIdParam;
  const label = jobId ? "Job Home" : "Home";
  return (
    <Button variant="ghost" size="sm" className={`h-9 px-2 gap-1.5 ${className}`} onClick={() => navigate(jobId ? `/jobs/${jobId}` : "/")} title={jobId ? "Job Home — poles & underground list" : "Home — job map & monthly tiles"} aria-label={label} data-testid="home-btn">
      <Home className="w-5 h-5" />
      <span className="hidden sm:inline text-xs font-semibold">{label}</span>
    </Button>
  );
};
