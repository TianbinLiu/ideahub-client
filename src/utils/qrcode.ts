/**
 * 极简 QR 码生成器（字节模式 / 纠错等级 M / 版本 1-6）。
 *
 * ★ 为什么自己写而不是装 `qrcode`：这里只有一个用途 —— 把下载页自己的网址画成一张
 *   码给桌面用户扫。为此引入一个运行时依赖，等于让每个访问官网的人都下载一份
 *   通用编码器（多种模式、8 种纠错、40 个版本、canvas/终端/文件多种输出）。
 *   这里的实现只覆盖真正用得上的那条路径。
 *
 * ★ 为什么**故意只做到版本 6**（字节模式最多 106 字节）：
 *   ① 版本 ≥7 的符号里多一块 18 位「版本信息」区，是一整套额外的 BCH 编码与摆放规则；
 *   ② 版本 1-6 在 M 等级下，RS 分块**块块等长**（见 VERSIONS 表），交织就是简单的
 *      逐块轮取；从版本 7 起才出现两组不等长分块，要多一套分组逻辑。
 *   一个站内网址撑死几十字节，两条复杂度都不必付。超了会抛错 —— 而不是悄悄画出
 *   一张扫不出来的图。
 *
 * 参考：ISO/IEC 18004。输出与成熟实现 `qrcode` 逐模块比对过（见 qrcode.test.ts）。
 */

/** 模块矩阵，`m[row][col] === true` 为深色。不含静区（quiet zone），由渲染方自己留 */
export type QrMatrix = boolean[][];

/**
 * 版本表（**仅** M 等级）。dataCodewords = total - ecPerBlock × blocks。
 * align = 对齐图案的中心坐标候选，版本 1 没有对齐图案。
 */
const VERSIONS = [
  { total: 26, ecPerBlock: 10, blocks: 1, align: [] as number[] },
  { total: 44, ecPerBlock: 16, blocks: 1, align: [6, 18] },
  { total: 70, ecPerBlock: 26, blocks: 1, align: [6, 22] },
  { total: 100, ecPerBlock: 18, blocks: 2, align: [6, 26] },
  { total: 134, ecPerBlock: 24, blocks: 2, align: [6, 30] },
  { total: 172, ecPerBlock: 16, blocks: 4, align: [6, 34] },
];

/** 纠错等级 M 在格式信息里的编码。★ 不是 1 —— 规范里的顺序是 L=01 M=00 Q=11 H=10 */
const EC_LEVEL_M = 0b00;
const G15 = 0b101_0011_0111; // 格式信息的 BCH(15,5) 生成多项式
const G15_MASK = 0b101_0100_0001_0010; // 规范要求格式信息再异或这个常数

// ── GF(256) ────────────────────────────────────────────────────────────
// 本原多项式 0x11D。EXP 表开两倍长是为了让 log 相加后不必再 %255。
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
}

const gfMul = (a: number, b: number) => (a === 0 || b === 0 ? 0 : GF_EXP[GF_LOG[a] + GF_LOG[b]]);

/** 生成多项式 (x-α⁰)(x-α¹)…，系数按次数从高到低存 */
function rsGenerator(degree: number): number[] {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array<number>(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j]; // × x
      next[j + 1] ^= gfMul(poly[j], GF_EXP[i]); // × α^i
    }
    poly = next;
  }
  return poly;
}

/** 多项式除法取余数，即这一块的纠错码字 */
function rsEncode(data: Uint8Array, ecLen: number): Uint8Array {
  const gen = rsGenerator(ecLen);
  const buf = new Uint8Array(data.length + ecLen);
  buf.set(data);
  for (let i = 0; i < data.length; i++) {
    const factor = buf[i];
    if (factor === 0) continue;
    // gen[0] === 1，所以这一轮结束后 buf[i] 必然被自己异或成 0
    for (let j = 0; j < gen.length; j++) buf[i + j] ^= gfMul(gen[j], factor);
  }
  return buf.slice(data.length);
}

// ── 码字 ───────────────────────────────────────────────────────────────

/** 挑一个装得下的最小版本；装不下时抛错而不是截断 */
function pickVersion(byteLen: number) {
  for (let v = 1; v <= VERSIONS.length; v++) {
    const spec = VERSIONS[v - 1];
    const dataCodewords = spec.total - spec.ecPerBlock * spec.blocks;
    // 4 位模式 + 8 位长度（版本 1-9 的字节模式长度字段就是 8 位）+ 数据本身
    if (4 + 8 + byteLen * 8 <= dataCodewords * 8) return { version: v, spec, dataCodewords };
  }
  throw new Error(`QR: 内容 ${byteLen} 字节，超出本实现支持的上限（版本 6 / 106 字节）`);
}

