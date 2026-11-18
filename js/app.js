// Casa de Carnes Novo Amanhecer — área de atendimento, modelo 3D caminhável
// Coordenadas = SPEC.md §1 (metros; X p/ direita olhando da rua, Y p/ cima, Z p/ a rua; origem = canto interno parede esquerda x fachada)
import * as THREE from 'three';
import { RoomEnvironment } from './addons/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from './addons/RectAreaLightUniformsLib.js';
import { RoundedBoxGeometry } from './addons/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from './addons/BufferGeometryUtils.js';
import { OrbitControls } from './addons/OrbitControls.js';
import { EffectComposer } from './addons/postprocessing/EffectComposer.js';
import { RenderPass } from './addons/postprocessing/RenderPass.js';
import { GTAOPass } from './addons/postprocessing/GTAOPass.js';
import { OutputPass } from './addons/postprocessing/OutputPass.js';
import { UnrealBloomPass } from './addons/postprocessing/UnrealBloomPass.js';
import * as TX from './textures.js';

const Q = new URLSearchParams(location.search);
const SHOT = Q.get('shot') === '1';
const PAINEL53 = Q.get('painel53') !== '0'; // RODADA 11: painel LIGADO por padrão (a planta desenha o retângulo de linha dupla); ?painel53=0 = vão aberto // RODADA 10: SEM painel por padrão (a planta só cota .53); ?painel53=1 mostra a alternativa // D4: ?painel53=0 tira o painel baixo ao lado do caixa (pergunta 2 ao dono)
// RODADA 8: o dono disse "o caixa é de madeira de MDF, pode ter um MDF escuro" → PADRÃO = corpo em MDF nogueira escuro
// (0,10 → 0,80) + fita preta + faixa de inox escovado só no tampo (0,80 → 0,96). ?caixa=madeira = tudo MDF;
// ?caixa=foto = variante da rodada 7 (inox espelhado em cima, MDF só embaixo, como a foto-caixa).
const CAIXA_MODO = (Q.get('caixa') || 'mdf').toLowerCase();
const CAIXA_FOTO = CAIXA_MODO === 'foto';
// RODADA 8: itens que NÃO estão na planta (extintor, ar-condicionado, câmeras, detector) só com ?extras=1 (ilustrativos)
const EXTRAS = Q.get('extras') === '1';
const TOUCH = (navigator.maxTouchPoints || 0) > 0 || matchMedia('(pointer: coarse)').matches;
const MOBILE = TOUCH || Math.min(screen.width, screen.height) < 700;
if (SHOT) document.body.classList.add('shot');
if (TOUCH) document.body.classList.add('touch');

// ------------------------------------------------------------------ renderer
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
// RODADA 7: no celular até 2,5× (tela 3× do iPhone) + MSAA no composer — sem serrilhado
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MOBILE ? 2.5 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.97; // RODADA 12 (0,93 → 0,97) // RODADA 10
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.localClippingEnabled = true;
document.getElementById('cena').appendChild(renderer.domElement);
TX.setAniso(Math.min(16, renderer.capabilities.getMaxAnisotropy()));
RectAreaLightUniformsLib.init();

const scene = new THREE.Scene();
scene.background = TX.ceuGradiente();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.03).texture;

// FOV: no paisagem 60° vertical; em retrato garante ~70° na horizontal (limitado a 96° vertical)
const HFOV_RETRATO = 70;
const fovPara = a => {
  if (a >= 1) return 60;
  const t = Math.tan(THREE.MathUtils.degToRad(HFOV_RETRATO / 2)) / a;
  return Math.min(96, THREE.MathUtils.radToDeg(2 * Math.atan(t)));
};
const RETRATO = () => innerWidth / innerHeight < 1;
const NEBLINA = new THREE.Fog(0xdfe3e6, 12, 48); // RODADA 7: névoa mais suave (a rua não some no branco)
scene.fog = NEBLINA;
const camera = new THREE.PerspectiveCamera(fovPara(innerWidth / innerHeight), innerWidth / innerHeight, 0.1, 90);
camera.rotation.order = 'YXZ';

// ------------------------------------------------------------------ materiais
const T = {
  tij: TX.tijolinho(), piso: TX.porcelanato(), branco: TX.porcelanatoBranco(), mdf: TX.mdfEscuro(),
  inox: TX.inox(), calc: TX.calcada(), asf: TX.asfalto(),
};
function std(p, ud = {}) { const m = new THREE.MeshStandardMaterial(p); m.userData = { tile: [1, 1], ...ud }; return m; }
function phy(p, ud = {}) { const m = new THREE.MeshPhysicalMaterial(p); m.userData = { tile: [1, 1], ...ud }; return m; }

const M = {
  tijolo: std({ map: T.tij.map, normalMap: T.tij.normalMap, normalScale: new THREE.Vector2(1.5, 1.5), roughnessMap: T.tij.roughnessMap, roughness: 1, color: 0xc4c8cc, envMapIntensity: 0.35 }, { tile: T.tij.tile }),
  piso: std({ map: T.piso.map, normalMap: T.piso.normalMap, roughnessMap: T.piso.roughnessMap, roughness: 1, envMapIntensity: 0.6 }, { tile: T.piso.tile, cast: false }),
  // RODADA 9: parede esquerda em porcelanato CINZA 60×120 acetinado (não mais branco liso estourado)
  azulejo: std({ map: T.branco.map, color: 0xe2e0dc, normalMap: T.branco.normalMap, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.32, envMapIntensity: 0.45 }, { tile: T.branco.tile }),
  pintura: std({ color: 0xe6e4e0, roughness: 0.9, envMapIntensity: 0.3 }), // RODADA 10: mesmo tom do porcelanato (sem degrau a 2,10) // RODADA 9: menos exposição
  // RODADA 8: forro com halo de luz pintado em volta dos perfis LED + cantos levemente mais escuros
  forro: (() => { const f = TX.forroLuz(); return std({ color: 0xfafaf8, map: f.map, roughness: 0.9, envMapIntensity: 0.3, emissive: 0xffffff, emissiveMap: f.emissiveMap, emissiveIntensity: MOBILE ? 0.24 : 0.21 }, { tile: [7.157, 4.538] }); })(), // RODADA 12: forro mais claro (loja nova bem iluminada)
  inox: std({ map: T.inox.map, roughnessMap: T.inox.roughnessMap, color: 0xc9cdd1, metalness: 0.78, roughness: 1, envMapIntensity: 0.85 }, { tile: T.inox.tile }),
  inoxV: std({ map: T.inox.map, roughnessMap: T.inox.roughnessMap, color: 0xc9cdd1, metalness: 0.78, roughness: 1, envMapIntensity: 0.85 }, { tile: [1.0, 1.0], vert: true }),
  inoxPol: std({ color: 0xb8bcc0, metalness: 1, roughness: 0.1, envMapIntensity: 1.0 }),
  // inox espelhado de chapa grande (rodapé do caixa): reflete o piso/entorno via env do próprio interior
  // RODADA 6: rodapé do caixa ESPELHADO (foto/vídeo do modelo): metalness 1, roughness 0,1
  // RODADA 8: espelho de verdade (roughness 0,05, cor 0xb8bcc0 p/ não estourar); só no rodapé no padrão MDF
  inoxEspelho: std({ color: 0xb8bcc0, metalness: 1, roughness: 0.05, envMapIntensity: 1.0 }),
  // RODADA 8: faixa do tampo do caixa em inox escovado horizontal (chapa dobrada sob o tampo)
  inoxCaixa: std({ map: T.inox.map, roughnessMap: T.inox.roughnessMap, color: 0xa8b2be, metalness: 0.55, roughness: 0.6, envMapIntensity: 0.5 }, { tile: [0.5, 0.5] }),
  inoxInterno: std({ map: T.inox.map, color: 0xdfe2e5, metalness: 0.9, roughness: 0.28, envMapIntensity: 0.6 }, { tile: [1.0, 1.0], vert: true }),
  inoxEsc: std({ color: 0x9a9ea3, metalness: 1, roughness: 0.4, envMapIntensity: 0.8 }),
  preto: std({ color: 0x121212, roughness: 0.55, envMapIntensity: 0.35, side: THREE.DoubleSide }),
  pretoBrilho: std({ color: 0x0c0c0c, roughness: 0.25, envMapIntensity: 0.7 }),
  pretoFosco: std({ color: 0x18181a, roughness: 0.85, envMapIntensity: 0.3 }),
  // RODADA 9: MDF ESCURO (tabaco/wengué) — textura #33241b × 0xc8bcb2 (0xb0a49a lia como preto), roughness 0,7
  // RODADA 10: veio de nogueira visível (#4a3426 → #6a4a32) × 0xe0d2c4, roughness 0,55 + normal leve do veio
  mdf: std({ map: T.mdf.map, normalMap: T.mdf.normalMap, normalScale: new THREE.Vector2(0.6, 0.6), color: 0xd2c8c0, roughness: 0.55, envMapIntensity: 0.4 }, { tile: T.mdf.tile }), // RODADA 12: MDF ESCURO (base #33241a)
  mdfV: std({ map: T.mdf.map, normalMap: T.mdf.normalMap, normalScale: new THREE.Vector2(0.6, 0.6), color: 0xd2c8c0, roughness: 0.55, envMapIntensity: 0.4 }, { tile: T.mdf.tile, vert: true }),
  mdfInterno: std({ map: T.mdf.map, color: 0xbcb0a6, roughness: 0.6, envMapIntensity: 0.4 }, { tile: T.mdf.tile }),
  fita: std({ color: 0x141414, roughness: 0.45, envMapIntensity: 0.5 }),
  branco: std({ color: 0xf2f2ee, roughness: 0.55 }),
  esmalte: std({ color: 0xe8ebec, roughness: 0.35, envMapIntensity: 0.7 }),
  poli: std({ color: 0xe6e4de, roughness: 0.7 }),
  cinzaPorta: std({ color: 0x4a4e52, metalness: 0.4, roughness: 0.5 }),
  cinzaClaro: std({ color: 0xb9bcbd, metalness: 0.3, roughness: 0.5 }),
  rebocoCinza: std({ color: 0x9c9a95, roughness: 0.95 }),
  granito: std({ color: 0x3a3a3c, roughness: 0.3, envMapIntensity: 0.7 }),
  calcada: std({ map: T.calc.map, color: 0x9a9a96, roughness: 0.9, envMapIntensity: 0.5 }, { tile: T.calc.tile, cast: false }), // RODADA 7: concreto sem estourar
  asfalto: std({ map: T.asf.map, roughness: 0.95 }, { tile: T.asf.tile, cast: false }),
  meioFio: std({ color: 0x9d9b96, roughness: 0.55, envMapIntensity: 0.6 }),
  faixa: std({ color: 0xf2f2f0, roughness: 0.8 }, { cast: false }),
  vermelho: std({ color: 0xc8141b, roughness: 0.35, envMapIntensity: 0.8 }),
  borracha: std({ color: 0x1b1b1b, roughness: 0.9 }),
  ledQuente: std({ color: 0x000000, emissive: 0xffd9c2, emissiveIntensity: 4 }, { cast: false }),
  ledNeutro: std({ color: 0x000000, emissive: 0xfff6ea, emissiveIntensity: 5 }, { cast: false }),
  visor: std({ map: TX.visorJateado(), color: 0xd9dedd, emissiveMap: TX.visorJateado(), emissive: 0xffffff, emissiveIntensity: 0.08, roughness: 0.6, envMapIntensity: 0.45 }, { uv: "native" }),
  jateado: std({ color: 0xcfd6d6, emissive: 0xe8eeee, emissiveIntensity: 0.12, roughness: 0.3, envMapIntensity: 0.6 }),
  acrilico: std({ color: 0xdfe8e8, transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0, envMapIntensity: 1.2, depthWrite: false }, { cast: false }),
  // RODADA 6: vidro insulado com reflexo de verdade (env da própria loja, intensidade 1,8)
  vidro: phy({ color: 0xffffff, transmission: 0.95, thickness: 0.01, ior: 1.5, roughness: 0.02, metalness: 0, envMapIntensity: 1.8, specularIntensity: 1, side: THREE.FrontSide, attenuationColor: new THREE.Color(0xe6f0ec), attenuationDistance: 3.0 }, { cast: false }),
  bordaVidro: std({ color: 0x9fb8ad, roughness: 0.08, metalness: 0, transparent: true, opacity: 0.22, envMapIntensity: 0.6, depthWrite: false }, { cast: false }),
  espacador: std({ color: 0x1e1f20, roughness: 0.5, metalness: 0.5 }),
  vidroGeladeira: phy({ color: 0xdfe9e4, transmission: 0.88, thickness: 0.01, roughness: 0.05, envMapIntensity: 1.2, specularIntensity: 1, attenuationColor: new THREE.Color(0xd6e4dc), attenuationDistance: 0.4, side: THREE.FrontSide }, { cast: false }), // RODADA 11: leve tom verde-cinza
  internoGeladeira: std({ color: 0xe8ecf0, emissive: 0xeef6ff, emissiveIntensity: 0.35, roughness: 0.7 }), // RODADA 10: 0,9 → 0,35
  internoVitrine: std({ color: 0xb9bcbf, roughness: 0.45, metalness: 0.3, envMapIntensity: 0.5 }),
  tela: std({ color: 0x000000, emissive: 0xffffff, emissiveIntensity: 1.2 }),
  folha: std({ color: 0x4f7a34, roughness: 0.85 }),
  tronco: std({ color: 0x5b4636, roughness: 0.9 }),
  isopor: std({ color: 0xf6f6f2, roughness: 0.8 }),
  // tampo: escovado 4x mais fino e discreto (metal, não laminado cinza)
  inoxTampo: std({ map: T.inox.map, roughnessMap: T.inox.roughnessMap, color: 0xc8ccd0, metalness: 0.8, roughness: 0.62, envMapIntensity: 0.9 }, { tile: [0.25, 0.25] }),
  filme: phy({ color: 0xffffff, transmission: 0.9, thickness: 0.002, roughness: 0.15, ior: 1.4, clearcoat: 1, clearcoatRoughness: 0.1, envMapIntensity: 1.2, transparent: true, opacity: 0.55, depthWrite: false }, { uv: 'native', cast: false }),
  borrachaCinza: std({ color: 0x2a2c2e, roughness: 0.7 }),
  barbante: std({ color: 0xe6dcc4, roughness: 0.9 }),
  gancho: std({ color: 0x4a4d50, metalness: 1, roughness: 0.35, envMapIntensity: 0.6 }),
  grafite: std({ color: 0x2c2f33, metalness: 0.55, roughness: 0.45, envMapIntensity: 0.6 }),
  grafiteEsc: std({ color: 0x1c1e21, metalness: 0.5, roughness: 0.5, envMapIntensity: 0.5 }),
  placaCorte: std({ map: TX.placaCorte(1), roughness: 0.8, envMapIntensity: 0.35 }, { uv: 'native' }),
  fundoCarne: std({ color: 0x1e0709, roughness: 0.9, envMapIntensity: 0.05 }, { cast: false }), // RODADA 12: bem escuro (esconde frestas)
  amarelo: std({ color: 0xf2c014, roughness: 0.45, envMapIntensity: 0.5 }),
  // RODADA 9: corpo das 2 balanças em preto acetinado (o brilho refletia o forro e uma delas saía cinza)
  balanca: std({ color: 0x141416, roughness: 0.72, envMapIntensity: 0.18 }),
  rufo: std({ color: 0x141518, metalness: 0.6, roughness: 0.4, envMapIntensity: 0.6 }),
  sarjeta: std({ color: 0xa8a6a0, roughness: 0.85 }, { cast: false }),
  mancha: std({ color: 0x1a1a1c, roughness: 0.6, transparent: true, opacity: 0.18, depthWrite: false }, { uv: 'native', cast: false }),
  rodapeInox: std({ color: 0xaeb2b6, metalness: 0.85, roughness: 0.35, envMapIntensity: 0.8 }),
};
// vidro HORIZONTAL (topo dos balcões): reflexo de ambiente fraco — sem o "fantasma" do letreiro
M.vidroTopo = M.vidro.clone();
M.inoxTrasPol = std({ color: 0xb4b8bc, metalness: 0.8, roughness: 0.32, envMapIntensity: 0.35 });
M.inoxVA = M.inoxV.clone(); M.inoxVA.envMapIntensity = 0.4; M.inoxVA.userData = { ...M.inoxV.userData };
M.vidroAlta = M.vidro; // RODADA 12: (depthWrite=false lavava o interior — revertido) // RODADA 7: vidro frontal do balcão baixo com menos refletância (sem véu leitoso sobre as bandejas)
M.vidroBalcao = M.vidro.clone(); M.vidroBalcao.specularIntensity = 0.5; M.vidroBalcao.attenuationColor = new THREE.Color(0xf4f8f6); M.vidroBalcao.attenuationDistance = 6;
// tampo de serviço do balcão (lado açougueiro): escovado, reflexo contido (não vira laje estourada na V4)
M.inoxTras = std({ map: T.inox.map, roughnessMap: T.inox.roughnessMap, color: 0xc6cacf, metalness: 0.6, roughness: 1, envMapIntensity: 0.35 }, { tile: [1.0, 1.0], vert: true }); // RODADA 12: 0,6 → 0,35 (sem listras rosadas do env na traseira)
M.ledBalcao = M.ledQuente.clone(); M.ledBalcao.emissive.set(0xffc89a); M.ledBalcao.emissiveIntensity = 3.2; // RODADA 11: régua LED 3000 K forte (foto-vitrine-baixa) M.ledBalcao.userData = { ...M.ledQuente.userData };
M.inoxLat = M.inox.clone(); M.inoxLat.color.set(0xdde1e5); M.inoxLat.envMapIntensity = 1.25; M.inoxLat.userData = { ...M.inoxV.userData };
M.ledTras = M.ledQuente.clone(); M.ledTras.emissive.set(0xffe6d0); M.ledTras.emissiveIntensity = 0.9; M.ledTras.userData = { ...M.ledQuente.userData };
M.inoxServico = M.inoxTampo.clone(); M.inoxServico.roughness = 0.5; // RODADA 10: 0,35 → 0,5 (não reflete o forro como chapa branca)
M.inoxServico.envMapIntensity = 0.4; M.inoxServico.userData = { ...M.inoxTampo.userData };
// reflexo das luminárias no vidro (riscos diagonais, aditivo)
function reflexo(seed, n, op) { const m = new THREE.MeshBasicMaterial({ map: TX.reflexoVidro(seed, n), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: op, fog: false }); m.userData = { uv: 'native', cast: false }; return m; }
// carnes: physical com clearcoat = aspecto úmido/filmado
// RODADA 8: rosado (map × #f0c6c4), clearcoat 0,05 (úmido, não verniz)
// RODADA 10: color 0xe8ccc8 (rosado, sem tingir de vermelho: a cor vem da textura #b8505a → #d98a8a)
// RODADA 11: brilho ÚMIDO discreto (roughness ~0,4 pelo mapa + clearcoat 0,3); a cor vem da textura (#7a1c22 → #b8404a)
function carnePend(seed, tipo) { const t = TX.carneTira(seed, tipo); return phy({ color: 0xc4a4a0, map: t.map, normalMap: t.normalMap, normalScale: new THREE.Vector2(1.1, 1.1), roughnessMap: t.roughnessMap, roughness: 1.4, clearcoat: 0.15, clearcoatRoughness: 0.35, envMapIntensity: 0.3 }, { uv: 'native' }); }
function escurecer(m, k = 0.62) { const c = m.clone(); c.color.multiplyScalar(k); c.userData = { ...m.userData }; return c; }
function carne(map, extra = {}) { return phy({ map, roughness: 0.48, clearcoat: 0.15, clearcoatRoughness: 0.4, envMapIntensity: 0.5, ...extra }, { uv: 'native' }); }
const C = {
  boi1: carne(TX.carneBovina(1)), boi2: carne(TX.carneBovina(2)), boi3: carne(TX.carneBovina(3)),
  costela: carne(TX.costela()), frango1: carne(TX.frangoCru(1), { color: 0xf2cfc0 }), frango2: carne(TX.frangoCru(2), { color: 0xf0c8b6 }), // RODADA 8: filé rosado, não branco
  dourado: carne(TX.dourado(1)),
  temperado: (() => { const t = TX.crosta(2, '#a8461e'); return carne(t.map, { normalMap: t.normalMap, roughness: 0.5, clearcoat: 0.35 }); })(),
  // RODADA 8: frango à passarinho CRU temperado (pele rosada #e9b9a0 + tempero laranja/dourado), não frito
  passarinho: (() => { const t = TX.temperoCru(3); return carne(t.map, { color: 0xe2a48c, normalMap: t.normalMap, roughness: 0.42, clearcoat: 0.4, clearcoatRoughness: 0.25 }); })(),
  passarinho2: (() => { const t = TX.temperoCru(5); return carne(t.map, { color: 0xc98a72, normalMap: t.normalMap, roughness: 0.42, clearcoat: 0.4, clearcoatRoughness: 0.25 }); })(),
  toscana: carne(TX.linguica('#c4523e', '#f0c2ab', '#8a2c22', 1), { roughness: 0.32, clearcoat: 0.6 }),
  fina: carne(TX.linguica('#9c3a2c', '#e3a58e', '#6d2018', 2), { roughness: 0.32, clearcoat: 0.6 }),
  calabresa: carne(TX.linguica('#6e2218', '#c67358', '#3e100b', 3), { roughness: 0.28, clearcoat: 0.7 }),
  kafta: carne(TX.linguica('#8a3a2e', '#c98a6a', '#5a3a1a', 4)),
  moida: carne(TX.moida()),
  saco1: carne(TX.sacoFrango(1), { roughness: 0.25, clearcoat: 0.9 }), saco2: carne(TX.sacoFrango(2), { roughness: 0.25, clearcoat: 0.9 }),
  bandeja1: carne(TX.bandejaFrango(1), { roughness: 0.3, clearcoat: 0.9 }), bandeja2: carne(TX.bandejaFrango(2), { roughness: 0.3, clearcoat: 0.9 }),
  vacuo: [0, 1, 2, 3].map(i => carne(TX.pacoteVacuo(i), { roughness: 0.38, clearcoat: 0.3, clearcoatRoughness: 0.35 })),
  pctLing: [1, 3, 5].map(i => carne(TX.pacoteLinguica(i), { roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.25, envMapIntensity: 0.4 })),
  osso: std({ color: 0xe9dcc6, roughness: 0.5, envMapIntensity: 0.4 }),
  // osso de costela coberto por película de carne/gordura (tom rosado-marfim, não branco puro)
  ossoCarne: phy({ color: 0xc98f86, roughness: 0.45, clearcoat: 0.3, clearcoatRoughness: 0.3, envMapIntensity: 0.4 }),
  // tiras de costela (rodada 4): carne úmida — roughness ~0,4 (mapa), clearcoat 0,28
  peleCrua: [1, 2].map(i => { const t = TX.peleFrango(i + 4); return phy({ map: t.map, normalMap: t.normalMap, normalScale: new THREE.Vector2(0.6, 0.6), color: 0xffe4dc, roughness: 0.45, clearcoat: 0.35, clearcoatRoughness: 0.3, envMapIntensity: 0.4 }, { uv: 'native' }); }),
  pele: [1, 2].map(i => { const t = TX.peleFrango(i); return phy({ map: t.map, normalMap: t.normalMap, normalScale: new THREE.Vector2(0.6, 0.6), color: 0xf2d2a8, roughness: 0.5, clearcoat: 0.3, clearcoatRoughness: 0.3, envMapIntensity: 0.4 }, { uv: 'native' }); }),
  filmeFrango: std({ color: 0xffcf3a, transparent: true, opacity: 0.66, roughness: 0.28, metalness: 0, envMapIntensity: 1.3, depthWrite: false }, { uv: 'native', cast: false }),
  rotFrango: [1, 2].map(i => std({ map: TX.rotuloFrango(i), roughness: 0.35, polygonOffset: true, polygonOffsetFactor: -1 }, { uv: 'native', cast: false })),
  etqPct: [['COXA', '15,98'], ['SOBRECOXA', '16,98'], ['ASA', '16,90'], ['PEITO', '19,90']].map(([n, p]) => std({ map: TX.etiquetaPacote(n, p), roughness: 0.4 }, { uv: 'native', cast: false })),
  etqMoida: std({ map: TX.etiquetaPacote('PATINHO MOÍDO', '39,90'), roughness: 0.4 }, { uv: 'native', cast: false }),
  moidaG: (() => { const t = TX.moidaGrao(1); return phy({ map: t.map, normalMap: t.normalMap, roughness: 0.45, clearcoat: 0.3, clearcoatRoughness: 0.3, envMapIntensity: 0.4 }, { uv: 'native' }); })(),
  filme: std({ color: 0xffffff, transparent: true, opacity: 0.22, roughness: 0.1, metalness: 0, envMapIntensity: 1.4, depthWrite: false }, { uv: 'native', cast: false }),
  // RODADA 6: filme de bandeja de frango — sem transmission (some atrás do vidro frontal), clearcoat p/ o reflexo
  // RODADA 7: filme PVC amassado das bandejas do balcão (sem transmission: some atrás do vidro frontal) + normal de plástico
  filmeAmassado: (() => { const n = TX.plasticoAmassado(7); n.repeat.set(2, 2); return phy({ color: 0xffffff, transparent: true, opacity: 0.15, roughness: 0.15, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.12, normalMap: n, normalScale: new THREE.Vector2(0.7, 0.7), clearcoatNormalMap: n, clearcoatNormalScale: new THREE.Vector2(0.8, 0.8), specularIntensity: 1, envMapIntensity: 1.4, depthWrite: false }, { uv: 'native', cast: false }); })(),
  filmeBandeja: phy({ color: 0xfff6ee, transparent: true, opacity: 0.30, roughness: 0.06, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.04, specularIntensity: 1, envMapIntensity: 1.6, depthWrite: false }, { uv: 'native', cast: false }),
  frangoInt: [1, 2].map(i => carne(TX.sacoFrangoInteiro(i), { roughness: 0.25, clearcoat: 0.6, clearcoatRoughness: 0.12, color: 0xf2c48c })),
  // RODADA 5 — saco do frango inteiro: plástico translúcido brilhante (laranja / amarelo) com rótulo
  // (sem transmission: objeto com transmission atrás do vidro frontal — também transmission — some no passe de transmissão)
  // RODADA 6: menos saturado e menos 'verniz' (clearcoat 0,45), sheen de saco plástico
  // RODADA 7: saco amassado — roughness 0,35, clearcoat 0,6 e normal de plástico amassado (vincos)
  sacoFr: [1, 2, 3].map(i => { const n = TX.plasticoAmassado(i); n.repeat.set(1.5, 1.5); return phy({ map: TX.sacoFrangoInteiro(i), color: 0xfff4ea, roughness: 0.35, normalMap: n, normalScale: new THREE.Vector2(1.5, 1.5), // RODADA 9: vincos mais marcados
    clearcoat: 0.6, clearcoatRoughness: 0.18, clearcoatNormalMap: n, clearcoatNormalScale: new THREE.Vector2(0.6, 0.6), sheen: 0.4, sheenRoughness: 0.4, sheenColor: new THREE.Color(0xfff4e0), envMapIntensity: 0.5, specularIntensity: 0.6 }, { uv: 'native' }); }),
  // RODADA 5 — carne pendurada por corte (costela em ripa / fraldinha / miolo de acém), clearcoat baixo (não plástico)
  // RODADA 7: mais sementes por corte (menos repetição) — 8 costelas, 6 fraldinhas, 6 acéns
  ripa: [0, 1, 2, 3, 4, 5, 6, 7].map(i => carnePend(i, 0)),
  fral: [0, 1, 2, 3, 4, 5].map(i => carnePend(20 + i, 1)),
  acem: [0, 1, 2, 3, 4, 5].map(i => carnePend(40 + i, 2)),
  paleta: [0, 1, 2].map(i => carnePend(60 + i, 2)),
  vacCF: [1, 2, 3].map(i => carne(TX.pacoteVacuo(i, 'CONTRA-FILÉ'), { roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.25, envMapIntensity: 0.4 })),
  vacAcem: [1, 2, 3].map(i => carne(TX.pacoteVacuo(i + 3, 'MIOLO ACÉM'), { roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.25, envMapIntensity: 0.4 })),
  pedacos: [0, 1, 2, 3].map(i => carne(TX.sacoPedacos(i), { roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.08 })),
  // RODADA 9: filé de peito com fibra + brilho úmido; passarinho em 2 tons; fundo de tempero/molho sob as peças
  file: [1, 2, 3].map(i => { const t = TX.fibraFrango(i); return phy({ map: t.map, normalMap: t.normalMap, normalScale: new THREE.Vector2(0.8, 0.8), color: 0xf0c4b4, roughness: 0.42, clearcoat: 0.3, clearcoatRoughness: 0.25, envMapIntensity: 0.45 }, { uv: 'native' }); }),
  molho: phy({ color: 0x7a3418, roughness: 0.35, clearcoat: 0.5, clearcoatRoughness: 0.2, envMapIntensity: 0.4 }),
  abaSaco: phy({ color: 0xe9e6df, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.08, sheen: 0.5, sheenColor: new THREE.Color(0xffffff), envMapIntensity: 1.2 }, { cast: false }),
  // RODADA 12: saco plástico transparente brilhante dos pedaços de frango (sem transmission: fica atrás do vidro frontal)
  sacoTransp: (() => { const n = TX.plasticoAmassado(11); n.repeat.set(2, 2); return phy({ color: 0xfbf6f0, transparent: true, opacity: 0.5, roughness: 0.12, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08, sheen: 0.5, sheenRoughness: 0.3, sheenColor: new THREE.Color(0xffffff), normalMap: n, normalScale: new THREE.Vector2(0.8, 0.8), clearcoatNormalMap: n, clearcoatNormalScale: new THREE.Vector2(0.6, 0.6), specularIntensity: 1, envMapIntensity: 1.6, depthWrite: false }, { uv: 'native', cast: false }); })(),
  acemVac: [1, 2, 3].map(i => carne(TX.carneBovina(i), { roughness: 0.45, clearcoat: 0.6, clearcoatRoughness: 0.25, color: 0xe8c4bc })),
};
// RODADA 8: plano de trás da gancheira mais escuro (lê como sombra/AO entre as camadas de ripas)
C.ripaEsc = C.ripa.map(m => escurecer(m)); C.fralEsc = C.fral.map(m => escurecer(m)); C.acemEsc = C.acem.map(m => escurecer(m));
// RODADA 9: versões da gancheira com COR DE VÉRTICE (AO no topo/ponta/bordas + tom próprio de cada peça, vinho → vermelho)
const comVC = m => { const c = m.clone(); c.vertexColors = true; c.userData = { ...m.userData }; return c; };
for (const k of ['ripa', 'fral', 'acem', 'ripaEsc', 'fralEsc', 'acemEsc']) C[k + 'P'] = C[k].map(comVC);
// RODADA 11 — balcão baixo: linguiças com COR DE VÉRTICE (tom por gomo, gomo mais escuro na amarração) e brilho de tripa
C.toscanaVC = comVC(C.toscana); C.toscanaVC.roughness = 0.35; C.toscanaVC.clearcoat = 0.55; C.toscanaVC.clearcoatRoughness = 0.18;
C.kaftaVC = comVC(C.kafta); C.kaftaVC.roughness = 0.42; C.kaftaVC.clearcoat = 0.3;
// bifes: textura de fraldinha/contra-filé com capa de gordura grossa e marmoreio, tom VIVO (balcão iluminado a 3000 K)
C.bife = [0, 1, 2, 3].map(i => { const m = carnePend(80 + i, i % 2 ? 1 : 2); m.color.set(0xffe2dc); return m; });
C.passarinho3 = (() => { const t = TX.crosta(7, '#b8682a'); return carne(t.map, { color: 0xf0c8a8, normalMap: t.normalMap, roughness: 0.45, clearcoat: 0.35, clearcoatRoughness: 0.25 }); })();
// produtos do balcão baixo +15% de saturação (LED quente, produto vivo como na foto-vitrine-baixa)
for (const m of [C.toscana, C.toscanaVC, C.fina, C.calabresa, C.kafta, C.kaftaVC, C.passarinho, C.passarinho2, C.passarinho3, C.temperado, C.moidaG, ...C.file]) m.color.multiply(new THREE.Color(1.10, 0.95, 0.93));
// sombra de contato no fundo das bandejas (AO: escurece frestas e o pé das paredes da cuba)
const AO_BANDEJA = (() => {
  const c = document.createElement('canvas'); c.width = 256; c.height = 160; const x = c.getContext('2d');
  x.fillStyle = 'rgba(0,0,0,0.42)'; x.fillRect(0, 0, 256, 160);
  for (const [a, b, c0, d0] of [[0, 0, 0, 30], [0, 160, 0, 130], [0, 0, 30, 0], [256, 0, 226, 0]]) {
    const g = x.createLinearGradient(a, b, c0, d0);
    g.addColorStop(0, 'rgba(0,0,0,0.45)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, 256, 160);
  }
  const t = new THREE.CanvasTexture(c);
  const m = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  m.userData = { uv: 'native', cast: false }; return m;
})();
// linguiça em gomos: perfil de torno com estrangulamento entre gomos, pontas amarradas, curvatura irregular, tom por gomo
function linguicaGeo(r, len, rad, gomos) {
  const N = 44, pts = [], ph = r() * 6;
  for (let i = 0; i <= N; i++) {
    const t = i / N, e = Math.min(t, 1 - t) * len;
    const cap = e < rad ? Math.sqrt(Math.max(0, 1 - (1 - e / rad) ** 2)) : 1;
    let f = 1;
    for (let k = 1; k < gomos; k++) { const d = (t - k / gomos) * len / (rad * 0.45); f *= 1 - 0.5 * Math.exp(-d * d); }
    const rr = rad * Math.max(i === 0 || i === N ? 0 : 0.22, cap * f) * (1 + 0.035 * Math.sin(t * 19 + ph));
    pts.push(new THREE.Vector2(rr, (t - 0.5) * len));
  }
  const g = new THREE.LatheGeometry(pts, 14);
  const p = g.attributes.position, k1 = (r() - 0.5) * 3.0, k2 = (r() - 0.5) * 0.012, ph2 = r() * 6;
  const tons = []; for (let k = 0; k < gomos; k++) tons.push(0.86 + r() * 0.26);
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i), t = y / len + 0.5;
    p.setZ(i, p.getZ(i) + k1 * y * y + k2 * Math.sin(y * 9 + ph2)); p.setX(i, p.getX(i) + k2 * 0.3 * Math.sin(y * 7 + ph));
    const gk = Math.min(gomos - 1, Math.max(0, Math.floor(t * gomos)));
    let a = tons[gk];
    for (let k = 1; k < gomos; k++) { const d = (t - k / gomos) * len / (rad * 0.6); a *= 1 - 0.35 * Math.exp(-d * d); }
    const ep = Math.min(t, 1 - t) * len; if (ep < rad * 0.6) a *= 0.7 + 0.3 * ep / (rad * 0.6);
    col[i * 3] = a; col[i * 3 + 1] = a * 0.97; col[i * 3 + 2] = a * 0.97;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.rotateZ(Math.PI / 2);
  g.computeVertexNormals();
  return g;
}
const ETQ = std({ map: TX.atlasEtiquetas(), roughness: 0.6 }, { uv: 'native', cast: false });

