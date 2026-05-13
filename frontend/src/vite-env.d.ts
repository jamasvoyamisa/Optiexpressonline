/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_NOMINA_ENABLED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
