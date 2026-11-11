'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const THREE = require('../../public/vendor/three.min.js');

const context = {
  URL,
  location: new URL('https://brush-art.in/p/example/'),
  navigator: {},
  document: {
    createElement: () => ({ relList: { supports: feature => feature === 'ar' } }),
    getElementById: () => null
  },
  THREE,
  window: {}
};
context.window.THREE = THREE;
const arSource = fs.readFileSync(path.join(__dirname, '../../public/ar-view.js'), 'utf8');
assert.match(arSource, /<a rel="ar"[^>]*>\s*<img\b[^>]*>\s*<\/a>/, 'Quick Look anchors have a single image child');
vm.runInNewContext(
  arSource,
  context,
  { filename: 'public/ar-view.js' }
);

const ar = context.window.BrushAR;
const expected = {
  A5: [0.148, 0.210],
  A4: [0.210, 0.297],
  A3: [0.297, 0.420],
  '12x18': [0.3048, 0.4572],
  '13x19': [0.3302, 0.4826]
};

for (const [size, [width, height]] of Object.entries(expected)) {
  assert.equal(ar.POSTER_SIZES[size].widthM, width, `${size} width in metres`);
  assert.equal(ar.POSTER_SIZES[size].heightM, height, `${size} height in metres`);
  assert.ok(Math.abs(ar.POSTER_SIZES[size].aspect - width / height) < 1e-12, `${size} aspect ratio`);
}

assert.match(
  ar.setQuickLookAsset('data:model/vnd.usdz+zip;base64,ZmFrZQ=='),
  /^data:model\/vnd\.usdz\+zip;base64,ZmFrZQ==#allowsContentScaling=0&canonicalWebPageURL=/,
  'accept a valid Quick Look USDZ data URI'
);
assert.equal(ar.setQuickLookAsset('http://cdn.example/poster.usdz'), '', 'reject insecure remote model URL');
assert.equal(
  ar.setQuickLookAsset('https://cdn.example/poster.usdz?variant=a4'),
  'https://cdn.example/poster.usdz?variant=a4#allowsContentScaling=0',
  'accept HTTPS hosted USDZ and disable scaling'
);

const floorPose = { transform: { matrix: new THREE.Matrix4().toArray() } };
assert.equal(ar.getVerticalWallPose(floorPose), null, 'reject a horizontal floor hit');
const wallMatrix = new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(0, 0, -2);
const wallPose = ar.getVerticalWallPose({ transform: { matrix: wallMatrix.toArray() } });
assert.ok(wallPose, 'accept a vertical wall hit');
assert.ok(Math.abs(wallPose.position.z + 2) < 1e-9, 'preserve the wall hit position');
const posterNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(wallPose.quaternion);
assert.ok(Math.abs(posterNormal.z - 1) < 1e-9, 'orient poster normal outward from the wall');

console.log('AR poster dimension and Quick Look URL contracts passed.');
