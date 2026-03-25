/**
 * NeuralSpace Live — 3D brain visualization driven by WebSocket BrainEvents.
 * Faithfully ported from the holomime.com NeuralSpace Astro component with
 * identical brain mesh, GLSL shaders, fibers, sulci, and visual treatment.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// ═══════════ CONSTANTS ═══════════

const C = {
  cyan:0x06b6d4, magenta:0xd946ef, violet:0x8b5cf6,
  coral:0xf97066, blue:0x3b82f6, sage:0x22c55e,
  gold:0xf59e0b, teal:0x14b8a6, rose:0xec4899,
  orange:0xf97316, dark:0x110d1f,
};

// DTI fiber color palette
const DTI_COLORS = [0xff66aa,0xaa44ff,0x4488ff,0x44ccaa,0x88dd44,0xffaa44,0xff6688,0x6644ff,0x44aaff,0xcc66ff];

// ─── Anatomical Lobe Definitions (identical to platform NeuralSpace.astro) ───
const LOBES = {
  frontal:    { label:'Frontal Lobe',      fn:'Planning & Strategy',     color:C.orange, fiber:0xff8844, center:[0,0.12,0.25],     r:0.35, sc:[0.7,0.5,0.5],   fc:55 },
  prefrontal: { label:'Prefrontal Cortex', fn:'Executive Decisions',     color:C.blue,   fiber:0x4488ff, center:[0,0.10,0.40],     r:0.20, sc:[0.5,0.35,0.3],  fc:30 },
  parietal:   { label:'Parietal Lobe',     fn:'Context Integration',     color:C.gold,   fiber:0xffcc22, center:[0,0.22,-0.05],    r:0.32, sc:[0.7,0.4,0.5],   fc:45 },
  temporal_l: { label:'Left Temporal',     fn:'Memory Retrieval',        color:C.sage,   fiber:0x44dd88, center:[-0.32,-0.10,0.08],r:0.28, sc:[0.3,0.3,0.5],   fc:35 },
  temporal_r: { label:'Right Temporal',    fn:'Pattern Recognition',     color:C.sage,   fiber:0x44dd88, center:[0.32,-0.10,0.08], r:0.28, sc:[0.3,0.3,0.5],   fc:35 },
  occipital:  { label:'Occipital Lobe',    fn:'Input Analysis',          color:C.coral,  fiber:0xff5555, center:[0,0.05,-0.38],    r:0.25, sc:[0.5,0.4,0.3],   fc:30 },
  cerebellum: { label:'Cerebellum',        fn:'Action Execution',        color:C.teal,   fiber:0x22ccaa, center:[0,-0.22,-0.35],   r:0.22, sc:[0.6,0.3,0.3],   fc:25 },
  broca:      { label:"Broca's Area",      fn:'Language Generation',     color:C.violet, fiber:0xaa66ff, center:[-0.28,-0.02,0.25],r:0.16, sc:[0.25,0.22,0.22],fc:22 },
  wernicke:   { label:"Wernicke's Area",   fn:'Language Comprehension',  color:C.rose,   fiber:0xff66bb, center:[-0.30,0.02,-0.12],r:0.15, sc:[0.22,0.2,0.22], fc:18 },
};

// Map BrainEvent region IDs → anatomical lobe keys
const REGION_TO_LOBE = {
  'prefrontal-cortex':  'prefrontal',
  'brocas-area':        'broca',
  'wernickes-area':     'wernicke',
  'amygdala':           'occipital',     // map to nearest anatomical region
  'anterior-cingulate': 'parietal',
  'hippocampus':        'temporal_l',
  'temporal-lobe':      'temporal_r',
  'cerebellum':         'cerebellum',
  'thalamus':           'frontal',
};

const LOBE_KEYS = ['frontal','prefrontal','parietal','temporal_l','temporal_r','occipital','cerebellum','broca','wernicke'];

// ═══════════ BASE64 DECODE ═══════════

function decodeB64F32(s) {
  const bin = atob(s);
  const buf = new ArrayBuffer(bin.length);
  const u8 = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return new Float32Array(buf);
}

function decodeB64U16(s) {
  const bin = atob(s);
  const buf = new ArrayBuffer(bin.length);
  const u8 = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return new Uint16Array(buf);
}

// ═══════════ DOM ELEMENTS ═══════════

const container = document.getElementById('canvas-area');
const statusEl = document.getElementById('status');
const healthNumber = document.getElementById('health-number');
const healthGrade = document.getElementById('health-grade');
const healthRingFg = document.getElementById('health-ring-fg');
const msgNumber = document.getElementById('msg-number');
const agentInfo = document.getElementById('agent-info');
const patternList = document.getElementById('pattern-list');
const emptyState = document.getElementById('empty-state');
const activityFeed = document.getElementById('activity-feed');

// ═══════════ THREE.JS SCENE ═══════════

const renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true, powerPreference:'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.3;
container.insertBefore(renderer.domElement, container.firstChild);

const scene = new THREE.Scene();
scene.background = new THREE.Color(C.dark);
scene.fog = new THREE.FogExp2(C.dark, 0.04);

const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
camera.position.set(2.2, 0.4, 1.8);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 1.8;
controls.maxDistance = 6.5;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.12;
controls.maxPolarAngle = Math.PI*0.78;
controls.minPolarAngle = Math.PI*0.22;
controls.target.set(0, -0.08, 0);

let arTimer;
controls.addEventListener('start', () => { controls.autoRotate=false; clearTimeout(arTimer); });
controls.addEventListener('end', () => { arTimer=setTimeout(()=>controls.autoRotate=true, 5000); });

// Lighting
scene.add(new THREE.AmbientLight(0x1a1a3e, 0.25));
const kl = new THREE.PointLight(0xffffff, 0.55, 20); kl.position.set(3,4,2); scene.add(kl);
const fl = new THREE.PointLight(0x4466aa, 0.18, 15); fl.position.set(-3,-1,3); scene.add(fl);
const rl = new THREE.PointLight(0x8844cc, 0.22, 12); rl.position.set(-2,2,-3); scene.add(rl);
const sl = new THREE.SpotLight(0xffffff, 0.22, 10, Math.PI/10, 0.6);
sl.position.set(0,3.5,0); sl.target.position.set(0,-0.2,0); scene.add(sl); scene.add(sl.target);

// Environment map
const pmrem = new THREE.PMREMGenerator(renderer);
const eS = new THREE.Scene();
eS.add(new THREE.Mesh(new THREE.IcosahedronGeometry(1,2), new THREE.MeshBasicMaterial({color:0x060612,side:THREE.BackSide})));
[{c:0x06b6d4,p:[1,1,1],i:0.35},{c:0x8b5cf6,p:[-1,-0.5,-1],i:0.25},{c:0xd946ef,p:[0,1,-1],i:0.18}].forEach(l=>{
  const p=new THREE.PointLight(l.c,l.i);p.position.set(...l.p);eS.add(p);
});
const envMap = pmrem.fromScene(eS,0.04).texture;
pmrem.dispose();

const brain = new THREE.Group();
scene.add(brain);

// Convert lobe center/scale arrays to THREE objects
Object.values(LOBES).forEach(l => {
  l.center = new THREE.Vector3(...l.center);
  l.scale = new THREE.Vector3(...l.sc);
});

// ═══════════ BRAIN MESH — Deformed SphereGeometry with GLSL Shader ═══════════

// Lobe colors: frontal, prefrontal, parietal, temporal_l, temporal_r, occipital, cerebellum, broca, wernicke, stem
const LOBE_COLORS = [
  new THREE.Color(0xff8844), new THREE.Color(0x4488ff), new THREE.Color(0xffcc22),
  new THREE.Color(0x44dd88), new THREE.Color(0x44dd88), new THREE.Color(0xff5555),
  new THREE.Color(0x22ccaa), new THREE.Color(0xaa66ff), new THREE.Color(0xff66bb),
  new THREE.Color(0x4d4d66),
];

const lobeColorData = new Float32Array(30); // 10 lobes * 3 components
LOBE_COLORS.forEach((c, i) => { lobeColorData[i*3]=c.r; lobeColorData[i*3+1]=c.g; lobeColorData[i*3+2]=c.b; });

const lobeHighlight = new Float32Array(10);

const brainShellMat = new THREE.ShaderMaterial({
  uniforms: {
    uLobeColors: { value: lobeColorData },
    uLobeHighlight: { value: lobeHighlight },
    uRimPower: { value: 2.5 },
    uRimIntensity: { value: 0.4 },
    uBaseOpacity: { value: 0.03 },
    uTime: { value: 0 },
    uDarkMode: { value: 1.0 },
  },
  vertexShader: `
    attribute float aLobeIdx;
    varying vec3 vNormal;
    varying vec3 vViewDir;
    varying vec3 vWorldPos;
    varying float vLobeIdx;
    void main() {
      vNormal = normalize(normalMatrix * normal);
      vec4 worldPos = modelMatrix * vec4(position, 1.0);
      vWorldPos = worldPos.xyz;
      vViewDir = normalize(cameraPosition - worldPos.xyz);
      vLobeIdx = aLobeIdx;
      gl_Position = projectionMatrix * viewMatrix * worldPos;
    }
  `,
  fragmentShader: `
    uniform float uLobeColors[30];
    uniform float uLobeHighlight[10];
    uniform float uRimPower;
    uniform float uRimIntensity;
    uniform float uBaseOpacity;
    uniform float uTime;
    uniform float uDarkMode;
    varying vec3 vNormal;
    varying vec3 vViewDir;
    varying vec3 vWorldPos;
    varying float vLobeIdx;
    void main() {
      int idx = int(vLobeIdx + 0.5);
      vec3 lobeColor = vec3(uLobeColors[idx*3], uLobeColors[idx*3+1], uLobeColors[idx*3+2]);
      float highlight = uLobeHighlight[idx];

      float rim = 1.0 - max(dot(vNormal, vViewDir), 0.0);
      rim = pow(rim, uRimPower) * uRimIntensity;
      rim *= 0.92 + 0.08 * sin(uTime * 0.5 + vWorldPos.y * 3.0);

      // Ghostly neon outline on dark purple bg
      vec3 baseColor = vec3(0.07, 0.05, 0.12);
      vec3 rimColor = mix(vec3(0.15, 0.20, 0.35), lobeColor * 0.5, 0.2);
      vec3 color = mix(baseColor, rimColor, rim);

      float hlStr = 0.55;
      color = mix(color, lobeColor * 0.6, highlight * hlStr);

      float baseAlpha = uBaseOpacity;
      float alpha = baseAlpha + rim * 0.35 + highlight * 0.3;
      alpha = clamp(alpha, 0.0, 0.55);

      gl_FragColor = vec4(color, alpha);
    }
  `,
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide,
});

// Brain mesh vertex data (inlined at build time, fallback to fetch in dev)
// BRAIN_DATA_PLACEHOLDER_START
let BRAIN_V_B64 = null;
let BRAIN_I_B64 = null;
let BRAIN_L_B64 = null;
// BRAIN_DATA_PLACEHOLDER_END

function loadBrainMesh(vB64, iB64, lB64) {
  const BRAIN_V = decodeB64F32(vB64);
  const BRAIN_I = decodeB64U16(iB64);
  const BRAIN_L = decodeB64F32(lB64);

  const brainGeo = new THREE.BufferGeometry();
  brainGeo.setAttribute('position', new THREE.BufferAttribute(BRAIN_V, 3));
  brainGeo.setAttribute('aLobeIdx', new THREE.BufferAttribute(BRAIN_L, 1));
  brainGeo.setIndex(new THREE.BufferAttribute(BRAIN_I, 1));
  brainGeo.computeVertexNormals();

  brain.add(new THREE.Mesh(brainGeo, brainShellMat));
}

if (BRAIN_V_B64) {
  // Data was inlined at build time
  loadBrainMesh(BRAIN_V_B64, BRAIN_I_B64, BRAIN_L_B64);
} else {
  // Dev mode: fetch from server
  fetch('brain-data.json').then(r => r.json()).then(data => {
    loadBrainMesh(data.vertices, data.indices, data.lobeIndices);
  }).catch(err => {
    console.warn('Brain mesh data not available:', err);
  });
}

// ═══════════ LOBE SPHERES + INNER GLOW ═══════════

const lobeSpheres = {};
const lobeGlows = {};
const lobeAct = {};

Object.entries(LOBES).forEach(([key, lobe]) => {
  lobeAct[key] = 0;

  // Translucent sphere for each region
  const geo = new THREE.SphereGeometry(lobe.r, 32, 16);
  const mat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(lobe.color).multiplyScalar(0.4),
    transparent:true, opacity:0.0,
    roughness:0.3, metalness:0.1,
    transmission:0.82, ior:1.2, thickness:0.3,
    iridescence:0.2, iridescenceIOR:1.5,
    envMap, envMapIntensity:0.4,
    side:THREE.DoubleSide, depthWrite:false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(lobe.center);
  mesh.scale.copy(lobe.scale);
  brain.add(mesh);
  lobeSpheres[key] = mesh;

  // Inner glow
  const ig = new THREE.SphereGeometry(lobe.r*0.8, 12, 8);
  const im = new THREE.MeshBasicMaterial({ color:lobe.color, transparent:true, opacity:0.0, side:THREE.BackSide, depthWrite:false, visible:false });
  const glow = new THREE.Mesh(ig, im);
  glow.position.copy(lobe.center);
  glow.scale.copy(lobe.scale);
  brain.add(glow);
  lobeGlows[key] = glow;
});

// ═══════════ FIBER NETWORKS ═══════════

const allFibers = [];
const lobeFibers = {};
const interFibers = [];
const signals = [];
const anims = [];

// Generate fibers as dense streamlines WITHIN each lobe volume
function mkFibers(lk) {
  const l = LOBES[lk], fibers = [];
  const baseCol = new THREE.Color(l.fiber);
  for (let i = 0; i < l.fc; i++) {
    const np = 4+Math.floor(Math.random()*4);
    const pts = [];
    let cx=l.center.x, cy=l.center.y, cz=l.center.z;
    let sx=l.r*l.scale.x*0.7, sy=l.r*l.scale.y*0.6, sz=l.r*l.scale.z*0.7;
    let px=cx+(Math.random()-0.5)*sx*2;
    let py=cy+(Math.random()-0.5)*sy*2;
    let pz=cz+(Math.random()-0.5)*sz*2;
    let dx=(Math.random()-0.5)*0.06;
    let dy=(Math.random()-0.5)*0.04;
    let dz=(Math.random()-0.5)*0.06;
    for (let j = 0; j < np; j++) {
      pts.push(new THREE.Vector3(px, py, pz));
      px += dx + (Math.random()-0.5)*0.02;
      py += dy + (Math.random()-0.5)*0.015;
      pz += dz + (Math.random()-0.5)*0.02;
      // Soft containment
      const ox=(px-cx)/sx, oy=(py-cy)/sy, oz=(pz-cz)/sz;
      const dist=Math.sqrt(ox*ox+oy*oy+oz*oz);
      if(dist > 0.8) {
        const pull=(dist-0.8)*0.3;
        px-=(px-cx)*pull; py-=(py-cy)*pull; pz-=(pz-cz)*pull;
      }
      dx+=(Math.random()-0.5)*0.015;
      dy+=(Math.random()-0.5)*0.01;
      dz+=(Math.random()-0.5)*0.015;
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const geo = new THREE.TubeGeometry(curve, 14, 0.002+Math.random()*0.004, 3, false);
    const col = baseCol.clone();
    const dtiCol = new THREE.Color(DTI_COLORS[Math.floor(Math.random()*DTI_COLORS.length)]);
    col.lerp(dtiCol, 0.2+Math.random()*0.3);
    col.offsetHSL((Math.random()-0.5)*0.08, (Math.random()-0.5)*0.1, (Math.random()-0.5)*0.06);
    const rest = 0.06+Math.random()*0.08;
    const mat = new THREE.MeshBasicMaterial({ color:col, transparent:true, opacity:rest, depthWrite:false });
    const m = new THREE.Mesh(geo, mat);
    m.userData = { lk, curve, rest };
    brain.add(m); fibers.push(m); allFibers.push(m);
  }
  return fibers;
}

Object.keys(LOBES).forEach(k => { lobeFibers[k] = mkFibers(k); });

// ─── Inter-lobe connections ───
const CONNS = [
  ['frontal','parietal'],['frontal','temporal_l'],['frontal','temporal_r'],
  ['frontal','broca'],['frontal','cerebellum'],['frontal','prefrontal'],
  ['prefrontal','parietal'],['prefrontal','broca'],
  ['parietal','occipital'],['parietal','temporal_l'],['parietal','temporal_r'],
  ['temporal_l','wernicke'],['temporal_r','occipital'],
  ['broca','wernicke'],['cerebellum','frontal'],
  ['occipital','cerebellum'],['temporal_l','broca'],['temporal_l','temporal_r'],
];

CONNS.forEach(([a,b]) => {
  const la=LOBES[a],lb=LOBES[b];
  for(let i=0;i<3+Math.floor(Math.random()*3);i++){
    const j=()=>(Math.random()-0.5)*0.08;
    const s=la.center.clone().add(new THREE.Vector3(j(),j(),j()));
    const e=lb.center.clone().add(new THREE.Vector3(j(),j(),j()));
    const mid=s.clone().add(e).multiplyScalar(0.5);
    mid.y+=0.02+Math.random()*0.04;
    const curve=new THREE.CatmullRomCurve3([s,mid,e]);
    const geo=new THREE.TubeGeometry(curve,12,0.002+Math.random()*0.003,3,false);
    const col=new THREE.Color(la.fiber).lerp(new THREE.Color(lb.fiber),0.3+Math.random()*0.4);
    const dtiCol = new THREE.Color(DTI_COLORS[Math.floor(Math.random()*DTI_COLORS.length)]);
    col.lerp(dtiCol, 0.15+Math.random()*0.2);
    const rest=0.03+Math.random()*0.04;
    const mat=new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:rest,depthWrite:false});
    const m=new THREE.Mesh(geo,mat);
    m.userData={from:a,to:b,curve,rest};
    brain.add(m); interFibers.push(m); allFibers.push(m);
  }
});

// ═══════════ FISSURES + SULCI ═══════════

const fmat = new THREE.MeshBasicMaterial({color:0x0c0c1e,transparent:true,opacity:0.2,depthWrite:false});
// Central fissure
brain.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
  new THREE.Vector3(0,0.28,0.35),new THREE.Vector3(0,0.34,0.10),
  new THREE.Vector3(0,0.32,-0.10),new THREE.Vector3(0,0.20,-0.35)
]),30,0.005,4,false),fmat));

// Sylvian fissure (left + mirrored right)
const sylG = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
  new THREE.Vector3(-0.18,-0.04,0.28),new THREE.Vector3(-0.30,-0.08,0.08),new THREE.Vector3(-0.32,-0.02,-0.06)
]),18,0.003,4,false);
brain.add(new THREE.Mesh(sylG,fmat.clone()));
const sR=new THREE.Mesh(sylG.clone(),fmat.clone()); sR.scale.x=-1; brain.add(sR);

// Per-lobe sulci lines
const sulci = {};
Object.entries(LOBES).forEach(([k,l])=>{
  const lines=[];
  for(let i=0;i<5+Math.floor(Math.random()*4);i++){
    const pts=[];const segs=4+Math.floor(Math.random()*3);
    const t0=Math.random()*Math.PI*2,p0=Math.random()*Math.PI*0.6+0.2;
    for(let j=0;j<=segs;j++){
      const t=j/segs;
      const th=t0+t*(0.4+Math.random()*0.6);
      const ph=p0+(Math.random()-0.5)*0.2;
      const r=l.r*1.01;
      pts.push(new THREE.Vector3(
        r*Math.sin(ph)*Math.cos(th)*l.scale.x+l.center.x,
        r*Math.cos(ph)*l.scale.y+l.center.y,
        r*Math.sin(ph)*Math.sin(th)*l.scale.z+l.center.z,
      ));
    }
    const geo=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),10,0.002,3,false);
    const mat=new THREE.MeshBasicMaterial({color:l.color,transparent:true,opacity:0.05,depthWrite:false});
    const m=new THREE.Mesh(geo,mat); brain.add(m); lines.push(m);
  }
  sulci[k]=lines;
});

// ═══════════ SYNAPSE PARTICLES ═══════════

const SN=900;
const snPos=new Float32Array(SN*3),snV=[];
const lobeKeys=Object.keys(LOBES);
for(let i=0;i<SN;i++){
  const l=LOBES[lobeKeys[Math.floor(Math.random()*lobeKeys.length)]];
  const p=l.center.clone().add(new THREE.Vector3(
    (Math.random()-0.5)*l.r*l.scale.x*0.75,
    (Math.random()-0.5)*l.r*l.scale.y*0.75,
    (Math.random()-0.5)*l.r*l.scale.z*0.75
  ));
  snPos[i*3]=p.x;snPos[i*3+1]=p.y;snPos[i*3+2]=p.z;
  snV.push(new THREE.Vector3(
    (Math.random()-0.5)*0.0005,
    (Math.random()-0.5)*0.0005,
    (Math.random()-0.5)*0.0005
  ));
}
const snGeo=new THREE.BufferGeometry();
snGeo.setAttribute('position',new THREE.Float32BufferAttribute(snPos,3));
brain.add(new THREE.Points(snGeo,new THREE.PointsMaterial({
  color:0x5577aa,size:0.005,transparent:true,opacity:0.1,
  blending:THREE.AdditiveBlending,depthWrite:false
})));

// ─── Grid ───
const grid=new THREE.GridHelper(6,30,0x0a0a1a,0x0a0a1a);
grid.position.y=-1.2;grid.material.transparent=true;grid.material.opacity=0.035;
scene.add(grid);

// ═══════════ POST-PROCESSING ═══════════

const composer=new EffectComposer(renderer);
composer.addPass(new RenderPass(scene,camera));
const bloom=new UnrealBloomPass(new THREE.Vector2(800,600),0.55,0.4,0.45);
composer.addPass(bloom);
composer.addPass(new SMAAPass(800,600));
composer.addPass(new OutputPass());

function updateSize(){
  const r=container.getBoundingClientRect();
  renderer.setSize(r.width,r.height);
  camera.aspect=r.width/r.height;
  camera.updateProjectionMatrix();
  composer.setSize(r.width,r.height);
  bloom.resolution.set(r.width,r.height);
}
updateSize();
window.addEventListener('resize', updateSize);

// ═══════════ SIGNAL FIRING ═══════════

function fireSignal(fiber, color, speed=1) {
  if(!fiber?.userData?.curve) return;
  const geo=new THREE.SphereGeometry(0.015,6,6);
  const mat=new THREE.MeshBasicMaterial({color:color||C.cyan,transparent:true,opacity:0.9,depthWrite:false});
  const m=new THREE.Mesh(geo,mat);
  const hg=new THREE.SphereGeometry(0.04,4,4);
  const hm=new THREE.MeshBasicMaterial({color:color||C.cyan,transparent:true,opacity:0.4,depthWrite:false});
  m.add(new THREE.Mesh(hg,hm));
  m.userData={curve:fiber.userData.curve,t:0,spd:(0.25+Math.random()*0.35)*speed};
  brain.add(m); signals.push(m);
}

// ═══════════ LOBE ACTIVATION ═══════════

function actLobe(k, intensity=0.5) {
  if (!LOBES[k]) return;
  lobeAct[k] = Math.min(1, lobeAct[k]+intensity);

  const fibers=lobeFibers[k];
  if(fibers){
    fibers.forEach(f=>{f.material.opacity=Math.min(0.85,f.userData.rest+intensity*0.55);});
    if(Math.random()<0.5){fireSignal(fibers[Math.floor(Math.random()*fibers.length)],LOBES[k].fiber,intensity);}
  }

  // Inter-lobe signal propagation
  interFibers.forEach(f=>{
    if((f.userData.from===k||f.userData.to===k)&&Math.random()<0.25){
      f.material.opacity=Math.min(0.5,f.userData.rest+intensity*0.3);
      fireSignal(f,LOBES[k].fiber,intensity*0.6);
    }
  });

  // Sulci pulse
  if(sulci[k])sulci[k].forEach(s=>{
    anims.push({m:s,s:performance.now(),d:900,fn(t){
      s.material.opacity=t<0.15?0.05+t*1:THREE.MathUtils.lerp(0.20,0.05,(t-0.15)/0.85);
    }});
  });

  // Lobe sphere glow
  const sphere=lobeSpheres[k];
  if(sphere) sphere.material.opacity=Math.min(0.35,intensity*0.4);
  const glow=lobeGlows[k];
  if(glow){ glow.material.visible=true; glow.material.opacity=Math.min(0.25,intensity*0.3); }
}

// ═══════════ REGION INFO CARD (hover/click) ═══════════

const regionCard = document.getElementById('region-card');
const rcName = regionCard.querySelector('.rc-name');
const rcFunction = regionCard.querySelector('.rc-function');
const rcBarFill = regionCard.querySelector('.rc-bar-fill');
const rcPatterns = regionCard.querySelector('.rc-patterns');
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let hoveredLobeKey = null;
let lastDiagnosisEvent = null;

// Build clickable targets from lobe spheres
const lobeEntries = Object.entries(lobeSpheres);

function onPointerMove(e) {
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const targets = lobeEntries.map(([,m]) => m);
  const hits = raycaster.intersectObjects(targets);

  if (hits.length > 0) {
    const hit = hits[0].object;
    const key = lobeEntries.find(([,m]) => m === hit)?.[0];
    if (key && key !== hoveredLobeKey) {
      hoveredLobeKey = key;
      showRegionCard(key, e.clientX, e.clientY);
    }
    renderer.domElement.style.cursor = 'pointer';
  } else {
    if (hoveredLobeKey) {
      hoveredLobeKey = null;
      regionCard.classList.remove('visible');
    }
    renderer.domElement.style.cursor = 'default';
  }
}

function showRegionCard(key, mx, my) {
  const lobe = LOBES[key];
  if (!lobe) return;

  rcName.textContent = lobe.label;
  rcFunction.textContent = lobe.fn;

  const intensity = lobeAct[key] || 0;
  const pct = Math.round(intensity * 100);
  rcBarFill.style.width = pct + '%';
  rcBarFill.style.background = '#' + new THREE.Color(lobe.color).getHexString();

  // Show active patterns for this region from last diagnosis
  let patternsHtml = '';
  if (lastDiagnosisEvent) {
    const region = lastDiagnosisEvent.regions.find(r => REGION_TO_LOBE[r.id] === key);
    if (region && region.patterns.length > 0) {
      patternsHtml = region.patterns.map(p => `<span>${p}</span>`).join('');
    }
  }
  rcPatterns.innerHTML = patternsHtml;

  // Position card near cursor, keep on screen
  const cardW = 220, cardH = 140;
  let x = mx + 16, y = my - 20;
  if (x + cardW > window.innerWidth - 360) x = mx - cardW - 16;
  if (y + cardH > window.innerHeight) y = window.innerHeight - cardH - 10;
  if (y < 10) y = 10;
  regionCard.style.left = x + 'px';
  regionCard.style.top = y + 'px';
  regionCard.classList.add('visible');
}

renderer.domElement.addEventListener('pointermove', onPointerMove);
renderer.domElement.addEventListener('pointerleave', () => {
  hoveredLobeKey = null;
  regionCard.classList.remove('visible');
  renderer.domElement.style.cursor = 'default';
});

// ═══════════ WEBSOCKET ═══════════

const reconnectBanner = document.getElementById('reconnect-banner');
let ws = null;
let reconnectTimer = null;
let hasReceivedData = false;
let reconnectAttempts = 0;

function connect() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${location.host}`);

  ws.onopen = () => {
    statusEl.className = 'status-badge';
    statusEl.querySelector('span').textContent = 'Connected';
    reconnectBanner.classList.remove('visible');
    reconnectAttempts = 0;
  };

  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.type === 'init') handleInit(msg);
      else if (msg.type === 'diagnosis') handleDiagnosis(msg);
    } catch { /* ignore parse errors */ }
  };

  ws.onclose = () => {
    statusEl.className = 'status-badge disconnected';
    statusEl.querySelector('span').textContent = 'Disconnected';
    reconnectAttempts++;
    if (reconnectAttempts > 1) {
      reconnectBanner.classList.add('visible');
    }
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connect, Math.min(2000 * reconnectAttempts, 10000));
  };

  ws.onerror = () => { ws.close(); };
}

