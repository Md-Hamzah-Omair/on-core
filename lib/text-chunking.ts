export const CHUNK_TARGET_LENGTH = 1000;
export const CHUNK_MAX_LENGTH = 1400;
export const CHUNK_OVERLAP_LENGTH = 200;

export interface ChunkingOptions {
  targetSize: number;
  maximumSize: number;
  overlapSize: number;
}

export interface TextChunkDraft {
  position: number;
  text: string;
  characterCount: number;
}

export interface StoredTextChunk extends TextChunkDraft {
  pageId: number;
}

export const DEFAULT_CHUNKING_OPTIONS: ChunkingOptions = {
  targetSize: CHUNK_TARGET_LENGTH,
  maximumSize: CHUNK_MAX_LENGTH,
  overlapSize: CHUNK_OVERLAP_LENGTH,
};

type TextUnit = {
  separator: ' ' | '\n\n';
  text: string;
};

type OverlapSelection = {
  startsAtParagraphBoundary: boolean;
  text: string;
};

function safeEnd(text: string, start: number, end: number): number {
  if (
    end > start
    && end < text.length
    && /[\uD800-\uDBFF]/.test(text.charAt(end - 1))
    && /[\uDC00-\uDFFF]/.test(text.charAt(end))
  ) {
    return end - 1;
  }

  return end;
}

function splitLongParagraph(paragraph: string, maximumSize: number): string[] {
  const pieces: string[] = [];
  let start = 0;

  while (start < paragraph.length) {
    const maximumEnd = safeEnd(paragraph, start, Math.min(start + maximumSize, paragraph.length));
    if (maximumEnd === paragraph.length) {
      pieces.push(paragraph.slice(start).trim());
      break;
    }

    let end = maximumEnd;
    for (let index = maximumEnd - 1; index > start; index -= 1) {
      if (/[.!?]/.test(paragraph.charAt(index)) && /\s/.test(paragraph.charAt(index + 1))) {
        end = index + 1;
        break;
      }
    }

    if (end === maximumEnd) {
      for (let index = maximumEnd - 1; index > start; index -= 1) {
        if (/\s/.test(paragraph.charAt(index))) {
          end = index;
          break;
        }
      }
    }

    end = safeEnd(paragraph, start, end);
    if (end <= start) end = maximumEnd;

    const piece = paragraph.slice(start, end).trim();
    if (piece) pieces.push(piece);

    start = end;
    while (start < paragraph.length && /\s/.test(paragraph.charAt(start))) {
      start += 1;
    }
  }

  return pieces;
}

function createUnits(text: string, maximumSize: number): TextUnit[] {
  const units: TextUnit[] = [];
  const paragraphs = text.split('\n\n').map((paragraph) => paragraph.trim()).filter(Boolean);

  for (const [paragraphIndex, paragraph] of paragraphs.entries()) {
    const pieces = paragraph.length > maximumSize
      ? splitLongParagraph(paragraph, maximumSize)
      : [paragraph];

    for (const [pieceIndex, piece] of pieces.entries()) {
      units.push({
        separator: paragraphIndex === 0 && pieceIndex === 0 ? ' ' : pieceIndex === 0 ? '\n\n' : ' ',
        text: piece,
      });
    }
  }

  return units;
}

function createBaseChunks(text: string, options: ChunkingOptions): string[] {
  const chunks: string[] = [];
  let current = '';

  for (const unit of createUnits(text, options.maximumSize)) {
    const candidate = current ? `${current}${unit.separator}${unit.text}` : unit.text;
    if (candidate.length <= options.maximumSize) {
      current = candidate;
      if (current.length >= options.targetSize) {
        chunks.push(current);
        current = '';
      }
      continue;
    }

    if (current) chunks.push(current);
    current = unit.text;
  }

  if (current) chunks.push(current);
  return chunks;
}

function selectOverlap(previousChunk: string, maximumLength: number): OverlapSelection {
  if (maximumLength <= 0) {
    return { startsAtParagraphBoundary: false, text: '' };
  }

  const earliestStart = Math.max(0, previousChunk.length - maximumLength);
  const paragraphBoundary = previousChunk.indexOf('\n\n', earliestStart);
  if (paragraphBoundary >= 0) {
    return {
      startsAtParagraphBoundary: true,
      text: previousChunk.slice(paragraphBoundary + 2).trim(),
    };
  }

  for (let index = earliestStart; index < previousChunk.length - 1; index += 1) {
    if (/[.!?]/.test(previousChunk.charAt(index)) && /\s/.test(previousChunk.charAt(index + 1))) {
      return {
        startsAtParagraphBoundary: false,
        text: previousChunk.slice(index + 1).trim(),
      };
    }
  }

  for (let index = earliestStart; index < previousChunk.length; index += 1) {
    if (/\s/.test(previousChunk.charAt(index))) {
      return {
        startsAtParagraphBoundary: false,
        text: previousChunk.slice(index + 1).trim(),
      };
    }
  }

  return {
    startsAtParagraphBoundary: false,
    text: previousChunk.slice(earliestStart).trim(),
  };
}

export function validateChunkingOptions(options: ChunkingOptions): void {
  const values = [options.targetSize, options.maximumSize, options.overlapSize];
  if (!values.every((value) => Number.isFinite(value) && Number.isInteger(value))) {
    throw new RangeError('Chunking options must be finite integers.');
  }

  if (options.targetSize < 100) {
    throw new RangeError('Chunk target size must be at least 100 characters.');
  }

  if (options.maximumSize < options.targetSize) {
    throw new RangeError('Chunk maximum size must be at least the target size.');
  }

  if (options.overlapSize < 0 || options.overlapSize >= options.targetSize) {
    throw new RangeError('Chunk overlap must be non-negative and smaller than the target size.');
  }
}

export function chunkText(
  text: string,
  options: ChunkingOptions = DEFAULT_CHUNKING_OPTIONS,
): TextChunkDraft[] {
  validateChunkingOptions(options);
  const baseChunks = createBaseChunks(text.trim(), options);

  return baseChunks.map((baseChunk, position) => {
    if (position === 0) {
      return { position, text: baseChunk, characterCount: baseChunk.length };
    }

    const availableForOverlap = options.maximumSize - baseChunk.length - 2;
    const overlap = selectOverlap(
      baseChunks[position - 1],
      Math.min(options.overlapSize, Math.max(0, availableForOverlap)),
    );
    const separator = overlap.startsAtParagraphBoundary ? '\n\n' : ' ';
    const textWithOverlap = overlap.text ? `${overlap.text}${separator}${baseChunk}` : baseChunk;

    return {
      position,
      text: textWithOverlap,
      characterCount: textWithOverlap.length,
    };
  });
}
