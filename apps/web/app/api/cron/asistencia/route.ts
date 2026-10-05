// Cron diario de Vercel (ver vercel.json): manda el reporte semanal de asistencia
// el día en que empieza la semana laboral. Vercel firma la llamada con
// `Authorization: Bearer $CRON_SECRET`; sin ese secreto la ruta no hace nada.
import { NextResponse } from "next/server";
import { runWeeklyAttendanceReport } from "@/lib/attendance-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  try {
    const res = await runWeeklyAttendanceReport();
    console.log("[cron asistencia]", res);
    return NextResponse.json({ ok: true, ...res });
  } catch (e) {
    console.error("[cron asistencia] error:", e);
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
