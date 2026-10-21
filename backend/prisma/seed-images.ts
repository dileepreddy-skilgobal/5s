/**
 * Illustrated sample photos for the demo data: flat drawings of the demo plant's areas, findings, fixes and red-tagged
 * items. They are drawn as SVG and rendered to JPEG (PNG for the logo) with sharp, so the seed needs no network and
 * every picture matches the record it belongs to.
 */
import sharp = require('../src/core/storage/sharp');

const W = 960;
const H = 720;
const FLOOR_Y = 450;
const FONT = 'Arial, Helvetica, sans-serif';

// ---------------------------------------------------------------- Building blocks

/** Wall, concrete floor and soft overhead lighting. */
function room(opts: { wall?: string; window?: boolean } = {}): string {
  const wall = opts.wall ?? '#DCE3EA';
  return `
  <defs>
    <linearGradient id="wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${wall}"/><stop offset="1" stop-color="#C9D2DC"/></linearGradient>
    <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9AA3AC"/><stop offset="1" stop-color="#B7BEC6"/></linearGradient>
    <radialGradient id="light" cx="0.5" cy="0.25" r="0.8"><stop offset="0" stop-color="#FFFFFF" stop-opacity="0.18"/><stop offset="1" stop-color="#000000" stop-opacity="0.22"/></radialGradient>
    <filter id="dust"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="4"/><feColorMatrix values="0 0 0 0 0.55 0 0 0 0 0.5 0 0 0 0 0.42 0 0 0 1.6 -0.75"/></filter>
  </defs>
  <rect width="${W}" height="${FLOOR_Y}" fill="url(#wall)"/>
  <rect y="${FLOOR_Y - 14}" width="${W}" height="14" fill="#8F9AA6"/>
  ${opts.window ? `<rect x="40" y="40" width="${W - 80}" height="70" rx="4" fill="#AFC6DA" stroke="#8193A5" stroke-width="4"/>${[1, 2, 3, 4, 5].map((i) => `<line x1="${40 + i * ((W - 80) / 6)}" y1="40" x2="${40 + i * ((W - 80) / 6)}" y2="110" stroke="#8193A5" stroke-width="4"/>`).join('')}` : ''}
  <rect y="${FLOOR_Y}" width="${W}" height="${H - FLOOR_Y}" fill="url(#floor)"/>`;
}

const finish = () => `<rect width="${W}" height="${H}" fill="url(#light)"/>`;

