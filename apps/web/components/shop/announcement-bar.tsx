"use client";

import { useEffect, useState } from "react";
import { Sparkles, Truck, Gift } from "lucide-react";

const MESSAGES = [
  { icon: Truck, text: "Envío gratis en compras seleccionadas" },
  { icon: Gift, text: "Únete gratis a Turkana Rewards y recibe cupones exclusivos" },
  { icon: Sparkles, text: "Piercing Party: perforaciones al 2×1 · síguenos en redes" },
];

export function AnnouncementBar() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((p) => (p + 1) % MESSAGES.length), 4000);
    return () => clearInterval(t);
  }, []);

  const M = MESSAGES[i].icon;
  return (
    <div
      className="overflow-hidden text-center text-[11px] uppercase tracking-[0.15em] text-ink sm:text-xs"
      style={{ background: "linear-gradient(90deg,#d9c08a 0%,#a08c6b 50%,#d9c08a 100%)" }}
    >
      <div key={i} className="flex items-center justify-center gap-2 px-4 py-2" style={{ animation: "tk-fade 0.6s ease" }}>
        <M className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
        <span>{MESSAGES[i].text}</span>
      </div>
      <style>{`@keyframes tk-fade{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}`}</style>
    </div>
  );
}