function handleInit(msg) {
  agentInfo.textContent = `${msg.agent} @ ${msg.sessionPath.split('/').pop()}`;
}

function handleDiagnosis(event) {
  hasReceivedData = true;
  lastDiagnosisEvent = event;
  lastActivityTime = performance.now();
  updateHealth(event.health, event.grade);
  msgNumber.textContent = event.messageCount;

  // Activate brain regions — map BrainEvent region IDs to anatomical lobe keys
  event.regions.forEach(region => {
    const lobeKey = REGION_TO_LOBE[region.id];
    if (lobeKey && region.intensity > 0.1) {
      actLobe(lobeKey, region.intensity);
    }
  });

  updatePatterns(event.patterns);
  if (event.activity) addActivity(event.activity);
}

// ═══════════ UI UPDATES ═══════════

function updateHealth(health, grade) {
  healthNumber.textContent = health;
  healthGrade.textContent = `Grade: ${grade}`;
  const circumference = 2 * Math.PI * 38;
  const offset = circumference * (1 - health / 100);
  healthRingFg.setAttribute('stroke-dashoffset', offset);

  let color;
  if (health >= 85) color = '#22c55e';
  else if (health >= 70) color = '#f59e0b';
  else if (health >= 50) color = '#f97316';
  else color = '#f97066';
  healthRingFg.setAttribute('stroke', color);
  healthNumber.style.color = color;
}