const svg = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${body}</svg>`;

/** Painted floor line; `worn` draws a faded, broken line. */
function floorLine(y: number, color = '#F2C400', worn = false): string {
  if (!worn) return `<rect x="0" y="${y}" width="${W}" height="16" fill="${color}"/>`;
  const parts: string[] = [];
  for (let x = 0; x < W; x += 70) parts.push(`<rect x="${x + (x % 140 ? 20 : 0)}" y="${y + (x % 3)}" width="${30 + (x % 40)}" height="${10 + (x % 6)}" fill="${color}" opacity="${0.25 + (x % 5) * 0.06}"/>`);
  return parts.join('');
}

/** CNC machine front: body, door window, control panel and signal tower. */
function machine(x: number, y: number, w = 240, h = 300, label = ''): string {
  return `
  <rect x="${x + 6}" y="${y + h - 6}" width="${w}" height="14" rx="4" fill="#000" opacity="0.18"/>
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="#E9EDF1" stroke="#9AA5B1" stroke-width="3"/>
  <rect x="${x}" y="${y + h - 50}" width="${w}" height="50" rx="6" fill="#3E4A57"/>
  <rect x="${x + 18}" y="${y + 26}" width="${w * 0.58}" height="${h * 0.5}" rx="6" fill="#4E6275" stroke="#7D8C9B" stroke-width="4"/>
  <polygon points="${x + 30},${y + 36} ${x + 70},${y + 36} ${x + 40},${y + 26 + h * 0.5 - 10} ${x + 26},${y + 26 + h * 0.5 - 10}" fill="#FFFFFF" opacity="0.18"/>
  <rect x="${x + w * 0.68}" y="${y + 26}" width="${w * 0.26}" height="${h * 0.42}" rx="5" fill="#2F3A45"/>
  <rect x="${x + w * 0.7}" y="${y + 36}" width="${w * 0.22}" height="${h * 0.14}" rx="2" fill="#5BC0EB"/>
  ${[0, 1, 2].map((r) => [0, 1].map((c) => `<circle cx="${x + w * 0.74 + c * w * 0.11}" cy="${y + 36 + h * 0.2 + r * 18}" r="5" fill="#C5CDD5"/>`).join('')).join('')}
  <rect x="${x + w - 26}" y="${y - 70}" width="12" height="70" fill="#5F6B78"/>
  <rect x="${x + w - 32}" y="${y - 110}" width="24" height="14" rx="3" fill="#E53935"/>
  <rect x="${x + w - 32}" y="${y - 96}" width="24" height="14" rx="3" fill="#FBC02D"/>
  <rect x="${x + w - 32}" y="${y - 82}" width="24" height="14" rx="3" fill="#43A047"/>
  ${label ? `<text x="${x + 18}" y="${y + h - 20}" font-family="${FONT}" font-size="18" font-weight="700" fill="#FFFFFF">${label}</text>` : ''}`;
}

/** Simple tool silhouettes, drawn around (0,0) and placed with a transform. */
const TOOL_SHAPES: Record<string, string> = {
  spanner: '<rect x="-6" y="-60" width="12" height="110" rx="5"/><circle cx="0" cy="-66" r="18"/><circle cx="0" cy="58" r="14"/>',
  wrench: '<rect x="-8" y="-50" width="16" height="120" rx="6"/><rect x="-22" y="-78" width="44" height="34" rx="8"/>',
  caliper: '<rect x="-5" y="-70" width="10" height="140"/><rect x="-5" y="-70" width="40" height="12"/><rect x="-5" y="-40" width="34" height="12"/>',
  hammer: '<rect x="-6" y="-40" width="12" height="110" rx="4"/><rect x="-32" y="-62" width="64" height="26" rx="5"/>',
  screwdriver: '<rect x="-10" y="20" width="20" height="50" rx="8"/><rect x="-3" y="-70" width="6" height="92"/>',
  pliers: '<path d="M-14,-60 L-4,10 L-18,70 L-8,70 L4,12 L8,-60 Z"/><path d="M14,-60 L4,10 L18,70 L8,70 L-4,12 L-8,-60 Z"/>',
};
const tool = (name: string, x: number, y: number, fill: string, rotate = 0, scale = 1) =>
  `<g transform="translate(${x} ${y}) rotate(${rotate}) scale(${scale})" fill="${fill}">${TOOL_SHAPES[name]}</g>`;

/** Pegboard with an outline for each tool; `missing` tools show only their outline. */
function shadowBoard(x: number, y: number, missing: string[] = []): string {
  const names = ['spanner', 'wrench', 'caliper', 'hammer', 'screwdriver', 'pliers'];
  const holes: string[] = [];
  for (let i = 0; i < 18; i++) for (let j = 0; j < 9; j++) holes.push(`<circle cx="${x + 20 + i * 22}" cy="${y + 20 + j * 24}" r="2" fill="#C9B79A"/>`);
  return `
  <rect x="${x - 10}" y="${y - 10}" width="420" height="240" rx="6" fill="#5F6B78"/>
  <rect x="${x}" y="${y}" width="400" height="220" fill="#EFE3CC"/>
  ${holes.join('')}
  ${names.map((n, i) => {
    const cx = x + 40 + i * 64;
    const cy = y + 110;
    const outline = `<g transform="translate(${cx} ${cy})" fill="#E2D2B4" stroke="#1F2933" stroke-width="3" stroke-dasharray="6 4">${TOOL_SHAPES[n]}</g>`;
    const label = `<text x="${cx}" y="${y + 208}" font-family="${FONT}" font-size="11" text-anchor="middle" fill="#3E4A57">${n}</text>`;
    return outline + (missing.includes(n) ? '' : tool(n, cx, cy, n === 'hammer' || n === 'screwdriver' ? '#D84315' : '#8796A5', 0, 0.86)) + label;
  }).join('')}`;
}

/** Work bench with legs. */
const bench = (x: number, y: number, w: number) => `
  <rect x="${x}" y="${y}" width="${w}" height="22" rx="3" fill="#7B5B3A"/>
  <rect x="${x + 14}" y="${y + 22}" width="14" height="${H - y - 60}" fill="#4A5561"/>
  <rect x="${x + w - 28}" y="${y + 22}" width="14" height="${H - y - 60}" fill="#4A5561"/>
  <rect x="${x + 14}" y="${y + 120}" width="${w - 28}" height="10" fill="#4A5561"/>`;

/** Cardboard box with an optional shipping label. */
function box(x: number, y: number, w: number, h: number, labelled = false): string {
  return `
  <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#C8955A" stroke="#9C6F3D" stroke-width="2"/>
  <rect x="${x + w / 2 - 8}" y="${y}" width="16" height="${h}" fill="#B88447"/>
  <rect x="${x}" y="${y}" width="${w}" height="10" fill="#D9A86D"/>
  ${labelled ? `<rect x="${x + 10}" y="${y + h * 0.35}" width="${w * 0.42}" height="${h * 0.4}" fill="#FFFFFF" stroke="#BFC7CF"/>
  ${[0, 1, 2, 3, 4, 5, 6, 7].map((i) => `<rect x="${x + 16 + i * (w * 0.042)}" y="${y + h * 0.5}" width="${i % 3 ? 2 : 4}" height="${h * 0.18}" fill="#1F2933"/>`).join('')}
  <rect x="${x + 16}" y="${y + h * 0.4}" width="${w * 0.3}" height="5" fill="#1F2933"/>` : ''}`;
}

/** Stack of blue plastic crates. */
const crates = (x: number, y: number, count: number) =>
  Array.from({ length: count }, (_, i) => `<rect x="${x + (i % 2) * 6}" y="${y - i * 52}" width="150" height="50" rx="4" fill="#1E6FB8" stroke="#145089" stroke-width="3"/><rect x="${x + 50 + (i % 2) * 6}" y="${y - i * 52 + 10}" width="50" height="12" rx="6" fill="#145089"/>`).join('');

/** Wall-mounted fire extinguisher with its sign. */
const extinguisher = (x: number, y: number) => `
  <rect x="${x - 30}" y="${y - 110}" width="60" height="44" rx="4" fill="#D32F2F"/>
  <text x="${x}" y="${y - 82}" font-family="${FONT}" font-size="13" font-weight="700" text-anchor="middle" fill="#FFF">FIRE</text>
  <rect x="${x - 22}" y="${y - 40}" width="44" height="130" rx="18" fill="#E53935" stroke="#B71C1C" stroke-width="3"/>
  <rect x="${x - 10}" y="${y - 58}" width="20" height="22" fill="#37474F"/>
  <path d="M${x + 8},${y - 52} q30,0 30,40" stroke="#263238" stroke-width="6" fill="none"/>
  <rect x="${x - 22}" y="${y + 10}" width="44" height="30" fill="#FFFFFF" opacity="0.85"/>`;

/** Red tag hanging from a string. */
const redTag = (x: number, y: number, rotate = -8) => `
  <g transform="translate(${x} ${y}) rotate(${rotate})">
    <path d="M0,-30 L0,0" stroke="#5F6B78" stroke-width="2"/>
    <rect x="-34" y="0" width="68" height="92" rx="6" fill="#D32F2F" stroke="#9A1B1B" stroke-width="2"/>
    <circle cx="0" cy="12" r="5" fill="#FFF"/>
    <text x="0" y="40" font-family="${FONT}" font-size="14" font-weight="700" text-anchor="middle" fill="#FFF">RED</text>
    <text x="0" y="58" font-family="${FONT}" font-size="14" font-weight="700" text-anchor="middle" fill="#FFF">TAG</text>
    <rect x="-24" y="68" width="48" height="4" fill="#FFCDD2"/><rect x="-24" y="77" width="34" height="4" fill="#FFCDD2"/>
  </g>`;

/** Shelving unit with labelled bins. */
function shelving(x: number, y: number, w: number, levels: number, colors: string[]): string {
  const levelH = (FLOOR_Y + 40 - y) / levels;
  const parts = [`<rect x="${x}" y="${y}" width="10" height="${FLOOR_Y + 40 - y}" fill="#2F6DB5"/><rect x="${x + w - 10}" y="${y}" width="10" height="${FLOOR_Y + 40 - y}" fill="#2F6DB5"/>`];
  for (let l = 0; l < levels; l++) {
    const sy = y + (l + 1) * levelH - 8;
    parts.push(`<rect x="${x}" y="${sy}" width="${w}" height="8" fill="#F28C28"/>`);
    const bins = Math.floor((w - 20) / 70);
    for (let b = 0; b < bins; b++) {
      const bx = x + 14 + b * 70;
      parts.push(`<path d="M${bx},${sy - 50} L${bx + 60},${sy - 50} L${bx + 56},${sy} L${bx + 4},${sy} Z" fill="${colors[(l + b) % colors.length]}"/>`);
      parts.push(`<rect x="${bx + 14}" y="${sy - 36}" width="32" height="14" fill="#FFFFFF"/><rect x="${bx + 18}" y="${sy - 31}" width="22" height="3" fill="#3E4A57"/>`);
    }
  }
  return parts.join('');
}

/** Area sign on the wall. */
const sign = (x: number, y: number, text: string, bg = '#004C8F') => `
  <rect x="${x}" y="${y}" width="${text.replace(/&amp;/g, '&').length * 15 + 40}" height="44" rx="6" fill="${bg}"/>
  <text x="${x + 20}" y="${y + 29}" font-family="${FONT}" font-size="20" font-weight="700" fill="#FFFFFF">${text}</text>`;

/** Oil puddle with a highlight. */
const puddle = (cx: number, cy: number, rx: number, ry: number) => `
  <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#2B2416" opacity="0.85"/>
  <ellipse cx="${cx + rx * 0.3}" cy="${cy + ry * 0.2}" rx="${rx * 0.6}" ry="${ry * 0.55}" fill="#3A3020" opacity="0.9"/>
  <ellipse cx="${cx - rx * 0.25}" cy="${cy - ry * 0.3}" rx="${rx * 0.28}" ry="${ry * 0.18}" fill="#8C8C8C" opacity="0.35"/>`;

// ---------------------------------------------------------------- Scenes

const scenes = {
  // Areas
  cncCell: () => svg(`${room()}
    ${sign(40, 40, 'CNC MACHINING CELL')}
    ${machine(60, 200, 240, 290, 'CNC 1')}${machine(360, 200, 240, 290, 'CNC 2')}${machine(660, 200, 240, 290, 'CNC 3')}
    ${floorLine(560)}${floorLine(690)}
    ${finish()}`),
  toolCrib: () => svg(`${room()}
    ${sign(40, 30, 'TOOL CRIB')}
    ${shelving(40, 100, 380, 4, ['#E53935', '#1E88E5', '#43A047', '#FBC02D'])}
    ${shadowBoard(500, 120)}
    ${bench(480, 400, 440)}
    ${floorLine(640)}
    ${finish()}`),
  assemblyLine: () => svg(`${room({ window: true })}
    ${sign(40, 140, 'ASSEMBLY LINE 1')}
    ${extinguisher(890, 330)}
    <rect x="850" y="${FLOOR_Y + 10}" width="80" height="60" fill="none" stroke="#D32F2F" stroke-width="6"/>
    <rect x="20" y="370" width="800" height="26" rx="12" fill="#5F6B78"/>
    ${Array.from({ length: 16 }, (_, i) => `<circle cx="${40 + i * 50}" cy="383" r="8" fill="#9AA5B1"/>`).join('')}
    ${[0, 1, 2].map((i) => `<rect x="${80 + i * 260}" y="330" width="90" height="40" rx="4" fill="#90A4AE"/><rect x="${80 + i * 260}" y="210" width="10" height="160" fill="#4A5561"/><rect x="${60 + i * 260}" y="200" width="120" height="70" rx="4" fill="#263238"/><rect x="${68 + i * 260}" y="208" width="104" height="54" fill="#4FC3F7"/>`).join('')}
    ${[0, 1, 2, 3, 4].map((i) => `<rect x="${40 + i * 160}" y="396" width="20" height="${H - 396 - 40}" fill="#4A5561"/>`).join('')}
    ${floorLine(640)}
    ${finish()}`),
  packing: () => svg(`${room()}
    ${sign(40, 30, 'PACKING &amp; DISPATCH')}
    <rect x="600" y="60" width="320" height="${FLOOR_Y - 60}" fill="#8A96A3"/>
    ${Array.from({ length: 12 }, (_, i) => `<rect x="600" y="${70 + i * 32}" width="320" height="4" fill="#6E7A86"/>`).join('')}
    ${bench(40, 360, 480)}
    ${box(70, 270, 110, 90, true)}${box(200, 290, 90, 70, true)}${box(320, 250, 130, 110, true)}
    <rect x="600" y="${FLOOR_Y + 20}" width="320" height="150" fill="none" stroke="#D32F2F" stroke-width="8"/>
    <text x="760" y="${FLOOR_Y + 110}" font-family="${FONT}" font-size="26" font-weight="700" text-anchor="middle" fill="#D32F2F">RED TAG AREA</text>
    ${floorLine(680)}
    ${finish()}`),

  // Findings
  oilLeak: () => svg(`${room()}
    ${machine(260, 120, 420, 380, 'CNC 2')}
    <rect x="300" y="505" width="200" height="26" rx="4" fill="#5F6B78"/>
    <rect x="306" y="508" width="188" height="12" fill="#2B2416"/>
    ${puddle(430, 590, 230, 50)}${puddle(640, 620, 90, 26)}
    <path d="M470,500 q4,30 -6,60" stroke="#2B2416" stroke-width="7" fill="none"/>
    ${finish()}`),
  toolsOnBench: (onBoard: boolean) => svg(`${room()}
    ${shadowBoard(270, 60, onBoard ? [] : ['spanner', 'wrench', 'pliers'])}
    ${bench(160, 380, 640)}
    ${onBoard ? '' : `${tool('spanner', 330, 360, '#8796A5', 80, 0.8)}${tool('wrench', 520, 362, '#8796A5', -75, 0.8)}${tool('pliers', 690, 365, '#8796A5', 95, 0.7)}`}
    ${floorLine(650)}
    ${finish()}`),
  dispatchFloor: (worn: boolean) => svg(`${room()}
    <rect x="300" y="60" width="380" height="${FLOOR_Y - 60}" fill="#8A96A3"/>
    ${Array.from({ length: 12 }, (_, i) => `<rect x="300" y="${70 + i * 32}" width="380" height="4" fill="#6E7A86"/>`).join('')}
    ${sign(330, 20, 'DISPATCH')}
    ${floorLine(520, '#F2C400', worn)}${floorLine(640, '#F2C400', worn)}
    ${worn ? '' : `<text x="480" y="600" font-family="${FONT}" font-size="34" font-weight="700" text-anchor="middle" fill="#F2C400">WALKWAY</text><path d="M620,580 l40,0 l0,-14 l30,24 l-30,24 l0,-14 l-40,0 z" fill="#F2C400"/>`}
    ${finish()}`),
  blockedExtinguisher: () => svg(`${room()}
    <rect x="380" y="0" width="200" height="${FLOOR_Y}" fill="#B9C3CD"/>
    ${extinguisher(480, 300)}
    ${crates(330, 600, 4)}${crates(500, 620, 3)}
    ${floorLine(680)}
    ${finish()}`),
  packingBoxes: (labelled: boolean) => svg(`${room()}
    ${bench(80, 400, 800)}
    ${box(110, 290, 130, 110, labelled)}${box(260, 310, 110, 90, labelled)}${box(390, 270, 150, 130, labelled)}${box(560, 300, 120, 100, labelled)}${box(700, 320, 140, 80, labelled)}
    ${labelled ? `<rect x="760" y="140" width="130" height="90" rx="6" fill="#ECEFF1" stroke="#90A4AE" stroke-width="3"/><rect x="780" y="160" width="90" height="10" fill="#37474F"/><rect x="780" y="180" width="60" height="10" fill="#90A4AE"/>` : ''}
    ${finish()}`),
  dustyPanel: () => svg(`
    <rect width="${W}" height="${H}" fill="#C9D2DC"/>
    <rect x="160" y="100" width="640" height="520" rx="18" fill="#37474F"/>
    <rect x="210" y="150" width="540" height="300" rx="8" fill="#4FC3F7"/>
    <rect x="240" y="180" width="200" height="22" fill="#0277BD"/><rect x="240" y="220" width="420" height="14" fill="#B3E5FC"/><rect x="240" y="250" width="360" height="14" fill="#B3E5FC"/>
    <rect x="240" y="300" width="120" height="100" fill="#81D4FA"/><rect x="380" y="320" width="120" height="80" fill="#81D4FA"/><rect x="520" y="280" width="120" height="120" fill="#81D4FA"/>
    ${[0, 1, 2, 3].map((i) => `<circle cx="${260 + i * 140}" cy="530" r="30" fill="${['#43A047', '#FBC02D', '#1E88E5', '#E53935'][i]}"/>`).join('')}
    <rect x="160" y="100" width="640" height="520" rx="18" filter="url(#dust)" opacity="0.9"/>
    <defs><filter id="dust"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="7"/><feColorMatrix values="0 0 0 0 0.62 0 0 0 0 0.58 0 0 0 0 0.5 0 0 0 1.8 -0.7"/></filter>
    <radialGradient id="light" cx="0.5" cy="0.3" r="0.8"><stop offset="0" stop-color="#FFFFFF" stop-opacity="0.12"/><stop offset="1" stop-color="#000000" stop-opacity="0.25"/></radialGradient></defs>
    ${finish()}`),

  // Standards
  floorColours: () => svg(`${room()}
    <rect x="0" y="${FLOOR_Y + 70}" width="${W}" height="16" fill="#F2C400"/><rect x="0" y="${FLOOR_Y + 200}" width="${W}" height="16" fill="#F2C400"/>
    <rect x="40" y="${FLOOR_Y + 100}" width="220" height="90" fill="none" stroke="#2E7D32" stroke-width="8"/><text x="150" y="${FLOOR_Y + 155}" font-family="${FONT}" font-size="20" font-weight="700" text-anchor="middle" fill="#2E7D32">FINISHED GOODS</text>
    <rect x="300" y="${FLOOR_Y + 100}" width="220" height="90" fill="none" stroke="#1565C0" stroke-width="8"/><text x="410" y="${FLOOR_Y + 155}" font-family="${FONT}" font-size="20" font-weight="700" text-anchor="middle" fill="#1565C0">RAW MATERIAL</text>
    <rect x="740" y="${FLOOR_Y + 100}" width="120" height="90" fill="none" stroke="#D32F2F" stroke-width="8"/>
    ${extinguisher(800, 300)}
    ${box(80, 350, 140, 100, true)}
    <rect x="320" y="400" width="180" height="50" fill="#90A4AE"/><rect x="320" y="370" width="180" height="30" fill="#B0BEC5"/>
    ${finish()}`),
  cleanMachine: () => svg(`${room()}
    ${machine(80, 150, 360, 330, 'CNC 1')}
    <rect x="560" y="90" width="320" height="300" rx="8" fill="#FFFFFF" stroke="#90A4AE" stroke-width="4"/>
    <text x="580" y="128" font-family="${FONT}" font-size="20" font-weight="700" fill="#1F2933">Daily cleaning</text>
    ${[0, 1, 2, 3, 4].map((i) => `<rect x="580" y="${150 + i * 44}" width="24" height="24" rx="3" fill="none" stroke="#2E7D32" stroke-width="3"/><path d="M584,${163 + i * 44} l6,7 l12,-14" stroke="#2E7D32" stroke-width="4" fill="none"/><rect x="620" y="${157 + i * 44}" width="${180 - (i % 3) * 30}" height="10" fill="#B0BEC5"/>`).join('')}
    ${floorLine(640)}
    ${finish()}`),

  // Red-tagged items
  fixturePlates: () => svg(`${room()}
    ${bench(120, 400, 720)}
    ${[0, 1, 2].map((i) => `<rect x="${240 + i * 12}" y="${360 - i * 26}" width="380" height="24" rx="3" fill="#90A4AE" stroke="#607D8B" stroke-width="2"/>${[0, 1, 2, 3].map((h) => `<circle cx="${280 + i * 12 + h * 100}" cy="${372 - i * 26}" r="5" fill="#546E7A"/>`).join('')}`).join('')}
    ${redTag(660, 330)}
    ${finish()}`),
  greaseGuns: () => svg(`${room()}
    ${bench(100, 400, 760)}
    ${[0, 1, 2, 3].map((i) => `<g transform="translate(${190 + i * 160} 340)"><rect x="0" y="0" width="120" height="40" rx="18" fill="#C62828"/><rect x="110" y="12" width="60" height="10" fill="#455A64"/><rect x="20" y="36" width="16" height="30" fill="#455A64"/></g>`).join('')}
    ${redTag(800, 300)}
    ${finish()}`),
  bracketBoxes: () => svg(`${room()}
    ${box(160, 330, 200, 160)}${box(380, 350, 180, 140)}${box(270, 200, 190, 130)}
    ${redTag(600, 330)}
    ${floorLine(640)}
    ${finish()}`),
  drillChuck: () => svg(`
    <rect width="${W}" height="${H}" fill="#7B5B3A"/>
    ${Array.from({ length: 8 }, (_, i) => `<rect x="0" y="${i * 92}" width="${W}" height="3" fill="#6A4C2F"/>`).join('')}
    <g transform="translate(420 380)">
      <rect x="-90" y="-150" width="180" height="200" rx="26" fill="#B0BEC5" stroke="#78909C" stroke-width="4"/>
      ${[0, 1, 2, 3, 4, 5].map((i) => `<rect x="-90" y="${-130 + i * 30}" width="180" height="6" fill="#90A4AE"/>`).join('')}
      <path d="M-60,50 L-30,140 L-10,140 L-20,50 Z" fill="#78909C"/><path d="M60,50 L50,140 L30,140 L20,50 Z" fill="#78909C"/>
      <path d="M-10,60 L0,150 L10,60 Z" fill="#78909C"/>
    </g>
    ${redTag(650, 250, 6)}
    <defs><radialGradient id="light" cx="0.5" cy="0.4" r="0.8"><stop offset="0" stop-color="#FFFFFF" stop-opacity="0.15"/><stop offset="1" stop-color="#000000" stop-opacity="0.3"/></radialGradient></defs>
    ${finish()}`),
  scrapBin: () => svg(`${room()}
    <path d="M300,300 L660,300 L630,620 L330,620 Z" fill="#455A64" stroke="#263238" stroke-width="4"/>
    <rect x="290" y="290" width="380" height="24" rx="4" fill="#37474F"/>
    <text x="480" y="470" font-family="${FONT}" font-size="44" font-weight="700" text-anchor="middle" fill="#FFFFFF">SCRAP</text>
    ${[0, 1, 2].map((i) => `<rect x="${340 + i * 40}" y="${250 - i * 8}" width="240" height="20" rx="3" fill="#90A4AE" transform="rotate(${-12 + i * 9} 460 260)"/>`).join('')}
    ${finish()}`),
};

/** The demo organization's logo: a white gear around "SG" on brand blue, square so it fits small spaces. */
const logoSvg = () => {
  const teeth = Array.from({ length: 10 }, (_, i) => `<rect x="244" y="96" width="24" height="44" rx="5" transform="rotate(${i * 36} 256 256)"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
    <rect width="512" height="512" rx="96" fill="#004C8F"/>
    <g fill="#FFFFFF">${teeth}<circle cx="256" cy="256" r="128"/></g>
    <circle cx="256" cy="256" r="104" fill="#004C8F"/>
    <text x="256" y="292" font-family="${FONT}" font-size="104" font-weight="700" text-anchor="middle" fill="#FFFFFF">SG</text>
  </svg>`;
};

export type SceneName =
  | 'cncCell' | 'toolCrib' | 'assemblyLine' | 'packing'
  | 'oilLeak' | 'toolsOffBoard' | 'toolsOnBoard' | 'floorWorn' | 'floorRepainted' | 'blockedExtinguisher'
  | 'boxesUnlabelled' | 'boxesLabelled' | 'dustyPanel' | 'floorColours' | 'cleanMachine'
  | 'fixturePlates' | 'greaseGuns' | 'bracketBoxes' | 'drillChuck' | 'scrapBin';

const SCENES: Record<SceneName, () => string> = {
  cncCell: scenes.cncCell,
  toolCrib: scenes.toolCrib,
  assemblyLine: scenes.assemblyLine,
  packing: scenes.packing,
  oilLeak: scenes.oilLeak,
  toolsOffBoard: () => scenes.toolsOnBench(false),
  toolsOnBoard: () => scenes.toolsOnBench(true),
  floorWorn: () => scenes.dispatchFloor(true),
  floorRepainted: () => scenes.dispatchFloor(false),
  blockedExtinguisher: scenes.blockedExtinguisher,
  boxesUnlabelled: () => scenes.packingBoxes(false),
  boxesLabelled: () => scenes.packingBoxes(true),
  dustyPanel: scenes.dustyPanel,
  floorColours: scenes.floorColours,
  cleanMachine: scenes.cleanMachine,
  fixturePlates: scenes.fixturePlates,
  greaseGuns: scenes.greaseGuns,
  bracketBoxes: scenes.bracketBoxes,
  drillChuck: scenes.drillChuck,
  scrapBin: scenes.scrapBin,
};

/** JPEG bytes of a sample photo. */
export function renderScene(name: SceneName): Promise<Buffer> {
  return sharp(Buffer.from(SCENES[name]())).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
}

/** PNG bytes of the demo organization's logo. */
export function renderLogo(): Promise<Buffer> {
  return sharp(Buffer.from(logoSvg())).png().toBuffer();
}

export const SCENE_NAMES = Object.keys(SCENES) as SceneName[];
