const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
function constant(source, name) {
  const match = source.match(new RegExp(`const ${name} = ([\\s\\S]*?);\\n`));
  assert.ok(match, `Missing ${name}`);
  return vm.runInNewContext(`(${match[1]})`);
}
const images = constant(html, 'SL_BODY_IMAGES');
const animals = constant(html, 'SL_ANIMALS');
const mapping = constant(html, 'SL_ANIMAL_BODY_KEY');
const iosAssets = {
  human: 'BiologyHuman', dog: 'BiologyDog', elephant: 'AnimalElephantBody',
  crocodile: 'AnimalCrocodileBody', cat: 'BiologyCat', reptile: 'BiologyReptile',
  fish: 'BiologyFish', whale: 'BiologyWhale', turtle: 'BiologyTurtle',
  frog: 'BiologyFrog', bird: 'BiologyBird',
};
const iosData = fs.readFileSync(path.join(root, 'ios/Zakiy/Features/ScienceLab/ScienceLabBioData.swift'), 'utf8');
const androidData = fs.readFileSync(path.join(root, 'Android/app/src/main/java/com/zakiy/platform/ui/sciencelab/ScienceLabData.kt'), 'utf8');

for (const [key, image] of Object.entries(images)) {
  test(`${key}: same valid bundled image on website, iOS and Android`, () => {
    assert.ok(image.url.startsWith('/assets/'), 'Must not depend on remote SVG');
    const websiteBytes = fs.readFileSync(path.join(root, image.url));
    const assetDir = path.join(root, `ios/Zakiy/Assets.xcassets/${iosAssets[key]}.imageset`);
    const asset = JSON.parse(fs.readFileSync(path.join(assetDir, 'Contents.json'), 'utf8'));
    const filename = asset.images.find(i => i.filename)?.filename;
    assert.ok(filename);
    assert.ok(iosData.includes(`.asset("${iosAssets[key]}")`));
    const iosBytes = fs.readFileSync(path.join(assetDir, filename));
    assert.ok(websiteBytes.equals(iosBytes), 'iOS picture must match the website');
    const ext = path.extname(filename);
    const androidBytes = fs.readFileSync(path.join(root, `Android/app/src/main/res/drawable-nodpi/sl_body_${key}${ext}`));
    assert.ok(websiteBytes.equals(androidBytes), 'Android picture must match the website');
    assert.ok(androidData.includes(`R.drawable.sl_body_${key}`));
    assert.ok(websiteBytes.length > 1000, 'Image must not be an empty placeholder');
    assert.ok(image.hotspots.length > 0);
    for (const hotspot of image.hotspots) {
      assert.ok(hotspot.x >= 0 && hotspot.x <= 100 && hotspot.y >= 0 && hotspot.y <= 100);
    }
  });
}

for (const [animalId, animal] of Object.entries(animals)) {
  test(`${animalId}: facts, body picture and interactive points are present`, () => {
    assert.ok(images[mapping[animalId]], 'Every animal must have an explicit picture mapping');
    assert.equal(animal.factsKeys.length, 3);
    assert.ok(iosData.includes(`"${animalId}": "${mapping[animalId]}"`));
    assert.ok(androidData.includes(`"${mapping[animalId]}"`));
  });
}

test('Modular website source and deployed HTML use identical biology sources', () => {
  const module = fs.readFileSync(path.join(root, 'website/src/js/30-science-lab.js'), 'utf8');
  assert.equal(JSON.stringify(constant(module, 'SL_BODY_IMAGES')), JSON.stringify(images));
});

test('iOS embedded navigation does not reset a visible science lab', () => {
  const swift = fs.readFileSync(path.join(root, 'ios/Zakiy/Features/EmbeddedWeb/EmbeddedWebScreen.swift'), 'utf8');
  const body = swift.match(/var jsEntryCall: String \{\s*"""([\s\S]*?)"""/)[1]
    .replaceAll('\\(elementID)', 'step-science-lab').replaceAll('\\(functionName)', 'showScienceLabScreen');
  let opens = 0, scrolls = 0, hidden = true;
  const element = { classList: { contains: () => hidden }, scrollIntoView: () => scrolls++ };
  const sandbox = {
    document: { getElementById: () => element }, hide: () => {},
    showScienceLabScreen: () => { opens++; hidden = false; },
  };
  for (let i = 0; i < 25; i++) vm.runInNewContext(body, sandbox);
  assert.equal(opens, 1);
  assert.equal(scrolls, 1);
  // Authentication may hide the target later; recovering it is still supported.
  hidden = true;
  vm.runInNewContext(body, sandbox);
  assert.equal(opens, 2);
});
