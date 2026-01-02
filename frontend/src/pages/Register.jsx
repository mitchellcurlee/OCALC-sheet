import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Zap, Loader2, Mail, Lock, User } from 'lucide-react';

const Register = () => {
  const navigate = useNavigate();
  const { register } = useAuth();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: ''
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.email || !formData.password) {
      toast.error('Please fill in all required fields');
      return;
    }
    
    if (formData.password !== formData.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    
    if (formData.password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    try {
      await register(formData.email, formData.password, formData.name);
      toast.success('Account created successfully!');
      navigate('/');
    } catch (error) {
      const message = error.response?.data?.detail || 'Registration failed';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-industrial-bg flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-red-600 mb-4">
            <Zap className="w-10 h-10 text-white" />
          </div>
          <h1 className="font-heading text-2xl font-bold tracking-tight uppercase text-white">
            Pole Data Sheet
          </h1>
          <p className="text-zinc-500 text-sm mt-1">Create your account</p>
        </div>

        {/* Register Form */}
        <div className="industrial-card p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs font-mono tracking-widest text-zinc-500 uppercase">
                Name <span className="text-zinc-600">(optional)</span>
              </Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <Input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Your name"
                  className="h-12 pl-10 bg-black border-zinc-700 text-white"
                  data-testid="name-input"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-mono tracking-widest text-zinc-500 uppercase">
                Email *
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="your@email.com"
                  className="h-12 pl-10 bg-black border-zinc-700 text-white"
                  data-testid="email-input"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-mono tracking-widest text-zinc-500 uppercase">
                Password *
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <Input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="••••••••"
                  className="h-12 pl-10 bg-black border-zinc-700 text-white"
                  data-testid="password-input"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-mono tracking-widest text-zinc-500 uppercase">
                Confirm Password *
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <Input
                  type="password"
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                  placeholder="••••••••"
                  className="h-12 pl-10 bg-black border-zinc-700 text-white"
                  data-testid="confirm-password-input"
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-12 bg-red-600 hover:bg-red-700 text-white font-semibold"
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
              <Link to="/login" className="text-red-500 hover:text-red-400 font-medium">
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
