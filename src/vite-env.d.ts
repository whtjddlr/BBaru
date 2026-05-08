/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly ODSAY_API_KEY?: string;
  readonly VITE_ODSAY_API_KEY?: string;
  readonly VITE_NAVER_MAP_CLIENT_ID?: string;
  readonly VITE_NAVER_MAP_KEY_ID?: string;
  readonly VITE_NAVER_MAP_SUBMODULES?: string;
  readonly VITE_BBARU_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
