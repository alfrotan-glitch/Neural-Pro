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
        let hasSetState = false;
        while (j < lines.length) {
          const line = lines[j];
          if (line.includes('set')) hasSetState = true;
          for (let k = 0; k < line.length; k++) {
            if (line[k] === '{') { braces++; started = true; }
            if (line[k] === '}') { braces--; }
          }
          if (started && braces === 0) {
            const rest = line.substring(line.indexOf('}') + 1) + (lines[j+1] || '');
            if (rest.includes(',')) {
              deps = rest.substring(rest.indexOf(',') + 1);
            } else {
              deps = "NO DEPS ARRAY";
            }
            if (hasSetState) {
               console.log(file + ':' + (i+1) + ' -> ' + deps.trim().split(')')[0]);
            }
            break;
          }
          j++;
        }
      }
    }
  }
});
