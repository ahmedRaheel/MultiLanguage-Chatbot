import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";
import { initializeAuth } from "./auth";
import "./styles.css";

async function bootstrap() {
  try {
    await initializeAuth();

    ReactDOM.createRoot(document.getElementById("root")!).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );
  } catch (error) {
    console.error("Keycloak initialization failed", error);

    ReactDOM.createRoot(document.getElementById("root")!).render(
      <div style={{ padding: 32, fontFamily: "system-ui" }}>
        Unable to start authentication. Check that Keycloak is running.
      </div>,
    );
  }
}

bootstrap();
