import Keycloak from "keycloak-js";

const keycloak = new Keycloak({
  url: import.meta.env.VITE_KEYCLOAK_URL || "http://localhost:8080",
  realm: import.meta.env.VITE_KEYCLOAK_REALM || "polyglot",
  clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID || "polyglot-web",
});

let initialization: Promise<boolean> | null = null;

export function initializeAuth(): Promise<boolean> {
  if (!initialization) {
    initialization = keycloak.init({
      onLoad: "login-required",
      flow: "standard",
      pkceMethod: "S256",
      checkLoginIframe: false,
    });
  }

  return initialization;
}

export async function getAccessToken(): Promise<string> {
  if (!keycloak.authenticated) {
    await keycloak.login();
    throw new Error("Authentication required");
  }

  await keycloak.updateToken(30);

  if (!keycloak.token) {
    throw new Error("No Keycloak access token is available");
  }

  return keycloak.token;
}

export function logout(): void {
  keycloak.logout({
    redirectUri: window.location.origin,
  });
}

export function hasRealmRole(role: string): boolean {
  return keycloak.hasRealmRole(role);
}

export default keycloak;
