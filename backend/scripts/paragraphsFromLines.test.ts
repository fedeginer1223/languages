import assert from 'assert';
import { linesToParagraphs, Line, H_MARK } from '../src/utils/bookText';

const W = 400;
const L = (text: string, y: number, o: Partial<Line> = {}): Line =>
  ({ text, x0: 50, x1: 350, y, size: 10, ...o });
const body = 'abcdefghijklmnopqrstuvwxyz';
const mk = (n: number) => `${body} ${n}`;

// page 1: header, heading "II" (centered, bigger), indented para, hyphenation, page number
const p1: Line[] = [
  L('Madame Bovary', 780, { x0: 150, x1: 250 }),
  L('II', 740, { x0: 190, x1: 210, size: 16 }),
  L(mk(1) + ' commence', 700, { x0: 70 }),
  L('le rez-de-chaus-', 688),
  L('sée est grand.', 676, { x1: 200 }),
  L(mk(2) + ' autre para', 664, { x0: 70 }),
  L('et cela finit sans point et', 652),
  L('33', 40, { x0: 195, x1: 205 }),
];
// page 2: continues mid-sentence (not indented), then big gap paragraph
const p2: Line[] = [
  L('Madame Bovary', 780, { x0: 150, x1: 250 }),
  L('continue ici la phrase. ' + body, 760),
  L(mk(3), 748),
  L(mk(5), 736),
  L(mk(6), 724),
  L(mk(4) + ' nouveau', 700),
  L('34', 40, { x0: 195, x1: 205 }),
];
const filler = (): Line[] => [L('Madame Bovary', 780, { x0: 150, x1: 250 }), L(mk(9), 760), L('x', 40)];
const out = linesToParagraphs([p1, p2, filler(), filler()], W);

assert.strictEqual(out[0], H_MARK + 'II');
assert.ok(out[1].startsWith(mk(1)), out[1]);
assert.ok(out[1].includes('rez-de-chaussée est grand.'), out[1]);
assert.ok(out[2].startsWith(mk(2)), out[2]);
// page boundary mid-sentence: joined into same paragraph
assert.ok(out[2].includes('sans point et continue ici la phrase.'), out[2]);
assert.ok(!out.some((p) => /\b3[34]\b/.test(p)), 'page numbers dropped');
assert.ok(!out.some((p) => p.includes('Madame Bovary')), 'running header dropped');
assert.ok(out.some((p) => p.startsWith(mk(4))), 'big gap breaks paragraph');
console.log('ok', out.length, 'paragraphs');
console.log(out);
