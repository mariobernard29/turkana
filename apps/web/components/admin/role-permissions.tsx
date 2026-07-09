"use client";

import { useState } from "react";
import { toggleRolePermission, type RolesData } from "@/app/admin/ajustes/user-actions";

export function RolePermissions({ data }: { data: RolesData }) {
  const [granted, setGranted] = useState<Set<string>>(new Set(data.granted));
  const [pending, setPending] = useState<string | null>(null);

  const toggle = async (roleId: string, permId: string) => {
    const key = `${roleId}:${permId}`;
    const enabled = !granted.has(key);
    setPending(key);
    const next = new Set(granted);
    if (enabled) next.add(key); else next.delete(key);
    setGranted(next);
    await toggleRolePermission(roleId, permId, enabled);
    setPending(null);
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-sm">
      <div className="border-b border-ink/10 px-6 py-4">
        <h2 className="text-lg text-ink">Permisos por rol</h2>
        <p className="mt-1 text-xs text-muted">Marca qué puede hacer cada rol. El Super Admin siempre tiene acceso total.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-ink/10 text-xs uppercase tracking-wider text-muted">
            <tr>
              <th className="px-6 py-3 font-medium">Permiso</th>
              {data.roles.map((r) => <th key={r.id} className="px-3 py-3 text-center font-medium">{r.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {data.permissions.map((p) => (
              <tr key={p.id} className="border-b border-ink/5 last:border-0">
                <td className="px-6 py-2.5">
                  <span className="text-ink">{p.key}</span>
                  {p.description && <span className="ml-2 text-xs text-muted">{p.description}</span>}
                </td>
                {data.roles.map((r) => {
                  const isSuper = r.key === "super_admin";
                  const key = `${r.id}:${p.id}`;
                  const checked = isSuper || granted.has(key);
                  return (
                    <td key={r.id} className="px-3 py-2.5 text-center">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={isSuper || pending === key}
                        onChange={() => toggle(r.id, p.id)}
                        className="h-4 w-4 accent-gold disabled:opacity-40"
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
