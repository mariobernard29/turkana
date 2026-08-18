"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Loader2, Trash2, RefreshCw } from "lucide-react";
import { createStaffUser, setUserRole, setEmployeeCode, toggleUserActive, deleteStaffUser, type StaffUser } from "@/app/admin/ajustes/user-actions";
import { cn } from "@/lib/utils";

type Role = { id: string; key: string; name: string };

export function UsersManager({ users, roles }: { users: StaffUser[]; roles: Role[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ fullName: "", email: "", password: "", roleId: roles[0]?.id ?? "", employeeCode: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ k: "ok" | "err"; t: string } | null>(null);

  const field = "w-full rounded-lg border border-ink/15 bg-white px-3 py-2.5 text-sm outline-none focus:border-gold";

  const create = async () => {
    setBusy(true); setMsg(null);
    const res = await createStaffUser(form);
    setBusy(false);
    if (!res.ok) { setMsg({ k: "err", t: res.error ?? "Error" }); return; }
    setForm({ fullName: "", email: "", password: "", roleId: roles[0]?.id ?? "", employeeCode: "" });
    setOpen(false);
    setMsg({ k: "ok", t: `Usuario creado. Su número de empleado es ${res.employeeCode}` });
    router.refresh();
  };

  const act = async (fn: Promise<{ ok: boolean; error?: string }>) => {
    const res = await fn;
    if (!res.ok) setMsg({ k: "err", t: res.error ?? "Error" });
    else { setMsg(null); router.refresh(); }
  };

  const cambiarNumero = async (u: StaffUser, code: string) => {
    if (code === (u.employeeCode ?? "")) return;
    const res = await setEmployeeCode(u.id, code);
    if (!res.ok) { setMsg({ k: "err", t: res.error ?? "Error" }); router.refresh(); return; }
    setMsg({ k: "ok", t: `${u.fullName} entra con el número ${res.employeeCode}` });
    router.refresh();
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-ink/10 px-6 py-4">
        <h2 className="text-lg text-ink">Usuarios y permisos</h2>
        <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-xs uppercase tracking-widest text-cream hover:bg-gold-dark">
          <UserPlus className="h-4 w-4" /> Nuevo usuario
        </button>
      </div>

      {msg && <p className={cn("mx-6 mt-4 rounded-lg px-4 py-2.5 text-sm", msg.k === "ok" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700")}>{msg.t}</p>}

      {open && (
        <div className="grid gap-3 border-b border-ink/10 bg-cream/40 p-6 sm:grid-cols-2">
          <input className={field} placeholder="Nombre completo" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
          <input className={field} type="email" placeholder="Correo" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <input className={field} type="password" placeholder="Contraseña (mín. 6)" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <select className={field} value={form.roleId} onChange={(e) => setForm({ ...form, roleId: e.target.value })}>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <div className="sm:col-span-2">
            <input
              className={cn(field, "sm:max-w-48")}
              inputMode="numeric"
              maxLength={4}
              placeholder="Número de empleado"
              value={form.employeeCode}
              onChange={(e) => setForm({ ...form, employeeCode: e.target.value.replace(/\D/g, "") })}
            />
            <p className="mt-1 text-xs text-muted">Cuatro dígitos con los que va a entrar al POS. Vacío = se le asigna uno.</p>
          </div>
          <button onClick={create} disabled={busy} className="flex items-center justify-center gap-2 rounded-full bg-gold px-6 py-2.5 text-sm uppercase tracking-widest text-ink hover:bg-gold-dark hover:text-cream disabled:opacity-50 sm:col-span-2">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />} Crear usuario
          </button>
        </div>
      )}

      <table className="w-full text-left text-sm">
        <thead className="border-b border-ink/10 text-xs uppercase tracking-wider text-muted">
          <tr>
            <th className="px-6 py-3 font-medium">Nombre</th>
            <th className="px-6 py-3 font-medium">N.º empleado</th>
            <th className="px-6 py-3 font-medium">Correo</th>
            <th className="px-6 py-3 font-medium">Rol</th>
            <th className="px-6 py-3 font-medium">Estado</th>
            <th className="px-6 py-3"></th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className={cn("border-b border-ink/5 last:border-0", !u.isActive && "opacity-50")}>
              <td className="px-6 py-3 text-ink">{u.fullName}</td>
              <td className="px-6 py-3">
                <div className="flex items-center gap-1.5">
                  <input
                    defaultValue={u.employeeCode ?? ""}
                    key={u.employeeCode ?? "sin"}
                    inputMode="numeric"
                    maxLength={4}
                    placeholder="—"
                    onChange={(e) => { e.target.value = e.target.value.replace(/\D/g, ""); }}
                    onBlur={(e) => cambiarNumero(u, e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                    className="w-16 rounded-lg border border-ink/15 bg-white px-2 py-1.5 text-center text-sm tabular-nums outline-none focus:border-gold"
                  />
                  <button
                    onClick={() => cambiarNumero(u, "")}
                    title="Asignar un número nuevo"
                    className="text-muted transition-colors hover:text-gold"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </button>
                </div>
              </td>
              <td className="px-6 py-3 text-muted">{u.email ?? "—"}</td>
              <td className="px-6 py-3">
                <select value={u.roleId ?? ""} onChange={(e) => act(setUserRole(u.id, e.target.value))} className="rounded-lg border border-ink/15 bg-white px-2 py-1.5 text-sm outline-none focus:border-gold">
                  {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </td>
              <td className="px-6 py-3">
                <button onClick={() => act(toggleUserActive(u.id, !u.isActive))} className={cn("rounded-full px-3 py-1 text-xs", u.isActive ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500")}>
                  {u.isActive ? "Activo" : "Inactivo"}
                </button>
              </td>
              <td className="px-6 py-3 text-right">
                <button onClick={() => { if (confirm(`¿Eliminar a ${u.fullName}?`)) act(deleteStaffUser(u.id)); }} className="text-muted hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
