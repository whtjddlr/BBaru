let kakaoMapLoaderPromise;

function buildSdkUrl(appKey) {
  const params = new URLSearchParams({
    appkey: appKey,
    autoload: "false",
    libraries: "services",
  });
  return `https://dapi.kakao.com/v2/maps/sdk.js?${params.toString()}`;
}

export function loadKakaoMapSdk(appKey) {
  if (!appKey) {
    return Promise.reject(new Error("Kakao Map JS key is not configured."));
  }

  if (window.kakao?.maps?.load) {
    return new Promise((resolve) => {
      window.kakao.maps.load(() => resolve(window.kakao));
    });
  }

  if (!kakaoMapLoaderPromise) {
    kakaoMapLoaderPromise = new Promise((resolve, reject) => {
      const existingScript = document.querySelector("script[data-kakao-map-sdk='true']");
      if (existingScript) {
        existingScript.addEventListener("load", () => {
          window.kakao.maps.load(() => resolve(window.kakao));
        });
        existingScript.addEventListener("error", () => {
          reject(new Error("Failed to load Kakao Map SDK."));
        });
        return;
      }

      const script = document.createElement("script");
      script.src = buildSdkUrl(appKey);
      script.async = true;
      script.dataset.kakaoMapSdk = "true";
      script.onload = () => {
        window.kakao.maps.load(() => resolve(window.kakao));
      };
      script.onerror = () => reject(new Error("Failed to load Kakao Map SDK."));
      document.head.appendChild(script);
    });
  }

  return kakaoMapLoaderPromise;
}

export function kakaoMapLevel(zoom) {
  return Math.min(6, Math.max(3, 20 - Number(zoom || 17)));
}

export function toKakaoLatLng(kakao, coords) {
  return new kakao.maps.LatLng(coords[0], coords[1]);
}
