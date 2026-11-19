// confere a sintaxe do JavaScript embutido em bin/replica.html
const fs = require('fs'), vm = require('vm');
const s = fs.readFileSync(__dirname + '/../bin/replica.html', 'utf8');
const i = s.indexOf('<script>\nconst SLUG'); const js = s.slice(i + 8, s.lastIndexOf('</script>')).replace('__SLUG__', '"x"');
new vm.Script(js); console.log('replica.html: js ok');
