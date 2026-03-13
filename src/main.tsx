import React, { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

const PreviewWindow = lazy(() => import("./windows/PreviewWindow"));
const LogsWindow = lazy(() => import("./windows/LogsWindow"));

const hash = window.location.hash;

let Root: React.ReactNode;
if (hash.startsWith("#/preview")) {
  Root = (
    <Suspense fallback={<div className="flex items-center justify-center h-screen bg-zinc-900 text-zinc-400 text-sm">Loading…</div>}>
      <PreviewWindow />
    </Suspense>
  );
} else if (hash.startsWith("#/logs")) {
  Root = (
    <Suspense fallback={<div className="flex items-center justify-center h-screen bg-zinc-900 text-zinc-400 text-sm">Loading…</div>}>
      <LogsWindow />
    </Suspense>
  );
} else {
  Root = <App />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>{Root}</React.StrictMode>
);
