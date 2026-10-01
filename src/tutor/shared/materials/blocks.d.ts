// 给 ./blocks.js（与 tutor 仓 / server 同一份切块 + 块 hash + 找短引的纯函数）的类型声明；实现只有那一份，别在 web 里另抄。
// 给 ../src/materials/blocks.js（Node 与浏览器共用的纯函数）的类型声明；实现只有那一份，别在 web 里另抄。
export const HASH_LEN: number;
export const PAGE_BREAK: string;
export function fold(text: string): string;
export function sha256Hex(text: string): Promise<string>;
export function blockHash(text: string): Promise<string>;
export function findQuote(text: string, quote: string): { start: number; end: number; foldedStart: number; foldedEnd: number } | null;
export function blocksFromPdfItems(items: unknown[], pageHeight: number): { text: string; bbox: number[]; fontSize: number }[];
export function titleOf(blocks: { text: string; fontSize: number }[]): string | undefined;
export function paragraphsToBlocks(text: string): { text: string }[];
export function hashPages<T extends { idx: number; title?: string; blocks: { text: string }[] }>(pages: T[]): Promise<{ idx: number; title?: string; blocks: { hash: string; text: string; bbox?: number[] }[] }[]>;
export function pagesToText(pages: { blocks: { text: string }[] }[]): string;
export function shortSha(sha: string): string;

