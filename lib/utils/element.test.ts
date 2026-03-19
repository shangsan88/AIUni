import { getLineElementLength, uniqAlignLines, getElementListRange } from './element';
import { describe, it, expect } from 'vitest';

describe('element utilities', () => {
  describe('getLineElementLength', () => {
    it('calculates correct line length', () => {
      const line = {
        start: [0, 0],
        end: [3, 4],
      } as Parameters<typeof getLineElementLength>[0];

      const result = getLineElementLength(line);

      expect(result).toBe(5);
    });
  });

  describe('uniqAlignLines', () => {
    it('merges lines with same value and expands range', () => {
      const lines = [
        { value: 10, range: [0, 5] },
        { value: 10, range: [3, 8] },
        { value: 20, range: [1, 2] },
      ] as Parameters<typeof uniqAlignLines>[0];

      const result = uniqAlignLines(lines);

      expect(result.length).toBe(2);

      const merged = result.find((l) => l.value === 10);
      expect(merged).toBeDefined();

      if (merged) {
        expect(merged.range).toEqual([0, 8]);
      }
    });
  });

  describe('getElementListRange', () => {
    it('returns correct bounding box for elements', () => {
      const elements = [
        {
          id: '1',
          type: 'shape',
          left: 0,
          top: 0,
          width: 100,
          height: 100,
        },
        {
          id: '2',
          type: 'shape',
          left: 100,
          top: 100,
          width: 50,
          height: 50,
        },
      ] as Parameters<typeof getElementListRange>[0];

      const result = getElementListRange(elements);

      expect(result.minX).toBe(0);
      expect(result.minY).toBe(0);
      expect(result.maxX).toBe(150);
      expect(result.maxY).toBe(150);
    });
  });
});
