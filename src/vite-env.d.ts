/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_NAVER_MAP_CLIENT_ID?: string;
  readonly VITE_NAVER_MAP_KEY_ID?: string;
  readonly VITE_NAVER_MAP_SUBMODULES?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
