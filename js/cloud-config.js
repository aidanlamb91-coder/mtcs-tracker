/* MTCS Tracker Beta v0.2.16 — cloud backup sign-in settings (modelled on AS Forms web cloud-config.js).
 * Client IDs are not secrets. No client secret is used anywhere: Google uses the browser token flow,
 * OneDrive uses authorisation code + PKCE (Azure "Single-page application" platform).
 * Redirect URI = this page's folder, i.e. https://aidanlamb91-coder.github.io/mtcs-tracker/ on the live site. */
(function (global) {
  const config = {
    googleClientId: "56595702562-cuodeuqohfmf1gjf0s6tm464mcvn1c6e.apps.googleusercontent.com", // Google Cloud project "MTCS Tracker", Web application client
    oneDriveClientId: "fac93e72-3597-47eb-b0c0-edaa2b4ae15c", // Entra app registration "MTCS Tracker" (SPA platform)
  };
  function redirectUri() { const l = global.location; return l.origin + l.pathname.replace(/[^/]*$/, ""); }
  function isConfigured(kind) { const id = kind === "google" ? config.googleClientId : config.oneDriveClientId; return !!id && !/^PASTE-/.test(id); }
  global.MtcsCloudConfig = { config, redirectUri, isConfigured };
})(window);
