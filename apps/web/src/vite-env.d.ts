/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** The game server's base URL for rooms (Socket.IO). Defaults to localhost:8080. */
  readonly VITE_SERVER_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
