// Identificador persistente del dispositivo (tablet/caja). Multidispositivo.
const KEY = "turkana_device_id";
const REGISTER_KEY = "turkana_register_id";

export function getDeviceId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
  }
  return id;
}

// Qué caja es este equipo. La fuente de verdad es una cookie —el POS se arma en
// el servidor y ahí no hay localStorage—, pero se espeja aquí porque el modo
// offline la necesita sin poder preguntarle al servidor.
export function getRegisterId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(REGISTER_KEY);
}

export function setRegisterId(id: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(REGISTER_KEY, id);
}

// Para distinguir la PC del mostrador del iPad en la lista de equipos del admin.
// iPadOS se anuncia como Mac desde iOS 13, de ahí lo de maxTouchPoints.
export function detectPlatform(): string {
  if (typeof navigator === "undefined") return "web";
  const ua = navigator.userAgent;
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "ipad";
  if (/iPhone|iPod/.test(ua)) return "ios";
  if (/Android/.test(ua)) return "android";
  if (/Windows/.test(ua)) return "windows";
  if (/Macintosh/.test(ua)) return "mac";
  return "web";
}

// Nombre legible del equipo, para que la lista del admin no sean puros UUID.
export function deviceLabel(): string {
  const p = detectPlatform();
  const names: Record<string, string> = {
    ipad: "iPad", ios: "iPhone", android: "Android", windows: "PC Windows", mac: "Mac", web: "Navegador",
  };
  return names[p] ?? "Navegador";
}