// ------------------------------------------------------------------ batch (junta geometria por material = poucos draw calls)
const batches = new Map();
const KEEP = { position: 1, normal: 1, uv: 1, color: 1 };
function worldUV(g, tile, vert) {
  const p = g.attributes.position, n = g.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  const [tu, tv] = tile;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v;
    if (ay >= ax && ay >= az) { u = x; v = -z; }
    else if (ax >= az) { u = z; v = y; }
    else { u = x; v = y; }
    if (vert) { const t = u; u = v; v = t; }
    uv[i * 2] = u / tu; uv[i * 2 + 1] = v / tv;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}
function add(geo, mat, matrix) {
  let g = geo.index ? geo.toNonIndexed() : geo.clone();
  if (matrix) g.applyMatrix4(matrix);
  if ((mat.userData.uv || 'world') === 'world') worldUV(g, mat.userData.tile || [1, 1], mat.userData.vert);
  for (const k of Object.keys(g.attributes)) if (!KEEP[k]) g.deleteAttribute(k);
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  g.clearGroups(); g.morphAttributes = {};
  let b = batches.get(mat); if (!b) batches.set(mat, b = []);
  b.push(g);
}
function flush(parent = scene) {
  for (const [mat, list] of batches) {
    const g = mergeGeometries(list, false);
    const mesh = new THREE.Mesh(g, mat);
    mesh.castShadow = mat.userData.cast !== false && !mat.transparent && !(mat.transmission > 0);
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    parent.add(mesh);
  }
  batches.clear();
}
const _o = new THREE.Object3D();
function mtx(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, order = 'XYZ') {
  _o.position.set(x, y, z); _o.rotation.set(rx, ry, rz, order); _o.scale.set(sx, sy, sz); _o.updateMatrix();
  return _o.matrix.clone();
}
const mul = (a, b) => new THREE.Matrix4().multiplyMatrices(a, b);
const BOX = new THREE.BoxGeometry(1, 1, 1);
// caixa por limites (de→até) — igual às tabelas do SPEC
function B(x0, x1, y0, y1, z0, z1, mat, parent) {
  const m = mtx((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, 0, 0, 0, Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0));
  add(BOX, mat, parent ? mul(parent, m) : m);
}
const CYL = new THREE.CylinderGeometry(1, 1, 1, 20, 1);
function cylY(x, z, y0, y1, r, mat, parent) { const m = mtx(x, (y0 + y1) / 2, z, 0, 0, 0, r, y1 - y0, r); add(CYL, mat, parent ? mul(parent, m) : m); }
function cylX(x0, x1, y, z, r, mat, parent) { const m = mtx((x0 + x1) / 2, y, z, 0, 0, Math.PI / 2, r, x1 - x0, r); add(CYL, mat, parent ? mul(parent, m) : m); }
function cylZ(x, y, z0, z1, r, mat, parent) { const m = mtx(x, y, (z0 + z1) / 2, Math.PI / 2, 0, 0, r, z1 - z0, r); add(CYL, mat, parent ? mul(parent, m) : m); }
const SPH = new THREE.SphereGeometry(1, 20, 14);

// colisão (retângulos em planta)
const solids = [];
function solid(x0, x1, z0, z1, tag) { const s = { x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), on: true, tag }; solids.push(s); return s; }

// deformação orgânica (carne)
function organico(geo, r, amp = 0.15, freq = 9) {
  const g = geo;
  const p = g.attributes.position;
  const a = r() * 6, b = r() * 6, c = r() * 6;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = 1 + amp * (Math.sin(x * freq + a) * Math.sin(y * freq * 0.7 + b) + 0.6 * Math.sin(z * freq * 1.3 + c + x * 4));
    p.setXYZ(i, x * n, y * (1 + (n - 1) * 0.5), z * n);
  }
  g.computeVertexNormals();
  return g;
}

// ======================================================================= CASCA
const XL = 0, XR = 6.799, ZF = 0, ZB = -4.369, H = 3.0;
function casca() {
  // piso interno
  B(-0.159, 6.998, -0.05, 0, -4.538, 0, M.piso);
  // soleira granito nos vãos
  B(0.984, 2.949, -0.05, 0.004, 0, 0.201, M.granito); // RODADA 6: vão SAÍDA começa na borda da CX. ENERGIA (X 0,984)
  B(3.613, 6.513, -0.05, 0.004, 0, 0.201, M.granito);
  // parede esquerda: alvenaria pintada + porcelanato branco até 2,10
  B(-0.159, 0, 0, 3.6, -3.874, 0.201, M.pintura);
  B(0, 0.012, 0.10, 2.10, -3.874, 0, M.azulejo);
  B(0, 0.016, 0, 0.10, -3.874, 0, M.rodapeInox); // RODADA 9: rodapé inox escovado 10 cm
  B(0, 0.018, 0.098, 0.102, -3.874, 0, M.inoxPol);
  solid(-0.5, 0, -3.874, 0.201);
  // pilar canto fundo-esquerdo (tijolinho)
  B(-0.159, 0.715, 0, H, -4.538, -4.043, M.tijolo);
  B(-0.159, 0.116, 0, H, -4.043, -3.874, M.tijolo);
  solid(-0.159, 0.715, -4.6, -4.043); solid(-0.159, 0.116, -4.043, -3.874);
  // parede de fundo (tijolinho) com porta e visor
  const z0 = -4.538, z1 = -4.369;
  B(0.715, 0.986, 0, H, z0, z1, M.tijolo);
  B(0.986, 1.867, 2.10, H, z0, z1, M.tijolo);         // verga da porta
  B(1.867, 2.146, 0, H, z0, z1, M.tijolo);
  B(2.146, 4.147, 0, 1.10, z0, z1, M.tijolo);         // peitoril do visor
  B(2.146, 4.147, 2.10, H, z0, z1, M.tijolo);
  B(4.147, 6.998, 0, H, z0, z1, M.tijolo);
  solid(0.715, 6.998, -4.7, -4.369);
  // porta vai-e-vem inox (fechada) + batente
  B(0.986, 1.016, 0, 2.10, z1 - 0.06, z1 + 0.01, M.inoxPol); B(1.837, 1.867, 0, 2.10, z1 - 0.06, z1 + 0.01, M.inoxPol);
  B(0.986, 1.867, 2.07, 2.10, z1 - 0.06, z1 + 0.01, M.inoxPol);
  const porta = mtx(1.4265, 1.06, z1 - 0.03);
  B(-0.40, 0.40, -1.05, 1.0, -0.02, 0.02, M.inoxV, porta);
  // visor redondo
  const vr = new THREE.CylinderGeometry(0.15, 0.15, 0.05, 32);
  add(vr, M.jateado, mul(porta, mtx(0, 0.55, 0, Math.PI / 2)));
  add(new THREE.TorusGeometry(0.155, 0.012, 8, 32), M.inoxPol, mul(porta, mtx(0, 0.55, 0.022)));
  B(-0.40, 0.40, -1.05, -0.80, 0.02, 0.025, M.inoxPol, porta); // chapa de chute
  B(-0.04, 0.04, -0.06, 0.06, 0.02, 0.03, M.preto, porta);
  // visor jateado 2 folhas
  B(2.166, 3.136, 1.13, 2.08, -4.47, -4.44, M.visor); B(3.156, 4.127, 1.13, 2.08, -4.47, -4.44, M.visor);
  B(2.146, 4.147, 1.10, 1.13, -4.45, -4.36, M.inoxPol); // peitoril inox
  B(2.146, 4.147, 2.08, 2.10, -4.45, -4.369, M.inoxPol);
  B(2.146, 2.166, 1.10, 2.10, -4.45, -4.369, M.inoxPol); B(4.127, 4.147, 1.10, 2.10, -4.45, -4.369, M.inoxPol);
  B(3.136, 3.156, 1.10, 2.10, -4.45, -4.42, M.inoxPol);
  // parede direita (tijolinho)
  B(6.799, 6.998, 0, H, -4.369, -1.314, M.tijolo);
  B(6.799, 6.998, 1.20, 3.6, -1.314, 0.201, M.tijolo);
  solid(6.799, 7.5, -4.369, -1.314);
  // abrigo d'água — RODADA 5: caixa de ALVENARIA revestida do mesmo tijolinho preto (avança 0,11 da parede, D3),
  // porta metálica grafite embutida rente à face X 6,689 com batente fino, veneziana e pingadeira de granito de 2 cm
  B(6.689, 6.998, 0, 1.20, -1.314, 0, M.tijolo);
  B(6.675, 6.998, 1.20, 1.22, -1.328, 0, M.granito);
  const px = 6.689;
  B(px - 0.003, px + 0.002, 0.10, 1.10, -1.22, -0.10, M.grafiteEsc);           // batente (moldura 1,5 cm)
  B(px - 0.006, px - 0.001, 0.115, 1.085, -1.205, -0.115, M.grafite);           // folha
  for (let y = 0.80; y < 1.04; y += 0.035) B(px - 0.012, px - 0.006, y, y + 0.012, -0.98, -0.34, M.grafiteEsc);
  for (let y = 0.20; y < 0.40; y += 0.035) B(px - 0.012, px - 0.006, y, y + 0.012, -0.98, -0.34, M.grafiteEsc);
  B(px - 0.03, px - 0.006, 0.55, 0.66, -0.19, -0.165, M.inoxEsc);               // puxador
  cylX(px - 0.012, px - 0.004, 0.62, -0.30, 0.012, M.inoxEsc);                  // fechadura
  solid(6.689, 7.5, -1.314, 0.201);
  // fachada: pilares + verga/platibanda (tijolinho)
  B(-0.159, 0, 0, 3.6, 0, 0.201, M.tijolo);
  // RODADA 6 (planta): fachada CHEIA de X −0,159 a 0,984 (alvenaria com o padrão de entrada embutido por fora)
  B(-0.159, 0.984, 0, 2.80, 0, 0.201, M.tijolo);
  solid(-0.159, 0.984, 0, 0.201);
  B(2.949, 3.613, 0, 2.80, 0, 0.201, M.tijolo);
  B(6.513, 6.998, 0, 2.80, 0, 0.201, M.tijolo);
  B(6.998, 7.10, 0, 3.6, -0.3, 0.201, M.tijolo); // arremate com vizinho
  B(-0.159, 6.998, 2.80, 3.6, 0, 0.201, M.tijolo);
  B(-0.159, 7.10, 3.6, 3.66, -0.02, 0.24, M.granito); // pingadeira
  B(-0.17, 7.11, 3.66, 3.71, -0.06, 0.255, M.rufo); B(-0.17, 7.11, 3.59, 3.71, 0.245, 0.255, M.rufo); // RODADA 12: rufo/pingadeira metálica preta 5 cm (arremate)
  solid(2.949, 3.613, 0, 0.201); solid(6.513, 7.5, 0, 0.201);
  // portas de enrolar recolhidas: caixa do rolo + trilhos
  for (const [a, b] of [[0.984, 2.949], [3.613, 6.513]]) {
    B(a, b, 2.62, 2.80, -0.28, 0, M.pretoFosco);
    B(a, b, 2.60, 2.62, -0.28, -0.26, M.preto);
    B(a, a + 0.05, 0, 2.62, -0.07, 0, M.preto);
    B(b - 0.05, b, 0, 2.62, -0.07, 0, M.preto);
    B(a, b, 2.74, 2.80, 0.20, 0.205, M.preto); // lâmina final aparente pra fora
  }
  // rodapé sanitário (porcelanato) ao longo do tijolinho
  B(0.715, 6.799, 0, 0.10, -4.369, -4.355, M.piso);
}

// forro + luminárias (grupo próprio: some na vista de cima)
const teto = new THREE.Group(); scene.add(teto);
function forro() {
  // RODADA 9: forro com RASGOS de 7 cm para os perfis LED (embutidos 2 cm, borda preta, difusor recuado)
  const LZ = [-3.30, -1.55, -0.55], hw = 0.035;
  { let z0 = -4.538;
    for (const z of LZ) { B(-0.159, 6.998, 3.0, 3.06, z0, z - hw, M.forro); B(-0.159, 0.5, 3.0, 3.06, z - hw, z + hw, M.forro); B(6.3, 6.998, 3.0, 3.06, z - hw, z + hw, M.forro); z0 = z + hw; }
    B(-0.159, 6.998, 3.0, 3.06, z0, 0.0, M.forro); }
  // laje/telhado acima (sombra do sol)
  B(-0.3, 7.1, 3.06, 3.2, -4.7, 0.2, M.rebocoCinza);
  // tabica (junta de sombra 2 cm) no encontro do forro com as paredes — tira a cara de "caixa de jogo"
  B(0.0, 6.799, 2.996, 3.0, -4.369, -4.344, M.pretoFosco);
  B(0.0, 0.025, 2.996, 3.0, -3.874, 0.0, M.pretoFosco);
  B(6.774, 6.799, 2.996, 3.0, -4.369, 0.0, M.pretoFosco);
  // RODADA 11: alçapão de inspeção na MESMA cor do forro, só com friso fino (antes lia como buraco/luz estourada)
  for (const [x0, x1, z0, z1] of [[1.0, 1.6, -3.9, -3.896], [1.0, 1.6, -3.304, -3.3], [1.0, 1.004, -3.9, -3.3], [1.596, 1.6, -3.9, -3.3]]) B(x0, x1, 2.998, 3.0, z0, z1, M.pretoFosco);
  for (const z of LZ) {
    B(0.5, 6.3, 3.0, 3.025, z - hw, z - hw + 0.004, M.pretoFosco); B(0.5, 6.3, 3.0, 3.025, z + hw - 0.004, z + hw, M.pretoFosco);
    B(0.5, 0.504, 3.0, 3.025, z - hw, z + hw, M.pretoFosco); B(6.296, 6.3, 3.0, 3.025, z - hw, z + hw, M.pretoFosco);
    B(0.504, 6.296, 3.018, 3.022, z - hw + 0.004, z + hw - 0.004, M.ledNeutro);
  }
  // RODADA 12: downlights redondos embutidos (Ø 9 cm, aro preto) quebrando o plano liso do forro no corredor do cliente
  for (const x of [0.75, 2.15, 4.75, 6.05]) {
    add(new THREE.CircleGeometry(0.045, 24), M.ledNeutro, mtx(x, 2.996, -1.05, Math.PI / 2));
    add(new THREE.RingGeometry(0.045, 0.058, 24), M.pretoFosco, mtx(x, 2.997, -1.05, Math.PI / 2));
  }
  // pendentes sobre o caixa — RODADA 9: não estão na planta → só com ?extras=1
  const cone = new THREE.CylinderGeometry(0.035, 0.15, 0.22, 32, 1, true);
  if (EXTRAS) for (const x of [3.15, 3.55, 3.95]) {
    const m = mtx(x, 2.66, -0.85); // RODADA 6: pendentes mais altos (base 2,55) — fora do campo de visão do operador no iPhone
    add(cone, M.preto, m);
    add(new THREE.CircleGeometry(0.135, 32), M.ledQuente, mul(m, mtx(0, -0.09, 0, Math.PI / 2)));
    cylY(x, -0.85, 2.77, 3.0, 0.003, M.preto);
    cylY(x, -0.85, 2.77, 2.81, 0.04, M.preto);
  }
  if (EXTRAS) forroExtras();
  flush(teto);
  teto.traverse(o => { if (o.isMesh) o.castShadow = o.material === M.rebocoCinza || o.material === M.forro; });
}
// RODADA 8: ilustrativos fora da planta — só com ?extras=1
function forroExtras() {
  // difusor de ar-condicionado (4 vias) e câmera dome (como na foto da vitrine alta)
  const dif = mtx(1.6, 2.99, -2.4);
  B(-0.30, 0.30, -0.012, 0, -0.30, 0.30, M.branco, dif);
  for (let k = 0; k < 4; k++) {
    const rr = mul(dif, mtx(0, 0, 0, 0, k * Math.PI / 2));
    for (let i = 0; i < 3; i++) B(-0.16 + i * 0.01, 0.16 - i * 0.01, -0.03 + i * 0.008, -0.012, 0.13 + i * 0.045, 0.16 + i * 0.045, M.esmalte, rr);
  }
  B(-0.12, 0.12, -0.02, -0.012, -0.12, 0.12, M.esmalte, dif);
  add(new THREE.SphereGeometry(0.06, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), M.pretoBrilho, mtx(6.2, 2.99, -1.2));
  cylY(6.2, -1.2, 2.975, 3.0, 0.075, M.branco);
  add(new THREE.SphereGeometry(0.06, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), M.pretoBrilho, mtx(0.6, 2.99, -2.0));
  cylY(0.6, -2.0, 2.975, 3.0, 0.075, M.branco);
  // sprinkler / detector de fumaça
  cylY(3.4, -3.0, 2.97, 3.0, 0.06, M.branco); cylY(3.4, -3.0, 2.96, 2.97, 0.02, std({ color: 0xd22, emissive: 0xff2222, emissiveIntensity: 0.5 }));
}

// ======================================================================= VITRINE ALTA ROMA
function vitrineAlta(r) {
  const x0 = 4.998, x1 = 6.799, zf = -1.996, zb = -2.866, xm = (x0 + x1) / 2;
  for (const x of [x0 + 0.09, x1 - 0.09]) for (const z of [zf - 0.09, zb + 0.09]) cylY(x, z, 0, 0.10, 0.025, M.inoxPol);
  B(x0 + 0.06, x1 - 0.06, 0, 0.10, zb + 0.06, zf - 0.05, M.preto);
  B(x0, x0 + 0.05, 0.10, 2.55, zb, zf, M.inoxVA); B(x1 - 0.05, x1, 0.10, 2.55, zb, zf, M.inoxVA); // RODADA 12: env 0,4 (sem listras rosadas)
  B(x0 - 0.002, x0 + 0.052, 0.10, 2.55, zf - 0.025, zf + 0.004, M.inoxPol);
  B(x1 - 0.052, x1 + 0.002, 0.10, 2.55, zf - 0.025, zf + 0.004, M.inoxPol);
  B(x0 + 0.05, x1 - 0.05, 0.10, 0.60, zf - 0.03, zf, M.inox);
  B(x0 + 0.05, x1 - 0.05, 0.345, 0.355, zf - 0.03, zf + 0.003, M.inoxPol);
  B(x0 + 0.05, x1 - 0.05, 0.10, 0.58, zb + 0.02, zf - 0.03, M.inoxEsc);
  B(x0 + 0.05, x1 - 0.05, 0.10, 0.60, zb, zb + 0.02, M.inox);
  // forro interno (laterais claras)
  // RODADA 6: laterais internas em inox escovado claro, espelhado (como na foto do modelo)
  B(x0 + 0.05, x0 + 0.056, 0.6, 2.05, zb + 0.02, zf - 0.03, M.inoxInterno);
  B(x1 - 0.056, x1 - 0.05, 0.6, 2.05, zb + 0.02, zf - 0.03, M.inoxInterno);
  // topo + canopy — RODADA 5: proporção do render Real (renders-roma.png): faixa PRETA alta (2,05 → 2,40) domina o topo,
  // inox só como moldura de 0,15 em cima (2,40 → 2,55); vidro e espaço interno terminam em 2,05
  B(x0, x1, 2.53, 2.55, zb, zf + 0.004, M.inox);
  // RODADA 6 (D18): segue a foto-vitrine-alta — faixa preta 2,05 → 2,28 e testeira de inox escovado ALTA 2,28 → 2,55
  B(x0 + 0.05, x1 - 0.05, 2.05, 2.28, zf - 0.42, zf, M.preto);
  B(x0 + 0.05, x1 - 0.05, 2.28, 2.53, zf - 0.42, zf - 0.03, M.inoxEsc);
  B(x0, x1, 2.28, 2.55, zf - 0.03, zf + 0.004, M.inoxV);
  B(x0, x1, 2.276, 2.286, zf - 0.03, zf + 0.007, M.inoxPol);
  B(x0, x1, 2.54, 2.55, zf - 0.03, zf + 0.007, M.inoxPol);
  B(x0 + 0.05, x1 - 0.05, 2.05, 2.53, zb + 0.02, zf - 0.42, M.inoxEsc);
  B(x0 + 0.05, x1 - 0.05, 2.05, 2.07, zb + 0.02, zf - 0.42, M.internoVitrine);
  for (const dx of [-0.58, 0, 0.58]) {
    add(new THREE.CircleGeometry(0.045, 24), M.ledQuente, mtx(xm + dx, 2.047, zf - 0.22, Math.PI / 2));
    add(new THREE.TorusGeometry(0.052, 0.009, 8, 24), M.inoxEsc, mtx(xm + dx, 2.048, zf - 0.22, Math.PI / 2));
  }
  B(x0 + 0.06, x1 - 0.06, 2.038, 2.05, zf - 0.05, zf - 0.03, M.ledQuente);
  // logo Real no canopy e na base
  const logo = std({ map: TX.textoSimples('Real', { cor: '#d9dcdf' }), transparent: true, roughness: 0.3, metalness: 0.6 }, { uv: 'native', cast: false });
  add(new THREE.PlaneGeometry(0.20, 0.05), logo, mtx(xm + 0.1, 2.16, zf + 0.002));
  add(new THREE.PlaneGeometry(0.16, 0.04), logo, mtx(x0 + 0.2, 0.47, zf + 0.002));
  // fundo: portas de correr de vidro (lado açougueiro)
  B(x0 + 0.05, x1 - 0.05, 0.58, 0.62, zb, zb + 0.05, M.inoxTrasPol);
  B(x0 + 0.05, x1 - 0.05, 2.01, 2.05, zb, zb + 0.05, M.inoxTrasPol);
  // 2 folhas de vidro de correr com perfil inox em volta e puxador vertical
  for (const [a, b, z0] of [[x0 + 0.05, xm + 0.03, zb + 0.006], [xm - 0.03, x1 - 0.05, zb + 0.026]]) {
    // RODADA 6: portas de reposição em chapa inox (fecha a traseira, sem fresta por onde se via a carne)
    B(a + 0.025, b - 0.025, 0.645, 1.985, z0 + 0.003, z0 + 0.009, M.inoxTras); // RODADA 10: inox escovado neutro (não lia bege/rosado)
    B(a, b, 0.62, 0.645, z0, z0 + 0.012, M.inoxTrasPol); B(a, b, 1.985, 2.01, z0, z0 + 0.012, M.inoxTrasPol);
    B(a, a + 0.025, 0.62, 2.01, z0, z0 + 0.012, M.inoxTrasPol); B(b - 0.025, b, 0.62, 2.01, z0, z0 + 0.012, M.inoxTrasPol);
  }
  // RODADA 10: puxadores em inox de 3 cm (as tiras pretas finas serrilhavam) + mata-junta de 4 cm na sobreposição das portas
  B(x0 + 0.10, x0 + 0.13, 1.10, 1.60, zb - 0.022, zb + 0.006, M.inoxTrasPol);
  B(x1 - 0.13, x1 - 0.10, 1.10, 1.60, zb - 0.022, zb + 0.026, M.inoxTrasPol);
  B(xm - 0.02, xm + 0.02, 0.62, 2.01, zb - 0.004, zb + 0.004, M.inoxTras);
  // vedação lateral: chapa inox cheia entre a lateral e as portas (nenhum vão vertical na traseira)
  B(x0 + 0.05, x0 + 0.08, 0.58, 2.05, zb, zb + 0.04, M.inoxTrasPol); B(x1 - 0.08, x1 - 0.05, 0.58, 2.05, zb, zb + 0.04, M.inoxTrasPol);
  B(x0 + 0.05, x1 - 0.05, 0.60, 2.05, zb + 0.042, zb + 0.046, M.inoxEsc);
  // deck 0,60 (bandeja perfurada inclinada)
  const deck = mtx(xm, 0.60, zf - 0.03, 0.09);
  B(-0.85, 0.85, -0.02, 0, -0.80, 0, M.inox, deck);
  // vidro frontal insulado peça única (como na foto) + espaçador escuro
  for (const [a, b] of [[x0 + 0.05, x1 - 0.05]]) {
    B(a, b, 0.60, 2.05, zf - 0.012, zf - 0.004, M.vidroAlta);
    B(a, b, 0.60, 0.615, zf - 0.014, zf - 0.002, M.espacador); B(a, b, 2.035, 2.05, zf - 0.014, zf - 0.002, M.espacador);
    B(a, a + 0.012, 0.60, 2.05, zf - 0.014, zf - 0.002, M.espacador); B(b - 0.012, b, 0.60, 2.05, zf - 0.014, zf - 0.002, M.espacador);
  }
  // reflexo forte das luminárias lineares (foto)
  add(new THREE.PlaneGeometry(x1 - x0 - 0.1, 1.45), reflexo(1, 8, 0.30), mtx(xm, 1.325, zf + 0.003));
  // borda verde sutil do vidro insulado (aresta do vidro vista de frente, como na foto)
  for (const [a, b, c, d] of [[x0 + 0.062, x1 - 0.062, 0.615, 0.627], [x0 + 0.062, x1 - 0.062, 2.023, 2.035], [x0 + 0.062, x0 + 0.072, 0.615, 2.035], [x1 - 0.072, x1 - 0.062, 0.615, 2.035]]) B(a, b, c, d, zf - 0.0035, zf - 0.0015, M.bordaVidro);
  // divisórias verticais finas das prateleiras (3 vãos)
  for (const x of [x0 + 0.6, x0 + 1.2]) B(x - 0.006, x + 0.006, 0.60, 1.33, zf - 0.60, zf - 0.035, M.inoxPol);
  // bate-carrinho
  // RODADA 11 — bate-carrinho TUBULAR Ø 0,05 em inox polido a 0,08 da frente (como na foto-vitrine-alta): tubo a 0,18 do
  // piso, 3 pés verticais com sapata e CURVA DE RETORNO nas pontas, entrando na base da vitrine
  { const yb = 0.18, zb2 = zf + 0.08, rc = 0.07, rt = 0.025;
    cylX(x0 + 0.08 + rc, x1 - 0.08 - rc, yb, zb2, rt, M.inoxPol);
    for (const [xe, s] of [[x0 + 0.08 + rc, -1], [x1 - 0.08 - rc, 1]]) {
      // curva de 90° (raio 0,07) virando p/ −Z e trecho reto até a base
      add(new THREE.TorusGeometry(rc, rt, 12, 16, Math.PI / 2), M.inoxPol, mul(mtx(xe, yb, zb2 - rc), mtx(0, 0, 0, Math.PI / 2, 0, s > 0 ? 0 : Math.PI / 2)));
      cylZ(xe + s * rc, yb, zf - 0.02, zb2 - rc, rt, M.inoxPol);
      add(SPH, M.inoxPol, mtx(xe + s * rc, yb, zb2 - rc, 0, 0, 0, rt, rt, rt));
    }
    for (const x of [x0 + 0.30, xm, x1 - 0.30]) { cylY(x, zb2, 0.012, yb, 0.016, M.inoxPol); cylY(x, zb2, 0, 0.012, 0.035, M.inoxPol); }
  }
  // prateleiras 0,95 e 1,30 (inclinadas 10°)
  const prat = [];
  for (const y of [0.95, 1.30]) {
    const S = mtx(xm, y, zf - 0.035, 10 * Math.PI / 180);
    prat.push(S);
    B(-0.85, 0.85, -0.02, 0, -0.55, 0, M.inox, S);
    B(-0.85, 0.85, -0.055, 0.0, 0, 0.012, M.preto, S); // porta-etiqueta
    B(-0.85, 0.85, 0.0, 0.03, -0.005, 0.0, M.acrilico, S);
  }
  // gancheira
  // RODADA 5: barras mais baixas (topo interno 2,05) e mais p/ trás, p/ a carne descer até a prateleira de embalados (~1,35)
  // RODADA 7: as 3 barras quase na mesma altura (sem 'degraus' de fileira); a variação vem do gancho e do comprimento
  const barras = [[1.99, zb + 0.10], [1.975, zb + 0.20], [1.96, zb + 0.30]];
  for (const [y, z] of barras) {
    cylX(x0 + 0.05, x1 - 0.05, y, z, 0.008, M.gancho);
  }
  conteudoVitrineAlta(r, { x0, x1, xm, zf, zb, deck, prat, barras });
  solid(x0, x1, zb, zf + 0.12);
}

