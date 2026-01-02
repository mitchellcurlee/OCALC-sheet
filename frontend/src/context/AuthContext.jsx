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

// Configure axios defaults for mobile
axios.defaults.timeout = 30000; // 30 second timeout for slow mobile networks
axios.defaults.headers.common['Content-Type'] = 'application/json';

// Safe localStorage wrapper for mobile browsers
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
      // Token invalid, clear it
      safeStorage.removeItem('token');
      setToken(null);
      delete axios.defaults.headers.common['Authorization'];
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    try {
      const response = await axios.post(`${API}/auth/login`, { 
        email: email.toLowerCase().trim(), 
        password 
      });
      const { access_token, user: userData } = response.data;
      
      safeStorage.setItem('token', access_token);
      axios.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
      setToken(access_token);
      setUser(userData);
      
      return userData;
    } catch (error) {
      console.error('Login error:', error);
      if (error.code === 'ERR_NETWORK') {
        throw new Error('Network error. Please check your internet connection.');
      }
      if (error.code === 'ECONNABORTED') {
        throw new Error('Request timed out. Please try again.');
      }
      throw error;
    }
  };

  const register = async (email, password, name) => {
    try {
      const response = await axios.post(`${API}/auth/register`, { 
        email: email.toLowerCase().trim(), 
        password, 
        name 
      });
      const { access_token, user: userData } = response.data;
      
      safeStorage.setItem('token', access_token);
      axios.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
      setToken(access_token);
      setUser(userData);
      
      return userData;
    } catch (error) {
      console.error('Register error:', error);
      if (error.code === 'ERR_NETWORK') {
        throw new Error('Network error. Please check your internet connection.');
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
