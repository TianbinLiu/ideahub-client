/**
 * QR 编码器回归测试。
 *
 * ★ 这份实现属于"错了也不报错"的类型：任何一步写错，画出来都还是一张方方正正、
 *   看着像 QR 的图 —— 只有拿手机去扫的人才会发现扫不出来，而那时它已经上线了。
 *   所以这里不测"有没有画出东西"，测的是**逐模块**对不对。
 *
 * 黄金样本来自成熟实现 `qrcode@1.5.4`（`QRCode.create(text, {errorCorrectionLevel:'M'})`
 * 的 modules），逐模块比对通过；开发时另用解码器 `jsqr` 把生成的像素图真的解回过原文
 * （含中文、106 字节上限附近）。两者都只在开发机上跑过一次，**没有**因此进依赖 ——
 * 结论以下面的样本形式钉在这里。
 */
import { describe, expect, test } from "vitest";
import { encodeCodewords, encodeQr, qrSvgPath } from "./qrcode";

/** qrcode@1.5.4 对 "https://ideahubs.org/download" 的输出：版本 3、掩码 2、29×29 */
const GOLDEN_URL = "https://ideahubs.org/download";
const GOLDEN = [
  "11111110011000011111101111111",
  "10000010000110000100001000001",
  "10111010101100101000101011101",
  "10111010110110001100001011101",
  "10111010101111110001101011101",
  "10000010101101111100101000001",
  "11111110101010101010101111111",
  "00000000100111010001100000000",
  "10111110010100110101001111100",
  "00000100110010011111011110001",
  "01100010101110000100111110000",
  "00110100011010101011110011010",
  "00100010111010001100000001100",
  "01111000001011110111101110001",
  "01010110101101111000000111100",
  "00011001101001010011000110010",
  "00101010100110110100100001100",
  "11110000111000011111111110101",
  "10111011110110000100110010100",
  "10110001001100101001111110010",
  "10001110110010001101111110111",
  "00000000110101110010100011111",
  "11111110011001111011101011100",
  "10000010111011010001100010000",
  "10111010101110110100111110101",
  "10111010101110011010100001100",
  "10111010100001100001101111110",
  "10000010000001001010110111010",
  "11111110101101100010001000100",
];

const rowsOf = (m: boolean[][]) => m.map((row) => row.map((v) => (v ? "1" : "0")).join(""));

describe("QR 编码器", () => {
  test("与参考实现逐模块一致（含自动挑掩码的结果）", () => {
    // 掩码是自动挑的：这条同时钉住了编码、摆放**和罚分**三件事 ——
    // 罚分算错会挑中另一个掩码，整张图就和这里对不上
    expect(rowsOf(encodeQr(GOLDEN_URL))).toEqual(GOLDEN);
  });

  test("填充字节从第一个填充位起 0xEC/0x11 交替", () => {
    // ★ 真踩过：相位写成按码字下标奇偶算，于是只有一半长度的内容是对的。
    //   29 字节的网址正好落在错的那一半 —— 生成的码扫不出来，而代码看着完全正常。
    const { codewords } = encodeCodewords(GOLDEN_URL); // 29 字节 → 4+8 位头，占到第 31 个码字
    // 版本 3 只有一个块，交织后前 44 个就是数据码字，其中第 31 个起是填充
    expect([...codewords.slice(31, 35)]).toEqual([0xec, 0x11, 0xec, 0x11]);
  });

  test.each([
    ["单字符", "A", 21],
    ["站内网址", GOLDEN_URL, 29],
    ["中文", "启梦 App 下载", 25],
    ["106 字节（上限）", "z".repeat(106), 41],
  ])("%s：按内容长度选最小版本（%s → %i 模块见方）", (_label, text, size) => {
    const m = encodeQr(text);
    expect(m.length).toBe(size);
    expect(m[0].length).toBe(size);
  });

  test("超出上限如实报错，而不是画一张扫不出来的图", () => {
    expect(() => encodeQr("z".repeat(107))).toThrow(/超出/);
  });

  test("每个分块的纠错码字都能通过校验子检验", () => {
    // 独立于实现再算一遍 GF(256)：码字多项式在 α⁰…α^(ec-1) 上必须全为 0。
    // ★ 这条覆盖的是分块与交织 —— 版本 6 有 4 个块，块分错/交织错时
    //   图还是画得出来，只是解码器纠不回来。
    const exp = new Uint8Array(512);
    const log = new Uint8Array(256);
    let x = 1;
    for (let i = 0; i < 255; i++) {
      exp[i] = x;
      log[x] = i;
      x = (x << 1) ^ (x & 0x80 ? 0x11d : 0);
    }
    for (let i = 255; i < 512; i++) exp[i] = exp[i - 255];
    const mul = (a: number, b: number) => (a === 0 || b === 0 ? 0 : exp[log[a] + log[b]]);

    for (const text of ["A", GOLDEN_URL, "启梦 App 下载", "z".repeat(106)]) {
      const { dataBlocks, ecBlocks } = encodeCodewords(text);
      dataBlocks.forEach((data, b) => {
        const full = [...data, ...ecBlocks[b]];
        for (let i = 0; i < ecBlocks[b].length; i++) {
          let syndrome = 0;
          for (const c of full) syndrome = mul(syndrome, exp[i]) ^ c;
          expect(`${text.slice(0, 8)} 块${b} S${i}=${syndrome}`).toBe(`${text.slice(0, 8)} 块${b} S${i}=0`);
        }
      });
    }
  });

  test("三个探测图案与固定黑点就位", () => {
    // 摆错位置的话解码器根本找不到码；而图看着仍然"有模有样"
    const m = encodeQr(GOLDEN_URL);
    const n = m.length;
    for (const [top, left] of [
      [0, 0],
      [0, n - 7],
      [n - 7, 0],
    ]) {
      expect(m[top][left]).toBe(true);
      expect(m[top + 1][left + 1]).toBe(false); // 内圈的白环
      expect(m[top + 3][left + 3]).toBe(true); // 中心 3×3 的黑块
    }
    expect(m[n - 8][8]).toBe(true); // 规范钉死的那个固定黑点
  });

  test("SVG 路径的方块数与深色模块数一致", () => {
    const m = encodeQr(GOLDEN_URL);
    const dark = m.flat().filter(Boolean).length;
    expect(qrSvgPath(m).match(/M/g)?.length).toBe(dark);
  });
});
