/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** The peers relay's WebSocket address, `wss://…/ws`; see `server/`. */
  readonly VITE_PEERS_URL?: string;
}