// RODADA 11 — pacote a VÁCUO: travesseiro de cantos arredondados (a carne empurra o filme no meio), aba de selagem
// fina na borda, VINCOS do vácuo perto das bordas e leve assimetria; UV planar de cima (rótulo da textura fica legível)
function pacoteVac(r, w, hh, d) {
  const g = new THREE.BoxGeometry(w, hh, d, 16, 3, 14);
  const p = g.attributes.position, uv = g.attributes.uv, ph = r() * 6, ph2 = r() * 6, cx = (r() - 0.5) * 0.3, cz = (r() - 0.5) * 0.3;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const u = x / (w / 2), v = z / (d / 2), q = Math.max(Math.abs(u), Math.abs(v));
    // perfil de travesseiro: alto no meio (deslocado), achata até a aba de 6 mm
    const fu = Math.pow(Math.max(0, 1 - Math.abs(u - cx * (1 - Math.abs(u))) ** 4), 0.55), fv = Math.pow(Math.max(0, 1 - Math.abs(v - cz * (1 - Math.abs(v))) ** 4), 0.55);
    let k = 0.10 + 0.90 * fu * fv;
    k *= 1 + 0.06 * Math.sin(u * 7 + ph) * Math.sin(v * 5 + ph2);
    const vinco = 0.08 * q * q * Math.sin(u * 23 + v * 9 + ph) * Math.sin(v * 19 - u * 6 + ph2);
    y = y * (k + vinco);
    // cantos arredondados em planta
    const rr = 1 - 0.10 * Math.pow(Math.min(Math.abs(u), Math.abs(v)), 6);
    x *= rr; z *= rr;
    p.setXYZ(i, x, y, z);
    uv.setXY(i, x / w + 0.5, -z / d + 0.5);
  }
  g.computeVertexNormals();
  return g;
}
function etiqueta(i, w, h, matrix) {
  const g = new THREE.PlaneGeometry(w, h);
  const [u0, v0, u1, v1] = TX.uvEtiqueta(i);
  const uv = g.attributes.uv;
  for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) ? u1 : u0, uv.getY(k) ? v1 : v0);
  add(g, ETQ, matrix);
}

function conteudoVitrineAlta(r, V) {
  const { x0, x1, xm, zf, zb, deck, prat, barras } = V;
  // RODADA 5 — cada vão tem UM produto, e a etiqueta sai do produto colocado (não por sorteio).
  // vãos (coordenada local das prateleiras, centro xm): divisórias em −0,30 e +0,30
  const VAO = [[-0.85, -0.30], [-0.30, 0.30], [0.30, 0.85]];
  const ETQ_ID = { 'COSTELA': 18, 'MIOLO DE ACÉM': 19, 'CONTRA-FILÉ': 1, 'LING. TOSCANA': 8, 'COXA E SOBRECOXA': 14, 'ASA DE FRANGO': 24, 'PEITO DE FRANGO': 29, 'FRANGO INTEIRO': 20, 'FRALDINHA': 4 };

  // RODADA 10 — ripa de costela como na foto-vitrine-alta: tira ESTREITA (3–6 cm) e longa (0,45–0,65), lados quase
  // paralelos com ondulação suave (spline), afinamento leve só no último quarto e PONTA ARREDONDADA (nada de bico nem
  // dente de serra); curvada 2–4 cm em Z ao longo do comprimento; UV com janela própria por ripa
  const peca = (w, h, t, tint = null) => {
    // RODADA 11: contorno RECORTADO — ruído de baixa + alta frequência por lado e entalhes ocasionais (faca/osso)
    const sh = new THREE.Shape(), N = 22, L = [], Rr = [], phL = r() * 6, phR = r() * 6, phL2 = r() * 6, phR2 = r() * 6;
    const fim = 0.55 + r() * 0.35;   // largura relativa na ponta (umas afinam bem, outras quase retas)
    const larg = (s) => w / 2 * (s < 0.6 ? 1 - 0.05 * s : 1 - 0.03 - (1 - fim) * ((s - 0.6) / 0.4) ** 1.3);
    const jit = () => (r() - 0.5) * w * 0.02; // RODADA 12: sem entalhes 'de tesoura' (borda lisa, levemente ondulada)
    for (let i = 0; i <= N; i++) {
      const s = i / N, y = -s * h * 0.97;
      const j = (ph, ph2) => Math.sin(s * 3.2 + ph) * w * 0.06 + Math.sin(s * 9 + ph2) * w * 0.012;
      const e = i === 0 ? 0 : 1;
      L.push([-larg(s) + j(phL, phL2) - jit() * e, y]); Rr.push([larg(s) + j(phR, phR2) + jit() * e, y]);
    }
    sh.moveTo(L[0][0], 0);
    for (let i = 1; i <= N; i++) sh.lineTo(L[i][0], L[i][1]);
    // ponta arredondada (meia-elipse baixa, levemente assimétrica)
    const xl = L[N][0], xr = Rr[N][0], yb = L[N][1], xc = (xl + xr) / 2 + (r() - 0.5) * w * 0.12, ry = h * 0.03 + w * 0.15;
    sh.quadraticCurveTo(xl, yb - ry, xc, yb - ry);
    sh.quadraticCurveTo(xr, yb - ry, xr, Rr[N][1]);
    for (let i = N - 1; i >= 0; i--) sh.lineTo(Rr[i][0], Rr[i][1]);
    sh.closePath();
    const bev = Math.min(0.008, t * 0.3);
    let g = new THREE.ExtrudeGeometry(sh, { depth: Math.max(0.004, t - bev * 2), bevelEnabled: true, bevelThickness: bev, bevelSize: Math.min(bev, w * 0.15), bevelSegments: 2, curveSegments: 4, steps: 1 });
    g.deleteAttribute('uv'); g.deleteAttribute('normal');
    g = mergeVertices(g, 1e-5);
    const p = g.attributes.position, ph = r() * 6;
    const arco = (r() < 0.5 ? -1 : 1) * (0.02 + r() * 0.02), curl = (r() - 0.3) * 0.03, dobra = (r() < 0.5 ? -1 : 1) * (0.004 + r() * 0.006);
    const flip = r() < 0.5, sv = Math.min(1, h / 0.95), v0 = r() * (1 - sv);
    const Ht = h + ry;
    const uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i) - (t - bev * 2) / 2;
      const s = Math.max(0, Math.min(1, -y / Ht)), xn = x / (w / 2);
      const u = Math.max(0, Math.min(1, xn * 0.5 + 0.5));
      uv[i * 2] = flip ? 1 - u : u; uv[i * 2 + 1] = v0 + (1 - s) * sv;
      const ex = 1 - Math.min(1, xn * xn) * 0.3;
      p.setXYZ(i, x, y, z * ex + dobra * xn * xn + arco * Math.sin(s * Math.PI) + curl * s * s + Math.sin(s * 11 + ph) * 0.002);
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.computeVertexNormals();
    if (tint) {
      // AO assado por vértice — topo junto do gancho e ponta um pouco mais escuros, face de trás mais escura
      const col = new Float32Array(p.count * 3), zt = (t - bev * 2) / 2;
      const ss = (a, b, v) => { const q = Math.max(0, Math.min(1, (v - a) / (b - a))); return q * q * (3 - 2 * q); };
      for (let i = 0; i < p.count; i++) {
        const s = Math.max(0, Math.min(1, -p.getY(i) / Ht));
        const xn = Math.min(1, Math.abs(p.getX(i)) / (w / 2));
        let a = (0.40 + 0.60 * ss(0, 0.12, s)) * (1 - 0.22 * ss(0.8, 1, s)) * (1 - 0.62 * xn * xn * xn); // RODADA 12: AO mais forte (massa) // RODADA 11: oclusão mais forte entre ripas
        if (p.getZ(i) < -zt * 0.5) a *= 0.65;
        col[i * 3] = tint[0] * a; col[i * 3 + 1] = tint[1] * a; col[i * 3 + 2] = tint[2] * a;
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    }
    return g;
  };
  const CORTE = [
    { nome: 'COSTELA', mats: C.ripaP, esc: C.ripaEscP, w: [0.03, 0.06] }, // RODADA 12: ripas estreitas e densas
    { nome: 'FRALDINHA', mats: C.fralP, esc: C.fralEscP, w: [0.04, 0.08] },
    { nome: 'MIOLO DE ACÉM', mats: C.acemP, esc: C.acemEscP, w: [0.04, 0.08] },
  ];
  // ponto mais baixo por barra: as 2 de trás passam atrás da prateleira 1,30 (que sobe p/ trás até ~1,40)
  const fundoMin = [1.32, 1.34, 1.42];
  // planos por barra (de trás p/ frente): 5 no desktop, 4 no celular — ripas encostadas (0 cm de folga)
  const planos = [2, 1, 2]; // RODADA 12: 2ª fileira também no iPhone
  const pendura = (cx, topo, zc, w, h, cz, giro = 1, prof = 1, torta = 0) => {
    const t = 0.016 + r() * 0.018;
    const M0 = mtx(cx, topo, zc, (r() - 0.5) * 0.12, (r() - 0.5) * 0.52 * giro, (r() - 0.5) * (0.12 + torta * 0.40));
    const lista = prof < 1 ? cz.esc : cz.mats;
    // RODADA 11: tom próprio por ripa (±15% de luminância; as escuras puxam p/ o vinho)
    const L = 0.84 + r() * 0.30, hue = r();
    const tint = [L, L * (0.86 + hue * 0.16), L * (0.90 + hue * 0.12)];
    add(peca(w, h, t, tint), lista[(r() * lista.length) | 0], M0);
    // ponta de osso aparecendo na ponta de algumas costelas
    if (cz.nome === 'COSTELA' && r() < 0.6) add(CYL, C.osso, mul(M0, mtx((r() - 0.5) * w * 0.4, -h * 0.97 - 0.008, 0.002, 0, 0, (r() - 0.5) * 0.5, 0.005 + r() * 0.003, 0.025 + r() * 0.02, 0.004)));
  };
  const cortina = (y, z, row, camada, topoBase, hMin, hMax, minY) => {
    let x = x0 + 0.06 + (camada % 2) * 0.022 + r() * 0.01;
    while (x < x1 - 0.07) {
      const zona = Math.min(2, Math.max(0, Math.floor((x - x0) / 0.6)));
      const cz = CORTE[zona];
      const w = cz.w[0] + r() * (cz.w[1] - cz.w[0]);
      const topo = topoBase - (0.03 + r() * 0.05) * (r() < 0.8 ? 1 : 0.3); // RODADA 11: topo desalinhado 3–8 cm
      const h = Math.max(0.22, Math.min(topo - minY, hMin + r() * (hMax - hMin)));
      const cx = Math.min(x + w / 2, x1 - 0.06 - w / 2);
      const zc = z + 0.010 + camada * 0.022 + (r() - 0.5) * 0.008;
      pendura(cx, topo, zc, w, h, cz, 1, row === 0 && camada === 0 ? 0 : 1, row === 3 && r() < 0.35 ? 1 : 0);
      cylY(cx, zc - 0.004, topo - 0.010, y, 0.0015, M.gancho);
      x += w * (0.68 + r() * 0.14); // RODADA 12: sobrepostas (~2× mais ripas, sem fresta) // encostadas (as ripas giram/curvam: sem fresta)
    }
  };
  barras.forEach(([y, z], row) => {
    for (let camada = 0; camada < planos[row]; camada++) cortina(y, z, row, camada, y - 0.022, 0.30, 0.75, fundoMin[row]);
  });
  // SEGUNDA FILEIRA encostada na frente (como na foto): ripas penduradas em ganchos S compridos da barra da frente,
  // do meio do vidro (~1,82) até ~1,40 — a gancheira enche a metade de cima do vidro (2,05 → 1,38)
  const [yF, zF] = barras[2];
  cortina(yF, zF + 0.05, 3, 0, 1.86, 0.26, 0.46, 1.40);
  // fundo atrás da gancheira: vinho escuro (frestas leem como carne funda, não inox nem preto)
  B(x0 + 0.06, x1 - 0.06, 1.10, 2.045, zb + 0.047, zb + 0.050, M.fundoCarne);
  // placas de preço na gancheira: uma por vão, do corte que está pendurado ali
  CORTE.forEach((cz, i) => {
    const [n, pr] = TX.ITENS[ETQ_ID[cz.nome]];
    const x = x0 + 0.30 + i * 0.60 + (i === 1 ? 0.05 : 0);
    const m = std({ map: TX.placa(cz.nome === 'MIOLO DE ACÉM' ? 'MIOLO ACÉM' : n, pr), roughness: 0.5 }, { uv: 'native', cast: false });
    add(new THREE.PlaneGeometry(0.20, 0.10), m, mtx(x, 1.90, zf - 0.05));
    B(x - 0.102, x + 0.102, 1.848, 1.952, zf - 0.06, zf - 0.055, M.inoxPol);
    cylY(x, zf - 0.058, 1.952, 2.05, 0.002, M.inoxPol);
  });

  // ---------------- PRATELEIRA 1,30 (prat[1]): vão 1 linguiça toscana, vão 2 contra-filé a vácuo, vão 3 miolo de acém
  const S1 = prat[1];
  const fila = (a, b, fn) => { let x = a + 0.012; while (true) { const w = fn(x, true); if (x + w > b - 0.008) break; fn(x, false); x += w + 0.008; } };
  for (const zc of [-0.14, -0.36]) {
    // linguiça: pacotes de altura/rotação variada, levemente sobrepostos
    { let x = VAO[0][0] + 0.015; while (x + 0.12 < VAO[0][1] - 0.01) { const w = 0.12 + r() * 0.02, hh = 0.026 + r() * 0.016;
      // RODADA 12: gomos de linguiça VISÍVEIS dentro do saco transparente (não pacote opaco)
      const TL = mul(S1, mtx(x + w / 2, 0.002 + (zc < -0.2 ? 0.006 : 0), zc + (r() - 0.5) * 0.02, (r() - 0.5) * 0.08, (r() - 0.5) * 0.12, (r() - 0.5) * 0.06));
      for (let q = 0; q < 4; q++) add(linguicaGeo(r, 0.18 + r() * 0.015, 0.0125, 3), C.toscanaVC, mul(TL, mtx(-w / 2 + 0.018 + q * (w - 0.036) / 3, 0.0135, (r() - 0.5) * 0.01, 0, Math.PI / 2 + (r() - 0.5) * 0.12, 0)));
      add(pacoteVac(r, w, Math.max(hh, 0.03), 0.21), C.sacoTransp, mul(TL, mtx(0, Math.max(hh, 0.03) / 2, 0)));
      x += w + 0.006; } }
    // contra-filé: bifes a vácuo, 2 alturas
    { let x = VAO[1][0] + 0.02; while (x + 0.14 < VAO[1][1] - 0.01) { const w = 0.13 + r() * 0.03, hh = 0.035 + r() * 0.03;
      add(pacoteVac(r, w, hh, 0.19), C.vacCF[(r() * 3) | 0], mul(S1, mtx(x + w / 2, hh / 2 + 0.002, zc, 0, (r() - 0.5) * 0.25))); x += w + 0.01; } }
  }
  // RODADA 8 — miolo de acém/paleta em PEÇAS GROSSAS sem embalagem (como na foto-vitrine-alta, fileira apoiada na base
  // da gancheira): 10 peças ~0,20 × 0,15 × 0,10 extrudadas com bevel, contorno irregular, 2 fileiras encavaladas
  const naco = (w, d, hh, mat, m) => {
    const sh = new THREE.Shape(), N = 20, ph = r() * 6;
    for (let i = 0; i < N; i++) {
      const a = i / N * Math.PI * 2, rr = 1 + 0.14 * Math.sin(a * 2 + ph) + 0.09 * Math.sin(a * 3 + ph * 1.7) + (r() - 0.5) * 0.08;
      const px = Math.cos(a) * w / 2 * rr, py = Math.sin(a) * d / 2 * rr;
      i ? sh.lineTo(px, py) : sh.moveTo(px, py);
    }
    sh.closePath();
    const bev = hh * 0.26;
    let g = new THREE.ExtrudeGeometry(sh, { depth: hh - bev * 2, bevelEnabled: true, bevelThickness: bev, bevelSize: bev * 0.7, bevelSegments: 3, curveSegments: 3 });
    g.rotateX(-Math.PI / 2); g.translate(0, bev, 0);
    const p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      p.setY(i, y * (1 - 0.25 * (x / (w / 2)) ** 2) + Math.sin(x * 25 + z * 18 + ph) * 0.004);
      uv.setXY(i, Math.max(0, Math.min(1, x / w + 0.5)), 0.2 + Math.max(0, Math.min(1, (z + y * 0.6) / d + 0.5)) * 0.5);
    }
    g.computeVertexNormals();
    add(g, mat, m);
  };
  for (let k = 0; k < 10; k++) {
    const fil = k < 5 ? 0 : 1, i = k % 5;
    const w = 0.15 + r() * 0.07, d = 0.13 + r() * 0.05, hh = 0.08 + r() * 0.04;
    const x = VAO[2][0] + 0.06 + i * 0.105 + (r() - 0.5) * 0.02 + fil * 0.05;
    const z = fil ? -0.40 + (r() - 0.5) * 0.03 : -0.17 + (r() - 0.5) * 0.03;
    naco(w, d, hh, C.paleta[(r() * C.paleta.length) | 0], mul(S1, mtx(Math.min(x, VAO[2][1] - 0.07), 0.002 + fil * 0.012, z, (r() - 0.5) * 0.25 - (fil ? 0 : 0.15), r() * 6, (r() - 0.5) * 0.2)));
  }

  // ---------------- PRATELEIRA 0,95 (prat[0]) — RODADA 12: SACOS PLÁSTICOS transparentes (pacoteVac + filme brilhante)
  // com etiqueta amarela, AMONTOADOS (rotação ±10°, alturas variadas, alguns por cima), como na foto-vitrine-alta.
  // Peça própria por produto: COXA/SOBRECOXA = gota com ponta de osso; ASA = peças em V pequenas; PEITO = filé grande liso.
  const S0 = prat[0];
  const vaosFr = [['COXA', 'SOBRECOXA'], ['ASA'], ['PEITO']];
  const nomesPct = ['COXA', 'SOBRECOXA', 'ASA', 'PEITO'];
  const RIM_SACO = (() => {
    const w = 0.23, d = 0.16, e = 0.012, rr = 0.014, sh = new THREE.Shape(), ho = new THREE.Path();
    const rect = (P, hw, hd, rad) => { P.moveTo(-hw + rad, -hd); P.lineTo(hw - rad, -hd); P.quadraticCurveTo(hw, -hd, hw, -hd + rad); P.lineTo(hw, hd - rad); P.quadraticCurveTo(hw, hd, hw - rad, hd); P.lineTo(-hw + rad, hd); P.quadraticCurveTo(-hw, hd, -hw, hd - rad); P.lineTo(-hw, -hd + rad); P.quadraticCurveTo(-hw, -hd, -hw + rad, -hd); };
    rect(sh, w / 2, d / 2, rr); rect(ho, w / 2 - e, d / 2 - e, rr * 0.6); sh.holes.push(ho);
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.002, bevelEnabled: false, curveSegments: 4 }); g.rotateX(-Math.PI / 2); return g;
  })();
  const pecaFrango = (nome, T, w, d) => {
    const pele = C.peleCrua[(r() * 2) | 0];
    if (nome === 'PEITO') {
      // 2 filés grandes lisos lado a lado, enchendo o saco
      for (let k = 0; k < 2; k++) add(organico(new THREE.SphereGeometry(1, 22, 12), r, 0.08, 5), C.file[(r() * 3) | 0], mul(T, mtx((k - 0.5) * w * 0.45, 0.014, (r() - 0.5) * 0.01, 0, (r() - 0.5) * 0.3, 0, w * 0.25, 0.015, d * 0.40)));
    } else if (nome === 'ASA') {
      // 8 asas em V (2 falanges) amontoadas
      for (let k = 0; k < 8; k++) {
        const px = -w * 0.36 + (k % 4) * w * 0.24 + (r() - 0.5) * 0.012, pz = (k < 4 ? -1 : 1) * d * 0.2 + (r() - 0.5) * 0.012;
        const A = mul(T, mtx(px, 0.012 + (r() < 0.3 ? 0.008 : 0), pz, 0, r() * 6, 0));
        add(organico(new THREE.SphereGeometry(1, 12, 8), r, 0.12, 7), pele, mul(A, mtx(-0.017, 0, 0, 0, 0.5, 0, 0.028, 0.011, 0.013)));
        add(organico(new THREE.SphereGeometry(1, 12, 8), r, 0.12, 7), pele, mul(A, mtx(0.017, 0, 0.005, 0, -0.5, 0, 0.026, 0.010, 0.012)));
      }
    } else {
      // coxas/sobrecoxas: gota com ponta de osso, 3 × 2 alternando o sentido
      for (let k = 0; k < 6; k++) {
        const px = -w * 0.32 + (k % 3) * w * 0.32 + (r() - 0.5) * 0.01, pz = (k < 3 ? -1 : 1) * d * 0.21, ry = (k % 2 ? Math.PI : 0) + (r() - 0.5) * 0.6;
        const A = mul(T, mtx(px, 0.015, pz, 0, ry, 0));
        add(organico(new THREE.SphereGeometry(1, 16, 10), r, 0.10, 6), pele, mul(A, mtx(0, 0, 0, 0, 0, 0, nome === 'COXA' ? 0.042 : 0.036, 0.016, nome === 'COXA' ? 0.024 : 0.031)));
        if (nome === 'COXA') cylX(0.032, 0.054, 0.002, 0, 0.0055, C.osso, A);
      }
    }
  };
  VAO.forEach(([a, b], v) => {
    const cxv = (a + b) / 2;
    const cols = 2, rows = 3, PW = 0.23, PD = 0.16;
    const lista = [];
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) lista.push([cxv + (i - 0.5) * (PW + 0.01) + (r() - 0.5) * 0.02, -PD / 2 - 0.01 - j * (PD + 0.005) + (r() - 0.5) * 0.015, j * 0.010, 0]);
    // 2 sacos por cima, encavalados (amontoado)
    for (let k = 0; k < 2; k++) lista.push([cxv + (r() - 0.5) * 0.18, -0.12 - r() * 0.22, 0.034 + r() * 0.01, 1]);
    for (const [cx, cz, y0, top] of lista) {
      const nome = vaosFr[v][(r() * vaosFr[v].length) | 0];
      const hh = 0.030 + r() * 0.012;
      const T = mul(S0, mtx(cx, 0.002 + y0, cz, (r() - 0.5) * (top ? 0.25 : 0.06), (r() - 0.5) * 0.35, (r() - 0.5) * (top ? 0.2 : 0.05)));
      pecaFrango(nome, T, PW, PD);
      // saco: objetos TRANSPARENTES somem atrás do vidro com transmission → saco lido pela ABA de selagem opaca
      // (moldura de plástico 1,2 cm, leve vinco) + filme brilhante opaco só nas pontas dobradas
      add(RIM_SACO, C.abaSaco, mul(T, mtx(0, 0.002, 0, 0, (r() - 0.5) * 0.04)));
      for (const sx of [-1, 1]) add(organico(new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), r, 0.2, 9), C.abaSaco, mul(T, mtx(sx * PW * 0.47, 0.003, (r() - 0.5) * PD * 0.6, 0, 0, 0, 0.012, 0.006, 0.03 + r() * 0.03)));
      add(new THREE.PlaneGeometry(0.085, 0.05), C.etqPct[nomesPct.indexOf(nome)], mul(T, mtx(PW * 0.18 + (r() - 0.5) * 0.03, hh * 0.98 + 0.002, PD * 0.12 + (r() - 0.5) * 0.02, -Math.PI / 2, 0, (r() - 0.5) * 0.3)));
    }
  });

  // ---------------- DECK 0,60 — RODADA 10: frango inteiro em saco EM PÉ (como na foto-vitrine-alta): peça de
  // 0,16 × 0,11 × 0,24, corpo largo embaixo com 2 coxas marcando o plástico na frente, afinando p/ o nó no topo;
  // inclinada ~10° p/ o cliente; 2 fileiras encostadas (4 + 3 por vão) + fileira de trás; saco laranja #e98a2a ou
  // amarelo #f2c23a com rótulo vermelho no terço de cima (virado p/ o cliente)
  const sacoG = () => {
    const g = new THREE.SphereGeometry(1, 28, 22);
    g.rotateY(-Math.PI / 2); // u = 0,5 (centro do rótulo) p/ +Z (cliente)
    const p = g.attributes.position, a = r() * 6, b = r() * 6, c2 = r() * 6, d1 = r() * 6, d2 = r() * 6;
    // RODADA 12: rótulo em posição diferente por saco (UV deslocado ±)
    { const uv = g.attributes.uv, du = (r() - 0.5) * 0.16, dv = (r() - 0.5) * 0.08; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) + du, uv.getY(i) + dv); }
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      // perfil: base larga (corpo), afina no terço de cima p/ o pescoço/nó
      const f = y > 0.25 ? 1 - 0.62 * ((y - 0.25) / 0.75) ** 1.3 : 1 + 0.05 * (1 - ((y + 0.3) / 0.7) ** 2);
      x *= f; z *= f;
      if (y < -0.82) y = -0.82 - (y + 0.82) * 0.2; // fundo achatado (apoia no deck)
      // 2 coxas marcando o saco na frente-baixo (+Z) e vinco entre elas
      const cx1 = Math.exp(-((x - 0.42) ** 2 * 9 + (y + 0.35) ** 2 * 6)), cx2 = Math.exp(-((x + 0.42) ** 2 * 9 + (y + 0.35) ** 2 * 6));
      if (z > 0) z += 0.16 * (cx1 + cx2) * z - 0.07 * Math.exp(-(x * x) * 25) * z * (y < 0 ? 1 : 0);
      // vincos do plástico (mais fortes perto do nó)
      const vk = 0.03 + 0.04 * Math.max(0, y);
      const n = Math.sin(y * 13 + a) * Math.sin(x * 9 + b) + 0.5 * Math.sin((x + y) * 17 + c2) + 0.35 * Math.sin(z * 21 + y * 7);
      // RODADA 12: deformação de baixa frequência ±15% (saco achatado/irregular, não gota simétrica)
      const lo = 0.15 * Math.sin(x * 2.3 + y * 1.7 + d1) * Math.cos(z * 2.1 - y * 1.3 + d2);
      const k = 1 + vk * n + lo;
      p.setXYZ(i, x * k * (1 + 0.08 * Math.sin(y * 3 + d2)), y * (1 + 0.05 * Math.sin(x * 4 + d1)), z * k);
    }
    g.computeVertexNormals();
    return g;
  };
  const no = organico(new THREE.ConeGeometry(0.35, 0.9, 10, 3), r, 0.12, 9);
  VAO.forEach(([a, b]) => {
    const pos = [];
    // RODADA 12: sacos achatados, meio deitados (inclinação 10–25° p/ trás), giro ±25°, encostados uns nos outros
    for (const [n, cz] of [[4, -0.08], [3, -0.18], [4, -0.27]]) {
      const passoX = (b - a - 0.02) / n;
      for (let i = 0; i < n; i++) pos.push([a + 0.01 + passoX * (i + 0.5) + (r() - 0.5) * 0.02, cz + (r() - 0.5) * 0.02, Math.min(0.080, passoX * 0.56), 0]);
    }
    // 2ª camada: 3 sacos DEITADOS por cima da fileira de trás
    for (let i = 0; i < 3; i++) pos.push([a + 0.08 + i * (b - a - 0.16) / 2 + (r() - 0.5) * 0.04, -0.21 + (r() - 0.5) * 0.04, 0.078, 1]);
    for (const [cx, cz, sx, deit] of pos) {
      const sc = 0.92 + r() * 0.14;
      const rx = deit ? -(1.25 + r() * 0.2) : -(0.17 + r() * 0.27);
      const yy = deit ? 0.17 + r() * 0.02 : 0.10 * sc * Math.cos(rx);
      const F = mul(deck, mul(mtx(cx, yy, cz, rx, (r() - 0.5) * 0.87, (r() - 0.5) * (deit ? 0.4 : 0.14)), mtx(0, 0, 0, 0, 0, 0, sx * sc, 0.12 * sc, 0.042 * sc)));
      const mat = C.sacoFr[(r() * C.sacoFr.length) | 0];
      add(sacoG(), mat, F);
      // nó franzido + ponta torcida no topo (sem 'vela' branca): clipe pequeno colorido
      add(organico(new THREE.SphereGeometry(1, 12, 8), r, 0.25, 7), mat, mul(F, mtx((r() - 0.5) * 0.1, 1.0, 0, 0, 0, 0, 0.22, 0.12, 0.30)));
      add(no, mat, mul(F, mtx((r() - 0.5) * 0.15, 1.18, 0, 0, 0, (r() - 0.5) * 0.9, 0.34, 0.20, 0.45)));
      add(new THREE.BoxGeometry(0.36, 0.07, 0.5), [M.vermelho, M.amarelo, M.grafite][(r() * 3) | 0], mul(F, mtx(0, 1.09, 0)));
    }
  });

  // ---------------- etiquetas no porta-etiqueta, uma por vão, do produto que está nele
  const porPrat = [['COXA E SOBRECOXA', 'ASA DE FRANGO', 'PEITO DE FRANGO'], ['LING. TOSCANA', 'CONTRA-FILÉ', 'MIOLO DE ACÉM']];
  // RODADA 12: etiqueta de trilho própria 1024×256 (fonte ≥ 90 px, anisotropia máxima) — legível no desktop
  const etqT = nome => { const [n, p] = TX.ITENS[ETQ_ID[nome]]; return std({ map: TX.etiquetaTrilho(n, p), roughness: 0.55, envMapIntensity: 0.3 }, { uv: 'native', cast: false }); };
  prat.forEach((S, k) => porPrat[k].forEach((nome, i) => add(new THREE.PlaneGeometry(0.17, 0.0425), etqT(nome), mul(S, mtx((VAO[i][0] + VAO[i][1]) / 2, -0.027, 0.0135)))));
  { const m = etqT('FRANGO INTEIRO'); VAO.forEach(([a, b]) => add(new THREE.PlaneGeometry(0.17, 0.0425), m, mtx(xm + (a + b) / 2, 0.635, zf - 0.03, -0.3))); }
}

