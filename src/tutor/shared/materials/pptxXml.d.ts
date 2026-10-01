// 给 ./pptxXml.js 的类型声明；实现只有那一份。
// 给 ../src/materials/pptxXml.js 的类型声明；实现只有那一份。
export function slideFileOrder(names: string[]): string[];
export function slideBlocksFromXml(xml: string): { title?: string; blocks: { text: string }[] };
export function decodeXml(s: string): string;

