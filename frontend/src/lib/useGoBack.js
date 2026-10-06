import { useLocation, useNavigate } from "react-router-dom";

/** Back = the page the user actually came from (browser history); falls back to a sensible route on a fresh tab / deep link. */
export const useGoBack = (fallback = "/") => {
  const navigate = useNavigate();
  const location = useLocation();
  return () => {
    if (location.key !== "default" && window.history.length > 1) navigate(-1);
    else navigate(fallback);
  };
};
