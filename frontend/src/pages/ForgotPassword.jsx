import { useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Zap, Loader2, Mail, MailCheck } from 'lucide-react';

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const value = email.trim().toLowerCase();
    if (!value) { toast.error('Enter your email address'); return; }
    setLoading(true);
    try {
      await axios.post('/auth/forgot-password', { email: value });
      setSent(true);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Could not send reset email');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-industrial-bg flex items-center justify-center px-4 safe-area-inset">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-red-600 mb-4"><Zap className="w-10 h-10 text-white" /></div>
          <h1 className="font-heading text-3xl font-bold tracking-tight uppercase text-zinc-900">Forgot password</h1>
          <p className="text-zinc-500 text-sm mt-1">We'll email you a link to choose a new one</p>
        </div>
        <div className="industrial-card p-6" data-testid="forgot-password-page">
          {sent ? (
            <div className="text-center" data-testid="forgot-sent">
              <MailCheck className="w-10 h-10 mx-auto text-green-600" />
              <p className="text-sm text-zinc-700 mt-3">If an account exists for <span className="font-semibold">{email.trim().toLowerCase()}</span>, a reset link is on its way. It expires in 1 hour.</p>
              <Link to="/login" className="inline-block mt-5 text-red-600 hover:text-red-700 font-medium text-sm" data-testid="forgot-back-login">Back to sign in</Link>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-xs font-mono tracking-widest text-zinc-500 uppercase">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
                  <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" className="pl-10 h-12 bg-zinc-50 border-zinc-300" data-testid="forgot-email-input" />
                </div>
              </div>
              <Button type="submit" disabled={loading} className="w-full h-12 bg-red-600 hover:bg-red-700 text-white font-medium" data-testid="forgot-submit-btn">
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Send reset link'}
              </Button>
              <p className="text-center text-sm text-zinc-500"><Link to="/login" className="text-red-600 hover:text-red-700 font-medium" data-testid="forgot-cancel-link">Back to sign in</Link></p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;