// ======================================================================= BALCÃO BAIXO ROMA
function balcaoBaixo(r) {
  const x0 = 1.001, x1 = 4.998, zf = -1.996, zb = -2.866;
  // RODADA 11: laterais TRAPEZOIDAIS como o render Roma — traseira vertical, frente vertical até o gabinete (0,80) e
  // inclinada p/ trás em cima (Z −1,996 → −2,066 a 1,30): 0,87 embaixo e 0,80 no topo. O vidro frontal segue a inclinação.
  const INC = 0.02, ANG = Math.atan2(INC, 0.50), // RODADA 12: vidro praticamente reto ('V. RETO' da planta), ~2°
    GV = mtx(0, 0.80, zf, -ANG); // GV: frente inclinada (local y = ao longo do vidro)
  const sh = new THREE.Shape();
  sh.moveTo(-zf, 0.10); sh.lineTo(-zb, 0.10); sh.lineTo(-zb, 1.30); sh.lineTo(-zf + INC, 1.30); sh.lineTo(-zf, 0.80); sh.closePath();
  const lat = new THREE.ExtrudeGeometry(sh, { depth: 0.05, bevelEnabled: false });
  add(lat, M.inoxLat, mtx(x0, 0, 0, 0, Math.PI / 2));
  add(lat, M.inoxLat, mtx(x1 - 0.05, 0, 0, 0, Math.PI / 2)); // RODADA 12: laterais em inox claro (render Roma)
  for (const [a, b] of [[x0 - 0.002, x0 + 0.052], [x1 - 0.052, x1 + 0.002]]) {
    B(a, b, 0.10, 0.80, zf - 0.02, zf + 0.004, M.inoxPol);
    B(a, b, 0, 0.505, -0.02, 0.004, M.inoxPol, GV);
  }
  // pés + rodapé preto
  for (const x of [x0 + 0.1, (x0 + x1) / 2, x1 - 0.1]) for (const z of [zf - 0.1, zb + 0.1]) cylY(x, z, 0, 0.12, 0.025, M.inoxPol);
  B(x0 + 0.04, x1 - 0.04, 0, 0.12, zb + 0.07, zf - 0.06, M.preto);
  // gabinete
  B(x0 + 0.05, x1 - 0.05, 0.12, 0.80, zf - 0.03, zf, M.inox);
  B(x0 + 0.05, x1 - 0.05, 0.12, 0.80, zb + 0.02, zf - 0.03, M.inoxEsc);
  B(x0 + 0.05, x1 - 0.05, 0.12, 0.84, zb, zb + 0.02, M.inoxTras); // RODADA 12: traseira com reflexo contido
  B(x0 + 0.05, x1 - 0.05, 0.40, 0.41, zf - 0.03, zf + 0.002, M.inoxPol);
  B(x0 + 0.05, x1 - 0.05, 0.795, 0.815, zf - 0.03, zf + 0.008, M.inoxPol);
  // grelhas de ar na base (lado açougueiro)
  for (let x = x0 + 0.3; x < x1 - 0.3; x += 0.9) for (let y = 0.25; y < 0.45; y += 0.03) B(x, x + 0.5, y, y + 0.012, zb - 0.004, zb, M.preto);
  const logo = std({ map: TX.textoSimples('Real', { cor: '#d9dcdf' }), transparent: true, roughness: 0.3, metalness: 0.6 }, { uv: 'native', cast: false });
  add(new THREE.PlaneGeometry(0.16, 0.04), logo, mtx(x0 + 0.2, 0.60, zf + 0.002));
  // poço
  B(x0 + 0.05, x1 - 0.05, 0.78, 0.82, zb + 0.02, zf - 0.01, M.inox);
  B(x0 + 0.05, x1 - 0.05, 0.82, 0.97, -2.83, -2.42, M.inoxEsc);
  B(x0 + 0.056, x0 + 0.06, 0.82, 1.27, zb + 0.03, zf - 0.03, M.internoVitrine);
  B(x1 - 0.06, x1 - 0.056, 0.82, 1.27, zb + 0.03, zf - 0.03, M.internoVitrine);
  // vidro frontal reto 2 folhas (inclinado 8° p/ trás, acompanha a lateral) + montante central em X 3,000
  for (const [a, b] of [[x0 + 0.05, 2.99], [3.01, x1 - 0.05]]) {
    B(a, b, 0.015, 0.47, -0.012, -0.004, M.vidroBalcao, GV);
    B(a, b, 0.015, 0.027, -0.014, -0.002, M.espacador, GV);
    B(a, a + 0.01, 0.015, 0.47, -0.014, -0.002, M.espacador, GV); B(b - 0.01, b, 0.015, 0.47, -0.014, -0.002, M.espacador, GV);
  }
  // RODADA 10: suporte central DIAGONAL (render Roma): barra inox 2 × 2 cm do deck (Z −2,05; Y 0,82) ao perfil do vidro de topo (Z −2,30; Y 1,28)
  // RODADA 12: o diagonal lia como 'rachadura' sobre as bandejas → montante VERTICAL fino 1,5 × 1,5 cm na junta do vidro
  B(2.9925, 3.0075, 0.0, 0.475, -0.017, -0.002, M.inoxPol, GV);
  B(2.995, 3.005, 0.80, 0.83, zf - 0.03, zf + 0.002, M.inoxPol);
  // RODADA 11: riscos de reflexo mais fracos (0,16 → 0,08): o produto aparece, sem véu branco
  add(new THREE.PlaneGeometry(x1 - x0 - 0.1, 0.45), reflexo(2, 9, 0.08), mul(GV, mtx((x0 + x1) / 2, 0.245, 0.003)));
  for (const [a, b] of [[x0 + 0.05, 2.99], [3.01, x1 - 0.05]]) { B(a + 0.01, b - 0.01, 0.458, 0.468, -0.0035, -0.0015, M.bordaVidro, GV); B(a + 0.01, b - 0.01, 0.027, 0.035, -0.0035, -0.0015, M.bordaVidro, GV); }
  // vidro de topo (até a linha da planta Z -2,388) + perfis — a frente recua 7 cm com a inclinação
  const zt = zf - INC;
  B(x0 + 0.05, x1 - 0.05, 1.268, 1.278, -2.385, zt - 0.005, M.vidroTopo);
  // RODADA 7: perfil inox do vidro de topo FINO (1 cm) e junta central exatamente na divisão das bandejas (X 3,000)
  B(x0 + 0.05, x1 - 0.05, 1.268, 1.280, zt - 0.010, zt + 0.004, M.inoxPol);
  B(x0 + 0.05, x1 - 0.05, 1.255, 1.268, zt - 0.040, zt - 0.025, M.ledBalcao); // RODADA 11: régua LED 3000 K mais forte
  B(2.995, 3.005, 1.268, 1.280, -2.39, zt, M.inoxPol);
  // tampo de serviço inox (lado açougueiro), onde ficam as balanças
  // D13: tampo traseiro estreito (0,27) a 1,28-1,30 onde ficam as balanças (como na foto do modelo);
  // entre ele e o vidro de topo, mais 0,21 de vidro: o açougueiro enxerga as bandejas de cima
  B(x0 + 0.05, x1 - 0.05, 1.255, 1.295, zb - 0.01, -2.60, M.inoxServico);
  B(x0 + 0.05, x1 - 0.05, 1.235, 1.295, zb - 0.012, zb - 0.008, M.inoxPol); // borda dobrada
  B(x0 + 0.05, x1 - 0.05, 1.268, 1.278, -2.60, -2.385, M.vidroTopo);
  B(x0 + 0.05, x1 - 0.05, 1.262, 1.296, -2.61, -2.598, M.inoxPol);
  B(x0 + 0.05, x1 - 0.05, 1.243, 1.255, -2.635, -2.61, M.ledTras); // RODADA 12: régua de trás fraca (sem bloom rosado na V4)
  // junta com a vitrine alta: completa a cunha da traseira inclinada (sem vão)
  B(x1 - 0.05, x1, 0.10, 1.30, zb, zb + 0.075, M.inoxV);
  // portas de correr (acrílico) atrás
  // RODADA 11: acrílico das portas traseiras quase invisível (antes virava véu rosado na visão do açougueiro)
  // RODADA 12: traseira ABERTA (acesso do açougueiro às bandejas, sem portas de acrílico): o acrílico + LED + reflexo
  // formavam um véu rosado/leitoso na visão do açougueiro no iPhone. Ficam só o perfil de cima e os 3 montantes.
  B(x0 + 0.05, x1 - 0.05, 1.24, 1.255, zb - 0.002, zb + 0.042, M.inoxEsc);
  for (const x of [x0 + 0.06, (x0 + x1) / 2, x1 - 0.06]) B(x - 0.012, x + 0.012, 0.84, 1.25, zb, zb + 0.04, M.inoxTrasPol);
  // bandejas GN 1/1 em 2 níveis
  // RODADA 7: 8 bandejas por nível (4 de cada lado da junta central X 3,000 — a junta cai na divisão, não no meio de uma)
  const tipos1 = ['bifes', 'temperada', 'passarinho', 'file', 'bifes', 'moida', 'temperada', 'passarinho'];
  const tipos2 = ['toscana', 'espiral', 'calabresa', 'toscana', 'kafta', 'espiral', 'calabresa', 'toscana'];
  const tags1 = [1, 16, 12, 13, 2, 7, 31, 12], tags2 = [8, 9, 10, 30, 11, 9, 10, 8];
  const gap = 0.02, xc = 3.0, w = ((x1 - x0 - 0.10) / 2 - gap / 2 - 0.012 - 3 * gap) / 4, sx = w / 0.53;
  for (let i = 0; i < 8; i++) {
    const cx = i < 4 ? xc - gap / 2 - w / 2 - (3 - i) * (w + gap) : xc + gap / 2 + w / 2 + (i - 4) * (w + gap);
    bandeja(r, mtx(cx, 0.83, -2.21, 8 * Math.PI / 180, 0, 0, sx, 1, 1), tipos1[i], tags1[i], 1, sx, i === 3 || i === 5);
    bandeja(r, mtx(cx, 0.985, -2.63, 8 * Math.PI / 180, 0, 0, sx, 1, 1), tipos2[i], tags2[i], 2, sx, i === 4);
  }
  // balanças
  // RODADA 8: balança 0,74 em Z (corpo 0,26) → assenta INTEIRA no tampo de serviço (Z −2,866 → −2,60), sem balanço
  for (const x of [1.9, 3.9]) balanca(mtx(x, 1.295, -2.733, 0, 0, 0, 1, 1, 0.74));
  solid(x0, x1, zb, zf + 0.01);
}

// RODADA 6: etiqueta de preço GRANDE (canvas 512×256, fonte ≥ 64 px negrito, anisotropia máxima), uma por produto
const ETQ_G = new Map();
// linguiça levemente curvada (dobra a cápsula no comprimento)
function capCurva(cap, r) {
  const g = cap.clone(), p = g.attributes.position, k = (r() - 0.5) * 2.4;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setZ(i, p.getZ(i) + k * y * y); }
  g.computeVertexNormals(); return g;
}
function matEtiqueta(tag) {
  if (!ETQ_G.has(tag)) { const [n, p] = TX.ITENS[tag]; ETQ_G.set(tag, std({ map: TX.etiquetaPreco(n, p), roughness: 0.55, envMapIntensity: 0.3 }, { uv: 'native', cast: false })); }
  return ETQ_G.get(tag);
}
// RODADA 8: fatia de carne (bife) — contorno com ruído radial, espessura hh, bevel, UV planar de cima
// (u ao longo da largura → a capa de gordura da textura fica numa borda)
function fatia(r, w, d, hh, amp = 0.2) {
  const sh = new THREE.Shape(), N = 24, ph = r() * 6, ph2 = r() * 6;
  for (let i = 0; i < N; i++) {
    const a = i / N * Math.PI * 2;
    const rr = 1 + amp * (0.55 * Math.sin(a * 2 + ph) + 0.3 * Math.sin(a * 3 + ph2) + 0.15 * Math.sin(a * 5 + ph * 3)) + (r() - 0.5) * amp * 0.25;
    const px = Math.cos(a) * w / 2 * rr, py = Math.sin(a) * d / 2 * rr;
    i ? sh.lineTo(px, py) : sh.moveTo(px, py);
  }
  sh.closePath();
  const bev = Math.min(0.005, hh * 0.3);
  const g = new THREE.ExtrudeGeometry(sh, { depth: Math.max(0.002, hh - bev * 2), bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 2, curveSegments: 2 });
  g.rotateX(-Math.PI / 2); g.translate(0, bev, 0);
  const p = g.attributes.position, uv = g.attributes.uv, v0 = 0.15 + r() * 0.5;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    p.setY(i, p.getY(i) + Math.sin(x * 40 + z * 31 + ph) * 0.0012);
    uv.setXY(i, Math.max(0, Math.min(1, x / (w * 1.2) + 0.5)), v0 + (z / d + 0.5) * 0.16);
  }
  g.computeVertexNormals();
  return g;
}
function bandeja(r, T0, tipo, tag, nivel = 1, sx = 1, comFilme = false) {
  const w = 0.52, d = 0.32, h = 0.065;
  // nível 2 (atrás): fundo inox escovado como na foto (o polido refletia o escuro e lia como fundo preto)
  B(-w / 2, w / 2, 0, 0.004, -d / 2, d / 2, nivel === 2 ? M.inox : M.inoxPol, T0);
  B(-w / 2, w / 2, 0, h, -d / 2, -d / 2 + 0.004, M.inoxPol, T0); B(-w / 2, w / 2, 0, h, d / 2 - 0.004, d / 2, M.inoxPol, T0);
  B(-w / 2, -w / 2 + 0.004, 0, h, -d / 2, d / 2, M.inoxPol, T0); B(w / 2 - 0.004, w / 2, 0, h, -d / 2, d / 2, M.inoxPol, T0);
  const P = (g, mat, m) => add(g, mat, mul(T0, m));
  const pick = a => a[(r() * a.length) | 0];
  // RODADA 11: sombra de contato no fundo da cuba
  { const ag = new THREE.PlaneGeometry(w - 0.008, d - 0.008); ag.rotateX(-Math.PI / 2); P(ag, AO_BANDEJA, mtx(0, 0.0046, 0)); }
  if (tipo === 'bifes') {
    // RODADA 8 — bifes de contorno IRREGULAR (ruído radial ~20%), 1,5–2 cm, capa de gordura numa borda (textura de
    // fraldinha/contra-filé com fibra), em LEQUE: cada bife encavalado 60% sobre o anterior, ±8° de giro; 2 fileiras
    // que cobrem o fundo da bandeja inteiro
    for (let row = 0; row < 2; row++) {
      const n = 8, passo = 0.42 / (n - 1);
      for (let k = 0; k < n; k++) {
        const bw = 0.10 + r() * 0.03, bd = 0.16 + r() * 0.025, hh = 0.014 + r() * 0.007;
        const g = fatia(r, bw, bd, hh, 0.16 + r() * 0.1);
        P(g, pick(C.bife), mtx(-0.21 + k * passo + (r() - 0.5) * 0.008, 0.006 + hh * 0.2, -0.076 + row * 0.152 + (r() - 0.5) * 0.01,
          (r() - 0.5) * 0.06, (r() - 0.5) * 0.28, 0.30 + (r() - 0.5) * 0.06));
      }
    }
  } else if (tipo === 'temperada' || tipo === 'passarinho') {
    const pas = tipo === 'passarinho';
    // RODADA 9: peças MENORES e SEPARADAS (2 camadas), 2 tons, sobre um fundo escuro de tempero/molho que dá a
    // sombra de contato entre elas (antes era um monte de blobs laranja colados)
    P(new THREE.BoxGeometry(0.40, 0.004, 0.25), C.molho, mtx(0, 0.008, 0));
    const nx = pas ? 12 : 11, nz = 7;
    for (let layer = 0; layer < 2; layer++) for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      if (layer === 1 && (r() < 0.45 || i === 0 || i === nx - 1 || j === 0 || j === nz - 1)) continue;
      if (r() < 0.08) continue;
      const sz = pas ? 0.0125 + r() * 0.0085 : 0.012 + r() * 0.0075; // RODADA 11: ±20% de escala
      const px = -0.19 + (i + 0.5) * (0.38 / nx) + (r() - 0.5) * 0.010 + layer * 0.014;
      const pz = -0.115 + (j + 0.5) * (0.23 / nz) + (r() - 0.5) * 0.008 + layer * 0.012;
      const rot = [(r() - 0.5) * 0.6, r() * 6, (r() - 0.5) * 0.6];
      const q = r(), mat = pas ? (q < 0.35 ? C.passarinho2 : q < 0.6 ? C.passarinho3 : C.passarinho) : C.temperado;
      const Tm = mtx(px, 0.020 + layer * 0.016, pz, rot[0], rot[1], rot[2], sz * (pas ? 1.7 : 1.3), sz * 0.75, sz * (pas ? 1.0 : 1.05));
      P(organico(new THREE.IcosahedronGeometry(1, 3), r, pas ? 0.18 : 0.14, pas ? 3.2 : 4.5), mat, Tm);
      if (pas && r() < 0.3) P(CYL, C.osso, mul(Tm, mtx(0.95, 0.15, 0, 0, 0, Math.PI / 2 + (r() - 0.5) * 0.6, 0.14, 0.6, 0.14)));
    }
  } else if (tipo === 'file') {
    // RODADA 9: filé de peito em GOTA alongada (larga numa ponta, fina na outra), 1,2–1,6 cm, contorno extrudado com
    // bevel, fibra longitudinal no normalMap e brilho úmido (clearcoat 0,3); encavalados em escama, 3 fileiras
    const gota = (L, Wd, hh) => {
      const sh = new THREE.Shape(), N = 28, ph = r() * 6;
      for (let i = 0; i < N; i++) {
        const a = i / N * Math.PI * 2, c = Math.cos(a);
        const larg = Wd / 2 * Math.sin(a) * (0.55 + 0.7 * (1 - c) / 2) * (1 + 0.05 * Math.sin(a * 3 + ph));
        const px = L / 2 * c, py = larg * (1 - 0.55 * Math.max(0, c) ** 2);
        i ? sh.lineTo(px, py) : sh.moveTo(px, py);
      }
      sh.closePath();
      const bev = hh * 0.4;
      const g = new THREE.ExtrudeGeometry(sh, { depth: Math.max(0.002, hh - bev * 2), bevelEnabled: true, bevelThickness: bev, bevelSize: bev * 0.8, bevelSegments: 3, curveSegments: 3 });
      g.rotateX(-Math.PI / 2); g.translate(0, bev, 0);
      const p = g.attributes.position, uv = g.attributes.uv;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), z = p.getZ(i);
        p.setY(i, p.getY(i) * (1 - 0.5 * (x / (L / 2)) ** 2) * (x > 0 ? 0.75 : 1));
        uv.setXY(i, x / L + 0.5, z / L + 0.5);
      }
      g.computeVertexNormals();
      return g;
    };
    for (let row = 0; row < 3; row++) for (let k = 0; k < 4; k++) {
      const L = 0.13 + r() * 0.03, Wd = 0.065 + r() * 0.015, hh = 0.012 + r() * 0.004;
      P(gota(L, Wd, hh), C.file[(r() * 3) | 0], mtx(-0.15 + k * 0.10 + (r() - 0.5) * 0.02 + (row % 2) * 0.025, 0.006 + k * 0.003, -0.095 + row * 0.095 + (r() - 0.5) * 0.01,
        (r() - 0.5) * 0.05, (row % 2 ? Math.PI : 0) + (r() - 0.5) * 0.5, 0.14 + (r() - 0.5) * 0.06));
    }
  } else if (tipo === 'moida') {
    P(organico(new THREE.SphereGeometry(1, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), r, 0.07, 11), C.moidaG, mtx((r() - 0.5) * 0.03, 0.004, 0, 0, r() * 0.3, 0, 0.23 + r() * 0.02, 0.04 + r() * 0.025, 0.13 + r() * 0.015));
  } else if (tipo === 'toscana' || tipo === 'kafta') {
    // RODADA 11: gomos de verdade (estrangulamento + ponta amarrada, tom por gomo, curvatura própria) em 2 CAMADAS,
    // bandeja lotada até a borda
    const kf = tipo === 'kafta', mat = kf ? C.kaftaVC : C.toscanaVC;
    const rad = kf ? 0.014 : 0.0165, nrow = kf ? 8 : 7, por = kf ? 3 : 2;
    for (let row = 0; row < nrow; row++) for (let k = 0; k < por; k++) {
      const len = kf ? 0.12 + r() * 0.02 : 0.19 + r() * 0.04, rr = rad * (0.9 + r() * 0.2);
      const cx = -0.22 + (k + 0.5) * (0.44 / por) + (r() - 0.5) * 0.02, cz = -0.135 + (row + 0.5) * (0.27 / nrow) + (r() - 0.5) * 0.008;
      P(linguicaGeo(r, len, rr, kf ? 1 : 2), mat, mtx(cx, 0.006 + rr, cz, 0, (r() - 0.5) * 0.12, 0));
    }
    for (let k = 0; k < (kf ? 7 : 6); k++) {
      const len = kf ? 0.12 + r() * 0.02 : 0.18 + r() * 0.05, rr = rad * (0.9 + r() * 0.2);
      P(linguicaGeo(r, len, rr, kf ? 1 : 2), mat, mtx(-0.15 + r() * 0.30, 0.006 + rad * 2 + rr * 0.85, -0.10 + r() * 0.20, (r() - 0.5) * 0.15, (r() - 0.5) * 0.9, 0));
    }
  } else if (tipo === 'espiral') {
    for (const cx of [-0.125, 0.125]) {
      const pts = [];
      for (let t = 0; t < 1; t += 0.01) { const a = t * Math.PI * 2 * 4, rr = 0.015 + t * 0.105; pts.push(new THREE.Vector3(Math.cos(a) * rr, 0.012 + t * 0.004, Math.sin(a) * rr)); }
      const curva = new THREE.CatmullRomCurve3(pts), Tm = mtx(cx, 0.004, 0, 0, r() * 6);
      P(new THREE.TubeGeometry(curva, 220, 0.011, 12), C.fina, Tm);
      for (const u of [0, 1]) { const q = curva.getPointAt(u); add(SPH, C.fina, mul(T0, mul(Tm, mtx(q.x, q.y, q.z, 0, 0, 0, 0.011, 0.011, 0.011)))); }
    }
  } else if (tipo === 'calabresa') {
    const nc = 4 + ((r() * 3) | 0);
    for (let k = 0; k < nc; k++) {
      // ferradura: arco de ~300° que volta e se fecha nas pontas (amarradas com barbante)
      const R0 = 0.062 + r() * 0.01, pts = [];
      for (let a = 0; a <= 1.0001; a += 1 / 48) { const ang = Math.PI * 0.5 + 0.28 + a * (Math.PI * 2 - 0.56); pts.push(new THREE.Vector3(Math.cos(ang) * R0, 0, Math.sin(ang) * R0 * 0.82)); }
      const curva = new THREE.CatmullRomCurve3(pts);
      const Tm = mtx(-0.15 + k * (0.30 / Math.max(1, nc - 1)), 0.02 + (k % 2) * 0.014, (k % 2 ? -0.04 : 0.04) + (r() - 0.5) * 0.03, (r() - 0.5) * 0.15, r() * 6, (r() - 0.5) * 0.15);
      P(new THREE.TubeGeometry(curva, 64, 0.017, 14), C.calabresa, Tm);
      for (const u of [0, 1]) { const q = curva.getPointAt(u); add(SPH, C.calabresa, mul(T0, mul(Tm, mtx(q.x, q.y, q.z, 0, 0, 0, 0.017, 0.017, 0.017)))); }
      const q0 = curva.getPointAt(0), q1 = curva.getPointAt(1);
      add(SPH, M.barbante, mul(T0, mul(Tm, mtx((q0.x + q1.x) / 2, 0, (q0.z + q1.z) / 2 + 0.012, 0, 0, 0, 0.012, 0.008, 0.008))));
    }
  }
  // RODADA 7: filme PVC esticado (amassado, com reflexo) em ~60% das bandejas
  if (comFilme) { // RODADA 9: filme PVC só em 3 bandejas (como na foto-vitrine-baixa), mais visível
    const fg = new THREE.PlaneGeometry(w - 0.012, d - 0.012, 14, 8); fg.rotateX(-Math.PI / 2);
    const fp = fg.attributes.position, ph = r() * 6;
    for (let i = 0; i < fp.count; i++) { const x = fp.getX(i), z = fp.getZ(i); const e = Math.min(1, (w / 2 - Math.abs(x)) / 0.05) * Math.min(1, (d / 2 - Math.abs(z)) / 0.05); fp.setY(i, e * (tipo === 'bifes' || tipo === 'file' ? 0.006 : 0.016) + e * Math.sin(x * 37 + ph) * Math.sin(z * 29 + ph * 2) * 0.004); }
    fg.computeVertexNormals();
    P(fg, C.filmeAmassado, mtx(0, h - 0.004, 0));
  }
  // etiqueta espetada
  // 9 × 4,5 cm, espetada e inclinada ~30° para o cliente (+Z) — contra-escala em X (bandeja estreitada p/ 8 por nível)
  add(new THREE.PlaneGeometry(0.09, 0.045), matEtiqueta(tag), mul(T0, mtx(-0.17, 0.085, 0.152, -0.52, 0, 0, 1 / sx, 1, 1)));
  add(new THREE.PlaneGeometry(0.09, 0.045), M.preto, mul(T0, mtx(-0.17, 0.085, 0.1515, -0.52, Math.PI, 0, 1 / sx, 1, 1)));
  B(-0.172, -0.168, 0.02, 0.066, 0.148, 0.152, M.preto, T0);
}