/** 文本 → 交织后的完整码字流（数据 + 纠错） */
export function encodeCodewords(text: string) {
  const bytes = new TextEncoder().encode(text);
  const { version, spec, dataCodewords } = pickVersion(bytes.length);

  // 位流：0100（字节模式）+ 8 位长度 + 数据
  const bits: number[] = [];
  const push = (value: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((value >> i) & 1);
  };
  push(0b0100, 4);
  push(bytes.length, 8);
  for (const b of bytes) push(b, 8);

  // 结束符最多 4 个 0（剩余空间不足 4 位时就少补几个），再补齐到整字节
  const capacity = dataCodewords * 8;
  for (let i = 0; i < 4 && bits.length < capacity; i++) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);

  const data = new Uint8Array(dataCodewords);
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
    data[i / 8] = byte;
  }
  // 规范指定的填充字节 0xEC / 0x11 交替。
  // ★ 相位是从**第一个填充字节**起算的，不是按码字下标的奇偶 —— 写成 `i % 2` 的话，
  //   只有内容长度恰好让填充从偶数下标开始时才对，另一半情况整串填充错开一位。
  //   （踩过：29 字节的网址正好落在错开那一半，画出来的码扫不出来）
  const padStart = bits.length / 8;
  for (let i = padStart; i < dataCodewords; i++) data[i] = (i - padStart) % 2 === 0 ? 0xec : 0x11;

  // 分块算纠错。★ 版本 1-6 的 M 等级块块等长，所以这里没有分组逻辑（见文件头）
  const perBlock = dataCodewords / spec.blocks;
  const dataBlocks: Uint8Array[] = [];
  const ecBlocks: Uint8Array[] = [];
  for (let b = 0; b < spec.blocks; b++) {
    const chunk = data.slice(b * perBlock, (b + 1) * perBlock);
    dataBlocks.push(chunk);
    ecBlocks.push(rsEncode(chunk, spec.ecPerBlock));
  }

  // 交织：先按列取遍所有块的数据码字，再同样取遍纠错码字。
  // ★ 不交织也能画出一张图，但一处污损就会集中打在同一个块上，超出该块纠错能力
  const out = new Uint8Array(spec.total);
  let k = 0;
  for (let i = 0; i < perBlock; i++) for (const blk of dataBlocks) out[k++] = blk[i];
  for (let i = 0; i < spec.ecPerBlock; i++) for (const blk of ecBlocks) out[k++] = blk[i];

  return { version, spec, codewords: out, dataBlocks, ecBlocks };
}

// ── 矩阵 ───────────────────────────────────────────────────────────────

const MASKS: ((r: number, c: number) => boolean)[] = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (_r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

/** 格式信息 15 位：5 位（等级 + 掩码）补 10 位 BCH，再异或掩码常数 */
function formatBits(mask: number): number {
  const data = (EC_LEVEL_M << 3) | mask;
  let rem = data << 10;
  for (let i = 14; i >= 10; i--) if ((rem >> i) & 1) rem ^= G15 << (i - 10);
  return ((data << 10) | rem) ^ G15_MASK;
}

/** 画功能图案（探测/分隔/对齐/定时/固定黑点），顺带标出哪些位置不能放数据 */
function functionPatterns(version: number, size: number) {
  const modules: (boolean | null)[][] = Array.from({ length: size }, () => new Array(size).fill(null));
  const reserved: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false));

  const setFn = (r: number, c: number, dark: boolean) => {
    modules[r][c] = dark;
    reserved[r][c] = true;
  };

  // 三个探测图案 + 分隔带（分隔带是浅色，但同样属于功能区，不能放数据）
  for (const [top, left] of [
    [0, 0],
    [0, size - 7],
    [size - 7, 0],
  ]) {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const rr = top + r;
        const cc = left + c;
        if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
        const onRing = r === 0 || r === 6 || c === 0 || c === 6;
        const inCore = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        const outside = r === -1 || r === 7 || c === -1 || c === 7;
        setFn(rr, cc, !outside && (onRing || inCore));
      }
    }
  }

  // 对齐图案：坐标两两组合，压到探测图案上的那几个不画
  const coords = VERSIONS[version - 1].align;
  for (const r of coords) {
    for (const c of coords) {
      const nearFinder =
        (r <= 8 && c <= 8) || (r <= 8 && c >= size - 9) || (r >= size - 9 && c <= 8);
      if (nearFinder) continue;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          setFn(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
        }
      }
    }
  }

  // 定时图案：第 6 行/列，深浅相间
  for (let i = 8; i < size - 8; i++) {
    setFn(6, i, i % 2 === 0);
    setFn(i, 6, i % 2 === 0);
  }

  // 固定黑点，位置由规范钉死
  setFn(size - 8, 8, true);

  // 格式信息区：先占位，画完数据再填（内容取决于选中的掩码）
  for (let i = 0; i <= 8; i++) {
    if (!reserved[8][i]) reserved[8][i] = true;
    if (!reserved[i][8]) reserved[i][8] = true;
  }
  for (let i = 0; i < 8; i++) {
    reserved[8][size - 1 - i] = true;
    reserved[size - 1 - i][8] = true;
  }

  return { modules, reserved };
}

