// Baseline only: exports with VectorCraft's CLI, never launches Illustrator.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const cp = require('node:child_process');
const assert = require('node:assert/strict');

function readNative(file) {
  let bytes = fs.readFileSync(file);
  if (bytes[0] === 31 && bytes[1] === 139) bytes = zlib.gunzipSync(bytes);
  const end = bytes.indexOf(Buffer.from('\n\0VCBLOBS\0'));
  const data = JSON.parse(bytes.subarray(0, end < 0 ? bytes.length : end).toString('utf8'));
  if (data.format !== 'vectorcraft' || !data.document) throw Error('Not a VectorCraft document: ' + file);
  return data.document;
}

function summarize(doc) {
  const result = { counts: {}, text: [] };
  function visit(nodes) {
    for (const node of nodes) {
      const kind = node.kind;
      result.counts[kind.type] = (result.counts[kind.type] || 0) + 1;
      if (kind.type === 'text') result.text.push((kind.runs || []).map(run => run.text).join(''));
      if (kind.children) visit(kind.children);
    }
  }
  visit(doc.layers);
  return result;
}

function retainsChinese(summary) {
  return summary.text.some(text => text.includes('中文尺寸'));
}

function selfTest() {
  const nested = summarize({ layers: [{ kind: { type: 'group', children: [
    { kind: { type: 'text', runs: [{ text: '中文' }, { text: '尺寸' }] } },
    { kind: { type: 'path' } }
  ] } }] });
  assert.equal(nested.counts.group, 1);
  assert.equal(nested.counts.path, 1);
  assert.equal(retainsChinese(nested), true);
  assert.equal(retainsChinese({ text: ['English only'] }), false);
  assert.equal(retainsChinese({ text: [] }), false); // Outlined text must fail the gate.
  console.log('Baseline probe checks passed (not an Illustrator compatibility test).');
}

function run(cli) {
  cli = path.resolve(cli);
  if (!fs.existsSync(cli)) throw Error('Pass the installed vectorcraft-cli.exe path.');
  const work = path.join(__dirname, '..', 'work');
  fs.mkdirSync(work, { recursive: true });
  const output = fs.mkdtempSync(path.join(work, 'baseline-'));
  function exec(args) {
    const result = cp.spawnSync(cli, args, { encoding: 'utf8', windowsHide: true, timeout: 120000, maxBuffer: 16 * 1024 * 1024 });
    if (result.error || result.status !== 0) throw Error(String(result.error || result.stderr || result.stdout));
    return result.stdout.trim();
  }
  const svg = path.join(output, 'fixture.svg');
  fs.writeFileSync(svg, `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="240" viewBox="0 0 400 240">
  <g id="Outer"><path d="M10 10 L390 10" fill="none" stroke="#444"/><g id="Inner">
    <text x="30" y="60" font-family="Microsoft YaHei" font-size="24">中文尺寸</text>
    <text x="30" y="100" font-family="Arial" font-size="20">Editable text</text>
    <path d="M30 140 C80 110 120 170 170 140" fill="none" stroke="#254f8f" stroke-width="3"/>
    <image x="220" y="30" width="50" height="50" href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGPUje9hYGBgYgADAAzrARxUWC7zAAAAAElFTkSuQmCC"/>
  </g></g></svg>`, 'utf8');
  const source = path.join(output, 'source.vectorcraft');
  const importLog = exec(['convert', svg, source]);
  const before = summarize(readNative(source));
  if (!retainsChinese(before)) throw Error('Fixture import lost Chinese text; baseline would be invalid.');
  const report = { purpose: 'Built-in writer baseline, not a new exporter', cliVersion: exec(['--version']), before, importLog, cases: [], illustratorVerified: false, nativeArrowheadsTested: false, multiArtboardTested: false };
  for (const version of ['pdf', '7']) {
    const ai = path.join(output, version + '.ai');
    const reopened = path.join(output, version + '.vectorcraft');
    const exportLog = exec(['convert', source, ai, '--ai-version', version]);
    const reopenLog = exec(['convert', ai, reopened]);
    const after = summarize(readNative(reopened));
    report.cases.push({ version, exportLog, reopenLog, after, chineseTextRetainedByVectorCraft: retainsChinese(after) });
  }
  fs.writeFileSync(path.join(output, 'baseline-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ output, ...report }, null, 2));
}

if (require.main === module) {
  try {
    if (process.argv[2] === '--self-test') selfTest();
    else run(process.argv[2] || 'C:/Program Files/VectorCraft/vectorcraft-cli.exe');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