function balanca(T0) {
  // RODADA 5 — balança Prix compacta (como na foto-vitrine-baixa): corpo preto em cunha 0,35 × 0,40 × 0,24,
  // tela LCD grande 0,20 × 0,12 na face inclinada voltada p/ o cliente (+Z), prato inox em cima, tela pequena atrás
  const sh = new THREE.Shape();
  sh.moveTo(-0.20, 0); sh.lineTo(0.20, 0); sh.lineTo(0.20, 0.03); sh.lineTo(0.11, 0.21); sh.lineTo(-0.20, 0.21); sh.closePath();
  const corpo = new THREE.ExtrudeGeometry(sh, { depth: 0.35, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 2, curveSegments: 2 });
  add(corpo, M.balanca, mul(T0, mtx(0.175, 0, 0, 0, -Math.PI / 2, 0)));
  B(-0.16, 0.16, 0.0, 0.006, -0.17, 0.17, M.borracha, T0);
  add(new RoundedBoxGeometry(0.31, 0.012, 0.25, 2, 0.005), M.inoxPol, mul(T0, mtx(0, 0.226, -0.05)));
  B(-0.15, 0.15, 0.218, 0.221, -0.17, 0.07, M.preto, T0);
  const tp = TX.telaPrix();
  const tela = std({ map: tp, emissiveMap: tp, emissive: 0xffffff, emissiveIntensity: 0.85, roughness: 0.65, envMapIntensity: 0.1 }, { uv: 'native', cast: false, semEnv: true }); // RODADA 9: fosca
  const ang = Math.atan2(0.09, 0.18);
  add(new THREE.PlaneGeometry(0.20, 0.12), tela, mul(T0, mtx(0, 0.12 + Math.sin(ang) * 0.009, 0.155 + Math.cos(ang) * 0.009, -ang)));
  add(new THREE.PlaneGeometry(0.22, 0.14), M.preto, mul(T0, mtx(0, 0.12 + Math.sin(ang) * 0.0085, 0.155 + Math.cos(ang) * 0.0085, -ang)));
  const prix = std({ map: TX.textoSimples('prix', { font: 'bold 70px Arial', cor: '#cfd3d6' }), transparent: true, roughness: 0.4 }, { uv: 'native', cast: false });
  add(new THREE.PlaneGeometry(0.045, 0.014), prix, mul(T0, mtx(0.10, 0.045 + Math.sin(ang) * 0.009, 0.19 + Math.cos(ang) * 0.009, -ang)));
  // lado do açougueiro (−Z): tela pequena + teclado de membrana
  const tb = std({ map: TX.telaBalanca(), emissiveMap: TX.telaBalanca(), emissive: 0xffffff, emissiveIntensity: 0.8, roughness: 0.6, envMapIntensity: 0.1 }, { uv: 'native', cast: false, semEnv: true }); // RODADA 9: sem reflexo do spot (uma das balanças saía cinza)
  add(new THREE.PlaneGeometry(0.16, 0.06), tb, mul(T0, mtx(0, 0.165, -0.2085, 0, Math.PI)));
  for (let i = 0; i < 8; i++) for (let j = 0; j < 2; j++) B(-0.115 + i * 0.033 - 0.011, -0.115 + i * 0.033 + 0.011, 0.04 + j * 0.03, 0.06 + j * 0.03, -0.211, -0.207, j ? M.cinzaClaro : M.esmalte, T0);
}

// ======================================================================= TAMPO PORTÃO (animado)
const dinamicos = {};
function tampoPortao() {
  // RODADA 8 — lê como PASSAGEM DA EQUIPE: portinhola TUBULAR (moldura inox Ø 25 mm, chapa só na faixa do meio,
  // vão livre de 0,15 no piso e vazada em cima); TAMPO BASCULANTE na altura do tampo traseiro do balcão (1,265 → 1,30),
  // alinhado com a linha de trás (Z −2,866 → −2,417). RODADA 9: tudo FECHADO por padrão (tampo nivelado com o balcão,
  // como na planta); tampo levanta e portinhola abre só quando alguém chega a < 1,2 m andando.
  const g = new THREE.Group(); scene.add(g);
  // montante fixo junto à parede (tubo + chapa de encosto)
  B(0.012, 0.05, 0, 1.265, -2.66, -2.62, M.inoxV);
  const mk = (geo, mat, x, y, z, par, rz = 0, rx = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, 0, rz); m.castShadow = m.receiveShadow = true; par.add(m); return m; };
  const piv = new THREE.Group(); piv.position.set(0.985, 0, -2.64); g.add(piv);
  const L = 0.90, rt = 0.0125, tubo = new THREE.CylinderGeometry(rt, rt, 1, 16);
  const tuboV = (x, y0, y1) => { const m = mk(tubo, M.inoxPol, x, (y0 + y1) / 2, 0, piv); m.scale.set(1, y1 - y0, 1); };
  const tuboH = (y) => { const m = mk(tubo, M.inoxPol, -L / 2, y, 0, piv, Math.PI / 2); m.scale.set(1, L, 1); };
  // RODADA 11: portinhola INTEIRA (chapa inox de 0,10 a 0,95 dentro da moldura tubular) — sem vazado
  tuboV(-0.012, 0.10, 0.95); tuboV(-L + 0.012, 0.10, 0.95);
  tuboH(0.95); tuboH(0.10);
  mk(new THREE.SphereGeometry(rt, 12, 8), M.inoxPol, -0.012, 0.95, 0, piv); mk(new THREE.SphereGeometry(rt, 12, 8), M.inoxPol, -L + 0.012, 0.95, 0, piv);
  // chapa só no meio (0,35 → 0,72): lê como portinha, não como armário
  mk(new THREE.BoxGeometry(L - 0.03, 0.83, 0.012), M.inoxV, -L / 2, 0.525, 0, piv);
  mk(new THREE.BoxGeometry(L - 0.05, 0.10, 0.016), M.inoxPol, -L / 2, 0.16, 0, piv); // chapa de chute
  // trinco/puxador na ponta livre
  mk(new THREE.BoxGeometry(0.03, 0.10, 0.04), M.preto, -L + 0.04, 0.84, 0, piv);
  // tampo basculante (dobradiça horizontal ao longo de Z, na lateral do balcão)
  const piv2 = new THREE.Group(); piv2.position.set(0.993, 1.265, -2.6415); g.add(piv2);
  mk(new THREE.BoxGeometry(0.98, 0.035, 0.449), M.inoxTampo, -0.49, 0.0175, 0, piv2);
  mk(new THREE.BoxGeometry(0.98, 0.012, 0.012), M.inoxPol, -0.49, 0.03, 0.2245, piv2);
  mk(new THREE.BoxGeometry(0.98, 0.012, 0.012), M.inoxPol, -0.49, 0.03, -0.2245, piv2);
  mk(new THREE.BoxGeometry(0.012, 0.03, 0.449), M.inoxPol, -0.975, 0.012, 0, piv2);
  const arg = mk(new THREE.TorusGeometry(0.028, 0.0045, 10, 28), M.inoxPol, -0.90, 0.037, 0.0, piv2); arg.rotation.x = Math.PI / 2;
  // dobradiças APARENTES: 2 verticais da portinhola (no montante do balcão) e 2 do tampo (na lateral do balcão X 1,001)
  // RODADA 11: dobradiças com VOLUME (tambor Ø 4 cm + abas parafusadas)
  for (const y of [0.25, 0.85]) { cylY(0.985, -2.64, y - 0.07, y + 0.07, 0.020, M.inoxPol); B(0.985, 1.003, y - 0.06, y + 0.06, -2.625, -2.595, M.inoxEsc); cylY(0.985, -2.64, y + 0.07, y + 0.08, 0.012, M.inoxEsc); }
  for (const z of [-2.80, -2.48]) { cylZ(0.993, 1.265, z - 0.06, z + 0.06, 0.016, M.inoxPol); B(0.995, 1.005, 1.17, 1.265, z - 0.05, z + 0.05, M.inoxEsc); }
  // batente de borracha (encosto da portinhola) e faixa de piso (soleira de passagem)
  B(0.05, 0.062, 0.15, 0.95, -2.66, -2.62, M.borracha);
  B(0.06, 0.98, 0.0, 0.003, -2.70, -2.58, M.borrachaCinza);
  dinamicos.tampo = { piv, piv2, t: 0, alvo: 0, col: solid(0.0, 1.0, -2.866, -2.417, 'tampo'), c: [0.5, -2.64] };
}

// ======================================================================= CAIXA (MDF escuro, em L)
function caixa(r) {
  const xa = 2.949, xb = 4.147, za = -1.101, zm = -0.599, xl = 3.249;
  // RODADA 4 — "caixa de madeira de MDF, pode ser MDF escuro" (dono): corpo TODO em MDF nogueira escuro
  // (0,10 → topo), fita de borda preta 1,5 cm nas arestas e quinas, um friso preto a 0,55 (eco do modelo da
  // foto-caixa); inox só no rodapé recuado (0 → 0,10, espelhado), no tampo e no guarda-corpo.
  // RODADA 7 — ?caixa=foto (PADRÃO): segue a foto-caixa — corpo em INOX ESPELHADO de 0,45 ao tampo e faixa baixa de
  // MDF escuro 0,10 → 0,45 com fita preta de 1,5 cm no topo da faixa (0,435 → 0,45) e nas quinas.
  // ?caixa=mdf: variante anterior (corpo todo MDF, fita nas arestas e friso a 0,55).
  const YM = 0.45, YI = 0.80; // YI: RODADA 8 — início da faixa de inox escovado do tampo (padrão MDF)
  const face = (x0, x1, z0, z1, yTop = 0.96) => {
    const e = 0.002;
    if (CAIXA_FOTO) {
      B(x0, x1, 0.10, YM, z0, z1, M.mdf);
      B(x0, x1, YM, yTop, z0, z1, M.inoxEspelho);
      B(x0 - e, x1 + e, YM - 0.015, YM, z0 - e, z1 + e, M.fita);
      return;
    }
    if (CAIXA_MODO !== 'madeira') {
      // PADRÃO: corpo em MDF nogueira escuro dominante; faixa de inox escovado só junto do tampo
      const yi = Math.min(YI, yTop - 0.06);
      B(x0, x1, 0.10, yi, z0, z1, M.mdf);
      B(x0, x1, yi, yTop, z0, z1, M.inoxCaixa);
      B(x0 - e, x1 + e, yi - 0.015, yi, z0 - e, z1 + e, M.fita);
      B(x0 - e, x1 + e, 0.10, 0.115, z0 - e, z1 + e, M.fita);
      // RODADA 10: friso preto de 2 cm entre os painéis de MDF (faces > 0,90 m), como no vídeo-2/foto-caixa
      if (x1 - x0 > 0.9) { const xm = (x0 + x1) / 2; B(xm - 0.01, xm + 0.01, 0.10, yi, z0 - e, z1 + e, M.fita); }
      if (z1 - z0 > 0.9) { const zq = (z0 + z1) / 2; B(x0 - e, x1 + e, 0.10, yi, zq - 0.01, zq + 0.01, M.fita); }
      return;
    }
    B(x0, x1, 0.10, yTop, z0, z1, M.mdf);
    B(x0 - e, x1 + e, 0.10, 0.115, z0 - e, z1 + e, M.fita);
    B(x0 - e, x1 + e, yTop - 0.015, yTop, z0 - e, z1 + e, M.fita);
    B(x0 - e, x1 + e, 0.545, 0.555, z0 - e, z1 + e, M.fita);
  };
  const t = 0.012;
  face(xa, xb, za, za + t);                 // frente (cliente, −Z)
  face(xa, xa + t, za, 0);                  // lateral da SAÍDA (−X)
  face(xb - t, xb, za, zm);                 // lateral da ENTRADA (+X)
  face(xa, xl, -t, 0);                      // ponta da perna voltada p/ a rua (+Z)
  // fita preta vertical nas quinas
  for (const [x, z] of [[xa, za], [xb, za], [xa, 0], [xl, 0], [xb, zm]]) {
    const yq = CAIXA_FOTO ? YM : CAIXA_MODO === 'madeira' ? 0.96 : YI;
    B(x - 0.0075, x + 0.0075, 0.10, yq, z - 0.0075, z + 0.0075, M.fita);
    if (yq < 0.96) B(x - 0.004, x + 0.004, yq, 0.96, z - 0.004, z + 0.004, M.inoxPol); // quina do inox (chapa dobrada)
  }
  // rodapé inox espelhado recuado (reflete o piso)
  B(xa + 0.03, xb - 0.03, 0, 0.10, za + 0.03, zm, M.inoxEspelho);
  B(xa + 0.03, xl - 0.03, 0, 0.10, zm, -0.03, M.inoxEspelho);
  // lado do operador FECHADO, também em MDF: painel com 2 nichos abertos + gaveta; interior em MDF mais claro
  const zo = zm, po = M.mdf, pi = M.mdfInterno;
  B(xl, xb - t, 0.10, 0.15, zo - t, zo, po);           // base
  B(xl, xb - t, 0.70, 0.96, zo - t, zo, po);           // faixa da gaveta
  B(xl, xl + 0.04, 0.15, 0.70, zo - t, zo, po);        // montantes
  B(3.68, 3.72, 0.15, 0.70, zo - t, zo, po);
  B(xb - 0.05, xb - t, 0.15, 0.70, zo - t, zo, po);
  B(xl, xb - t, 0.70, 0.712, zo - 0.0005, zo + 0.001, M.fita); B(xl, xb - t, 0.138, 0.15, zo - 0.0005, zo + 0.001, M.fita);
  // interior dos nichos (fundo, prateleira e laterais)
  const zi = za + t + 0.02;
  B(xl + 0.04, xb - 0.05, 0.15, 0.70, zi, zi + 0.012, pi);
  B(xl + 0.04, xb - 0.05, 0.135, 0.15, zi, zo, pi);
  B(xl + 0.04, xb - 0.05, 0.415, 0.43, zi, zo - 0.01, pi);
  B(3.69, 3.71, 0.15, 0.70, zi, zo, pi);
  B(xl + 0.035, xl + 0.04, 0.15, 0.70, zi, zo, pi); B(xb - 0.055, xb - 0.05, 0.15, 0.70, zi, zo, pi);
  B(xl + 0.04, xb - 0.05, 0.695, 0.70, zi, zo, pi);
  // conteúdo dos nichos: bobinas, sacolas dobradas, caixa de moedas, pasta
  for (let i = 0; i < 3; i++) cylZ(3.34 + i * 0.09, 0.47, -0.95, -0.90, 0.035, M.poli);
  B(3.78, 4.02, 0.43, 0.50, -0.95, -0.70, M.poli);
  B(3.80, 4.00, 0.15, 0.30, -0.95, -0.70, M.cinzaPorta);
  B(3.30, 3.62, 0.15, 0.17, -0.98, -0.66, std({ color: 0x24508a, roughness: 0.6 }));
  // gaveta rente à face, com cava preta
  B(3.473, 3.922, 0.765, 0.92, zo, zo + 0.002, M.mdf);
  B(3.473, 3.922, 0.905, 0.92, zo + 0.0005, zo + 0.0025, M.preto);
  // face interna da perna (voltada p/ o operador)
  B(xl - t, xl, 0.10, 0.96, zm, 0, po);
  // tapete de borracha no piso do operador (lê como posto de trabalho, não como poço)
  B(xl + 0.06, 4.08, 0.0, 0.008, zm + 0.05, -0.06, M.borrachaCinza);
  // tampo inox com beiral
  B(xa - 0.02, xb + 0.02, 0.96, 1.00, za - 0.02, zm, M.inoxTampo);
  B(xa - 0.02, xl + 0.02, 0.96, 1.00, zm, -0.005, M.inoxTampo);
  B(xa - 0.022, xb + 0.022, 0.955, 0.962, za - 0.022, zm, M.inoxPol); // dobra/pingadeira do tampo
  // guarda-corpo tubular
  const yr = 1.08, rr = 0.019, gz = za - 0.005, gx = xa - 0.005;
  cylX(gx, xb - 0.01, yr, gz, rr, M.inoxPol);
  cylZ(gx, yr, gz, -0.03, rr, M.inoxPol);
  add(SPH, M.inoxPol, mtx(gx, yr, gz, 0, 0, 0, rr, rr, rr));
  for (const [x, z] of [[gx, gz], [xb - 0.03, gz], [(xa + xb) / 2, gz], [gx, -0.05], [gx, -0.55]]) cylY(x, z, 1.0, yr, 0.012, M.inoxPol);
  // PDV, impressora, maquininha, leitor
  B(3.72, 3.84, 1.0, 1.01, -1.0, -0.88, M.preto);
  cylY(3.78, -0.94, 1.0, 1.18, 0.018, M.preto);
  const mon = mtx(3.78, 1.29, -0.92, -0.12, Math.PI);
  add(new RoundedBoxGeometry(0.38, 0.28, 0.04, 2, 0.008), M.pretoBrilho, mon);
  const pdv = std({ map: TX.telaPDV(), emissiveMap: TX.telaPDV(), emissive: 0xffffff, emissiveIntensity: 0.8, roughness: 0.2 }, { uv: 'native', cast: false, semEnv: true });
  add(new THREE.PlaneGeometry(0.35, 0.25), pdv, mul(mon, mtx(0, 0, -0.021, 0, Math.PI)));
  // display do CLIENTE 7" em haste própria, virado p/ o cliente (−Z), mostrando o TOTAL
  B(3.50, 3.60, 1.0, 1.008, -1.06, -0.98, M.preto);
  cylY(3.55, -1.02, 1.0, 1.20, 0.012, M.preto);
  const dc = mul(mtx(3.55, 1.25, -1.03, 0, Math.PI, 0), mtx(0, 0, 0, -0.2)); // tela p/ −Z (cliente), topo inclinado p/ trás
  add(new RoundedBoxGeometry(0.19, 0.125, 0.025, 2, 0.006), M.pretoBrilho, dc);
  const tdc = TX.textoSimples('TOTAL R$ 107,98', { font: 'bold 52px Arial', cor: '#ffffff', bg: '#1b7f3a', W: 512, H: 320 });
  add(new THREE.PlaneGeometry(0.165, 0.10), std({ map: tdc, emissiveMap: tdc, emissive: 0xffffff, emissiveIntensity: 0.75, roughness: 0.2 }, { uv: 'native', cast: false, semEnv: true }), mul(dc, mtx(0, 0, 0.0128)));
  // impressora térmica (corpo arredondado, tampa, fenda e papel saindo)
  add(new RoundedBoxGeometry(0.14, 0.13, 0.19, 3, 0.015), M.pretoBrilho, mtx(3.13, 1.065, -0.30));
  add(new RoundedBoxGeometry(0.13, 0.02, 0.10, 2, 0.008), M.pretoFosco, mtx(3.13, 1.13, -0.35));
  B(3.075, 3.185, 1.128, 1.134, -0.302, -0.296, M.preto);
  add(new THREE.PlaneGeometry(0.06, 0.035), M.poli, mtx(3.13, 1.145, -0.293, -0.35));
  B(3.16, 3.175, 1.12, 1.126, -0.22, -0.212, std({ color: 0x29c45a, emissive: 0x29c45a, emissiveIntensity: 1 }));
  // maquininha de cartão (tela acesa + teclado)
  const maq = mtx(3.29, 1.012, -0.94, -0.35, 0.3);
  add(new RoundedBoxGeometry(0.075, 0.022, 0.16, 3, 0.008), M.borrachaCinza, maq);
  const tmaq = std({ map: TX.textoSimples('APROXIME', { font: 'bold 34px Arial', cor: '#fff', bg: '#1565c0', W: 256, H: 128 }), emissiveMap: null, emissive: 0x1e5aa8, emissiveIntensity: 0.6, roughness: 0.2 }, { uv: 'native', cast: false, semEnv: true });
  add(new THREE.PlaneGeometry(0.058, 0.05), tmaq, mul(maq, mtx(0, 0.0115, -0.045, -Math.PI / 2)));
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) B(-0.024 + j * 0.018 - 0.006, -0.024 + j * 0.018 + 0.006, 0.011, 0.014, 0.0 + i * 0.016 - 0.005, 0.0 + i * 0.016 + 0.005, M.cinzaClaro, maq);
  // leitor de código de barras no suporte
  B(3.40, 3.46, 1.0, 1.008, -0.80, -0.74, M.preto);
  add(new RoundedBoxGeometry(0.05, 0.13, 0.05, 2, 0.015), M.pretoBrilho, mtx(3.43, 1.08, -0.77, -0.35));
  add(new THREE.PlaneGeometry(0.035, 0.02), std({ color: 0x000000, emissive: 0xff2a1a, emissiveIntensity: 1.2 }, { cast: false }), mtx(3.43, 1.14, -0.795, -0.35));
  // banqueta alta preta do operador (espaço 4c)
  const bx = 3.80, bz = -0.26;
  cylY(bx, bz, 0, 0.012, 0.20, M.pretoBrilho);
  cylY(bx, bz, 0.012, 0.70, 0.022, M.inoxPol);
  add(new THREE.TorusGeometry(0.16, 0.009, 8, 32), M.inoxPol, mtx(bx, 0.30, bz, Math.PI / 2));
  add(new RoundedBoxGeometry(0.36, 0.06, 0.36, 3, 0.025), M.pretoFosco, mtx(bx, 0.73, bz));
  // painel ".53" (D4) no mesmo padrão das faces do caixa, até 0,90, dos 2 lados
  // painel ".53" (D4, A CONFIRMAR): 0,53 de largura × 0,90, MDF dos 2 lados (face interna em MDF claro, não preto).
  // ?painel53=0 tira o painel e deixa o vão aberto (alternativa p/ o dono escolher).
  // RODADA 7: painel na espessura do vão como no PDF (Z 0,000 → 0,032), mesmo padrão do caixa
  if (PAINEL53) {
    // RODADA 11: peça fina (Z 0 → 0,032), altura total 0,90, mesmo acabamento do portão (MDF + fita + faixa inox + tampo inox)
    face(3.613, 4.117, 0.0, 0.032, 0.87);
    B(3.613, 4.117, 0, 0.10, 0.006, 0.026, M.inoxEspelho);
    B(3.608, 4.117, 0.87, 0.90, -0.006, 0.038, M.inoxTampo);
  }
  const piv = new THREE.Group(); piv.position.set(4.132, 0, zm); scene.add(piv);
  // portão do operador: mesmo MDF, fita preta nas bordas, rodapé inox recuado
  const camadas = CAIXA_FOTO
    ? [[0.10, 0.45, M.mdf, 0, 0], [0.435, 0.45, M.fita, 0.004, 0], [0.45, 0.96, M.inoxEspelho, 0, 0], [0.0, 0.10, M.inoxEspelho, -0.01, 0.02]]
    : CAIXA_MODO === 'madeira'
      ? [[0.10, 0.96, M.mdf, 0, 0], [0.10, 0.115, M.fita, 0.004, 0], [0.945, 0.96, M.fita, 0.004, 0], [0.545, 0.555, M.fita, 0.004, 0], [0.0, 0.10, M.inoxEspelho, -0.01, 0.02]]
      : [[0.10, YI, M.mdf, 0, 0], [YI - 0.015, YI, M.fita, 0.004, 0], [0.10, 0.115, M.fita, 0.004, 0], [YI, 0.96, M.inoxCaixa, 0, 0], [0.0, 0.10, M.inoxEspelho, -0.01, 0.02]];
  // RODADA 10: o portão leva o MESMO tampo inox do caixa (0,96 → 1,00) — lê como continuação do móvel, não caixote
  camadas.push([0.96, 1.00, M.inoxTampo, 0.035, -0.01]);
  for (const [y0, y1, mat, e, rec] of camadas) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.03 + e, y1 - y0, 0.58 - rec * 2), mat); f.position.set(0, (y0 + y1) / 2, 0.30); f.castShadow = f.receiveShadow = true; piv.add(f);
  }
  dinamicos.portao = { piv, t: 0, alvo: 0, col: solid(4.10, 4.16, zm, 0, 'portao'), c: [4.13, -0.30] };
  solid(xa - 0.03, xb + 0.02, za - 0.03, zm); solid(xa - 0.03, xl, zm, 0); if (PAINEL53) solid(3.613, 4.12, 0, 0.032);
}

