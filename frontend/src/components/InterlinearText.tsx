import { Fragment, type ReactNode } from 'react';
import type { BookToken, BookAnnotation, Cefr } from '../services/api';

export const CEFR_LEVELS: Cefr[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
export const cefrIndex = (c: Cefr) => CEFR_LEVELS.indexOf(c);

interface Props {
  text: string;
  tokens: BookToken[];
  annotations: BookAnnotation[];
  levelIndex: number;
  glossesVisible: boolean;
  savedLemmas: Set<string>;
  onToggleWord: (a: BookAnnotation) => void;
  chapterTitle?: string | null;
  highlights?: { id: string; startToken: number; endToken: number; translation: string | null }[];
  /** Shift+click on a highlighted phrase. */
  onRemoveHighlight?: (id: string) => void;
}

const HL_CLASS = 'bg-amber-100/80 rounded-[2px] box-decoration-clone';

export default function InterlinearText({
  text, tokens, annotations, levelIndex, glossesVisible, savedLemmas, onToggleWord, chapterTitle, highlights, onRemoveHighlight,
}: Props) {
  const hlAt = (i: number) => highlights?.find((h) => i >= h.startToken && i <= h.endToken);
  const hlProps = (i: number) => {
    const h = hlAt(i);
    if (!h) return null;
    return {
      className: HL_CLASS,
      title: `${h.translation ?? 'Frase guardada'}${onRemoveHighlight ? ' (Mayús+clic para quitar)' : ''}`,
      'data-hl': h.id,
    };
  };
  const shiftRemove = (e: { shiftKey: boolean; preventDefault: () => void }, i: number) => {
    const h = hlAt(i);
    if (!h || !e.shiftKey || !onRemoveHighlight) return false;
    e.preventDefault();
    return true;
  };
  const annByStart = new Map<number, BookAnnotation>();
  for (const a of annotations) annByStart.set(a.i, a.span > 6 ? { ...a, span: 1 } : a);

  const paragraphs: ReactNode[][] = [];
  let cur: ReactNode[] = [];
  const closePara = () => {
    if (cur.length) paragraphs.push(cur);
    cur = [];
  };
  // gap text: "\n\n" closes paragraph, single "\n" renders as space
  const pushGap = (gap: string, key: string, inHl?: { id: string; translation: string | null }) => {
    if (!gap) return;
    const parts = gap.split(/\n\s*\n/);
    parts.forEach((part, pi) => {
      if (pi > 0) closePara();
      const t = part.replace(/\s*\n\s*/g, ' ');
      if (t) cur.push(inHl && pi === 0 ? <span key={`${key}-${pi}`} className={HL_CLASS}>{t}</span> : <Fragment key={`${key}-${pi}`}>{t}</Fragment>);
    });
  };

  let prevEnd = 0;
  let k = 0;
  while (k < tokens.length) {
    const tok = tokens[k];
    if (tok.s > prevEnd) {
      const pk = k > 0 ? hlAt(tokens[k - 1].i) : undefined;
      const inGap = pk && tok.i <= pk.endToken ? pk : undefined;
      pushGap(text.slice(prevEnd, tok.s), `g${k}`, inGap);
    }
    const ann = annByStart.get(tok.i);
    if (!ann) {
      const hp = hlProps(tok.i);
      cur.push(
        <span
          key={`t${k}`}
          data-i={tok.i}
          {...(hp ?? {})}
          onMouseDown={hp ? (e) => { shiftRemove(e, tok.i); } : undefined}
          onClick={hp ? (e) => { if (shiftRemove(e, tok.i)) onRemoveHighlight?.(hlAt(tok.i)!.id); } : undefined}
        >
          {text.slice(tok.s, tok.e)}
        </span>
      );
      prevEnd = tok.e;
      k += 1;
      continue;
    }
    const span = Math.max(1, ann.span);
    const last = Math.min(tokens.length - 1, k + span - 1);
    const inner: ReactNode[] = [];
    for (let j = k; j <= last; j++) {
      if (j > k && tokens[j].s > tokens[j - 1].e) {
        const g = text.slice(tokens[j - 1].e, tokens[j].s).replace(/\s+/g, ' ');
        const gh = hlAt(tokens[j - 1].i);
        inner.push(gh && tokens[j].i <= gh.endToken ? <span key={`gg${j}`} className={HL_CLASS}>{g}</span> : g);
      }
      const ip = hlProps(tokens[j].i);
      inner.push(<span key={`gt${j}`} data-i={tokens[j].i} className={ip?.className}>{text.slice(tokens[j].s, tokens[j].e)}</span>);
    }
    const gp = hlProps(tok.i) ?? hlProps(tokens[last].i);
    const saved = savedLemmas.has(ann.lemma);
    const shown = glossesVisible && (cefrIndex(ann.cefr) >= levelIndex || saved);
    const glossBase = 'text-[0.6em] italic text-[#6d5bd0] tracking-[0.01em] opacity-95';
    const gloss = (
      <span
        className={`${glossBase} ${
          shown || saved
            ? 'block h-0 overflow-visible relative -top-[0.35em] leading-none text-center whitespace-nowrap select-none'
            : 'absolute left-1/2 -translate-x-1/2 top-[calc(100%-0.35em)] leading-none whitespace-nowrap invisible group-hover:visible pointer-events-none z-10 select-none'
        }`}
      >
        {ann.gloss}
      </span>
    );
    cur.push(
      <span
        key={`a${k}`}
        data-i={tok.i}
        data-i-start={tok.i}
        data-i-end={tokens[last].i}
        title={gp?.title}
        onMouseDown={(e) => { for (let j = k; j <= last; j++) if (shiftRemove(e, tokens[j].i)) return; }}
        onClick={(e) => {
          for (let j = k; j <= last; j++) {
            if (shiftRemove(e, tokens[j].i)) { onRemoveHighlight?.(hlAt(tokens[j].i)!.id); return; }
          }
          if (window.getSelection()?.toString()) return;
          onToggleWord(ann);
        }}
        className="group relative inline-flex flex-col items-center align-top cursor-pointer hover:bg-violet-50/70 rounded-sm"
      >
        <span
          className={`${span <= 3 ? 'whitespace-nowrap' : ''} ${
            saved
              ? 'underline decoration-amber-400 decoration-[1.5px] underline-offset-[5px]'
              : ''
          }`}
        >
          {inner}
        </span>
        {gloss}
      </span>
    );
    prevEnd = tokens[last].e;
    k = last + 1;
  }
  if (prevEnd < text.length) pushGap(text.slice(prevEnd), 'end');
  closePara();

  const isHeadingPara = !!chapterTitle && text.trimStart().split(/\n\s*\n/)[0].trim() === chapterTitle.trim();

  return (
    <>
      {paragraphs.map((nodes, pi) => {
        if (pi === 0 && isHeadingPara) {
          return (
            <h2 key={pi} className="text-center font-serif text-2xl tracking-[0.2em] text-stone-700 my-10">
              {chapterTitle}
            </h2>
          );
        }
        return (
          <p key={pi} className="mb-[1.15em]">
            {nodes}
          </p>
        );
      })}
    </>
  );
}
