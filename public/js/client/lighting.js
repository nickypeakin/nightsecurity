// Kingsgate's street lights, in the shader. There are hundreds of lamps,
// far too many for three.js lights, so every standard material is patched
// (once, globally) to light itself from the lamps in the nine grid squares
// around each pixel: their colours, heights and exact spots live in two
// small float textures laid over the map (shared/lights.js), so a lamp
// going out is a texture update, never a shader recompile. Lamps out of
// reach are skipped before any lighting maths. Headlights and gun flashes
// are ordinary three.js lights on top of this.

import * as THREE from 'three';
import { FIXTURES, LGRID, FALLOFF, REACH } from '../shared/lights.js';

const N = LGRID.nx * LGRID.nz;
const lightData = new Float32Array(N * 4);
const spotData = new Float32Array(N * 4);

const lightTex = new THREE.DataTexture(lightData, LGRID.nx, LGRID.nz, THREE.RGBAFormat, THREE.FloatType);
const spotTex = new THREE.DataTexture(spotData, LGRID.nx, LGRID.nz, THREE.RGBAFormat, THREE.FloatType);
for (const t of [lightTex, spotTex]) {
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
}

export const CITY_UNIFORMS = {
  cityLight: { value: lightTex },
  citySpot: { value: spotTex },
  cityGrid: { value: new THREE.Vector4(LGRID.x0, LGRID.z0, LGRID.cell, REACH) },
  cityN: { value: new THREE.Vector2(LGRID.nx, LGRID.nz) },
  cityFalloff: { value: FALLOFF },
  cityScale: { value: 1 },       // the street lamps (0 by day)
  cityIndoor: { value: 1 },      // lights indoors (always on)
};

const VERT_PARS = /* glsl */`
varying vec3 vCityPos;
`;
const VERT_MAIN = /* glsl */`
#include <worldpos_vertex>
{
  vec4 mp = vec4( transformed, 1.0 );
  #ifdef USE_INSTANCING
    mp = instanceMatrix * mp;
  #endif
  vCityPos = ( modelMatrix * mp ).xyz;
}
`;
const FRAG_PARS = /* glsl */`
uniform sampler2D cityLight, citySpot;
uniform vec4 cityGrid;
uniform vec2 cityN;
uniform float cityFalloff, cityScale, cityIndoor;
varying vec3 vCityPos;
`;
const FRAG_LIGHT = /* glsl */`
#include <lights_fragment_begin>
#if defined( RE_Direct )
{
  vec2 ci = floor( ( vCityPos.xz - cityGrid.xy ) / cityGrid.z );
  for ( int dj = -1; dj <= 1; dj ++ ) {
    for ( int di = -1; di <= 1; di ++ ) {
      vec2 c = ci + vec2( float( di ), float( dj ) );
      if ( c.x < 0.0 || c.y < 0.0 || c.x >= cityN.x || c.y >= cityN.y ) continue;
      vec2 luv = ( c + 0.5 ) / cityN;
      vec4 L = texture2D( cityLight, luv );
      if ( L.r + L.g + L.b < 0.0005 ) continue;
      vec4 S = texture2D( citySpot, luv );
      vec3 d = vec3( S.x, L.a, S.y ) - vCityPos;
      float h = length( d.xz ) / cityGrid.w;
      if ( h >= 1.0 ) continue;
      float win = 1.0 - h * h;
      win *= win;
      vec3 col = L.rgb * ( S.z > 0.5 ? cityIndoor : cityScale ) * win / ( 1.0 + dot( d, d ) * cityFalloff );
      directLight.direction = normalize( ( viewMatrix * vec4( d, 0.0 ) ).xyz );
      directLight.color = col;
      directLight.visible = true;
      RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
      // a little bounced off the street, so the dark sides aren't black
      reflectedLight.indirectDiffuse += col * 0.12 * BRDF_Lambert( material.diffuseColor );
    }
  }
}
#endif
`;

// every standard material in the game gets the street lights
const patch = (shader) => {
  Object.assign(shader.uniforms, CITY_UNIFORMS);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${VERT_PARS}`)
    .replace('#include <worldpos_vertex>', VERT_MAIN);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\n${FRAG_PARS}`)
    .replace('#include <lights_fragment_begin>', FRAG_LIGHT);
};
THREE.MeshStandardMaterial.prototype.onBeforeCompile = patch;
THREE.MeshStandardMaterial.prototype.customProgramCacheKey = () => 'city-lights-2';

// off: a set of fixture cells (k) that are dark (knocked down, shot out)
export function setLights(off = null) {
  lightData.fill(0);
  spotData.fill(0);
  for (const f of FIXTURES) {
    if (off && off.has(f.k)) continue;
    const i = f.k * 4;
    lightData[i] = f.color[0] * f.power;
    lightData[i + 1] = f.color[1] * f.power;
    lightData[i + 2] = f.color[2] * f.power;
    lightData[i + 3] = f.y;
    spotData[i] = f.x;
    spotData[i + 1] = f.z;
    spotData[i + 2] = f.indoor ? 1 : 0;
  }
  lightTex.needsUpdate = true;
  spotTex.needsUpdate = true;
}
setLights();