// ======================================================================= MESA DE TRABALHO + SERRA-FITA
function mesaTrabalho(r) {
  const xa = 1.909, xb = 5.815, za = -4.369, zb = -3.768, xm = 3.862;
  B(xa, xb, 0.86, 0.90, za, zb, M.inox);
  B(xa, xb, 0.86, 0.90, zb - 0.002, zb + 0.004, M.inoxPol);
  B(xa, xb, 0.90, 1.00, za, za + 0.015, M.inox);
  B(xm - 0.002, xm + 0.002, 0.86, 0.901, za, zb + 0.004, M.preto);
  // borda dobrada de 4 cm na frente e nas laterais
  B(xa, xb, 0.82, 0.90, zb - 0.002, zb + 0.008, M.inoxPol);
  B(xa - 0.008, xa, 0.82, 0.90, za, zb + 0.008, M.inoxPol); B(xb, xb + 0.008, 0.82, 0.90, za, zb + 0.008, M.inoxPol);
  for (const [a, b] of [[xa, xm], [xm, xb]]) {
    for (const x of [a + 0.06, b - 0.06]) for (const z of [za + 0.06, zb - 0.06]) {
      cylY(x, z, 0.03, 0.86, 0.02, M.inoxPol);
      cylY(x, z, 0.0, 0.03, 0.026, M.borracha); // sapata regulável
      cylY(x, z, 0.03, 0.045, 0.012, M.inoxEsc);
    }
    B(a + 0.04, b - 0.04, 0.18, 0.20, za + 0.04, zb - 0.04, M.inox);
    B(a + 0.04, b - 0.04, 0.17, 0.18, zb - 0.07, zb - 0.05, M.inoxPol); // dobra da prateleira
    // contraventamento lateral
    for (const x of [a + 0.06, b - 0.06]) cylZ(x, 0.45, za + 0.06, zb - 0.06, 0.012, M.inoxPol);
  }
  // placas de corte (polietileno #dcdad3, fosco, riscos de faca) + peças de carne em tamanho real
  for (const x of [2.6, 4.6]) add(new RoundedBoxGeometry(0.5, 0.02, 0.4, 2, 0.006), M.placaCorte, mtx(x, 0.91, -4.06));
  // RODADA 7: cortes de verdade (contorno irregular extrudado, músculo + capa de gordura na borda, textura da carne
  // pendurada) em vez de "sabonetes" vermelhos lisos
  const corte = (w, d, hh, mat, m) => {
    const sh = new THREE.Shape(), N = 22, ph = r() * 6, k2 = 0.06 + r() * 0.08;
    for (let i = 0; i < N; i++) {
      const a = i / N * Math.PI * 2, rr = 1 + k2 * Math.sin(a * 2 + ph) + 0.05 * Math.sin(a * 5 + ph * 2) + (r() - 0.5) * 0.05;
      const px = Math.cos(a) * w / 2 * rr, py = Math.sin(a) * d / 2 * rr * (1 - 0.18 * Math.max(0, Math.cos(a)));
      i ? sh.lineTo(px, py) : sh.moveTo(px, py);
    }
    sh.closePath();
    const bev = Math.min(0.008, hh * 0.35);
    let g = new THREE.ExtrudeGeometry(sh, { depth: Math.max(0.002, hh - bev * 2), bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 3, curveSegments: 4 });
    g.rotateX(-Math.PI / 2); g.translate(0, bev, 0);
    const p = g.attributes.position, uv = g.attributes.uv, rot = r() < 0.5;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      p.setY(i, p.getY(i) * (1 - 0.35 * ((x / (w / 2)) ** 2)) + Math.sin(x * 30 + z * 20 + ph) * 0.0015);
      const u = rot ? z / d + 0.5 : x / w + 0.5, v = rot ? x / w + 0.5 : z / d + 0.5;
      uv.setXY(i, Math.max(0, Math.min(1, u)), 0.15 + Math.max(0, Math.min(1, v)) * 0.7);
    }
    g.computeVertexNormals();
    add(g, mat, m);
  };
  corte(0.13, 0.24, 0.07, C.fral[1], mtx(4.56, 0.92, -4.10, 0, 1.75, 0));      // peça de fraldinha (capa de gordura)
  corte(0.09, 0.14, 0.022, C.acem[2], mtx(4.77, 0.92, -3.97, 0, -0.35, 0));    // bifes já cortados
  corte(0.085, 0.13, 0.02, C.acem[4], mtx(4.66, 0.92, -3.94, 0, 0.5, 0));
  corte(0.08, 0.13, 0.02, C.ripa[3], mtx(4.40, 0.92, -3.96, 0, 1.2, 0));
  corte(0.12, 0.22, 0.06, C.acem[0], mtx(2.62, 0.92, -4.08, 0, 1.4, 0));
  // faca de açougueiro na placa: lâmina inox (perfil recortado) + cabo preto
  const lam = new THREE.Shape();
  lam.moveTo(0, 0); lam.lineTo(0.20, 0.004); lam.quadraticCurveTo(0.235, 0.02, 0.24, 0.036); lam.lineTo(0, 0.036); lam.closePath();
  const lamG = new THREE.ExtrudeGeometry(lam, { depth: 0.0025, bevelEnabled: false });
  add(lamG, M.inoxPol, mtx(4.26, 0.9215, -3.93, -Math.PI / 2, 0, 0.25));
  add(new RoundedBoxGeometry(0.12, 0.022, 0.03, 2, 0.008), M.pretoBrilho, mtx(4.18, 0.932, -3.965, 0, 0.25));
  // barra magnética com facas penduradas (lâmina p/ baixo, cabo em cima) — RODADA 9: só com ?extras=1
  if (EXTRAS) B(4.45, 5.05, 1.35, 1.39, -4.369, -4.35, M.preto);
  for (let i = 0; i < (EXTRAS ? 5 : 0); i++) {
    const x = 4.53 + i * 0.11, L = 0.16 + (i % 3) * 0.03;
    const sh = new THREE.Shape();
    sh.moveTo(-0.017, 0); sh.lineTo(0.017, 0); sh.lineTo(0.017, -L * 0.7); sh.quadraticCurveTo(0.012, -L, -0.017 + 0.004, -L); sh.closePath();
    add(new THREE.ExtrudeGeometry(sh, { depth: 0.002, bevelEnabled: false }), M.inoxPol, mtx(x, 1.36, -4.349));
    add(new RoundedBoxGeometry(0.026, 0.11, 0.022, 2, 0.008), M.pretoBrilho, mtx(x, 1.42, -4.338));
    cylZ(x, 1.39, -4.328, -4.326, 0.003, M.inoxPol);
  }
  solid(xa, xb, za, zb);
}
function serraFita() {
  // RODADA 8 — serra-fita de açougue de coluna (símbolo da planta / Skymsen): o operador fica no corredor (+Z) e
  // olha p/ −Z. Carcaça vertical em 2 volumes arredondados — BASE com o volante inferior e CABEÇOTE com o volante
  // superior, cada um com a sua TAMPA REDONDA em relevo na face +Z (de frente p/ o corredor) — unidos pela COLUNA da
  // fita à direita (X 6,44 → 6,64, leva o ramo de retorno). O ramo de corte da fita desce aberto à esquerda (X 6,12)
  // entre o cabeçote e a mesa de inox (topo 0,95), com guia regulável + protetor amarelo; carro empurrador com
  // manopla, guia de espessura e régua graduada; pés reguláveis e botoeira. Footprint 0,87 × 0,85 (X 5,878 → 6,746,
  // Z −4,331 → −3,476); altura 1,80.
  const xc = 6.32, zFr = -3.62;            // centro dos volantes (X) e face frontal das tampas
  for (const x of [5.97, 6.66]) for (const z of [-4.25, -3.56]) { cylY(x, z, 0, 0.05, 0.03, M.borracha); cylY(x, z, 0.05, 0.09, 0.015, M.inoxEsc); }
  // BASE (volante inferior)
  add(new RoundedBoxGeometry(0.76, 0.78, 0.68, 4, 0.04), M.inoxV, mtx(6.31, 0.48, -3.94));
  add(new THREE.CylinderGeometry(0.25, 0.25, 0.03, 56), M.inoxPol, mtx(xc, 0.48, zFr + 0.015, Math.PI / 2));
  add(new THREE.TorusGeometry(0.25, 0.009, 10, 56), M.inoxEsc, mtx(xc, 0.48, zFr + 0.03));
  add(new THREE.TorusGeometry(0.17, 0.004, 8, 48), M.inoxEsc, mtx(xc, 0.48, zFr + 0.031));
  cylZ(xc, 0.48, zFr + 0.03, zFr + 0.05, 0.03, M.preto);
  B(xc + 0.22, xc + 0.26, 0.40, 0.56, zFr + 0.02, zFr + 0.04, M.preto);
  for (let y = 0.20; y < 0.45; y += 0.03) B(5.926, 5.93, y, y + 0.012, -4.15, -3.75, M.preto);
  // botoeira: liga (verde) + emergência
  B(6.57, 6.67, 0.64, 0.84, -3.60, -3.585, M.preto);
  cylZ(6.62, 0.79, -3.585, -3.57, 0.014, std({ color: 0x1fa34a, roughness: 0.4 }));
  cylZ(6.62, 0.70, -3.585, -3.56, 0.022, M.vermelho);
  add(new THREE.CylinderGeometry(0.032, 0.032, 0.006, 24), M.amarelo, mtx(6.62, 0.70, -3.584, Math.PI / 2));
  // MESA DE CORTE inox (topo 0,95)
  B(5.89, 6.73, 0.89, 0.95, -4.30, -3.50, M.inoxPol);
  B(5.89, 6.73, 0.87, 0.89, -3.51, -3.50, M.inoxEsc);
  // régua graduada na borda frontal (30 cm a partir da fita)
  B(5.90, 6.10, 0.9505, 0.952, -3.56, -3.52, std({ color: 0xe9e7e0, roughness: 0.6 }));
  for (let k = 0; k <= 20; k++) B(6.10 - k * 0.01, 6.10 - k * 0.01 + 0.0015, 0.952, 0.9528, -3.56, k % 5 ? -3.545 : -3.53, M.preto);
  B(6.10, 6.14, 0.95, 0.9515, -3.82, -3.70, M.preto); // fenda da fita
  // CARRO EMPURRADOR (corre em Z) com placa de empurrar e manopla
  for (const x of [5.92, 6.06]) B(x - 0.008, x + 0.008, 0.95, 0.958, -4.26, -3.54, M.inoxEsc);
  B(5.90, 6.085, 0.958, 0.972, -3.84, -3.56, M.inox);
  B(5.90, 6.085, 0.972, 1.10, -3.575, -3.56, M.inoxPol);
  cylZ(5.99, 1.06, -3.56, -3.50, 0.012, M.inoxPol);
  add(new RoundedBoxGeometry(0.11, 0.035, 0.035, 2, 0.012), M.preto, mtx(5.99, 1.06, -3.49));
  // guia de espessura (paralela à fita) com manípulo
  B(6.15, 6.165, 0.95, 1.07, -4.26, -3.99, M.inoxPol);
  cylX(6.165, 6.21, 1.03, -4.10, 0.01, M.preto); add(SPH, M.preto, mtx(6.22, 1.03, -4.10, 0, 0, 0, 0.022, 0.022, 0.022));
  // COLUNA da fita (ramo de retorno) à direita
  add(new RoundedBoxGeometry(0.18, 0.52, 0.24, 3, 0.03), M.inoxV, mtx(6.54, 1.12, -3.75));
  // RODADA 11 — CABEÇOTE FINO como serra-fita real (SPEC D20): 0,25 de profundidade × 0,46 de altura (Y 1,34 → 1,80),
  // largura do volante (0,62) e FACE SUPERIOR ARREDONDADA (arco elíptico) — a tampa redonda do volante domina a frente
  { const hs = new THREE.Shape(); hs.moveTo(-0.31, 0); hs.lineTo(0.31, 0); hs.lineTo(0.31, 0.22); hs.absellipse(0, 0.22, 0.31, 0.22, 0, Math.PI, false); hs.lineTo(-0.31, 0);
    const hg = new THREE.ExtrudeGeometry(hs, { depth: 0.21, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 3, curveSegments: 24 });
    add(hg, M.inoxV, mtx(xc, 1.36, zFr - 0.23)); }
  add(new THREE.CylinderGeometry(0.205, 0.205, 0.03, 56), M.inoxPol, mtx(xc, 1.57, zFr + 0.015, Math.PI / 2));
  add(new THREE.TorusGeometry(0.205, 0.009, 10, 56), M.inoxEsc, mtx(xc, 1.57, zFr + 0.03));
  add(new THREE.TorusGeometry(0.14, 0.004, 8, 48), M.inoxEsc, mtx(xc, 1.57, zFr + 0.031));
  cylZ(xc, 1.57, zFr + 0.03, zFr + 0.05, 0.026, M.preto);
  B(xc + 0.18, xc + 0.22, 1.50, 1.64, zFr + 0.02, zFr + 0.04, M.preto);
  const plq = std({ map: TX.textoSimples('SERRA-FITA  SF-280', { font: 'bold 54px Arial', cor: '#e8e8e4', bg: '#1d1f22', W: 512, H: 96 }), roughness: 0.4 }, { uv: 'native', cast: false });
  add(new THREE.PlaneGeometry(0.20, 0.0375), plq, mtx(6.12, 0.80, -3.597));
  // manípulo de tensão no topo
  cylY(xc, -3.75, 1.80, 1.82, 0.012, M.inoxPol); add(new THREE.CylinderGeometry(0.032, 0.032, 0.015, 20), M.preto, mtx(xc, 1.828, -3.75));
  // FITA: ramo de corte em X 6,12 no plano dos volantes (largura 2 cm em Z, dentes p/ +Z)
  const xF = 6.12, zF = -3.76;
  B(xF - 0.0006, xF + 0.0006, 0.95, 1.34, zF - 0.01, zF + 0.01, M.inoxPol);
  for (let y = 0.955; y < 1.34; y += 0.010) B(xF - 0.0009, xF + 0.0009, y, y + 0.004, zF + 0.01, zF + 0.013, M.inoxEsc);
  // guia regulável + rolamento + PROTETOR amarelo com faixa vermelha
  B(xF - 0.02, xF + 0.02, 1.14, 1.34, zF - 0.035, zF - 0.015, M.inoxPol);
  B(xF - 0.025, xF + 0.025, 1.11, 1.14, zF - 0.03, zF + 0.016, M.inoxEsc);
  cylX(xF - 0.025, xF + 0.025, 1.125, zF, 0.010, M.preto);
  B(xF - 0.022, xF - 0.004, 1.14, 1.32, zF - 0.012, zF + 0.024, M.amarelo);
  B(xF + 0.004, xF + 0.022, 1.14, 1.32, zF - 0.012, zF + 0.024, M.amarelo);
  B(xF - 0.023, xF + 0.023, 1.14, 1.165, zF - 0.013, zF + 0.025, M.vermelho);
  cylY(5.98, -3.80, 1.30, 1.34, 0.014, M.preto);
  solid(5.878, 6.746, -4.331, -3.476);
}

// ======================================================================= GELADEIRA (expositor de bebidas, porta p/ +X)
function geladeira(r) {
  const xa = 0.017, xb = 0.866, za = -0.718, zb = -0.017, h = 1.95;
  B(xa, xa + 0.05, 0, h, za, zb, M.pretoBrilho);
  B(xa, xb, 0, 0.14, za, zb, M.pretoBrilho);
  B(xa, xb, 1.72, h, za, zb, M.pretoBrilho);
  B(xa, xb, 0.14, 1.72, za, za + 0.05, M.pretoBrilho);
  B(xa, xb, 0.14, 1.72, zb - 0.05, zb, M.pretoBrilho);
  // grelha inferior
  for (let y = 0.03; y < 0.12; y += 0.025) B(xb - 0.002, xb + 0.002, y, y + 0.012, za + 0.06, zb - 0.06, M.preto);
  // interior iluminado
  B(xa + 0.05, xa + 0.06, 0.14, 1.72, za + 0.05, zb - 0.05, M.internoGeladeira);
  // RODADA 10: teto interno sem emissão forte (saía um retângulo estourado no canto de cima)
  B(xa + 0.05, xb - 0.06, 1.71, 1.72, za + 0.05, zb - 0.05, std({ color: 0xc9ced4, emissive: 0xeef6ff, emissiveIntensity: 0.12, roughness: 0.7 }));
  const prateleiras = [0.16, 0.54, 0.92, 1.30];
  // RODADA 5: latas metálicas e garrafas PET com marca INTEIRA virada p/ a porta (+X), cores menos saturadas
  // RODADA 9: a planta só diz "geladeira existente" → bebidas GENÉRICAS, rótulos lisos sem marca nem nome
  // RODADA 10: rótulo com emblema + nome GENÉRICO do produto (sem marca) e altura/tampa variando
  // RODADA 12: líquido coerente com o produto (cola quase preta, guaraná verde-âmbar, cerveja âmbar, água clara, laranja)
  const bebidas = [['#8a2a26', '#f1ebe0', 'COLA', 0x2a120a], ['#2f6a3c', '#f2e9c8', 'GUARANÁ', 0x6e6a1c], ['#b08a3a', '#1e1e1e', 'CERVEJA', 0x7a4a12], ['#3d6a98', '#f4f4f4', 'ÁGUA', 0xdce8f0], ['#d07a20', '#fff3dc', 'LARANJA', 0xd8761a]];
  const rot = bebidas.map(([a, b, t]) => phy({ map: TX.rotuloBebida(a, b, t), roughness: 0.25, metalness: 0.9, clearcoat: 0.6, clearcoatRoughness: 0.15, envMapIntensity: 1.1 }, { uv: 'native' }));
  const rotPet = bebidas.map(([a, b, t]) => phy({ map: TX.rotuloBebida(a, b, t), roughness: 0.25, clearcoat: 0.8, clearcoatRoughness: 0.1 }, { uv: 'native' }));
  const pet = bebidas.map(b => phy({ color: b[3], roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.03, specularIntensity: 1, envMapIntensity: 1.4, sheen: 0.3, sheenColor: new THREE.Color(0xffffff) }, { uv: 'native' }));
  const tampa = bebidas.map(([a]) => std({ color: new THREE.Color(a), roughness: 0.4 }));
  const garrafa = new THREE.LatheGeometry([[0, 0], [0.030, 0], [0.032, 0.006], [0.032, 0.16], [0.026, 0.20], [0.013, 0.235], [0.013, 0.245], [0, 0.245]].map(p => new THREE.Vector2(p[0], p[1])), 18);
  const banda = new THREE.CylinderGeometry(0.0326, 0.0326, 0.07, 18, 1, true);
  const lata = new THREE.CylinderGeometry(0.033, 0.033, 0.122, 24); // RODADA 12: Ø 6,6 × 12,2 cm (lata 350 ml real)
  const tampaLata = new THREE.CylinderGeometry(0.029, 0.031, 0.007, 18);
  prateleiras.forEach((y, k) => {
    B(xa + 0.06, xb - 0.07, y - 0.01, y, za + 0.05, zb - 0.05, M.inoxEsc);
    const b1 = (k * 2 + 1) % bebidas.length, b2 = (k * 2) % bebidas.length;
    for (let j = 0; j < 9; j++) for (let i = 0; i < 3; i++) {
      if (i === 0 && r() < 0.15) continue;
      const bi = j < 5 ? b1 : b2;
      const z = za + 0.10 + j * 0.068 + (r() - 0.5) * 0.004, x = xb - 0.12 - i * 0.075 + (r() - 0.5) * 0.006;
      const ry = (r() - 0.5) * 0.3;
      if (k % 2) {
        add(lata, rot[bi], mtx(x, y + 0.061, z, 0, ry));
        add(tampaLata, M.inoxPol, mtx(x, y + 0.1255, z));
      } else {
        const hy = bi === 3 ? 1.06 : bi === 2 ? 0.92 : 1; // água mais alta, long neck mais baixa (máx. 0,28 < vão 0,37)
        add(garrafa, pet[bi], mtx(x, y, z, 0, ry, 0, 1, hy, 1));
        add(banda, rotPet[bi], mtx(x, y + 0.10 * hy, z, 0, ry));
        cylY(x, z, y + 0.245 * hy, y + 0.262 * hy, 0.0145, tampa[bi]);
      }
    }
  });
  // porta de vidro + caixilho
  B(xb - 0.05, xb, 0.14, 1.72, za + 0.05, za + 0.09, M.pretoBrilho);
  B(xb - 0.05, xb, 0.14, 1.72, zb - 0.09, zb - 0.05, M.pretoBrilho);
  B(xb - 0.05, xb, 0.14, 0.20, za + 0.05, zb - 0.05, M.pretoBrilho);
  B(xb - 0.05, xb, 1.66, 1.72, za + 0.05, zb - 0.05, M.pretoBrilho);
  B(xb - 0.03, xb - 0.022, 0.20, 1.66, za + 0.09, zb - 0.09, M.vidroGeladeira);
  // RODADA 11: caixilho PRETO de 4 cm saliente em toda a volta da porta + puxador tubular vertical com 2 apoios
  for (const [y0, y1, z0, z1] of [[0.14, 0.18, za + 0.05, zb - 0.05], [1.68, 1.72, za + 0.05, zb - 0.05], [0.14, 1.72, za + 0.05, za + 0.09], [0.14, 1.72, zb - 0.09, zb - 0.05]]) B(xb, xb + 0.018, y0, y1, z0, z1, M.pretoBrilho);
  cylY(xb + 0.045, zb - 0.07, 0.62, 1.38, 0.011, M.inoxPol);
  for (const y of [0.66, 1.34]) cylX(xb + 0.018, xb + 0.045, y, zb - 0.07, 0.008, M.inoxPol);
  // riscos de reflexo no vidro (como nos vidros das vitrines)
  add(new THREE.PlaneGeometry(zb - za - 0.10, 1.40), reflexo(5, 5, 0.22), mtx(xb + 0.002, 0.93, (za + zb) / 2, 0, Math.PI / 2));
  // LED vertical escondido atrás do caixilho (antes aparecia como um batente branco torto) + gaxeta preta
  B(xb - 0.075, xb - 0.065, 0.2, 1.66, za + 0.055, za + 0.065, M.ledNeutro);
  B(xb - 0.075, xb - 0.065, 0.2, 1.66, zb - 0.065, zb - 0.055, M.ledNeutro); // RODADA 12: régua LED nos 2 montantes
  // RODADA 12: 1 linha de preço na frente de cada prateleira
  { const pr = ['R$ 6,50', 'R$ 5,00', 'R$ 7,90', 'R$ 4,50']; prateleiras.forEach((y, k) => { const m = std({ map: TX.textoSimples(pr[k] + '  ·  ' + ['GARRAFA', 'LATA 350 ml', 'PET 600 ml', 'LATA 350 ml'][k], { W: 1024, H: 64, cor: '#111', font: 'bold 40px Arial', bg: '#f4f1e6' }), roughness: 0.6 }, { uv: 'native', cast: false }); add(new THREE.PlaneGeometry(0.40, 0.025), m, mtx(xb - 0.068, y - 0.012, (za + zb) / 2, 0, Math.PI / 2)); }); }
  for (const [a, b, c, d] of [[0.20, 0.215, za + 0.09, zb - 0.09], [1.645, 1.66, za + 0.09, zb - 0.09], [0.20, 1.66, za + 0.09, za + 0.105], [0.20, 1.66, zb - 0.105, zb - 0.09]]) B(xb - 0.022, xb - 0.016, a, b, c, d, M.borracha);
  solid(xa, xb + 0.06, za, zb);
}

// ======================================================================= EXTINTOR, CX ENERGIA, SINALIZAÇÃO
const DEMARC = std({ color: 0xc8141b, roughness: 0.6, envMapIntensity: 0.3 }, { cast: false, semEnv: true });
function extintor() {
  // RODADA 7 — ACRÉSCIMO (não está na planta do dono; norma de bombeiro): PQS 6 kg PENDURADO na parede direita, no trecho
  // livre entre a vitrine alta (Z −1,996) e o abrigo d'água (Z −1,314), suporte a ~1,0–1,6 do piso; placa acima.
  // Fora da frente da vitrine e da passagem; sem demarcação de piso (com suporte de parede não é obrigatória).
  const x = 6.70, z = -1.42; // RODADA 8: junto do abrigo, longe da quina da vitrine
  B(6.776, 6.799, 1.20, 1.42, z - 0.04, z + 0.04, M.preto);                 // suporte de parede
  B(x + 0.03, 6.78, 1.30, 1.33, z - 0.05, z + 0.05, M.preto);
  cylY(x, z, 1.00, 1.46, 0.08, M.vermelho);
  add(SPH, M.vermelho, mtx(x, 1.00, z, 0, 0, 0, 0.08, 0.025, 0.08));
  add(SPH, M.vermelho, mtx(x, 1.46, z, 0, 0, 0, 0.08, 0.04, 0.08));
  cylY(x, z, 1.48, 1.56, 0.02, M.preto);
  B(x - 0.05, x + 0.02, 1.55, 1.57, z - 0.012, z + 0.012, M.preto);
  add(new THREE.TorusGeometry(0.07, 0.008, 6, 16, Math.PI), M.borracha, mtx(x - 0.07, 1.48, z, 0, 0, Math.PI / 2));
  add(new THREE.CylinderGeometry(0.0812, 0.0812, 0.12, 12, 1, true, -Math.PI / 4 - 0.6, 1.2), std({ map: TX.rotuloExtintor(), roughness: 0.5 }, { uv: 'native', cast: false }), mtx(x, 1.24, z));
  const pl = std({ map: TX.placaExtintor(), roughness: 0.5 }, { uv: 'native', cast: false });
  add(new THREE.PlaneGeometry(0.2, 0.2), pl, mtx(6.797, 1.72, z, 0, -Math.PI / 2)); // RODADA 8: placa 0,20 × 0,20
  solid(x - 0.09, 6.799, z - 0.09, z + 0.09);
}
function cxEnergia() {
  // RODADA 6: caixa de alvenaria/reboco do padrão de entrada ENCOSTADA na fachada cheia (Z 0,201 → 0,453)
  B(-0.159, 0.984, 0, 1.50, 0.201, 0.453, M.rebocoCinza);
  B(-0.179, 1.004, 1.50, 1.54, 0.19, 0.48, M.granito);
  B(0.15, 0.85, 0.30, 1.30, 0.453, 0.458, M.cinzaClaro);
  B(0.35, 0.65, 0.95, 1.18, 0.458, 0.462, M.vidroGeladeira);
  B(0.37, 0.63, 0.97, 1.16, 0.44, 0.452, M.internoVitrine);
  B(0.78, 0.80, 0.70, 0.86, 0.458, 0.475, M.preto);
  for (let y = 0.4; y < 0.8; y += 0.04) B(0.25, 0.55, y, y + 0.015, 0.458, 0.466, M.cinzaPorta);
  solid(-0.159, 0.984, 0.201, 0.453);
}
function sinalizacao() {
  // letreiro interno (letra caixa dourada + backlight)
  // letra-caixa: face dourada + "corpo" de 1,5 cm feito de camadas recortadas (alphaTest, sem blending) — em ângulo
  // aparece a espessura da letra, não um texto duplicado; o backlight é só um brilho borrado colado na parede.
  const L = TX.letreiro({ cor: '#e3c27e' });
  const LC = TX.letreiro({ cor: '#5a4422' });
  const G = TX.letreiro({ cor: '#ffcf8a', glow: true });
  const ouro = std({ map: L, color: 0xffffff, metalness: 0.8, roughness: 0.3, alphaTest: 0.4, envMapIntensity: 1.4, emissive: 0x3a2a10, emissiveMap: L, side: THREE.DoubleSide }, { uv: 'native', cast: false });
  const corpo = std({ map: LC, color: 0xffffff, metalness: 0.6, roughness: 0.45, alphaTest: 0.4, envMapIntensity: 0.8, side: THREE.DoubleSide }, { uv: 'native', cast: false });
  const halo = new THREE.MeshBasicMaterial({ map: G, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.45, fog: false });
  halo.userData = { uv: 'native', cast: false };
  const zw = -4.369;
  // RODADA 5: centro em X 2,75 (antes 3,15) e 8% menor — visto da ENTRADA (V1) a vitrine alta cortava o "R"
  // RODADA 7: acima do visor e à direita (X 3,25 → 4,59): é a única faixa da parede do fundo visível INTEIRA tanto
  // da calçada (V8, o pilar central esconde X < 3,25) quanto da entrada (V1, a vitrine alta esconde X > 4,62)
  const LX = 3.85, LW = 1.32, LH = 1.32 * 560 / 2048, LY = 2.60;
  add(new THREE.PlaneGeometry(LW, LH), halo, mtx(LX, LY, zw + 0.001));
  for (let k = 1; k <= 6; k++) add(new THREE.PlaneGeometry(LW, LH), corpo, mtx(LX, LY, zw + 0.002 + k * 0.002));
  add(new THREE.PlaneGeometry(LW, LH), ouro, mtx(LX, LY, zw + 0.016));
  // letreiro externo (branco iluminado), mesma construção
  const LE = TX.letreiro({ cor: '#ffffff' });
  const LEc = TX.letreiro({ cor: '#9a9a96' });
  const GE = TX.letreiro({ cor: '#fff3e0', glow: true });
  const branco = std({ map: LE, emissive: 0xfff3e0, emissiveMap: LE, emissiveIntensity: 1.6, alphaTest: 0.4, side: THREE.DoubleSide }, { uv: 'native', cast: false });
  const corpoE = std({ map: LEc, roughness: 0.5, alphaTest: 0.4, side: THREE.DoubleSide }, { uv: 'native', cast: false });
  const haloE = new THREE.MeshBasicMaterial({ map: GE, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.4, fog: false });
  haloE.userData = { uv: 'native', cast: false };
  const zf = 0.201;
  add(new THREE.PlaneGeometry(3.6, 0.98), haloE, mtx(3.40, 3.20, zf + 0.001));
  for (let k = 1; k <= 7; k++) add(new THREE.PlaneGeometry(3.6, 0.98), corpoE, mtx(3.40, 3.20, zf + 0.002 + k * 0.0025));
  add(new THREE.PlaneGeometry(3.6, 0.98), branco, mtx(3.40, 3.20, zf + 0.021));
  // setas no piso
  // planta: SAÍDA aponta p/ a rua (+Z), ENTRADA p/ dentro (−Z). A textura (sentido 1) aponta p/ o topo,
  // que o plano deitado (−π/2 em X) leva p/ −Z; a SAÍDA gira π no próprio plano, e o texto fica legível p/ quem anda no sentido da seta.
  const sai = std({ map: TX.setaPiso('SAÍDA', 1), transparent: true, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 }, { uv: 'native', cast: false, seta: true });
  const ent = std({ map: TX.setaPiso('ENTRADA', 1), transparent: true, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 }, { uv: 'native', cast: false, seta: true });
  // posições da planta: SAÍDA em X≈2,04 e ENTRADA em X≈4,60 e 5,85, ~0,13 da fachada (centro a 0,25 p/ dentro)
  add(new THREE.PlaneGeometry(0.42, 0.42), sai, mtx(2.04, 0.002, -0.25, -Math.PI / 2, 0, Math.PI));
  add(new THREE.PlaneGeometry(0.42, 0.42), ent, mtx(4.60, 0.002, -0.25, -Math.PI / 2));
  add(new THREE.PlaneGeometry(0.42, 0.42), ent, mtx(5.85, 0.002, -0.25, -Math.PI / 2));
  // placas suspensas finas DENTRO de cada vão, no eixo da porta (ENTRADA lida da calçada, SAÍDA lida de dentro)
  const pe = std({ map: TX.textoSimples('ENTRADA', { font: '900 96px Arial', cor: '#fff', bg: '#141414', W: 512, H: 136 }), emissive: 0xffffff, emissiveIntensity: 0.0, roughness: 0.45 }, { uv: 'native', cast: false });
  const ps = std({ map: TX.textoSimples('SAÍDA', { font: '900 96px Arial', cor: '#fff', bg: '#141414', W: 512, H: 136 }), roughness: 0.45 }, { uv: 'native', cast: false });
  const placaSusp = (x, mat) => {
    // RODADA 6: placa menor e fina, encostada sob a caixa do rolo (não vira bloco preto no 1º quadro do iPhone)
    // RODADA 7: placa 0,45 × 0,12 com texto branco em negrito (legível da calçada)
    B(x - 0.235, x + 0.235, 2.47, 2.61, -0.160, -0.152, M.preto);
    add(new THREE.PlaneGeometry(0.45, 0.12), mat, mtx(x, 2.54, -0.1515));              // face p/ a rua
    add(new THREE.PlaneGeometry(0.45, 0.12), mat, mtx(x, 2.54, -0.1605, 0, Math.PI));  // face p/ dentro
  };
  placaSusp(1.967, ps);  // vão SAÍDA (0,984 → 2,949), no eixo
  placaSusp(5.33, pe);   // vão útil da ENTRADA (4,147 → 6,513), no eixo
}

