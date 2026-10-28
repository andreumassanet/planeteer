/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** The peers relay's WebSocket address, `wss://…/ws`; see `server/`. */
  readonly VITE_PEERS_URL?: string;
  /** The Supabase project behind the optional accounts, `https://….supabase.co`; absent, there are none. */
  readonly VITE_SUPABASE_URL?: string;
  /** Its publishable key: public by design, every table it reaches is held by row-level security. */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}
