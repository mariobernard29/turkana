"use client";

import { Printer } from "lucide-react";

export function PrintButton({ label = "Imprimir" }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-2 rounded-full border border-ink/15 bg-white px-4 py-2 text-sm text-ink transition-colors hover:border-gold"
    >
      <Printer className="h-4 w-4" /> {label}
    </button>
  );
}
