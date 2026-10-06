import { useNavigate } from "react-router-dom";
import { Home } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Home: always returns to the true Home page (job tiles grouped by month). */
export const HomeButton = ({ className = "text-zinc-600 hover:text-zinc-900" }) => {
  const navigate = useNavigate();
  return (
    <Button variant="ghost" size="sm" className={`h-9 px-2 gap-1.5 ${className}`} onClick={() => navigate("/")} title="Home — job tiles by month" aria-label="Home" data-testid="home-btn">
      <Home className="w-5 h-5" />
      <span className="hidden sm:inline text-xs font-semibold">Home</span>
    </Button>
  );
};
