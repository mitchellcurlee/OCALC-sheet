import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Loader2, MailCheck, MailX } from 'lucide-react';

const VerifyEmail = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { acceptSession } = useAuth();
  const [status, setStatus] = useState('working');
  const [error, setError] = useState('');
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const token = params.get('token');
    if (!token) { setStatus('error'); setError('Missing verification token.'); return; }
    axios.post('/auth/verify-email', { token })
      .then((res) => {
        acceptSession(res.data.access_token, res.data.user);
        setStatus('ok');
        setTimeout(() => navigate('/'), 1500);
      })
      .catch((err) => { setStatus('error'); setError(err.response?.data?.detail || 'Verification failed.'); });
  }, [params, acceptSession, navigate]);

  return (
    <div className="min-h-screen bg-industrial-bg flex items-center justify-center px-4 safe-area-inset">
      <div className="w-full max-w-md industrial-card p-6 text-center" data-testid="verify-email-page">
        {status === 'working' && (
          <>
            <Loader2 className="w-10 h-10 mx-auto text-red-600 animate-spin" />
            <p className="text-zinc-600 text-sm mt-4">Verifying your email…</p>
          </>
        )}
        {status === 'ok' && (
          <>
            <div className="inline-flex items-center justify-center w-16 h-16 bg-green-600 mb-4"><MailCheck className="w-10 h-10 text-white" /></div>
            <h1 className="font-heading text-2xl font-bold tracking-tight uppercase text-zinc-900">Email verified</h1>
            <p className="text-zinc-600 text-sm mt-2" data-testid="verify-success">Your account is active. Taking you to your jobs…</p>
          </>
        )}
        {status === 'error' && (
          <>
            <div className="inline-flex items-center justify-center w-16 h-16 bg-zinc-700 mb-4"><MailX className="w-10 h-10 text-white" /></div>
            <h1 className="font-heading text-2xl font-bold tracking-tight uppercase text-zinc-900">Link not valid</h1>
            <p className="text-zinc-600 text-sm mt-2" data-testid="verify-error">{error}</p>
            <Button asChild className="mt-6 h-12 bg-red-600 hover:bg-red-700 text-white" data-testid="verify-go-login"><Link to="/login">Go to sign in</Link></Button>
          </>
        )}
      </div>
    </div>
  );
};

export default VerifyEmail;