/** 数据位按规范的之字形走位落格：右下角起，每次两列，遇第 6 列（定时）跳过 */
function placeData(
  modules: (boolean | null)[][],
  reserved: boolean[][],
  size: number,
  codewords: Uint8Array,
) {
  let bit = 0;
  const nextBit = () => {
    const byte = bit >> 3;
    const dark = byte < codewords.length && ((codewords[byte] >> (7 - (bit & 7))) & 1) === 1;
    bit++;
    return dark;
  };

  let upward = true;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col = 5;
    for (let i = 0; i < size; i++) {
      const row = upward ? size - 1 - i : i;
      for (const c of [col, col - 1]) {
        if (reserved[row][c]) continue;
        modules[row][c] = nextBit();
      }
    }
    upward = !upward;
  }
}

/** 把格式信息的 15 位写进两处副本（规范钉死的位置，两处内容相同以便任一处被遮挡仍可读） */
function writeFormat(modules: (boolean | null)[][], size: number, mask: number) {
  const bits = formatBits(mask);
  for (let i = 0; i < 15; i++) {
    const dark = ((bits >> i) & 1) === 1;
    // 竖排那份（第 8 列，自上而下，跳过第 6 行的定时图案）
    if (i < 6) modules[i][8] = dark;
    else if (i < 8) modules[i + 1][8] = dark;
    else modules[size - 15 + i][8] = dark;
    // 横排那份（第 8 行，自右向左，同样跳过第 6 列）
    if (i < 8) modules[8][size - 1 - i] = dark;
    else if (i === 8) modules[8][7] = dark;
    else modules[8][14 - i] = dark;
  }
}

/**
 * 罚分（规范 8.8.2 的四条规则）。分越低越好，用来在 8 个掩码里挑一个 ——
 * ★ 挑掩码不是可选步骤：连成大片同色、或出现和探测图案相似的条纹，扫码器会认错。
 */
function penalty(m: boolean[][], size: number): number {
  let score = 0;

  // 规则 1：同色连续 ≥5 个，每条 3 + (长度-5)
  const runScore = (get: (i: number, j: number) => boolean) => {
    for (let i = 0; i < size; i++) {
      let run = 1;
      for (let j = 1; j < size; j++) {
        if (get(i, j) === get(i, j - 1)) run++;
        else {
          if (run >= 5) score += run - 2;
          run = 1;
        }
      }
      if (run >= 5) score += run - 2;
    }
  };
  runScore((i, j) => m[i][j]);
  runScore((i, j) => m[j][i]);

  // 规则 2：每个 2×2 同色块 +3
  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size - 1; c++) {
      const v = m[r][c];
      if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) score += 3;
    }
  }

  // 规则 3：出现 1011101 + 4 个浅色（任一朝向）+40 —— 这正是探测图案的特征条纹
  const P1 = [true, false, true, true, true, false, true, false, false, false, false];
  const P2 = [false, false, false, false, true, false, true, true, true, false, true];
  const matches = (get: (k: number) => boolean, pat: boolean[]) => pat.every((v, k) => get(k) === v);
  for (let i = 0; i < size; i++) {
    for (let j = 0; j + 11 <= size; j++) {
      if (matches((k) => m[i][j + k], P1) || matches((k) => m[i][j + k], P2)) score += 40;
      if (matches((k) => m[j + k][i], P1) || matches((k) => m[j + k][i], P2)) score += 40;
    }
  }

  // 规则 4：深色占比每偏离 50% 一个 5%，+10
  let dark = 0;
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (m[r][c]) dark++;
  const ratio = (dark * 100) / (size * size);
  score += Math.floor(Math.abs(ratio - 50) / 5) * 10;

  return score;
}

/** 生成完整符号；mask 传 0-7 可指定掩码（测试用），不传则按罚分自动挑 */
export function encodeQr(text: string, forcedMask?: number): QrMatrix {
  const { version, codewords } = encodeCodewords(text);
  const size = 21 + (version - 1) * 4;

  const build = (mask: number): QrMatrix => {
    const { modules, reserved } = functionPatterns(version, size);
    placeData(modules, reserved, size, codewords);
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (!reserved[r][c] && MASKS[mask](r, c)) modules[r][c] = !modules[r][c];
      }
    }
    writeFormat(modules, size, mask);
    return modules as boolean[][];
  };

  if (forcedMask !== undefined) return build(forcedMask);

  let best: QrMatrix | null = null;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const candidate = build(mask);
    const score = penalty(candidate, size);
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best!;
}

/**
 * 矩阵 → 一条 SVG path 的 `d`。
 * ★ 为什么不是一个模块一个 `<rect>`：版本 3 就有 841 个模块，其中约一半是深色 ——
 *   那是 400 多个 DOM 节点，而这是一张静态图。合成一条路径只有一个节点。
 */
export function qrSvgPath(matrix: QrMatrix): string {
  let d = "";
  for (let r = 0; r < matrix.length; r++) {
    for (let c = 0; c < matrix.length; c++) {
      if (matrix[r][c]) d += `M${c} ${r}h1v1h-1z`;
    }
  }
  return d;
}
