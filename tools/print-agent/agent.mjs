// Agente de impresión de Turkana.
//
// Corre en la PC del mostrador, la única máquina que alcanza a la impresora.
// El sistema vive en la nube y no puede hablarle a una IP de la tienda, así que
// el sentido se invierte: la venta deja el ticket en la cola `print_jobs` y este
// programa lo recoge y lo vuelca al puerto 9100 de la POS895.
//
// No sabe nada del diseño del ticket: recibe bytes ESC/POS ya armados por la app
// y sólo los mueve. Así, cambiar un ticket se despliega con la web y no obliga a
// venir a actualizar esta PC.
//
//   node agent.mjs          arranca el agente
//   node agent.mjs --test   imprime una página de prueba y sale

import net from "node:net";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

// ── Configuración ───────────────────────────────────────────────────────────
const envFile = join(HERE, ".env");
if (existsSync(envFile)) process.loadEnvFile(envFile);

const cfg = {
  url: process.env.SUPABASE_URL,
  anonKey: process.env.SUPABASE_ANON_KEY,
  email: process.env.AGENT_EMAIL,
  password: process.env.AGENT_PASSWORD,
  printerId: process.env.PRINTER_ID,
  host: process.env.PRINTER_HOST,
  port: Number(process.env.PRINTER_PORT || 9100),
};

const CHUNK = 2048;            // el bitmap del logo desborda el búfer de algunas térmicas
const SOCKET_TIMEOUT_MS = 8000;
const PROBE_TIMEOUT_MS = 3000;
const HEARTBEAT_MS = 30_000;
const POLL_MS = 5000;          // red de seguridad por si se cae el websocket
const CLEANUP_MS = 60 * 60 * 1000;
const KEEP_DONE_DAYS = 7;
const MAX_ATTEMPTS = 3;

const log = (...a) => console.log(new Date().toLocaleTimeString("es-MX"), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function requireConfig(keys) {
  const faltan = keys.filter((k) => !cfg[k]);
  if (faltan.length) {
    console.error("Falta configurar en .env:", faltan.join(", "));
    console.error("Copia .env.example a .env y llénalo. Ver README.md.");
    process.exit(1);
  }
}

// ── Impresora ───────────────────────────────────────────────────────────────
// Escritura cruda por TCP. El driver de Windows no interviene: estos bytes ya
// son comandos ESC/POS y el driver sólo los estorbaría.
function sendToPrinter(bytes) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: cfg.host, port: cfg.port });
    let settled = false;
    const fail = (e) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(e instanceof Error ? e : new Error(String(e)));
    };

    socket.setTimeout(SOCKET_TIMEOUT_MS, () => fail(new Error("la impresora no contestó a tiempo")));
    socket.on("error", fail);
    socket.on("close", () => { if (!settled) { settled = true; resolve(); } });

    socket.on("connect", async () => {
      try {
        for (let i = 0; i < bytes.length; i += CHUNK) {
          if (!socket.write(bytes.subarray(i, i + CHUNK))) await once(socket, "drain");
        }
        socket.end();
      } catch (e) {
        fail(e);
      }
    });
  });
}

// ¿La impresora está encendida y en la red? Se comprueba abriendo y cerrando la
// conexión, sin mandar nada.
function probePrinter() {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: cfg.host, port: cfg.port });
    const done = (ok) => { socket.destroy(); resolve(ok); };
    socket.setTimeout(PROBE_TIMEOUT_MS, () => done(false));
    socket.on("error", () => done(false));
    socket.on("connect", () => done(true));
  });
}

// ── Página de prueba ────────────────────────────────────────────────────────
function testPage() {
  const ESC = 0x1b, GS = 0x1d;
  const b = [];
  const text = (s) => b.push(...Buffer.from(s, "ascii"));
  b.push(ESC, 0x40);              // init
  b.push(ESC, 0x61, 0x01);        // centrado
  b.push(GS, 0x21, 0x11);         // doble alto y ancho
  text("TURKANA\n");
  b.push(GS, 0x21, 0x00);
  text("Prueba de impresion\n");
  text(new Date().toLocaleString("es-MX") + "\n");
  text(cfg.host + ":" + cfg.port + "\n");
  text("--------------------------------\n");
  text("Si lees esto, el agente puede\n");
  text("imprimir sin pasar por el\n");
  text("navegador.\n");
  b.push(ESC, 0x64, 0x03);        // avanza 3 lineas
  b.push(GS, 0x56, 0x42, 0x00);   // corte parcial
  return Buffer.from(b);
}

