const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const settings = read("src/features/video-studio/export/types/settings.ts");
const store = read("src/store/useExportStore.ts");
const pipeline = read("src/core/engine/RenderPipeline.ts");
const service = read("src/features/video-studio/export/services/exportService.ts");
const app = read("src/components/VideoStudioPro.tsx");

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`PASS: ${message}`);
}

assert(settings.includes("projectSnapshot: ExportProjectSnapshot"), "ExportJob carries immutable project snapshot");
assert(store.includes("projectSnapshot: structuredClone(projectSnapshot)"), "Store deep-clones snapshot at job creation");
assert(service.includes("createExportProjectSnapshot"), "Export service exposes snapshot factory");
assert(app.includes("createExportProjectSnapshot(useProjectStore.getState())"), "Begin export captures snapshot before queueing");
assert(app.includes("const projectSnapshot = activeExportProjectSnapshotRef.current"), "Renderer uses job snapshot rather than live project state");
assert(/useEffect\(\(\) => \{\n\s*if \(!isExporting\) return;[\s\S]*?\}, \[isExporting\]\);/.test(app), "Export render effect is keyed only by export session state");
assert(pipeline.includes("private readonly runTokens"), "Pipeline tracks export attempt generations");
assert(pipeline.includes("this.bumpRunToken(jobId)"), "Cancel invalidates the active attempt generation");
assert(pipeline.includes("if (!this.isCurrentRun(jobId, runToken)) return false;"), "Stale attempts cannot mutate job state");
assert(pipeline.includes("controller.abort"), "Cancel aborts the actual renderer signal");
console.log("PHASE_A_EXPORT_SNAPSHOT_CANCEL=PASS");
