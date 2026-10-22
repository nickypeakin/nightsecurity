// The mall's ceiling lights, in the shader. There are a hundred-odd
// fixtures, far too many for three.js lights, so every standard material
// is patched (once, globally) to light itself from the nine fixtures
// nearest each pixel: their colours and heights live in a small float
// texture laid over the floor plan (shared/lights.js), so switching a
// breaker or flickering a tube is a texture update, never a shader
// recompile. A second texture says which room each half-metre belongs to,
// so light stays in its room instead of shining through walls. The
// flashlights are ordinary spotlights on top of this.

import * as THREE from 'three';
import { FIXTURES, LGRID, GMAP, GROUPS, FALLOFF, fixtureOn } from '../shared/lights.js';

const N = LGRID.nx * LGRID.nz;
const lightData = new Float32Array(N * 4);
const infoData = new Float32Array(N * 4);
for (const f of FIXTURES) infoData[(f.j * LGRID.nx + f.i) * 4] = f.group;

const lightTex = new THREE.DataTexture(lightData, LGRID.nx, LGRID.nz, THREE.RGBAFormat, THREE.FloatType);
const infoTex = new THREE.DataTexture(infoData, LGRID.nx, LGRID.nz, THREE.RGBAFormat, THREE.FloatType);
const groupTex = new THREE.DataTexture(GROUPS, GMAP.nx, GMAP.nz, THREE.RedFormat, THREE.UnsignedByteType);
for (const t of [lightTex, infoTex, groupTex]) {
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
}

export const MALL_UNIFORMS = {
  mallLight: { value: lightTex },
  mallInfo: { value: infoTex },
  mallGroups: { value: groupTex },
  mallGrid: { value: new THREE.Vector4(LGRID.x0, LGRID.z0, LGRID.cell, 0) },
  mallN: { value: new THREE.Vector2(LGRID.nx, LGRID.nz) },
  mallGMap: { value: new THREE.Vector4(GMAP.x0, GMAP.z0, GMAP.cell, 0) },
  mallGN: { value: new THREE.Vector2(GMAP.nx, GMAP.nz) },
  mallFalloff: { value: FALLOFF },
  mallScale: { value: 1 },
};

const VERT_PARS = /* glsl */`
varying vec3 vMallPos;
`;
const VERT_MAIN = /* glsl */`
#include <worldpos_vertex>
{
  vec4 mp = vec4( transformed, 1.0 );
  #ifdef USE_INSTANCING
    mp = instanceMatrix * mp;
  #endif
  vMallPos = ( modelMatrix * mp ).xyz;
}
`;
const FRAG_PARS = /* glsl */`
uniform sampler2D mallLight, mallInfo, mallGroups;
uniform vec4 mallGrid, mallGMap;
uniform vec2 mallN, mallGN;
uniform float mallFalloff, mallScale;
varying vec3 vMallPos;
`;
const FRAG_LIGHT = /* glsl */`
#include <lights_fragment_begin>
#if defined( RE_Direct )
{
  // which room this surface faces (walls look into the room in front of them)
  vec3 mallWN = normalize( ( vec4( geometryNormal, 0.0 ) * viewMatrix ).xyz );
  vec2 gi = floor( ( vMallPos.xz + mallWN.xz * 0.3 - mallGMap.xy ) / mallGMap.z );
  float myGroup = -1.0;
  if ( gi.x >= 0.0 && gi.y >= 0.0 && gi.x < mallGN.x && gi.y < mallGN.y ) myGroup = floor( texture2D( mallGroups, ( gi + 0.5 ) / mallGN ).r * 255.0 + 0.5 );
  vec2 mci = floor( ( vMallPos.xz - mallGrid.xy ) / mallGrid.z );
  for ( int dj = -1; dj <= 1; dj ++ ) {
    for ( int di = -1; di <= 1; di ++ ) {
      vec2 c = mci + vec2( float( di ), float( dj ) );
      if ( c.x < 0.0 || c.y < 0.0 || c.x >= mallN.x || c.y >= mallN.y ) continue;
      vec2 luv = ( c + 0.5 ) / mallN;
      vec4 L = texture2D( mallLight, luv );
      if ( L.r + L.g + L.b < 0.0005 ) continue;
      if ( abs( texture2D( mallInfo, luv ).r - myGroup ) > 0.5 ) continue;
      vec3 lp = vec3( mallGrid.x + ( c.x + 0.5 ) * mallGrid.z, L.a, mallGrid.y + ( c.y + 0.5 ) * mallGrid.z );
      vec3 d = lp - vMallPos;
      float h = length( d.xz ) / ( mallGrid.z * 1.45 );
      float win = clamp( 1.0 - h * h, 0.0, 1.0 );
      win *= win;
      vec3 col = L.rgb * mallScale * win / ( 1.0 + dot( d, d ) * mallFalloff );
      directLight.direction = normalize( ( viewMatrix * vec4( d, 0.0 ) ).xyz );
      directLight.color = col;
      directLight.visible = true;
      RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
      // and a little bounced round the room, so the dark sides aren't black
      reflectedLight.indirectDiffuse += col * 0.16 * BRDF_Lambert( material.diffuseColor );
    }
  }
}
#endif
`;

// every standard material in the game gets the mall's lights
const patch = (shader) => {
  Object.assign(shader.uniforms, MALL_UNIFORMS);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${VERT_PARS}`)
    .replace('#include <worldpos_vertex>', VERT_MAIN);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\n${FRAG_PARS}`)
    .replace('#include <lights_fragment_begin>', FRAG_LIGHT);
};
THREE.MeshStandardMaterial.prototype.onBeforeCompile = patch;
THREE.MeshStandardMaterial.prototype.customProgramCacheKey = () => 'mall-lights-1';

// state: { breakers: { id: bool }, carousel }, plus `dim` fixtures that
// flicker or are browning out (a Set of fixtures to show at a fraction)
export function setLights(state, { flicker = null, dimmed = null, dawn = 0 } = {}) {
  lightData.fill(0);
  for (const f of FIXTURES) {
    let k = fixtureOn(f, state) ? 1 : 0;
    if (k && flicker && flicker.has(f)) k = flicker.get(f);
    if (k && dimmed && dimmed.has(f.breaker)) k *= dimmed.get(f.breaker);
    let [r, g, b] = f.color;
    let p = f.power * k;
    // morning through the skylights
    if (f.breaker === 'moon' && dawn > 0) { r = 1.0; g = 0.9; b = 0.75; p = f.power * (1 + dawn * 3); }
    const i = (f.j * LGRID.nx + f.i) * 4;
    lightData[i] = r * p;
    lightData[i + 1] = g * p;
    lightData[i + 2] = b * p;
    lightData[i + 3] = f.y;
  }
  lightTex.needsUpdate = true;
}

export function setExposure(k) {
  MALL_UNIFORMS.mallScale.value = k;
}