function updatePatterns(patterns) {
  if (patterns.length === 0) {
    if (!hasReceivedData) return;
    emptyState.innerHTML = '<div class="icon">&#x2705;</div><h3>All clear</h3><p>No behavioral patterns detected. Your agent is healthy.</p>';
    emptyState.style.display = 'flex';
    patternList.querySelectorAll('.pattern-item').forEach(el => el.remove());
    return;
  }
  emptyState.style.display = 'none';
  patternList.querySelectorAll('.pattern-item').forEach(el => el.remove());

  patterns.forEach(p => {
    const item = document.createElement('div');
    item.className = 'pattern-item';
    const severityColor = p.severity === 'concern' ? 'var(--coral)' :
                          p.severity === 'warning' ? 'var(--gold)' : 'var(--accent)';
    item.innerHTML = `
      <div class="pattern-header">
        <span class="pattern-name">${escapeHtml(p.name)}</span>
        <span class="severity-badge ${p.severity}">${p.severity}</span>
      </div>
      <div class="pattern-desc">${escapeHtml(p.description)}</div>
      <div class="pattern-pct">
        <div class="pattern-pct-fill" style="width:${Math.min(100,p.percentage)}%;background:${severityColor}"></div>
      </div>
    `;
    patternList.appendChild(item);
  });
}

