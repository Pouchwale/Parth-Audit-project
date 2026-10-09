import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { bootstrap } from "./data/bootstrap";
import { AppStoreProvider } from "./store/AppStore";
import { AuthProvider, useAuth } from "./store/AuthContext";
import { RouterProvider } from "./store/router";
import { AuthScreen } from "./components/auth/AuthScreen";
import { ChangePasswordDialog } from "./components/common/ChangePasswordDialog";
import { AuthLayout } from "./components/auth/AuthLayout";
// REQUIREMENTS §81: the 3D introduction when the system opens straight into the app (a session still open from earlier in the day).
import { SessionIntro } from "./components/auth/IntroSplash";
// REQUIREMENTS §84: the warning ten minutes before the close of the working day, and the sign-out at it.
import { SessionClock } from "./components/auth/SessionClock";
import { App } from "./App";
import { installPrintScoping } from "./utils/print";
import { startServerSync, SyncError, type SyncErrorKind } from "./data/serverSync";
import { measureWorkingCopy } from "./data/storageAdapter";
import { demoModeAvailable } from "./engine/features";
import { api } from "./api/client";

installPrintScoping();

// The app's data is in PostgreSQL (REQUIREMENTS §55): once somebody has signed
// in, their working copy is loaded from the database — and only then is the
// app started (bootstrap seeds, generates and prepares on that copy).
const LOAD_FAILURES: Record<Exclude<SyncErrorKind, "signed-out">, { state: string; title: string; text: string }> = {
  unreachable: {
    state: "database-unreachable",
    title: "The database could not be reached",
    text: "The records are kept in the company's PostgreSQL database, and the server did not answer. Check that the server is running, then try again.",
  },
  "no-room": {
    state: "database-no-room",
    title: "This browser has no room for the company's records",
    text: "Nothing is lost: the records are kept in the company's PostgreSQL database. This browser keeps a working copy of them, and it could not make room for that copy this time. Close the app's other tabs in this browser, then try again.",
  },
  "storage-disabled": {
    state: "database-storage-blocked",
    title: "This browser does not let the app keep its working copy",
    text: "Site data is blocked for this app in the browser's settings, so nothing could be kept or saved to the database. Allow site data for this address, then try again.",
  },
};

function DataGate({ userId, children }: { userId: string; children: React.ReactNode }) {
  const [state, setState] = useState<"loading" | "ready" | SyncErrorKind>("loading");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setState("loading");
    startServerSync(userId)
      .then(() => {
        if (cancelled) return;
        bootstrap();
        // Once, with the working copy as it now stands: how close this browser is
        // to the space it allows the app (REQUIREMENTS §65). No timer — it only
        // grows as records are filled, and a save that does not fit says so itself.
        measureWorkingCopy();
        setState("ready");
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) setState(err instanceof SyncError ? err.kind : "unreachable");
        // The records refused because the plant's working hours are over (REQUIREMENTS §84)? The load
        // cannot tell; asking who is signed in can — and a refusal outside the hours signs the person
        // out to its reason (api/client.ts, store/AuthContext.tsx) instead of leaving them at this screen.
        if (!(err instanceof SyncError) || err.kind === "unreachable") void api.get("/auth/me").catch(() => undefined);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, attempt]);
  // Signed out while loading: the sign-in screen takes over (store/AuthContext.tsx).
  if (state === "loading" || state === "signed-out") return <div className="empty-state" data-state="loading-database">Loading the records from the database…</div>;
  if (state !== "ready") {
    const failure = LOAD_FAILURES[state];
    return (
      <div className="empty-state" data-state={failure.state}>
        <h2 className="text-xl mb-2">{failure.title}</h2>
        <p className="text-muted mb-3">
          {failure.text}
          {/* Demo Mode is named only where it exists (engine/features.ts, REQUIREMENTS §65). */}
          {state === "no-room" && demoModeAvailable() ? " Clearing the demo data (Demo Mode → Clear All Demo Data) from another computer makes room too." : ""}
        </p>
        <button className="btn btn-primary" onClick={() => setAttempt((n) => n + 1)}>
          Try again
        </button>
      </div>
    );
  }
  return <>{children}</>;
}

function Root() {
  const { status, user, retry, mustChangePassword, passwordChosen, logout } = useAuth();

  if (status === "checking") {
    return <div className="empty-state">Loading…</div>;
  }
  if (status === "unreachable") {
    return (
      <div className="empty-state" data-state="server-unreachable">
        <h2 className="text-xl mb-2">The server could not be reached</h2>
        <p className="text-muted mb-3">The app could not ask the server (or its PostgreSQL database) who is signed in. Check that the server is running, then try again.</p>
        <button className="btn btn-primary" onClick={retry}>
          Try again
        </button>
      </div>
    );
  }
  if (status === "unauthenticated" || !user) {
    return <AuthScreen />;
  }
  // STILL ON THE PASSWORD THE ADMINISTRATOR SET (REQUIREMENTS §66). Asked for
  // here, above DataGate, so the app does not first try to load the records the
  // server is refusing this session — and so there is nothing behind the dialog
  // to reach: no sidebar, no Mitra, no briefing.
  if (mustChangePassword) {
    return (
      <AuthLayout>
        <ChangePasswordDialog required onClose={passwordChosen} onSignOut={() => void logout()} />
      </AuthLayout>
    );
  }
  return (
    <>
      {/* Over the loading screen and the app, catching nothing; once a browser session (IntroSplash.tsx). */}
      <SessionIntro />
      {/* The close of the working day: a warning ten minutes before, then the sign-out (REQUIREMENTS §84). */}
      <SessionClock />
      <DataGate key={user.id} userId={user.id}>
        <AppStoreProvider>
          <RouterProvider>
            <App />
          </RouterProvider>
        </AppStoreProvider>
      </DataGate>
    </>
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
