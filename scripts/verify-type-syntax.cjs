const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const extensions = new Set(['.ts', '.tsx']);
const ignored = new Set(['node_modules', 'dist']);
const files = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (extensions.has(path.extname(entry.name))) files.push(full);
  }
}
walk(root);

let failures = 0;
for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const result = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      jsx: ts.JsxEmit.ReactJSX,
      isolatedModules: true,
    },
    fileName: file,
    reportDiagnostics: true,
  });
  const diagnostics = (result.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error);
  if (diagnostics.length) {
    failures += diagnostics.length;
    for (const d of diagnostics) {
      const msg = ts.flattenDiagnosticMessageText(d.messageText, '\n');
      console.error(`[FAIL] ${path.relative(root, file)}: ${msg}`);
    }
  }
}

console.log(`TYPE_SYNTAX_FILES=${files.length}`);
console.log(`TYPE_SYNTAX=${failures === 0 ? 'PASS' : 'FAIL'}`);
process.exit(failures === 0 ? 0 : 1);