const MAX_FEED_ITEMS = 20;
function addActivity(activity) {
  const item = document.createElement('div');
  item.className = 'feed-item';
  item.innerHTML = `
    <span class="feed-role ${activity.role}">${activity.role}</span>
    <span class="feed-preview">${escapeHtml(activity.preview)}</span>
  `;
  const header = activityFeed.querySelector('.feed-header');
  if (header.nextSibling) activityFeed.insertBefore(item, header.nextSibling);
  else activityFeed.appendChild(item);
  const items = activityFeed.querySelectorAll('.feed-item');
  if (items.length > MAX_FEED_ITEMS) items[items.length-1].remove();
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// ═══════════ ANIMATION LOOP ═══════════

let lf=performance.now();
let lastActivityTime=performance.now();
const IDLE_THRESHOLD=5000; // 5 seconds of no data → idle breathe mode

function animate(){
  requestAnimationFrame(animate);
  const now=performance.now(), dt=Math.min((now-lf)/1000, 0.05);
  lf=now;
  controls.update();

  // Brain shell fresnel animation
  brainShellMat.uniforms.uTime.value = now * 0.001;

  // Update lobe highlight for shader (smooth exponential smoothing)
  for (let i = 0; i < LOBE_KEYS.length; i++) {
    const lk = LOBE_KEYS[i];
    const act = lobeAct[lk] || 0;
    const goal = act * 0.7;
    lobeHighlight[i] += (goal - lobeHighlight[i]) * 0.12;
  }
  // Stem (index 9) stays at 0
  lobeHighlight[9] += (0 - lobeHighlight[9]) * 0.12;
  brainShellMat.uniforms.uLobeHighlight.value = lobeHighlight;

  // Subtle breathing motion
  brain.position.y = Math.sin(now*0.0003)*0.015;

  // Custom animations (sulci pulse etc.)
  for(let i=anims.length-1;i>=0;i--){
    const a=anims[i], t=Math.min((now-a.s)/a.d, 1);
    a.fn(t);
    if(t>=1) anims.splice(i,1);
  }

  // Lobe decay (35% per second)
  Object.entries(lobeAct).forEach(([k,v])=>{
    lobeAct[k]=Math.max(0, v-dt*0.35);
  });

  // Fiber opacity decay
  allFibers.forEach(f=>{
    if(f.material.opacity>f.userData.rest)
      f.material.opacity=Math.max(f.userData.rest, f.material.opacity-dt*0.15);
  });

  // Sphere opacity decay
  Object.entries(lobeSpheres).forEach(([k,sphere])=>{
    const target=lobeAct[k]*0.35;
    sphere.material.opacity+=(target-sphere.material.opacity)*0.08;
  });
  Object.entries(lobeGlows).forEach(([k,glow])=>{
    const target=lobeAct[k]*0.25;
    glow.material.opacity+=(target-glow.material.opacity)*0.08;
    if(glow.material.opacity<0.005) glow.material.visible=false;
  });

  // Signal animation (position + fade envelope)
  for(let i=signals.length-1;i>=0;i--){
    const s=signals[i];
    s.userData.t+=dt*s.userData.spd;
    if(s.userData.t>=1){
      brain.remove(s); s.geometry.dispose(); s.material.dispose();
      signals.splice(i,1); continue;
    }
    s.position.copy(s.userData.curve.getPointAt(Math.min(s.userData.t,0.999)));
    const f=s.userData.t<0.1?s.userData.t/0.1:s.userData.t>0.8?(1-s.userData.t)/0.2:1;
    s.material.opacity=0.85*f;
  }

  // Synapse particle bounce
  const sp=snGeo.attributes.position.array;
  for(let i=0;i<SN;i++){
    sp[i*3]+=snV[i].x; sp[i*3+1]+=snV[i].y; sp[i*3+2]+=snV[i].z;
    const d=Math.sqrt(sp[i*3]**2+sp[i*3+1]**2+sp[i*3+2]**2);
    if(d>1.3||sp[i*3+1]>0.6||sp[i*3+1]<-0.9) snV[i].multiplyScalar(-1);
  }
  snGeo.attributes.position.needsUpdate=true;

  // Idle ambient breathe — when no agent activity, glow lobes softly
  const idleTime = now - lastActivityTime;
  if (idleTime > IDLE_THRESHOLD) {
    const breathe = 0.04 + 0.03 * Math.sin(now * 0.0008);
    const wave = now * 0.0003;
    lobeKeys.forEach((k, i) => {
      // Staggered gentle pulse per lobe
      const phase = wave + i * 0.7;
      const v = breathe * (0.7 + 0.3 * Math.sin(phase));
      const sphere = lobeSpheres[k];
      if (sphere) sphere.material.opacity = Math.max(sphere.material.opacity, v);
      // Occasional ambient signal
      if (Math.random() < 0.0003 && lobeFibers[k]?.length) {
        const f = lobeFibers[k][Math.floor(Math.random() * lobeFibers[k].length)];
        fireSignal(f, LOBES[k].fiber, 0.3);
      }
    });
  }

  composer.render();
}

// ═══════════ SNAPSHOT MODE ═══════════

function initSnapshot(encoded) {
  try {
    // Decode base64url → Uint8Array → inflate → JSON
    const b64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const inflated = window.pako.inflate(bytes, { to: 'string' });
    const compact = JSON.parse(inflated);

    // Expand compact format → full BrainEvent
    const event = {
      type: 'diagnosis',
      timestamp: new Date().toISOString(),
      health: compact.h,
      grade: compact.g,
      messageCount: compact.m || 0,
      regions: (compact.r || []).map(r => ({
        id: r.i,
        intensity: r.n,
        patterns: [],
      })),
      patterns: (compact.p || []).map(p => ({
        id: p.i,
        name: p.i.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        severity: p.s,
        percentage: p.c,
        description: '',
      })),
      activity: null,
    };

    // Update UI
    handleInit({ type: 'init', agent: compact.a || 'unknown', sessionPath: 'snapshot', startedAt: new Date().toISOString() });
    handleDiagnosis(event);

    // Update status to "Snapshot"
    statusEl.className = 'status-badge';
    statusEl.querySelector('span').textContent = 'Snapshot';
    statusEl.querySelector('.status-dot').style.background = 'var(--accent)';
    statusEl.querySelector('.status-dot').style.boxShadow = '0 0 8px var(--accent)';
    statusEl.querySelector('.status-dot').style.animation = 'none';

    // Show snapshot CTA
    const ctaEl = document.getElementById('snapshot-cta');
    if (ctaEl) ctaEl.classList.add('visible');

  } catch (err) {
    console.error('Failed to decode snapshot:', err);
    statusEl.className = 'status-badge disconnected';
    statusEl.querySelector('span').textContent = 'Invalid snapshot';
  }
}

// ═══════════ INIT ═══════════

updateHealth(100, 'A');

const urlParams = new URLSearchParams(window.location.search);
const snapshotParam = urlParams.get('d');
if (snapshotParam) {
  initSnapshot(snapshotParam);
} else {
  connect();
}
animate();