// ======================================================================= EXTERIOR
function exterior(r) {
  // RODADA 8: rua e calçadas com 120 m (o fundo nunca mostra borda nem céu vazio nas vistas oblíquas)
  B(-56, 64, -0.06, -0.01, 0.201, 3.2, M.calcada);
  B(-56, 64, -0.16, 0.0, 3.2, 3.35, M.meioFio);
  B(-56, 64, -0.20, -0.16, 3.35, 12.4, M.asfalto);
  // RODADA 12: sarjeta de concreto (30 cm) junto aos 2 meios-fios
  B(-56, 64, -0.16, -0.152, 3.35, 3.65, M.sarjeta); B(-56, 64, -0.16, -0.152, 12.1, 12.4, M.sarjeta);
  for (let x = -55; x < 64; x += 3) B(x, x + 1.6, -0.16, -0.155, 7.82, 7.94, M.faixa);
  B(-56, 64, -0.16, 0.0, 12.4, 12.55, M.meioFio);
  B(-56, 64, -0.06, -0.01, 12.55, 15.62, M.calcada);
  // vizinhos (mesma testada)
  const viz = (x0, x1, h, cor, seed) => {
    const m = std({ map: TX.fachadaVizinha(cor, seed), roughness: 0.9 }, { tile: [2, 2] });
    B(x0, x1, 0, h, -6, 0.201, m);
    // RODADA 11: platibanda saliente com pingadeira + friso de laje a cada pavimento (não é mais caixa lisa)
    B(x0, x1, h - 0.45, h, 0.201, 0.25, m);
    B(x0 - 0.02, x1 + 0.02, h, h + 0.06, -6, 0.29, M.meioFio);
    for (let y = 3.3; y < h - 0.8; y += 2.9) B(x0, x1, y, y + 0.10, 0.201, 0.23, M.meioFio);
    return m;
  };
  // marquise de concreto sobre o térreo dos 2 vizinhos colados (lê como comércio de rua)
  { const [a, b] = [-8.8, -0.40]; B(a, b, 3.31, 3.40, 0.201, 1.25, M.rebocoCinza); B(a, b, 3.31, 3.44, 1.20, 1.27, M.meioFio); }
  viz(-9, -0.159, 6.2, '#b3a690', 301);
  B(-6.8, -1.2, 0, 2.9, 0.201, 0.21, M.cinzaClaro);
  for (let y = 0.1; y < 2.9; y += 0.08) B(-6.8, -1.2, y, y + 0.01, 0.21, 0.214, M.cinzaPorta);
  B(-7.0, -1.0, 3.4, 4.9, 0.201, 0.21, M.vidroGeladeira);
  B(-7.0, -1.0, 3.35, 3.4, 0.201, 0.30, M.granito);
  // vizinho esquerdo: testeira neutra (letreiro apagado) sobre a porta de enrolar
  B(-7.0, -1.0, 2.95, 3.30, 0.201, 0.26, std({ color: 0x2f3a44, roughness: 0.5 }));
  B(-6.9, -1.1, 3.05, 3.20, 0.26, 0.262, std({ color: 0xe8e4da, roughness: 0.6 }));
  viz(7.10, 16, 4.6, '#8e979a', 302);
  // RODADA 8: quarteirão continua dos 2 lados (sem céu vazio ao lado da loja nas vistas oblíquas)
  viz(-34, -9, 7.4, '#9c958a', 303); viz(16, 44, 5.6, '#a99f8e', 304);
  // RODADA 9 — fachadas de comércio de verdade nos vizinhos (antes caixas lisas): porta de aço de enrolar com
  // lâminas, testeira lisa (sem marca), toldo de lona inclinado em parte delas, janelas com peitoril no 1º andar
  const acos = [0, 1, 2].map(k => std({ map: TX.portaAco(['#8f9396', '#6f7478', '#a3a39c'][k], k), roughness: 0.55, metalness: 0.3, envMapIntensity: 0.6 }, { uv: 'native' }));
  const testeiras = [0x3b4047, 0xd9d3c4, 0x6b2f2a, 0x2c4a5e, 0x8a7a5a].map(c => std({ color: c, roughness: 0.6 }));
  const lonas = [0x7a3b2e, 0x2f5470, 0x5d6a3a, 0x8a2a2a].map(c => std({ color: c, roughness: 0.85, side: THREE.DoubleSide }));
  const vidroJan = std({ color: 0x2f3a42, roughness: 0.08, metalness: 0.3, envMapIntensity: 1.1 });
  const loja = (x0, x1, h, k) => {
    const w = x1 - x0, hp = 2.75;
    add(new THREE.PlaneGeometry(w - 0.3, hp, 1, 1), acos[k % 3], mtx((x0 + x1) / 2, hp / 2, 0.206));
    B(x0 + 0.1, x0 + 0.15, 0, hp + 0.1, 0.201, 0.23, M.cinzaPorta); B(x1 - 0.15, x1 - 0.1, 0, hp + 0.1, 0.201, 0.23, M.cinzaPorta);
    B(x0 + 0.05, x1 - 0.05, hp + 0.05, hp + 0.55, 0.201, 0.27, testeiras[k % 5]);
    if (k % 2 === 0) { const T = mtx((x0 + x1) / 2, hp + 0.02, 0.62, 0.42); B(-w / 2 + 0.1, w / 2 - 0.1, -0.01, 0.01, -0.45, 0.45, lonas[k % 4], T); B(-w / 2 + 0.1, w / 2 - 0.1, -0.20, 0.0, 0.43, 0.45, lonas[k % 4], T); }
    for (let jx = x0 + 0.5; jx + 1.0 < x1 - 0.3; jx += 1.7) for (let jy = 3.8; jy + 1.2 < h - 0.3; jy += 2.8) {
      B(jx, jx + 1.0, jy, jy + 1.2, 0.195, 0.204, vidroJan);
      B(jx - 0.05, jx + 1.05, jy - 0.06, jy, 0.201, 0.26, M.meioFio);
      B(jx + 0.48, jx + 0.52, jy, jy + 1.2, 0.201, 0.21, M.cinzaClaro);
    }
  };
  for (let x = -33.6, k = 0; x < -9.3; k++) { const w = 4.2 + (k % 3) * 0.9; loja(x, Math.min(x + w, -9.2), 7.4, k); x += w + 0.25; }
  for (let x = 16.3, k = 1; x < 43.6; k++) { const w = 4.0 + (k % 3) * 1.1; loja(x, Math.min(x + w, 43.8), 5.6, k); x += w + 0.25; }
  loja(13.1, 15.8, 4.6, 4);
  // vizinho direito: vitrine escura + porta de enrolar FECHADA + testeira + janelas no 1º andar
  B(7.6, 10.6, 0, 2.8, 0.201, 0.21, std({ color: 0x1b2a33, roughness: 0.08, metalness: 0.3, envMapIntensity: 1.2 }));
  for (const x of [7.6, 9.1, 10.6]) B(x - 0.03, x + 0.03, 0, 2.8, 0.201, 0.23, M.cinzaPorta);
  B(10.9, 12.8, 0, 2.8, 0.201, 0.21, M.cinzaClaro);
  for (let y = 0.1; y < 2.8; y += 0.08) B(10.9, 12.8, y, y + 0.01, 0.21, 0.214, M.cinzaPorta);
  B(10.85, 12.85, 2.78, 2.92, 0.201, 0.30, M.pretoFosco);
  B(7.4, 12.8, 2.95, 3.6, 0.201, 0.26, std({ color: 0x2f4f6a, roughness: 0.5 }));
  B(7.6, 12.6, 3.15, 3.40, 0.26, 0.263, std({ map: TX.textoSimples('ÓTICA  ·  RELOJOARIA', { font: 'bold 60px Arial', cor: '#f2efe6', W: 1024, H: 96 }), roughness: 0.5, transparent: true }, { uv: 'native', cast: false }));
  for (let jx = 7.8; jx < 15; jx += 1.9) {
    B(jx, jx + 1.2, 3.75, 4.35, 0.195, 0.203, std({ color: 0x3c4a54, roughness: 0.06, metalness: 0.3, envMapIntensity: 1.2 }));
    B(jx - 0.05, jx + 1.25, 3.70, 3.75, 0.201, 0.25, M.meioFio);
  }
  // RODADA 11: pilastras de reboco fecham as pontas da fachada de tijolinho (quina reta, sem amarração exposta)
  const pil = std({ map: TX.reboco('#bdb6aa', 91).map, roughness: 0.92 }, { tile: [2, 2] });
  B(-0.36, -0.10, 0, 3.66, -0.05, 0.25, pil); B(6.95, 7.22, 0, 3.66, -0.05, 0.25, pil);
  B(-0.38, -0.08, 3.66, 3.72, -0.05, 0.29, M.meioFio); B(6.93, 7.24, 3.66, 3.72, -0.05, 0.29, M.meioFio);
  // RODADA 12: pavimento superior RECUADO 0,8 m sobre a loja (reboco cinza, empena vertical na altura do vizinho):
  // esconde as laterais dos vizinhos que apareciam como 'cunhas' em perspectiva acima da platibanda
  { const sup = std({ map: TX.reboco('#9e9b95', 97).map, roughness: 0.95, envMapIntensity: 0.3 }, { tile: [2, 2] });
    B(-0.159, 7.10, 3.20, 6.20, -6.0, -0.60, sup);
    B(-0.18, 7.12, 6.20, 6.26, -6.0, -0.56, M.rufo);
    for (const x of [1.0, 4.6]) { B(x, x + 1.5, 4.30, 5.40, -0.598, -0.592, std({ color: 0x1c2328, roughness: 0.12, metalness: 0.2, envMapIntensity: 0.5 })); for (const [p0, p1, q0, q1] of [[x - 0.04, x + 1.54, 5.40, 5.44], [x - 0.04, x + 1.54, 4.26, 4.30], [x - 0.04, x, 4.26, 5.44], [x + 1.5, x + 1.54, 4.26, 5.44], [x + 0.73, x + 0.77, 4.30, 5.40]]) B(p0, p1, q0, q1, -0.596, -0.578, M.rufo); B(x - 0.06, x + 1.56, 4.22, 4.26, -0.60, -0.54, M.meioFio); }
    B(-0.159, 7.10, 3.66, 3.71, -0.60, 0.0, M.rebocoCinza); }
  // prédios altos atrás do quarteirão — RODADA 12: mais baixos e dessaturados (não dominam o quadro no iPhone)
  { const pr = [[-14, -2, 9.5, '#9a968f', 311], [-2, 5.5, 11.0, '#a6a39d', 312], [5.5, 12, 8.6, '#8e8c88', 313], [12, 22, 10.2, '#9c9890', 314]];
    for (const [a, b, h, cor, sd] of pr) {
      const m = std({ map: TX.predio(cor, sd), roughness: 0.95, envMapIntensity: 0.3, color: 0xd8d8d8 }, { tile: [3.0, 3.0] });
      B(a, b, 0, h, -16, -12, m);
      B(a - 0.05, b + 0.05, h, h + 0.4, -16, -11.9, M.rebocoCinza);
    } }
  // RODADA 6: calçada oposta = FUNDO FOTOGRÁFICO PINTADO, desfocado e em baixa saturação, levemente estourado
  // (o "blown-out" de render arquitetônico). Sem prédios modelados, sem carros caixote, sem portas repetidas.
  {
    const fm = new THREE.MeshBasicMaterial({ map: TX.fundoUrbano(), fog: false });
    fm.color.setScalar(0.60); // RODADA 9: exterior um pouco mais escuro; RODADA 7: −35% (antes 1,18 = estourado)
    fm.userData = { uv: 'native', cast: false };
    // RODADA 8: 120 × 16 m, pé em Y −0,06 COLADO na calçada oposta (Z 15,6)
    add(new THREE.PlaneGeometry(120, 16), fm, mtx(4, 7.94, 15.6, 0, Math.PI));
  }
  // RODADA 11: sem poste/lixeira na calçada (caíam no eixo dos vãos nas vistas de dentro)
  // árvores: tronco + copa em billboard cruzado (alpha)
  const copa = std({ map: TX.copaArvore(1), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.9 }, { uv: 'native', cast: false });
  for (const [tx, tz] of []) {
    cylY(tx, tz, 0, 2.2, 0.08, M.tronco);
    for (const ry of [0, Math.PI / 2, Math.PI / 4, -Math.PI / 4]) add(new THREE.PlaneGeometry(3.2, 3.2), copa, mtx(tx, 3.2, tz, 0, ry));
    B(tx - 0.5, tx + 0.5, -0.05, 0.0, tz - 0.4, tz + 0.4, M.tronco);
  }
  solid(-20, -0.159, -10, 0.201); solid(7.1, 30, -10, 0.201);

  solid(-20, 30, 15.4, 30);
}

// sombras de contato (blob) — dá peso aos móveis no piso
function contato() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 10, 64, 64, 64);
  g.addColorStop(0, 'rgba(0,0,0,0.6)'); g.addColorStop(0.55, 'rgba(0,0,0,0.5)'); g.addColorStop(0.8, 'rgba(0,0,0,0.15)'); g.addColorStop(1, 'rgba(0,0,0,0)'); // RODADA 11: só junto ao pé
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  const m = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
  m.userData = { uv: 'native', cast: false };
  const blob = (x0, x1, z0, z1, pad = 0.10) => add(new THREE.PlaneGeometry(1, 1), m, mtx((x0 + x1) / 2, 0.003, (z0 + z1) / 2, -Math.PI / 2, 0, 0, x1 - x0 + pad * 2, z1 - z0 + pad * 2, 1));
  blob(1.0, 4.998, -2.866, -1.996); blob(4.998, 6.799, -2.866, -1.996);
  blob(2.949, 4.147, -1.101, -0.599, 0.12); blob(2.949, 3.249, -0.6, 0.0, 0.12);
  blob(0.017, 0.866, -0.718, -0.017, 0.12); blob(5.878, 6.746, -4.331, -3.476, 0.12);
  blob(1.909, 5.815, -4.369, -3.768, 0.08);
  blob(6.689, 6.799, -1.314, 0, 0.06);
  if (PAINEL53) blob(3.613, 4.117, 0.0, 0.032, 0.10);
  // sombreamento de canto (AO barato) no pé das paredes
  const canto = (x0, x1, z0, z1) => blob(x0, x1, z0, z1, 0.06);
  canto(0, 6.8, -4.369, -4.30); canto(0, 0.06, -3.874, 0); canto(6.74, 6.8, -4.369, -1.314);
}

// ======================================================================= LUZES
const luzes = {};
function iluminacao() {
  const hemi = new THREE.HemisphereLight(0xf2f6ff, 0x8a8478, 0.25); scene.add(hemi);
  // sol (sombra) — ilumina a calçada e entra um pouco pelos vãos
  const sol = new THREE.DirectionalLight(0xffdcb4, 2.5); // RODADA 10: luz de fim de tarde (exterior mais baixo, interior chama atenção)
  sol.position.set(-6, 14, 16); sol.target.position.set(3.4, 0, 1.5);
  sol.castShadow = true;
  sol.shadow.mapSize.set(MOBILE ? 1024 : 2048, MOBILE ? 1024 : 2048);
  Object.assign(sol.shadow.camera, { left: -12, right: 14, top: 12, bottom: -10, near: 1, far: 50 });
  sol.shadow.bias = -0.0004; sol.shadow.normalBias = 0.03; sol.shadow.radius = 3;
  scene.add(sol, sol.target);
  // perfis LED lineares do forro (RectAreaLight) 4000K
  for (const z of [-0.55, -1.55, -3.30]) {
    const ra = new THREE.RectAreaLight(0xfff4ea, 3.4, 5.8, 0.35);
    ra.position.set(3.4, 2.97, z); ra.rotation.x = -Math.PI / 2;
    scene.add(ra);
  }
  // luz de sombra central (spot no forro)
  const sp = new THREE.SpotLight(0xfff3e6, 10, 0, 1.25, 0.9, 2);
  sp.position.set(3.4, 2.95, -1.6); sp.target.position.set(3.2, 0, -2.6);
  sp.castShadow = true; sp.shadow.mapSize.set(MOBILE ? 1024 : 2048, MOBILE ? 1024 : 2048);
  sp.shadow.bias = -0.0003; sp.shadow.normalBias = 0.02; sp.shadow.radius = 4; sp.shadow.camera.near = 0.3; sp.shadow.camera.far = 8;
  scene.add(sp, sp.target);
  // luz das vitrines (LED "carne", quente rosado)
  // (largura 1,45 p/ não banhar o tijolinho da parede direita de luz rosada)
  const va = new THREE.RectAreaLight(0xffd2c2, 8.5, 1.45, 0.5); // RODADA 9: −15%
  va.position.set(5.85, 2.03, -2.35); va.rotation.x = -Math.PI / 2; scene.add(va);
  // spot do canopy com sombra suave: a carne pendurada projeta sombra nas prateleiras (só desktop)
  if (!MOBILE) {
    const vs = new THREE.SpotLight(0xffd6c8, 3.4, 3.2, 0.95, 0.9, 2);
    vs.position.set(5.9, 2.02, -2.20); vs.target.position.set(5.9, 0.6, -2.55);
    vs.castShadow = true; vs.shadow.mapSize.set(1024, 1024); vs.shadow.radius = 4;
    vs.shadow.bias = -0.0005; vs.shadow.normalBias = 0.015; vs.shadow.camera.near = 0.05; vs.shadow.camera.far = 3;
    scene.add(vs, vs.target);
  }
  const va2 = new THREE.SpotLight(0xffd8cc, 1.35, 1.4, 1.2, 0.9, 2);
  // RODADA 5: fonte DENTRO da vitrine (atrás do vidro) — antes refletia no vidro frontal e estourava o centro da prateleira
  va2.position.set(5.85, 1.28, -2.06); va2.target.position.set(5.85, 0.9, -2.6); scene.add(va2, va2.target);
  const bb = new THREE.RectAreaLight(0xffc8a8, 8, 3.85, 0.6); // RODADA 11: 3000 K, +33%
  bb.position.set(3.0, 1.25, -2.40); bb.rotation.x = -Math.PI / 2; scene.add(bb);
  // pendentes do caixa
  // pendentes do caixa: 3 spots (35°, penumbra 0,6) que fazem "poça" de luz no tampo
  for (const [k, x] of (EXTRAS ? [3.15, 3.55, 3.95] : []).entries()) {
    const ps = new THREE.SpotLight(0xffd9b0, 9, 4, THREE.MathUtils.degToRad(35), 0.6, 2);
    ps.position.set(x, 2.55, -0.85); ps.target.position.set(x, 0.9, -0.80);
    if (k === 1) { ps.castShadow = true; ps.shadow.mapSize.set(MOBILE ? 512 : 1024, MOBILE ? 512 : 1024); ps.shadow.radius = 4; ps.shadow.bias = -0.0004; ps.shadow.normalBias = 0.02; ps.shadow.camera.near = 0.3; ps.shadow.camera.far = 4; }
    scene.add(ps, ps.target);
  }
  // RODADA 10: wall-washers rasantes no tijolinho preto da parede do fundo (realçam o relevo do tijolo e criam
  // gradiente de luz de cima p/ baixo, como em render comercial) — 3 no desktop, 2 no celular, sem sombra
  for (const x of (MOBILE ? [1.35, 5.30] : [1.35, 4.70, 5.95])) {
    const ww = new THREE.SpotLight(0xffe9d2, 5, 4.2, 0.55, 0.85, 2);
    ww.position.set(x, 2.93, -4.10); ww.target.position.set(x, 0.9, -4.37); scene.add(ww, ww.target);
  }
  // preenchimento fraco no posto do operador (não vira poço preto)
  const po = new THREE.PointLight(0xffe6c8, 0.5, 1.4, 2); po.position.set(3.7, 0.85, -0.30); scene.add(po);
  // geladeira
  // RODADA 12: 2 fontes fracas junto às réguas LED verticais dos montantes (não um ponto estourado só)
  for (const z of [-0.64, -0.09]) { const gl = new THREE.PointLight(0xe8f2ff, 0.32, 1.2, 2); gl.position.set(0.74, 0.95, z); scene.add(gl); }
  Object.assign(luzes, { hemi, sol, sp, va, bb });
}

// ======================================================================= MONTAGEM
const R = TX.rng(2026);
casca(); flush();
forro();
vitrineAlta(R); flush();
balcaoBaixo(R); flush();
tampoPortao();
caixa(R); flush();
mesaTrabalho(R); serraFita(); flush();
geladeira(R); if (EXTRAS) extintor(); cxEnergia(); flush();
sinalizacao(); contato(); flush();
// RODADA 8: setas 3D do piso (somem no modo Planta, onde viram rótulos de pé na tela)
const setasPiso = []; scene.traverse(o => { if (o.isMesh && o.material && o.material.userData.seta) setasPiso.push(o); });
const ext = new THREE.Group(); scene.add(ext);
exterior(R); flush(ext);
// cotas da planta (só aparecem no modo Planta), como no PDF: paredes cortadas a 1,20 (poché preto),
// linhas de cota com traços e rótulos AO LADO das linhas (fora dos móveis); tamanho de texto constante na tela
const cotas = new THREE.Group(); cotas.visible = false; scene.add(cotas);
// RODADA 8: cotas em 2 jogos — PAISAGEM (como a planta do dono, cotas nos corredores) e RETRATO (planta girada 90°:
// as cotas de medida vão POR FORA do contorno das paredes, a 0,35+ da face externa, e nada cruza piso/caixa)
const cotasP = new THREE.Group(), cotasR = new THREE.Group(); cotas.add(cotasP, cotasR);
let alvoCotas = cotas;
const YC = 1.17;
const matCota = new THREE.MeshBasicMaterial({ color: 0x1d1f23, fog: false, depthTest: false, transparent: true, opacity: 1 });
const matPoche = new THREE.MeshBasicMaterial({ color: 0x141518, fog: false });
function cota(txt, x, z) {
  const Wp = Math.max(256, Math.ceil(txt.length * 37 + 70)); // canvas do tamanho do texto (nada cortado)
  const t = TX.textoSimples(txt, { font: 'bold 64px Arial', cor: '#ffffff', bg: 'rgba(20,22,26,0.86)', W: Wp, H: 112 });
  t.generateMipmaps = false; t.minFilter = THREE.LinearFilter;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true, fog: false }));
  sp.userData.asp = Wp / 112; sp.position.set(x, YC + 0.02, z); sp.renderOrder = 12; alvoCotas.add(sp);
  return sp;
}
function linhaCota(x0, z0, x1, z1, ticks) {
  const g = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.012, Math.abs(x1 - x0)), 0.002, Math.max(0.012, Math.abs(z1 - z0))), matCota);
  g.position.set((x0 + x1) / 2, YC, (z0 + z1) / 2); g.renderOrder = 11; alvoCotas.add(g);
  const hor = Math.abs(x1 - x0) > Math.abs(z1 - z0);
  for (const k of ticks) {
    const tk = new THREE.Mesh(new THREE.BoxGeometry(hor ? 0.012 : 0.14, 0.002, hor ? 0.14 : 0.012), matCota);
    tk.position.set(hor ? k : x0, YC, hor ? z0 : k); tk.renderOrder = 11; alvoCotas.add(tk);
  }
}
// poché (paredes e pilares cortados) — só no modo Planta
for (const [a0, a1, b0, b1] of [[-0.159, 0, -3.874, 0.201], [-0.159, 0.715, -4.538, -4.043], [-0.159, 0.116, -4.043, -3.874],
  [0.715, 0.986, -4.538, -4.369], [1.867, 2.146, -4.538, -4.369], [4.147, 6.998, -4.538, -4.369], [6.799, 6.998, -4.369, -1.314],
  [2.949, 3.613, 0, 0.201], [6.513, 6.998, 0, 0.201], [-0.159, 0.984, 0, 0.201]]) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(a1 - a0, 0.01, b1 - b0), matPoche);
  m.position.set((a0 + a1) / 2, YC + 0.005, (b0 + b1) / 2); cotas.add(m);
}
// cx. energia, abrigo d'água: cor CHAPADA clara + contorno fino (sem reflexo/degradê: desenhado por cima de tudo)
function contorno(x0, x1, z0, z1, cor, mapa = null) {
  const f = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.01, z1 - z0), new THREE.MeshBasicMaterial({ color: cor, map: mapa, fog: false, depthTest: false, toneMapped: false, transparent: true, opacity: 1 }));
  f.position.set((x0 + x1) / 2, YC + 0.004, (z0 + z1) / 2); f.renderOrder = 10; cotas.add(f); // transparente: desenha DEPOIS das sombras de contato (que escureciam o abrigo)
  linhaCota(x0, z0, x1, z0, []); linhaCota(x0, z1, x1, z1, []); linhaCota(x0, z0, x0, z1, []); linhaCota(x1, z0, x1, z1, []);
}
contorno(-0.159, 0.984, 0.201, 0.453, 0xd2d0cb);
contorno(6.689, 6.998, -1.314, 0, 0xe4e1da);
// RODADA 10: tampo portão 1,00 × 0,45 em contorno fino (o tampo fica acima do corte de 1,20 e sumia na planta)
contorno(0, 1.001, -2.866, -2.417, 0xe8e6e1);
// RODADA 8: vitrine alta em planta = retângulo HACHURADO (como desenho técnico), não o conteúdo cortado
{
  const [c, x] = [document.createElement('canvas'), null]; c.width = 512; c.height = 256;
  const g = c.getContext('2d'); g.fillStyle = '#efede8'; g.fillRect(0, 0, 512, 256);
  g.strokeStyle = '#6d6a64'; g.lineWidth = 3;
  for (let k = -256; k < 512; k += 22) { g.beginPath(); g.moveTo(k, 256); g.lineTo(k + 256, 0); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  contorno(4.998, 6.799, -2.866, -1.996, 0xffffff, t);
  linhaCota(4.998, -2.80, 6.799, -2.80, []); // vidro/porta traseira
}
linhaCota(2.146, -4.45, 4.147, -4.45, []); linhaCota(0.986, -4.40, 1.867, -4.40, []);
// cotas de fora da loja (servem aos 2 jogos)
linhaCota(0.984, 0.33, 2.949, 0.33, [0.984, 2.949]); linhaCota(3.613, 0.33, 6.513, 0.33, [3.613, 4.117, 6.513]); // RODADA 9: ,53 marcada na mesma linha
linhaCota(7.10, -2.866, 7.10, -1.996, [-2.866, -1.996]);               // ,87 profundidade dos balcões
linhaCota(7.10, -1.996, 7.10, 0, [-1.996, 0]);                         // 2,00 vitrine → fachada
linhaCota(-0.36, -2.866, -0.36, -2.417, [-2.866, -2.417]);             // ,45 tampo portão
// RODADA 11: no retrato as cotas dos vãos ficam GIRADAS (seguem o vão) e longe da parede
alvoCotas = cotasP; cota('SAÍDA 1,97', 1.967, 0.50); cota('ENTRADA 2,90', 5.06, 0.50); cota(',53', 3.865, 0.50);
alvoCotas = cotasR; for (const [t, x] of [['SAÍDA 1,97', 1.967], ['ENTRADA 2,90', 5.06], [',53', 3.865]]) cota(t, x, 0.56).material.rotation = Math.PI / 2;
alvoCotas = cotas;
cota(',87', 7.36, -2.43);
cota('2,00', 7.36, -1.05);
cota(',45', -0.58, -2.64);
// nomes (ficam nos corredores, sem linha)
cota('tampo portão 1,00', 0.50, -3.12);
cota('circulação ,90', 2.05, -3.12);
cota('serra-fita', 6.31, -3.22);
alvoCotas = cotasP; cota('geladeira', 0.44, -0.37); cota('cx. energia', 0.40, 0.33);
// RODADA 11: retrato — 'geladeira' no meio do corredor da saída, 'cx. energia' do lado de fora da parede (girada)
alvoCotas = cotasR; cota('geladeira', 1.62, -0.36); cota('cx. energia', 0.42, 0.56).material.rotation = Math.PI / 2; alvoCotas = cotas;
cota("abrigo d'água", 6.40, -0.62);
// ---- PAISAGEM (igual à planta do dono)
alvoCotas = cotasP;
linhaCota(0, -1.72, 6.799, -1.72, [0, 1.001, 4.998, 6.799]);          // 1,00 / 4,00 / 1,80
linhaCota(1.8, -1.996, 1.8, -1.101, [-1.996, -1.101]);                 // ,90 clientes
linhaCota(1.5, -3.768, 1.5, -2.866, [-3.768, -2.866]);                 // ,90 equipe
linhaCota(1.909, -3.62, 5.815, -3.62, [1.909, 5.815]);                 // 3,90
linhaCota(3.02, -1.101, 3.02, 0, [-1.101, 0]);                         // 1,10 caixa
cota('balcão baixo 4,00', 3.0, -1.53);
cota('vitrine alta 1,80', 5.9, -1.53);
cota('circulação ,90', 1.05, -1.30);
cota('mesa de trabalho 3,90', 3.86, -3.45);
cota('caixa 1,20 × 1,10', 4.62, -0.80);
cota('1,10', 3.02, -0.42);
// ---- RETRATO: medidas por fora (fundo da loja = direita da tela; parede esquerda = topo da tela)
alvoCotas = cotasR;
const ZE = -4.538 - 0.35, ZE2 = ZE - 0.38, XE = -0.159 - 0.85;
linhaCota(1.909, ZE, 5.815, ZE, [1.909, 5.815]); cota('3,90', 3.862, ZE); // RODADA 9: sem duplicar 'mesa'
linhaCota(0, ZE2, 6.799, ZE2, [0, 1.001, 4.998, 6.799]);
cota('1,00', 0.50, ZE2); cota('4,00', 3.0, ZE2); cota('1,80', 5.9, ZE2);
for (const x of [0, 6.799]) linhaCota(x, -4.538, x, ZE2, []); // linhas de chamada
linhaCota(XE, -3.768, XE, 0, [-3.768, -2.866, -1.996, -1.101, 0]);
for (const z of [-3.768, -2.866, -1.996, -1.101]) linhaCota(XE, z, -0.159, z, []);
cota(',90', XE, -3.317); cota(',87', XE, -2.431); cota(',90', XE, -1.548); cota('1,10', XE, -0.55);
// RODADA 9: nomes dos balcões SOBRE a faixa do balcão, girados 90° (acompanham o eixo longo na tela)
// RODADA 12: nomes FORA dos móveis — balcão/vitrine logo à frente da linha dos balcões, 'circulação ,90' no meio do
// corredor entre a frente do balcão e o caixa, 'caixa' ao lado do caixa (no corredor da entrada)
cota('balcão baixo 4,00', 2.0, -1.80).material.rotation = Math.PI / 2; cota('vitrine alta 1,80', 5.9, -1.80).material.rotation = Math.PI / 2;
cota('circulação ,90', 1.55, -1.32).material.rotation = Math.PI / 2; cota('mesa de trabalho', 3.86, -3.45); cota('caixa 1,20 × 1,10', 3.62, -1.32).material.rotation = Math.PI / 2;
alvoCotas = cotas;
// setas ENTRADA/SAÍDA em planta: rótulos SEMPRE de pé na tela (a seta 3D do piso some no modo Planta)
function cotaSeta(txt, ang, x, z) {
  // rótulo + seta desenhada (ang: direção da seta na TELA, 0 = p/ cima, em radianos no sentido horário)
  const H = 112, Wt = Math.ceil(txt.length * 37 + 40), Wp = Wt + 110;
  const c = document.createElement('canvas'); c.width = Wp; c.height = H; const g = c.getContext('2d');
  g.fillStyle = 'rgba(20,22,26,0.86)'; g.fillRect(0, 0, Wp, H);
  g.fillStyle = '#fff'; g.font = 'bold 64px Arial'; g.textBaseline = 'middle'; g.textAlign = 'center'; g.fillText(txt, Wt / 2 + 10, H / 2 + 4);
  g.save(); g.translate(Wt + 55, H / 2); g.rotate(ang);
  g.beginPath(); g.moveTo(0, -38); g.lineTo(30, -4); g.lineTo(11, -4); g.lineTo(11, 38); g.lineTo(-11, 38); g.lineTo(-11, -4); g.lineTo(-30, -4); g.closePath(); g.fill(); g.restore();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = false; t.minFilter = THREE.LinearFilter;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true, fog: false }));
  sp.userData.asp = Wp / H; sp.position.set(x, YC + 0.02, z); sp.renderOrder = 12; alvoCotas.add(sp);
}
alvoCotas = cotasP; cotaSeta('SAÍDA', Math.PI, 2.04, -0.25); cotaSeta('ENTRADA', 0, 4.60, -0.25); cotaSeta('ENTRADA', 0, 5.85, -0.25);
alvoCotas = cotasR; cotaSeta('SAÍDA', -Math.PI / 2, 2.04, -0.25); cotaSeta('ENTRADA', Math.PI / 2, 4.60, -0.25); cotaSeta('ENTRADA', Math.PI / 2, 5.85, -0.25);
alvoCotas = cotas;
// símbolo da serra-fita em planta (contorno simplificado, como o desenho da planta do dono)
{
  const S = (x0, x1, z0, z1) => { linhaCota(x0, z0, x1, z0, []); linhaCota(x0, z1, x1, z1, []); linhaCota(x0, z0, x0, z1, []); linhaCota(x1, z0, x1, z1, []); };
  const f = new THREE.Mesh(new THREE.BoxGeometry(0.868, 0.01, 0.855), new THREE.MeshBasicMaterial({ color: 0xf4f2ee, fog: false, depthTest: false, transparent: true, opacity: 1 }));
  f.position.set(6.312, YC + 0.003, -3.9035); f.renderOrder = 10; cotas.add(f);
  S(5.878, 6.746, -4.331, -3.476);   // contorno geral
  S(5.89, 6.73, -4.30, -3.50);       // mesa de corte
  S(5.93, 6.69, -4.20, -3.62);       // cabeçote (volante superior)
  S(6.44, 6.64, -4.16, -3.70);       // coluna da fita
  S(5.90, 6.085, -3.84, -3.56);      // carro empurrador
  linhaCota(6.155, -4.26, 6.155, -3.99, []); // guia de espessura
  linhaCota(6.11, -3.93, 6.13, -3.91, []);   // fita
}
// ======================================================================= REFLEXO DO PISO (RODADA 6, só desktop)
// reflexo planar barato: a cena espelhada no plano do piso (câmera virtual + plano de corte oblíquo, como o
// Reflector do three) numa textura de meia resolução, aplicada por cima do porcelanato com opacidade baixa,
// leve desfoque (9 taps) e fresnel (reflete mais no rasante). No iPhone fica só o roughness baixo + envMap.
let piscoReflexo = null;
if (!MOBILE) {
  const rt = new THREE.WebGLRenderTarget(Math.max(2, innerWidth / 2), Math.max(2, innerHeight / 2), { type: THREE.HalfFloatType });
  const texM = new THREE.Matrix4(), vcam = new THREE.PerspectiveCamera();
  const mat = new THREE.ShaderMaterial({
    uniforms: { tRef: { value: rt.texture }, texM: { value: texM }, op: { value: 0.16 }, px: { value: new THREE.Vector2(2 / innerWidth, 2 / innerHeight) }, camPos: { value: new THREE.Vector3() } },
    vertexShader: `uniform mat4 texM; varying vec4 vUv; varying vec3 vW;
      void main(){ vUv = texM * vec4(position,1.0); vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform sampler2D tRef; uniform float op; uniform vec2 px; uniform vec3 camPos; varying vec4 vUv; varying vec3 vW;
      void main(){ vec2 uv = vUv.xy / vUv.w; vec3 c = vec3(0.0);
        for (int i=-1;i<=1;i++) for (int j=-1;j<=1;j++) c += texture2D(tRef, uv + vec2(float(i),float(j)) * px * 1.5).rgb;
        c /= 9.0; vec3 v = normalize(camPos - vW); float f = 0.35 + 0.65 * pow(1.0 - clamp(v.y, 0.0, 1.0), 3.0);
        gl_FragColor = vec4(c, op * f); }`,
    transparent: true, depthWrite: false, fog: false,
  });
  mat.userData = { uv: 'native', cast: false };
  const piso = new THREE.Mesh(new THREE.PlaneGeometry(6.799, 4.369), mat);
  piso.rotation.x = -Math.PI / 2; piso.position.set(6.799 / 2, 0.0012, -4.369 / 2); piso.renderOrder = -1;
  piso.updateMatrixWorld();
  scene.add(piso);
  const N = new THREE.Vector3(0, 1, 0), P0 = new THREE.Vector3(0, 0.0012, 0), plano = new THREE.Plane(), clip = new THREE.Vector4(), q = new THREE.Vector4();
  const cpos = new THREE.Vector3(), alvo = new THREE.Vector3(), olhar = new THREE.Vector3(), rot = new THREE.Matrix4();
  let feito = -1;
  piso.onBeforeRender = (rnd, scn, cam) => {
    if (cam !== camera || feito === frames) return;
    feito = frames;
    cpos.setFromMatrixPosition(cam.matrixWorld);
    if (cpos.y <= P0.y) return;
    rot.extractRotation(cam.matrixWorld);
    olhar.set(0, 0, -1).applyMatrix4(rot).add(cpos);
    vcam.position.set(cpos.x, 2 * P0.y - cpos.y, cpos.z);
    alvo.set(olhar.x, 2 * P0.y - olhar.y, olhar.z);
    vcam.up.set(0, 1, 0).applyMatrix4(rot); vcam.up.y *= -1;
    vcam.lookAt(alvo); vcam.far = cam.far; vcam.near = cam.near;
    vcam.updateMatrixWorld(); vcam.projectionMatrix.copy(cam.projectionMatrix);
    texM.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    texM.multiply(vcam.projectionMatrix).multiply(vcam.matrixWorldInverse).multiply(piso.matrixWorld);
    // plano de corte oblíquo (tudo abaixo do piso some)
    plano.setFromNormalAndCoplanarPoint(N, P0).applyMatrix4(vcam.matrixWorldInverse);
    clip.set(plano.normal.x, plano.normal.y, plano.normal.z, plano.constant);
    const e = vcam.projectionMatrix.elements;
    q.set((Math.sign(clip.x) + e[8]) / e[0], (Math.sign(clip.y) + e[9]) / e[5], -1, (1 + e[10]) / e[14]);
    clip.multiplyScalar(2 / clip.dot(q));
    e[2] = clip.x; e[6] = clip.y; e[10] = clip.z + 1 - 0.003; e[14] = clip.w;
    mat.uniforms.camPos.value.copy(cpos);
    piso.visible = false;
    const rtAnt = rnd.getRenderTarget(), auto = rnd.shadowMap.autoUpdate, fogAnt = scn.fog;
    rnd.shadowMap.autoUpdate = false;
    rnd.setRenderTarget(rt); rnd.state.buffers.depth.setMask(true); rnd.clear();
    rnd.render(scn, vcam);
    rnd.setRenderTarget(rtAnt); rnd.shadowMap.autoUpdate = auto; scn.fog = fogAnt;
    piso.visible = true;
  };
  piscoReflexo = { piso, rt, mat };
}

