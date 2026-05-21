const PLAUSIBLE_SCRIPT_ID = "plausible-alpha-analytics";

export function initializeAlphaAnalytics() {
  const domain = import.meta.env.VITE_PLAUSIBLE_DOMAIN;
  if (!domain || typeof document === "undefined") return;
  if (document.getElementById(PLAUSIBLE_SCRIPT_ID)) return;

  const script = document.createElement("script");
  script.id = PLAUSIBLE_SCRIPT_ID;
  script.defer = true;
  script.dataset.domain = domain;
  script.src = import.meta.env.VITE_PLAUSIBLE_SRC || "https://plausible.io/js/script.js";
  document.head.appendChild(script);
}
