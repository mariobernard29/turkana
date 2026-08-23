"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Loader2, Trash2, RefreshCw, Pencil, X, Archive, ChevronDown, Undo2 } from "lucide-react";
import { createStaffUser, setUserRole, setEmployeeCode, toggleUserActive, deleteStaffUser, updateStaffUser, reactivateStaffUser, type StaffUser, type ArchivedUser } from "@/app/admin/ajustes/user-actions";
import { formatStore } from "@/lib/dates";
import { cn } from "@/lib/utils";

type Role = { id: string; key: string; name: string };
type EditForm = { fullName: string; email: string; password: string };

export function UsersManager({ users, roles, archived = [], canEditUsers = false }: { users: StaffUser[]; roles: Role[]; archived?: ArchivedUser[]; canEditUsers?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [verArchivados, setVerArchivados] = useState(false);
  const [form, setForm] = useState({ fullName: "", email: "", password: "", roleId: roles[0]?.id ?? "", employeeCode: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ k: "ok" | "err"; t: string } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [edit, setEdit] = useState<EditForm>({ fullName: "", email: "", password: "" });
  const [saving, setSaving] = useState(false);

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

  const act = async (fn: Promise<{ ok: boolean; error?: string; message?: string }>) => {
    const res = await fn;
    if (!res.ok) setMsg({ k: "err", t: res.error ?? "Error" });
    else { setMsg(res.message ? { k: "ok", t: res.message } : null); router.refresh(); }
  };

  const abrirEdicion = (u: StaffUser) => {
    if (editing === u.id) { setEditing(null); return; }
    setEditing(u.id);
    setEdit({ fullName: u.fullName, email: u.email ?? "", password: "" });
    setMsg(null);
  };

  const guardarEdicion = async (u: StaffUser) => {
    setSaving(true);
    // Sólo se mandan los campos que cambian: así no se reescribe el correo en
    // auth ni se toca la contraseña cuando el campo quedó vacío, y el mensaje
    // de vuelta dice exactamente qué se movió.
    const res = await updateStaffUser(u.id, {
      ...(edit.fullName.trim() !== u.fullName ? { fullName: edit.fullName } : {}),
      ...(edit.email.trim().toLowerCase() !== (u.email ?? "").toLowerCase() ? { email: edit.email } : {}),
      ...(edit.password ? { password: edit.password } : {}),
    });
    setSaving(false);
    if (!res.ok) { setMsg({ k: "err", t: res.error ?? "Error" }); return; }
    setEditing(null);
    setEdit({ fullName: "", email: "", password: "" });
    setMsg({ k: "ok", t: res.message ?? "Datos actualizados" });
    router.refresh();
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
          <Fragment key={u.id}>
            <tr className={cn("border-b border-ink/5 last:border-0", !u.isActive && "opacity-50", editing === u.id && "border-b-0 bg-cream/30")}>
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
              <td className="px-6 py-3">
                <div className="flex items-center justify-end gap-3">
                  {canEditUsers && (
                    <button onClick={() => abrirEdicion(u)} title="Cambiar nombre, correo o contraseña" className={cn("transition-colors", editing === u.id ? "text-gold" : "text-muted hover:text-gold")}>
                      {editing === u.id ? <X className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                    </button>
                  )}
                  <button onClick={() => { if (confirm(`¿Eliminar a ${u.fullName}?`)) act(deleteStaffUser(u.id)); }} title="Eliminar" className="text-muted hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                </div>
              </td>
            </tr>

            {editing === u.id && (
              <tr className="border-b border-ink/5 bg-cream/30 last:border-0">
                <td colSpan={6} className="px-6 pb-5 pt-1">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <label className="text-xs uppercase tracking-wider text-muted">
                      Nombre completo
                      <input className={cn(field, "mt-1")} value={edit.fullName} onChange={(e) => setEdit({ ...edit, fullName: e.target.value })} />
                    </label>
                    <label className="text-xs uppercase tracking-wider text-muted">
                      Correo
                      <input className={cn(field, "mt-1")} type="email" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} />
                    </label>
                    <label className="text-xs uppercase tracking-wider text-muted">
                      Nueva contraseña
                      <input className={cn(field, "mt-1")} type="password" autoComplete="new-password" placeholder="Dejar vacío para no cambiarla" value={edit.password} onChange={(e) => setEdit({ ...edit, password: e.target.value })} />
                    </label>
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <button onClick={() => guardarEdicion(u)} disabled={saving} className="flex items-center gap-2 rounded-full bg-gold px-5 py-2 text-xs uppercase tracking-widest text-ink hover:bg-gold-dark hover:text-cream disabled:opacity-50">
                      {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Guardar cambios
                    </button>
                    <button onClick={() => setEditing(null)} className="text-xs uppercase tracking-widest text-muted hover:text-ink">Cancelar</button>
                    <span className="text-xs text-muted">La contraseña nueva entra en vigor de inmediato; avísale en persona.</span>
                  </div>
                </td>
              </tr>
            )}
          </Fragment>
          ))}
        </tbody>
      </table>

      {archived.length > 0 && (
        <div className="border-t border-ink/10 bg-cream/20">
          <button
            onClick={() => setVerArchivados((v) => !v)}
            className="flex w-full items-center gap-2 px-6 py-3 text-xs uppercase tracking-widest text-muted transition-colors hover:text-ink"
          >
            <Archive className="h-4 w-4" />
            Archivados ({archived.length})
            <ChevronDown className={cn("h-4 w-4 transition-transform", verArchivados && "rotate-180")} />
          </button>

          {verArchivados && (
            <div className="px-6 pb-5">
              <p className="mb-3 text-xs text-muted">
                Se archivan en vez de borrarse cuando ya tienen movimientos (ventas, cortes de
                caja) que no se pueden perder. No pueden entrar y su número quedó libre.
              </p>
              <ul className="divide-y divide-ink/5 rounded-xl border border-ink/10 bg-white">
                {archived.map((u) => (
                  <li key={u.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
                    <span className="text-ink">{u.fullName}</span>
                    <span className="text-muted">{u.email ?? "—"}</span>
                    {u.deletedAt && <span className="text-xs text-muted">Archivado el {formatStore(u.deletedAt)}</span>}
                    <button
                      onClick={() => act(reactivateStaffUser(u.id))}
                      className="ml-auto flex items-center gap-1.5 rounded-full border border-ink/15 px-4 py-1.5 text-xs uppercase tracking-widest text-ink transition-colors hover:border-gold hover:bg-gold hover:text-ink"
                    >
                      <Undo2 className="h-3.5 w-3.5" /> Reactivar
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
