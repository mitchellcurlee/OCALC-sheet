import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useGoBack } from "@/lib/useGoBack";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContext";
import { ArrowLeft, Loader2, MailWarning, ShieldCheck, ShieldAlert, Trash2, Users, BadgeCheck, Clock } from "lucide-react";
import { HomeButton } from "@/components/HomeButton";

const fmt = (s) => (s ? new Date(s).toLocaleDateString() : "—");

const StatusPill = ({ u }) => {
  if (!u.company_allowed) return <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-mono rounded bg-red-100 text-red-800 border border-red-200" data-testid={`user-status-${u.id}`}><ShieldAlert className="w-3 h-3" />BLOCKED DOMAIN</span>;
  if (!u.email_verified) return <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-mono rounded bg-amber-100 text-amber-800 border border-amber-200" data-testid={`user-status-${u.id}`}><Clock className="w-3 h-3" />UNVERIFIED</span>;
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-mono rounded bg-emerald-100 text-emerald-800 border border-emerald-200" data-testid={`user-status-${u.id}`}><BadgeCheck className="w-3 h-3" />VERIFIED{u.grandfathered ? " · EXISTING" : ""}</span>;
};

const UserRow = ({ u, onResend, onRemove, onSupervisor, busyId }) => (
  <tr className="border-t border-zinc-200 hover:bg-zinc-50" data-testid={`user-row-${u.id}`}>
    <td className="px-3 py-2 text-sm">
      <div className="font-medium text-zinc-900 break-all">{u.email}{u.is_admin && <span className="ml-2 text-[10px] font-mono text-amber-600">ADMIN</span>}{u.is_supervisor && !u.is_admin && <span className="ml-2 text-[10px] font-mono text-orange-600" data-testid={`user-supervisor-badge-${u.id}`}>SUPERVISOR</span>}</div>
      <div className="text-xs text-zinc-500">{u.name}</div>
    </td>
    <td className="px-3 py-2"><StatusPill u={u} /></td>
    <td className="px-3 py-2 text-xs text-zinc-600 whitespace-nowrap">{fmt(u.created_at)}</td>
    <td className="px-3 py-2 text-xs text-zinc-600 text-center">{u.job_count}</td>
    <td className="px-3 py-2 text-right whitespace-nowrap">
      {u.email_verified && u.company_allowed && !u.is_admin && (
        <label className="inline-flex items-center gap-1.5 text-xs text-zinc-700 mr-2 cursor-pointer select-none" title="Supervisors can open Team Reports (all fielders' Daily Field Reports) without admin rights">
          <input type="checkbox" checked={!!u.is_supervisor} disabled={busyId === u.id} onChange={(e) => onSupervisor(u, e.target.checked)} data-testid={`user-supervisor-${u.id}`} />Supervisor
        </label>
      )}
      {!u.email_verified && u.company_allowed && (
        <>
          <Button size="sm" variant="outline" disabled={busyId === u.id} onClick={() => onResend(u)} className="h-8 text-xs bg-white border-zinc-300 mr-1" data-testid={`user-resend-${u.id}`}>
            {busyId === u.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><MailWarning className="w-3.5 h-3.5 mr-1" />Resend verification</>}
          </Button>
          <Button size="sm" variant="outline" disabled={busyId === u.id} onClick={() => onRemove(u)} className="h-8 text-xs bg-white border-red-300 text-red-600" title="Remove unverified account" data-testid={`user-remove-${u.id}`}>
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </>
      )}
    </td>
  </tr>
);

