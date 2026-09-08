const fs = require('fs');
const files = process.argv.slice(2);
files.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  if (content.includes('useEffect')) {
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('useEffect(')) {
        let j = i;
        let braces = 0;
        let started = false;
        let deps = "";
        while (j < lines.length) {
          const line = lines[j];
          for (let k = 0; k < line.length; k++) {
            if (line[k] === '{') { braces++; started = true; }
            if (line[k] === '}') { braces--; }
          }
          if (started && braces === 0) {
            const rest = line.substring(line.indexOf('}') + 1) + (lines[j+1] || '');
            if (rest.includes(',')) {
              deps = rest.substring(rest.indexOf(',') + 1);
            }
            if (deps.includes('{') || deps.includes('[')) {
               // checking if there are inline object/array literals inside the dependency array
               // Note that `[` is already the start of the array, we check inside it
               const inner = deps.substring(deps.indexOf('[')+1, deps.lastIndexOf(']'));
               if (inner.includes('[') || inner.includes('{') || inner.includes('=>') || inner.includes('()')) {
                  console.log(file + ':' + (i+1) + ' -> ' + inner);
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