iluminacao();

// ======================================================================= VISTAS (SPEC §7)
const VISTAS = [
  { id: 'v1', nome: 'Entrada', p: [5.55, 1.65, 0.70], t: [2.80, 1.25, -2.40], pm: [4.55, 1.62, 0.40], tm: [5.00, 0.90, -2.40] } /* RODADA 11: iPhone mira a vitrine alta + balcão (letreiro inteiro, teto < 15%) */, // RODADA 6: iPhone já dentro do vão (sem verga/placa por cima)
  // v2: pitch mais baixo (o teto não domina) e, no iPhone, câmera recuada >= 0,45 m de qualquer objeto
  { id: 'v2', nome: 'Vitrine alta', p: [5.90, 1.65, -0.30], t: [5.90, 1.45, -2.40], pm: [5.85, 1.58, 0.35], tm: [5.85, 1.02, -2.40] },
  { id: 'v3', nome: 'Balcão baixo', p: [2.40, 1.65, -1.45], t: [2.80, 0.95, -2.40] },
  { id: 'v4', nome: 'Visão do açougueiro', p: [2.90, 1.75, -3.70], t: [2.90, 1.15, 0.80], pm: [1.25, 1.80, -4.12], tm: [3.30, 0.80, 0.30] } /* RODADA 12: iPhone recuado ao lado da mesa (1,3 m da traseira do balcão), oblíquo — sem o véu do poço colado na lente */ /* RODADA 12: mira acima do tampo (sem o poço do balcão colado na lente) */ /* RODADA 11: mais alto/recuado, balanças fora do quadro */, // RODADA 10: no corredor da equipe (0,90), tampo inteiro em 1º plano // RODADA 9: olhar por cima das balanças → corredor, caixa e os 2 vãos
  { id: 'v5', nome: 'Caixa (cliente)', p: [2.30, 1.65, -1.55], t: [3.55, 0.95, -0.55] },
  // v6: no iPhone sobe o olhar (tampo/maquininha não colam na lente nem cobrem o joystick)
  { id: 'v6', nome: 'Caixa (operador)', p: [3.70, 1.60, -0.25], t: [3.40, 1.20, -2.60], pm: [3.72, 1.62, -0.12], tm: [3.40, 0.97, -2.60] },
  { id: 'v7', nome: 'Vista de cima (planta)', p: [3.40, 14.0, -2.05], t: [3.30, 0.0, -2.10], orbit: true, planta: true },
  { id: 'v8', nome: 'Calçada / fachada', p: [4.00, 1.65, 5.00], t: [4.00, 1.60, -2.00], pm: [3.60, 1.60, 5.20], tm: [3.45, 1.50, 0.00] } /* RODADA 9: iPhone recuado (outro lado da rua) — fachada inteira X −0,3 → 7,1 no quadro */, // RODADA 6: iPhone do meio-fio, fachada enche a tela
  { id: 'v9', nome: 'Serra-fita e mesa', p: [4.55, 1.65, -3.00], t: [6.25, 1.05, -3.95], pm: [4.30, 1.62, -3.02], tm: [6.25, 0.85, -3.95] }, // RODADA 8: serra de frente (tampas dos volantes) + mesa
  { id: 'v10', nome: 'Saída / geladeira e tampo portão', p: [2.40, 1.65, 0.30], t: [0.60, 1.00, -2.20], pm: [2.40, 1.65, 0.30], tm: [0.60, 0.72, -2.20] },
];

// ======================================================================= CONTROLES
const player = { x: 5.2, z: 0.6, y: 1.65, yaw: 0, pitch: 0 };
// Planta = câmera ORTOGRÁFICA (como a planta 1:50): paredes cortadas a 1,20 (clipping), sem forro/entorno
const orto = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.5, 60);
orto.position.set(3.3, 30, -2.099);
const corte = [new THREE.Plane(new THREE.Vector3(0, -1, 0), 1.2)];
const orbit = new OrbitControls(orto, renderer.domElement);
orbit.enableDamping = true; orbit.dampingFactor = 0.08;
orbit.maxPolarAngle = Math.PI * 0.42; orbit.minZoom = 0.6; orbit.maxZoom = 6;
orbit.enabled = false;
let modo = 'walk';
let andou = false;
const CEU = scene.background, FUNDO_PLANTA = new THREE.Color(0xd9d6cf);
const PLANTA = { cx: 3.40, cz: -1.95, w: 8.5, d: 5.75, cxR: 3.22, czR: -2.30, wR: 8.95, dR: 6.10 } /* RODADA 11: retrato mais justo */; // paisagem X −0,85..7,65 / Z −4,8..0,95; retrato (cotas por fora) X −1,25..7,7 / Z −5,45..1,0
function enquadrarPlanta(reset) {
  // RODADA 7: no RETRATO a planta gira 90° (eixo longo na vertical, SPEC V7/D14): a folha "deitada" no sentido horário
  // (fachada à esquerda, fundo à direita, vitrine alta embaixo) — ocupa ~60% da altura em vez de ~30%. Paisagem: igual
  // à planta do dono (fachada embaixo). Zoom-fit com 12–16 px de margem.
  const W = innerWidth, Hh = innerHeight, ret = W / Hh < 1, m = ret ? 6 : 16; // RODADA 12: retrato com margem mínima
  const pw = ret ? PLANTA.dR : PLANTA.w, pd = ret ? PLANTA.wR : PLANTA.d;
  cotasP.visible = !ret; cotasR.visible = ret;
  const ppm = Math.min((W - 2 * m) / pw, (Hh - 2 * m) / pd);
  orto.left = -W / 2 / ppm; orto.right = W / 2 / ppm; orto.top = Hh / 2 / ppm; orto.bottom = -Hh / 2 / ppm;
  orto.updateProjectionMatrix();
  if (reset || enquadrarPlanta._ret !== ret) {
    enquadrarPlanta._ret = ret;
    orto.zoom = 1; orto.updateProjectionMatrix();
    const cz = ret ? PLANTA.czR : PLANTA.cz, cx = ret ? PLANTA.cxR : PLANTA.cx;
    orbit.target.set(cx, 0, cz);
    if (ret) orto.position.set(cx + 0.001, 30, cz);  // tela p/ cima = −X (parede esquerda em cima)
    else orto.position.set(cx, 30, cz + 0.001);      // fundo da loja em cima, fachada embaixo
    orto.lookAt(orbit.target); orbit.update();
  }
}
function escalaCotas() {
  const ppm = innerHeight / ((orto.top - orto.bottom) / orto.zoom);
  const px = (RETRATO() ? 14 : 20) / ppm; // RODADA 10: retrato 11 → 14 px (legível no iPhone) // RODADA 6: retrato com fonte menor (cabe nos corredores)
  cotas.traverse(o => { if (o.isSprite) o.scale.set(px * o.userData.asp, px, 1); });
}
function setModo(m) {
  modo = m;
  scene.fog = m === 'orbit' ? null : NEBLINA;
  orbit.enabled = m === 'orbit';
  teto.visible = m !== 'orbit';
  ext.visible = m !== 'orbit';
  if (piscoReflexo) piscoReflexo.piso.visible = m !== 'orbit';
  cotas.visible = m === 'orbit';
  for (const o of setasPiso) o.visible = m !== 'orbit';
  renderer.clippingPlanes = m === 'orbit' ? corte : [];
  scene.background = m === 'orbit' ? FUNDO_PLANTA : CEU;
  camera.fov = fovPara(innerWidth / innerHeight); camera.updateProjectionMatrix();
  document.querySelectorAll('[data-modo]').forEach(b => b.classList.toggle('on', b.dataset.modo === m));
  document.body.classList.toggle('orbit', m === 'orbit');
  if (m === 'orbit') enquadrarPlanta(!orbit._posta);
  if (m === 'walk') aplicarCam();
}
function irPara(v) {
  // em retrato (iPhone) algumas vistas recuam p/ caber a largura
  const P = (RETRATO() && v.pm) || v.p, T = (RETRATO() && v.tm) || v.t;
  andou = false; // chegou por vista: portões fechados até a pessoa andar
  if (v.orbit) {
    orbit._posta = false; setModo('orbit'); orbit._posta = true;
  } else {
    player.x = P[0]; player.y = P[1]; player.z = P[2];
    const dx = T[0] - P[0], dy = T[1] - P[1], dz = T[2] - P[2];
    player.yaw = Math.atan2(-dx, -dz); player.pitch = Math.atan2(dy, Math.hypot(dx, dz));
    setModo('walk');
  }
  const el = document.getElementById('toast');
  if (el) { el.textContent = v.nome; el.classList.add('show'); clearTimeout(irPara._t); irPara._t = setTimeout(() => el.classList.remove('show'), 1800); }
}
function aplicarCam() {
  camera.position.set(player.x, player.y, player.z);
  camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
}

const RAIO = 0.27; // 0,27: não encosta a lente nos objetos e ainda passa no portão do caixa (vão 0,57)
function colidir(nx, nz) {
  for (let it = 0; it < 3; it++) {
    for (const s of solids) {
      if (!s.on) continue;
      const cx = Math.max(s.x0, Math.min(nx, s.x1)), cz = Math.max(s.z0, Math.min(nz, s.z1));
      const dx = nx - cx, dz = nz - cz, d2 = dx * dx + dz * dz;
      if (d2 < RAIO * RAIO) {
        if (d2 > 1e-8) { const d = Math.sqrt(d2), k = (RAIO - d) / d; nx += dx * k; nz += dz * k; }
        else { // centro dentro do retângulo: empurra pela menor saída
          const o = [[nx - s.x0 + RAIO, -1, 0], [s.x1 - nx + RAIO, 1, 0], [nz - s.z0 + RAIO, 0, -1], [s.z1 - nz + RAIO, 0, 1]].sort((a, b) => a[0] - b[0])[0];
          nx += o[1] * o[0]; nz += o[2] * o[0];
        }
      }
    }
  }
  return [nx, nz];
}

const keys = {};
addEventListener('keydown', e => { keys[e.code] = true; if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault(); });
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

// olhar: arrastar (mouse) / touch na metade direita; joystick: touch na metade esquerda
const joy = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
const look = { id: null, lx: 0, ly: 0 };
const joyEl = document.getElementById('joy'), knob = document.getElementById('knob');
const cvs = renderer.domElement;
cvs.addEventListener('pointerdown', e => {
  if (modo !== 'walk') return;
  if (e.pointerType === 'touch' && e.clientX < innerWidth * 0.45 && joy.id === null) {
    joy.id = e.pointerId; joy.ox = e.clientX; joy.oy = e.clientY; joy.x = joy.y = 0;
    joyEl.classList.add('ativo');
    joyEl.style.left = (e.clientX - 55) + 'px'; joyEl.style.top = (e.clientY - 55) + 'px'; joyEl.style.bottom = 'auto';
  } else if (look.id === null) {
    look.id = e.pointerId; look.lx = e.clientX; look.ly = e.clientY;
  }
  cvs.setPointerCapture(e.pointerId);
});
cvs.addEventListener('pointermove', e => {
  if (e.pointerId === joy.id) {
    let dx = e.clientX - joy.ox, dy = e.clientY - joy.oy;
    const l = Math.hypot(dx, dy), max = 50;
    if (l > max) { dx *= max / l; dy *= max / l; }
    joy.x = dx / max; joy.y = dy / max;
    knob.style.transform = `translate(${dx}px,${dy}px)`;
  } else if (e.pointerId === look.id) {
    const k = e.pointerType === 'touch' ? 0.006 : 0.0042;
    player.yaw -= (e.clientX - look.lx) * k;
    player.pitch = Math.max(-1.35, Math.min(1.35, player.pitch - (e.clientY - look.ly) * k));
    if (e.pointerType === 'touch' && Math.abs(e.clientX - look.lx) + Math.abs(e.clientY - look.ly) > 2) document.body.classList.add('olhou'); // RODADA 10: ícone some após o 1º arraste
    look.lx = e.clientX; look.ly = e.clientY;
  }
});
function soltar(e) {
  if (e.pointerId === joy.id) { joy.id = null; joy.x = joy.y = 0; knob.style.transform = ''; joyEl.classList.remove('ativo'); joyEl.style.left = ''; joyEl.style.top = ''; joyEl.style.bottom = ''; }
  if (e.pointerId === look.id) look.id = null;
}
cvs.addEventListener('pointerup', soltar); cvs.addEventListener('pointercancel', soltar);
document.addEventListener('gesturestart', e => e.preventDefault());
document.addEventListener('dblclick', e => e.preventDefault());
cvs.addEventListener('wheel', e => { if (modo === 'walk') { camera.fov = Math.max(35, Math.min(75, camera.fov + e.deltaY * 0.02)); camera.updateProjectionMatrix(); } }, { passive: true });

// UI
document.querySelectorAll('[data-modo]').forEach(b => b.addEventListener('click', () => {
  if (b.dataset.modo === 'orbit') { orbit._posta = false; }
  setModo(b.dataset.modo);
}));
const lista = document.getElementById('listaVistas');
VISTAS.forEach(v => {
  const b = document.createElement('button');
  b.className = 'vista'; b.innerHTML = `<b>${v.id.toUpperCase()}</b>${v.nome}`;
  b.addEventListener('click', () => { irPara(v); document.body.classList.remove('vistas-abertas'); });
  lista.appendChild(b);
});
document.getElementById('btnVistas').addEventListener('click', () => document.body.classList.toggle('vistas-abertas'));
document.getElementById('btnAjuda').addEventListener('click', () => document.body.classList.toggle('ajuda-aberta'));
document.getElementById('ajuda').addEventListener('click', () => document.body.classList.remove('ajuda-aberta'));

// (SAO do three r160 testado: gera halos claros/escuros nas bordas e some com o vidro de transmissão — descartado;
//  o peso no piso vem das sombras de contato + cantos escurecidos em contato())
// (rodada 3) GTAO do three r160 (addon local, patch: ignora vidro/transparentes no G-buffer) só no desktop;
// no celular ficam as sombras de contato + cantos escurecidos de contato().
// (rodada 4) pós: GTAO (desktop) + bloom leve (UnrealBloom, limiar alto: só LEDs, letreiro e o brilho das vitrines)
// no desktop e no celular. Na captura de prints (?shot) o GTAO usa menos amostras.
let composer = null, bloom = null;
{
  const pr = renderer.getPixelRatio();
  const rt = new THREE.WebGLRenderTarget(innerWidth * pr, innerHeight * pr, { type: THREE.HalfFloatType, samples: 4 }); // RODADA 7: MSAA também no celular (WebGL2/iOS 15+)
  composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  if (!MOBILE) {
    const ao = new GTAOPass(scene, camera, innerWidth, innerHeight);
    const am = SHOT ? 12 : 16;
    ao.updateGtaoMaterial({ radius: 0.3, distanceExponent: 1.4, thickness: 1.2, scale: 1.2, samples: am, distanceFallOff: 1.0, screenSpaceRadius: false }); // RODADA 8: AO mais presente
    ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: am });
    ao.blendIntensity = 1.0;
    composer.addPass(ao);
    luzes.ao = ao;
  }
  bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.18, 0.4, MOBILE ? 1.15 : 1.0);
  composer.addPass(bloom);
  if (Q.get('bloom') === '0') bloom.enabled = false; // diagnóstico
  composer.addPass(new OutputPass());
  luzes.bloom = bloom;
}
function redimensionar() {
  camera.aspect = innerWidth / innerHeight;
  camera.fov = fovPara(camera.aspect);
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  if (composer) composer.setSize(innerWidth, innerHeight);
  if (piscoReflexo) { piscoReflexo.rt.setSize(Math.max(2, innerWidth / 2), Math.max(2, innerHeight / 2)); piscoReflexo.mat.uniforms.px.value.set(2 / innerWidth, 2 / innerHeight); }
  if (modo === 'orbit') enquadrarPlanta(false);
}
addEventListener('resize', redimensionar);

// ======================================================================= LOOP
const clock = new THREE.Clock();
const fwd = new THREE.Vector2();
function tick() {
  const dt = Math.min(0.05, clock.getDelta());
  if (modo === 'walk') {
    let f = 0, s = 0;
    if (keys.KeyW || keys.ArrowUp) f += 1;
    if (keys.KeyS || keys.ArrowDown) f -= 1;
    if (keys.KeyA) s -= 1;
    if (keys.KeyD) s += 1;
    if (keys.ArrowLeft) player.yaw += 1.8 * dt;
    if (keys.ArrowRight) player.yaw -= 1.8 * dt;
    f -= joy.y; s += joy.x;
    const len = Math.hypot(f, s);
    if (len > 0.05) {
      const sp = (keys.ShiftLeft || keys.ShiftRight ? 2.6 : 1.4) * Math.min(1, len) / len;
      const sy = Math.sin(player.yaw), cy = Math.cos(player.yaw);
      const vx = (-sy * f + cy * s) * sp * dt, vz = (-cy * f - sy * s) * sp * dt;
      [player.x, player.z] = colidir(player.x + vx, player.z + vz);
      andou = true;
      if (player.y < 1.6) player.y += (1.65 - player.y) * Math.min(1, dt * 2);
    }
    aplicarCam();
  } else orbit.update();
  // portões automáticos (abrem quando alguém chega perto andando)
  for (const k of ['tampo', 'portao']) {
    const d = dinamicos[k];
    const dist = Math.hypot(player.x - d.c[0], player.z - d.c[1]);
    d.alvo = (modo === 'walk' && !SHOT && andou && dist < (k === 'tampo' ? 1.2 : 0.8)) ? 1 : 0;
    d.t += (d.alvo - d.t) * Math.min(1, dt * 4);
    d.col.on = d.t < 0.6;
    if (k === 'tampo') { d.piv2.rotation.z = -1.50 * d.t; d.piv.rotation.y = -1.50 * d.t; } // RODADA 12: tampo basculante FECHADO (nivelado, como na planta); só levanta quando alguém chega a < 1,2 m
    else d.piv.rotation.y = d.t * 1.5;
  }
  if (modo === 'orbit') { escalaCotas(); renderer.render(scene, orto); }
  else if (composer) composer.render(); else renderer.render(scene, camera);
}

// vista inicial
const camQ = (Q.get('cam') || 'v1').toLowerCase();
let v0 = VISTAS.find(v => v.id === camQ || v.nome.toLowerCase().includes(camQ)) || VISTAS[0];
// depuração/revisão: ?pos=x,y,z&alvo=x,y,z abre uma câmera livre
if (Q.get('pos') && Q.get('alvo')) { const pp = Q.get('pos').split(',').map(Number), aa = Q.get('alvo').split(',').map(Number); v0 = { id: 'livre', nome: 'Câmera livre', p: pp, t: aa }; }
irPara(v0);
document.getElementById("toast").classList.remove("show");
if (modo === "walk") aplicarCam();
(function envVidros() {
  const rt = new THREE.WebGLCubeRenderTarget(MOBILE ? 128 : 256, { type: THREE.HalfFloatType });
  const cc = new THREE.CubeCamera(0.05, 40, rt); cc.position.set(3.4, 1.55, -1.45);
  const esc = [];
  // rodada 5: fora do cubemap também as telas acesas (display verde do cliente, PDV, maquininha) e a demarcação vermelha
  // do extintor — elas viravam placas verdes/rosa refletidas no vidro do balcão e no inox
  scene.traverse(o => { if (o.isMesh && (o.material.transmission > 0 || o.material.transparent || o.material.userData.semEnv)) { esc.push([o, o.visible]); o.visible = false; } });
  const tv = teto.visible, ev = ext.visible, cv = cotas.visible; teto.visible = true; ext.visible = true; cotas.visible = false;
  const fog = scene.fog, bg = scene.background, cp = renderer.clippingPlanes; scene.fog = null; scene.background = CEU; renderer.clippingPlanes = [];
  cc.update(renderer, scene);
  scene.fog = fog; scene.background = bg; teto.visible = tv; ext.visible = ev; cotas.visible = cv; renderer.clippingPlanes = cp;
  for (const [o, v] of esc) o.visible = v;
  M.vidro.envMap = rt.texture; M.vidro.envMapIntensity = 1.8; M.vidro.needsUpdate = true;
  M.vidroGeladeira.envMap = rt.texture; M.vidroGeladeira.envMapIntensity = 1.2; M.vidroGeladeira.needsUpdate = true;
  M.vidroTopo.envMap = rt.texture; M.vidroTopo.envMapIntensity = 0.6; M.vidroTopo.needsUpdate = true;
  M.vidroBalcao.envMap = rt.texture; M.vidroBalcao.envMapIntensity = 0.25; M.vidroBalcao.roughness = 0.05; M.vidroBalcao.needsUpdate = true; // RODADA 8: letreiro refletido borrado
  // rodada 4: metais refletem o PRÓPRIO interior (piso, tijolinho, vitrines) em vez do RoomEnvironment branco —
  // o inox espelhado deixa de sair branco chapado e passa a ter contraste/reflexo real
  const envInt = pmrem.fromCubemap(rt.texture).texture;
  for (const [m, k] of [[M.inox, 1.0], [M.inoxV, 1.0], [M.inoxPol, 1.0], [M.inoxEspelho, 1.0], [M.inoxCaixa, 0.9], [M.inoxEsc, 0.9], [M.inoxTampo, 1.0], [M.inoxServico, 0.4], [M.gancho, 0.8], [M.inoxInterno, 0.6], [M.piso, 0.55]]) { m.envMap = envInt; m.envMapIntensity = k; m.needsUpdate = true; }
})();
renderer.compile(scene, camera);
let frames = 0;
renderer.setAnimationLoop(() => {
  tick();
  if (++frames === 3) {
    window.__pronto = true;
    document.body.classList.add('pronto');
  }
});
window.__app = { THREE, scene, camera, renderer, luzes, VISTAS, irPara, player, redimensionar };
// dica "arraste aqui pra olhar": some no primeiro toque ou após 4 s
const dicaOlhar = document.querySelector('.olhar');
if (dicaOlhar) {
  // RODADA 6: o tempo só conta depois da cena pronta (antes sumia no meio do fade e saía "fantasma" no 1º quadro)
  const some = () => dicaOlhar.classList.add('sumiu');
  addEventListener('pointerdown', some, { once: true });
  const esperaPronto = () => window.__pronto ? setTimeout(some, 4000) : setTimeout(esperaPronto, 200);
  esperaPronto();
}
