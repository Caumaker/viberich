// checks the syntax of the JavaScript embedded in bin/vibe-ui.html
const fs = require('fs'), vm = require('vm'), path = require('path');
const s = fs.readFileSync(path.join(__dirname, '..', 'bin', 'vibe-ui.html'), 'utf8');
const i = s.indexOf('<script>\nconst SLUG');
if (i < 0) { console.error('vibe-ui.html: main script not found'); process.exit(1); }
const js = s.slice(i + 8, s.lastIndexOf('</script>')).replace('__SLUG__', '"x"');
new vm.Script(js);
console.log('vibe-ui.html: js ok');
