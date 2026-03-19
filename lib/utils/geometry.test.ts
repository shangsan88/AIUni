import { getElementPercentageGeometry, findElementGeometry, findNearestCorner } from './geometry';
import { describe, it, expect } from 'vitest';

describe('geometry utilities', () => {
  describe('getElementPercentageGeometry', () => {
    it('calculates percentage geometry correctly', () => {
      const element = {
        id: '1',
        left: 100,
        top: 56.25, // 10% of height (1000 * 0.5625)
        width: 200,
        height: 112.5,
      } as Parameters<typeof getElementPercentageGeometry>[0];

      const result = getElementPercentageGeometry(element, 1000);

      expect(result).not.toBeNull();

      if (result) {
        expect(result.x).toBeCloseTo(10);
        expect(result.y).toBeCloseTo(10);
        expect(result.w).toBeCloseTo(20);
        expect(result.h).toBeCloseTo(20);
        expect(result.centerX).toBeCloseTo(20);
        expect(result.centerY).toBeCloseTo(20);
      }
    });

    it('returns null for elements without layout properties', () => {
      const element = {
        id: '1',
      } as Parameters<typeof getElementPercentageGeometry>[0];

      const result = getElementPercentageGeometry(element);

      expect(result).toBeNull();
    });
  });

  describe('findElementGeometry', () => {
    it('finds geometry from scene (old format)', () => {
      const scene = {
        type: 'slide',
        elements: [
          {
            id: 'test',
            left: 100,
            top: 56.25,
            width: 200,
            height: 112.5,
          },
        ],
      };

      const result = findElementGeometry(scene, 'test', 1000);

      expect(result).not.toBeNull();

      if (result) {
        expect(result.x).toBeCloseTo(10);
        expect(result.y).toBeCloseTo(10);
      }
    });

    it('returns null if element not found', () => {
      const scene = {
        type: 'slide',
        elements: [],
      };

      const result = findElementGeometry(scene, 'missing');

      expect(result).toBeNull();
    });
  });

  describe('findNearestCorner', () => {
    it('returns top-left for element near (0,0)', () => {
      const geometry = {
        x: 0,
        y: 0,
        w: 10,
        h: 10,
        centerX: 5,
        centerY: 5,
      };

      const result = findNearestCorner(geometry);

      expect(result).toEqual({ x: 0, y: 0 });
    });

    it('returns bottom-right for element near (100,100)', () => {
      const geometry = {
        x: 90,
        y: 90,
        w: 10,
        h: 10,
        centerX: 95,
        centerY: 95,
      };

      const result = findNearestCorner(geometry);

      expect(result).toEqual({ x: 100, y: 100 });
    });
  });
});
