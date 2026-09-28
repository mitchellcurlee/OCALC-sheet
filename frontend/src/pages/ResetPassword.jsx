import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Zap, Loader2, Lock, KeyRound } from 'lucide-react';

const ResetPassword = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { acceptSession } = useAuth();
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (password.length < 6) { toast.error('Password must be at least 6 characters'); return; }
    if (password !== confirm) { toast.error('Passwords do not match'); return; }
    setLoading(true);
    try {
      const res = await axios.post('/auth/reset-password', { token, password });
      acceptSession(res.data.access_token, res.data.user);
      setDone(true);
      toast.success('Password updated');
      setTimeout(() => navigate('/'), 1200);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Could not reset password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-industrial-bg flex items-center justify-center px-4 safe-area-inset">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-red-600 mb-4"><Zap className="w-10 h-10 text-white" /></div>
          <h1 className="font-heading text-3xl font-bold tracking-tight uppercase text-zinc-900">New password</h1>
          <p className="text-zinc-500 text-sm mt-1">Choose a new password for your account</p>
        </div>
        <div className="industrial-card p-6" data-testid="reset-password-page">
          {!token ? (
            <div className="text-center" data-testid="reset-missing-token">
              <p className="text-sm text-zinc-700">This reset link is missing its token. Request a new one below.</p>
              <Button asChild className="mt-5 h-12 bg-red-600 hover:bg-red-700 text-white"><Link to="/forgot-password">Request reset link</Link></Button>
            </div>
          ) : done ? (
            <div className="text-center" data-testid="reset-success">
              <KeyRound className="w-10 h-10 mx-auto text-green-600" />
              <p className="text-sm text-zinc-700 mt-3">Password updated. Signing you in…</p>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="password" className="text-xs font-mono tracking-widest text-zinc-500 uppercase">New password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
                  <Input id="password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="pl-10 h-12 bg-zinc-50 border-zinc-300" data-testid="reset-password-input" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm" className="text-xs font-mono tracking-widest text-zinc-500 uppercase">Confirm password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
                  <Input id="confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="pl-10 h-12 bg-zinc-50 border-zinc-300" data-testid="reset-confirm-input" />
                </div>
              </div>
              <Button type="submit" disabled={loading} className="w-full h-12 bg-red-600 hover:bg-red-700 text-white font-medium" data-testid="reset-submit-btn">
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Set new password'}
              </Button>
              <p className="text-center text-sm text-zinc-500"><Link to="/login" className="text-red-600 hover:text-red-700 font-medium">Back to sign in</Link></p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
