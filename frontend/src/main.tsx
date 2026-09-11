import React from "react";
import { createRoot } from "react-dom/client";
import { bootstrap } from "./data/bootstrap";
import { AppStoreProvider } from "./store/AppStore";
import { AuthProvider, useAuth } from "./store/AuthContext";
import { RouterProvider } from "./store/router";
import { AuthScreen } from "./components/auth/AuthScreen";
import { App } from "./App";
import { installPrintScoping } from "./utils/print";

bootstrap();
installPrintScoping();

function Root() {
  const { status } = useAuth();

  if (status === "checking") {
    return <div className="empty-state">Loading…</div>;
  }
  if (status === "unauthenticated") {
    return <AuthScreen />;
  }
  return (
    <AppStoreProvider>
      <RouterProvider>
        <App />
      </RouterProvider>
    </AppStoreProvider>
  );
}

const el = document.getElementById("root");
if (!el) throw new Error("Root element not found");

createRoot(el).render(
  <React.StrictMode>
    <AuthProvider>
      <Root />
    </AuthProvider>
  </React.StrictMode>
);
