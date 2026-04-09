let tmapMapLoaderPromise;
const TMAP_CORE_SCRIPT = "tmapjs2.min.js?version=20231206";

function buildSdkUrl(appKey) {
  const params = new URLSearchParams({
    version: "1",
    appKey,
  });
  return `https://apis.openapi.sk.com/tmap/jsv2?${params.toString()}`;
}

export function loadTmapMapSdk(appKey) {
  if (!appKey) {
    return Promise.reject(new Error("TMAP Map JS key is not configured."));
  }

  if (window.Tmapv2?.Map) {
    return Promise.resolve(window.Tmapv2);
  }

  if (!tmapMapLoaderPromise) {
    tmapMapLoaderPromise = new Promise((resolve, reject) => {
      const waitForTmapMap = () =>
        new Promise((innerResolve, innerReject) => {
          const start = Date.now();
          const timer = window.setInterval(() => {
            if (window.Tmapv2?.Map) {
              window.clearInterval(timer);
              innerResolve(window.Tmapv2);
              return;
            }
            if (Date.now() - start > 4000) {
              window.clearInterval(timer);
              innerReject(new Error("TMAP Map SDK loaded, but Tmapv2.Map was not initialized."));
            }
          }, 80);
        });

      const loadCoreScript = () => {
        const base = window.Tmapv2?._getScriptLocation?.();
        if (!base) {
          reject(new Error("TMAP bootstrap loaded, but script location was not found."));
          return;
        }

        const existingCore = document.querySelector("script[data-tmap-map-core='true']");
        if (existingCore) {
          waitForTmapMap().then(resolve).catch(reject);
          return;
        }

        const coreScript = document.createElement("script");
        coreScript.src = `${base}${TMAP_CORE_SCRIPT}`;
        coreScript.async = true;
        coreScript.dataset.tmapMapCore = "true";
        coreScript.onload = () => {
          waitForTmapMap().then(resolve).catch(reject);
        };
        coreScript.onerror = () => reject(new Error("Failed to load TMAP core map script."));
        document.head.appendChild(coreScript);
      };

      const existingBootstrap = document.querySelector("script[data-tmap-map-sdk='true']");
      if (existingBootstrap) {
        if (window.Tmapv2?.Map) {
          resolve(window.Tmapv2);
        } else {
          loadCoreScript();
        }
        return;
      }

      const script = document.createElement("script");
      script.src = buildSdkUrl(appKey);
      script.async = true;
      script.dataset.tmapMapSdk = "true";
      script.onload = () => {
        if (window.Tmapv2?.Map) {
          resolve(window.Tmapv2);
          return;
        }
        loadCoreScript();
      };
      script.onerror = () => reject(new Error("Failed to load TMAP Map bootstrap script."));
      document.head.appendChild(script);
    });
  }

  return tmapMapLoaderPromise;
}

export function toTmapLatLng(Tmapv2, coords) {
  return new Tmapv2.LatLng(coords[0], coords[1]);
}
