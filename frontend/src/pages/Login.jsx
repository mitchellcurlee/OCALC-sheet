import { useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Zap, Loader2, Mail, Lock, Eye, EyeOff } from 'lucide-react';

const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [unverified, setUnverified] = useState(false);
  const [resending, setResending] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });

  const resend = async () => {
    setResending(true);
    try {
      await axios.post('/auth/resend-verification', { email: formData.email.trim().toLowerCase() });
      toast.success('Verification email sent — check your inbox');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Could not resend right now');
    } finally {
      setResending(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const email = formData.email.trim().toLowerCase();
    const password = formData.password;
    
    if (!email || !password) {
      toast.error('Please fill in all fields');
      return;
    }

    setLoading(true);
    setUnverified(false);
    try {
      await login(email, password);
      toast.success('Login successful!');
      navigate(location.state?.from || '/');
    } catch (error) {
      console.error('Login error:', error);
      const message = error.response?.data?.detail || error.message || 'Login failed. Please check your credentials.';
      if (message === 'EMAIL_NOT_VERIFIED') {
        setUnverified(true);
        toast.error('Please verify your email address before signing in.');
      } else {
        toast.error(message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-industrial-bg flex items-center justify-center px-4 safe-area-inset">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-red-600 mb-4">
            <Zap className="w-10 h-10 text-white" />
          </div>
          <h1 className="font-heading text-2xl font-bold tracking-tight uppercase text-zinc-900">
            Pole Data Sheet
          </h1>
          <p className="text-zinc-500 text-sm mt-1">Sign in to your account</p>
        </div>

        {/* Login Form */}
        <div className="industrial-card p-6">
          <form onSubmit={handleSubmit} className="space-y-4" autoComplete="on">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-xs font-mono tracking-widest text-zinc-500 uppercase">
                Email
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
                <Input
                  id="email"
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck="false"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="your@email.com"
                  className="h-14 pl-10 bg-white border-zinc-300 text-zinc-900 text-base"
                  data-testid="email-input"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-xs font-mono tracking-widest text-zinc-500 uppercase">
                Password
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="••••••••"
                  className="h-14 pl-10 pr-12 bg-white border-zinc-300 text-zinc-900 text-base"
                  data-testid="password-input"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-zinc-500 hover:text-zinc-700 focus:outline-none"
                  tabIndex={-1}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-14 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-semibold text-base touch-manipulation"
              data-testid="login-btn"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                'Sign In'
              )}
            </Button>
          </form>

          {unverified && (
            <div className="mt-4 p-3 bg-amber-50 border border-amber-300 rounded text-sm text-amber-900" data-testid="login-unverified-notice">
              <p className="font-semibold">Email not verified yet</p>
              <p className="text-xs mt-1">Click the link we emailed you to activate your account. Didn't get it?</p>
              <Button type="button" variant="outline" size="sm" disabled={resending} onClick={resend} className="mt-2 h-9 bg-white border-amber-300 text-amber-900" data-testid="login-resend-btn">
                {resending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Resend verification email'}
              </Button>
            </div>
          )}

          <div className="mt-6 text-center">
            <p className="text-zinc-500 text-sm">
              Don't have an account?{' '}
              <Link to="/register" className="text-red-600 hover:text-red-600 font-medium">
                Create one
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
