import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { bootstrap } from "./data/bootstrap";
import { AppStoreProvider } from "./store/AppStore";
import { AuthProvider, useAuth } from "./store/AuthContext";
import { RouterProvider } from "./store/router";
import { AuthScreen } from "./components/auth/AuthScreen";
import { App } from "./App";
import { installPrintScoping } from "./utils/print";
import { startServerSync } from "./data/serverSync";

installPrintScoping();

// The app's data is in PostgreSQL (REQUIREMENTS §55): once somebody has signed
// in, their working copy is loaded from the database — and only then is the
// app started (bootstrap seeds, generates and prepares on that copy).
function DataGate({ userId, children }: { userId: string; children: React.ReactNode }) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setState("loading");
    startServerSync(userId)
      .then(() => {
        if (cancelled) return;
        bootstrap();
        setState("ready");
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [userId, attempt]);
  if (state === "loading") return <div className="empty-state" data-state="loading-database">Loading the records from the database…</div>;
  if (state === "error") {
    return (
      <div className="empty-state" data-state="database-unreachable">
        <h2 className="text-xl mb-2">The database could not be reached</h2>
        <p className="text-muted mb-3">The records are kept in the company's PostgreSQL database, and the server did not answer. Check that the server is running, then try again.</p>
        <button className="btn btn-primary" onClick={() => setAttempt((n) => n + 1)}>
          Try again
        </button>
      </div>
    );
  }
  return <>{children}</>;
}

function Root() {
  const { status, user } = useAuth();

  if (status === "checking") {
    return <div className="empty-state">Loading…</div>;
  }
  if (status === "unauthenticated" || !user) {
    return <AuthScreen />;
  }
  return (
    <DataGate key={user.id} userId={user.id}>
      <AppStoreProvider>
        <RouterProvider>
          <App />
        </RouterProvider>
      </AppStoreProvider>
    </DataGate>
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
