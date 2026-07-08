const fs = require('fs');
const path = require('path');
const router = path.join(__dirname, '..', 'js', 'core', 'router.js');
const out = path.join(__dirname, 'import_check_results.json');
if (!fs.existsSync(router)) {
    console.error('router.js not found', router);
    process.exit(1);
}
const src = fs.readFileSync(router, 'utf8');
const re = /import\(['\"](\.\.\/modules\/[^'\"]+\.js)['\"]\)/g;
let m; const expected = [];
while ((m = re.exec(src)) !== null) expected.push(m[1]);
// Deduplicate
const unique = [...new Set(expected)];
const results = { total: unique.length, missing: [], present: [] };
for (const imp of unique) {
    const rel = imp.replace(/^\.\.\//, ''); // remove leading ../
    // Map to actual workspace path under js/
    const relPath = path.join('js', rel.replace(/^modules\//, 'modules/'));
    const full = path.join(__dirname, '..', relPath);
    if (fs.existsSync(full)) results.present.push(relPath);
    else results.missing.push(relPath);
}
fs.writeFileSync(out, JSON.stringify(results, null, 2));
console.log('WROTE', out);