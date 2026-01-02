import { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

// Use relative URL for API - Kubernetes ingress routes /api/* to backend
// This avoids CORS issues on mobile browsers
const API = '/api';

// Log for debugging
console.log('Using relative API URL:', API);

// Simple fetch with timeout
const fetchWithTimeout = async (url, options, timeout = 30000) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
};

// Configure axios for other API calls
axios.defaults.timeout = 30000;
axios.defaults.baseURL = API;

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
      const response = await axios.get(`/auth/me`);
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
      const response = await fetchWithTimeout(`${API}/auth/login`, {
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
      if (error.name === 'AbortError') {
        throw new Error('Request timed out. Please try again.');
      }
      if (error.name === 'TypeError') {
        throw new Error('Unable to connect. Please try again.');
      }
      throw error;
    }
  };

  const register = async (email, password, name) => {
    console.log('Attempting register to:', `${API}/auth/register`);
    
    try {
      const response = await fetchWithTimeout(`${API}/auth/register`, {
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
      if (error.name === 'AbortError') {
        throw new Error('Request timed out. Please try again.');
      }
      if (error.name === 'TypeError') {
        throw new Error('Unable to connect. Please try again.');
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
