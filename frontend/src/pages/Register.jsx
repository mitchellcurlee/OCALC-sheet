import { useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Zap, Loader2, Mail, Lock, User, MailCheck } from 'lucide-react';

const Register = () => {
  const { register } = useAuth();
  const [loading, setLoading] = useState(false);
  const [sentTo, setSentTo] = useState('');
  const [resending, setResending] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: ''
  });

  const resend = async () => {
    setResending(true);
    try {
      await axios.post('/auth/resend-verification', { email: sentTo });
      toast.success('Verification email sent again');
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
    const name = formData.name.trim();
    
    if (!email || !password) {
      toast.error('Please fill in all required fields');
      return;
    }
    
    if (password !== formData.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    
    if (password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    try {
      await register(email, password, name);
      setSentTo(email);
    } catch (error) {
      console.error('Registration error:', error);
      const message = error.response?.data?.detail || error.message || 'Registration failed';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  if (sentTo) {
    return (
      <div className="min-h-screen bg-industrial-bg flex items-center justify-center px-4 safe-area-inset">
        <div className="w-full max-w-md industrial-card p-6 text-center" data-testid="register-check-email">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-red-600 mb-4"><MailCheck className="w-10 h-10 text-white" /></div>
          <h1 className="font-heading text-2xl font-bold tracking-tight uppercase text-zinc-900">Check your email</h1>
          <p className="text-zinc-600 text-sm mt-3">We sent a verification link to <span className="font-semibold text-zinc-900" data-testid="register-sent-to">{sentTo}</span>. Click it to activate your account, then sign in.</p>
          <p className="text-zinc-500 text-xs mt-2">The link expires in 24 hours. Check your spam folder if you don't see it.</p>
          <div className="mt-6 flex flex-col gap-2">
            <Button type="button" variant="outline" disabled={resending} onClick={resend} className="h-12 bg-white border-zinc-300" data-testid="register-resend-btn">
              {resending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Resend verification email'}
            </Button>
            <Link to="/login" className="text-red-600 hover:text-red-700 font-medium text-sm" data-testid="register-go-login">Back to sign in</Link>
          </div>
        </div>
      </div>
    );
  }

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
          <p className="text-zinc-500 text-sm mt-1">Create your account</p>
          <p className="text-zinc-400 text-xs mt-1" data-testid="register-domain-hint">Company email required (mastec.com, byers.com, synapsiq.com, mastecindia.com, att.com)</p>
        </div>

        {/* Register Form */}
        <div className="industrial-card p-6">
          <form onSubmit={handleSubmit} className="space-y-4" autoComplete="on">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-xs font-mono tracking-widest text-zinc-500 uppercase">
                Name <span className="text-zinc-600">(optional)</span>
              </Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
                <Input
                  id="name"
                  name="name"
                  type="text"
                  autoComplete="name"
                  autoCapitalize="words"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Your name"
                  className="h-14 pl-10 bg-white border-zinc-300 text-zinc-900 text-base"
                  data-testid="name-input"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="text-xs font-mono tracking-widest text-zinc-500 uppercase">
                Email *
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
                Password *
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="••••••••"
                  className="h-14 pl-10 bg-white border-zinc-300 text-zinc-900 text-base"
                  data-testid="password-input"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="text-xs font-mono tracking-widest text-zinc-500 uppercase">
                Confirm Password *
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                  placeholder="••••••••"
                  className="h-14 pl-10 bg-white border-zinc-300 text-zinc-900 text-base"
                  data-testid="confirm-password-input"
                  required
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-14 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-semibold text-base touch-manipulation"
              data-testid="register-btn"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                'Create Account'
              )}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-zinc-500 text-sm">
              Already have an account?{' '}
              <Link to="/login" className="text-red-600 hover:text-red-600 font-medium">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Register;
