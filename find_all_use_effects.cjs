const fs = require('fs');
const files = process.argv.slice(2);
let count = 0;
files.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  if (content.includes('useEffect')) {
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('useEffect(')) {
        let j = i;
        let braces = 0;
        let started = false;
        let deps = "NO DEPS ARRAY";
        while (j < lines.length) {
          const line = lines[j];
          for (let k = 0; k < line.length; k++) {
            if (line[k] === '{') { braces++; started = true; }
            if (line[k] === '}') { braces--; }
          }
          if (started && braces === 0) {
            const rest = line.substring(line.indexOf('}') + 1) + (lines[j+1] || '') + (lines[j+2] || '');
            if (rest.includes(',')) {
              deps = rest.substring(rest.indexOf(',') + 1).trim().split(')')[0].trim();
            }
            if (deps === "NO DEPS ARRAY") {
              console.log("MISSING: " + file + ':' + (i+1));
            } else if (deps.includes('{') || deps.includes('[')) {
               // log if we see an object or array literal
               const inner = deps.substring(deps.indexOf('[')+1, deps.lastIndexOf(']'));
               if (inner.includes('[') || inner.includes('{') || inner.includes('=>') || inner.includes('()')) {
                  console.log("LITERAL: " + file + ':' + (i+1) + " -> " + deps);
               }
            }
            break;
          }
          j++;
        }
      }
    }
  }
});
