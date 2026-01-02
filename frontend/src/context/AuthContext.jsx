import { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

// Get backend URL with fallback for mobile browsers
const getBackendUrl = () => {
  // Try environment variable first
  const envUrl = process.env.REACT_APP_BACKEND_URL;
  if (envUrl && envUrl.length > 0) {
    return envUrl;
  }
  
  // Fallback: use current origin for relative API calls or hardcoded URL
  if (typeof window !== 'undefined') {
    // If we're on the preview domain, use it directly
    if (window.location.hostname.includes('preview.emergentagent.com')) {
      return `https://${window.location.hostname}`;
    }
    // For localhost development
    if (window.location.hostname === 'localhost') {
      return 'http://localhost:8001';
    }
  }
  
  // Final fallback - hardcoded production URL
  return 'https://poledataio.preview.emergentagent.com';
};

const BACKEND_URL = getBackendUrl();
const API = `${BACKEND_URL}/api`;

// Log for debugging
console.log('Backend URL:', BACKEND_URL);
console.log('API URL:', API);

// Helper function to make fetch requests with retry for mobile
const fetchWithRetry = async (url, options, maxRetries = 3) => {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Fetch attempt ${attempt}/${maxRetries} to ${url}`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        mode: 'cors',
        credentials: 'omit'
      });
      
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      console.error(`Attempt ${attempt} failed:`, error.name, error.message);
      lastError = error;
      
      if (attempt < maxRetries) {
        // Wait before retry (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
  }
  
  throw lastError;
};

// Configure axios defaults for mobile compatibility
axios.defaults.timeout = 30000;
axios.defaults.headers.common['Accept'] = 'application/json';
axios.defaults.headers.post['Content-Type'] = 'application/json';

// Safe localStorage wrapper for mobile browsers (Safari private mode, etc.)
const safeStorage = {
  getItem: (key) => {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      console.warn('localStorage not available:', e);
      return null;
    }
  },
  setItem: (key, value) => {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      console.warn('localStorage not available:', e);
    }
  },
  removeItem: (key) => {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      console.warn('localStorage not available:', e);
    }
  }
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(safeStorage.getItem('token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      fetchUser();
    } else {
      setLoading(false);
    }
  }, [token]);

  const fetchUser = async () => {
    try {
      const response = await axios.get(`${API}/auth/me`);
      setUser(response.data);
    } catch (error) {
      console.error('Failed to fetch user:', error);
      safeStorage.removeItem('token');
      setToken(null);
      delete axios.defaults.headers.common['Authorization'];
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    console.log('Attempting login to:', `${API}/auth/login`);
    
    try {
      // Use native fetch with retry for better mobile compatibility
      const response = await fetchWithRetry(`${API}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ 
          email: email.toLowerCase().trim(), 
          password 
        })
      });
      
      console.log('Login response status:', response.status);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 401) {
          throw new Error('Invalid email or password.');
        }
        throw new Error(errorData.detail || `Login failed (${response.status})`);
      }
      
      const data = await response.json();
      console.log('Login successful');
      
      const { access_token, user: userData } = data;
      
      safeStorage.setItem('token', access_token);
      axios.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
      setToken(access_token);
      setUser(userData);
      
      return userData;
    } catch (error) {
      console.error('Login error:', error.name, error.message);
      
      // Handle different error types
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        throw new Error('Unable to connect to server. Please check your internet connection.');
      }
      if (error.name === 'TypeError') {
        throw new Error('Network error. Please try again.');
      }
      throw error;
    }
  };

  const register = async (email, password, name) => {
    console.log('Attempting register to:', `${API}/auth/register`);
    
    try {
      const response = await fetchWithRetry(`${API}/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ 
          email: email.toLowerCase().trim(), 
          password, 
          name 
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `Registration failed (${response.status})`);
      }
      
      const data = await response.json();
      const { access_token, user: userData } = data;
      
      safeStorage.setItem('token', access_token);
      axios.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
      setToken(access_token);
      setUser(userData);
      
      return userData;
    } catch (error) {
      console.error('Register error:', error);
      if (error.name === 'TypeError' || error.name === 'AbortError') {
        throw new Error('Unable to connect. Please check your connection and try again.');
      }
      throw error;
    }
  };

  const logout = () => {
    safeStorage.removeItem('token');
    delete axios.defaults.headers.common['Authorization'];
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout, isAuthenticated: !!user, isAdmin: user?.is_admin || false }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
