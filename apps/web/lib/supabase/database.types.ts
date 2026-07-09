// PLACEHOLDER de tipos de la base de datos.
// Regenera los tipos reales cuando el proyecto Supabase esté enlazado:
//   npm run types         (usa: supabase gen types typescript --linked)
// Eso sobreescribe este archivo con los tipos exactos de todas las tablas.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      [key: string]: {
        Row: Record<string, Json>;
        Insert: Record<string, Json | undefined>;
        Update: Record<string, Json | undefined>;
        Relationships: [];
      };
    };
    Views: { [key: string]: { Row: Record<string, Json> } };
    Functions: { [key: string]: { Args: Record<string, Json>; Returns: Json } };
    Enums: { [key: string]: string };
    CompositeTypes: { [key: string]: Record<string, Json> };
  };
};
