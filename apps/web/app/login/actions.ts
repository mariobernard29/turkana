"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function login(formData: FormData) {
  const email = String(formData.get("email"));
  const password = String(formData.get("password"));
  const dest = String(formData.get("redirect") || "/admin");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Log del lado servidor para diagnóstico (revisa la terminal de `npm run dev`).
    console.error("[login] signInWithPassword error:", error);
    const msg = error.message?.trim() || error.code || "Error de autenticación";
    redirect(`/login?error=${encodeURIComponent(msg)}`);
  }
  redirect(dest);
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
