// Shared API configuration for all pages
// Uses relative URL on production to avoid CORS issues on mobile

export const getApiUrl = () => {
  // For development (localhost), use the full backend URL
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    return 'http://localhost:8001/api';
  }
  // For production/preview, use relative URL (ingress handles routing)
  return '/api';
};

export const API = getApiUrl();
