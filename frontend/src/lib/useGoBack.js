import { useNavigate } from "react-router-dom";

/**
 * Back = exactly the previous page in this tab's history (React Router keeps an index in history.state).
 * On a fresh tab / deep link there is nothing behind us, so we *replace* with the fallback — never pushing,
 * so repeated taps always walk backwards and end on the true Home page.
 */
export const useGoBack = (fallback = "/") => {
  const navigate = useNavigate();
  return () => {
    const idx = window.history.state?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate(fallback, { replace: true });
  };
};
