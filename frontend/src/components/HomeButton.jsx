import { useNavigate, useParams } from "react-router-dom";
import { Home } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Home: inside a job → that job's Poles & Underground list; elsewhere → the job tiles. */
export const HomeButton = ({ className = "text-zinc-600 hover:text-zinc-900", jobId: jobIdProp }) => {
  const navigate = useNavigate();
  const { jobId: jobIdParam } = useParams();
  const jobId = jobIdProp || jobIdParam;
  return (
    <Button variant="ghost" size="icon" className={`h-9 w-9 ${className}`} onClick={() => navigate(jobId ? `/jobs/${jobId}` : "/")} title={jobId ? "Job home — poles & underground list" : "Home — job tiles"} data-testid="home-btn">
      <Home className="w-5 h-5" />
    </Button>
  );
};
