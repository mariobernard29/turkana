import Image from "next/image";

// Tarjeta dorada de membresía Turkana Rewards (sin saldo: el programa es de beneficios).
export function RewardsCard({ name }: { name: string }) {
  return (
    <div className="relative aspect-[1.586/1] w-full max-w-sm overflow-hidden rounded-2xl p-6 text-[#3a2f1c] shadow-xl"
      style={{ background: "linear-gradient(135deg, #d9c08a 0%, #a08c6b 45%, #856f4f 100%)" }}>
      <div className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full bg-white/20 blur-2xl" />

      <div className="flex items-start justify-between">
        <Image src="/turkana-wordmark.png" alt="Turkana" width={120} height={21} className="h-5 w-auto opacity-90 brightness-0" />
        <span className="text-[10px] uppercase tracking-[0.25em]">Rewards</span>
      </div>

      <div className="mt-5 h-7 w-10 rounded-md bg-[#3a2f1c]/20" />

      <div className="mt-5">
        <p className="text-[10px] uppercase tracking-widest opacity-70">Acceso exclusivo</p>
        <p className="font-serif text-2xl">Miembro Turkana</p>
      </div>

      <div className="mt-3">
        <p className="text-[9px] uppercase tracking-[0.25em] opacity-60">Titular</p>
        <p className="text-sm uppercase tracking-wider">{name}</p>
      </div>
    </div>
  );
}