// ── Supabase ────────────────────────────────────────────────────────────────
async function connect() {
  // Se carga aquí y no arriba para que `--test` funcione en una PC recién
  // copiada, antes de correr npm install: si no imprime, lo primero que se
  // quiere descartar es la impresora, no las dependencias.
  const { createClient } = await import("@supabase/supabase-js");

  const sb = createClient(cfg.url, cfg.anonKey, {
    auth: { persistSession: false, autoRefreshToken: true },
  });

  const { data, error } = await sb.auth.signInWithPassword({
    email: cfg.email, password: cfg.password,
  });
  if (error) {
    console.error("No se pudo entrar a Supabase:", error.message);
    console.error("Revisa AGENT_EMAIL y AGENT_PASSWORD; el usuario debe ser del personal.");
    process.exit(1);
  }
  sb.realtime.setAuth(data.session.access_token);
  sb.auth.onAuthStateChange((_e, session) => {
    if (session) sb.realtime.setAuth(session.access_token);
  });

  return sb;
}

// ── Cola ────────────────────────────────────────────────────────────────────
let draining = false;

async function drain(sb) {
  if (draining) return;
  draining = true;
  try {
    for (;;) {
      const { data, error } = await sb
        .from("print_jobs").select("id, payload, attempts, label")
        .eq("printer_id", cfg.printerId).eq("status", "pending")
        .order("created_at", { ascending: true }).limit(1);
      if (error) { log("no se pudo leer la cola:", error.message); return; }

      const job = data?.[0];
      if (!job) return;

      // Reclamo: si otro proceso ya lo tomó, el update no toca ninguna fila.
      const { data: claimed } = await sb
        .from("print_jobs")
        .update({ status: "printing", claimed_at: new Date().toISOString(), attempts: job.attempts + 1 })
        .eq("id", job.id).eq("status", "pending")
        .select("id");
      if (!claimed?.length) continue;

      const name = job.label || job.id.slice(0, 8);
      try {
        await sendToPrinter(Buffer.from(job.payload, "base64"));
        await sb.from("print_jobs")
          .update({ status: "done", printed_at: new Date().toISOString(), error: null })
          .eq("id", job.id);
        log("impreso:", name);
      } catch (e) {
        const attempts = job.attempts + 1;
        const reintentar = attempts < MAX_ATTEMPTS;
        await sb.from("print_jobs")
          .update({ status: reintentar ? "pending" : "error", error: e.message })
          .eq("id", job.id);
        log("falló " + name + ": " + e.message +
            (reintentar ? " (intento " + attempts + " de " + MAX_ATTEMPTS + ")" : " — se deja en error"));
        if (reintentar) await sleep(2000);
      }
    }
  } finally {
    draining = false;
  }
}

// El latido dice dos cosas a la vez: que el agente vive y que la impresora
// contesta. El POS lo usa para decidir si encolar o mandar al cajero por el
// diálogo del navegador — encolar contra una impresora apagada sólo lograría
// que el ticket saliera horas después, cuando ya nadie lo espera.
async function heartbeat(sb) {
  if (draining) return; // no robarle la conexión a un ticket en curso
  if (!(await probePrinter())) return;
  await sb.from("printers").update({ last_seen_at: new Date().toISOString() }).eq("id", cfg.printerId);
}

async function cleanup(sb) {
  const limite = new Date(Date.now() - KEEP_DONE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await sb.from("print_jobs").delete().eq("status", "done").lt("created_at", limite);
}

// ── Arranque ────────────────────────────────────────────────────────────────
async function main() {
  if (process.argv.includes("--test")) {
    requireConfig(["host"]);
    log("imprimiendo página de prueba en " + cfg.host + ":" + cfg.port + "…");
    await sendToPrinter(testPage());
    log("listo: si no salió papel, revisa la IP y que la impresora esté encendida.");
    return;
  }

  requireConfig(["url", "anonKey", "email", "password", "printerId", "host"]);
  const sb = await connect();
  log("agente listo · impresora " + cfg.host + ":" + cfg.port);

  // Realtime para que el ticket salga en cuanto se cobra.
  sb.channel("print_jobs_agent")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "print_jobs", filter: "printer_id=eq." + cfg.printerId },
      () => drain(sb),
    )
    .subscribe((estado) => log("realtime:", estado));

  // Al arrancar se imprime lo que quedó pendiente mientras la PC estaba apagada.
  await heartbeat(sb);
  await drain(sb);

  setInterval(() => heartbeat(sb), HEARTBEAT_MS);
  setInterval(() => drain(sb), POLL_MS);
  setInterval(() => cleanup(sb), CLEANUP_MS);
}

main().catch((e) => {
  // Nada de volcados de pila: esto lo lee quien atiende el mostrador.
  console.error("El agente se detuvo:", e.message ?? e);
  if (/ECONNREFUSED|EHOSTUNREACH|ETIMEDOUT|no contestó/.test(String(e.message))) {
    console.error(`No hubo respuesta en ${cfg.host}:${cfg.port}. Revisa que la impresora esté`);
    console.error("encendida, conectada a la red y que esa sea su IP.");
    console.error(`Puedes comprobarlo con:  Test-NetConnection ${cfg.host} -Port ${cfg.port}`);
  }
  process.exit(1);
});
