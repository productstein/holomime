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
const BRAIN_V_B64 = "Q8qPvUUSvbtCQ/8+Jt9svfphhLq/Q/E+e4iGvfMCbL0Kov4+EAbevUmAmrz6RP4+OwHNvZQTbb2zzf0+ptUQvewXbL0ofvw+vW98vWWqYL1dp/E+SrVPvUljtL205fw+gq3SvdoDLbqq8fI+8u8Tvn+HIjt4RfA+kzXqvarxUr2tL/I+k8bovVIn4L3AW/A+j/xBvHk7wr1Hj+8+WJBmvQ/R6L28kfk+w4HQvX50qr3MtP0+m+bdvZdWgz2/fe0+yY6NudPZyTpd+ew+4ukVvKpDbr12N+8+XksIvinLkL0Sg/A+9u6PvWDNAb42k+8+SFC8vbubB75fDPU+y/NgvWrZWj1+Ou4+vCL4vA03AL6M1vE+5lyKvcPTqz2WW+o+n47HOzF8hL2hud4+OjsZvpJ0zb3dB/A+oOBivQcIZjwFbt0+GLI6vjbNu70fhes+FZFhvXrkz70rTdo+jnWxvdPZybpsleA+TMMwvuHurLzJdu4+OZdCvpxQiL2gVOs+iLoPvSHIAb6hvuU+BkeJvWwEAr5eEdw+pn5evQxZXT0abuA+Hv4avavPVT1wtuk+5E7pO4yEtjsawNs+zNFjvRNJdL26a9k+4Ln3u+84xb06I9o+synXvZAU0T1ivtw+PgVAvCDv1T3BVtk+Vd4OOyKmhD0JG94+xck9vo/8wTqq1Nw+93UAvlOWAb7Uguc+E2GDvYbJ1D3+Q9o++3nTvbwFkj31udo+q88VvkloSz0pP+k+HuEUvmiu07sJbdk+2Vpfvs7fBLxyxNo+q+w7vuBKdr0+6Nk+dc0EvlhWmr2SkeM+LlY0vvq4tr17SeM+4JzRveIey71QNuU+rP8Tvi0+Bb7VJt4+6PbSvbahAr7Pg9s+AoIZvtUE0T2pMNY+xFocvviqlT2O6dk+QwQ8vuikdz3wp9Y+deWzvcpskL1MidQ+uwppvkT6bb0aadk+PrNkvieD473Fj+E+4gYcvv3Zz73SNeM+JNZCviyfBb6WJtU+JVg8vj0s1Dwfv8c+O1NovVuUWTv4iMg+b57qukxUb72Ci8U+4bRgvYRkwT0cJc8+oDcVvgXAeD2fjsc+K6R8vGDNgT0sZck+fQVpvTKPfD3zcc0+AFIbO6lqAjuNC8c+cQO+vXRGlL1UUsc+fqlfvm5RBr6QiMk+z2tsvZZ4AL4VdMs+4LkXvnIWdjwfLsk+cEKBvs9rbL29UtY+bLKGvlnd6r3HgMw+inaVvVGgz70dj8k+9UrZvS7/Ab5O7sc+NupBvvrQBb7xLsc+26KMvT0n/T2WBNg+AFKbu8tK0z0O28Y+XAPbvad5hz14C8Q+pMI4vhlWcT11k8g+MExmvup4TDyrPsc+fhhBvsedUr06kss+6X3jvfuuyL1hw8M+mbs2votU2L0RqsQ+c2MavhSuB74H8MY+q1u9vVbxBj6OzNM+5A8GvuhNxT3DZMo+CySIvhPygb2A1MY+8Uv9O3XIzb18D8c+vjAZvqyL270CZcM+SP5gviIaXb2gbMo+pfeNvE9YAr5dM8k+CtcjvDvfDz7nxsQ+5SfVva9Cyj1U48U+z72HvrmlVbvjNso+0oyFvUJDHz6e78c+k1dnvgaeez3ek8c+/tR4vdrJYL0qOsI+cJQ8vILih72gN7U+tDzPveROCT4hH8Q++1wNvmjQED60jso+mFEMvkUS/T1gPNM+fJt+vFORyj04Z7Q+EOkXvqbQeT0CZbM+gv8NvqhvmTyMhLY+6WB9ve8bX73WHLA+DWyVu3v3x72yY7M+bEOFvpCICb4pIsM+P6k2vtCbyj3bv9I+LCtNvp1jwD1UAMw+d/NUvffMkrt3hLM+hjiWvpDahL1IFsA+WP+HvvevDL4w9bM+eNE3vtLGET6X/8A+fzBwvT7Qij3HRrA+by/pvQwHQj2vsbs+pmF4Oz4/jDr0prI+lNkgvRbB/72q1Lw+AyZwvQYS1L1kO68+bAn5vZGbAb7Ox7U+MnIWvikiA75aR7U+K9lxvlXeDr7lYbE+HhbqvRA7Mz7Vlb8+luzYvVn6ED7yXrU+aJaEvQLUFD4bErc+HuG0O2srFj6IEbI+/1sJvl3+wz1a2LM+yXZevmnjyD3MYsI+fSJPvZCIqT1nD7Q+BWlGPHhFcD23KLM+NlmTvvQ3oTqBJsI+8gyKvirGeb0KgLE+m48rvoDxzL0mNq8+QiYZvo+lz72YbrI+Vd7OvZCg+L3XUbU+FvaUvmGJB75dUL8+yjKEvfpEPj7Esa4+Y7nlvXmv2j230bA+02povu317j1zEa8+eChKvqGEmTxPO7w+dhqJvr06hz057rQ+gH2Evh6naD2Or70+ETacvpKRs7tagbE+9bmKvlvOJbvOwq4+4NZdvtFXkDz3Abg+hULEvRcrar1q2ao+OsyXvvn32b00S8I+bhc6vq7TCL7UfbA+BFbOvbDJOj4hdrY+HNMTvkXwPz5VTbA+DAcCvjfDDT7pJrE+jsxDvnzVCj7c9Lc+GedvvlRvjT0VxrY+Di3yvbHh6TxMibQ+m+advuGXer0U6LM+ATV1vrN7cr3Yu68++KV+vZhM1b3RP6E+mQ1yvmKh1r3PoKE+Imw4vrJoOj5iLa4+pu1fvnDrDj55zLA+NWPRvdl3hb3oMJ8+2o/UvfLq3L1nYZ8+qYeIvhFT4r2COZo+PWFpvqrUDL4X2Z4+KA+bvrzoC75UHbI+aD/SvcTrWj4ctq0+KCxxOzQuPD78460+bxIDO9RlET5xyaE+6X2Dvtj1yz2wOKw+F/EdO91e0j1zEZ8+TrSruyl5dT3zcZ0+WJCWvg5PLz1f764+0NWGvhGN7jt6/J4+O6qKviRiCr50B6E+Io6lvo518b1xybE+3xo4vlUY273xS50+3Qz3vXrfOD4Cn58++kQ+vmag8j2QTq0+U64QvnWwfj2U2aA+ufyHvsR8eT0+P5w+9P1UO2jon7pw654+beJkvXhFcD3QCpw+HF97vbN7cjwkKJ4+NUZrOwh3Z72xUJs+4BCqvqYP3b3bxKk+uXBAvsB4Br4YIZw+vftjvePCYT6wOKw++DZ9vT1+Lz7RP6E+Z9XnvRhDGT7ayaA+QrJAvkmFMT4VqaA+s+pzvVu2Fj5fKZs+SZ0Avr9ICD7TMJw+2gNtvthkDbxzS5s+I6GdvgOVEb6LcZ4+/5WVvGpqWT4+0Ko+m/5svQtjyz3M7pk+BioDvskfzD3WxZ0+ctxJvnic4j0DeJs+Lq1mvuRJ0j2r7Js+v2CHvqBsyj1qGJ4+SKeuvjJax73d0po+RkLbva0XYz6HoqA+93VgvRVvZD4qjJ0+R8kLvqkwNj7acp4+Z371veZ02T2vCJ4+RS9jvj86dT3JApY+/Z+DvssQR73TTaI+bah4vtb/Ob1rt50+IxCfvhiV1L131p4+yhr1O0FlvL2brKE+MSUSvmtlAr5rn54+4BCqOzcaQD6JDJs+sI9uvh7htDzrbo4+nWOwvhbBf72wyZo+WTSdvt0khr37V5Y+vmoFviyCv71olpQ+WP8Hvr1vfL27RJU+z2sMvmLzcT4xJaI+JJd/O447ZT7ulJ4+uXCAvg6EBD4Tfqk+YFmpvYcW2TwUrpc+VRibvrhAgj0BwZw+PgXAvT8djzz83oY+7wOgviQLmDsFhpw+rP9zvZnwi70/b4o+hbGFO/Utc70dd4o+QYLivXvagT5crJg+stc7vtHLaD5xVZk+BMomvsqJVj5dM6k+K4eGvlFOFD7vVZs+JXVivpHQNj7VPp0+Di1yvukOIj5xj6U+TpcFvuj20j2etYs+Q61pvTm5Xz1f744+VONFvljnmD3a/pU+DDy3vb+3aT2N7pA+kzWqvS5zOj26TpM+xvkbu4Y97TtPdYg+vfuzvnrfeL0ofow+KLiYvsIvdb0R5JA+SYAavWuCqL1Zo44+UBl/vdmZwr3CNIw+Cr/UveauhT6FCIg+IVmAvcaFYz6kwog+ZRlCvh9oJT5wzpg+C2OLvSk/CT4R5JA+7ndIvu22yz0zxJE+BTSRvSOExz00Low+1bI1PMFzbz0ep4g+Gt2BvS6QIDvh0YY+UgqKvifChjwNq4g+kdWtvl9GsbuO6Zk+cLYZvvH0ir22vog+4BCKvmQj0L28eYo+eH+8vIfhgz5pOps++3kTvmyVgD5hGpY+Sx86PFLVRD7ir4k+GxJ3uyGwEj66FIc+LsqcvkJg5Tp2Mog+6N6zvuJ1fbzwFog+symHvi+jmL2MuYs+443MvTV74L38+4w+bAkZvv1NCL62SpA+Uiy3vIkHhD5R2os+g0wSvtrmRj5JgIo+zF3LvfYjZT77rog+dY7BvUi/PT4/kYc+2etdvpq2Xz4VHYk+g1EJvoB9FD5RFIg+R3KJvhyxFj7Ry4g+rUyIvjeO2D0O24Y+BBxivmsOkD0EOYg+bZAJvvsioT327o8+nG2evuROaT1tOYc+q891vi7iu72hSo0+RSoMvhgm071ssoY+2EdHvu5C870e/oo+SnuzviYBCr7ImJs+P8ZcvWTpgz5qvJQ+kIgJvjl/gz7aVYg+ieotvqmHaD5sCYk+skY9vjm5fz6KzYc+aFwYvvFjbD4U6IM+zohSPP59Zj6pn4c+J9qFvpm7Nj7VsoU+gGAOPAfrvz3AJos+H4VLvkJDfz32QIs+utqqvluUWT3LZ4k+Rl9hvtnOF75uUYY+nPmFvljFG74Pf40+0H6UvnQpDr4HCIY+6//cvYtxHj4teIE+rFaGvtCbij0Kv4Q+3Xu4vW2omL3Wi4E+WRd3vr7Bl710XoM+J/c7vnl1Dr7tgYY+E/KBvQ0aij6oAIg++1wtvpkSST6ze4I+d2edvsaFwz1j7oo+B0IyOs3psru62mo+3+CbvqzFJ7tuTG8+PgWAvZYJP7w6dWU+JvzSvTI4ir1lpWk+EVOyvkKywL3qsog+3h+fvkpBN778NYk+mIaxvgq/NL6yEYg+5x1nvkWeRD6JXoY+5nlwvtMTFj4iiX4+MbGZvmSvFz5JY4Q+0XR2vp/l+T0+7YA+/ACEvnS11T1ihHA+nDMiPE56X71KKWg+0Ceyvtlfdr2Xc2k+1nPSvVcJ1r3Q7WU+86u5vuZXE74f14Y+Wwgyvh3maz7WOWY+k1fnu/8JDj61/Ws+ARhPO+rnzT098mc+eCiKvlLyajzZJWo+h6Igvs07jr02AnE+RFGgvgbYh70ktGU+fA+Xu6smiD6sVmY+bXNDvmkdhT6cv2k+bqMhvhcOZD6oV2o+AivHvUbOYj4OT28+3zKnvUfmUT5Mw4A+lLy6vddMPj5r8Wk+qTA2vYGyCT4f12Y+dmyEvYgRQj3EfHk+pPxkvuxphz0uHGg+eHqlu+IBZT30pmI+DHbDve8DEDydgGY+BhJ0vqFKzTyBQ2g+GRy1vvQauzuKq2o+tJOBvbmqbL0IWmE+npiFvmjQ0L0Bamo+OX+jvkMcq72IaHQ+iquKvjfDLb677YI+ecyAvQu1lj55dW4+lialusxAZT6MvmI+kZuBvlIsVz4TuIU+NsikvSyaTj67RHU+whIvvoC3QD6Je2w+4gacvjBkFT596GI+wmkBviL99j0Cgnk+eO6tvlUThD0iN2M+yAyUvQ/Wv70RAWc+xTi/vkXY8L1cPYc+4XoUvorl1r1OKGQ+Q3ONvgXFD74ukGA+5x23vouJDb7NI18+z4NbvurPHr4Tm28+n3aIvuwvO74Ab2E+mMCdvs7CPr4ZOWs+0a6yvtfdPL6la2Y+YOXQvTSdjT5PBmc+shGIvU0VjD6etVs+EDsTvvbRiT7FIHA+Sgxivj3VYT7yB2M+2uGPvk/pQD6kpXI+PKBsvkG3Fz7henQ+7DTSvYbJFD4cQnU+ms6evurnzT1nJ2M+JXqJvoC3gL1Q5Gk+8G16vukOor1xWnA+OzbCvjOKBb4r3mg+vTqnvsvWur2d9H4+R1UTvpZDC769Omc+UwVDvi2yHb5cIGE+AU2Uvj3VIb4C8Xo+c51GvXZxWz5NEFU+fqmfvGMLQT7rkFs++KUevhE2PD5BZVw+I/OYvsFuOD6qt2Y+zcxMvrdFmT1qE2c+mBeAvvmgZz0m/HI+XDgwvuF6lL2RD1o+28QpvvM8uL3Ynlk+z2tsvtTUgj6HxF0+SL89vqsEaz6+3j0+YRqGvg7zZT4DPl8+9mKIvhdIED42zVs+nYU9vVM/7z1M4FY+4Qtzvs/arT0O23Y+VMafvnctoT2jQF8+ZVOuOghagT0Kuj0+nrWbvZg0xr1oXDg+mxsTvsO2hT7mBTg+lDDTves5iT4kuTw+glaAvltCfj5072E+K95ovp/Naj5xIEQ+XtcPvrnCOz6mfj4+41NAviukPD6RLEA+eHqVvj7o2T3I0kc+IbCyvQFNhL2H/kk+B/BWvjRLQj67J08+o0AfvFk03T0HfD4+zjZ3vuXtCD7n4zo+gXhdvS6Q4D1D4j4+F5qbvtUmjj2rWz0+0GE+va67eT38NTk+5bM8vXfbhTwyd00+1QSxvg5KmDwEITk+HvnDvcFWyb1QGT8+aMt5vu+Pt70Gnls+Gm7Avr72jL2wA2c+pgpmvj7LM75YxVs+3UFsvePHiD5Qqj0+ZCMQvgJIbT4KLjY+001ivVTjZT7Q8jw+W86Vvg8LVT6MSko+LA6HvnkGbT5jfzk+qmWbvrMHOj4IPTs+w4GQO1HaOz7on0A+iQc0vgexEz73zDI+ptUQu4E+ET4YQzk+HhaKvmpNczyTjDw+AJGevu0NvjooJzo+BBzCviSX/zpvZD4+3GPpvRSuB77u60A+zXUavmAf3b17Tjo+eQGmvtKMBb7iWDc+M4q1vslZGL4UBTo+4EqGvuiCOr7iBjw+j8K1vvJ7O75slUA+T1jivSy8az53oTk+TRCFvuLpFT4F3T4+P4wQvqm8HT6Cyjg++Ul1voVf6j1zoj0+bZCJvh7Ezj2lMTo+LPGwvgTnzD1RiGA+o+mMvp3XmD2bODk+YJM1vk9Ak72+vEA+zemCvp0R5b0dVU0+ZOnDvnwP172utmI+RIaFvn0/Fb68rj8+bhc6vj81Hr6oGEc+aAUGvUNznT515VM+hj3tO6zFp7nOcEM+fGGyvup4zLr3xxs+f6QIvB3mS71p40g+tJOBvb/Uj70ktEU+kBSxvoTwaL3RdDY++5Z5vjhK3r1pdEc+aR21vvYjxb0O2zY+Q//Evj0s1L1txT4+Jo0Rvi0JEL7Hujg+LT5lvv0wQr41DD8+rMUnOZKWmj5I4To+SG1ivpZ4gD5V+zQ+UTFOvdS3TD7KbFA+YTKlvuviFj6ySzQ+6bevvrXDXz2pvD0+6LymvjJylr3nOk0+4/wtvk0Qtb2u8C4+C7WWvnE4U77RV1A+27+iviMQT77xaEM+Dvh8vSHqnj5070E+bRwxPG7Ahz4GLzo+fuOLvpMANT5vuzA+Tii0vhak2T3X3Tw+eqWMvqbVkLwOFSM+Foejvo4GcLyLTyE+vFwkvuIBpb3EWjw+QYJCviYeML4x0zY+RgjPveOlmz5SREY+Z34VvhSWmD6pMDY+UDZlPOSgZD6YaTs+fApAvtuFZj7bbRc+qyYIvimuaj5rKxY+z9ptvm7AZz7cKR0+2IGDvqlNPD6MEB4+rWlevfkxBj41Ris+rcCwvgtBDj68Ijg+bxKDuXKndD1O7hc+hNPCvnIzXLzSNRM+gnPGvkvqhL1V9j0+Sl6dvsuEX72s4g0+MbF5vhqLBr4mjTE+d9vFvjMzE77t8Dc+7UeKu1Ozhz74/BA+LNSavdz0hz7qWyY+3rDtvU6cXD524Bw+YtaLvpEnaT6m7R8+v4I0vviqNT57MRQ+o5I6vRgJDT6w/g8+JVicvutWDz4C1BQ+eHqlu6THDz6/1A8+4WK1vguYwD0Zcxc+VWr2ugwf0T2dSxE+jGfQOx+AVDyRRA8+6ZpJvVVNEL0i/RY+kpaKvbhYUb2unhM+ezHUvcbEZr0TChE+hnKyviwrTb2EKhU++kQ+vh+AlL39ag4+7nw/vosy271Zhhg+pmGYvvXbV76bWhY+hlWMvqJFVr6kpRI+PIMGvme4oT736Rg+oP2IvXQHoT4uxRU+FAU6vkNWhz6QFDE+78lDPK1MOD7Fcgs+Ci42vh2PGT5WvBE+2ZQrve8bnz2BBCU+7xu/vj9vKj2YhkE+YvOxvgN4iz2ZDRI+6IcRvs5wg71xWhA+pFMXvjzaGL6gphY+ZY2qvv5gIL6t+hw+ajDNvS/Anj7VlQ8+Dvj8O+BnnD7d7xA+c4DgvWGOjj6+pBE+lialu+auZT6zmBg+D2KHvjSAFz7LZxk+JLQlvsUbGT5O0RE+Q+eFvuutwT0oYSY+nL/Jvu7rwL3sURg+krOwvZzhxr34iBg+zJc3vhk5C77/Wwk+dEZ0vqgdHr4npSA+qTAWvhToM76BPhE+21ChvnHmF76ADhM+lpVmvi5zWr5f0hg+Q3O9viHNOL6VZSg+gUOIvgBSO76QgxI+F/FdvpMAhT67Jw8+fhhhvjBMRj7IXg8+w9iivvpEPj7XoxA+luexvl0WEz5n8g0+0a5CvcLA8z1n1Qc+b2Sevlu2Vj0xfCQ+2evNvqs+F77V5wo+tKvAvlD8OL4wRw8+Olg/vu4IR74zUBk+CoW4vpHQNr7EXxM+GcWCviScVr7Thy4+chamvtc0T74OhCQ+rBxavVvrqz6kiAw+chY2vo6Slz7ImBs+MbEZvg+5iT4GgRU+sac9vu8bjz75FCA+LzRXvfOTaj5qpAU+OnqcvjVGaz43TxU+pMcPvvFLPT58LB0+YM2hvvTgrj2L/QU+nUaavZjd070OvhA+BHMUvrdiv71SRAY+KZbbvfWcFL4+yxM+iIVavkOtSb4sDic+AFIbvZCIqT7dtQQ+0xMWu2Q7nz5798c9saKGvR4Waj4qOtI91m77vQ6+UD6pTRw+J9pVvlR0JD4hdgY+m6yxvk0VjD1AMMc9qIy/vt/4mj3hQAg+OBWJvgmnJb5gdg8+V7JjvZHtrD5a2NM9ICSLvfoniD7OGdE9pyKFvhqLhj4mAQo+eJxivgTihT4Gu+E93J2FvnLcaT64kt098Whju8O7PD6N7uA9Ns2bvghVaj3rxdA9n8gTPNk9eT0u59I9QQ7Kvnk7gr2tFwM+eTvCvQ5KmL2yLu493NexvtxogL24Ad89tcOfvohGd72E8Og93XsYvgfO2b3qCcs9wcpBvitqEL4RqtQ9lniAveNToD4RAcc9Jqo3vnx+mD7R6M49l8qLvv/ngD6GcuI9B0IyOtKMZT5ansc91H3Avb0dQT6lZs89SDM2vgspHz4S99g9LlZUOgIOIbwHztk9sySQvo3ROr3MCxA+1xeJvSukfL0j+N89DvgcvqAVmL0lO/Y9+5GyvgEYz705tMg9XW3FvgkWx70qb8c9OIS6vipSAb5O0dE9uYhvvi4caL7L29E9/mBAvvzjXb4AjAc+iLqvvmEyVb75oAc+RSoMvt+mnz6t+tw92LYIviF2hj4AAMA9EHU/vg/RaD4LQc499RCdvo1dYj5rn849Fk2XvleVPT7ZWt89Wke1vnqN3T1Bn8g9pn7eOzCB2z2bPdA9kL2evjBHDz3nqc49X9KIvsKjjTwsgr89jX+/vhCShT2DL8w9Wd1KvsKGp70DlfE9sMnKvitNir3129c9fdBTvkD70b3BVsk96N7DvQN4y7165M89CRuevnVZzL0d5ss94ISyvrDJOr49Ctc9AU2EvjUMP75g6uc9FOgTvielQL7CF+Y9YY6evseAbL66g9g9i4nNvezAqT5QGf89SkbOvVmjnj7+t9I9mFHsvTVeij4xttA9tHY7vmIQiD7ls7w9SNxjvl6dYz4bKsY9UwUjPPs/hz6Z8Ms9aam8vVvOZT5+b9M9pBlrvr8OPD7YgbM98phBvipXOD7qeMw9SkauvieIOj5D/wQ+Z2G/vpsDxD0L0sw9lkNrvj7LczyVmr09aNCQvk+vlL1YVto9csQ6vo4B2b3RrsI9Z7jBvTGUE77cuts9SYDKvukmEb4iid49gQTFvr4wOb6NtNQ9NdKyvuIBZb7nOs09Tigkvp9xYT43VMw9BHO0varxMj6pTZw94Jyxvs2SQD7EztQ9r5l8vokkOj7GhcM9nFAIOW5MDz78xtc9EDuzvkIJEz63es49CW05vVoqDz7iBvw9FAV6vlitTD3PTsY9BHPEvkYID7zuJc09AmVTvSdO7rxETMk9GHjuvYWZNr6jkvo9/3ifvgn5IL7aj9Q9eGI2vuC5N77cRsM9qB0evjY8Xb6Hbcs9Tb45vvXzZr7d79A9UPzYvciYqz4Xn8I9L8Aevl3hPT70ibw9bZBpvoV3GT6JJLo9u36Rvrw/Hj7P2u09H6KhvjhK3j1rK7Y9HTiHvuAtkLt2bIQ9vCJ4vq5HQb5Yrcw9T6+kvkjENL5nfrU9eSNzu+ChaD5NhI09dY6BvefjOj6PcJo92skgvgpoIj7GbbQ9nZ2cvkmFET5Yxds9T1jCviBeVz02dok9rvBOvu8DkDw9D649Ke2dvoIcFDuJJHo9oE+EvtKpa768dNM993VgvVGlZj5mTpc94PNDvviNLz4n2pU9YwtBvoB9FD7gnJE98bqevhK9jD140Zc9FyuKvjRoaD1BSJY912nEvtoDLTwqkYQ9COZovU8elr0KaKI9Vn2OvoEExb0YIbw9oUoNvqqa4L0W+4s9HHxBvjpA8L2rJog9xm0Uvn3QE777OnA9XW1FvgBvQb4RqpQ9PrNEvj6ubb4lQI09g/o2vvC/hT4tPoU993Xgu24XOj7xaGM9QPaqvqhSUz7CL7U9knStvtxLOj5dp5E9ipO7veZcCj7h0YY9vTrHObOY2D06enw93bWEO3goij0dPX498KIvu9uiTLw/44I9IjdDvgGHEL7hl3o9zqrPvX1cO75rZYI9a32xvsNkar6fsIQ9lxyHvgeZhL6XHLc9/B3KvdnrrT67foE9P8bcvJj6qT4Wh7M92IETvpBOnT646Y89kE6dvrNebD4csZY9/vGevv7xPj5I3GM9vYyivva0Iz5ZaZI9ehm1voY4Fj4U0IQ9N4mBvRpRGj7gSnY9fPIwO/hrEj7MtH09nBZcvmPRFD5PXXk9N6ZHvp+T3jw98oc9UTGevjNQ2b27foE9AFeyvphu0r3p8Xs9y9Zavru4Db5kQHY99dvXveZ5EL4FaYY9UmGcvuauRb4mHpA9pRR0vVUYiz6+amU9sOYAvs8Uej4fS589t3oOvtnOhz70w4g9rmSHvrnHgj5p44g93C6EvoS7Mz5t4mQ9gUOIvuc6DT5mFEs9ICSbviU7tj1QjZc9Rz2EvpKWSj0IILU9SBtnvsvWejw1tWw9EqWtvpUrPD1A2ZQ9za/mOguYgL0zbX89iSR6vbgj3L2/ZY49lialO+4lzb0drH89LWDCvZn14r0TLI496GrLvrcoE7735GE99tHJvizxQL5iFW89niRdvUW7mj4qdF49L27jvUF9mz41tWw9mUd+uzLmnj5UHXI9gCs5vr4wmT5Mpoo90H4kO/Euhz5kr3c93GNpvh13ij6ZR349aLOKvpnTZT5zol09g8BqvuC5Nz5oImw9sySgvtb/OT532wU89P20vmL4iDzlszw9xebDvtJv373S43c9LlZUOwnhEb4gQXE9AJF+vnR7Sb7bin09cCWrvlORSr6sVqY9uixmvk56P76zJIA9lIcFvs2vZr4vaYw9cJScvsEcXb7OGVE9S+Vtvhsqhr7ABK4973Jxvscpir4peXU99b5xvWSSsT6vJWQ9OL52PDdsqz646Y89bM/svVsliD5Yc4A9uJI9vq9Caj7ReY09QGpzvnU8Zj5pAG89nPmFvvT4PT7n49o743CGvsX+Ej5sQ8W7DOXEvVPQ7T1QU0s9HF/LvtAncr3htGA91ouRvrecy71XYIg9/n2GvfuWGb4OZ3494syfvmXHBr6RJ0k9zLStvj+MEL7ovEY9rp7DvhLaEr7jwgE8+5ECvtyAL76RRC89ZDu/vugwX77Wxa09cF9nvnldX7768oI90ZEcvlrYg75w6249+KqFvo9wir56jV09YLCbvghagb6xooY9Jt+Mvsxdaz7KGnU8l8VkvtwuFD5OtCs73V7CvvpE3j3f/XE9WMWrvvrtqz3KbJA96GpLvsXmYzzdtYQ8hsnEvhGN7jpLWQa7JNFrvnWwfr3+t5I84LkXvhyxNr4Xt1G5lPutvn3Qg77eq1Y9eGLWvbmNhj4bL907Y2Kzvt3NEz50KS48dEYUvFa3Gj73deC7gxd9vTihED4xJRK7G7tEvnFyPz1bCHI9yXFnvr06R7qsxSc5eV0/u7x0E760qxC8K8GivUjENL7VITc9WDn0vReCXL7DtoU9sFWCvRMsrj4ep2g7O8cAPM0eaD50KS48wcWavkdyGT5QcDG8ZarAvpOpgj2FlJ+7XTOJvqhXSrzo9hI8yOrGvml0h733ksa7EHrGvneE070FaUY87BKFvnE4c71/MHC8c4V3vuTa0L15XT+8idJeutwp3b0oLHE7I9s5vjVeOr7Gv8872IHDvtzXYb6yLm49PE6hvtQrZb7zVIc7ms6uvr9lbr4E54w7ptB5vflOnD5F9VY7QmDlOlxanT7AlWw7PGYgvOChiD73WPq6e2ZJvSWSaD7aIJM8d9buvamkbj4OFeM7y/i3vfs68D21iRM9lYKevvJBzz1sJt87tkowPAIrhz0xsfk7qU2cvlXeDrx/h6I7Plyyvhe30bvdmB675paGviLg0L1A3iu8a58OvlXBCL6sxSe7X+/+O1UwKr7DKl47aMs5vgDGE75+Uu08k1LQvXb9Qr6PwvW7G0zDvYSerT7izK88dZMYvonqnT7DZCo6fO05vgbYlz4HX5g7TtERvrH5iD7g80M7CHdnvvcBiD5ybai7cQM+voQSZj6IS448ilkvvaQ2UT52Tx49jnWxvqs+1z0ZVnG8hgPBvnfbxT0s8QA81m47O9An8rum1RA7lMGhviNKe71FL6O74Xq0vqbydr2C/627FCLgujsBjb1rYCs8w/DRvekmEb5SSZ26h4pxvTaTL76loNs86iFavuZ0Ob6rJog8pORVviHqXr53hNM8UYjAvY0LZ76pMLa6sTNFvh6naL4W3mU8bRyBvhe8aL70bFY9TUqhvjAqib4OTy+8J6Vgvszumb5i+Ig9ppuEvhhbmL52N0897BLVvZ+Tnj5SSR06RfVWvSSchj4RjW66Bd0+vgbYhz6MZ1A7uK9jvnBfZz6unhO8n3FhPP5lNz5vEgM7Fk1HvsGtOz62EOS7p5a9vkjcAz5a2FM8ARhPO/lOzD2K5Ra8jL6yviSXfz3dmB684iOivokH1L0AbwE80saxvuv/3L2ZR/67uK+zvpKuGb4E54w7kX5bvtrJIL4nMQg9jBXFvvW5Or7n41q8RdiAvtL7Zr6Zgco8nPkVvii4iL4+y/M6BW49vu4lnb5CYGU9/byZvtttl75YOTQ91QSBvrMphz76ClI8igI9vpf/gL6SeeQ8EDuDvoUIiL5F9VY8h+FjvscRi75/hyK8vMtFvlkXh74bnl49qBiHvsuEn77ayeA7smgavgoulr78Uj89qWoCvP6arD5IbeI7PugZvqplSz4r3sg771WbvrMHWj7QRFg8tTeIvpdz6T1xrIu8KgCGvU7uF74eG4G8iquqvvEuh74eGwG8eTtivgCpnb7xaOM7bLJGvg2mob7DZKq6yhWevunxm74rwWK7UYhgvnRekz6FsYU7g90QvqnZYz6sxae5JQZhvvfkQT67fkG8NquuvhMsLj7QfqS7S3acvigsEb40v5q8CTjEvvqzX74AUhs8si4uvkFl/L27YVu8J6XgvUDBhb6GVby8Cr8UvnqNnb44FSm8R3egvujBnT0+Iqa8deUzvqa4qr5lU646WcCEvft0/D1bsT+861YPvoWZ9r2k/CS88Z2IvkxUD76hZ7O8fT+1vgEwPr6FlB+9yciJvlXBqL7hC5O8mPqZvq1MWD6J6i293ZgePHf4az2At4C9Km+HvtAKzL2yLm69pn6uvj+pNr5PO3y9/+yXvhLaMr7Bc++8QmDlO4MvbD7Nr2a9uJKdvrLXOz4+BYC9bt1NvuwvGz41Bwi9g/p2vsi14T2mfl68CW2Jvipvh71xVVm9ARifvkJDf73ABG69x/S0vpbPEr5072G9f8G+vka2E74JOIS916PwvWHgib6aQme9ud+BvlM/n77USEu9Rz0kvk2+qb4z3IC8vCKIvrpOYz7zk2q9Wd2Kvk7utz0YCW2973KxvuDzg71C7Ey9THGlvorIEL4QWDm9PNoYvpEPOr4Ulni9QE3tvZCDcr7ecYq9wJVsu7qDiD7FyX29yY4Nuqn7QD5jeoK9mxujvrh1Fz7ghIK95wDBOxfZDj7i5H69O6oau+zd3z3ghIK9W+sLvMFu2L0gRoi9sCCdvqw5wL0QXZC9E0kUvscp+r0uymy9rYaEvsX+Er5OuYK9b/WcvgN9Qr5yFna9x0bgvfDcO74YW4i9iEuuvk6Xhb6QTl299ImcvhJOi74WTWe9gsVhvcGtqz77y269bAn5u5QTnT7YgXO9j+QSvtj1mz6KjmS94iNivupbhj7AlWy9et+Yvi7n0j2IgIO9PwCJvspskD0s8YC97+ZpvsMq3rvcY2m9LT7FvmjLObw/OnW9GQTWvRAjBL63XWi9GcUSvp7qEL5q9oC9c2N6vXL5D76xxIO9aOifu2q8FL7dJIa9yhW+vnTvYb7tDT69csSavjDYnb62hHy9umYSvpeQn779h3S9h6JAvnE9mr5AGHi9vFxEvmWNij6gVHu9JJwWvkUqbD5XeJe904cOvso3Oz4p7Y29mdiMvrgBPz6qSIW9SP6wvu6xFD6FsYW9GJVUvYFDCD5/3lS92nKevt6Thz1r1IO93ZieumiuU7zi5H69Bp6rvnkjczzwbXq9ayt2vtnOd736Jzi9NUZrO/LNNr6mCoa97iUtvn5XRL7ReY29KcvQvdwRnj5g6me90H4EvqfLkj72QCu9Ad6CvagYhz7AspK9zH9IvlhWej4AOoy9jLnrvY1dQj4Z4pi918B2vhy2bT7PToa9dbBevsRaPD5Ol0W9/cFgvlH3IT4OLTK9cr+zvntr4D12bIS9xuGsvgOVcT009I+9/8+xvqeRFjwkYsq9T1iCvkCk37wQkoW9TRUMvDi+dr2il5G91zS/vgN4y73ZCIS9MUJ4vgK3Lr4IrJy9tFlVvteGir5AMEe95pE/vnNLi75cyY69y/NgvelDlz6Hp5e9RiU1viCYkz6qYJS9PzXevcuhZT6WW5q93xVBvYWZ9j0H8Ja9pDaxvjih0D2/K8K9NBGmvpqUAr1l5Cy9on+yvrXgRb4UP8a9MGS1vgnEa75lpYm9RBcUvtgqYb4oSde9t11ovsxApb4IWoG9Gt2BvQzInj4qb8e9u0QVvvRshj7Jjs29UWs6vpYEaD7+1Li9V7IjvuHRRj7p8bu9dO+BvpOpIj7uQrO91H1AvqGhHz5JY7S99+mYvs3k2z2yRr296Q6yvn0FaT0kKL69JCi+vhYwwT2twJC9hnLCvgzNdb3L+He95ZudvrR2270m/NK9KNU+vvFjTL60ccS9uB4FvuC+br5B8aO9kGsDvjnuhL5+Op69RpT2vVvOlb6W58G9i4nNveOlmz7rVs+90JsKPEbraD4sms69T1hivhFwaD7Ut8y96fE7vuXVOT5pdMe986uJvtYcQD41B8i9DhVjvurPHj7qBLS9EqWtvkZ8Bz6durK9vTrHOc07Dj6NnMW9/rfCvoKtkj3/lZW9xHdivk34pbydLsu9C2Nrvi3sab2WW9q991i6vjVeur3125e9CoVovi1DPL5Qjde9xoWzvhAGXr4w2M29PzWuvlX7hL5O7re9MbE5vvlmm76Z8Mu9LucSvhghnL6F69G9HThnvpkNor4H67+9vHkKvnmvmj7EfLm9/YLdvfa0gz5hjt69cVWZvc0GiT7OiNK9V2BovrR2Oz53FdK9zEWcvhV0Oz646c+9+DYdvpOpIj4Kur29/7KLvnLc6T0C1NS9ibX4OyHNWD16U9G9pU7AvuFFXz1CIcK98PmBviBe17zo3sO9+mGEvqQZi72oV8q9thDku2rBy704Ms+9W5RZum3KFb6QSca9FW+0vrzLxb1NhM29v4K0vq98Fr7kg969HM4cvlR0RL5Y4sG9n5OevtszS74DlbG9lN6Hvm/Yhr7FrNe9WByOvnXlc740v9q9vCL4vapDjr6E08K9/Bhzvhnnj76jBtO9CHeHvlTGn766FNe909nJvbX9Sz6PcNq9uceCvvc7VD5g5dC9I/NIvWr2AD5PO7y9D7SivpbPcjwDz729O8fAvgStgL0noMm9jQuHvggDz72s4s29l4uIvtDVFr5/3tS9FMutvsGLXr74/BC+NupBvkIJc76Srtm9wkybvrTIlr4Was29ODIPPLYQRD4+0Mq9V3jXvQTKZj7QfuS9Yr48uvd14D2citS9VYdcvX4Y4T1ageG9AybAvgTnDDs1e+C9fPJwvnwKIL5JaMu9bjSAvQNbRb5B8eO9NL+avc/3M77JAqa9NC5cvhu7ZL4p0Oe95IOevjgVab4FqAm+DOqbvqfoiL5D/wS+PGunvoDxjL5g6ue9vakIvuGXir7Jcee9bec7vi8Xkb6M26i9gouVvreXlL4h6v692EeHvgKamL792Q++Oq+xvK9Cmj43VMy9QpWaPMnIiT5oP9K97pQOvlCNdz47wqm9hPWfvgWGDD66TuO9xf6ivhzTk70jMuy9YviIuxbBf73nGNC9Ic14vp5eqb2Lw9m95Pe2vUtZRr6gpta93Cl9vgrcOr6/Dty9UHARvlEUKD5Zo569W5RZukjElDwbL929Sx+6O51jQL6YTNW9+WabvrUyYb7BqOS9xf4yvnCxgj7LudS9TrSrO416yD2l9w2+GEO5vl1tRb2ZZOS9uvewvloNib2+ExO+Pug5vkmAOr538xS+8RGxveIeaz5MiQS+UOSZvhoXDj6lgxW+09nJOgn+Fz6R0Ba+Hqdou/2fgz0MzRW+GZCdvm3/SrwstxS+voervj1E47304A6+RrGsvroUF76YUQy+LLf0vaK0V76/Dty9GqMVvrqDiL5G6wi+LPGAvTOniz61iRO+GJWUvfTDaD59Ig++WRcXviXMhD5sWxS+iZgSviZTZT7LuRS+cRuNvkMcCz6eDA6+WhKwvmYUyz2h+BG+jgGJvl6iej0BExi+enCnvsA+Oj1A+9G9MEwmPMmTpDxcVRa+X+++vjXvOL3JcQe+bcVevt4Cib1/wQ6+OBWpuy/6ir2IRhe+O8cAvFu2Fr6bPRC+p3lnvrthO741QRS+rg2Vvb1SNr6EuxO+qisfvpgXQL56Ngu+2J6JvmhcOL7usRS+mBdgvgd8Xr563xi+qTBWvnwKgL6muAq+Pug5vmHDg76ERxu+WOcYvpqxmL7hQAi+RfXWObdFmT6mCga+OzZCvmlXgT4KvxS+vOhrviUGYT7NzAy+xvmbu6neOj62hBy+H/SMvlUTRD6Q9wq+fjVnvuPH2D1nCh2+lUiyvmZOlz1krxe+MNidvqBsij2+MBm+Oli/vk4oRD3wigC++rO/vuqymDvzjhO+3/2xvuELk7zn4xq+Tnqfvuxph72EKhW+bxKDuUd30L0MsA++h7+GvotU2L3CEg++ieqdvvNxDb761Ry+eSOzvUmiN77DRwS+qFeKvghyEL5HVRO+bqOxvrMHOr7ZQhC+SL99vZUOVr71vvG9fJs+viEHpb68Ihi+MndtvtxooL6wrBS+3V7SO5Tehz7IexW+ud+hO4BlZT7vIBa+InFvvv/KSj4xCAy+C0FOvoofYz51kxi+pKWCvksfWj5HWgq+TP2svoM0Az7xKQC+gQl8vkaZjT3kvQq+A3iLvilcD7yk3x6+RS9Dvp0uC72CHBS+vsFXvt/98bxXQwK+6glLvtbiU72K5Ra+SBZwvrJour0YQxm+u2Gbvkcg3r2zexK+i/1lvQn5YL7lCg++FNBkvoCaqr5fDAW+6MFdvZ1Gmj6CixW+I/PIvRMnhz7pZRS+lIcFvkoMQj7X3Ry+lZo9vTUpJT7IBx2+1NSCvjnRrj3UYBq+/MZXvcx6sT0AqQ2+FhOLvk87fL0djxm+mwNkvsE5I75sBCK+OszXvYZVXL6nIhW+qDWNvoRHi76Srhm+umtJvmYUi748TjG+Q3M9vvFGRj55zCC+/n1GvdydNT78Uh++BAQzvjnWJT60cSS+Q8WIvnB31j1wtjm+UPyYvjojij3lYUG+Gt1BvZ2Apj2FmRa+XoCdvvC/1b1SCjq+51I8voMXHb4npSC+XynLu5j6Ob5pAA++yho1vl6dY74tlRe+sykXvrubZ74IPRu+v5pjvq8lZL6LMju+O8JpvsyXl75gkzW+swwxvnOFl74w2C2++mEEuzbIZD4Dsje+gEhfvv8+Az7q7CS+UgqKvonvRDx72kG+2NOevhGNbjo+eTi+SkaevrRxhL2t3Ta+xqdAviGTDL7OpTi+XBtqvmiuE75kOz++OpKbvqyQEr6taT6+sfmIvl4RPL7ONje+TwZnvn5vg76OzEO+98wSOnughT72lz2+KsY5vpXxbz5JgDq+tHFEvhefQj57a0C+C7WWvvtcLT5N2x++81RnvhJOCz6Orz2+Tpw8vjihED74U0O+gIKbvrQCwz2fkz6+TBqzvssQhz2PcDq+UN+yvvevrLu7fkG+u9Csvq1pXr0SiDe+izKbvplHPr6TOkG+DcOHvjPcYL6Do0S+jq+dvgq6fb7Qmyq+jiOGvm/Yhr6vmTy+8iTpvJyikz5KmCm+yNKHvbA4jD5oyzm+bee7vSqpcz6SdC2+hNMCvqzKPj6syj6+16PwvZhuMj5BZTy+rMUnOmw+Dj6VKzy+lgk/vf7UeD2sizu+iQwrO8oyhD07GTy+pPxkvgNDVj1dbUW+Fk2HvjeOWD0z3EC+f6Rovrt+wTwAkT6+gNRmvplHfr3YKkG+OWKNvtLGEb64kj2+ZVMuOzGU070Fbj2+wa2rvp1jQL4KLja+1v+pvmCwW77xLje+5pYWvl/vXr70/TS+deUzPFGIYL7OpRi+nG2evlvra74GDT2+clDCvZ7vhz7tnjy+dmxkvvZ6Vz79Ezy+jiOGvu+sPT61VD6+3dKaviaNET4wEjq+LPFAvqa46j0QI0S+KEnXO1ovBjxzET++3NdBvm/1HL38NTm+UWaDvSbHPb4F3T6+hjjWvX1cW74V4zy+2es9vp/Nar6HxD2+b7sQvkWeZD711kC+5zX2vdE/IT5XBD++CRaHvtwuFD5lpUm+ZeRMvgEYTz00ukO+nBY8u02hc700vzq+9mKIvkImmb3pK0i+yQKGvpIFzL3qPkC+smg6viKJ3r0Urke+wyreu1wDO75N2z++h8R9vqWDVb7WqCe+rMUnuFoNab5VGDu+5WEhPDylQz6xxEO+beJEvjkLGz6YhmG+rvBuvtC4MD4ErWC+ntIBvixIEz5yik6+o5KavmyVYD3dJGa+n82Kvq9ambqyhWC+04dOvhiyOr2P3zu+r1oZOxtkEr7w3Du+LJoOvnnpRr5Ei0y+P1JEvc8sab4C8Tq+tf0LvgzlhD4hdka+YmdqvjI94T05Czu+SKeuvhBYOT2W7Fi+gzTjvR7ETr6cxEC+j/xBPJ1o1z1olkS+DjJpvmr2wL1vDUy+pu0/vqmfV76XOV2+f4eiuzbqYT6U9ma+NLqDuyHIQT6kjWO+YJM1vkcgXj5SSV2+eLQRvnIzPD7wimC+Fytqvc7fRD4OFWO+nUuxvT0PTj7qsli+VoJlvkhtYj21MmG+0H6kO9PZSTpgq2S+2uaGvjVGa72+amW+J/ebvo51cb2b5l2+D7Rivmjo373SjGW+RYE+vhu7BL7r/1y+K8Hiu+CcEb4BTWS+wCF0vm2QKb5WmjS+YY4evpHtPL5RFGi+iICDvh+/V74UP2a+guJHOyI3gz7fiVm+IEaIvapghD6InWm+lPbGvaLugz71hGW+cxFfvXBfZz7t03G+N1TMvUmdYD7XF2m+u5sHvkRpDz4eFmq+J4MjvJFh1T2AZWW+wW6IvmCrhD14uWi+KuNfvcvzYDz/W2m+JsddvtXsAbzc9Ge+kINyvnK/Q73nb2K+1JpGvpkq2L2oNW2+c6Jdvb2paL6e72e+xM4UvulgfT6+3l2+1v8Zvhg+Yj5MN2m+VWp2u4Y9DT7zdmS+w0cEvvs68D3e5WK+pfedvpKRM7wVjGq+wRytvp+rLbvwp2a+SaJXvjqSC754Yla+O/yFvkPFOL4noGm+CtejurqDOL4ipmS+IXZmvp1GWr5lNmi+qmCUvYleRr6/SGi+QmDluvphZL7f4Gu+YvNxvVyPgr7n+2m+i2xHvldDQj6rlWm+ie+EvpsbEz4O82W+pb2RvuOq8j1j0VS+hQiYvrNezD3/ymq+gEivvp5Bg73ayWC+dR+AuzaTb71xWnC+SdesvsGQ1b01tUy+fLhkO6s+173DZGq+xr9PvGGOfr44Mk++EK9LvgTKpjubA2S++ptQvhVXlb2Wz1K+4Xp0vmkAT76bWna+V0PivSkiAz78xne+A7JXvs7CHj4g71W+synXvf2C3T2UMHO+ATU1PDygbD0gJGu+e2ZJvtRISz2JtVi+9dawvvZ6t716Nmu+b/CVvuJY173Nr2a+jliLvllpEr7CaWG+tHabvgPPPb7T2Wm+Q1Y3vm+7UL6i0V2+euTPvYl7bL6LGmy+LCsNvurPXr6zDHG+xAhBvn0/NT6JXoa+ufyHu0pGzj3EfIm+AfZRvZ4Mjrwg74W+vmqFvt/98b29GGq+UFObvrmID750e2m+dLUVviKJPj51Aoq+H9eGvqN11D2HFom+/DXZvQB02D03poe+1EMUvtj1iz2byYe+6Gprvn5SbT3goYi+m3KFvtoDLbxSYYy+ie/EO28SAzpdM4m+ukmsvgwfEb4b9XC+mRJpvr37I74Jp4W+Bkdpvif3O76WlYa+XynLu+GXOr5PdYi+TBrjvVDfEj4leom+a2ALvtCzGT6UMIO+g1GJvrEzhT0Hzom+qfZpu6J6az0p0Ie+vLP2vaT8pD1nJ4O+Ft5lvrSTwTwd5ou+WW5JvvWc9Dz+JoS+GZCtvsmOjTkxtoC+zSOfvpjdk72V1Im+a32RO3rC0r1jf4m+PstzuvBQFL5g6oe+gXg9vv5lV74z+Ya+vTpHO7xchL7bxGm+GTmLvSv7bj68eYq+1qgHvme4YT4vhoK+JAsYunrfOD4bgYi+H7+3PEokET4Ij4a+RnxnvoKtEj6oAIi+Y3qCvtdpBD6JXoa+p3QQvj9SxD26SYy+j/zBOyL9dr1TkYq+UYOpvrFtkb10DIi+AKmtvtj1y73184a+IGMOvoCaWr5iEIi+9BXkvV3cZr40gIe+6rKYO416aL6DaYi+TrQrO53XiL7mP4S+1y9YvYkHhL6jI4m+YhDYvcoyZD4NiYu+aw7QvWhcOD6ztY6+AFI7vpijBz6Eno2+H9eWvjJVMD2/moO+dqagvgu1pjzJsIq+1y+Ivp4kXb0tCZC+UPyovnGsK740onS+becbvhmQPb7FA4q+rvWFvVR0RL57iIa+wARuvad5Z77B/4a+n3a4vZkNgr457oS+opcRvn9NFj4IPZu+ByVsvgiPtj3fpo++EEBqvsRf0z2Z8Ju+3Xs4vWLWiz3Jjo2+S+pEvj2b1b2CHIS+ZHVrvjko4b3nAIG+QPaqvuikF74vo4i+iGiUvj24+70T8oG+Q3ONvmtlAr7UfYC+Hm2cvuSDPr5pOou+7ndIvjKPPL45Yo2+1hyAvn+kSL4KS4y+yY4NO3h6ZT4B+4i+FVdVvtHoLj6Cyoi+XeEdvs112j1ccpy+yk8qvghy0D13vo++0VyXvuAtELv2Ypi+djePvghVar3E65q+uaVVvQjmaL1WZZ++5Cycvqip5b1NhJ2+zGKCvvDE7L1i84G+Ga2TvtmUC74TCoG+UU4UvtU+HT0QdY++dnGLvrnCuzuYaZu+SkaOvpynWr4Id4e+98ySvQCpTT5v04++2slgu76fOj65wpu+3nYhvtKpKz5SCpq+rwg+vn7jCz5vDZy+JZJovhAjBD5uaZW++PwQviV6GT3O/Jq+rfpcvdZzUr25GY6+bAn5O1r1Ob5okZ2+bCFIvfsiYT6LVJi+lzldvW9kPj5zgKC+E0RdvcaFIz5t55u+CvQJPL6kET5oy5m+xm00vUxsvj3JsIq+J6AJOxKgJrwRjZ6+PUl6vqMGU70u/5G+NIC3OWiRDb5zupy+OWKdvvMfEr4qxpm+tU9Hvfp+Kr5Vapa++GsSvmK+PL4sK52+hNiJvmZJQL5FgZ6+pn7eO/pEXr7Pg5u+BrvhvaILaj0rwaK+HLEWvjP5Zj0Bh6C+IXZmvsa/TzyR1Z2+F7fRuGQeeT2nP5u+RtN5vpBrg71PXZm+SIqYvihEgL3aOKK+L6hvvmMLwb3K/Z6+OBWJvhCSxb1I/qC+kpEzvp9xQb7Oqp++roFtvp4pVL711pC+DkqIvhniWL4Ct56+t3oOvk9YYr792Z++ONvcvU7Rcb4175i+5L1qvY8ZaL6H3Jy+/YLduqD9iL4xX56+jPjOvZ4kPT7C+p++1SZOvd17OLznb6K+yY4NvPT91L39ap6+Q61pvThnJL5TP5++dQKavorlNr6HM5++6znpvVSMEz67uJ2+qG+ZPAtjyz2kx5++dAyIvsoVXj3SGJ2+0589vqabRLzEzqS+n3HhOy1ggr1uTJ++2LZovqMjWb6Srpm+0vuGvT1Jir7y0p2+gQncvTAS2j3ECLG+wVZpvjblij0WTae+OPhCvj0sVLyHirG++IgYPNv5fr2Qg7K+78lDvnuIRr0dyaW+Jo2BvnP0GL4gmKO++u3ruv4mFL5NMrK+BYaMvmebG74ukLC+LzTXvaM7CD76CrK+Zw8Uvoyh3D0tz7O+E9U7vhMszj0P1q++EY1uOs3psjuy9LG+IQeFvluUWbr6s6++nddYvU6Xhb0BMK6+ls/yO1BTy73e5bK+PgVAvV3h3b0W3qW+GH2VvigsEb7m6LG+cjPcuu49PL4npbC+za/mOcSUaL6aJbG+PIjdvc6qb76wPbO+ylSBvcu5FD4JOLS+rcAQvgbYBz4y5q6+08F6vS1D3D3D2LK+BYtjvvT91Lulg7W+28RJvTBHjzzSAK6+YkrkvasJojx0XrO+TDdpvtV4ab18YbK+kNokvjP5Jr7dtaS+xSBwvsrDIr5rK6a+c51GvoenV75JnaC+WDk0u5UOhr7mV7O+ucK7OwOyFz7fbLO+yHsVvuAtkD0Z/66+VaTCO42Xbj0HCLa+8L/VvW1WfT22ELS+VfZdvh3JZT1Dyq++x53SvbGiBj2neae+cqd0veoEFL4QI7S+MLtnvq67Gb4e4bS+HuGEvtGRPL4gmLO+PiKmO4yENj760LW+TRUMPO8D0D3jqrK+g91wvpfK273ZQrC+niQ9vpEsQL7rrbG+X15gvhBYWb4lBrG+Mo88vtCzWb48TrG+H4AUvgIOYb4u57K+q1u9vWItfr4OMqm+FCJgvecYMD5jC7G+lPaGvjS6g72ZErm+v2CHvjBHz73usbS+bCGYvv2k2r0Uy62+7UdqvkvNPr5J16y+PpY+vW2tb76XOa2+OgYEvn+HoryTxri+cT1qvl8Hzrx078G+7N0fvuJYl73FG7m+2Ls/vpWCbr2Agru+sks0vi1ggr2QSca+cQM+vpxQCL5lpbm+Y7QOvvERUb5sPq6+hhuAvtwuVL6brLG+kgWMvSUjh745f7O+S+UNvvcGn70/OsW+dR+AO+31Dj6TAMW+i+A/vjY8PTwf18a+luzYO34A0r2byce+QX3Lu6uyD743pse+jdE6vkq1D77/W8m+T0DTvd1e0j32I8W+XCCBvSJP0j1XIcW+FocTvpCguD246b++2o80vuAQqj04Mr++zsI+vlBTSz352sO+YOrnvaT8pDzGosm+7Q2+OmZJALyNC8e+ODIPvqzKvr3Ojcm+tYkTvpjArb3CTLu+4gFlvhDpN73QD8O+FCJAvsJpwb0v+sq+gSZivrAbVr7Ed8K+coqOOwXFzz2WW8q+KXl1vbOYmD1nRMm+HQMSvs2SgD0Fhsy+6LwGvjV7oLyNesi+z4N7vjJy1r3i6cW+ZVMuvYOj5L1SSb2+SDOGvnOi3b3LocW+H9dmvg5nHr5cPce+AaSGvosyG77qW8a+09nJus5wY77h0ca+KAp0vSfahb4ouMi+NJ2dOw1Uhr5M4Ma+b57qvV97Zj1V2ce+2CpBPF3Ed715QMm+5Gb4vX/2o72d18i+kugFvvQVBL63C82+VcGou8uEP7451sW+LJrOvVQAbL6s4s2+sCDNO7+3aT0E4sW+WoGBvu22i70wTMa+aJHtvTfgs71SYcy+aR11vkP/RL4wu8e+9dvXvUOtSb55Bs2+/poMvvPIP75xrMu+isgQvqsJYr6m0Mm+DB8RvhHkoLvC3dm+Nxpgvreci73gude+UrjevWJnCr4pXM++IzJMvp2dTL42sMW+SWjLvWOcX75/+9q+zAuwvZ7qgL6UE82+BMqmO7PNzT09Ydm+RwO4vajjsT1YqNW+lKRrvYI5ej3nqd6+r1o5vgw8d726Sdy+Ecc6vfCFCb5I/sC+pHA9vji+Vr645Mi+4uRevidmPb6wA9e+by8JvoCaWr72ete+nx+GvXBfZ77ja8++lrKMvUgWcL7tR9q+3pOHvSzUGjxvu9C+8WhDvsFWyb0dj9m+MzMTvqSqyb3ImNu+2hs8vln6EL5R2tu+AK5kvrtEFb75D9m+IXYmu52AZr5Gmd2+5SdVPOcAgT3SAN6+oKbWvZSkaz16x9m+gVt3vYyENjzdmN6+A0PWvT4/jDp7FN6+n3Fhu/Q3obvABN6+guc+vpjdk7wvi9m+fPKwu5ijh71fKdu+GobPvfrtC77Aldy+deUzvEzgNr7Y9du+968MvhAGPr531t6+pg/dvdqsur1t59u+XadxvtUE0b2M89e+HNMTvmWqAL4X8d2+gqh7u9zXgb4LJNi+GmmpO/5IEb45C9u+xOs6vkImOb5mMeG+MbF5vXtrQL6cM+K+Etoyvjp6XL65NtS+qTD2veHuLL07Gdy+aAUGPNlC0L1zuty+jKGcvBsqRj1sCem+NSmFvVsIcr1TBeO+AHSYvSECDr7dB+C+02rIvaCmNr4v+uq+o0Afu6euPL7HgOy+Ug/RvZs4ubw1tey+IzIMvnamEL7bM+u+H4BUvGRdXL6inOi+j8J1OwrXo7u8V+2+1sUNvsNHRL1i8+G+GLIavl66ib3my+u+/cHAvUeshb0OZ+6+zo0JvgYvur3Kpuy+5CxsvaRT1722Z/a+U7OHvUSGFb4abvC+42vPvSv2F75q9vC+9DIqvsL6H74XK+q+mpQivuaRP77guee+fNWKvbbzPb5Qwuy+dNJ7vZf/ELwmjfG+CRYHviEHJb3+muy+DjKJvTdPdb1ui/K+j8L1u1itzL06QPC+rS/SvUJbzr2alPK+7nw/vXSYr73gnOG+HhsBO0okEb70T/C+Vd6Outqser2eQfO+mrFovVhzwL07Af2+iUGgvSwOp72WIf6+IEFxPWgFBryE9e8+GsDbPS6QIDtZo+4+SBvHPdIdhL0S2vI+gsp4PYJzhr3aG+w+dLUVPpp3nLzqIeo+TfMOPloqb7048+s+u36BPUX11juYads+XwfOPSC1iTwtId8++rPfPfVKWT2NKN0+tRV7PZolgb0icd8+RbvKPfwYc7181do+I4SHPdKMxT0eFto+eV0/PYPAij3owd0+jbSUPb5qZT0vi+k+d4TTPWvUw73swOk+G0yDPf2HtL1Mpuo+KLg4PhkE1r0jod0+4JzRPXeE070y5t4+HEIVPrr3cD0eUNY+2QhEPhEBh7ybINo+eO4dPl2KKzzzAtw+jukpPmgFBr0Ulug+Eyc3PrmlVb0VUt4+t2L/PWe4gb31Z98+lkOLPeo+wL2k394+uw/APXldvz1Uqdk+NEsCPoC3wL262to+L1E9PkG3lzvsUcg+Hax/PayLW7v5oMc+cuFgPvXWgL0lzNQ+5iJePjG20L0NbNU+XvQVPlxy3L0AHcY+ZK+3PTblir2V1Mk+gso4Prw/3r0+0Mo+Yf3fPTiE6r30bMY+XvQ1PuV+hz07jcQ+sDjcPTxrtzwIA88+jC2EPUAwx71N1sg+HF97PSYe0D2oqcU+O40UPsvb0T2Oksc+NNdpPe3wlz28eco+amoZPlOucDzZPck+Nh+XPUDBhb0na8Q+syRgPvCnhr3vVcs+mWRkPoCCy71kr8c+d/PUPW7ABz71ocs+9DKKPe8DED7sacc+nYDmPSxl2T1XW9E+u7jNPZ4Hdz29qcg+Nh9XPtE/wbyz6tM+8rAQPv/Kir3lCr8+QfFjPokMqzvFVcU+ls8SPsb5mz24kr0+4q+JPXWOgT1wCLU+XafRPf5Der3S47c+eQbNPUmA2r2NtLQ+NbUMPrwF0r12bLQ+hJ7NPenUNT6Y3bM+BRcLPnGPBT5oP8I+bFsUPuIjYj2o47E+kxiEPnnMgL0TYcM++n5qPQPPvb0RGbY++dqDPuwS1b2OO8U+2jhCPhzrAr68XMQ+C3saPvzG1zzL87A+4uQ+PkNWNzw9LLQ+kpaKPjds270JULM+2o/UPSMtFT4OvrA+DB8RPhToEz7Jq7M+DasYPmQ73z1olrQ+uB6FPZDaxD0IWrE+XW1lPof5cjwxJbI+5NpQPe/mKTxsW7Q+gnOGPqvsO7wjZ7E+rfqcPeqymL2/8bU+zeR7PhsNAL7Vlb8+q+dkPhZNB75JnbA+rBw6PtkIBL5Kta8+MPVzPZyKND6NXbI+1nNSPbpJLD7zyL8+sktUPUVHEj72I7U+HLE2Pt6r1j2698A+v2AXPpIFjL2TUrA+tLCHPt21hL3Opbg+5L3qPYyE9j1lwq8+ZJIxPkw3yT26TrM+dxUyPmu3nb2nlq0+kx07Pk0Qtb3Lvqs+DDwXPpGbAb7Wxa0+r3w2PjBkFT70/bQ+bFs0PnWTmD1w664+RBd0Pr5qZT2atq8+VaRCPkPKz73qlaI+DLAPPqs+172c3J8+xAiBPuXQAr62hKw+opxoPS0+xT2XkJ8+6bevPWAfnT1KB6s+mPp5PUCHebxZo54+A+yTPllRA73VPq0+tYkTPq9amb010qI+B87ZPf5I0b3FyZ0+yCRjPrGixj3N5Ks+g26vPRbBfz2twKA+sYqXPoenV700na0+bTnXPfC/lb39gp0+eGKGPpPjDr6rBJs+jiNWPn7jCz5MN6k+izcyPlRvjT33r5w+eVhoPnzVCr7d0po+n6utPeikVz7KT6o+lWXIPTyDZj5Pkp4+SdeMPTAvQD7ulJ4+zqUYPkSGNT6qQ64+yhVePYIcFD6Nl54+sRY/PiQLOD6xv5w+NnYJPtHoDj7xS50+9zsUPgzq2z3BVpk+xr8vPiyazj0mx50+oFQbPudvgj0rGKU+H6KRPdCbij3f4Js+jNtIPssQxzytbqU++feZPpYEqLwJG54+VIyzPTp6fLwkC5g+0uOHPp4MDrxLAqQ+TUqBPUj5yb2zzZ0+yhqVPlsl2L3UDq8+K/aHPuIj4r0EraA+bARiPurnzb2pTZw+L90EPvSJPD5EaZ8+4juBPqg6ZD1i+Kg+KeiGPjS6gz2zXpw+OdZlPqornzwzM6M+SkaePpGbYb2LVJg+gA6jPnpT0b1FEp0+atlaPp4MLj6cFpw++I1vPqyL2z3o2Zw+JuSDPu3w1z2RD5o+rhJsPpBJRj1K75s+1y+IPv9bSb1y3Jk+5A8GPva0Yz7Lvps+XdyGPeQxYz6y15s+jZzFPRg+Qj5tqJg+jnXxPQB0GD7h7pw+DLBvPiOhDT5TP58+85NqPbthW7wgtYk+ejYrPsNHZD6gFZg+RDSaPh1yMz1/pJg+7iWdPuw0UjyBQ4g+esJyPsA+Or1jYoM+ozuIPQ6hir3S44c+wmmBPRVSvr3njIg+qkMOPkcDOD4aUYo+9wHIPQ+5GT4AUos+1uITPoZaEz5bJYg+f2r8PRsS9z3mlpY+jxloPknXzD3a5oY+FcaGPgdf2D0proo+EMwRPhBd0D0kC4g+h8QdPj0Klz3Pg4s+fAqAPURMiT2+wYc+4LmHPny4ZLsBE4g+Iy3VPQVpRryBW4c+Sx+KPj0sVL14YoY+7l+ZPj6zBL5eaJ4+gsVBPm3iBL5IUJw+gA5zPfK1Zz4VjIo+mwNkPkvNPj7arIo+8iRJPlTGHz4lr44+AiuHPT/jwj1E+o0+gSbCPQLZaz3FA4o+0jqaPkJDfz0Y7IY+3rBtPnwPF7xPHoY+ptXQPVoqb70U6IM+jpKXPjG2kL1cPYc+4bRAPj7LE776J4g+RRKdPkc4Db5JEYk+mxsTPp7qgD5LsIg+vw7cPd6TZz46kos+m/7sPTXvOD6BW4c+jgGZPd9sEz5Wn4s+Z/ItPhWMij1075E+2PXLPWTM3b2yEYg+Io4VPuPCAb5lpYk+qd6aPtU+3b1gyIo+TkWKPoSeDb5l/Is+t0XZPRZNhz5cPYc+YXE4PoBIXz40Low+qBhnPgmKHz4YIYw+TrmCPlwbCj7Y8JQ+DoSEPn9NFj47GYw+5lezPVn60D0RcIg+i+CPPkRMiT1S1YQ+5E5JPvzepr1x5pc+bt2NPrJL1L0YPoI+NqsePqWD9b37P4c+HF9bPqg65L05C4s+RKNbPhRcDL6PGYg+mN3TPVcEPz7YZG0+dsOGPlAZfz2H+XI+0hhtPrA9szy14GU+wf+GPmpNc71oImw+B5kkPiECbj6FX4o+OGdEPpNXRz77eYM+LA5nPVeVPT6cM4I+5KBkPiDSbz0TSXQ+b4FkPiyCfz3zyH8+gILLPUinLjyEZGE+UfeBPYrIMDz/PmM+Xp0DPhEBB73P94M+zsKuPm7AZ71PBoc+IxWGPnK/w70dA3I+oaF/PU34hT7ri4Q+097gPQqdFz4M5WQ+d2cNPqd5Bz7ysHA+442sPhfUN7wSMYU+bFt0PutWT71tqHg+qpqwPsGQ1b30Moo+2PB0PqsEK74UeYI+YY4+PjqvgT4bDYA+lPaGPcyXNz7HEWs+9mKIPqzKPj5BvG4+u36BPUVHcj06QHA+3XuIPmO0DjzvVWs+VAAMPt4fb70r3mg+0qnrPWwEAr5kI3A+Er2sPrnHEr7de4g+iEaHPuboMb7NBok+rvWFPfOTaj6Bsmk+RN1nPoKoWz6skII+j41gPkNWNz6z72o+/z5DPq36PD5A3ms++HCJPh5tHD7HRmA+64uUPsLd2T0wTIY+fJuePoxn0D0k1mI+PIidPtCbirwCK2c+xJTIPWdhz70Y7GY+CI+2Pm9HGL6/SGg+4GecPnWTOL7jwoE+/yE9Pujegz686Gs+C14UPmE37D3oams+sW1RPi80Vz0rTWo+fZHQPdwRTj0SFF8+tyizPssQh71nRGk+cQP+PWftNr14RYA+NurhPeiHkb1nRGk+F5+CPbDmwL3K/W4+OjsZPuHuDL5y/mY+zLS9Pnyb/r3SGG0+4X9rPqshEb45tGg+VFeePol7DL7O32Q+bcV+PdPBij5xPWo+KxjVPXgLZD55dW4+lQ4WPkYIbz7ItWE+bEMFPjCBOz7OU10+8iSZPpusET77ImE+2lVoPgdCEj6jAVw+H7+HPlAZvz0vNFc+ADpMPdZWbL3bil0+t5e0Po/CdbwRAWc+lZ+kPpeQj734U2M+nOEmPi457r19BWk+REy5PhKlvb0Z528+cJScPl5o7r0ZHGU+SOGKPqAVOL55O2I+mxsTPjLJiD4yPWE+BcC4Pc8siT451mU+zsJePqH4gT6DNGM+XFU2PmDqZz7u62A+vodrPorNZz7CF2Y+MLuHPsvbET6cpzo+xVVlPSR/sD3d73A+gsWhPtBEWD1hbGE+EcdaPmXC773eVGQ+Vg6dPgg9O75GzmI+CFVqPlDfMr5sQ2U+NdLSPePflz711mA+xM4UPuJ1PT6gVDs+E2aaPkq1jz0iGj0+fJu+PrDJ2r2VSGI+4xk0PotUGL4NVGY+PWGJPX0FmT5kO18+wFuAPnReYz4ZrWM+yOqGPm2o2D3bFkU+NZiGPiibcj1V9j0+D5esPt1eUj3YKmE+s83NPT4/DLumuEo+KH5MPsI0LL6BQ2g+k+MOPgCulD5W1GA+qMZrPrd/BT58fjg+gSFrPilczz1orjM+0vtmPsNHhD1IMzY+hj1tPeuoar0ouDg+WkcVPtI1k702yEQ+hXygPniXi73k9zY+0a7CPmmMFr76RD4+8YCyPl3hPb51jmE+YhBYPRB1jz6thkQ+dCQ3Pj+Rhz7nUjw+Y9F0PQtGZT6e0kE+u5unPVchJT5+qV8+IQe1PvfMkjmSrjk+IR90PZJ0zbv3Bj8+opfBPg6hir2RDzo+DhCMPWK+vL2OHj8+YOXQPS+j2L2adzw+uaoMPqMBvL1X7C8+j6XPPcheb72adzw+XBsqPorI8L2LcV4+aXSHPnNjGr48ZkA+j6WvPof+Cb6qmkA+dO9hPUlomz6iYjw+AHTYPQM+nz5ZFzc+Ew9oPgzNhT5OnDw+q+eUPokHND6v61c+ZeTsPZrr9D0u4ls+6sqHPqT8JD19XDs++5GyPo+NgL2nkTY+ls9yPg1xDL4yrEI+tHbbPQskCL61VD4+QKQ/PhB6Nr5h/T8+z6DBPhqGL74YW0g+bagYPrsKmT6itDc+oBoPPhqjhT442zw+gPEMPrxcZD4m5EM+OISKPo5Yaz68szY+6KSXPqn7QD5agUE+2V92PX46Pj7MKDY+a0iMPm4XOj5/vDc+AK4EPrqgHj5pdEc+VmXfPRwlDz7xEVE+cXI/PW3ipD2cijQ+eR7cPYumMz1pUko+7N2vPkokkT3Azzg+cSCkPsDPuLxwCDU+r3e/PqhXyrw8vTI+4V0uPu8bn72LVDg+EQFnPk7u9739n0M+dLUVPg5nHr72I0U+HZSwPsstTb5K7zs+g93wPf4mdD7OxzU+Dko4PkRuZj56UzE+jQtnPrVPZz6xbTE+jWL5PYYbUD4TClE+TMOgPu58Hz56cDc+LnOqPlSMsz2UMFM+Dk+fPpIFjL3TvCM+AFcyPkRuJr5/+zo+h/mCPvgZN75mSUA+mDRmPoPASr7mIj4+cVWJPmtIXL7ZCEQ+A3hLPn6MWT4e/ho+9Zy0Precyz1RvTU+16NwPdcSsj12Ny8+h4pxPell1D0gYw4+SnuDPR09fr1wthk+UN8yPt4fr72s4i0+iQcUPtsW5b26MR0+K2qgPhXGVr7kTkk+XeHdPbXghT4Cty4+XylLPWFxGD538zQ+6GqrPjVGCz5nfjU+ZMydPqJdhT2d1xg+KZabPlcmfDw73w8+bqPBPiy3FL78qRE+GeKYPlvrK74yrEI+ucfCPullNL7LShM+2ULQPfT4nT4wZBU+RSqMPXqNnT4GLxo+FVJ+PVGlhj7KiRY+cv5GPifCRj7OiBI+NSllPo1/Pz6Amho+weKwPkF9yztOfxY+YeA5Pvn32b1LHxo+gJ+xPkzDEL5UjBM+/PvMPfCK4L2Fthw+k4zcPZWfFL7aIBM+846jPoGyCb5hNww+/n1mPjxrV757gy8+5biDPtdphD7D8BE+4h4LPnZsZD5Nvhk+sAOHPo6vPT7jpRs+dk9ePtxjaT45Cxs+E7iFPoenFz75FCA+HHyxPgwf0T05fxM+nOGGPqSIjD2cihQ+cLa5PVCqfb1d/iM+OKGQPRn/vr0KLhY+IQfFPhfZjr2x3BI+aR0VPi1bK757FC4+o0AfPjNQiT4C1BQ+VkiJPuY/ZD72ehc+86uZPjSAVz6uEiw+EqVdPmNFzT0zGyQ+k1eHPpHyE7wviwk+gqgbPtejcL3EJQc+e0mzPuifoL034BM+lWXIPqvP1b0mqhc+qRMQPpv+DL7NzAw+7rGEPmwmP74GEhQ+qB0+PsCVTL5hjh4+UMezPmN6Qr5tkAk+JH9wPizxQL4LQQ4+kDG3PoLKWL5EhhU+3c0TPuSDnj4bDSA+NV66PQ1shT6vsQs+j987PirGiT5CWw4+iBGCPePfZz4STgs+PfJnPoLihz7fiRk+ZcKfPgB0OD52Mhg+wFuwPkXYED7EzhQ+WtijPmDl0D11zQQ+Hv56PhnKiT21/Qs+46oSPoTYOb7AIRQ+WP8HPkiKSD5cICE+1q2uPt3vMD5bfAo+a7ddPVrworwG2Ac+1H3APhcOhLuY3RM+/dkPPvCFib0m3+w9/tQYPk/MGr7MevE9WmQ7PiyaDr6qSAU+KVyfPofhY76Srhk+Ub2FPlDHY76tbhU+4WJFPaSqqT5+dAo+/kOaPlysaD6NKA0+qvGiPgzIPj6Hv+Y9BYtDPXzVKj4JpwU+LzRXPRHfCT7YRwc+zTuePj1hibxM4NY9XOYUPsPwEb17iAY+aYyGPvCFSbxFL+M98fSKPfMCbL23tNo9ZwrdPQOyV7367es9dLU1Po+lj71ZTAw+V7KjPfKYAb5ivhw+xSDwPRUdKb62ShA+Ug+hPgGkNr5cPec9EtqiPouJLb4buwQ+qMZrPjpYX76wPRM+O40UPnFynz7AstI9iSQ6PkkRmT5lwg8+TgvePUAYiD6BCdw9GHhuPZEnaT6PNs49C0ZFPjANYz6Rm+E9bM+cPjaT7z1PQNM9WP+HPoLnXj3y7/M96IJ6PoEJ3LydRto9aNCwPmxblLxhjt49vW88Plgczr2couM9srp1PvWEJb5FLwM+AB1GPiv2F76BCdw9DvMFPjpdhj4csdY9HXeaPo47ZT7Co809y76LPl3ENz4vNNc9RQ1mPiL9Nj7q5809GD6iPio6Ej6Q2sQ9AFeyPj5cEj5Fu8o9jPiuPsVySz13LSE+2ZnCPQYSFL16/N49MCqpPRR5Er01ewA+9BXEPqyL27tKtc89pWafPt3qGb6ze/I94JwRPlWHPL783uY9KgAmPpKRU77BVgk+LZUXPsdGYL4IA889n45HPhwIab62ShA+Lla0Pm1zY75RoM89h/6JPRgJrT58uOQ9COboPb9lnj5kktE94ZeKPkZ8Zz7H9MQ9TfilPbxXTT43N+Y9VDVBPsGoRD4nFOI9l8VkPtIdZD7ElMg9ijyJPm5RJj4Jbbk961avPkfJ6z3ytec9AFfCPiYBaj0gJMs9o0C/PhWMSj00aAg+jukJPuCcEb1qvPQ9vFyEPZqZGb3r/9w9uoM4Pq6ek709fu89aJGtPvUt872J7wQ+VyGlPZnTBb6GG/A9hNg5PiYZOb7nAME9vt6tPjBMRr5KRs49tf2bPhfZbr5iZ8o9YJM1PjUMnz5x5tc9gJ+xPfpEPj7kD8Y9m3JlPuC5Fz4ErcA9ZcIvPbIubj091eE93/jaPPevLL2LTwE+bD7OPtUmjr27Cuk9yO+dPq93f72I17U9JzGIPq3ddr0c8Lk9hevRPdY5xr0DeMs9ww0YPiVAzb2Lcb49Tu7HPvm9Db6+wdc9aJakPuEo+b3DtgU+zyzJPSBeF773Bt89Bg2NPsIvdb4DW+U95X5nPokpcb4MsM89/cFgPuoElD6MuQs+MgOVPXTSmz5TIsk9K/tuPlGlhj4hk8w9lpWGPrxchD6YTNU9xTi/PkRMyT1EqNI9eo2tPllpUj12w7Y9aXQHPX3QM701JO49+tWsPpGbYb0vF7E9hqxuPqHWFL5UdOQ9FcbWPSR/ML75vc095gV4PulgPb7bbdc90xPGPoUlPr7QRNg99Uo5PlOucL4Jp8U9j41APSBGiD4nwsY904euPiXMND5egL09LsWlPjpYfz0Koq49tTe4Pavsqz6DUck9kBQxPpW3gz4OT689rRcjPujeYz6u8K49JcyEPiY2Pz4rwaI9RrazPc6lOD7Co409ZY06PiAMHD50QX099We/PeBKFj55I3M9KQU9PrMHGj48oKw9Vg6dPqsmiD3dJIY9hCq1Ps6qj71vgYQ96+JWPh1y8732tMM9VfY9Pvj8EL6xxIM9N2ybPoWUX77aVYg9Nh9XPthHlz6JDKs9XAM7Po3Rij5+V4Q9H4ULPiQLiD5GX4E9MgMVPrzLZT6rIXE9WRcXPhHfST4uyqw9xFp8PQZHaT45RYc9znCDPsTrGj7+YKA9VB0SPkgW8L3hYoU9aTqbPqTfvr0+XHI9qtSMPrXgxb30T3A9CFqxPkKyYL7Gp4A96GorPtRImz4MWV09r3wWPjLJmD4jSns9hgNhPpfiij5V2Xc9D9YfPuIGPD4pIoM9FQBjPmvUQz4LY4s9rWk+PkKVOj57SWM9Df3DPhMK0T1JnYA9tygzPRzTkz14uYg9RrbDPjVGaz3ymIE9EDuzPj7Lcz1yp3Q902rIPpBJhr04Sl49svShPTW1rL0om7I924WGPvqzn726SYw98gw6Pv7x3r1WmpQ9ujHNPnfz1L1RMU49lDCzPus5qb3tR4o9IEbIPgeZJL5RFGg9fA+3Plu2Fr79wYA9F5qrPlj/R75MVG89cM6IPSxlGT6g4GI9jZyFPfIHQz5I3GM9Gm6QPhniWD2mm4Q9UKqdPllRgzz5D2k9nFCIPvXzpjx/wW49/IxrPo5YizysHFo96N7DPV3h3b2wj449bFtUPm8NDL5q2Zo9ob5FPtieOb64HoU9p8uiPjAqSb4AjGc9kPdqPlUThL6yaLo9y/iHPhkEhr7CUbI9U3m7PSf3qz6UwZE9TWfnPQCMhz7QJ3I9C5iAPZMAhT4ZOYs9yEFpPlw9Zz4Qr2s9PIjdPc3MbD7JPHI98phBPp7vZz5KRk49UaCfPpBOHT5B8aM9vqSxPlGIgDz35GE9x2PGPnzyMDyMSmo98u8TPlCNF75lGWI9dCTXPfT9FL5d4V09vePUPSyCnz79E1w9G0yDPdrhnz6sOYA9D5ecPj4iZj5Z+lA9qDokPgQ5KD6Amlo9Aiu3PtbiEz7lJ5U92IGjPinotj1Nvlk9/+cwPcf0BL2rz5U9jgFZPVaalL06WH897KPDPqd0EL6ndDA89MPIPa8lRL6gMn498G16PuDzQ77xKYA9ImzIPrzLRb4fopE9ptB5PuJ1Xb4oD4s9TwZnPtLjh76PjYA95ZuNPsMqfj41B4g95/upPm3KVT7/IX09ZJKhPibHPT5YHI49OxlcPto4Ij43bJs9Er1MPgK8BT1+jDk9j8eMPaez072tbnU9j+TCPtaQWL7T9i89k8boPXf4a76kNnE9ER5NPt9Pbb7TMHw9+tBFPtaQiL55Hpw93Ck9Pgq6fb4TJ7c9DB9xPvc7lL59ecE9fXmBPdc0rz4+BUA95L2KPg3DZz7xaGM9yF6fPq8IPj7jiLU7sD2zPuYiPj7ir4k9lLyqPqcFrz3bvzI9fle0PpXUyT3TE5Y8eQHGPphu0r0L0ow8iUGgPgcI5r30+L08ayt2Pc0jH75EaW89liYlPqFKLb4fvzc9tmcWPrUVO75sQ8W7JUANPkRpb77USIs9l6h+Pt/ga75sskY9O40UPl6FhL5wfG09Z9VnPkAYmL7vIHY9PbiLPsKGZz4x68U7gJ+xPpV9Nz73kkY80GG+PoKQDD6XqF49aeOIPb3jFD5vEgO6AmXDPtZz0j3Jjo07yO+tPa67+T3AslI8SDPGPmK+vDiFsYW6IeVnPkGaMbv3zJI4hc6bPkDBRbysxSe58pixPiBe172amZk8BDmIPmzs0r0eGwG8kbhHPXaJKr5q9kA9M6fLPellFL7n49q68FCUPQKCOb6J78Q89Uo5PmZrPb5mSQA8Jo2xPtaoh74GKmM9gJ+hPh5tjL6b/mw9XFqNPtCbir4WTWc9PfLHPRy2nT41Rmu79DKaPsfXXj4Rje663zJnPluxPz6ZR/67nFBoPrdFGT6CxeE7G2TCPvp+Cj7rkJs8Wp5HPsIvFT4mcOs8Dwu1PZRN+T3h0UY9H4C0PpbP8jvG+Ru78BaIPqM7iLzJjg06skvUPSPbOb47qhq7gc+vPgq/hL7Nr2a5gzRDPmk6m77G4Yw9Z36FPjMWnb47cE49Zyw6Ps8smT596AI8Nh+HPntOOj5Iisg6OiNKPj1JOjzkoIQ8xtwVPv94D77nOo07C0ZlPtTxiL7DR0Q8SMQUPstniT7TvOO7hxaJPlxVFj4hdia7N+CzPUMcCz6KyDA8duCcPrAgDT5i+Ag7cOuOPiYe0D0Ct2688wJsPtqser3DgZA77fWePt+JWb3V7AG8D7k5PvEuF76oV0o8YHbPPXTvYb4421y86UhuPn+kaL4XDoQ8f4eyPh/XZr58CoA8sRafPkPFiL7YZA08dy0hPhtHnL6WW1o9xFqcPnIznL5Yc4A7SPmZPosym75JYzQ9/g5lPr99nb7cY+k8JLRlPUt2rD51yM27j+QSPtJvnz5Iisi6/Yd0PSVAnT4oLPE67btCPr0Yij73ryy8swwRPgzlZD6ZgUq7pFPHPrpriT3Nr+Y5ymywPvWcdL35g4G8ZtqOPqkTEL7XNO87jZzFPkKyQL7aAy26M1DZPRTQhL4mxx28X16gPvMfcr5yM9y7e6AVPmQeib6pMLY79u7PPb9ghz4E54y7fESMPcFuiD653yE7dTxmPoCaij5LHzo6zyxpPoQSZj5eY5e7ECNEPs0jPz7wvxW8pn5ePVfsLz5/TVY7PE6xPoKoez15WKi8YB+dPhToE75wsSK8K6SsPm+eSr4xsfk8gqhbPuQUPb7lYSE8Jcw0PoQqhb7KGnU8Su87PsoVnr5yM9w8HJmHPuFdnr40v5q88S6HPluxr77i6RU8dLXVPZfiqj4Eyqa7bM+cPgcI5j0HQrK8B/CGPsMNeL0K3Lq8UpvIPhxfe71IxBS8845zPpoI270L0oy8FLM+PuNTYL7woq+7yokWPnamoL5ybSi7EeQAPhTtqj5TIok8NuWKPQYvGr5Oel+88rDAPgpoYr5SSR06at6RPuF6dL7gLRA7x2g9PvcGr75LHzo6d4TTPYEhaz7RVxC8+3Q8PhqLZj46zJe8LjmePnfbhT1T0O28dCQXPlwbar4HXxi8exSOPgkzjb4uVtS75wBhPlUwqr4NbBW7JxSCPjj4gj4mxx28fzCwPttQET5QGf+8GD6yPuPfB76oV8q8PrOkPbLXez4HJcy7ucL7PY1imb7woq+6TnofPnDOSD6Eu7O858Z0PjbIBL5O0RG9ijyZPqCmNr5z9Pi84ZcaPlYOrb5CYGW8J6WwPhue3j1EhlW98S53Pi80F75WZV+9VtTAPhB6Fr45nHm921CRPnZxO75Ah/m8c7qMPjrpnb6IaHS9Jt9sPmNFbT4nvW+9E0mEPk60K7y5pVW9Dr6wPvNxbb2MuWu9N6aHPkVHcr14tHG981SHPr72zL1y4YC9kBSxPkdyGb5ccly9HHzBPqAyPr4Htoq9E0SdPtE/Qb7mV3O9sySAPTqvET41Y1G9fuObPu3w170s8YC9i+CvPlOuML6zzY29dHu5PgOVcb6C5169wAmFPn50qr4Dsle9JLRlPmkdFT5rZYK9YMhqPhY1mLxNMnK9eSPDPgqFiL1Of3a9ZkmgPkmdgL0QQGq9Qj7IPviI2L0B9lG9HAhpPlfs771D5zW9fSJPPQhyML4B+2i9eemWPjdUnL5KB2u9Xi5iPjbNq77htGC9QzkRPpJ0nT5Ldmy9p3mHPashoT60cYS9qWpiPgeZhD6BJoK9b4GEPjP+PT7+DoW9tRqiPuV+Rz5l/Hu9+u2rPrdFOT7M0WO9OwFtPoNpOD7Ie1W9Oh5zPkCk3z37OnC9TijEPlDCzD3DDXi9kKDIPp7SgT1euom9nnsPPlQADL4Ct269zseFPlDkCb4Sg4C9ak3zPehNRb4Fo5K9r5k8Pie9jz5D/4S9gSErPevFMD64WFG9t5ybPpMAVT5UNYG9UU60PrR2Gz4oLHG92SWqPWgFBj5IG0e9xJSIPdHL6D2rJoi9MJ6RPsO7nD27mye9a/GpPgclzDx7gy+9XFV2PjoeM73B/1a9kGujPrdiH748aze94ljXPU3zDr6fH4a9iICDPWbaHr7wbXq9eQEWPgx2Q74/dIG9Yf2PPjylQ76WeIC9vFftPcNkar5PdYi9wt3ZPcaKir4/44K9l1aDPn46jr5GCI+9A+yzPmQGir4lkmi9pPzkPYhLnr4x03a9O/z1PYo8qb5Btxe9hGRhPppCp74dOGe9CI8WPltCrr5hGoa9FD/GPVInoD7MYmK9YoQQPjojij72tIO9hqyuPcb5iz6YwC29fCeGPi6tZj5A2ZS9Ne+IPnhFED7XF4m9G0esPd0M9z3jjUy9sP6fPlLt0z1aKm+92CqxPp1olz1OuYK9zvyaPq5H4bzIBz298G2aPoOGXr7Bbpi9QZ+oPsVym74yA5W9GFtoPqWgi75nYY+9CvRJPmwmj76oV4q9YU87PvkPmb6RCqO9ww0YPntOqr5e16+9lnhAPpVgob4Fi8O9paAbPs4ZcT7UYJq951LMPonS3rqQoHi9teDFPvIHg70+BcC98x+yPuyj070vacy9HtytPphpu70xzp+98pixPmu3Pb7USMu9dv0CPmCrZL475Ka9DAILPuCEgr68BdK9nuoQPs9OZr7VJs6902qIPie9n76JXsa9SP5gPtV4qb4FwLi9inY1PovDqb51zaS9dc3kPYVfqr7gSna9PDFrPdKMhT5d4Z29B86ZPUYIbz73Bp+9VDWBPQK8ZT6NC8e9y2cZPk/MOj6Agsu9DAKbPi2yPT7Fcsu9BYuDPlOW4T1Z+pC95lezPg5nfj2LGsy9w4FwPtfdPL5tytW9uB6lPkopaL72XdG9CYqvPg/RaL6fceG9UYgAPrHhib7c9Ke96UhuPnr8nr7D2MK9CTiEPlwDq75J9LK9CRaHPplHXj4QI8S9mC+PPnLcST5F8L+9LXihPq6BDT63nMu9ayuWPjvfDz5wsaK9asGLPu84xT18LL29uvfAPlwggT00hc69hgOhPu/+eD1YqLW9KCeaPmwmXz1Juqa9NKKEPkFlfL3h0ca9Lq22Pv59hr3OU9291uLDPvW52r1Qwsy9U8uGPl701b3so9O9QglzPqeWLb7dzZO9iQzrPVIPkb5lwq+9m3LFPavsmz6/Q9G9R1WTPa6egz4yWse9LlY0Pn2uhj6u08i9JJe/PSuHdj5F8L+92Ls/PlDHYz43bNu9W+trPukraD4qUuG924odPpRNWT6F69G9LzQ3Pv8hPT47Ac29gueuPtF0Fj4i4NC9RS+zPvGd2D1FZNi976yNPtU+nT34a7K93STGPtMTljsM6tu9F7exPqBUe7wZ4ti9P5GnPtTxGD0e4bS9fNVqPhNm2rwvacy9B7ZqPvd14L0ofsy9PzWePmBZ6b11jsG9y76bPipvB76h89q95X6HPjdxEr6ob9m9UMJsPpusEb44ENK9tRUbPkP/RL7caMC9guJnPs+9Z77Jcee9xFo8PsSUaL4QQOq9M8SxPqezg77XUdW9/PucPrzom77a5sa9Rs6CPYDxnD5Hd9C9QZoRPspPmj4Ysrq9RfXWPdz0hz56jd295BRdPnicgj63nMu94iMiPsmTJD4IILW9VvGGPZsg6j221te92gMtPQ5n/j3qPsC9rIubPu22yz3pQ9e9Gt2BPXZsRL678tm9/U0IPgu1Jr6QZqy9xhbCPSoARr5ehdS9AreOPuCEgr7Nr+a9ak1zPYFDSD68dNO9PGZAPgpoIj4l6dq9sySAPsFz77wX1Le9bkyfPuM2Or4lBsG95bOsPtI1g74eigK+8deUPtOfjb5eLuK9RGkPPkxsnr7zk+q9ppuEPtL7Jj7eH6+9cELBPj+ptj0RAce9bAmpPo7MA772f869sFXCPof5Er4zG+S9W5Q5PmDlUL5HIN69QYKSPprrhL5tcwO+l/9QPg5nfr6FlN+96iGaPqytmL7wFgi+Z341PiPzqL7H1969KQVdPr4wOT7ejvC9CoBxPnxETL11q+e99GyGPk7RMb6SkfO9+feZPppCh76byRe+5zVWPvfkgb4MAuu9BOJ1PgpoQj6WJgW+XqJ6Po3uID5JLv+9ehllPjs2Ij4k7vG9hgOBPmIQmL2wcgi+/ROcPjBkdb5VMAq+46oyPhNhY74ctg2+pz8bPvZiiL57FA6+DoREPuvihr5ivhy+JXViPp1joL49mxW+R1UTPp4Mjj5YOfS9C140Prahgj5S8gq+LLcUPkTdZz6fyBO+f4eCPnlAWT6yhQC+PwCJPj/GPD4zpwu+zGKyPhPV2z3LnA6+6Q5iPiUGAb3K4Ai+tU9nPrUVe72u8A6+EXC4PpAxd70hsBK+Zd+FPlPL1r3nGBC+TGy+Ps1Y9L1iSgS+FTq/PrmID74h5Qe+XcSHPghyEL4YJhO+ZapgPtcXab6I1xW+ITxaPgQcgr6iKBC++WY7Pnybnr4W9hS+ou4jPvlmm77mywu+mC8PPntOOj55ARa+G0xDPVfsDz4Qrwu+DRp6PY8Z6D0T8gG+JZJoPrhY0T06zBe+xY9xPsoyhD1jYhO+DcNnPnOdxr3Kphy+MlWwPrprCb5YORS+xQNqPuCEQr4Hzhm+41OAPQVuPb4c0xO+KnQ+PrIRSL4T1Ru+oFQbPqd5R76oUhO+GvrnPUxPWL5sPu69wHiGPmjQoL4i/Ra+eH88PaxzLD7Q8hy+8L+1PlZ9rrzUQxS+OpKbPoS7s7wRqhS+glagPpCgeL19sw2+4V1OPrxcRL3sURi+RMCxPqvP1b3CLxW+lLyaPmagEr6itBe+URSIPijVPr4dIBi+FQDjPCgKVL7GM+i9Q/+EPhPVW76LVBi+I9u5PTI4mj71EA2+MgMVPnE9ij6gGg++iUHgPXqNjT5JhRG+o8xmPoJzZj7sEhW+YKuEPgVphj0xQhi+kE6dPn9NVj0w8By+jC3EPs2v5jkxlBO+gH20PqAyPr4qOhK+5xiwPrHhab4R3wm+0H5kPgA6jL5rKza+DaZhPZV9lz4N/RO+HY+ZPl6iOj4UeRK+odaEPtsWJT6oOgS+DyirPpTBET7P9xO+5q6FPsjSxz2Orx2+3c2jPtyAzz0buwS+DY7CPmYUiz3/eA++B86JPtV4aTz52jO+WFaKPrYQZLpFniS+qz6HPhrdYb5Hcjm+65CLPkKVir6qmkC+7KNzPpVlmL5rmje+jV2iPW/Yhj6BlSO+UMdDPpv+bD6wyRq+mz3QPZCgWD61Tye+pKXyPY4ePz5Qqj2+RN0HPvHXJD5wQiG+vt6dPkImGT73WBq+KH5sPsX+8j3v5im+4Na9PiDSrz3xgBK+VDWxPjtTaD2bciW+jNaxPnP0eD2fdji+3o5QPuNTAL1MVA++mbumPnwKwL1mMRG+YyhnPgvvMr5J9DK+uyevPhK9DL4dPT6+eH+cPgXAOL74wkS+U+isPrADZ74k0Su+s17MPVMFgz5XJjy+5EnSPehqaz5TrjC+Xi5iPXtOOj5HID6+gA7zPbh1Nz60sCe+NICXPsRfMz7ePDW+IsOKPsPwET7/sju+cY9lPrd6Dj7KbDC++z+HPqs+1z0IlC2+0cuIPrcLjT3rbj6+WhLAPs6qTz3Y8DS+b/WcPjVjEb7FOD++3BGOPjmXQr5wdza+RrGsPkZfQb5HAzi+4Zd6PdE/Yb6vfBa+xT3WPQYqY74DJhC+XrppPhwlb77rbj6+NxpgPraEXD5uo0G+/8+BPokHVD5diiu+6UhOPiv2Fz5AajO+jQtHPv7UOD7T9i++/kihPgnhET5M/Ty+nWMAPrXDHz4peTW+T1iyPpnwyz2VnzS++SyfPrTIdj2taT6+SdecPo/8wbnf+Dq+kElGPkAYeL0nZj2+uY1GPkCHGb760EW+pHA9PkD7Mb4fojG+F7yoPbJjQ75jnP+9RgifPn7GZb5olkS+ucKbPoqOhL6KAj2+j99bPU9YYj7FPTa+Urg+PtwRbj7OUz2+C0ZlPm3FPj4rEz6+JEWEPpBOPT4AkT6+Zw/0PVj/Jz4W3iW+LLxrPmNicz2jATy+4JzBPjnRLrxtxT6+6X2zPr7ZZrx0XkO+xjNoPrvtwr0IyUK+dsOGPrQ8D75T6Dy+5EkSPrMkYL5GthO+MIFbPfhwab4awDu+UwUDPvC/NT51WSy+aeOYPi140T2Vt0O+u7hNPgq6/T1eSyi+VTC6PhV0e71Uby2+s9K0PtpVyL3xSz2+Qs9mPq98Fr7c9Ee+5EnSPeIjYr5tqDi+FvubPtPeYL6NXWK+Fw6EPc6qjz5DxTi+vvYsPkIhgj7irym+SG1iPY201D1jekK+9PidPtDV1r1CPki+5A+GPc11Or7OUz2+w2QKPvUQbT57oDW+HuF0PpZDCz1R2ju++5HCPqsmiL0Rxzq+CW2JPmiWxL0UP2a+iQeEPo2X7r3zcU2+NPQPPoOGXr7D2EK+DFk9Ph0Dcr7meTC+KpFEPTJyFj7x10S+INJvPf4OhT13Sme+R8mrPhnnbz3EWly+ylSxPt1BbDyHv2a+8PlBPgK8Bb6alGK+eo0dPinoFj7Tami+NbXsPRrAGz4xmUq+bHhaPgOyl71u3U2+/dlvPmDlkL38xle+u34BPsjNUL5vL0m+P+MiPuFFfz4pIkO+hQiIPrQfCT7DR2S+DeCdPicxyD0UImC+002CPuJYl70g0k++0m9fPgsk6L3AeGa+f94UPgN4S767YVu+m49rPVvOhT5WZV++s14MPmaIYz4TD2i+6KQ3PkUSXT4kf3C+n8gTPheCPD5UAGy+SNzjPSXpOj4BTWS+cv7mPQKfHz4wL2C+beeLPj7tMD7hl1q+ldRpPjxO0T1iZ2q+wa2LPkj5yT32XXG+swyhPt17uDznqW6+ea+aPn7ja71CW26+Lc9DPqG5jr3X+mK+caybPiGTzL3nHWe+lkNLPs3MzL2kiGy+qDpkPurPXr4nMWi+/kOKPqRwXb5lx2a+qmWrPReCfD4+s2S+fxOKPU2EbT5okW2+gy8sPsXJPT6fzWq+s81tPtB+RD41KWW+I/gfPtI10z2asWi+AU2UPotPAT5vL2m+GFuIPtaoh71hVHK+QSuwPj2blb34jW++eLTBPv32tb1+AFK+bXOzPgqFyL0+s2S+luwYPplkZL6iemu+dEE9PlpkW76Fzmu+knmkPoleRj1p42i+TRWMPsUDSjzEX3O+fZHAPjxrt7xkXVy+UmGMPmU2SL7wp2a+5uhxPYrNZ74U0GS+wJVsPW05h75HyWu+gq3SPWUBcz4Fhmy+GcopPhpp6T3kSXK+HXdKPdmZwj1/+1q+P2+KPsJMmz3tu2K+0GFePhrAmz0cQnW++z+HPqIoEL5/pGi+SddsPmnjCL4W3mW+L4uZPulgHb64r2O+vR2hPV5LSL52iWq+qppAPsIST75A+3G+1/riPS/6ar6L4F++1EM0PbvQfL5cWk2+NWMRPvZ/zj0py4C+/OOdPmu3Pb42dmm+c6I9PpeLOD7UK4W+Y0VtPl8kFD7Y2IW+GcWCPq0vEj6h+IG+BARzPdIdRD1JS4W+b7uwPvFo47ueXom+846zPpHVDb6Nl26+nuqAPo2cRb4ps4G+RUdyPbHhaT7OpYi+Wg3JPTf9WT52Moi+qFcqPhEBBz5NMnK+XfmsPmPuWr0EOYi+pz+rPvzGN757Zmm+EqCGPlGgb75lx4a+BYtDPQfTED64Boa+LVsrPqcFDz5AMIe+DWyFPnfz1D2NYom+zvzqPUSo0j39TYi+EyxuPkFI1j13oYm+zoiiPhH8bz3TE4a+T0BzPntOej1Zhoi+G56ePk6XRb3zdoS+5WGxPiXp2r1MT4i+JqqHPhU6D74knIa+DhBsPuSgRL5wJYu+I6FtPnztWb6CqIu+nnsPPjJaZ75UOoi+DqEKPsEcXT54C4S+t7QaPntOOj7ZJYq+u0QVPgfwFj7ZJYq+Su9bPgTnLD6LMou+xvmbPtuizD1OuYK+eqWcPhmtIzyJDIu+woaHPksfOjySP4i+pMdvPUpGTjyOQIy+9kVCPjPhl72hEIG++kQ+PljiYb44LYi+n+X5PTeOeL6xUIu+twuNPVdgaL6/SIi+PzXePRzrgr6cUIi+h23LPTG2gL6KPGm+RDQ6PfFoQz5Rg4m+I76DPsher733Bn++XVA/Pr7B172Vn4S+Mc6vPu3wN74V43y+gUOYPr8rIr4B3oK+tHFEPUrvG756Nou+cRvNPQjmSD5b64u+FZHhPeWbDT5oeY6+FQCDPvIMmj3DKo6+0zCcPm1zYz36YZS+Tzt8PsYWgrvSqYu+trmBPqytmL0iGn2+ZyejPt3v0L17g4++v0iYPm/1PL4OoYq+MetFPu27Qr6Iuo++ERlWPUI+iL6MuYu+NbWsPmt90b36fpq+MjhqPrpOA76+wYe+lE1ZPm9H+L08g4a+pDaxPuVEG772l42+RPqdPgVpZr5y3Im+DMhePllMDD4hzZi+4q9JPjuqmrosK52+8KKvPk4ohL2vWpm+LnOqPoLKGL6UTZm+BaMyPsanQL6TjJy+fcs8PpnYXL6oxpu+MbaQPU7uVz4iw5q+FakwPmWlyT2536G+L4YyPjqSiz1tqJi+gVuHPjBkdT1l/Ju+DFkdPiIaXT0lr56+BYacPlovBjw4Mp++sOagPmnjyL07qpq+M/59Pes5Cb6KWZ++pDahPmDlEL7QYZ6+RYGuPsU4P77CwJO+XOYUPtZuW76atp++bhfaPSveSD4SvZy+OITqPew0Ej4qjJ2+/5U1PsNkKj45C5u+gSFLPo9wGj5dUJ++5zUWPpNSED6JKaG+AwmKPg8LNTzXNJ++5BSdPhBdkL2At6C+ibV4Pf7UOD6jQJ++onoLPhhDOT4dd5q+TRWsPs3pMrvMl5e+zEBlPu0NPjv7IqG+JseNPhzOfL1d4Z2+y2cZPpT2Rr7KVKG+a/HpPVLtc77my5u+CtcjPgAd5j0Uy52+PPfePUj5yT2YF6C+ECOEPl8pyz3Dnpa+ChFwPgBvwT3vyaO+ZQFzPgB0mD3i5J6+JV0TPjAqqTyQFKG+kxiEPQLxOrxrDqC+NlljPmLWS74LmKC+3EuKPvbRab4foqG+/U1oPtuKXb48956+DYm7PaA3hb7WxZ2+zcycPuxRuLwHJay+cHydPugTeb12prC+mwOEPcAJBb3O/Kq+t3pOPqFKTb0M5aS+PX5vPWxDhb2HirG+FK6HPQ0aer0wZKW+7rF0PUDeC77T9q++jh6fPm3nO75rK6a+x0agPmDqZ74tQ5y+aVKqPqvPVb7PoJG+e056PaCJcL4ofpy+idJePnNo0T3Th66+DM0VPuwS1TxUjLO+2lVIPauVib7dB6C+n1kSPpWCDj75FLC+I0o7PsmOzT2ADrO+OpJrPi6tBjzWi7G+DkqIPtrJ4Ds/47K+DttWPhzrYr0qAKa+VFJnPn5XhL1nYa++n+V5PYsazL2nIrW+CoBxPgqirr2p+7C+VROEPre0Wr7mebC+FD+WPtGRXL4H66++4L7OPdi2KD4Pl6y+N4nBPeZ0GT7ghLK+VwnWPWZO1z3Z662+XHczPlaalD1o0LC+veOEPqRTVz0pXK++JZKoPRQF+rxnfqW+mxuDPuFdrr2gVKu+YOqHPtogk72ns7O+R+ahPqeR1r1v9ay+NQyfPiKOFb7pfbO+XymbPh+dOr7LubS+0NC/PTxOgb6TqbK+g6NkPapgND426rG+2c4XPh7ETj2947S+4Gc8PhqLpjyWBLi+fGGyPYcW2b1IxLS+RKOLPgWoCb515bO+hiCHPg4VQ77koLS+fqlfPv0wYr5uo7G+V3gXPqVrZr7cgK++Ieo+PbSrcL4xzq++LNTaPYmYcr7RrrK+1SYOPrzo6z07jbS+5E5pPotxfj29GLq+v2VOPeHuLL7PMbC+TpdFPRBYOT2Qa7O+tTf4PV8M5Twai7a+9aFrPpijB76l2re+/BhzPd9Pjb78GLO+9bmaPUuTEj4yVbC+GQQ2PkI+aD3fw8W+Y2KDPmcKnbwLXsS+OgYkPl+YTL1a8MK+d6E5PlkXt72xv7y+IqubPiy8y70xzr++eemWPgT/G77dB8C+1EhrPv3ZT74rpKy+vK4fPnqlTL55Xa++Tb45PkoHa76wPbO+PuiZPczuyT2Tb8a+vK5fPmVTLj0J+cC+KuM/PviIGLwvo8i+GH2FPryReb2xxMO+IGNuPeo+gL2rz8W+oYQ5PmZOl714f7y+y9Y6PhuBuL3Ml8e+L6OIPpSkC76kU8e+c/Q4PkFlHL5anse+atmKPnrCMr6i7sO+GJXUPbkZDj77kcK+trkRPrah4j1aL8a+9OAOPscuUT1uwMe+eQE2PnYaab0/kce+26eTPnhilr30FcS+ou4jPn9N1r2ph8i+CKyMPrPNzb1disu+tU9nPlGDCb6daMe+aFwYPgspH77JyMm+Km+HPY/kEj5AGMi+YTcMPsxiAj5Hd8C+4/zNPY1F0z00aMi+UYMJPrraijwNq8i+SPkpPq9fUL5Q5Lm+kQ86PuC5tz25cMC+otHdPRN+qTz76MS+S5NSPSsYFb5UOsi+a7ddPoY4Nr4gRsi+whdGPsstLb77Bcu+RUcyPrt+Yb7tgca+Ieq+PXZshL4P0ci+BrthPvpEHjwFqMm+GeLYPX2WR76b/sy+06SEPrLXW740aMi+hPBoPtuibL6zQca+bD7uPbSOar46HsO+6PYSPVoNCT48vdK+6X2jPWbafj3fN86+/3ivPV3hXT0FwMi+846TPQggtTxrn86+cHd2Pm76s72lFMS+UDYFPq1MOL6XOc2+5wBhPmoYPr6AK9m+28QJPtHobr5g6se+Keh2PRkchb6gFci+h/lyPVQAzD2cv9m+SikIPt3Nkz0MdtO+8Us9PgqAcbyN0dq+XCBBPmt90b2Q99q+u2F7PmjQkL2ugc2+tKvQPWsrtj0Knde+fdATPlLyajzHEdu+vQBbPuNw5rxrgti+kWGFPrsnz72LbNe+z/eDPgb1Db6fdti+YWxhPs/3E77Jdt6+KEQgPuw0Er45nNm+hlU8PvoKEr66Sdy+JxSCPrN7Mr50e9m+d/hrPmwmX751PNa+1nMSPqWgO75C7Ny+H526PYBIP75fQdq+1xeJPQzIXr7Esd6+0zA8PlLVZL6RJ9m+QzmRPXE4c77WVsy+iIXaPZq2fz1sPt6+2qx6PX+kiD3Ut9y+zt+EPZ+ORzwOENy+W19EPiyfZb1vDdy+BK1gPo/Cdb22hNy+hesRPpfFZL65Gd6+BoHVPRfUt7tpb+C+qFITPhlz170N4N2+Uz/vPQhV6r3eH9++6fE7PgdfOL5Fgd6+29zYPXZPXr4smt6+W5RZPfIHg76zQda+OiNKPcWs172E9c++3bVkPsISz716quO+amrZPcgMFL6ASN++L4vJPfVnf77f4Nu+wHiGPTG2kL0P1t++m/5sPSfCxr37dNy+tJMhPi4EOb2gbNq+z/fTPayQEr5aEvC+izcSPjHTNr6QTu2+GjQUPjIDlbwsmu6+1ovhPdGRXL2+pOG+oBovPYfcLL5jKOe+mwOEPQCpjb27fvG+DY7SPQlQU73KVPG+lj40Pgnh0b3Fcuu+T680PmRdHL6Px+y+ghzUPR8uOb43ifG+UTHOPXoZRbx65O++h6KAPbPSpLv/z/G+N3EyPhsNYL0ahu++w7scPkax3L17g+++HHxhPW9HOL6GcvK+q5WJPa/r1700Efa+UHARPp1LEb7CUfK+zyyJPa98Vr7Eme++i4kNPnE9ir0J/ve+7PqFPfvoFL5rmve+fA/XPWQeWb7zAuy+jZeuPSEftL0XvPi+t+7mPVDkib2nlv2+OSgBPoYgx72kx/++vK7fPb6f2r1JLv++IeWnPetu3r3ABP6+j8J1PQAAgL6amZm+AtRUPQAAgL5xPYq+j8L1PAAAgL4z/n2+AAAAAAAAgL6PwnW+j8L1vAAAgL4z/n2+AtRUvQAAgL5xPYq+j8J1vQAAgL6amZm+AtRUvQAAgL7D9ai+j8L1vAAAgL4aNLS+AAAAgAAAgL7sUbi+j8L1PAAAgL4aNLS+AtRUPQAAgL7D9ai+9P1UPZqZmb4K16O+YXE4PZqZmb4rh5a+9P3UPJqZmb7eyIy+AAAAAJqZmb5MN4m+9P3UvJqZmb7eyIy+YXE4vZqZmb4rh5a+9P1UvZqZmb4K16O+YXE4vZqZmb7pJrG+9P3UvJqZmb425bq+AAAAgJqZmb7Jdr6+9P3UPJqZmb425bq+YXE4PZqZmb7pJrG+MQgsPTMzs757FK6+tvgUPTMzs774U6O+MQisPDMzs75kdZu+AAAAADMzs751k5i+MQisvDMzs75kdZu+tvgUvTMzs774U6O+MQgsvTMzs757FK6+tvgUvTMzs77+1Li+MQisvDMzs76Ss8C+AAAAgDMzs76BlcO+MQisPDMzs76Ss8C+tvgUPTMzs77+1Li+j8L1PBSux74zM7O+AtTUPBSux74fhau+j8J1PBSux77z5aW+AAAAABSux74K16O+j8J1vBSux77z5aW+AtTUvBSux74fhau+j8L1vBSux74zM7O+AtTUvBSux75I4bq+j8J1vBSux75zgMC+AAAAgBSux75cj8K+j8J1PBSux75zgMC+AtTUPBSux75I4bq+AAAAAM3MzL4zM7O+";
const BRAIN_I_B64 = "AQAAAAIAAgAAAAMAAgADAAQAAQAIAAAACAADAAAAAQAFABAAAgAGAAEAAwAIAAQACgAEAAgAEQAQAAUADgACAAQABAAKAA4AAgAHABEAAgARAAYADAARAAcADgAHAAIABwAOAA0ACQADAAgACQASAAgAAQAGAAUACgASAA4AEgALAA4ADAAHAA0ADQAOAAsADQALABMAFAATAAsAFQAPAAEACAABAA8ACAASAAoADAAFAAYABQAMABEAEgAZAAsAEwAWAA0ACAABAAYAFgAMAA0AFwAPABUACAAPAAkAAQAIAB0ACQAeABIAEgAfABkADwAXACwAFQAsABcACQAPAC4AFQABABoACAAGAB0AHgAfABIAGQAfABsADAAGABEAEgA0AAsAIAAMABYAHAATACEAFgATACAANAATAAsALAAVACIAJwAtAA8AGgAiABUAIwABABAAGgABAB0AKgAfAB4AJgAYABEAEQAMACYADAAgACYAIAATABwAIAAcACYAEwA0ACEAJwAPACwALgAPADgAKQAjABAAIwAiAAEAJAAQAAEAKgAvAAkAGgABACQACQAvAB4AKgAwAB8AJAAQABEAEQAYACQAGAAmACUAEgAyADQAHwAzABsAEgALADIAGQAbADMAJQAmABwAMwA9ABkAGQA9ACsACwAZACsAKAAsACMAIwAsACIAKAAjACkACQAuADkAKQAQACQAIgAaAAEAHgAvACoAMQAfADAACwA0ADIACwA2ADQACwArADYAJwA4AA8AOQAuADgAOQAqAAkAKgAxADAAHwAxADMAJQAcADoAPAAbADsAGQAbADUAGQA9ABsAPQA1ACsANQAbAD4AGwA8AD4ANQA2ACsAJwAsAC0AOAAnADcAOwAbADEAPQAzADEAHABNADoAGwA9ADMAHAAhAE0ANgAhADQAGQA1AD0ALABFAC0AOAA3AEMAOQBTACoAPwBKACoAJAAaAEAASgAvACoAMQAqAFUAJAAYAEEAMQAbADMAPABMAEgAIQBJAE0ANQBOADYAKABCACwAJwBaADcAKAApAFEAQgBFACwAIgBFAEQALQBFAFIAKQAkAEQARgBEACQAUwA/ACoAUwBKAD8AJABBAEYAGAAmAEEARwA6AE0ATwA+AFcAPABIAD4ASQAhAE4AIQA2AE4ATwA1AD4AUABjAFkAJwBQAFkAUAAnACwAYQAnAFkALAAnAEIAQgAnAC0ARABFAEIANwBaAEMAOABDADkAOQBDAFMAJABAAEYAMAAqAFQAKgA/AFQAMAA7ACoAMABLADsAKgA7ADEAVQBeADEAOwBLAEwAOwBMADwAWABOADUATwBYADUAYABQACwAQgAoAFEAJwBhAFoAQgBRAEQARABRACkAWgBDADgAQwBKAFMAMABbAEsAJQAcABgAQQAYAFwAJgBcABgAGAAcACYAMQBeADsAJgAcAEkAPgBIAE8ASQBOAE0ATwBXAFgAYABjAFAAYwBnAFkALABCAGAAZwBhAFkARQBRAEIAWgBhAFIAQgAtAEUAWgBSAEMAMABUAGIAMABiAFsAOwBVADEAOwBeAEsASwBeAFsAWwBMAEsAJgBJAF8ARwBNAFYATgBWAE0AVgBYAF0AXQBYAFcATgBYAFYAYABCAFEAaQA3AFoAUQBFAEQANwA4AFoAOAA3ADkANwBwADkAQwBSAGsAZABUADkAQwBrAGwASgBDAGwAOwBeAFUARgBBAEAAQABBAGUARwBlAE0AXAAmAF8ATABvAEgAaABpAFoAaAA3AGkAUQBqAEQAcABxADkAOQBxAGQAVAA/ADkAcgBAAEYAcwBbAGIAQQBmAGUAQQBcAG4AHABNAEkATABbAJYAXwBcAG4AYQBnAGgAaABaAGEAaABpAHUAZwBaAGEANwBoAHAAUwBkAHEAPwBTADkAUgB3AGsAbQBlAEAAZQBmAG0AZgBBAG4AXQBXAIgAeQBcAF8AXwBJAHkATACWAG8AYwB/AGcAfgBoAGcAYwBgAIEAaAB1AHAAawCCAFoAcAB1AHEAWgBDAGsARACFAHYARAB2AEUARABGAHgAdwCdAGsAjwA/AEoAVAA/AJQAhgCSAGIAYgCSAHMAXQCIAIkAeQBJAHoASQBNAHoAlgCLAG8AbwB0AH0AdQBoAJkAYwCBAIAAYwCAAH8AggBhAFoAgwBxAHUAdQCOAIMAZwCCAFoAUQCEAGoAcQCDAFMAUQBFAIQAYQBDAFIAYQBaAEMARQB2AIQAeACFAEQARgByAHgAawCdAGwAPwCPAJQAjwCUAFQAkgCeAHMARgBBAGYAQQBlAG0AWwBzAIcAXAB5AHoAXAB6AG4ATQBWAIoAVgB7AIoAVgBdAHsAXQB8AHsAXQCJAHwATABvAHQATQCKAHoAfACKAHsAVwBPAHwAfQBIAG8AfgBnAJgAfwCYAGcAfgCZAGgAgQBgAFEAZwBhAH8AYQCCAI0AjgB1AJsAjQBnAH8AggBnAI0AgwBkAFMARACFAGoAnABTAGQAZACUAFQAkABiAJEAYgCcAJEAYgCQAIYAkgCGAJAAYgBUAJwAcwCeAIcAZgBBAG0AhwCWAFsAlgCHAHMAiQBXAHwAbwCLAHQAiwCWAKgAfABPAJcAjACYAIAAmAB/AIAAfwBhAI0AowCOAJsAgwCcAGQAagB2AIUAQwBrAHcAUgBDAHcAlABkAJwAkACvAJIASgA/AGwAkwCeAJIARgBmAHgAegBmAG4AZgB6AG0AiABXAIkAngCWAHMAewCJAKUAewB8AIkAfQBPAEgAiwCoAHQATwB9AKcATwCnAJcAmQB+AJgAmQCiAHUAgQCqAIAAjQCaAH8AagCBAFEAgACNAH8AgwCOAKwAagCFAK0ArgCtAIUAVACUAJwArwCTAJIAngCTALAAhwCeALAAegCgAG0AlQBtAKQAlgCeALIAewClAIoAqACWALIAegCKAKUAiQB8ALMAmACMAKkAmAC0AJkAqgCMAIAAmwB1AKIAyACaAI0AfwCCAI0AmwC1AKMAjgCjALUAagCEAHYAjgCcAIMAagCuAHYAkQCcAJAAnwCHANIApABtAKUAbQCgAKUAoAB6AKUAoQCnAKYAsQCmAHQAngC8ALIAiQCzAIgAdACmAKcApwB9AHQAqgC/AIwAqgCBAKsAfwCaAMMAjQCCANAArQCuAGoAawCCAI0AkAC3AK8AdgC6ALkAuACFAHgArwC3AJMAsADEAJMAeAC4AHIAcgC4ALoAsADSAIcAfACXALMAdACoALEAvQCXAKcAmQC0AM8AogCZAMEAmAB/AMAAmADAALQAwQCZAM8AowCbAKIAfwDDAMAAmwCOALUAgQBqAKsAmgDIAMMArQCrAGoAtQDJAI4ArACOAMsAggBrALYAjQC2AGsAuACuAIUArgC5AHYAkwC3ALAAZgC7AHgAqACyALwAqAC8AMUAqADFALEAqgDGAL4AvgCMAKoAtACYAKkAqgCrAL8AwgC/AKsArQDHAKsAfwDQAIIAjQDQAMgAtgDQAIIAjgDKAMsArACcAI4AjQDIALYAxADSALAAeAC7ALgA0wCfANIAuwBmAG4AzAC8AJ4A1QC7AG4AiQB8AKUAiQCIAHwAvADMANQA1ADFALwAvQCzAJcAxgDOAL4AqQCMAM0AqQDNALQAqgCMAIEAowDfAI4AqwDHAMIAwwDIANAArQCuAMcAyQDKAI4AtwCsAMsAkACcAKwArAC3AJAAkgDZAJ4AbQCkAHoAngDZAMwAbgCgANUAbgB6AKAA1gB8AIgAxQDUALEA1gClAHwAzQC+AM4AvgDNAIwAmQDoAKIAxgCqANcAmQCiAM8AjAC/AM0AqgCrANcA6gCiAMEAogDqAKMAowDrAN8AwADQAH8ArgC5AMcAyQDRAMoAtwDRANgA4wCSAK8AkwCwAK8AkgD/AOMAkwCSALAAxADTANIA2QCSAP8AkgCeAIcA1QDlALsAegCkAKUAiACzANYApgCxANQA6ACZAN0AzgDGAN4AmQDPAM0AgQCMAL8AowDqAOsA0ADAAMMA6QDfAOsAqwCBAK0AywCOAN8A0ADIAOwAtgDIANAAygC3AMsAygDRALcArgD8ALkAtwD+ALAA4QDjAK8ArwCwAOEA2wDcAKQA2gDMANkA2gDUAMwA1ADaAKYApAClANsApQDWANsAmQDNAN0A5wDoAN0AxgDXAN4A6ADnAKIA5wDBAKIAzwCiAMEAzwDAALQAgQC/AKsA3wDpAMsAyQD6AMoAuQD7AMcA+wC5AO0A7wDtALkA7gDJAPoA8ADvALkAyQDuANEA8AC5ALoAugDgAPAA2AD+ALcA4ADiAPAA/gDEALAA8gDZAP8AsACSAIcA2gDZAPIA1QCgAPQA1QD0AOUA1gCzAL0ApwCmALEA5gDdAM0A3QDmAAMB3QADAecAzgD3AM0AzwAQAcAA6QDrAOoAwQD4AOoAqwCtAAUBqwDCAK0AwgDHAPkA+wD5AMcA7ADDANAAwwDsABABrQC5AK4AyAAUAewAIgHRAO4A8ADiAO8A8QCuALgA8QCuAPwArgDxALkA/AC5APEA7QC5APwA/QC6ALkAuAC6APEAuAD9ALoA5QDkALsACAGmAPMA2gDzAKYApgAIAQEB3ADbAAABpgABAaEA5gAbAQMB5wAPAcEAwQAPAeoA1wAFAQQBtAAQAc8A1wCrAAUBwAAQAcMAwADDAM8AxwCtAMIA6QASAcsArQDHALkAyADsALYA7QDvAPsAFAG2AOwAyAC2ABQB+gAiAe4AywDhALcA7QD9ALkA0QATAdgA/QDiALoA4gDgALoAxADYALAA4wAHAf8AuAC7AOUA8gD/AAcB5QD0AOQA9QDkAPQA9ACgAPUAoQABARYBoAAJAfUAoAClAAkB2wDWABcBswC9ABgBswArAb0AFgGmAKEA1gC9AAoBKwEKAb0AAgEaAd4AzgDeABoB5gD2ABsBAwEcAecAGwEeAQMBAwEeARwBzQD3AA0BzQDPAAwBDQEOAc0AzQAOAbQADwEgAeoAzwAQAQwBvwDCAPkA6QDqACABEQHpACABzwDDABAB7ADIAMMA6QARARIBBQGtACEBEgETAcsAywC3ANEAFQHhAMsAtwDhALAA4QAjAeMA/AD9AO0A2ADEAP4A8QD9APwAuADxAP0A/gAGAeMABwHjAAYB8gDzANoApADcAKUAFgEBAQgBpQAXAQkB2wAXAQAB1gAKARcBpgAWAQEBvQCnACQBsQAlAacAsQCmACUBCwEaAQIBAgHeAAsBGgEsAc4A5gDNAA0B5gANAfYAHAEdAecADAENAc0A3gDXAB8B1wAEAR8BDgEQAbQA+wDCAPkAwgD7AMcAygDLANEA0QDLABMBrQCuACEB/AAhAa4AuQDtAK4AywAoARUBKAEGARUB4QAVASMB0QAiARMB4wD/AAYBugD9APEAuADlAPEAzADZAPIA3AAXAaUA2QDMANQA1ADFAKYAKwEXAQoBJgGmAAEB1ADMAMUAzAAZAcUApgAmASUBCwEsARoBCwHeAB8B9gANARsBHQEPAecAHgEMARwBHAEMAS0BIAEPATYBEgERATcBygDRABMB0QAoAcsAEwEoAdEABwHjACMB/wAHAQYB3AAAARcB2gDZANQA2gCmAAEBswAYASsBvQAkARgBxQAmAaYApwAlASQB9wDOACwBHAEeAR0BSQENAfcADgEnARABNgE3ASABIAE3AREBNwE5ARIB+gDJACIByQDKABMByQATASIBrgDtAPEAuQDvAP0A4gD9AO8AKAFCAQYB2AD+ALAABgH+ADAB/QDxADEBBgEwAQcBCAEqARYB2gAIAfMAKQHkAPUA9QAJASkBCAHaAAEBMwHMAPIAMwEZAcwAGQEzAT4BJgHFADQBxQAZATUBPgE1ARkBHgEbAQ0BDQEOAUgBDQEMAQ4BDQFJAUoBDQFKAQ4BOQE6ARIBEwESAToB/ABBASEB7wC5APsA7QD9APEA/QDiAE8BLwHxADsB8QDlADsBKQEJATIBAAFDARcBFgEqAQEBMwFfAT4BxQA1ATQBHwFXAQsBRQELAVcBHgEcAT8BDAEeAS0BWgEcAS0BDgEMAScBDAEQAScBbQEnAQ4BBQFLAUABbQEQAScBTgFBAfwAEgEuASgBLgEjARUBKAETAU0BBgEwARUBUQEVATABUQEjARUBIwFRAQcB8QAvAf0A/QAvAeIABgFCAf4ALwExAeIA8QAvATEBMAFEAQYBMAE8AQcB8gAHATwBMgHkACkB5AA7AeUA8gBEATMBRAFyATMBcgFEAVQBCQEXAT0BJQEmAVUBLAELAUUB9gD3ACwBHQEeAUYBDwEdAUYBHwEEAVcBRwE/AR4BDgFZAUgBHgE/AVoBHgFaAS0BbQEOAUoBOAERASABEAHsAFwBEQE4AS4BEAFtAVwBNwFsATkBEQEuARIBQQEFASEBEwE6AYMBFQEoAS4BTAHtAP0AEwEiAU0BTQFQASgBUAFCASgBQgEwAQYB/gBCATABLwFSATEB/QAxAU8BMAFCAW8BPAEwAUQBUgE7AeQA5AApAVIB8gA8AUQBKgEIAQEBKgEBAXABCQE9ATIBKgFTAQEBAQFhASYBPgFfAXEBRQFWASwBDQH3APYASAH3AA0BRgEeAT8BHAFaAT8BNgEPAVgBWAEgATYBDgFKAVkBOAEgAWsBJwEQAVwBOAFbAW4BBQFBAUABOAFuAS4BgwFNARMBLgFuAV0BLgFdASMBTAH9AE8BIwFdARUB/AAvAU4B8QAvAfwAMQFPAeIALwE7AVIBbwFEATABUgEpAV4BFwFDAWABUwEqAXABFwFgAT0BFwFzAWABUwFhAQEBAQEmAVMBUwEmAWEBJgE0AXUBJAElAVUBYgE1AT4BJgFhAVUBZgE1AWIBYQFkAVUBZQE0ATUBZwH2ACwBaQH2AGcBSAENAfYAHgENAUgBBAF3AVcBBAEFAXcBawEgAVgBSgH3AFkB9wBKAUkBBQEEAUABawFbATgBbQEnAVwBNwERATkBOQERARIBEwF6AU0BKAEVAf4A/gAVATABBgEVAV0BMQH9AOIA/QAxAS8BMQFSAU8BKQEyAT0BPQFeASkBcAEBAVMBMwE8AZkBMwGZAV8BGAEkASsBMwFyAVQBFwErAXMBYgE+AXEBKwEkAXQBYwF0ASQBJAFVAWMBZAFjAVUBaAFWAUUBVgFoAWcBVgFnASwBfgFqAQ8BWQH3AEgBDwGAAVgBSgFIAVkBawFYAYABIAFsATcBOgESASgBTQGDASgBTQEoAXsBbgGEAV0B4gD9AEwBUQEwAQcBUgEyAU8BcAFTAW8BQwF9AXwBPQFgAXMBYAF9AUMBmQG2AV8BMwFUATwBXwG2AXEBKwF0AXMBNAFlAXUBZQE1AWYB9gBpAUgBGwFpAR4BSAEbAR4BRgF+AQ8BfgGJAWoBgAFqAYkBPwFHAVoBeAE/AVoBagGAAQ8BeAFaAUcBVwF3AXYBIAFrAXkBawF5AVsBSwFAAYIBgQFuAVsBgQE6AW4BKAH+AHsBQgF7Af4ATwHiAEwBLwG6AU4BLwGVAboBLwExAZUBUgGOATIBXgE9AYYBcAGYAVMBPAFUAUQBtgFiAXEBJgF1AWEBaAGbAVYBaAFFAXYBaQEbAUgBaQE/AR4BRgE/AX8BRQFXAXYBigF/AWoBeAF/AT8BfwGMAWoBdwHGAXYBagGMAY8BagGPAYoBQAF3AQUBggFAAZABOgGNAW4BKAGDAToBbgGTAYQBhAGTAV0BLwGFAU4BXQEwAQYBMAGlAVEBMAFRATwBjgFSAYYBUgFeAYYBcAFvAZgBbwFTAZgBfQFgAXwBYAFzAagBdQFlAWEBYwFkAZoBZAFhAWUBZAFhAasBaQFnAYcBRgF/AX4BigF+AX8BfgGKAYkBiQGKAYABfwF4AYsBawGAAZ4BoAFbAXkBdwFAAaEBkAGjAUABkQGwAYEBOgGBAbEBkgGCAZABjQE6AbEBQQFOAYUBlAGFAU4BTQF7AVABQgFQAXsBUQGlAZYBMAFCAaUBlwGGAT0BmAG/AVMBmQHBAbYBPQFzAacBYAGnAXMBcwHCAagBYwGaAXQBYQG3AasBZQFmAawBZgFiAawBnAFpAYcBaQGcAT8BaAF2AZsBaAGIAWcBhwFnAa0BrQFnAYgBPwGcAUcBjAF/AYsBgAGKAZ8BRwGLAXgBngF5AWsBjAGiAY8BgQFbAaABoQFAAaMBrgGRAYEBgQGwAbEBQQGQAUABQQGFAZABjQGxAW4BsQGTAW4BswGTAbEByAFdAZMBQgEwAaQBpQFCAaQBMQFPATIBjgGGAZcBPQEyAZcBfAFgAbQBwQGZATwBtwFhAVMBcwF0AbgBqgFiAakBYgGqAawBnAGHAa0BmwF2AZ0BRwGcAYsBdgHGAZ0BoAF5AZ4BrgGBAaABrgGgAc8BrwGMAYsBrgGwAZEBbgGyAV0BXQHIATABUQGWAaYBMgFSATEBfAGoAX0BfQGoAWABPQGnAZcBYAGoAbQBUwFhAbUBRAHAATwBPAHAAcEBtwFTAb8BuQFFAcQBaAGbAYgBngGAAZ8BxgFXAZ0BVwHGAXcBMAHIAZYBhQFOAboBLwExAbwBfAG0AagBRAE8Ab4BPAGZAeABvwFTAbUBwgFgAagBpwFgAcIBwAFEAckBvwG1AWEB4gG3Ab8BtgHBAXEBdAGaAcMBmgFkAcMBZAGrAcMBuQHNAUUBRQFXAaEBVwF3AaEBrQHmAZwBigGPAX8BrwGiAYwBxwFbAaABWwHHAd0BrgFbAbEBsQFbAW4BsgFuAVsBWwHQAbIBMAGlAaQBMAGWAaUBlgGlAbsBvAG6AS8BUgG8ATEBvAFSAb0BUQGmAZkBUQGZATwBjgGXAb0BRAG+AckBPAHAAb4BPAHgAcABygG0AagBYQG3Ab8BYgFxAeMBwgFzAbgBdAHUAbgBYQFkAbcBdAHDAdQBZAFlAcsBZAHLAasBzQG5AcQBRQHOAcQBRQGbAZ0BoQHXAUUBVwFFAZ0BxQGKAX8BnwGKAcUBnAHmAdkBnwGgAZ4BjwGMAX8BrgGgAVsBowGQAZIBWwHdAdABXQGWAcgBXQH9AZYBpgGWAbsBpQGkAdEBuwHfAaYBpQHSAZYB4AGZAaYBUgGOAb0BtAHTAagByQG+AcABwQHAAeABqgFiAeMBwQHjAXEBtwHiAasBZQHMAcsBZQGsAcwBmwFFAc0BzgFFAeQBRQHXAc4BmwHlAYgBxQF/AdgBxQGKAdoBxQHaAZ8BnAHZAYsBnwHPAaABowGSAdwB0AHIAbIB0AHsAcgBhQGUAd4BsgHIAV0BpQHRAdIBlgG+AbsBvAG9AfABvAHwAboB4QGWAdIBlgHhAb4BvQGXAYYBtAHKAfMBqQEOAqoBDgIBAqoBZAGrAbcBrAEbAhACzQHVAZsBiAGbAdUB1QHWAYcBxAHOAeQBfwGLAYcBfwGMAdgB2gHnAZ8B2wHaARMC2gHbAecBzwGfAecB5gEtAtkBzwHnAdsB6AHYAYwBBgKuAc8BkQGuAQYCowHcAekBkQGuAbEBsQGwAZEB3QHHAeoBhQHtAZABlAH8Ad4B7AFdAcgBXQHsAf0BFwL+AcgBFwLIAZMBuwGWAcgBpgHfAeAB0wG0AcoB4QHyAb4BCQLBAeAB8wHKAfQBwgEAAqgB1AHCAbgB4gEMAqsBGwKsAaoBqwHLAcwBzAH1AasBzAEdAvUBzAGsAR0CzQECAtUB1QECAvcB1QH3AdYBxAHkAQMC1QGHAYgB5QGdAZsBiAGHAa0B+QF/AYcBhwGLAZwBiwF/Aa8BogGvAX8B2wEGAs8B6AGMAaIB+wHoAaIB3QHsAdAB6wGQAe0B6wGjAZABhQHeAe0B7QHeAfwBuwHIAf4BhQG6Ad4B7wHuAboBugHwAe8B0QHhAdIBvgHyAbsBJgK9AYYB0wHKAagBCQLAAcEBygGoAfQBqAEAAvQBwgENAgACAQIbAqoBqwERAhwCqwH1AfYBzQEDAvgBzQH4AQICxAEDAs0B+QGHAZwBzgHXAeQB1wEFAuQB1wGhAQUCfwHoAaIB2QEkAosBoQGjAfoB6AH7AQcC6gEVAt0B6QGjAesByAG7ARcC3wH9AewB0gH+ARcC7gHeAboB0QFHAuEBuwHyAd8B8AG9ASYC4AHfAQkChgGXAQoCqwEMArcBEQKrAQwCwwEPAikCGwIBAg4CwwGrARwCiAEEAuUB1gEgAocB+QGcASAC2AESAsUB5AEFAiICBQKhAfoBJALZAS0CowHrAfoBoAEUAscBFALqAccB7AHdARUC7AElAv4B/QHfAZYB/gHSAbsB4QE8AvIBCQLfAToCCgImAoYBlwGnAYYBwQEJAuMBqQGqAQEC4gG3AQwC9AEAAgsCqgHjARkCqgEZAgECDQLCAdQBDQLUARoCwwEcAg8C9gERAqsBAwIeAvgB1gH3AR8CHwIhAvkBIAKcAdkB2AF/AfkBEgLaAcUBfwHYAegBFAKgASMCEwLYAegB+wHoASQC6AH7ARMCoAHPAQYCFgLpAesBFgLrAe0B7AH+ATAC7AEwAt8B9AHCAagBhgGnASgCpwHCASgCqQEBAg4CGQIbAgEC4wEYAhkC1AHDARoCwwEpAhoCEAIbAhkCHAIRAg8CHQJPAvUBKgIeAgMCAwIrAioCAwLkASsC9wFQAh8C1gEfAiACHwISAiEC2QGHASACIQISAvkB+QEgAiEC5AEiAiwC5wESAjQCEgLnAdoB2AETAhIC2QEkAuYB5wEjAqABoAHbAecBBgLbAaABJAIHAvsBEwL7AS4C/gElAi8CFwK7AdIBlgHfAbsBpQHhAdEBpQHyAeEBpQG7AfIB3wHyAToC/wEnAvMBJgKGASgCwgEAAigCwgH0AQACGALjAQkCAAJhAgsCDgKAAgECKQIPAhoCHQKsAU8CAgJQAvcBQQIfAlACKwLkAfgBAgIEAlAChwHZAZwB+QESAtgBEgI1AjQC5AEsAgUCEgLaATUCEgITAtoB5gEkAi0C6QE3AusBewLpAesBFQJVAuwBJQI4Ai8CMAJZAt8B8AFIAvEBOwLxAUgC8QE7Av8BCQJLAhgCDAIRAjECXwIBAoACAQJfAhsCGQIbAl8CDwIRAk0CrAEbAk8CKgIrAjICQAIyAisCKwL4AUACIAIfAiEC+AHkATMCZQJQAgQCLAIzAuQBNAI1AkICaQIzAiwC5AEFAkMCNAJCAucBBQL6AUMC5wFCAiMCNQLaAWcCQgI2AiMCIwJTAhQC6wE3AvoB6gEUAlQCJALoAQcC+wFFAi4CBgIVAuoB3gFWAu0BOQLeAe4BMAL+AVkCVwJYAjgC/wFJAvEB4QE9AjwCbwI9AuEBSgI8Aj0CPAJbAvIBPAJKAlsC8AEmAkgCOwJdAv8BPQJeAkoC/wFdAicCSwJyAhgCGAJyAnMCGAJzAhkCAAINAmECGgJOAg0CDwJOAhoCHgIqAjICNQIfAkECHwI1AhICEgI1AtgB5AFDAmgCQgI1AmcC2AE1AlICZwI2AkICBQIsAiICLAJEAmkC2AFSAugB2gETAmcCIwI2AlMC6AFSAmsCZwJqAjYC6AFrAvsB6gFUAocCLgJFAhMCBgLqAYcCVQJtAuwBLwIlAuwBOAJXAi8CWQL+AS8C4QHyAT0C/wHzAUkC8gFbAjoCSAImAl0CSAJdAjsCJgIKAl0COgJbAgkCSwIJAlsCXQI+AicCcQImAigCSgJMAksCcgJLAkwC9AELAj8CKAIAAg0CAQJfAg4CgQILAmECPwILAoECDQJOAmECYAJNAhECTgIPAk0CTwIbAnQCHgIyAmMCHgJjAvgB+AFjAgICAgJjAmQCAgJkAgQC+AEzAkACQQJmAjUCUAJRAkECZgJSAjUC5AFoAiwCQwL6ATcCLAKNAkQCVAIUAlMCagJ4AjYCFQIUAmwCawJFAvsBFAIVAgYC7AFtAi8CWQJ9At8B4QE9AkcCOgLfAX0CPQLyATwC8gG7ATwC3wE6ArsB8QFJAjsCOwJJAj4CXAJaAvMBXgI9Am8CSwJbAkoCEQIxAmACYAKKAk0CgAKLAl8CYQJOAoICTgJNAoMCGwIZAnQCGQJfAnQCYgL1AU8CYgJPAnQCMgJAAmQCYwKEAmQCUAJlAlECdQJSAmYCaAJDAowCNgJCAlMCRAKNAnYCEwJrAmcCFAJ3AmwCRQJrAhMCjwIUAgYCVAIUAo8CVQIVAnoC6wHpAe0BFgLtAekBOQJWAt4BRgI5Au4BuwHfAX0C7wHwAX4CSAJ+AvABOgI8ArsBSQLzAXACWgJwAvMBXQI7Aj4CSQJwAj4CbwKbAl4CPwIAAgsCXwKAAg4CKAINAn8CXwIZAnMCggJOAoMCMgJkAoQCMgKEAmMCZQIEAmQCvwJmAkECvwJBAlECdQKFAlICawJSAoUCawKFAkUCFAJTAncC6wF5AjcCagKGAngCFQJsAnoCBgKHAo8CVgJ5AusBjwKIAnoCVQJ6AogCVQIvAm0CfAJYAsQCbgJYAnwCLwKQAlkC7wFGAu4BfgJGAu8BOgJ9AlsCJgJxAl0CPgI/AnACgQJhAgACAAI/AoECfwJxAigCYQJ/Ag0CZAKEAlAClAJoAowCQgLAAlMCawJqAmcChQKOAkUCegJsAncCVgKmAnkCOAKYAlgCLwJXAsYCbgKJAlgCOgJbAjwCPgKeAj8CYQKCAoECqwJ0Al8CEQL2AU0CYgKTAvUBkwJNAvYB9gH1AZMCQAIzAisCZAJRAmUCLAJoApQCLAKUAo0CUwKjAncCpAJ3AqMCawKVAmoCjwKHAlQClQKWAmoCagKWAoYCOQKmAlYCwwKXAogCiAKXAlUCLwJVApcCxAJYApgCWQKQApkCWQKZAn0CWAKJApICWAKSAlcCkQK3Am4CWwJLAjwCXQI+ApwCXgKbArgCuwJdAnECXQK7Aj4CPwKdAnACPwKBAqkCcQJ/AmECvAKLAoACggKfAoECgwJNAqACZAJQAlECMwJoAisCQgI2AsACsAJTAsACaQJ2AiwCaQJEAnYCowJTArACQwI3AowCjAKiAo0CjAKNApQCeQKiAjcCjQK0AnYCdwKzAnoCdgKlAkQCRQKWAmsCawKWApUCagKGArYCRQKOApYCOQKnAqYCwwKYApcCLwKXAjgCOAKXApgCRgKnAjkCLwLGApACfgJIApoCXAJwAloCcAKdAlwCXgK4AkoCSgK4ArkCPgK7Ap4CSgJyAkwCngKpAj8CywJzAnICcQJhAqoCgQKfAqkCgwKfAoICoAKfAoMCiwK8Al8CqwJfArwCrgIyAisCZALOAoQCQALNAjMCMwJkAkACUAKvAlECaAIzAr0CUQK+AmUCZgK/AqECUQK+Ar8CUgJmAqECsAKkAqMCjAI3AqICNgJqAsECjQKiArQCsQKzAqQCogJ5ArUCwQJqArYCsQKyArMCtAKlAnYChgKWArYCegJVAo8CjwJVAogCkALGApkCkgLGAlcCtwLFAm4CqAJGAn4CqAJ+ApoCPQI8Al4CXgI8AkoCmgJIAl0CmgJdAsgCnQKpAnACPwKpAp0CSgK5AnICcgK5AssCcwLLAswCcQKqArsCqgJhAtwCYQKBAoMCYQKDAoICkwJiAqwCrgLhAjICMgLgAisCQAIrAuAChAKtAq8CzgKtAoQChAKvAlACzwKuAisCKwJoAtECUQLiAr4CUgJBAjUCNQJnAlICsQKkArACNgLBAtMCswJ3AqQCwQK2AtQCtQJ5AqYCxQKRAm4CSwJbAtcCuAJeArkC1wJKAksCXQKcAsoCcAKdAj4CmwLpArgCuQLXAssCYQKCAtwCTQKKAtkCigJNAvACrAJiAvMC4QLgAjICrgLPAuECzgJkAs0CzQJkAjMC4gJRAq8C0gJBAtACQQLSAjUCaAK9AtECoQJBAlICvQIzApQCvwK+AuICMwIsApQCNQLSAmcC4wJSAmcCUgLjAmsC0wKwAsACNgLTAsACsALTArEChQJrApYC1ALTAsEChQKWAo4CVQJ6Am0CbgJ8AsQCtwKRAsUCqAKnAkYCbgJYAsUC1gLGApICxgLWApkCbgLFAokCfQKZAlsC6AJbApkCxwKoApoCSwJKAjwCmgLJAscCSgK5Al4C1wK5AkoCyALJApoCXQLKAsgCnQK6AqkCuwKqAp4CigLbAtkC7wJfAnMCcwLMAu8CgQKfAoMC8ALbAooCoAKCAoMCTQLeAqACTQKTAt8CkwKsAt8CYgJ0AvMCdAKrAvMCrALeAt8C4AKtAkACQAKtAs0CrQLOAs0CrwLOAuIC0AJBAqEC0QKMAisC5AJnAtICZwLkAtQCLAJ2Ao0C0wLUAuUCsQLCAtUCsQLBAsICwQLmAsICegKzAvYCiAJVAsMCegL2Am0CkAJtAvYCVQJtAlkCkAJZAm0CAQO3AsUCxAJYAm4CmQL5An0C1wJbAugCmwJeAukCXgK4AukCyQLIAtgCygKcArsCPgKdApwCyALKArsC2ALIAuoCuALrArkC7AK5AusC1wK5AuwCywLXAu0CqgLuAp4CiwJfAtoCngL7AhADngIQA6kCiwLaArwC2wLwAtkCXwLvAqsC3AIFA6oCoALcAoIC8AJNAjYD3gJNAt8C3QKrArwCTQLfAjYD3wKgAt4C8wLyAqwC/ALzAqsCrALyAt4C3wLeAvICzgKvAq0CzQLgAuEC4QLPAs0CFgPPAisCKwKMAhYDoQJmAuMC0QK9AowCvQKUAowC0gLAAuQC4wJmAlICoQLjAlICoQK/AuMC4wJnApUC1AKVAmcC0wLlAvQC0wL0ArECawLjApUC5QLBArEClQLUApYC5QLUAvUCsQLVAv4CwQLlAuYC1AK2ApYC1AK2AvUC5gL1AsICpQK0AhkDpQIZA+cCwwJVAvcCVQJZAi8CLwJZAsYCxgKXAi8CkALGAlkCOAKSAlgCxQJYAokCqALHAiwDyAK7AuoC7ALtAtcC7gKqAvsC2gKrArwC2gJfAqsC8AI2A9kC7wLMAhED8QLcAqAC4AIGA60CzQK9AjoD0gLQAiUDJgPiAs4CrwLQAr8CvwLQAqECJQOhAtICsQL0AuUC9QLmAuUCsQL+ArMC1QLCAggDLwL3AlUClwL3Ai8ClwLGAjgCkgI4AsYCtwL4AsUC+QLWAh0D1gL5ApkCHQPWApICmQL5AgsDmQILA+gCyQIvA8cCyQLYAg8D7AJFA+0CzALLAu0C7QJHA8wC7gL7Ap4CoALbAp8C7wIRA6sC8gLfAjYDzQIGA+ACFAMGA80CzQI6AxQDrQIjA84C/QI6A70CvQI7A/0C4gImA78CoQI8A9ICjAKiAikDogL/ArQCtQL/AqICtAL/AgADpgL/ArUClgL1ArYCwgIaAwgDAAMZA7QCwgLmAhoDwwL3ApcC9gIrA5ACAQP4ArcCAQPFAvgCxgKQAtYCpwKoAiwDCgOJAsUCiQKSAgoDxQL4AgIDAgOJAsUC6AILA9cCuQLXAgwD+gIOAw0DnAJoA7sCqQIhA7oCIAMDA9gC2ALqAiAD7ALrAkUDuwIEA+oC6gIEAzEDRQNHA+0C+wKqAiID2QI2A00CTgM2A98C/AKrAhMDBgMjA60CFgMVA88C0gInA8ACwAInA+QCFgOMAgcDBwOMAikD1QIIA/4CCAMaA/4CswL+AvYCpwIbA6YCCQOQAisDkAL5AtYCiQIKAxwDkgIcAwoDAgMKA4kCLwMsA8cCuwJoAx8DDwPYAgMDHwMwA7sCIAPqAjEDMQMEA7sCoALbAjIDoAIyA/AC2wKgAjMD2QJIAzYD3QKrAhIDqgIFAzQDBQPcAjQDNQPxAqACoALfAk8DoAJPAzUD3wLyAk4DEwPdAhID3QITA6sC/ALyAvMCOgPOAiMD0AKvAiQDJAOvAr8CoQIlAzwDzQI7A70C0gI8AycDJwM9A+QCFgMHAxcDBwMpAxcD/gIaAyoD9gL+AkADQAMrA/YCpwIsAxsDHAPWApIC1wILAwwDHgMNAw4DIQOdAqkCuAK5AuwC1wIMA8sCugJGA6kCuwIwAzEDqQIQAyEDMwMyA9sCYQMRA8wCEwMSA6sCNAMiA6oCEQNhA6sCoAI1AzMD3ALxAkkDNgNOA0gD8gLfAk8D8gL8AjcDWAP8AhMD8gI5A98C8gI3A0sD8gJLAzkDBgMUAzoDJAO/AiYDzgI6AyYDzQL9AjsD5AI9A/QC5AL0AtQClgLUAvUCQAP+AioDGgPmAlYDQQOmAhsDHAOSAh0DHAMdA9YCLQNDAy4DLwPJAg8D6wK4AuwCywIMA+0CqQJGAyEDugIyA0YDIQMQA7oCMgO6AhADIAMxAwMDMgMzA/ACqwJhAxMDNQOgAk0D3AJJAzQDNQNNA/EC8gI2A04D/AJbAzcD/AJYAzcDSwM3A1sDBgM6AyMDzwIUA80CzwIGAxQDJAMlA9ACzQIUA/0COgP9AhQDJwNMAz0DPANUAygDPQMoAz8D1AL0AuUCVAM/AygDBwOiAj4DBwMXA6ICKQOiAhcDPgOiAv8C5gLCAtUCKwNCAwkDxQIKAwID+AL6AgIDLgNDA0QDEAMhA0YD8AIzA6ACSQPxAk0D3wJOA08D8gJPA04DWQM4A98C3wI5A1EDOANQA98COANKA1ADOQNbA1EDOQNLA1sDOANZA0oDFQMGA88CJwM8AyUDJwMlA1wDKAM9AzwDVAM8A10DPQM/A14DXwNVA9UCPgP/AgAD9QLlAl4D5QJVA9UC5QLVAsICCAPmAtUC5QLCAvUCCANWA+YCQQP/AqYCMgMQA0YDMQMwA1cDYQPMAkcDTQOgAjMDSQNjAzQD8QJQA0oD8QJKA1IDUgNKA1oDWQNaA0oDFQNTAwYDJgM6AyQDTAMnA1wDXQM8AyYDPQNMA/QC1QJfA/4CVgMIAxoDQAMqAysDQgMrAyoDAgP6AgoDHQMuA/kC+QIuAwsDQwNgA0QDIQMQA/sCVwMDAzEDEwM3A1gDUANPA98C8QJSA0kD8QJNA1AD3wJOA1kDUQNOA98CUgNaA2QDJAM6AyUDPAMlAyQDFgM7AxQDOwMWAxcD/QIYAyYDJwM8Az0DXQMmAxgDKANUA10D9AJVA+UCCQP5ApACHAMKAy0DLgNEAwsDIQP7AmIDDANEA+0CMwM1A00DSQNSA2QDUANNA08DWQNOA08DZANaA2YD/QIkAzoDJgMkA/0CPAMkAyYDPQNeAygDKANeAz8DKgMaA2UDDQMKA/oCLgNEAy0DRANDAy0DDAMLA0QDEAM1AzIDEgM3AxMDTQM1A08DFAMVAxYD9QJ0A+YC5gJ0A1YDZQNCAyoDRANgA0UDaQNwA2ADJwN8A0wDFgM7AwcDXQMmAygDTAN8A/QCBwM7AxcD/gJfAwgDQgP5AgkDDQMCAwoDDQP6AgIDCgMNAxwDWQNPA1EDWQNRA2sDUQNbA2sDKAMmAzwDVQP0AmwDVQNsA9UC5QLmAggDCAPVAuUC1QIIA18DXgP1AuYCQgMdA/kCHAMtAx0DLgMdAy0DDQN1AxwDdQMNAx4DYgNoAx8DHgMOA4oDHgOKA2kDRANFA+0CRQPtAncDYANwA28DYQObAxMDTgNRA08DWgNPA1kDZANmA3sDewNmA1oD5QJeA+YCcwP1Aj8DLQN+Ay4D+gINAx4DHAN1A3YDHAN+Ay0DHgMOA/oCHwNoAzADdwNFA2ADbwN3A2ADeANHA+0CagN4A28DbwN4A3cDRwN4A2oDRwNqA28DYwNJA3kDEgNOAzcDNwOcA1sDWgNkA3sDegNZA1EDFQMWA4IDPAMmAyUDFgMHA4ID9AJ8A2wD5QJyA3wDcgPlAtUCPgP/AoMDPwP1Al4DCAOEA/4C/wJBA4UDpgNtAxsDHAN2A34DiAN1Ax4DHgNuA4gDfwNgA0QDYgP7Ah8DeAPtAncDcAOLA28DRwObA2EDIgM0A4wDNANjA4EDYwN5A4EDTgOOAzcDTwOeA1kDTwNZA3oDNwOOA5wDkAMWAxUDPQN8AycDBwM+A3EDPQNeA3wDfANeA+UCbANyA9UChAOjA/4ChgOFA0EDAAP/AoUDKgMJA0IDLAOmAxsD+gKoAw0DbgMNA6gDHgMNA24DLwMPA4cDdQOIA3YDuAMMAwsDAwOHAw8DRAMMA0UDdwN/A0QDigNuAx4DaANiA4kDYgMfA4kDHwP7AoADjAP7AiIDmwONAxMDngNPA7oDZANaA54DUwOPAwYDUwMVA5ADUwOQA48DqwMGA48DBgOrAzoDFQMUA5ADkAMUAxYDJAMlAyYDkQMkAyYDJwMlA5IDgwNxAz4DcgNsA3wDswP+AqMDKgP+ArMDVgOTAwgDhQOkAwADVgN9A5MDGgNCA2UDQgMaAyoDQgMJAx0DHQOnAxwDpwMdA5YDAgMNA5UDHQP5ApYDLwOHA7cDLgN+AwsDRQMMA7gDdwNEA0UDMANoA5cDiQMfA5gDDgNuA4oDlwNXAzADAwNXA5kDqQOaAwMD+wIQA4ADbwObA0cDgAP7AowDgQOMAzQDngNaA1kDFQOCA5ADJAOfAyUDJQOfA5IDcQOCAwcDPQMnA7ADsQM/Az0DhQODA/8CCAOTA4QDQQNtA4YDCQMqA84DQQMbA20DlAOTA30D+QIdAwkDlQMNA7YDDQN1A7YDAgOoA/oCLwO3AywDfgO4AwsDHgNuAw4DiQOYA2gDVwOXA5kDaAOYA5cDAwOaA4cDmQOpAwMDqgOAA/sCiwNwA2ADbwPCA5sDwgPDA5sDmwPDA40DEwONA1gDYwNJA4EDugO7A54DYwNJA2QDUQNbA3oDOgOrA/0CqwOsA/0CJAORA70DJAO9A58DrAMmA/0CnwOuA5IDsAMnA5IDPwOxA7IDogNyA+YCogPmAuUCPwOyA/UC5gJyA4QD5gKEAwgD9QKiA+UCpAOFA4YDzgPdAwkDpwO0A6UDlgP5AgkDHAOnA8EDLAO3A6YDfgN2A7gDRQO4A3cDYAN/A4sDiwPCA28DwgPiA8MDjAOBA4ADgQPSA4ADSQN5A4EDYwNkA50DYwOdA3kDegNbA5wDZAOeA50DqwOPA9UDkAOCA7wDrQO8A4IDrAOrA5EDJgOsA5EDnwPIA64DPQOwA7EDrwOhA6ADsQOiA7IDsgOiA/UCzgMqA7MDswOTA6UDpQOTA5QDswOlA7QDlgMJA90DpwPNA7QDHAPBA3YDdgMKAxwDAgOVA6gDqAOVA3UDiAP0A3YD0AOIA24DlwOYA4kDfwNvA4sD0gPEA4ADjQPDA+MDjQPjA1gDWAOOAzcDxgOPA5ADjwPGA9UDvAPGA5ADrQPGA7wD6QPGA60DxwOgA8gDkgOuA9cDvgOvA6ADrgPIA9cDsAN8A7EDoAOhA8kDfAOiA7ED7AOhAyAEzAOEA5MDpAOGA78DkwOzA8ADswO0A8ADwAO0A80DpwO1A80DpwOWA8EDfgPBA5YDfgN2A8EDzwN+A5YDdQOVA7YDqAN1A24DdgP0A7gDdwO4A3gDbgMCBNADbgOKAwIEfwN3A28D0QOqA4ADxAPRA4ADjgNYA40D0wPSA4ED0wOBA3kDngO7A+QDeQOdA9QDnQOeA+QDngNZA8UDegPFA1kDqwPnA5EDvQORA+cDvQPHA58DxwPIA58D6AO+A6ADcQODA9YD7APJA6EDhAPbA6MDowPbA7MDkwPMA30DhgPcA4UDhQPcAwkEhQMJBIYDzAOTA8ADhgNtA+4DwAPNA84DzgPNA90DdgMNAwoDDQN2A3UDfgPPA+AD8QN1A7YDdQPxA24DhwPyA7cDigMMBLkDgAOqA/YDiwP3A8IDwwPiA+MDeQPUA9MD1AOdA+UD5APlA50DjgMGBJwDngPFA+YDegP8A8UDegOcA/wDqwPVA+cD5wPHA70D6AOgA8cD6AMIBL4DoAPJA8gD1wPIA9gDvgP9A68DywPIA8kDyAPLA9gDogN8A/4D/gPZA6ID7APLA8kDgwOFA9wDywPaA9gD2gPKA9kDfQPMA+0DhAPMA9sDwAPbA8wD2wPAA7MDzgOzA8ADhgMJBL8DvwMJBP8DzQPvA90D7wPNA7UDCwTdA+8D3QMLBJYDlQO2A/AD3gO2A5UDlgMBBM8D3gPfA7YDpgO3AxwEtgPfA/EDdgN+A+AD4AO4A/QD9QO4A+ADuAP1A3gDAwQCBIoDmgOZA/MDbgMMBIoDdwP1A28DDAThA7kD9gOqA9EDiwNvA/cDigO5A+ED9wPiA8ID0gPTA8QD+gPEA9MDFATkA7sDuwOeAxQEjgONAwYE4wMGBI0D0wPUA/oD+wPmA/gD/AOcAwYExgPpA9UD6QOtA4IDggNxA9YDkgPXA7ADgwMHBNYDvgMIBP0DsAPXA3wDfAPXA/4D2APaA9cD1wPaA+oD6gPaA9kDgwPcAwcEcgMaBIQDvwPcA4YD/wPcA78DzAOEAxoE3AOGAwkE/wMJBAoElgMLBAEEzwP0A+ADiANuA3UDdgPgA/QDAgRuA/ED4AP0A/UDiAPQA/QDmgPzA4cDdwN4A/UDmgOZAw4EmQOXA4wDlwOYA4wDmQOMAw4EigPhAwME9wMjBBAE9wMQBOIDxAMFBNEDEQQQBPkDEwTEA/oDEQT5A/gD5gP8A/gD5gPFA/wD1QPHA+cD2QPXA+oD1wPZA/4D7QPMAxoECgT/A78DhgPuAwkEtQPNAwAEtQMLBO8DlQPwA94DtgN1A/AD8QPwA3UDtQMmBAsEAQQLBCYE9APPAwEEtwPyAxwE3wMdBPEDiAMCBG4DAgTxAx0EDASKAwMEhwPzA/IDmgMOBA0EgAP2A5gDwgNvA/UDHwQDBOED0QMPBOED0QMFBA8EIwT5AxAE4gMEBOMD4wMEBBIE4wMSBAYEFASeA+QDFgT4A/wDngPmA+QD1QPoA8cDkAOCAxgEkAMYBBcEkAMXBIIDFwTpA4IDggPWAxgEoAOhAxkE2QPrA6ID6wNyA6IDcgPrAxoEfQPMA6UDpQOUA30D7gNtAyEEbQOmAyEEiAMbBNAD9AMbBIgDDQTzA5oDDgSMAx4EjAOYA/YD9wNvA8IDEAQEBOIDEAQRBAQEEQQSBAQE+gPUAxME+AMWBBEEBgQVBBYEBgQWBPwDFwTGA+kD1QPpA+gD6QMpBOgDGQTHAyQEGQQkBKADGQShAwgECAShA/0DoQOvA/0DygOiA9kDzAPAA6UDtAOlA8AD7gMlBAkEIQQ6BKYDHAQhBKYDAgSIA9ADAgQDBNADDQQiBPMDDQQOBB4EHgSMAzAExAMwBIwDjAP2A8QD4QMPBB8E5QMTBNQDEgQRBAYEEQQWBBUEBgQRBBUEKQQIBOgDxwMZBAgEoAMkBMgDOQQABM0DHQTfAwIELgT0A9ADAwRCBFcEKAT2A9EDHwRCBAME9wPCAyMEBQTEA0UE5APmA2oE/QMIBDMEyAPYA8kD2QPqA/4DBwTcAysEywPsA9gD3AMJBCsEywPqA9oD3AP/AwkEGgQqBDYE7QMaBDYEzAMaBMAD7gMsBCUEJgQnBAEEGwT0AycEAQQnBPQDHATyAz0E0APxAwIE9AMuBPUDLwT1Ay4EAwRVBNADLgTQA1UE0QPhAz8EKATRAz8ELwRYBPUD9QNYBMIDHwThA0IEEwQxBMQDxAMxBEUEBQREBA8EEwTlAzEERgQxBOUDRgTlA+QD+wNbBOYDFwRHBMYD6QPGAzIExwM0BCQEJATXA8gDxwM1BDQEKQQzBAgEyAPXA+oDyAPqA9gD2QP+A2AEyQPYA+wD6gNeBP4D2APqA8sD2QNLBOsD6wMqBBoEwAMaBGEECQQlBAoEwANNBM0DtQMABDkEPATfA94DGwQnBC0EJwQmBDsEZwQCBN8DDAQDBOED8wMiBD4EDQQeBEAEKARBBPYDIwTCAwQEDwRDBOEDBQRFBEQEFwQYBFwEGATWA1wEMgQzBOkDxwMIBOgDMwQpBOkDJARIBNcD1wNIBEkESQReBNcDBwRKBNYD1wNeBOoDBwQrBEoESwQqBOsDKgRhBBoEYQQ3BMADCgR7BHAENwRNBMADJQR7BAoEOARMBGIEzQNNBE8EOQTNA7UDzQNPBAsEzQMLBLUDIQQsBO4DCwRQBLUDOwQLBFAECwQ7BCYE8QPfA94D3gPwA/EDJwRRBC0E3gNkBGYE3gNmBDwEVATxA9AD3wM8BGcEPQTyA1ME8gPzAz4E8gM+BFMELwQuBFUEQAQeBFYEEAQjBAQEDQRZBCIEPwRCBOEDPwThA0MEagRaBOQDWwRqBOYDxgNrBDIESQRIBF8E1gNKBF0E/gNeBGAESwTZA2AE3AMlBCsE3AMJBCUETgRNBDcEIQQ6BCwE3gNlBGQE3gM8BGUEUgQbBC0E8QMCBN8DAgTxA1QEGwQnBNADLgTQAycE0ANoBFQEZwRUBAIE0AMuBGgEAgRUBFcEAgRXBAMEPwThAwMEAwRXBFUELwSLBFUE9gNBBMQDLwRVBFgEWAQEBMIDMARzBB4EgQRDBA8EDwREBIEEMQRGBEUE+AMWBPsD+AN0BBYEdQREBEUEWwT7AxYERgTkA1oEawTGA0cEbAQ0BOgD6AM0BMcDXATWA10E6AMpBGwEYAReBEkESgQrBG4ESwSRBCoE7QM2BCoE7QMqBMwDYQQqBDcEzAMqBBoETAQ4BG8ENwSUBE4EegQ4BE4EewQlBCwEUQQLBE8EJwRQBFEEPARmBGUEUAQnBDsEIQQcBD0EcQTfAwIEGwRSBCcEKAQ/BH0EAwRXBD8EHgRzBFkEIgRZBGkExAN/BIAE+AMRBHQERgSDBEUERQSDBHUEWgRqBFsEFwRcBEcEJAQ0BEgENARtBDUEdgRfBI8EsARJBF8ESgRuBHcENgQqBJEEJQQKBHAETARvBHkElAR6BE4ETQSVBE8ElQRRBE8EUQRQBAsEOgQhBD0ELQQnBFIEPATfA3EEcQQCBFQEDQRWBB4EQgRVBFcEHgRZBA0EMATEA3MErQR+BCIEIgRpBK0EPwSBBEIEPwRDBIEERAR1BIEEggRbBBYERgRaBIMEggR1BIMEawRHBJwEnARHBFwEXARdBI4EMwRsBCkEXwRIBI8ESQSwBF4EXwR2BJAEYARJBEsEbwQ4BHkEeQQ4BHoETQSVBDcEhwSGBGMEYwQtBIcEUQRQBJYEZgRkBGUEcQSIBGMEcQRSBIgEPARxBGcEcQRoBFIEZwRxBFQEUgR8BIgEUgRoBHwEVARoBFcEVwRoBFUEaAQuBFUEfQQ/BHIEqARXBFQEVgQNBEAEVQRCBIsEjASLBEIEVQSLBKoEVQSqBFgEWASqBAQEQARpBA0EaQQNBFkEcwRpBFkEcwTEA4AEEASaBBEEQwSNBIEEgQR1BI0EdQSCBI0EgwRaBIIEWwSCBFoEXQRKBHcENQRtBJ8ESQSxBEsESwS7BJEEkwR2BHgEhQSSBEwEKgSUBDcElAR5BHoETARvBGIEewQsBKIELAQ6BLQEUQSVBFAEYwSGBKYEYwSIBIcEUQSXBCcEZAS1BGYEiAR8BCcELgQnBHwEfARVBC4EfQRyBIkEigRyBD8EPwRXBIoEQQQoBH0EiwSYBKoEQQR/BMQDQgSBBJkEEASuBJoEEQSaBHQEdASbBBYEmwSCBBYEXQSEBI4ENAS5BDUEdwSEBF0ESQSwBLEEkAR2BJMEnwRtBKAEKgSRBLIETAR5BJIElAQqBLIEJQRwBHsEkgRMBLMEogQsBKMELAS0BKMEOASlBHoElQSWBFAEUQSWBJcEhwSIBJYElgSIBJcEPARnBKcEiAQnBJcEZwRUBL8EVwRVBKgEUwQ+BKkEqARUBL8EPgTLBKkEiQRyBIoEigRXBKgEjASYBIsEaQRABLYEaQS2BM0EBASqBJgEBASYBKsEmQSMBEIEjASZBJgErgQQBAQEBASrBK4EmQSBBI0EdASuBJsEdASaBK4EmQSNBJsEawScBI4EXASOBJwEMgSdBK8EMwQyBK8EbASeBK8ESAQ0BI8EbAQzBJ4EuQRtBDUEnwRtBLkEjwSQBHYEXwSQBLAESwSxBLsEkQS7BLIEeQS7BJIEKwQlBKEETATPBG8EYgRvBDgETgR6BJUElQRNBE4EZgQ8BKcEVQR8BKgEPgR+BMEEcwSABLcEQQQoBH8EuAR/BCgEwwStBGkErASABH8EmASZBK4EmQSbBK4EggSbBI0EjgQyBGsEjgSdBDIEbASvBDQENATOBLkENQSfBLkEKwR3BG4EpQQ4BJQEvASmBKQEhwTJBIYEpgSGBMkEOgQ9BLQEtQRmBKcEZgS1BMoEZwS/BKcEiARoBFIEfARoBIgEPQRTBKkEKAQ/BH8EQwR/BD8EQwQ/BMIErAS3BIAErQTBBH4EgQS4BEMEqwSYBK4EaQTNBMMEfwS4BKwEtwTNBGkEaQRzBLcENASvBM4ErwSeBDMEuQSPBDQEhARdBEoEhARKBMQEdwQrBEoEkwTFBJAEnwSgBLoEkgSTBLME0gShBCUEJQQsBKMEzwR5BG8EOAR5BJQEhwSWBNAEtAQ9BL0EtQSnBMoEYwSHBHEEhwSIBHEEZgTKBKcEiASXBHwEqQS9BD0EvwS+BKcEqAS/BIoEKASJBD8E0QS3BMwEPwSMBMIEfwRDBLgEQwTCBIEExgTFBJIEuwTGBJIEuwSxBMYEkgTFBJMEuwR5BLIEeQSUBLIEoQTrBNIEJQSjBNIETASSBM8EegSHBNAElQTQBJYEyASHBHoEhgSkBKYEpASGBKUEyQSlBIYEhwTIBMkEfAS+BL8EvgR8BIgEvwSoBHwEiQSKBPgEPgTBBMsEiQQoBH0EiQSKBD8EPwSKBIwErATMBLcErAS4BMwEmQTCBIwEuQTXBI8EuQSfBNgEsASQBMYEsATGBLEEkATFBMYESgQrBMQEzwSSBHkEpQSUBHoE0ASVBHoEyAR6BKUEyASlBMkE3ASjBLQEogSjBNwEhwSXBIgEwATTBKcE0wTfBKcEwASJBOAE3wSKBL8E3wS/BKcEqASMBOIEgQTUBLgE1ATjBMwEzAS4BNQEmQSBBMIErQTDBMEEjgTmBJ0E5gSvBJ0ErwTnBM4E1QSOBIQEhATEBNUExATWBNUEjwTXBP8EjwT/BJAExATWBNkEugTqBJ8EKwShBMQEugTHBOoEpQTsBKQE7ATbBKQE7QSiBNwE7gS1BKcElwSHBJYEpwS+BN0E3QS+BN4EvgSIBN4E8ATABKcEwATfBNMEqQTLBOEEiQT4BOAEigTfBPgE4gSMBIoEjATkBJkE8QTNBLcEjgTlBOYE8gTOBOcE1QTlBI4E8wS5BM4E2gTpBNkEuQTYBNcEoATHBLoEswTPBJIE7ASlBHoE7AR6BJQE2wS8BKQE7wTuBKcE9wSXBJYE3QTvBKcEtAS9BNwE3gSIBJcE9wTeBJcE8ASnBAkFvQSpBAQFwATwBN8EywTBBOEEigSoBOIE4wTUBBQF5ASMBPkE8QTNBLYEgQSZBPsE5AT7BJkEwQTDBP0E/gTxBM0EBwXDBM0E5QToBOYEzgTyBPME2QTVBNYE6QToBNkEuQTzBNgE/wTXBNgEnwTYBKAEkAT/BMUExAShBNYEoQT0BNYExwTqBPUEeQQBBZQE0gSjBOsEAgXsBJQEowSiBLQEvATbBA8F3gTJBN0EtQQIBcoEpwTKBAgFvQQEBdwE3wSoBIoEqAQSBfkE+QSMBKgE8QT8BLYEBwX9BMME5wSvBOYE5QTVBOgE8wTyBOcE6ATpBOYE5wTpBPME1QTZBOgEoATYBMcEnwTqBNgEoQTSBPQE0gTrBPQEuwQBBXkEuwQABQEFlAQBBQIFowTcBA4FhwT3BJYEtQTuBAgFyQTeBPYE9gTeBPcEqQThBAYF3wTgBPgE3wSLBKgE4QTBBPoEwQT9BPoEzQTxBAcF5gTpBOcE2ATqBMcE6wT0BKEEswSTBMUEkwTPBLMEAQUABQIF6wSjBA4FtASiBNwE2wSlBKQEpASlBKYEDwXuBNsEyQSmBKUE7gQPBQgFhwSGBPYEvwTTBKcEBAWpBAYF0wS/BBoF3wTwBOAEvwSoBBoFvwR8BIsEvwSLBKgEqASLBBsFfAQFBYsE3wQSBYsE4wS3BMwE+wTUBIEEFQXxBLcE/gQHBfEExASEBNYExgSSBAwFxgQABZIEDAWSBJMEDQX1BOoEDQXqBAsFkwTFBAwFkwSSBM8EkgQABbsE6wQOBRgFyATbBOwE7ASlBNsEpQTsBMkEhwT2BMgE9wSHBMgE9gSGBMkEvwSnBO8EvwTvBN0EAwUFBREFBQUDBRAFfAQRBQUF3wTTBBoFGwWLBBIFEwWLBBsFqASLBPkEiwQTBfkECgX7BOQECgXkBPkEtwTjBBYF/QQHBTMF/wQXBdcE2ATqBBwFxgQMBf8EDAXFBP8ECAUPBdsE7ATIBMkE9gTJBMgE3AQZBe0E7wTdBO4EpwQIBe4EAwXeBPYEpwTfBAkFEQXeBAMFEQXdBN4EEQW/BN0EvwQRBXwEqAQbBRoFIwUFBRAFiwQFBSMFiwQjBRsF3wQaBRIF4QT6BCYFCgUlBfsEFgUVBbcE8QT9BP4E/gT9BDMFMwUHBf4E8wTpBDUF1QTWBIQE/wQcBRcF1gT0BDcFHAX/BNgE/wQXBcUExgT/BBcFJwUNBQsFxgQ4BQAFAgUABR0FKQXsBAIFGAUOBSoF2wQgBSwFCAXbBO4ELAXuBNsE2wTuBOwEIQXsBO4E3AQiBRkF3wTwBAkFBgXhBDAFGgUbBREF+QQSBSQF1AQyBRQF2ATzBDUF2AQ1BRwF2AQcBScFJwXqBNgEJwULBeoEHAXqBCgFxgRbBTgFJwUeBQ0F6gT1BCgFJwUoBfUEOAU5BQAFCwX1BA0FAAU5BR0FKQUCBR0F2wQpBSAF7AQpBcgE7AQhBSkFyAQuBfcECAUtBe4E7gQtBSwF9gT3BAMFLwUDBTwFLwUQBQMFPQUjBRAFMQUwBeEE3wRiBRoFGgVWBRIFEgVWBRsFJAUlBfkE4QQmBTEF4wQUBTIF+QQTBeQECgX5BCUF1AT7BDIF+gT9BEAFFQUWBT8F8QQVBf4E1gQ2BdUE1gQ3BTYFWwXGBBcF6wQYBfQE9QQLBScFHwU6BSsFKQXbBOwELAUgBS0FDgXcBCoFyAQpBUYF3ATtBCIFyARGBUcFyARHBS4FIAXuBCwF7gQgBSEFyQT2BN0E3gTdBPYE9wQuBQMF3AQEBSIFOwUiBQQFBAUGBTsFLwU8BRAFEAU8BT0F3wRTBWIF+gQmBUsF+wQlBTIFPgXjBEoF8QT8BEsFFgXjBD4F+gRABSYFPwUWBT4F8QRMBfwEQQUzBf0ETAX9BPEEQAX9BDMF/gQVBU0FMwVBBUAFNAU1BekENAVDBTUFNAXpBOgEJwUcBUQFGAU3BfQEKwU6BR4FIAUpBU8FGAUqBVEFHwUrBR4FLgU8BQMFBgUwBTsFGgURBVMFEQUbBVUFPQVUBSMFEwVJBVcFWAUyBSUF+QTkBFkFEwVmBeQE8QRLBUwF/ARMBUsF/QRMBUEF/gRCBfEE1QRaBegE6ARaBTQF1QQ2BVoFQwUcBTUFRAUcBUMFNwUYBTYFKQVQBU8FGQUiBe0EIgU7BRkF3wRTBfAE3wQaBVMFUwURBWIFYgURBVUFGwUjBUkFIwVUBUkFJAVYBSUFSQUTBRsFSQVUBVcFWQUlBfkEZgUTBVcFMgVKBeMEZgVZBeQENAVnBUMFZwVEBUMFHAUoBScFTgVcBUUFHgU6BScFXQVcBToFXAVdBUUFUQVzBRgFUAUpBR0FOgUfBR4FIgUqBdwEKQVHBUYFIAUpBSEFRwVeBS4FXgU8BS4FOwVtBRkF8ARTBVIFYQVUBT0FGgViBVYFVQUbBWMFVgVjBRsFWAWEBTIFPwVNBRUFNAVaBW8FWgU2BWgFNAVvBWcFWwUXBTgFHAUnBU4FRQVqBU4FRQU4BWoFTgUnBToFXAVOBToFawU4BWoFOAVrBTkFHQU5BWsFHwV9BWwFZQUhBV4FIQVfBV4FIQVIBV8FXwVIBS8FLwVeBV8FXgUvBTwFOwVgBW0FPQU8BS8FYwViBVUFYgVjBVYFJgVLBXgFSwVMBYkF/gRNBUIFWgVwBW8FNgVwBWgFcQVwBTYFaQUcBU4FFwUcBWkFagU4BRcFTgVqBWkFGAVyBTcFUAUdBWsFHwVcBToFHwVsBWQFkgVHBSkFRwWSBV4FSAWABV8FOwUwBWAFYQV3BVQFdwVXBVQFJgVuBUsFhgVmBVcFeQU+BUoFhwU+BXkFJgVABW4FbgVABXsFiQWKBUwFWgVoBXAFZwVvBXAFRAVnBYsFNgVyBWgFaQVqBRcFNgU3BXIFZQUgBSwFkgVlBV4FdQWABUgFLwVfBYEFLwWBBT0FPQWBBWEFJgV4BW4FdwWPBVcFJQVZBXoFhgV6BVkFbgV4BUsFWQVmBYYFPwWIBU0FiwVnBXAFRQVcBWoFIAWSBSkFgAWCBV8FXwWCBYMFMQV2BTAFMQUmBXYFJQV6BYUFSgWEBXkFVwWPBXoFSgUyBYQFVwV6BYYFPwU+BYgFRAVOBScFJwWQBR4FUAVrBWoFHwV9BVwFUQUqBX8FZQUgBSkFbAV9BXwFfgUsBWUFKgUiBXQFIAVlBZIFIgU7BZQFIgWUBXQFXwWDBWEFXwVhBYEFdwVhBYMFbgV2BSYFWAUlBYUFbgWOBXgFiAU+BYcFNgVoBXEFRAWLBU4FkAVOBR4FTgU6BR4FGAV/BZEFOgVcBX0FOgV9BR8FGAVRBX8FUAWSBSkFKQWSBWUFfgVlBZIFKgV0BX8FIQVlBV8FMAV2BY0FdgWmBY0FnAV6BZ4FlQVYBYUFlQWFBXoFigVMBUIFQgWWBYoFcAVxBasFJwVOBZAFUAVqBaEFUAWYBZIFmAV+BZIFkgWjBWUFdAVgBYwFmgV0BZQFlAU7BTAFdgWdBaYFbgWOBZ0FegWPBacFhAVYBbQFWAWVBbQFtQWKBYkFewVABYoFxgWWBYgFiAWqBcYFiwWQBU4FiwVwBasFcgUYBZEFXAVOBaAFagVcBaEFUAWhBZgFmAW6BX4FfwV0BaIFkwV+Ba4FowVeBWUFkwWZBX4FkwWbBZkFdAWaBWAFpAVgBZoFgwWCBYAFjQWUBTAFpQWNBaYFnQV2BW4FeQWEBbIFxwVxBWgFiwWrBZAFlwWfBa0FnwWgBawFuAWRBX8FXAW3BX0FfAV9BbcFoQW6BZgFogV0BYwFowVfBWUFgQVfBaMFgAVfBYMFmgWUBY0FpQWmBaQFngV6BacFjwV3BacFvAWdBY4FswW+BZwFbgWoBZ0FtAWVBcMFlQV6BYYFqAVuBXsFiAWHBaoFewWKBakFqQWKBbUFaAW/BccFcgW2BWgFqwWfBZAFxwWrBXEFkAWfBawFkAWsBU4FkQW2BXIFrQWfBasFoAVOBawFtwVcBaAFXAWgBaEFrgV+BboFogW4BX8FuQWwBXwFuwV8BbAFkwWuBZkFowVlBX4FowV+Ba4FowVlBa4FmQWbBa4FmwWxBa4FmgWNBaUFmgWlBaQFwgWyBYQFvgV6BZwFwwWVBcsFhgXUBZUFegW+BYYFtAXDBcQFaAW2Bb8FkQW4BcAFrwWiBYwFyQVfBYEFgwVfBckFggWDBckFygVhBYMFYQXKBXcFngWzBZwFpwV3BcoFvQXLBbMFswXLBb4FtAXEBYQFeQXTBYcFhwXTBcUFhwXFBaoFoAWXBXwFfAW3BaAFfAW5BX0FmQWuBX4FgQWjBcgFgQXIBckFjQWmBZ0FygWDBckFwQXJBYIFswWeBb0FlQXUBcsFiQW1BcwFxgXVBZYFigWWBbUFvwW2BasFvwWrBccFkQXABbYFfAWXBbkFrgWxBc4FjAVgBaQFsQXIBc4FyAWjBa4FpgWNBaQFjQWdBaUFxQV5BYQFxQXTBXkFwgXFBYQFhAXEBcIFxQXTBaoFxAXFBcIFvgXUBYYFewWpBagFqgXVBcYFlwWgBdwFuQW3BX0FdAWaBaIFyAWuBc4FzwXRBdAF1gXRBc8FpQWkBY0FpwXKBe4FxAXDBcIFywXUBcMF1AW+BcMFlgXVBbUFtgXXBasFnwXcBaAFrQXdBZ8FlwXcBbkFugWhBd8FtwW5Bd4FrgW6BeAF4AWZBdgFrgXYBZkFdAWMBZoFmgWMBaQFyQXuBcoF2gWdBbwFyQXBBe4FvQWeBfAFvQW+BcsF1wW2BcAFwAXoBdcFqwXXBa0F3gX0BeoF3gW5BfQFugXfBeAFtwXeBaAF4AXYBa4F0AWuBeUF5AXjBc8FzwXmBdYF2QWlBZ0F2QXaBbwF7QXZBbwF2gXZBZ0FngWnBfAFvQXvBb4FwwXnBcIFqQW1BfEFqgXyBdUFtQXVBfIFnwXdBdwF1wXdBa0F3gWhBaAFoQXeBd8FuQWwBfQFsAXNBesFogWaBeIF0AXRBeUFyAWxBfsFyAX7BckF1gXmBdEFwQXJBewFzwXjBeYF0gXvBb0F5wXDBf0FwwW+Bf0FqAWpBfgF8wW1BfIFwAW4BegF6gXfBd4F6gXgBd8FuAWiBfoF2AXgBeoFsAXhBfQF4QWwBesFmgX1BeIFsQWuBeUF5AXPBdYF5AXWBeMF2QWaBaUF1gX2BfwF7gXsBckFwQXsBe4FpwXuBfAFvQXwBe8F7wXSBdsF+AWdBagFDAbEBcIFxAUMBsUFqQXxBfgFxQUABqoF1wXoBd0FuAX6BegFuQXcBfQF2AXqBQEGrgXYBc4F5QWuBc4F2QX1BZoF+wXuBckF2gXtBbwFvgXvBf0FtQXzBfEF1wUHBugF3QXoBQcG4QXqBfQF0QXlBQoGHAYKBuUFzgUcBuUFsQXlBfsF5gXjBdEF2gW8BQsG4wX3BfwFwgUEBgwGwgXnBQQGxQX/BQAGDAYABv8FAAb5BaoF8gWqBQYGqgX5BQYG6AX6BRcG6AUXBgcGCQbpBd0F4QUBBuoF4QXrBQEGEgbRBeYF+wUCBu4F7AXuBSIG1gX8BeMF2wXmBRIG5gXbBRQG/QXvBRUGBAbnBQ0G5wX9BQ0G/wXFBQwG/gUFBg4GDwb5Bf4F/gX5BQUGDwYQBvkFDwbyBRAG3AXdBQgG3AUYBvQF+gWiBeIFAgb7BeUFIgbuBQIG4wUSBtEF5gUUBhIG2QXtBdoFEwb8BeMF4wX3BSMG4wUjBhMG7gUiBvAFAwb3BR4G2wXvBRUGnQX4BdoF/QUVBg0GDgb/Bf4FBQYABg4G8QUWBvgFBQb5BQAG+QUQBgUG8gUkBvMFGAbcBQgGCQYIBt0F9AUYBuEFHAbOBdgF1gXRBeMF1gUTBvwFCgYCBuUF2QUqBvUF0QUSBgoG4wUTBhIG2wUSBhQG8AUiBhUGFAbbBRUGFQbvBfAFDQYMBgQGIAb/BQ4G8gUPBiQGEAYGBgUGBQYGBvkFEAbyBQYGBwYJBt0FBwYXBgkG4QUYBhoGGQYRBhoGAQYcBtgF4QXrBRoG0QUKBuMF1gXjBRMG9QUqBh0GFQYSBhQG2gUlBtkF9wUeBiMGJQbaBfgF+AUfBiUG/gX/BSAGJgbbBRQG/gUFBg8GAAYMBg4G8wUWBvEFCAYJBhgGFwb6BeIF4gUbBhcGAQbhBRoGAQYaBusF4QUpBgEGGgYpBuEF4wUKBhMGCgYSBgIG/AUhBuMFEwbjBSEG2QUlBioGFAYmBhUGDQYmBgwGDAYmBigGDgYMBigGEAYkBg8G8wUkBhYG4gX1BRsGEwYKBhIG/AUTBiEGEgYiBgIGEgYVBiIGIwYUBhIGIwYSBhMGMQYjBh4GJgYNBhUGHwYvBicGFgYfBvgFDwYFBhAGJAYQBhYGFwYrBgkGGgYYBgkGGgYJBhkGCQYbBhkGGwb1BR0GKQY0BgEGAQY0BgoGHQZDBiwGDgb+BSAGHwYWBi8GDgYoBiYGFwYbBisGKwYbBgkGGgYBBjAGCgYcBgEGHgYtBjkGJgY8Bg4GIAYFBg4GGwYzBhkGGgYwBiwGNgYwBhoGGgYsBjYGKQYaBjQGNAY1BgoGNwYhBhMGQwYdBjgGIwYxBhQGMQYeBjoGFAY7BiYGMQYgBjwGMQY8BjsGHgYuBjoGPAYmBjsGIAYOBjwGJwYQBj0GLgYFBiAGLwYWBjIGMgYnBi8GJwYyBhAGEAYyBgUGMgYWBhAGGQY+BhoGPgYwBhoGMwY+BhkGMAY+BiwGGgY/BjQGNAY/BjUGNwZCBiEGEwYKBjcGIQY2BkIGHQYqBkEGHQZBBjgGOwYUBjEGHgY5Bi4GJQYfBi8GHwYnBj0GLgYgBjoGPQYQBgUGPQYFBi4GPgZABiwGGgYwBj8GNgYsBkAGHQZDBkEGNQY3BgoGIQZCBhMGPQYvBh8GIAYxBjoGHQZFBjMGHQYzBhsGPwYwBjUGNwY2BkIGOAZBBkMGEwZCBiMGHgY6BjkGHgYjBjoGIwZCBjoGQQYqBiUGQQYlBkQGJQYvBkQGPgZFBkAGHQZBBkUGMAY2BjcGMAY3BjUGOQYvBj0GOQY9Bi4GQgY2BkAGOQZBBkQGQQY5BjgGQgY5BjoGRAYvBjkGMwZFBj4GQQY4BkYGQgZGBjgGOAY5BkIGRQZHBkAGRQZBBkYGRQZGBkcGRwZCBkAGRgZCBkcG7QFWAusB8wEnAnAC8wFwAlwCcAInAj4CnQJoA5wCnQIhA2gDHwMhA2IDIQMfA2gDmAMfA4ADmgOpA5kDPgQiBH4EQgVMBfEETQWWBUIFTQWIBZYFigVABUEFQQVMBYoFSQZIBkoGSgZIBksGSgZNBkkGSQZNBkwGTgZJBk8GSgZLBlcGSQZOBkgGSAYkABAASAZOBiQATgZRBkgGSAZRBksGTQZKBlIGVgZSBkoGVwZWBkoGUQZXBksGVQZUBk4GTgZQBlUGUgZRBk4GSAYQAEsGXQZMBk0GEQBLBhAAVwZRBmAGUwZUBlUGUAZTBlUGTgZUBiQAUAZOBk8GKQAkAFQGSQZMBlwGSQZcBloGWwZcBkwGXQZeBlsGEAAkAFEGEABRBhEAXQZNBl4GTAZcBk0GUgZWBl8GYAZWBlcGVgZgBlkGUwZQBmEGTwZJBlAGWwZcBl0GXQZcBkwGTAZNBl8GUgZfBk0GUQZLBhEAXAZfBk0GWQZfBlYGSwZgBlEGXgZNBlgGXwZiBk0GWAZNBmIGWgZQBkkGTgZRBiQAYAZRBlIGXwZZBmIGSwZXBmAGZwZYBmIGKAApAFQGbAZPBlAGXAZMBl8GVwYYAGAGVwZRBhgAGAAmAGAGZgZeBlgGWwZeBmMGJAAYAE4GWwZeBmUGZgZlBl4GUgZoBmAGbQZSBlEGUQZgBm0GWAZnBmkGdwZhBlAGWgZ3BlAGUQAoAFQGcAZUBlMGYwZrBloGWgZcBmMGUAZsBngGWwZjBlwGcQZcBmMGJABkBk4GZAYkAEYATgYYAFEGWwZlBnkGbQZoBlIGZgZYBmkGaAZtBmAGYAYmAG0GbQZqBlkGWQZgBm0GUwZ2Bm4GdwZTBmEGcAZTBm4GUQBUBm4GJABGABgAQQAYAEYAeQZlBnMGaAZtBnIGdAZzBmUGZgZ0BmUGJgBcAG0GYgZZBmoGWgZvBncGcAZuBlQGWgZQBngGaQZ6BmcGYgZqBmcGdQZ2BlMGdQZTBncGdwZvBnUGWgZrBm8GewZbBnkGewZjBlsGewZlBnMGcwZ7BnkGhgZzBnQGZgZpBnQGagZtBn8GbgZgAFEAbgZ4BnAGeAZ9BnAGewZzBoQGegZnBn4GcwaGBoQGhQZtBnIGbwaDBnwGbgZwBn0GawaDBm8GYwaJBmsGYwZxBogGRgB4AEEAmgZ6Bn4GaAZ+BnIGZwaABn4GfwZ+BoAGZwZqBoAGgAZqBn8GaQaHBnQGgQZ2BnUGgQZ1BoIGYABuBoEAggZ1Bm8GhQBGAEQAawaJBoMGiAaJBmMGewaJBmMGewaEBpEGhQZyBn4GcgaFBpIGfgZ/BoUGbQZcAIUGhQZ/Bm0GhQZcAG4AZwaHBmkGgQaCBosGjAaLBoIGggaNBowGbgaOBoEAggZvBo0GjgZ4Bm4GfQZ4Bo4GbgZ9Bo4GhQB4AEYAiAaDBokGeABkBkYAewaPBokGRgBkBpAGYwaPBnsGQQB4AGYAkQaEBpsGfgZoBpIGaAZyBpIGhAaGBooGigaGBpMGdAaTBoYGgQaXBnYGgQaWBpcGlwaYBnYGgQaLBowGdgaYBm4GfAaNBm8GfAaDBo0GYwZ7BmsGZAZ4AJAGiQaPBmMGgAZnBnoGhAaKBpsGkwZ0BpQGdAaHBpQGlQaUBocGhwZnBpUGiwaWBoEGlwaWBpgGgQCYBpYGjAaNBosGgQCOBpgGRgCQBoUAkAZ4AIUAjwZ7BpEGoAZnBoAGgAZ/BqAGigaTBpQGlQZnBqAGmQahBowGjAaNBpkGjgZuBpgGnAaLBo0GmQaNBp0GnQZrBpkGogZrBp0GnQaNBoMGmQZrBqMGfQaOBqgGawZ7BqMGjwajBnsGawaiBoMGeACFAH0GfQaQBngAfwaaBn4GfwZ6BpoGngafBpoGegZ/BoAGnwakBp4GmgafBoAGnwakBoAGpQaABqQGigaUBqYGiwaYBpYGmAaBALkGnQaZBq0GmQajBq0GnQaDBqIGqAauBn0GqgaRBpsGmgalBqsGmgaABqUGpAagBqUGpAaVBqAGrAaABn8GoQaZBp0GmAa5Bo4GrQCBAJgGmAanBq0AmAaOBqcGogazBoMGkAZ9BoUAkQbDBo8GuACpBpAGkAZ4ALgAmwavBqoGkgaFBn4GhQZuANUA1QDEBoUGxwaUBqQGhQbEBn8GsQaKBqYGtAaUBscGpQagBoAGpQaABqwGpAaUBpUGtAamBpQGgQa3BpYGoQa4BowGjQaMBp0GnQatBrIGjga5BqcGjQadBr0Gjga/BqcGjgaoBr8GqAauBr8GgwazBr4GjwaJBsAGfQaFAK4AuACFAH0GuAB9BqkGsAarBqUGrAawBqUGsQbGBooGxAasBn8GsQamBrQGtQaBBrYGtQa3BoEGgQCWBrkGuAahBroGnQayBqEGjAa9Bp0GjAa8BrsGvAaMBo0GnQa9BqIGjQa9BrwGjganBqgGswa9Bp0GqAanBq4GnQaiBrMGogaDBr4Goga+BrMGfQauAKkGywbDBo8GkQbLBo8GqgbDBpEGzAaqBq8GzAbBBqoGqgbBBsMGrwabBsUGmwaKBsUGsQa0BscGtQa2BrcGuAbIBowGjAa7BtYGsgbOBqEGjAa7Br0GsgatBtcGpwa/Bq4GyQajBsoGowaPBtEGqQauALgAyQaPBpEGwQaRBswGwwbMBpEGzQbMBq8GrwbFBs0GrAbEBrAGigbGBsUGxgaxBscGgQbVBrYG1wCqAN4AyAa4BroGqgDXAIEAlga3BrkGyAa7BowGzga6BqEGjAbWBoEGrQbPBtcGvQazBqIG0AbPBqMG0AajBskGrQajBs8G0QbKBqMGwAbRBo8GygbJBpEGjwbRBssGwAaPBssGkQbDBssGwwbBBtIGngaaBqsG1QC7AMQGngalBqQGtgbVBrcG3gCqANQGyAa6BtMG1AaqALcGgQbWBtUGqwCBANcAvAbWBrsGzgayBtcG0AbXBs8GygbQBskGrgCtAPwA0QbABssGyQbRBo8GzAbDBtIGqQa7ALgAngarBqUG2QbTBroG1QbWBsgGqgCrALkG4gbWBrwGvQazBrwGswbmBrwGyQbKBtEGygaRBsEGuACpBtgGwQbDBpEG0gbqBswGqQbYBrsAwQbMBtIGsAbEBt0GxAa7AOUAxAblAN4GxgbNBsUGtgbVBvoGtgbUBtUG1QbfBvoG1QbIBt8G3gAEAdcAyAbhBrsGtwbVBuAGqgC5BrcG4Aa5BrcGuwbIBtYG1gbiBrsGpwa5BqsAvQa7BrwGuQbgBvAGuQbwBqcGvAblBuIG0AbjBs8G5Qa8BuYG5wanBr8G/ACtACEBrQDnBiEB5watAKcGygbaBvIG2gbKBsEG2AbxALgAwQbMBuoGwQbqBugGwgbYBqkG0gbqBtwGCAfHBqQGsAasBqsGzAb1BsEG3QbEBt4GpQarBqwG6wbNBsYGtgb5BtQG7QbeANQG0wbfBsgG4QbIBt8Gtwa5BvsGzgbuBroGugbuBu8G1wbPBgQHpwarAK0A8Aa/BqcGygbkBtAGvwbwBvEG5wb8ACEBrga/BvEG8QCpBq4A2wbyBsEG8gbaBsEG2wbBBugG6QbYBsIG2AblALsA3gblAN0G6wbGBrEGpAbsBscG6waxBvcG7Aa0BscGpAb2BuwGpAalBvYGxgbHBrQGxga0BrEG1Ab5Bu0G2QYCB9MG+QbTBgEHtgb6BvkG2Qa6BgIH7QYEAd4AtwbVBtQG7gbOBgMHuwbhBrwGuwbiBuUGBgfwBuAGpwatAPAGvQa8BvwG4wbQBuQGvQb8BrMGygbyBgcHswb8BuYG8QbnBr8GqQbxANgG5QDYBqkGqQa7AOUA3AboBuoG6Qb0BtgGzAb1BuoGzAbNBvUG/wb1Bs0GxAbeBqwGzQbrBv8G9gb+BgoH6wb3Bv8G9galBv4G9waxBgAHsQa0BgAH+AYBB9MG+AbTBgIH0wb5Bt8GDQf5BvoGAge6Bu4G+wbgBrcG1wYDB84GBAcFB9cGAwfXBgUH5QbhBrsGBAfPBuQG5Qa8BuEGBgfxBvAG3AbzBugG3gbdBv0G/QasBt4GCgf+BqUG/QalBqwGpAbHBgsHDAfHBrQG/wb3BgAH7AYMB7QG7Qb5Bg0H7QYTBwQB7gYSBwIH+gbfBuEGuQanBvsG7wbuBgMHpwbwBvsGBAfkBgUHzwbjBuQGrQAhAfAGBwfkBtAG0AbKBgcH8gbkBgcH8gbbBugGJgfoBvMGDwcmB/MGwQbMBtsG3QbYBvQG5QDYBt0G9Ab9Bt0G9Qb/BgkHpQb9Bv4GxwYMBwsHxwYLB7QGDAfsBvYG+QYBB/gG+AYCBxEH3wb5BvoGEwftBg0HBgfgBvsG5gb8BrwGFQfjBhQHFAfjBuQG8gYOBwcH8gboBg4HDgcVBxQH2wbMBh4HwQboBswGGQceB8wG9AbpBhgH6gb1BhAH9QYJBxAHCQf/BhoH/wYABxoHtAYLBwwHDQcjBxMHHAf6BuAGHAf6BuEGHAfhBh0HFAfkBg4HBwcOB+QG8QYWB+cG8QbpBhYH2AbxABcHLwHxANgGzAboBuoG8QAvAeUAGAcnB/QG6gYfB9wGzQYZB8wG/wbNBswGEAcJBxoHGgcABwkHAQcbB/kG7Qb5BhsH7QYbBx8B7gYtBxIH+gYcBw0HBQckB+4GAwcFB+4G+wbwBgYH5QbhBjcHIQH8APAG5wYlB/wA6AYmBw4HFAcVBw8HDgcmBw8HDgcPBxUHzAb1Bv8G9AYzB/0GGQfNBiAH/wYgB80GIAf/BvcGIAf3BikHAAe0BgwHAAcMByEHsQYAByoHGwcBB1EHIgc2B/gGLAdUByIHIgf4BiwHAgcsB/gG+Qb4BkQH7QYfAQQB+QZEB0UH+QZFBw0HLgcSBy0HJAcFBy8HLwcFB+QG8AYlB+cG5QY3B+YG8AbnBvEG8QbnBukGFgclB+cGFwf8ACUH/AAXBy8B8QAvARcH6AYPB/MG6AbbBiYHLwHYBhcHGAfpBjsH3QbpBtgG6gYQBx8HGQcgBzoHJwc8B/QG/QYoB/4GNAcgBykH9gYKBz4HDAdAByEH9wYABzUHAAcqBzUHAAchByoHQwcBB/kGUQdCBxsHNgdEB/gGKwf5Bu0GGwdFAR8BNgciB1QHKwdDB/kGAgfuBiwHHwFAAQQB4Qb6BuAG+gYNB+AGHQffBuEGJActB+4GLwfkBkYH4QYdBzcH5AYwB0YH8AZWByUHMQcwB/IGMAfkBvIGDgfyBuQG5wYlB+kGFQcUBzgHFAcPBzgHJgcPB+gG2wYyByYH2wYeBzIH6AbzBuoG6Qb0BjsHGQc6Bx4H6QbdBvQGLwE7AeUA5QA7Ad4G9AbdBt4GMwf0BjwHCgf+Bj4HCwdYBwwHKAf9BjMHQQf3Bk4H/gYoBz4H9wZBBykHCgdMBz4HIAc0Bz8HDAdYB0AHUQdDB0IHGwdCB0UBVAdSBzYHRQFXAR8BQwcrBw0HRQErB1cBEwcrB+0GLAfuBi0HHwGhAUAB4QbgBhwH4AYNBxwHHAcjBw0HJAcvBy0HLQcvB0cHLwdGByQHRgcwBzEH5AbjBhUHOQfpBiUHFgfpBjkHOQclBxYH8wbcBuoGHgc6B0oHMgceB0oHGAc7BycH6gbcBhAHOwf0BicHGQdLBzoHOwE9B94G9QbqBgkHPQczB/QG9AbeBj0H9wb/Bk4H9wZOBwkHAAf3BgkHPgdfB/YG9wY1B0EHWQdBBzUHTwdZBzUHNQcqB08HKgchB08HUAcBB0QHQwcrB0IHQgcrB0UBNgdTB0QH7gYSBy4HIwcrBxMHHwFXAaEBRQccBw0H8AbnBlYH8Ab8AOcG5AYVBw4HMQfyBlcHBwcOB+gG8gbbBlcH8gYHB9sGJQc5BxcHSQc9BzsBGgcJB+oGOgcgB00HTQcgBz8HTgcaBwkHTAdfBz4HXwcMB/YGIQdAB08HZwdbB1AHAQdQB1sHAQdbB1EHAQdDB0QHKwdyB1cBVAcsB2EHRAdcB0UHJAcsBy0HJAdhBywHUwdcB0QHLgctB+4GoQFXASMHIwccB3MHRgdVBy8HHQc3BxwHggccBzcHRgcxB1UHSAdVBzEHDgcUByYH6AbbBgcHSgdkB9sG2wZkB1cH6gYQBxoHegc8BycH/wYJB04HXgdNBz8HNAcpB0EHDAdfB1oHWgdABwwHXwdmB1oHTwdAB3wHRAdDB4sHUwcuB1wHKwcjBw0HVQdoBy8HYgdVB0gHLwdoB0cHJQdWB+cGSAcxB2MHMQddB2MHXQcxB1cHDwcmBxQHFwc5BxYHMgdKB9sGugEvARcHOwEvAUkH3AYfBxAHMwc8B3oHTwdBB1kHYAdFAUIHQwdRBysHcgeOB1cBVwGOByMHaQdIB2MHFgdlBzkHZAdKB3QHFwcWB2UHSQcvAWsHugF1By8BLwF1B2sHbQc6B0sHPQdJB3cHMwc9B3cHJwdsB3oHWAeFB0AHbgdeBz8HNAdBB30HMwc+BygHPwc0B24HQAeFB3wHNQc0B0EHNAc1B28HNQdZB28HYAd+B0IHiwdQB0QHngeLB0MHQwcNB54HYQckB1QHDQcjB3MHjgehASMHDQdzBxwHgQckBy8HkAccB0UHVQdiB2gHYgdIB2kHYwdqB2kHgwdjB10HugEvAYUBFwd1B7oBdQcXB2UHSQe8AWsHSQdrB3cHMwd3B3gHbAd5B3oHeAd6B3kHegd4BzMHTQdeB3YHPgd7B0wHTAd7B18HNAdvB4gHfwdnB4kHZwd/B1sHUQdgB0IHcAdCB34HQgdwB0UBVwFFAc4BNgdSB4AHgAdxBzYHNgdxB4oHQgdFAXIHVwFyB0UBNgeKB1AHNgdQB0QHRAcuB1MHRAeLB1wHRAdcBy4HJAeBB40HRwdVBy8HRQdcB5AHYgdpB2gHHAeCB5EHFgc5B5MHlAddB2QHgwddB1cHSgd0B5YHOgd0B0oHdgc6B4QHbQeEBzoHbAeXB3kHTQd2BzoHdgdeB24HQQdOB30HmAeFB1gHhgczB3gHPgczB4YHWAdAB5gHZgdfB4cHWgdmB4cHWgeHB6QHWwdgB1EHUAeJB2cHcAfEAUUBUAeLB4oHigeLB5sH1wFyB1cBjAeAB2EHgAdSB2EHVAdhB1IHjAdhByQHjAckB40HjQeBB48HgQdVB48HgQcvB1UHjgejAaEBHAeQB5EHkgeFAagHOQcXB2UHVwdkB10Hlgd0B3YHdgd0BzoHawd1B7wBZQd6B3UHdwdrB3gHNAd9B24HXwd7Bz4HPgeGB5kHQAeFB5gHQAejB4UHQAdaB6MHNAeIB24HfwdgB1sHYAd/B34HigeJB1AHmweuB4oHUQdCBysHcgcrB0IHVwGhAdcBngcNB1wHDQccB1wHkAdcBxwHRwdoB1UHRgcvBzEHoAcxB5QHXQeUBzEHMQcOB10HZQeTBzkHZAd0B5QHZQcWB5MHhAd0B5YHhAeWB3YHegdrB3UHegeqB2sHPgeZB18HhwdfB6IHmQeiB18HfAe0B08HWQdPB7QHbweaB4gHbwetB5oHbwdZB60HTwelB1kHfwe3B34HfgeuB3AHcAd+B8QBnQdxB4AHnQecB3EHwwebB4sHjAedB4AHpgecB50HnQfFB7kHXAeLB54HjQePB4wHowGOB68HnwePB0YHRgePBy8HRgcxB58HrweQAaMBLwdVB2IHowGQAe0BLwdiBzEHoAenBzEHoAeUB6cHMQdIBw4HMQdiB0gHqAeFAakH3gGpB4UBYwcOB0gHDgdjB10HhAeVB3QHoQeVB4QHlQehB20HhAdtB6EHegfJB6oHaweqB3UHbQd2B4QHeQeXB6sHeQe+B3gHeAe+B4YHogeZB4cHbge9B30HWgekB6MHiAeaB7UHWQejB08HpQdPB6MHWQelB60Htgd/B4kHrgd+B7cHVwHOAQUCVwEFAtcBnQe5B6YHLwePB1UHnwcxB7AHpwewBzEHhQGQAd4BZQd1B5MHsQddB5QHsQeUB7sHlAd0B7sHgwdqB2MHbAd6B3gHaweqB3cHdgduB7MHvgd5B6wHqwe8B3kHeQe8B6wHpAeHB8EHWQe0B6MHtge3B38HuAeuB9wHrge4B3AHjAePB8QHjwdVB7oHxge6B1UHjQePB58H7QGpB94B7QHeAZABuweyB7EHdweqB8oHdgfLB4QHdwfKB3gHdgezB9QHfQfAB70HvweZB4YHfAejB7QHowekB9kHiAe1B24HrQelB+wHrge3B9wHwweuB5sHzgHeB7gHwweLB4oH3wedB4wHiwfDB1wHxQedB98HjgdyB9cBjgfXAaEB4QewB6cHpweUB8cHXQdjB8gHYwdqB8gHyAddB7EHlwdsB6sHeQerB2wHbAd4B3kHdgfUB8sH0weEB8sHhAfTB6EH1AezB70Hhge+B78HmQe/B9UHzAeiB5kHswe9B24HswduB7UHpAeHB9cHpAfXB9kHmgfaB7UHrQfsB5oHfge3B8QBcAe3B34HuAe3B3AHigeuB80H5AG4B84BcQfdB4oHBQLOAeQBwgffB4wH5AG4B94HzgeMB8QHxAePB7oHjgehAa8HoQGjAa8HowGhAesB6wGvB6MB4QenB8cHrwfrAZABlAfiB8cHlAexB+IHYwfIB4MHgwfIB2oHqge6Ae4BdQe6AaoHyge+B3gHvgfVB78HmQfVB8wHfAeFB6MH1QfkB8wH2AezB7UHtQfaB9gHpQftB+wHowf9B6UH7QelB/0HiQfbB7YHiQeKB80HiQfNB9sHtwe2B9wHgAffB90HgAfdB3EHgAfFB98HgAdxB8UHigfdB80HnAfFB3EHxQecB6YHzgfCB4wHzQfDB4oHXAfDB+UHzweNB+AHzweMB40H4AeNB58HjQePB8QHjwfEB1UHVQfEB8YHoQH6AesBsAfhB58HYwfIB+MHyAdqB+MHugHuAXUHlgfoB3QHuwd0B+gHdAeVB20HvgesB9UHvAfVB6wH1QfqB6wH1Qe/B/oHogfkB4cHogfMB+QHswfYB70H1gejB9kHowfWB/0H7AfaB5oHAwLEAbcHzQeuB8MH4AfvB88HxQe6B7kHxAe6B8YH4AefB+EHVQdoB8YH8gftAesB8gepB+0BqQeSB6gHkgepB4UBlAd0BxAIsQeyB8gHdAdtB4QHlgd2B8sHlgfLB+gHdgeEB9MHeQd4B6wH+Qd4B8oHvgd4B78H+Qe/B3gH1Qe8B+sH+gfkB9UHhwfkB9cH7gcDArcHzQf/B9sH5AFoAgUCwwfNB90H7weMB88H7wfOB4wH4AfmB+8H8QfrAfoB5gfgB+EH6wHxB/IHxwfiBwMIxwcDCOEHlAexBxAIsgcECMgHuwfzB7IH0gf0B+kH9gfnBxIIdgfTB8sHvgesB3gH1QfqB78H/Ae9B9gHtgfbB/4H2wf/B/4HtgcACNwH3gcBCOQBxQcCCLoH7wfmB/AH8AcOCOAH4QcPCOYHEAjHB5QHOQLeAe0BBAiyB/UH9QeyB9EHsgfzB9EH0QfzB/UH9gcSCBEI6AcGCLsHBgjzB7sHEQj3B/YH0gfpB/cHBwjSB/gHBwj4B7wHvQfABycIFQi/B+oH1QcVCOoH+ge/BxUIwAe9BxQI+wcUCL0H6wcVCNUHFQjkB/oHvQf8B/sH1wfkBxYI/QfZB9cH1gfZB/0H/gcbCLYH/wfNB90HGwgACLYHaAK4B+QB3ge4B2gCwgc9CN8HxQemBwIIAQhoAuQB8AfEBwwIugcCCLkHAggeCLkHDAjEB+AH8AfgB8QHEAi7B3QH9AfSB/cH0Qf1BwUI+AfSByYIywcTCOgHygeqB/YH+AcmCLwH1AezBzYIrAe+B78HvAesB+sH1QfrB6wH2QcICEMI6wcJCCkI6wcpCBUI/AfYB/sHFgjkBxUI/QfXBxgI7AftBzkIGgjuB7cH7gcrAgMCLAj+B/8HGwj+BwAICggACP4HAwJoAuQBOwj/B98H3QffB/8HAgg9CN8H3wfFBwIIwgfvBxwIxQffBz0IQwIFAmgC7wfCB84HxQcfCAII3gcBCB0I7wfwBwsI8AcMCAsI8AfmBw8IDAjgBw4IIgjHBxAIEAgjCCIIBAjjB8gHLwjeATkCEwgjCOgHEgglCBEIEgjnByUI9Af3ByQINAi+B8oH6QfSBwcIswe9BzYIrAe/B9UH+QfKB78HvwfKBygIFggVCBcI1wcWCBgI2AcqCPsHGQjaB+wHKwgZCOwHKwLuBxoIaAIDAisCLAj/BzsI3wc9CDsIuAcACLcHuAfcBwAIaAJICN4Hwgc+CD0I3gdICAEIHAg+CMIHxQc9CB8IHAjvBwsIHAgLCAwIuQcCCKYHHwgeCAIIDQgeCB8IDggPCOEHAwgOCOEHPwghCMcHPwjHByIIxwexB5QHIwgTCCIIEAixB7IHEAiyB7sHMAjuAUYC9AckCOkHBgjoBxMI0gfpByYIygf2BzQIBwi8ByYI6Qc0CPcH6Qc1CDQIKAjKBzQINwgnCMAHOAi/BygIQwhFCNkHswe9B7UH2QdFCNYHtQe9B9gHFggXCBgI2AfaBxkI2AcZCCoIRwj9BxgIGAgXCEcIOQgrCOwHGwi3BzwIKwI8CGgCPAi3BwAIHAgLCD4ILQgBCB0I8AcMCA4I6wF5Au0B7QFWAjkCsQfzB7IHMAjnB+4BQQjnBzAI8wcyCPUHMggzCPUHJAj3B+kHBghCCPMH8wdCCDII6Qc1CCYI9wc0CPYHOAgoCDQINQjpBwcIswcnCL0HQwgICEUICAjZB0UIswe1BzYItQfYB0YI2QdFCP0HRwg6CP0HOgjtB/0HOgg5CO0HSwgaCLcHGwhLCLcHGgg8CCsCPAhICGgCWAg7CD0IOwhYCCwIPggcCD0IPQgcCB8IAQiMAmgCHwgcCA0ITwgBCC0IDAggCE4ISQjwBw8IIAheCE4IeQJWAu0BDwghCMcHxwchCOIH4gchCAMIxwfiB7EHyAcECLEHQAgiCAYIsQcECPMHIggTCAYI5wdBCEYCJQj3BxEI9gf3ByUIywcxCBMIQggGCBMI9wf2B+kHMQjLB9QHvQcnCDYIJwg3CL0HBwhVCAkIwAe9BzcI6wfVBwkIvwcVCNUHCQjVB+oHvwdECBUIvwc4CEQIvQcUCPwHRgjYBxkIOgjZB/0HKQhHCBUIFwgVCEcISAg8CI4IGwg8CAAIGwgACAoIDAgNCBwIAQhPCB0IHQhPCC0IUQgtCE8ITgheCC4ITgguCA0IIghACGwI9QfzBwQIsgfzB/UHJQjnB0YCRgJBCDAI9QczCAUI6Qf2BzUINAj2B24IBwgmCDUINQj2BzQIMQjUBzYIBwhwCFUIVQhDCAkIswc2CCcIBwgJCFYIBwhWCDUICQjqBxUIYghGCBkI2Qc6CEUI+wcqCHUIGQhiCCoIdQgqCGIIOgj9B0UIGQgrCFcISwg8CBoIYwj+BywI/gdjCGQI/gdkCAoISAiECF0ITQhMCAIICghaCAAIAghbCE0IXAhbCE0IAQhPCF0ITggNCAwINwK1AnkCPwhpCA8IPwgPCMcHQAhKCFMIIghsCGsISghACGwIJQhGAvYHVAgTCG0IEwhUCEIIMQhtCBMIMQhxCG0IMQg2CHEIMghhCDMIbwgzCGEIBwg1CF8INQg0CHwINQhfCDQIQwhVCH0IQwh9CAkI+wf8BxQICQgVCCkItQd0CDYIOQg6CIAIgghLCBsIWAhjCCwIPQhlCFgIWghZCEwICghkCFoITAhNCFoIXQgBCEgIHwg9CAIIWghNCFsIAAhaCIMITAhbCAIIWwhMCIcIaAhbCIcIAQhdCIwCWwhmCFwIiAjwBw8ILghQCGgIDwgOCIgIPwgiCGkIOQKnAmoISghsCFMIBgjzBxMIVAhyCEIIMghCCFQINQh8CF8IMghUCGAIBwhfCHAIYAhhCDIIVgh9CFUIfQhWCAkINQhWCF8IdAhzCDYItQdGCHQIKQh+CEcIGQhXCGIISwiCCDwIjgg8CIIIWAhlCGMIWQhjCGUIYwhZCGQIWQhaCGQIhQhlCD0IHwiFCD0ITAhZCIcIHwhnCIUIgwiGCAAIXQiGCAEIZwgfCA0IAQiGCE8IaAhmCFsILghnCA0IaAhnCC4IXgggCAwIUQh3CE8IIghrCGkIUwhsCEAIbAhACAYIEwhrCGwIbAgGCBMIighrCBMIRgKoAiUIRgJBCKgCbQhyCFQINAhuCHwIXwg1CHAIcAhWCFUIiwhfCFYIFQhECBcImQhFCJcIRQiZCDoIgAiBCDkIjgiECEgIGwgACIMIWQhlCIUIhQhnCGgIXQhPCHcI8AedCAsI8AeICJ0IdgiiAncIZghoCJAIdgh3CE8ILgieCFAIDwgDCCEIUwiSCGwIUwh5CHgIeAh5CHoIawiKCGwIEwjzB4kIJQioApMIJQjHAvYH9gfHApQI9gegCG4IcghgCFQINAhfCIsINAiMCDgIOAiMCEQIRghzCHQIKgh1CH8IcwhGCJgIFwgpCBUIRAiWCBcIRghiCJgIYgh/CHUIVwh/CGIIKQgXCEcIRwikCDoIgQgrCDkIjQiCCBsIzwIrAuECGwiDCI0IhAhoAowCWgiGCIMIWQiFCIcIWwiGCFoIhQhoCIcInQiPCAsIHAhOCAwIXQh3CIwCogKMAncINwKiArUCDAhOCF4IUQh2CE8IAwgPCA4IbAiJCFMIUwiJCHkIBgiJCPMHJQiTCMcClAigCPYHbgigCHwINgiVCHEINghzCJUIlQhzCHQIjAg0CIsIRAiMCJYIfwhiCCoIFwiWCKIIowhHCH4Imgg6CJkIRwijCKQIOgiaCIAIOgikCJoIgQiACKYI4QIrAo4IKwJoAo4IzwLRAisCaALRAowCCwiPCJsIkQiqCEkIkQhJCA8IaAhQCJAIaAhQCJ4IDwhpCJEIbAiSCKsIawhsCGkIbAiKCIkIigi8CIkIEwiJCFQIVAiKCBMIrQhUCG0IVAi/CGAIfgjECFYIVgiwCIsImAhiCKEIFwiiCLIImQg6CLMIKwiBCMcIgAiaCKYIgginCI4IjginCOECjghoAoQIhAiMAl0ImwiPCKgIdwhPCIYITgioCIUInAiPCJ0InAhJCKoInAidCEkITgiFCA0IDQiFCGcIngguCA0IDQhnCJ4InQgOCEkISQgOCA8IPgN2CLkIaQi6CJEIrAhsCKsIeQjQCHoIegjQCHsIeQi+CNAIMggGCPMHVAhtCIoIqALHApMIlAjHAskClAjJAqAIcQitCG0IvwiuCGAIlQitCHEIvwiVCHQIfAigCIwI2AKgCMkCXwhWCHAIsAixCIsIsAhWCMQIogiWCLIImQiXCLMIRwgXCLQIswg6CJoIRwi0CKUIKwjGCGIIKwjHCMYIgQimCMcIpgi1CMcImgi1CKYIhghdCHcItwiPCJwIjwjJCKkIjwipCKgItwicCKoInQioCKkIqgiRCLcInQiICA4IZwhoCJ4IkQgPCLgIdgg+A6ICuQh2CFEIuQhRCLsIUQjOCLsIbAisCLoIewjXCJ8IiQjPCHkIvgh5CM8IiQgGCEIIiQhCCFQIQggGCDIIVAitCL8IjAhfCHwIYQhgCMAIYAiuCMAIjAjYAq8IjAigCNgCrwjYAsEIjAjDCMIIjAivCMMIrwjBCMMIiwjRCIwIlgiMCNEIiwixCNEIsAjECLEIxwizCJoIpAijCJoIRwilCKQIYghXCCsImQizCNkImQjZCJoIpAilCLQIxgjFCGIImgikCLUIUwPhAqcIggiNCKcI4QJTA88CpwiNCMgIjQiDCPYI0QIHA4wCtwjJCI8ItgioCMkIhQjKCGcIZwjKCGgIUAhoCM0IkQi4CMwIugjMCJEIdgjOCFEIbAi6CGkIvAjPCIkI0Ai9CHsIightCLwIrQiVCL8IyQIDA9gCoQjyCJgIlwiZCOMIlgjiCLIIFwiiCLQIxwi1CNQIpAjTCLUIUwOnCOoIzwIVA9EC9gjICI0I0QIWAwcDWQhbCIcIXQiMAqICXQiiAncIPgOMAgcDqAi2CIUIjAI+A6ICtgjKCIUItwipCMkItgjWCMoIygjLCGgI1gjLCMoIzQhoCMsIkAhQCGYIzAi3CJEI1gjbCMsIPgO5CPsIogI+A7UCtQI+A/8CzAi6CKwIrAirCJIIuwjOCNwIaginAhsDewjXCL0IXwiMCNgIvwh0CK0Irgj9CMAIwQjYAiADwQggA8MImAjyCHMI5AihCGII4giWCNEIswiXCOMIswjjCJkIogiyCOIIYgjFCNIIxgjSCMUI5wjSCMYIpAi0CPUIxgjoCOcI6QiaCLUIpAj1COYIpAjmCNMIzwJTAxUDWghjCGQI7AjICI0IYwhlCNUIZQhZCIcIWwiDCIYIyQioCJ0IaAhmCFAIdgjcCM4IbQgHCbwIVAhgCOAIVghfCOEI2AjhCF8I/QjxCMAIdQhiCOQIswjHCOMI4wjHCNkI0gjkCGIIsgi0CPUIxwjoCMYIAgnUCLUItQgBCekItQjTCAEJ6ginCMgIyAhkCOsIYwjrCGQI1QjrCGMIZAjrCFoIWQhjCNoIYwhaCNoIWgjrCIMI0QIVAxYD1QhlCPgIWwhZCNoI2ghaCO4IWgiDCFsIZQj5CPgIWwjuCFoIhwj5CGUIyQidCKkIdgi5CNwI3gjbCN0IuwjcCLkIUwh4CHoIvgjgCNAIYAhhCK4IrghhCMAIyQIPAwMD2AiMCMIIdAiVCK0IdQj+CGIIfwj+CHUI/gjkCGII/gh1COQIogjzCLQItAgACfUI0gjlCPQIswjjCNkImgjZCMcI5wjlCNII6QjZCJoImgjZCLUI5gj1CLQI1AjoCMcI5ggBCdMI6wgECcgIyAjsCOoI9giDCOsI+AjtCNUIWwjaCO4IaAj5CIcI+QhoCMoIyQipCLYI3QjbCKkI3QgFCd4I/AiSCGwIkgj8CKwIeghsCFMIeQiJCGwIbAh6CHkIawiKCM8IawjPCLwIiQjPCIoI4Ai+CM8I4AgGCdAIvwjwCFQI4Ai/CFQIYAiuCOAIwAjxCK4I/QiuCL8IwwgMCcIIwwggAwMDDQnyCKEIoQjkCA0J9Aj+COQI4gjRCKIIogjiCPMI9AjkCNIItQjpCAIJyghoCPoI+ghoCM0IawjvCGwIVAjwCK0IrQjwCL8Irgi/COAIrgjxCP0I8giVCHMI/wgJCcQIwwjiCNEI9AjlCA4JtAjzCPUI6QgBCdkIAQnmCAoJCgn1CBoJ5gj1CAoJ6AjUCOcI5wjUCAMJ6wgLCQQJ9gjrCMgI+QjKCPoI1gi2CKkIygj6CMsI+gjNCMsIugisCO8IrAj8CGwIrAhsCO8Iawi8CO8IvQjfCNcIzwjwCOAIrQgHCW0IBgkICd8IVgjhCH4IDAnDCAMD4Qj/CMQI5QgUCQ4J2QjpCLUIyAjsCPYI+Aj5CLYI+Ai2CBYJ9ggQCfcItgj5CMoI2wjWCKkItwjdCKkI/AjvCM8IzwjvCLwIvAgHCc8IzwgHCfAI3wgGCcAIBgnACAgJ/Qi/CBgJ4QjECH4I9QgACRMJ5QjnCBQJAgnpCNQI1AjpCAMJDwnpCAEJDwkVCekIBAnqCMgIUwPqCBUD7Aj2CPcI7Aj3CBUD2gjuCBAJ2ggQCfYItwgXCd0IFwm3CMwI3QgXCQUJ/AgSCawI3wgICcAIvwiVCBgJ4wgJCf8IsQgTCeII2QgBCQAJAgkUCecIAwnpCBUJFQPqCOwI6wjaCMgIyAjaCPYIGQn3CBAJugj8CKwIugjvCPwIvQgGCd8I2AixCOEIxAjhCLEI/QgdCfEI8QgdCSIJDQnkCNIIsQjiCNEI5wgDCQIJ1QjtCOsI7QjaCOsI7gjaCO0I7QgRCe4IGwnuCBEJEQn5CPoI+ggbCREJzAi6CBcJBQkXCR8JugisCB8J0AgGCb0IlQghCRgJFAn0CA4JCgkaCR4JAQkKCR4JAQkeCQ8J7Qj5CBEJ7QgkCfkI/wI+A7kIHwkXCboIrAgSCQUJ/AjPCBIJvgjwCM8IvgjgCPAIlQjyCCoJ/wjECOMI4wjECAkJ9wgZCfYI+AgkCe0IGQkQCfYI1gjKCNsI2wjKCMsI/wK5CCwJHwmsCAUJBQkSCd4Izwi+CBIJ4Ag0CdAIBgnQCDQJBgknCcAICAnACCgJCAkoCRwJHAkoCSAJHAkgCQgJ8QgiCf0IGAkhCSkJlQgqCSEJGAkpCf0I/QgrCR0JDQnSCC8JFAnlCPQIAwkVCTkJDwkeCQoJAwk5CQIJ7AiQAxUD2gj2CO4I9ggQCe4I+AgWCTwJywjKCEAJqQjdCBcJLAmFA/8C3ggSCU0JJQnQCL0IvAjPCCYJzwjwCCYJ0Ai9CN8I3wgGCdAIBgk0CScJNAngCPAIBwkzCfAI8AgmCTQJJwktCcAIrQiVCDUJ2AjCCEQJIgkdCf0IKQkrCf0IKwkpCS4JEwmxCNEIEwnRCOIIAgk5CTAJEQnaCO4IPQnKCPkIMQnLCEAJtwipCBcJSwm5CCwJZQngCL4IJgkzCbwINAktCScJBwmtCDUJwAgtCUUJwAhFCSgJKAlFCSAJwggMCVIJKQkhCS4J8ggNCSoJHQkrCSIJ5AgvCdIIIwnnCAIJFQkPCTkJ9wg7CewI9gg7CfcIEQntCNoIPAkWCbYIJAn4CDwJtgjJCGAJJAk9CfkIBwODAz4DPgnJCKkIQAnKCD0JPgODA7kIPwmpCLcIqQg/CT4JtwhKCT8JQQP/AoYD7wi8CEMJ0AglCb4IJQllCb4I4AhlCSYJJgnwCOAI0AgyCb0IJwkyCdAITwkyCScJ0AgGCScJtwMPAy8D8AgzCSYJsQjYCEQJDAkDAzcJUgkMCTcJVAkiCSsJ0QhVCeII4ghVCfMIVQlWCfMI0gjnCFgJOAnnCCMJIwkCCTAJOgldCesI7Ag7CZADXQnICOsI2ghHCesI9ghfCTsJRwnaCO0IXwn2CMgIJAk8CWAJtghgCTwJgwMHA3ED+QgkCREJJAlgCT0JyggkCfkIyQg+CUkJLAm5CIMDSgm3CBcJhQOGA/8CQgm6CO8IQgnvCEMJ7wj8CLwIzwi8CPwIQwm8CG4JvgjPCE4JvAgzCW4JpgO3Ay8DpgMvAywDIQk1CZUIIAk2CQgJHQkpCf0IUQlECcIIUglRCcIIAwMgA6kDAwOaAyADqQMgA5oDqQM3CQMDDQkvCSoJUwlGCbEIRgnRCLEI0QhGCVUJIwlXCTgJ8wgKCfUIVgkKCfMICglWCVkJOQkVCVsJkAM7CYIDOgnrCEcJRwntCDwJ7QgRCTwJSQlgCckIgwNICSwJPQlhCUAJQAlhCTEJQQkxCWEJ3ghjCQUJLAlMCYUDYglMCUsJSwlMCSwJuggfCfwIHwkSCfwIEgkfCWQJEgm+CPwIJQm9CDIJBgkoCScJhwMPA7cDBgnACCgJNgkgCUUJKQkdCVAJsQhECVMJUAkdCSsJLglyCSsJKwlmCVQJWAnnCGcJaAlqCWkJCglaCR4JCglZCVoJWQl5CVoJHglaCVwJHglcCQ8JOQkPCXgJDwlcCXgJXgk6CUcJJAk8CREJYAlJCX4JQAkkCcoIPgl+CUkJYQk9CTEJSgkXCR8JHwkFCWMJQQlhCX8JQgkfCboIEglkCWMJYwneCBIJ/Ai+CE4JTgnPCPwIBwk1CTMJMwk1CW8JMwmQCSYJcQkmCZAJNAkmCXEJLQk0CXEJIQmRCTUJKAkICUUJNglFCQgJpwlFCSAJKwkuCVAJNwmaA1IJRglzCVUJcwl1CVUJOAlnCecIVwmFCWgJaglcCWsJXAlsCXgJbAlcCWoJWwl3CTkJWgl5CVwJIwkwCYYJMAk5CYYJdwmGCTkJOQl4CXcJyAhdCV8JXQk7CV8JggN6CRgEXglHCW0JegmWCXsJewl8CXoJYAmHCT0JPwl+CT4JSgl+CT8JfgmKCWEJfgmJCYoJHwljCWQJjAlDCUIJQwmACWQJQwmMCYAJ0AhlCSUJ0AglCScJkAlwCXEJbwmQCTMJbwk1CZEJLQmmCUUJqQOaAzcJkwkgCUUJLgkqCXIJcgmCCSsJLwmDCSoJgglmCSsJUwmpCUYJqQlzCUYJqQl1CXMJLwnSCFgJdAmECXUJdQmECVYJdQlWCVUJVgmUCVkJIwl2CVcJaAmFCWoJhQlXCXYJhQlsCWoJWQlcCXkJhgl2CSMJbAl3CXgJOgmVCV0JOwmuCZADggOQA64Jlgl6CYIDRwmXCW0JewmWCZgJegl8CRgEbQmXCZkJewmYCXwJmQl9CW0JQAlgCSQJmQmbCX0JLAlICYUDSAmDA4UDfglhCT0JngmdCUoJYQmLCX8JQwlkCYwJZAmACYwJJwklCTIJBgllCdAINAkmCWUJBgk0CWUJJwkoCTQJKAmSCaQJKAmnCZIJcAmlCS0JKAlFCacJUAkuCSkJkwmnCSAJRQmnCZMJWAmDCS8JWAmsCYMJWAlnCawJhAmUCVYJhAl0CZQJZwk4Ca0JdgmGCYUJhgl3CYUJhQl3CWwJlQk7CV0JrwmVCToJsAmWCYIDlwlHCbEJRwk8CbEJ1gMYBHwJJAmaCTwJbQl9CZsJiAlgCX4JYAmICYcJYAlACT0JfQmbCZwJiAk9CYcJiAl+CT0JfgmdCYkJPQlACTEJfglKCZ0JSgkfCZ4JHwljCZ4JQQl/CTEJigmJCWEJiwlhCYkJQQl/CYsJQglDCcIJhgMJBG0DjQmOCZ8JQwluCYwJgAmhCY0JjQmhCaIJbgkzCW8JowkyCScJKAmPCScJqAmkCZIJhwPyA5oDcQlwCS0J8gPzA5oDLQmlCaYJmgPzA1IJkwmoCacJkwmBCagJkwmnCYEJgwlyCSoJgglyCYMJawlsCWoJlAnACVkJwAlrCVwJXAlZCcAJlQmuCTsJrgmwCYIDlwmvCToJXgltCToJmAmWCbAJmgmxCTwJmgkkCWAJmglgCYcJmQmcCZsJnAm7CX0Jsgl9CbsJngljCbUJQgmeCR8JtAncA4UDTAm0CYUDQgnCCZ4JQwmMCcIJbQMJBO4DoQmACaIJvAklCTIJJwmPCaMJNAkoCS0JKAmSCY8JbwmRCZAJcAmQCZEJkgmnCagJcAnDCaUJRAlRCbcJIQkpCXIJpgmnCUUJRAm3CVMJKQkuCXIJtwmpCVMJZwmtCawJaAlqCWwJdAnACZQJbAlrCckJawnACckJlQmwCa4Jlwk6CW0JsQmaCYcJBwTWA3wJfAm6CQcEgwMHBIUDTAmzCSwJhQPcA0wJiQm1CYsJTAmzCbQJtQmfCYsJnwm1CY0JoAmMCW4JMgmjCbwJbglvCaAJJQm8CY8JJQmPCScJMwkmCXAJMwlwCW8JcAmQCW8JcAkmCXEJxAmRCSEJpgmlCcMJuAm3CVEJUgnzAyIEtglRCVIJtglSCSIELgkrCb0Jtwm4CakJKwlUCb0JUQm2CbgJZgm9CVQJZgkrCb0JdQnFCasJqgnHCasJuQnGCb8JrAm+CYMJxgmtCb8JVwloCXYJdgk4CSMJlwltCZsJmwmZCZcJPQkxCYgJwQlhCYoJBwTcA4UDMQlhCcEJfwmKCWEJMQl/CWEJ3AOzCUwJfwm1CYoJiwm1CX8JtAkJBNwDwgmMCZ4JgAmeCYwJngmACbUJjQm1CYAJjgmNCaIJoAmQCaEJjwnLCaMJLQkoCZIJkQniCXAJIQlyCcQJpwnMCYEJdQmpCcUJgQmqCasJrQnGCc0JxwnOCasJdQmrCXQJzQnICa0JrAmtCcgJbAmFCWgJdAnVCcAJdgmtCTgJrwnYCZUJ2AmvCZcJlQnYCbAJsQmaCZcJmQmXCZoJmgnKCZkJygmcCZkJiAkxCcEJygm7CZwJfgmICYoJiAnBCYoJCQSzCdwDtAmzCQkEjQmLCZ8JoAlvCZAJkQnECeMJwwlwCaYJuAl1CakJzQm5CdMJgwm+CYIJuQnNCcYJqgnOCccJrAnICb4JaAmFCXYJqwnVCXQJlwmZCdkJiAl+CYcJygnRCbsJiQmKCbUJjQmiCYAJjwm8CaMJywnfCaMJjwmSCdIJjwnfCcsJjwnSCd8JLQmSCaUJkQnjCeIJcAnvCaYJxAlyCeMJcgkuCb0JqQl1CfMJ9Al1CbgJKwmCCb0JgglyCb0JzAmqCYEJggm+CdMJqwnOCdQJ1QmrCdQJ1AnOCdYJyQnACWwJwAnoCWwJhQlsCdcJbAnJCdcJlwnZCdgJ2QmZCdoJmQmbCdoJ2wmaCYcJzwmaCdsJygmaCc8JzwnQCcoJ0QnKCdAJKwSzCQkEnQndCYkJnQmeCd0JngmACd0JswklBAkEtQmLCY0J3wneCaMJkgnhCdIJ8wPyA1MEIgTzA1ME7wlwCeIJpgnkCacJgQmrCeUJqwnFCeUJxQmpCdQJxQnUCeUJzAn/CaoJzQnTCb4JqgnmCc4JvgnICc0JvwmtCcgJ1gnOCeYJ1AnWCdUJ1QnoCcAJyQnnCdcJyQlsCecJ6AnnCWwJAQrYCdkJGASWCa4JGAR8CZYJmAmWCXwJhwl+CdwJhwncCdsJ2wncCc8J3AnQCc8J3AkMCtAJKwTrCbMJtQmJCd0J3QmeCbUJCQQlBCwE7gM6BCEEywmjCd4JkAlwCeAJcAn7CeAJpgmlCZIJpwmmCZIJ7wniCeMJUwQ+BCIEgQmnCagJcgm9CQcK5AnMCacJtgkiBPEJuAm2CfEJ5QnUCfIJ8wnUCakJ/wnMCf0JuQnGCdMJqgnlCeYJ1gnnCdUJrQl2CcgJdgmFCfUJ5wnoCdUJrgkKChgElQmuCZYJlQmWCbAJsAmYCQIK1gMYBF0Emwl9CekJfAnWA7oJugnWAwcEBwRKBNwDDQp+CZ0JnQmJCQ0K6gnrCSsECQQsBO4D7gMsBDoEjAmgCQYKoQmQCQYKjwnLCdIJ0gnhCd8J3wnhCe4J+wlwCe8JcAmlCe8JpQmmCe8J7wmmCfwJ/AnkCaYJ5QnwCYEJ8gnwCeUJ5An9CcwJgwkHCnIJ0wmDCYIJqgn/CeUJ5gkJCtYJdgn1CcgJ9QmFCdcJCgpHBBgElQmwCQIK2QnaCQEKAQqwCdgJAgqwCQEKmwnpCdoJmQl9CZwJ6Ql9CdoJ9gkrBEoE3ANKBCsE9gnqCSsE3QkNCokJ7QnsCQ4K7QkOCgQKngkPCrUJjAndCYAJjAkQCt0JjAkGChAKoAmhCfcJBgqQCeAJ3gnfCcsJywnfCdIJ3gnfCfoJ4An7CfkJkgnhCeQJkgnkCacJ/AmnCeQJkgmnCeEJ4QmnCeQJpgmnCfwJpwmBCeQJ4wlyCQcKgwkICgcK0wkICoMJxgm/Cc0JvwnICc0J1gkJCtcJ1gnXCecJlQkACq4JrgkACgoKAgoACpUJGARcBF0EAwrZCZkJ2QkXCpkJAwqZCZoJmQnaCX0JfgkNCgsKCwrcCX4JDArRCdAJ3Qm1CQ8K3QkQCh0K+AkSChEKoQkGCvcJ+Qn4CeAJ8AnkCYEJ/QnkCTEKCArTCc0J0wnGCc0JzQnICRQKyAn1CRQK1wkJChUK9QnXCRUKAAoCCgoKAgoWCgoKFwraCZkJmgnKCQMKygnPCQMKygnRCc8J0QncCc8JGwoLCg0K0QkMCtwJDwqeCd0JHQoQCh4KBQoECi4KBQouCj0K+gkgCt4J+Qn7CSEK4QnkCe4J4wkHCu8J7wkwCvwJMArkCfwJ5AkwCjEK1AnzCfIJIgT+CbYJ/gnxCbYJ/gmtBPEJ/gkiBK0EBwoICiUK9Am4CTQK/QkxCv8J5Qn/CRMKEwo1CuUJ5gnlCQkKGARHBFwE2QkXCloK2QkDChcKJwoZChgK6QkpChkKKAr2CUoE3AkDCs8JCwoqCtwJKQrpCUkK6QkaCkkKCwo6CioKCwobCjoK7AktCg4KLQrsCRwKHArsCSwK6wklBLMJBAoOCi0KHQoeCjwKHwoeChAKEAoGCi8KHwoeCgUKoAn3CQYKEQo+CvgJ5AnhCfwJ5AnwCf0JIgr9CfAJ7wkjCjAK8gkiCvAJIgryCUEKIwrvCQcKtgm4CUIKuAm2CTQKCArNCSUKMQoTCv8JFAr1CRUKAQomCgIKAQraCSYKAgomChYKJgonChYK2gnpCSYKJwomCukJGQonCukJOQoDCjYKAwo5ChcKNwoDCtwJxAQoCkoEKwocCiwK9glKBOoJKwTqCUoEDQo6ChsKLApTCjgKHAorCi0KLArsCVMK6gkrBCUEDQrdCTwK6wnqCSUE3QkdCjwK7QkECuwJBAotCi4KBQo9Ch8KHwoQCi8KBAouCu0JPQoECgUKTArgCfgJ+An5CfcJ+gnfCT8K3wnuCT8KywRTBKkEUwTLBD4EQQpACiIKIwoHCjIKQQryCfMJMQowCiQKuAnxCUIKJAoyCgcK8wl1CU8KtgnxCTMKBwolCjIKMQokCkMKNApPCnUJdQn0CTQKMwo0CrYJJQrNCUMKRApDCs0JCQrlCTUKFAoVCgkKCgpcBEcECgoWClkKXQRcBIQEXASOBIQEXQSEBEUKXgoXCtkJFwpeCtoJAwpICjYKAwo3CkgKRwo2CkgKRwo4CjYKNgo4CjkK3AlICjcKSArcCSoKPAo6Cg0KKwoOCi0KKwpSCg4KUgotCg4K7AkECg4KPAoeCh8KPQouCgQKSgrtCS4KLwoGCksKBgr3CUsK+Ak+CkwKBgrgCUwK+An3CT4K7glNCj8KMAr8CeEJTQruCeQJ5An9CU4KIgpWCv0JIwoyCjAKJAowCjIKQgrxCbYJQwoyCiUKMgpDCiQKQwoTCjEKFApECs0JNQoUCgkKJgpZChYKFwpGCloKOQpGChcKRQrEBIQESAosCkcKSAorCiwKRwosCjgKSQoZCikKSAoqCisKGgpRCkkKGgo7ClEKoQRKBCgKSgShBCsEUgorCjoKXwpKChEKBgpMCksK9wngCUwK9wn5CeAJ4An7CVQK+wlVClQKIwpVCvsJ+wnvCSMKQApWCiIKTgr9CVYKfgTBBMMEMwpXCjQKTwo0ClcKQwpEClgKRAoUClgKQwpYChMKEwoUCjUKCgpZClwEjgRcBFkKXgrZCVoK2gleCukJKArEBEUKGQpJClEK6Qk7ChoKKArEBKEEKgo6CisKoQRlClsK0gShBFsKUgo9Ci0KLgotCj0KDgoECi4KBArtCUoKPQo+ChEKPQoRCi4KTArgCVQKTgrkCe4J7glNCk4K4QnkCTAKTgowCuQJ5AlOCk0K8QkzCl0K8AnlCf8J1AnzCU8KYwpPClcKYwrUCU8KWAoUChMKWgpGCm8KWgpvCl4KUQrpCV4KUQo7ChkKZQqhBMQEOgo8ClIKPAofClIKHwo9ClIKBApKCi4KLgoRCkoKLwpLCkwK9wlMCj4KVQojCjAKVQowClwKTgpWCk0K/QnwCf8J8QlQCjMKZArlCdQJYwpkCtQJZAo1CuUJXgpvCnYKOQpHCkYKXgoZClEKUQoZCukJ6QkZCjsKGQo7CmsKLQosChwKDgouClIKHwpnCj0KPgo9CmcKTAofCi8KHwpMCmcKVArgCWAKYApUClUKXApOCmEKYQpOCmIKXAowCk4KTQpiCk4KVgpACmkKUApdCjMK/Qn/CRMKMwpQClcK5QSOBFkKNgpGCkcKXgp2ChkKKAplCsQEKwosCi0KaApnCkwKPgpnCkwKbApNCj8KqQS9BAYFVgppCnMK+gTBBMsEVwpuCmMKMQr9CRMK8QldClAKYwqQCmQKGQomCicKOQo4CkcKOwoZCnoKUgorCi0K0gRbCusEcgpNCm0KbQpNCmwKcgphCk0KPwpsCoAKYQpiCk0KVgpzCk0KaQqCCnMKMQpOCv0JYwpuCnQKkAo1CmQKdQpZCiYK5QRZCnUKhASOBOUEbwpGCnYKhAQoCkUKawp5ChkKegprCjsKKwpSCnEKWwpmCusE0gQOBaMEPwptCmwKYApMClQKcgptCmEKYApVCo0KVQpcCo4KXAphCoEKXAqBCo4KbAqCCoAKggpsCk0KTgoxCiQKTgoiCv0JJAoxCpQKVgpBCiIKQApBClYKdAqPCmMKEwo1CoQKrQTDBKIKhQp1CiYKhgp1CoUKJgoZCpcKRgp3CnYKeQqXChkKxAQoCoQERgo2CncKhwp4CncKdgp4ChkKNgpHCogKRwpICogKGQp4CnoKKwp7CkgKawp6CnkKcQqKCisKcAorCooKLgpxClIKfQpxCi4KPQpxCi4KSwpMCmAKiwphCm0KYAqNCpMKfwqMCoEKTQpzCoIKywThBPoETgokCjAKXQpQCp8KEwqECjEKNQqQCoMKjwqQCmMKNQqDCoQKUAqWClcKlwqFCiYK5QTVBIQEdwp4CnYKNgqICncKewqICkgKcAp7CisK0gRbCmUKZQqhBNIEagqJCpgK6wQOBdIEcQo9CmcKZgoOBesEPQqRCmcKPQp+CpEKPQo+Cn4KfgpoCpEKaAp+Cj4KaAo+CkwKSwqTCmgKTApLCmgKtATcBAQFkwpLCmAKtAQEBb0EjQpVCo4KjgqBCowKMAqeCk4KTgpWCiIKhAqUCjEKUApdCpUKXQqfCpUKoQpjClcKBwWiCsMEUAqVCpYK1QTlBHUKhgqsCnUKhQqXCoYKeApqCnoKKAqhBGUK9ATEBNYEoQTEBPQEagquCokKmQpbCtIEWwqZCmYKfQouCpoKkwqNCowKjQqOCowKfwqBCosKiwqBCmEKVgpOCpwKnQppClYKMAokCp4Kjwp0CpAKkAqgCoMKUAqVCp8KwwT9BDMFwwQzBQcFBwUzBaIKrgpqCpgKmQrSBOsEigpxCn0Kigp9CnAKcAq0CnwKmAqJCqMKcQqaCi4KiwqSCn8KbQo/CoAKkwqMCqkKfwqvCowKvQQEBQYFIwqBCjAKMApOCpwKTgpiCpwKMAqcCp4KngqcCk4KVgqcCp0KpAqeCiQKJAqUCqQKYwqhCo8KUAqiCpUKlwp5CngKdwqlCocKpQp3CogKiAqmCqUKpQp4CocKagp4CqUKpwqICnsKpgqICqcKfQqnCnAKtApwCn0KmQrrBGYKZwqRCrcKfgrECpEKfgqSCsQKZgqoCg4FkwqpCmgKrwp/CrkKTQptCoAKgAqCCk0KcwphCk0KYQpzCmIKYgpzCpwKnQqcCnMKTgowCoEKTgqBCmIKIwowCqoKMAqwCqoKsAowCp4KnQpzCmkKzAqhClcKlQrKClAKlQqiCjMFlgrMClcKWgV1CqwKdQpaBdUElwqtCoYKlwp4CnYKewpwCqcKpwp9CrQKfAp9CnAK9AQ3BesErgqYCokKfAq0CrYKcQpnCrcKkQrECrcKDgWoCiIFrwqpCowKiwptCk0KYgqBCmEKjgojCqoKjgqBCiMK4QT6BDEFlAqECqsK/QT6BCYFsQqrCoQKhAqDCrEKhgqtCqwKeQp6CngKrgpqCrMKrgqYCrMKfAq2Cn0KGAXrBDcFcQp9CpoKfAq2CpsKtgq4CpsKDgUiBSoF3AQ7BSIFggrHCoAKggqACnMKTQphCosKggppCs8KBgUxBeEE0grhBDEFsAqeCqQKsQq8CqsKWAqkCoQKgwqQCsgKjwqhCr4KlgrKCpUKzArLCqEKlgqVCjMFdgq/Cq0KdgqtCpcKNgVaBc0KzQo3BTYFzQqyCjcFwQpqCqUKpgrCCqUKswpqCsEKswqYCsEKmAqjCsEKwQqjCrUKKgXrBBgFcQq3CsMKtgq0CrgKqArGCiIFMAUGBQQFjAqOCroKqgq6Co4K0AqqCrAKuwqdCpwKnQreCnMKpArRCp4KhAqkCpQKyAqQCo8K+gQxBSYFvQq8CrEKsQqDCr0KvQqDCsgKnwrKCpUKvgqhCskKoQrLCskKzAqWCtwKlgozBUEFwAp2CmoKdgp4CmoKagqzCsAKtgq0Cn0K6wQqBQ4FcQrDCrQKfQpxCrQKtArVCrgKxAqSCsUKqQp+CmgKuQrECqkKuQqpCq8KzwrHCoIKBAU7BTAFnAqdCt4KBgUwBTEFngqcCrsKggpzCs8K3wpzCt4K3gqdCrsKngrRCpwKjwq+CsgKJgVABf0EWAqECuEKrArNCloFdgrACr8KwQqlCrMKwQq1CtQKpwq0CqYKmAqzCqMKDgUqBagKfgqpCsQKfwqLCmEKjAq6Cq8KfwphCoEKzgqLCmEKnAreCrsKzwpzCt8Kngq7CtEKuwqcCtEK2grRCqQKyAq8Cr0KpApYCuEKhAqxCuEKlgrcCsoK/QRABUEFlgpBBdwKwArzCr8KvwrzCq0KrQrzCtMKzQo2BbIKswrBCsAKpgq0CrYKtArDCrcK1gq0CrcKiwrYCs4K4Aq6CqoKqgrQCuAKpArhCtoKvArICtsKqwq9CrEKyArnCtsKzArcCssKwgriCqUKwgqmCuIKtgriCqYKtAq2CtUKuArVCrYKtArrCtUKuArVCusK5AqvCroKugrZCt0KMQXvCtIK8QrgCtAKsAqkCtoK0QraCrsK4QqwCtoK4QrQCrAKvQqrCrwKyQrLCr4KQAV7BUEFrQroCqwKrAr6Cs0KwAr7CvMKzQr6CjYFwArBCvsKwQr0CvsKwQrUCvQKsgo2BTcF9QqzCqUK4gr2CqUKswrBCqMK1AqjCsEK1Aq1CqMKfwUqBRgFIgWoCioF7QrECsUKqQrtCsQKqQr8Cu0KIgXGCnQF3QrZCu4K8ArlCuAK0ArhCvEK2wrnCuYKyAq+CucK8grnCr4KygoWC9wKrAroCvoKpQr2CvUKwQr7CvcKwQr3CtQK1Ar0CrUK6QrqCgEL6wq0CtYK1gq3Cu0KxArtCrcK7QrFCvgKxQrXCvgK/Qr4CtcKxQr9CtcKIgV0BTsF2Qq6Cu4KMAWNBTEFugrgCt0K7woxBXYF8QrhChULsQq9CgoLvgrJCvIK3ApBBYoF8wroCq0KNgX6CjcF+wqzCvUKswr7CsEK9ArUCvcKtgq0CuIK1QoDC7QK1Qq4CgUL1grtCusKqQrECq8KdAXGCgcLrwrECrkK7gr5Ct0K+QruCv4K5Aq6Ct0K7gq6Ct0KdgUxBY0F5QrdCuAKMQXSCnYF4ArxCuUKbgUmBTEFvArnCr0KvArbCucK8gr/CuYK4QoUCxULsQoKCwkLCQvhCrEKyQrLCgAL3AqKBcoKewWKBUEFywrcCgsL+groCvMK9wr7CvUK+gpoBTcFcgU3BWgF1Aq1CgILtAoDC+IKtQr0CgILAwvVCgQL1QoFCwQL6wrtCvgKxgoiBQcL+Ar9CsUKrwr8CqkK/AqvCuQKdAWUBTsF7grdCuUK8AruCuUKdgVuBTEF8QoVCxQL5grnCvIKvQq8CgoL8grJCgALCwsAC8sKigUWC8oK3AqKBRkL+wr0CvMKAgv0CtQKAQvpCvcKBAsXCwML6woFC7gKdAWiBZQF5ArdCvkK7wp2BRIL7wp2BdIK5QoTC/AK5QrxChMLCAu8Cr0KCgu8CggLvQrnCgoLCQsUC+EKFgsZC9wKJAv6CvMKGwsBC/cKAQsbC+kKAwsEC+IK7AoYCwYLIgV0BQcLBwsOC3QFogV0BQ4L/AoNC+0K/ArkCg0LHgvjCv0KBwsRCw4L4woeCw8LDgsRCxALjQWUBaUFjQWlBXYFvQoKCwgL8QoUCxMLGQsLC9wKJAslC/oK9QoaC/cK9Qr2ChoL9woaCxsLBAv2CuIK6QobC+oKBAsFCxcL6gobCycL6gonC+wK+AooC+sKHQv9ChwL+Ar9Ch0L/QrjChwLDAvtCg0L+Qr+Cg0LKQsRCwcLmgWiBQ4L+QoNC+QKDgsQC5oFmgWUBaIFEQsgCxALmgWlBZQF7grwCiwLEgt2BSALFAsjCxMLJQvzCvQKGwsaC/YK9AoCCyULwAWRBXIF9goECxsLBAsXCxsLJwvpCuoK7AoxCxgLIQsfCyoLmgUQCyALdgWlBSAL7wqdBXYF8AoTCy4L8AouCy0LCQsiCzULIgsJCwoLFAsJCyILFAsiCyML8goACzkLAAsLCy8L8wolCyQL+golCzALwAVyBbYFGgv0CvcKJQsCCyYLJgv0ChoL9AomCwILOwsXCwULJwsxC+wK4woyC/0K4woYCzILKAv4Ch0LHAv9CvgK+ArtCh0L7QoMCx0L4woPC/0KHAseC/0KDQv+CisLHgscCx8L+QruCg0LLAsNC+4KpQWaBSALIAszCxILbgWoBTwL5gr/CucKCgtICyILCAsKCzYLEwsjCy4LFguKBTgLAAsvCzkLCwtACy8LCwsZC0ALMAtoBfoKvwVoBTALMAslC0ELJQsmC0EL9wrpChoL6QonCxsL6wooCwULHAv9CjILHAsyC+MKBwt0BaIFHQscC/gKKgsfCysLnQXvChILSAsKCwgL8grnCv8KIgs1CyML5wryCjcLCgvnCjYLNwvyCjkLFgs4CxkLGQu1BYoFGQuKBUAL6QobCxoLOgsmCxoLOwsbCxcLOwsFCygLKAsdCzsLMgsYCzELogW4BT0LBwsOCykLDAtDCx0L/QoPCxwLDwsfCxwLKQsOCxELDQsrCwwLDwseCx8LLQssC/AKPAuoBZ0F8gr/CjcL5wo3C0oLigW1BTgLtQUZCzgLGws6CxoLGws6CyYLGwtCCycLJwtCCzELOwsdCxwLMgtNCxwLQwsMCw0LHwscC0MLKgsrCyELCAs2C0gLNwv/CkkLSgs2C+cKtQVAC4oFOwtCCxsLMQtCCzILMgtCC00LHAsdC0MLQwtOCx8LKwtOCw0LLQtGCywLLgtHCy0LPAsSC24FvwXXBbYFOwtMC0ILGAs+CzELOwscC0wLHAtNC0wLBwuiBQ4LKwsfC04LQwsNC04LUAtEC1gLEAszC08LMwsgCxALDQssC0YLLQs0C1ILLQtSC0YLEgulBZ0FRws0Cy0LRwtSCzQLNQtUCyMLLgsjC1QLqAVuBRILGgtVCyULGgslCzoLJgs6CyULMQsYCycLTAtNC0ILDguiBRALIAtPCxALUQtFC1ALDQtGC1kLDQtZCysLWwtGC1ILpQUSCyALNAtcCz8LEgs8C50FVAs1C1ILRwsuC1QLNwtJC2ILNwtiC0oLSgtiC2gL1wW/BTALJQteCzAL1wUwC14LJQtVC14LXwsaC1YLOgtWCxoLGwtWCzoLJwtjCxsLJwsYC0ILVwtCCxgLGAsxC1cLMQs+C1cLGAthCz4LPgthC2QLogWaBRALTwsgC5oFHwshC04LKwtZC04LKwtOCyELNAs/C1ILXAs0C1ILVAtSC0cLEgudBagFNQsiC1QLSAs2CyILOAu1BfMFSwteC1ULGgtWC1ULVgtgC1ULVQtgC0sLGwtjC1YLVws+C2EL4gWiBbgFQwtqCxwLHwsdCxwL4gX1BaIFogX1BZoFHQsfC04LTQtYC0QLTwuaBfUFUQtQC1gLUAtFC1gLTgtZC1sLIQtOC3MLUgs/C1wLZQsSC50FnQXaBWULNgttCyILYgs3C2gLaAs2C0oLNws5C3YL8wWpBfEFLwtuCzkLqQXzBbUFLwtAC2kLQAt3C2kL1wVeC28LXgtLC28LYwsnC0ILYQsYCzILTQsyC2oLMgtNC2ELMgscC2oLHQtOC0MLWwtZC0YLIgttC2wLNgtoC20LYwt5C1YLYwtCC3kLcAtxC0sLcQtkC3ILTQtqC0ILTQtCC2ELTgtbC3MLZwt1C2YLnQXaBagF+AWoBdoFVAsiC2wLOQtuC3YLbgsvC2kLdwtAC/MFbwsHBtcFbwtLC3gLQgtXC3kLcQtyC3ALuAX6BeIFQwt/C2oLegtqC38Lagt6C00LTgtzC3wLWAtFC1ELUQt7C1oLUguBC1sLXAtTC1ILUwuDC4QLUwtaC4MLUwtdC2cLUwtnC5ULXQtTC5ULNwt2C2gLdwuLC2kLfQtgC1YLVgt5C30LYAt9C0sLSwtwC40LYQuMC1cLcQuNC3ILQgt+C2ELQgtNC3oLYQtkC34LTQt6C1gLQwtOC5ALeguPC1gLTgt8C5ALWAuQC3sLUQtYC3sLUQuPC1gL9QUQC08LEAv1BZoFgAtzC1sLkwtaC3sLUgtTC4ILUwtdC1oLhAtTC1wLbAuFC1QLlQuHC10LbAuGC4ULdAuHC2sLbAttC4YLawuIC4kLbQtoC4oLdguRC2gLbgtpC3YLdwvzBZcLbwt4CwcGjAt9C3kLjQt4C0sLjAt5C1cLcguNC3ALcAuNC3ELfguMC2ELjgtyC40LTwv1BRsGkAt/C0MLjwuQC1gLfAtzC4ALWwuBC4ALWguTC4MLXAuCC4QLUwuEC2cLUguCC1wLdQtnC5ULUgtUC4UL+AXaBR8GdQuFC4YLlQuKC2gLbQuKC4YLkQuKC2gLiwt3C5cL6AUHBvoFFwb6BQcGSwt9C4wLSwuMC3ALjQtwC4wLQgt6C34Legt/C48LkAt8C4ALUQt7C48LmAvZBZ0LgQtSC4ALgguAC1ILUwt7C4IL2QUqBtoFZQvaBSUGUwuEC3sLXQtTC4QLewuEC4ILhwtnC10LUguBC4ILhQuBC1ILZwuEC5ULdQuCC4ULXQuHC3QLhwuWC2sLawuWC4gLdguWC5ELdgtpC5YLaQubC5YLBwZ4C40LBwaNCxcGjQuOCxcGfgthC5ILTwsbBpwLjgucCxsGWAtEC54LfwuQC48LHQb1BU8LkAuZC3sLUQtaC5MLgAuCC5kLWgtdC4MLJQbaBSoGgwuTC4QLXQuDC4cLUwuVC4QLZwuHC5ULgQuFC4ILigt1C4YLhwuRC5YLFgaXC/MFjQuMC44LjAt+C5ILWAueC3oLkAuAC5kLjwt7C5ALmAudCyoGmAsqBtkFewuEC5MLhAuDC10LhAuCC5ULggt1C5ULlQt1C4oLhwugC5ELaQuJC5sLlwsWBiQGFwYzBhsGHQZPC5wLWAuPC54L2QUqBp0Lgwt7C1ELggt7C5kLUQuTC4MLkwuaC5QLoAuHC5ULlgubC4kLJAYWBokLjAuSC44LegueC6ELoguSC6ULnguPC3oLjwumC5MLgwuEC3sLRAYlBqMLJQYfBtoFiQuWC4gLlQuKC6ALoAuKC5ELGwYzBqoLfguhC5ILeguhC34LHQaOCxsGjgsdBpwLnAudC0UGRQadCyoGjwt7C6YLhAuVC6cLlQuHC6cLmguoC4gLmguIC58LowutC0QGrQsvBkQGMgYfBi8GFgYfBjIGFwaOCzMGjguSC6kLkguhC6kLkgupC6ULnAtFBqQLHQZFBioGrAuTC6YLewuEC6YLRAYqBkEGlAuaC58LRAYlBioGhAunC6YLrAuvC5oLrAuaC5MLhwugC6cLqAuaC68LiQsWBi8GjguqCzMGjgupC6oLqwuhC3oLpgurC48LKgZFBkEGrAumC68LpwugC68LlguzC4cLlguJC7MLiQsvBrALqQulC6oLqQuxC6ULtAukC64LQQZFBqQLkwuUC58LrwumC6cLqAuvC6ALnwuoC7ILiAuoC58LoAuHC6gLswuoC4cLsAuzC4kLsAsvBq0LqgukC0UGqgtFBjMGrAuTC58LrgufC7ILrguyC0EGsAutC6gLsQupC6ELpQukC6oLsQuhC6sLqwusC7ELqwumC6wLpQuxC7ULrgtBBqQLtAu3C64LsguoC60LswuwC6gLtAukC7cLnwu3C6wLtwu4C64LsgtEBkEGsgutC0QGpAulC7ULtwukC7ULtgu1C7ELtguxC6wLtwu2C6wLtwufC7gLrgu4C58Ltwu1C7YL6AcjCBAI6AcQCHQHqgfuAecH5wf2B6oHmwioCAsIqAgcCAsIqAhOCBwIKgkuCSEJMwrxCa0ErQR+BMMErQSiCjMKMwqiClAKQAu1BfMFiwuJC2kLiwuXC4kLlwskBokLjwurC3oLuQvFC7oLugvFC8YLugvGC7sLuwvGC8cLuwvHC7wLvAvHC8gLvAvIC70LvQvIC8kLvQvJC74LvgvJC8oLvgvKC78LvwvKC8sLvwvLC8ALwAvLC8wLwAvMC8ELwQvMC80LwQvNC8ILwgvNC84LwgvOC8MLwwvOC88LwwvPC8QLxAvPC9ALxAvQC7kLuQvQC8ULxQvRC8YLxgvRC9ILxgvSC8cLxwvSC9MLxwvTC8gLyAvTC9QLyAvUC8kLyQvUC9ULyQvVC8oLygvVC9YLygvWC8sLywvWC9cLywvXC8wLzAvXC9gLzAvYC80LzQvYC9kLzQvZC84LzgvZC9oLzgvaC88LzwvaC9sLzwvbC9AL0AvbC9wL0AvcC8ULxQvcC9EL0QvdC9IL0gvdC94L0gveC9ML0wveC98L0wvfC9QL1AvfC+AL1AvgC9UL1QvgC+EL1QvhC9YL1gvhC+IL1gviC9cL1wviC+ML1wvjC9gL2AvjC+QL2AvkC9kL2QvkC+UL2QvlC9oL2gvlC+YL2gvmC9sL2wvmC+cL2wvnC9wL3AvnC+gL3AvoC9EL0QvoC90L3QvpC94L3gvpC98L3wvpC+AL4AvpC+EL4QvpC+IL4gvpC+ML4wvpC+QL5AvpC+UL5QvpC+YL5gvpC+cL5wvpC+gL6AvpC90L";
const BRAIN_L_B64 = "AACAPwAAgD8AAAAAAACAPwAAAAAAAAAAAAAAAAAAAAAAAIA/AADgQAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAPwAAgD8AAAAAAADgQAAAAAAAAAAAAACAPwAAAAAAAIA/AAAAAAAA4EAAAIA/AADgQAAAAAAAAIA/AADgQAAA4EAAAAAAAAAAAAAAgD8AAIA/AACAPwAAAAAAAAAAAACAPwAAgD8AAIA/AADgQAAA4EAAAIA/AACAPwAA4EAAAOBAAADgQAAA4EAAAOBAAADgQAAAAAAAAOBAAAAAAAAAgD8AAOBAAADgQAAAAAAAAOBAAADgQAAA4EAAAOBAAADgQAAAgD8AAAAAAACAPwAA4EAAAIA/AACAPwAAgD8AAAAAAADgQAAAAAAAAOBAAADgQAAA4EAAAAAAAAAAAAAA4EAAAIA/AACAPwAAgD8AAOBAAADgQAAA4EAAAAAAAADgQAAA4EAAAIA/AACAPwAA4EAAAAAAAADgQAAA4EAAAAAAAACAPwAAgD8AAOBAAACAPwAA4EAAAAAAAAAAAAAAgD8AAIA/AACAPwAAgD8AAOBAAADgQAAAAAAAAAAAAADgQAAAgD8AAIA/AACAPwAA4EAAAOBAAACAPwAAgD8AAIA/AACAPwAAAAAAAAAAAADgQAAA4EAAAOBAAACAPwAAgD8AAIA/AACAPwAAgD8AAIA/AACAPwAAgD8AAOBAAADgQAAA4EAAAOBAAAAAAAAA4EAAAIA/AACAPwAAgD8AAOBAAADgQAAA4EAAAOBAAADgQAAA4EAAAAAAAADgQAAA4EAAAIA/AACAPwAAgD8AAIA/AADgQAAAgD8AAOBAAADgQAAAAAAAAOBAAACAPwAAgD8AAAAAAAAAAAAA4EAAAOBAAADgQAAAgD8AAIA/AAAAAAAAgD8AAAAAAAAAAAAA4EAAAOBAAADgQAAA4EAAAOBAAAAAAAAAgD8AAOBAAADgQAAAAAAAAAAAAAAAAAAAAAAAAOBAAADgQAAAgD8AAAAAAAAAAAAAAAAAAAAAAAAAAAAA4EAAAOBAAACAPwAAAAAAAAAAAAAAAAAAAAAAAAAAAADgQAAAAAAAAAAAAAAAAAAAAAAAAOBAAADgQAAA4EAAAOBAAAAAAAAA4EAAAAAAAADgQAAA4EAAAOBAAADgQAAA4EAAAAAAAAAAAAAAgD8AAAAAAADgQAAAAAAAAOBAAAAAAAAAAAAAAAAAAAAAAAAAgD8AAAAAAAAAAAAAgD8AAAAAAAAAAAAA4EAAAAAAAAAAAAAAAAAAAOBAAADgQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOBAAADgQAAA4EAAAOBAAAAAAAAAAAAAAAAAAAAAAAAA4EAAAOBAAADgQAAAAAAAAOBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOBAAADgQAAA4EAAAOBAAADgQAAA4EAAAOBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOBAAADgQAAA4EAAAEBAAADgQAAAAAAAAOBAAAAAAAAA4EAAAOBAAAAAAAAAAAAAAAAAAAAAAAAA4EAAAAAAAAAAAAAA4EAAAEBAAABAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4EAAAAAAAADgQAAAAAAAAAAAAAAAAAAA4EAAAOBAAADgQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADgQAAAAAAAAAAAAADgQAAA4EAAAAAAAADgQAAA4EAAAEBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4EAAAAAAAADgQAAA4EAAAOBAAADgQAAAQEAAAEBAAABAQAAAQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4EAAAOBAAADgQAAA4EAAAOBAAABAQAAAQEAAAAAAAAAAAAAAAAAAAAAAAADgQAAA4EAAAOBAAADgQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4EAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4EAAAAAAAAAAAAAA4EAAAAAAAADgQAAA4EAAAEBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADgQAAA4EAAAOBAAAAAAAAA4EAAAOBAAADgQAAAQEAAAEBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADgQAAA4EAAAOBAAADgQAAA4EAAAEBAAAAAAAAAAAAAAOBAAAAAAAAAAAAAAOBAAADgQAAA4EAAAOBAAADgQAAAQEAAAAAAAAAAAAAAAAAAAAAAAADgQAAA4EAAAOBAAABAQAAAQEAAAAAAAAAAAAAAAAAAAAAAAADgQAAA4EAAAOBAAABAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOBAAADgQAAA4EAAAOBAAADgQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADgQAAA4EAAAOBAAABAQAAAQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOBAAADgQAAA4EAAAOBAAABAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOBAAAAAAAAA4EAAAEBAAABAQAAA4EAAAEBAAABAQAAAQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4EAAAOBAAABAQAAAQEAAAEBAAABAQAAAQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOBAAAAAAAAAQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOBAAABAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4EAAAAAAAADgQAAAAAAAAOBAAADgQAAAQEAAAOBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4EAAAAAAAADgQAAAQEAAAEBAAADgQAAAQEAAAEBAAABAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOBAAABAQAAAAAAAAOBAAADgQAAAQEAAAAAAAABAQAAAQEAAAEBAAABAQAAAQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQEAAAOBAAABAQAAAAAAAAOBAAABAQAAAQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4EAAAAAAAAAAAAAAQEAAAEBAAABAQAAAQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQEAAAEBAAABAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAQAAAQEAAAEBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEBAAAAAAAAAQEAAAEBAAABAQAAAQEAAAEBAAABAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAQAAAAAAAAEBAAABAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAQAAAQEAAAEBAAAAAAAAAQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQEAAAEBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAABAQAAAQEAAAAAAAABAQAAAQEAAAEBAAABAQAAAQEAAAEBAAABAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAEAAAAAAAABAQAAAQEAAAAAAAABAQAAAQEAAAEBAAABAQAAAQEAAAEBAAABAQAAAQEAAAEBAAAAAQAAAAEAAAAAAAAAAAAAAQEAAAABBAABAQAAAQEAAAEBAAAAAQAAAAEAAAABAAAAAQAAAAAAAAEBAAAAAAAAAAAAAAAAAAAAAQAAAAEAAAABAAAAAQQAAQEAAAABBAABAQAAAAEEAAABBAAAAAAAAQEAAAEBAAABAQAAAQEAAAABAAAAAQAAAAEAAAABAAAAAQAAAAAAAAABAAAAAQAAAQEAAAABBAAAAQQAAAEEAAAAAAABAQAAAAAAAAAAAAAAAQAAAAEAAAABAAAAAQAAAAEAAAAAAAAAAQAAAAEAAAABAAAAAQQAAAEEAAAAAAAAAAAAAAAAAAEBAAABAQAAAAAAAAEBAAABAQAAAQEAAAEBAAABAQAAAAEAAAABAAAAAQAAAAEAAAABAAAAAQAAAAEAAAABAAAAAQQAAQEAAAABBAABAQAAAQEAAAEBAAABAQAAAQEAAAEBAAABAQAAAAEAAAEBAAABAQAAAQEAAAEBAAABAQAAAQEAAAABAAAAAQAAAAEAAAABAAAAAAAAAQEAAAEBAAABAQAAAQEAAAABAAAAAQAAAAEAAAABAAAAAQQAAQEAAAABBAAAAAAAAQEAAAABBAABAQAAAAEAAAABBAAAAQQAAQEAAAEBAAAAAQAAAAEAAAABBAABAQAAAQEAAAABAAAAAQAAAAEAAAABAAAAAQQAAAEEAAABBAAAAQQAAAAAAAEBAAABAQAAAAEAAAABAAAAAQQAAAEEAAEBAAAAAAAAAAEAAAABAAAAAQAAAAEAAAABAAAAAAAAAAEEAAABBAAAAQQAAQEAAAAAAAABAQAAAQEAAAABAAAAAQAAAAEAAAABAAAAAQAAAAEEAAABBAAAAQQAAAAAAAABBAAAAAAAAAAAAAEBAAABAQAAAQEAAAEBAAAAAQAAAAEAAAABAAAAAQAAAAEAAAABAAAAAQQAAAEAAAABBAAAAQQAAAAAAAEBAAAAAQAAAAEAAAABAAAAAQAAAAEAAAABAAAAAQAAAAEAAAABAAAAAQQAAAEEAAABBAAAAAAAAAEEAAEBAAABAQAAAQEAAAABAAAAAQAAAAEAAAABAAAAAQAAAAEEAAEBAAABAQAAAQEAAAEBAAAAAQAAAAEAAAABAAAAAQAAAAEAAAABAAAAAQAAAAEEAAABAAAAAQQAAAEEAAEBAAABAQAAAQEAAAEBAAAAAQAAAAEAAAABAAAAAQAAAAEAAAABAAAAAQAAAAEAAAABBAAAAQQAAAEEAAABBAABAQAAAQEAAAEBAAABAQAAAQEAAAEBAAAAAQAAAAEAAAABAAAAAQAAAAEAAAABAAAAAQAAAAEAAAABBAAAAQQAAAEEAAAAAAAAAAAAAAEEAAABBAABAQAAAQEAAAEBAAABAQAAAQEAAAEBAAABAQAAAAEAAAABAAAAAQAAAAEEAAABBAAAAQQAAAEEAAEBAAABAQAAAQEAAAABAAAAAQAAAAEAAAABAAAAAQQAAQEAAAAAAAAAAAAAAQEAAAEBAAABAQAAAQEAAAEBAAABAQAAAQEAAAEBAAAAAQAAAAEAAAABAAAAAQAAAAEEAAAAAAAAAQQAAAAAAAEBAAAAAQAAAAEAAAAAAAABAQAAAAEAAAABAAAAAQQAAAEEAAEBAAAAAQAAAAEAAAABAAAAAQAAAAEEAAABBAAAAQQAAAAAAAEBAAAAAQAAAAEAAAABAAAAAQAAAAEAAAABAAAAAQQAAAEEAAABAAAAAQQAAAEEAAAAAAAAAAAAAQEAAAAAAAABAQAAAQEAAAEBAAABAQAAAQEAAAEBAAAAAQAAAAEAAAABAAACgQAAAAEAAAKBAAAAAQQAAAEEAAABBAAAAQQAAAEEAAABBAAAAAAAAAEEAAABBAAAAAAAAAEEAAEBAAAAAAAAAQEAAAEBAAAAAQAAAAEAAAABAAAAAQAAAAEAAAABAAAAAQQAAAEEAAABBAAAAQQAAAEEAAABBAAAAQQAAAAAAAEBAAAAAQAAAAEAAAKBAAACgQAAAoEAAAABAAAAAQQAAQEAAAAAAAABAQAAAQEAAAKBAAACgQAAAoEAAAKBAAAAAQQAAAEAAAABBAABAQAAAAAAAAEBAAABAQAAAQEAAAEBAAABAQAAAoEAAAKBAAAAAQQAAAEEAAABBAAAAQQAAAEEAAABBAABAQAAAQEAAAKBAAACgQAAAoEAAAKBAAACgQAAAoEAAAKBAAAAAQQAAAEEAAABBAABAQAAAQEAAAEBAAABAQAAAoEAAAKBAAACgQAAAoEAAAKBAAACgQAAAoEAAAKBAAAAAQQAAAEEAAABBAAAAQQAAAEEAAKBAAABAQAAAQEAAAEBAAAAAAAAAQEAAAKBAAACgQAAAoEAAAKBAAACgQAAAoEAAAABBAACgQAAAoEAAAEBAAACgQAAAoEAAAKBAAAAAQQAAoEAAAABBAAAAQQAAAEEAAKBAAABAQAAAoEAAAKBAAACgQAAAoEAAAKBAAAAAQQAAAEEAAABBAACgQAAAQEAAAKBAAACgQAAAoEAAAABBAACgQAAAoEAAAABBAADAQAAAoEAAAKBAAACgQAAAoEAAAKBAAACgQAAAAEEAAKBAAAAAQQAAAEEAAABBAADAQAAAwEAAAEBAAADAQAAAwEAAAKBAAACgQAAAoEAAAKBAAACgQAAAoEAAAKBAAAAAQQAAoEAAAABBAAAAQQAAAEEAAMBAAACgQAAAoEAAAKBAAACgQAAAAEEAAABBAADAQAAAwEAAAMBAAADAQAAAwEAAAMBAAADAQAAAoEAAAKBAAACgQAAAoEAAAABBAACgQAAAAEEAAKBAAADAQAAAAEEAAABBAADAQAAAoEAAAKBAAACgQAAAoEAAAABBAAAAQQAAAEEAAMBAAADAQAAAwEAAAMBAAADAQAAAoEAAAKBAAACgQAAAAEEAAMBAAACgQAAAoEAAAKBAAACgQAAAoEAAAEBAAACgQAAAwEAAAMBAAADAQAAAwEAAAKBAAACgQAAAoEAAAKBAAACgQAAAoEAAAKBAAABAQAAAQEAAAKBAAADAQAAAwEAAAMBAAACgQAAAoEAAAKBAAACgQAAAoEAAAKBAAACgQAAAoEAAAEBAAABAQAAAwEAAAMBAAADAQAAAwEAAAMBAAACgQAAAoEAAAKBAAACgQAAAoEAAAEBAAADAQAAAwEAAAMBAAADAQAAAwEAAAKBAAACgQAAAoEAAAKBAAABAQAAAQEAAAMBAAADAQAAAwEAAAMBAAADAQAAAwEAAAKBAAACgQAAAoEAAAKBAAABAQAAAQEAAAKBAAABAQAAAQEAAAMBAAACgQAAAQEAAAMBAAACgQAAAoEAAAKBAAACgQAAAoEAAAKBAAACgQAAAwEAAAKBAAACgQAAAoEAAAKBAAACgQAAAoEAAAEBAAADAQAAAwEAAAMBAAADAQAAAwEAAAMBAAACgQAAAoEAAAEBAAACgQAAAQEAAAEBAAABAQAAAQEAAAMBAAADAQAAAwEAAAMBAAADAQAAAwEAAAMBAAACgQAAAoEAAAKBAAADAQAAAwEAAAKBAAACgQAAAoEAAAEBAAACgQAAAwEAAAMBAAACgQAAAoEAAAEBAAACgQAAAQEAAAMBAAADAQAAAwEAAAKBAAACgQAAAoEAAAKBAAABAQAAAoEAAAKBAAACgQAAAwEAAAMBAAADAQAAAwEAAAKBAAACgQAAAoEAAAEBAAACgQAAAoEAAAEBAAADAQAAAwEAAAMBAAADAQAAAoEAAAKBAAACgQAAAoEAAAKBAAACgQAAAwEAAAMBAAADAQAAAoEAAAKBAAABAQAAAwEAAAMBAAADAQAAAwEAAAMBAAACgQAAAQEAAAEBAAABAQAAAwEAAAMBAAABAQAAAQEAAAEBAAABAQAAAQEAAAMBAAADAQAAAwEAAAMBAAABAQAAAoEAAAEBAAACgQAAAwEAAAMBAAACgQAAAoEAAAKBAAACgQAAAoEAAAKBAAACgQAAAQEAAAEBAAABAQAAAQEAAAMBAAACgQAAAoEAAAKBAAABAQAAAQEAAAKBAAABAQAAAwEAAAMBAAADAQAAAwEAAAMBAAACgQAAAoEAAAEBAAADAQAAAwEAAAMBAAACgQAAAQEAAAKBAAADAQAAAwEAAAMBAAADAQAAAQEAAAEBAAADAQAAAwEAAAMBAAADAQAAAoEAAAKBAAACgQAAAQEAAAMBAAADAQAAAwEAAAMBAAADAQAAAwEAAAKBAAABAQAAAQEAAAMBAAADAQAAAwEAAAKBAAACgQAAAoEAAAKBAAACgQAAAQEAAAKBAAADAQAAAwEAAAMBAAACgQAAAQEAAAMBAAADAQAAAwEAAAMBAAADAQAAAwEAAAEBAAACgQAAAoEAAAKBAAADAQAAAwEAAAMBAAACgQAAAwEAAAMBAAACgQAAAQEAAAEBAAACgQAAAQEAAAKBAAADAQAAAwEAAAMBAAADAQAAAwEAAAKBAAABAQAAAoEAAAKBAAACgQAAAoEAAAMBAAACgQAAAoEAAAKBAAACAPwAAgD8AAAAAAAAAAAAAgEAAAIBAAACAPwAAgD8AAIA/AAAAAAAAAAAAAIA/AACAPwAAgD8AAAAAAAAAAAAAgEAAAAAAAACAPwAAgEAAAIBAAACAQAAAgEAAAIBAAAAAAAAAgD8AAIBAAACAQAAAgD8AAIBAAACAQAAAgEAAAAAAAACAQAAAAAAAAIA/AACAPwAAAAAAAIA/AACAPwAAgD8AAIBAAAAAAAAAgEAAAIBAAACAPwAAgD8AAIA/AACAPwAAgEAAAIBAAACAQAAAgD8AAIA/AAAAAAAAAAAAAIBAAACAPwAAgD8AAIA/AACAQAAAAAAAAIBAAACAQAAAgD8AAIBAAACAQAAAgD8AAIA/AACAPwAAgD8AAIBAAACAPwAAgEAAAAAAAACAQAAAgEAAAIBAAACAPwAAgD8AAIA/AACAPwAAgEAAAIBAAACAPwAAgD8AAIBAAACAQAAAgEAAAIA/AACAPwAAgD8AAIBAAACAQAAAgEAAAAAAAACAPwAAAAAAAIBAAACAQAAAAAAAAIA/AAAAAAAAgEAAAAAAAACAQAAAgD8AAAAAAACAQAAAgD8AAAAAAAAAAAAAgD8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAgD8AAAAAAACAPwAAgEAAAAAAAACAQAAAAAAAAIBAAACAQAAAgEAAAAAAAACAPwAAAAAAAIBAAACAQAAAgEAAAAAAAAAAAAAAAAAAAAAAAACAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAQAAAgEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgEAAAAAAAACAQAAAgEAAAIBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAQAAAAAAAAIBAAACAQAAAgEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIBAAACAQAAAgEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAQAAAgEAAAIBAAACAQAAAgEAAAAAAAAAAAAAAAAAAAIBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgEAAAIBAAACAQAAAAAAAAAAAAAAAAAAAgEAAAIBAAACAQAAAgEAAAAAAAAAAAAAAAAAAAAAAAACAQAAAgEAAAAAAAACAQAAAgEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAQAAAAAAAAIBAAACAQAAAAAAAAAAAAAAAAAAAAAAAAIBAAACAQAAAAAAAAAAAAACAQAAAgEAAAIBAAACAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAQAAAgEAAAIBAAACAQAAAgEAAAIBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIBAAACAQAAAgEAAAAAAAAAAAAAAAAAAAIBAAACAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgEAAAIBAAACAQAAAgEAAAAAAAAAAAAAAAAAAAAAAAACAQAAAAAAAAIBAAAAAAAAAAAAAAIBAAAAAAAAAgEAAAIBAAACAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgEAAAIBAAAAAAAAAgEAAAIBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAQAAAgEAAAIBAAACAQAAAgEAAAIBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAQAAAgEAAAIBAAACAQAAAgEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgEAAAIBAAACAQAAAAAAAAAAAAAAAAAAAAAAAAIBAAACAQAAAgEAAAIBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIBAAACAQAAAgEAAAAAAAAAAAAAAgEAAAIBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAQAAAgEAAAAAAAAAAAAAAAAAAAAAAAACAQAAAgEAAAIBAAACAQAAAgEAAAIBAAACAQAAAgEAAAIBAAACAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgEAAAAAAAAAAAAAAAAAAAIBAAACAQAAAgEAAAIBAAACAQAAAgEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgEAAAIBAAACAQAAAAAAAAAAAAACAQAAAAAAAAAAAAACAQAAAgEAAAIBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgEAAAIBAAACAQAAAgEAAAIBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAQAAAgEAAAIBAAACAQAAAgEAAAIBAAACAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIBAAAAAAAAAgEAAAIBAAAAAAAAAgEAAAIBAAACAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAQAAAgEAAAIBAAAAAAAAAgEAAAIBAAACAQAAAAAAAAIBAAACAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIBAAACAQAAAAAAAAIBAAACAQAAAgEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIBAAACAQAAAgEAAAIBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgEAAAIBAAACAQAAAgEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAQAAAAAAAAIBAAACAQAAAgEAAAIBAAACAQAAAgEAAAIBAAAAAAAAAAAAAAAAAAACAQAAAAAAAAIBAAAAAAAAAgEAAAIBAAACAQAAAgEAAAIBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgEAAAIBAAACAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgEAAAAAAAACAQAAAgEAAAIBAAACAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgEAAAAAAAACAQAAAgEAAAIBAAACAQAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAQAAAgEAAAIBAAAAAAAAAgEAAAIBAAACAQAAAgEAAAIBAAACAQAAAAEAAAABAAAAAAAAAAEAAAABAAAAAQAAAgEAAAIBAAACAQAAAgEAAAIBAAAAAAAAAAAAAAAAAAACAQAAAgEAAAIBAAACAQAAAAEAAAABAAAAAQAAAAEAAAABAAAAAAAAAAAAAAIBAAACAQAAAAAAAAIBAAACAQAAAgEAAAABAAAAAQAAAgEAAAIBAAACAQAAAAEAAAABAAAAAQAAAAEAAAABAAACAQAAAgEAAAIBAAAAAAAAAgEAAAIBAAACAQAAAgEAAAIBAAACAQAAAgEAAAABAAAAAQAAAAEAAAABAAAAAQAAAAEAAAIBAAACAQAAAgEAAAAAAAACAQAAAgEAAAABAAAAAQAAAAEAAAABAAAAAQAAAAEAAAABAAACAQAAAgEAAAIBAAACAQAAAgEAAAIBAAAAQQQAAAEAAAABAAACAQAAAgEAAAIBAAACAQAAAgEAAAABAAAAAAAAAgEAAAIBAAAAQQQAAAEAAAABAAAAAQAAAgEAAAIBAAACAQAAAAEAAAABAAACAQAAAAEAAAIBAAAAAQAAAgEAAAIBAAACAQAAAAEAAAIBAAACAQAAAgEAAAIBAAAAAQAAAgEAAAIBAAACAQAAAgEAAAIBAAACAQAAAgEAAAABAAACAQAAAgEAAAIBAAACAQAAAAEAAAIBAAACAQAAAgEAAAIBAAACAQAAAAAAAAIBAAACAQAAAAEAAAABAAAAAQAAAAEAAAABAAAAAQAAAAEAAAABAAAAAQAAAAEAAAIBAAACAQAAAAAAAAABAAAAAQAAAAEAAAABAAAAAQAAAAEAAAABAAAAAQAAAgEAAAIBAAAAAAAAAAAAAAIBAAACAQAAAAAAAAAAAAACAQAAAgEAAAAAAAACAQAAAgEAAABBBAAAAQAAAAEAAAABAAAAAQAAAAEAAAABAAAAAQAAAAEAAAIBAAACAQAAAgEAAAIBAAACAQAAAgEAAAIBAAACAQAAAAEAAAIBAAACAQAAAgEAAAIBAAACAQAAAgEAAAIBAAACAQAAAgEAAAIBAAACAQAAAAAAAAABAAAAAQAAAAEAAAABAAAAAQAAAAEAAAABAAACAQAAAgEAAAIBAAACAQAAAgEAAAIBAAAAAQAAAAEAAAABAAAAAQAAAAEAAAABAAAAAQAAAAEAAAIBAAACAQAAAgEAAAIBAAACAQAAAAAAAAABAAAAAQAAAAEAAAABAAAAAQAAAAEAAAABAAAAAQAAAAEAAAABAAAAAQAAAgEAAAIBAAAAAQAAAgEAAAIBAAACAQAAAgEAAAIBAAACAQAAAgEAAAIBAAACAQAAAgEAAAIBAAAAAQAAAAEAAAABAAAAAQAAAAEAAAABAAAAAQAAAAEAAAAAAAACAQAAAAAAAAIBAAAAAQAAAAEAAAIBAAACAQAAAgEAAAIBAAACAQAAAAEAAAABAAACAQAAAgEAAAIBAAACAQAAAgEAAAIBAAACAQAAAAEAAAIBAAACAQAAAgEAAAIBAAAAAQAAAAEAAAABAAACAQAAAgEAAAIBAAACAQAAAgEAAAIBAAAAAQAAAAEAAAABAAAAAQAAAAEAAAABAAACAQAAAgEAAAIBAAACAQAAAgEAAAIBAAACAQAAAgEAAAIBAAACAQAAAgEAAAABAAAAAQAAAAEAAAABAAAAAQAAAgEAAAIBAAACAQAAAAAAAAIBAAACAQAAAAAAAAIBAAACgQAAAgEAAAIBAAACAQAAAgEAAAIBAAACAQAAAgEAAAAAAAACAQAAAAEAAAABAAAAAQAAAAEAAAABAAACgQAAAgEAAAIBAAACAQAAAgEAAAABAAAAAQAAAAEAAAABAAACgQAAAAEAAAABAAACAQAAAgEAAAIBAAACAQAAAgEAAAKBAAACgQAAAoEAAAKBAAACgQAAAoEAAAKBAAAAAQAAAoEAAAKBAAACAQAAAgEAAAIBAAACAQAAAgEAAAIBAAACgQAAAoEAAAKBAAACgQAAAoEAAAKBAAACgQAAAoEAAAKBAAACgQAAAgEAAAIBAAACAQAAAAAAAAAAAAACAQAAAoEAAAKBAAACgQAAAoEAAAKBAAACgQAAAoEAAAKBAAACAQAAAgEAAAIBAAACAQAAAAAAAAIBAAACAQAAAoEAAAKBAAACgQAAAoEAAAKBAAACgQAAAgEAAAIBAAACAQAAAgEAAAIBAAACgQAAAoEAAAKBAAACgQAAAgEAAAIBAAACAQAAAoEAAAMBAAACgQAAAoEAAAKBAAACAQAAAoEAAAKBAAACgQAAAgEAAAIBAAACAQAAAgEAAAIBAAACgQAAAoEAAAKBAAACAQAAAwEAAAKBAAACgQAAAgEAAAIBAAACAQAAAoEAAAKBAAACgQAAAgEAAAIBAAADAQAAAoEAAAKBAAACgQAAAoEAAAKBAAACgQAAAoEAAAKBAAACgQAAAoEAAAIBAAACAQAAAgEAAAIBAAADAQAAAwEAAAKBAAACgQAAAoEAAAKBAAACgQAAAoEAAAIBAAACAQAAAgEAAAIBAAADAQAAAwEAAAKBAAACAQAAAgEAAAMBAAADAQAAAwEAAAKBAAACgQAAAoEAAAKBAAACgQAAAwEAAAMBAAADAQAAAwEAAAMBAAADAQAAAwEAAAKBAAADAQAAAoEAAAKBAAACgQAAAoEAAAIBAAADAQAAAwEAAAKBAAACgQAAAoEAAAIBAAADAQAAAwEAAAKBAAACgQAAAoEAAAKBAAACgQAAAoEAAAKBAAACAQAAAgEAAAMBAAADAQAAAwEAAAMBAAACgQAAAoEAAAKBAAACgQAAAoEAAAIBAAACAQAAAoEAAAIBAAADAQAAAwEAAAMBAAADAQAAAwEAAAKBAAACAQAAAgEAAAMBAAADAQAAAwEAAAKBAAACgQAAAoEAAAKBAAACAQAAAgEAAAIBAAADAQAAAwEAAAMBAAACAQAAAwEAAAMBAAADAQAAAwEAAAKBAAACAQAAAgEAAAMBAAADAQAAAwEAAAKBAAACgQAAAoEAAAKBAAACgQAAAgEAAAIBAAADAQAAAwEAAAMBAAADAQAAAoEAAAKBAAACgQAAAoEAAAKBAAACAQAAAgEAAAKBAAACgQAAAgEAAAIBAAACAQAAAwEAAAMBAAACgQAAAoEAAAKBAAACgQAAAoEAAAKBAAACgQAAAwEAAAMBAAADAQAAAwEAAAIBAAACAQAAAoEAAAIBAAACgQAAAoEAAAMBAAADAQAAAwEAAAMBAAADAQAAAoEAAAKBAAADAQAAAoEAAAKBAAACAQAAAgEAAAIBAAACAQAAAoEAAAIBAAADAQAAAwEAAAKBAAACgQAAAoEAAAKBAAACgQAAAoEAAAIBAAACAQAAAgEAAAMBAAADAQAAAwEAAAKBAAACgQAAAoEAAAKBAAADAQAAAwEAAAMBAAADAQAAAwEAAAMBAAACgQAAAoEAAAMBAAACgQAAAoEAAAMBAAADAQAAAoEAAAKBAAACAQAAAgEAAAIBAAACAQAAAwEAAAMBAAADAQAAAwEAAAKBAAACgQAAAgEAAAIBAAACgQAAAgEAAAIBAAADAQAAAwEAAAMBAAACgQAAAoEAAAKBAAACAQAAAgEAAAIBAAACAQAAAwEAAAMBAAACgQAAAoEAAAKBAAACAQAAAwEAAAKBAAACgQAAAwEAAAMBAAADAQAAAwEAAAMBAAACAQAAAwEAAAMBAAADAQAAAwEAAAKBAAACgQAAAoEAAAKBAAACAQAAAwEAAAMBAAADAQAAAwEAAAKBAAACgQAAAgEAAAIBAAACAQAAAoEAAAIBAAACAQAAAgEAAAMBAAADAQAAAwEAAAMBAAADAQAAAwEAAAMBAAADAQAAAwEAAAMBAAADAQAAAoEAAAKBAAACgQAAAgEAAAIBAAADAQAAAoEAAAIBAAACgQAAAwEAAAMBAAADAQAAAoEAAAIBAAADAQAAAwEAAAKBAAACgQAAAgEAAAMBAAADAQAAAgEAAAKBAAADAQAAAoEAAAKBAAACAQAAAwEAAAMBAAACgQAAAoEAAAIBAAACAQAAAwEAAAKBAAADAQAAAwEAAAIBAAADAQAAAwEAAAKBAAACgQAAAgEAAAKBAAACgQAAAwEAAAMBAAADAQAAAwEAAAMBAAADAQAAAwEAAAMBAAADAQAAAwEAAAMBAAADAQAAAwEAAAMBAAADAQAAAwEAAAMBAAADAQAAAwEAAAMBAAADAQAAAwEAAAMBAAADAQAAAEEEAABBBAAAQQQAAEEEAABBBAAAQQQAAEEEAABBBAAAQQQAAEEEAABBBAAAQQQAAEEEAABBBAAAQQQAAEEEAABBBAAAQQQAAEEEAABBBAAAQQQAAEEEAABBBAAAQQQAAEEE=";

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
