import { describe, expect, it } from 'vitest';
import {
  chunkText,
  validateChunkingOptions,
  type ChunkingOptions,
} from './text-chunking';

const smallOptions: ChunkingOptions = {
  targetSize: 100,
  maximumSize: 140,
  overlapSize: 20,
};

describe('text chunking', () => {
  it('returns no chunks for empty input', () => {
    expect(chunkText('', smallOptions)).toEqual([]);
    expect(chunkText('   ', smallOptions)).toEqual([]);
  });

  it('packs normal paragraphs in reading order and records contiguous positions', () => {
    const first = 'First paragraph stays first.';
    const second = 'Second paragraph follows the first.';
    const third = 'Third paragraph remains last.';
    const chunks = chunkText(`${first}\n\n${second}\n\n${third}`, smallOptions);

    expect(chunks.map((chunk) => chunk.position)).toEqual([0]);
    expect(chunks[0].text).toBe(`${first}\n\n${second}\n\n${third}`);
    expect(chunks[0].characterCount).toBe(chunks[0].text.length);
  });

  it('allows an intact paragraph to pass the target without exceeding the maximum', () => {
    const first = 'a'.repeat(80);
    const second = 'b'.repeat(30);
    const chunks = chunkText(`${first}\n\n${second}`, smallOptions);

    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe(`${first}\n\n${second}`);
  });

  it('splits one very long paragraph without empty or oversized chunks', () => {
    const chunks = chunkText('a'.repeat(350), { ...smallOptions, overlapSize: 0 });

    expect(chunks).toHaveLength(3);
    expect(chunks.every((chunk) => chunk.text.length > 0 && chunk.text.length <= 140)).toBe(true);
    expect(chunks.map((chunk) => chunk.position)).toEqual([0, 1, 2]);
  });

  it('uses a bounded overlap from the previous base chunk', () => {
    const chunks = chunkText(`${'a'.repeat(110)}\n\n${'b'.repeat(110)}`, smallOptions);

    expect(chunks).toHaveLength(2);
    expect(chunks[1].text).toBe(`${'a'.repeat(20)} ${'b'.repeat(110)}`);
    expect(chunks[1].text.length).toBeLessThanOrEqual(140);
  });

  it('keeps output deterministic and preserves paragraph order across chunks', () => {
    const text = `${'first '.repeat(25)}\n\n${'second '.repeat(25)}\n\n${'third '.repeat(25)}`;
    const firstRun = chunkText(text, smallOptions);

    expect(chunkText(text, smallOptions)).toEqual(firstRun);
    expect(firstRun[0].text).toContain('first');
    expect(firstRun.map((chunk) => chunk.text).join(' ')).toContain('second');
    expect(firstRun.at(-1)?.text).toContain('third');
  });

  it('validates target, maximum, and overlap boundaries', () => {
    expect(() => validateChunkingOptions({ targetSize: 99, maximumSize: 140, overlapSize: 0 })).toThrow(RangeError);
    expect(() => validateChunkingOptions({ targetSize: 100, maximumSize: 99, overlapSize: 0 })).toThrow(RangeError);
    expect(() => validateChunkingOptions({ targetSize: 100, maximumSize: 140, overlapSize: 100 })).toThrow(RangeError);
    expect(() => validateChunkingOptions({ targetSize: 100.5, maximumSize: 140, overlapSize: 0 })).toThrow(RangeError);
  });
});