const AdminUsers = () => {
  const navigate = useNavigate();
  const goBack = useGoBack("/");
  const { isAdmin, loading: authLoading } = useAuth();
  const [data, setData] = useState(null);
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState(null);

  const load = async () => {
    try { setData((await axios.get("/auth/admin/users")).data); }
    catch (e) { toast.error(e.response?.data?.detail || "Could not load users"); }
  };
  useEffect(() => { if (!authLoading && isAdmin) load(); }, [authLoading, isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  const groups = useMemo(() => {
    if (!data) return [];
    const s = q.trim().toLowerCase();
    const users = s ? data.users.filter((u) => `${u.email} ${u.name}`.toLowerCase().includes(s)) : data.users;
    const byDomain = {};
    users.forEach((u) => { (byDomain[u.domain] ||= []).push(u); });
    const order = [...data.domains, ...Object.keys(byDomain).filter((d) => !data.domains.includes(d)).sort()];
    return order.filter((d) => byDomain[d]).map((d) => ({ domain: d, allowed: data.domains.includes(d), users: byDomain[d] }));
  }, [data, q]);

  const resend = async (u) => {
    setBusyId(u.id);
    try { toast.success((await axios.post(`/auth/admin/users/${u.id}/resend-verification`)).data.message); }
    catch (e) { toast.error(e.response?.data?.detail || "Could not send"); }
    finally { setBusyId(null); }
  };
  const setSupervisor = async (u, on) => {
    setBusyId(u.id);
    try {
      await axios.put(`/auth/admin/users/${u.id}/supervisor`, { is_supervisor: on });
      setData((d) => ({ ...d, users: d.users.map((x) => (x.id === u.id ? { ...x, is_supervisor: on } : x)) }));
      toast.success(on ? `${u.email} can now open Team Reports` : `Supervisor access removed for ${u.email}`);
    } catch (e) { toast.error(e.response?.data?.detail || "Could not update"); }
    finally { setBusyId(null); }
  };
  const remove = async (u) => {
    if (!window.confirm(`Remove the unverified account ${u.email}? They will be able to register again.`)) return;
    setBusyId(u.id);
    try { await axios.delete(`/auth/admin/users/${u.id}`); toast.success("Account removed"); await load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Could not remove"); }
    finally { setBusyId(null); }
  };

  if (!authLoading && !isAdmin) {
    return <div className="min-h-screen bg-industrial-bg flex items-center justify-center p-6"><div className="industrial-card p-6 text-center" data-testid="admin-users-denied"><ShieldAlert className="w-10 h-10 mx-auto text-red-600" /><p className="mt-3 text-sm text-zinc-700">Admin access required.</p><Button className="mt-4 bg-red-600 hover:bg-red-700 text-white" onClick={() => navigate("/")}>Back to jobs</Button></div></div>;
  }

  const total = data?.users.length || 0;
  const unverified = data?.users.filter((u) => !u.email_verified).length || 0;

  return (
    <div className="min-h-screen bg-industrial-bg" data-testid="admin-users-page">
      <header className="bg-zinc-900 text-white px-4 py-3 flex items-center gap-3">
        <Button size="icon" variant="ghost" className="text-zinc-300 hover:text-white hover:bg-zinc-800" onClick={goBack} data-testid="admin-users-back"><ArrowLeft className="w-5 h-5" /></Button>
        <HomeButton className="text-zinc-300 hover:text-white hover:bg-zinc-800" />
        <div>
          <h1 className="font-heading text-lg font-bold uppercase tracking-tight flex items-center gap-2"><Users className="w-5 h-5" />Users by company</h1>
          <p className="text-[11px] font-mono text-zinc-400">{total} accounts · {unverified} awaiting verification</p>
        </div>
      </header>
      <main className="max-w-5xl mx-auto p-4 space-y-6">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by email or name" className="bg-white h-10" data-testid="admin-users-search" />
        {!data && <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-zinc-400" /></div>}
        {groups.map((g) => (
          <section key={g.domain} className="industrial-card bg-white overflow-hidden" data-testid={`domain-group-${g.domain}`}>
            <div className="px-3 py-2 bg-zinc-100 border-b border-zinc-200 flex items-center gap-2">
              {g.allowed ? <ShieldCheck className="w-4 h-4 text-emerald-600" /> : <ShieldAlert className="w-4 h-4 text-red-600" />}
              <h2 className="text-sm font-mono uppercase tracking-widest text-zinc-700">@{g.domain}</h2>
              <span className="text-xs text-zinc-500 ml-auto">{g.users.length} user{g.users.length !== 1 ? "s" : ""}{!g.allowed && " · no access"}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead><tr className="text-[10px] font-mono uppercase text-zinc-500"><th className="px-3 py-2">User</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Joined</th><th className="px-3 py-2 text-center">Jobs</th><th className="px-3 py-2" /></tr></thead>
                <tbody>{g.users.map((u) => <UserRow key={u.id} u={u} onResend={resend} onRemove={remove} onSupervisor={setSupervisor} busyId={busyId} />)}</tbody>
              </table>
            </div>
          </section>
        ))}
        {data && groups.length === 0 && <p className="text-sm text-zinc-500 text-center">No users match.</p>}
      </main>
    </div>
  );
};

export default AdminUsers;
