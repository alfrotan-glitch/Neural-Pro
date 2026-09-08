const fs = require('fs');
const files = process.argv.slice(2);
files.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');
  const setters = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/const \[[a-zA-Z]+, (set[A-Z][a-zA-Z0-9_]*)\] = use/);
    if (m) setters.push(m[1]);
  }
  if (setters.length === 0) return;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    setters.forEach(setter => {
      if (line.includes(setter + '(')) {
         // check if it's inside a function or effect
         // This is hard to do perfectly with regex, but we can look for suspicious lines:
         // lines that call the setter but don't have "=>", "function", or aren't indented.
         // Let's just print the line and line number
         console.log(file + ':' + (i+1) + ': ' + line.trim());
      }
    });
  }
});
