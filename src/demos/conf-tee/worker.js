// Runs conf-tee in Pyodide off the main thread, so loading pandas and running
// a check don't freeze the page. Both versions are pinned so a new release
// can't change the page's behavior.
import checkPy from "./check.py?raw";

const PYODIDE_URL = "https://cdn.jsdelivr.net/pyodide/v314.0.7/full/pyodide.mjs";
const CONFTEE = "conftee==0.2.2";

const status = (message) => self.postMessage({ type: "status", message });

async function init() {
    status("Loading Python…");
    const { loadPyodide } = await import(/* @vite-ignore */ PYODIDE_URL);
    const py = await loadPyodide();
    status("Installing conf-tee…");
    await py.loadPackage("micropip");
    await py.pyimport("micropip").install(CONFTEE);
    py.runPython(checkPy);
    return py.globals.get("check");
}

let ready = null;

self.onmessage = async ({ data }) => {
    try {
        ready ??= init();
        const check = await ready;
        status("Checking…");
        const out = JSON.parse(check(data.golden, data.user, data.schema, data.infraPrefixes ? JSON.stringify(data.infraPrefixes) : null));
        self.postMessage(out.error ? { type: "error", message: out.error } : { type: "result", ...out });
    } catch (e) {
        // A failed load is retried on the next check instead of failing forever
        ready = null;
        self.postMessage({ type: "error", message: String(e?.message ?? e) });
    }
};
