import { render, waitFor, cleanup } from '@testing-library/react';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import React from 'react';

// Mock react-konva components as simple divs so we can inspect output
vi.mock('react-konva', () => {
  const React = require('react');
  const make = (type: string) => {
    return ({ children, ...props }: any) => {
      const dataProps: Record<string, any> = { 'data-konva-type': type };
      if (props.fill) dataProps['data-fill'] = props.fill;
      return React.createElement('div', dataProps, children);
    };
  };
  return {
    Stage: make('Stage'),
    Layer: make('Layer'),
    Rect: make('Rect'),
    Line: make('Line'),
    Circle: make('Circle'),
    Group: make('Group'),
  };
});

vi.mock('konva', () => ({
  default: {
    Animation: class {
      start() {}
      stop() {}
    },
  },
}));

import { LatentGrid } from '../public/LatentGrid';

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe('LatentGrid cachedCells', () => {
  it('initializes from storage and updates when markCellCached is called', async () => {
    const stored = [
      [true, false, false],
      [false, false, false],
      [false, false, true],
    ];
    localStorage.setItem('cachedCells', JSON.stringify(stored));

    const { container } = render(
      <LatentGrid gridSize={3} totalWidth={300} totalHeight={300} />
    );

    await waitFor(() =>
      expect(typeof (window as any).markCellCached).toBe('function')
    );

    let rects = container.querySelectorAll(
      'div[data-konva-type="Rect"][data-fill="rgba(255,255,255,0.12)"]'
    );
    expect(rects.length).toBe(2);

    (window as any).markCellCached(0, 1);

    await waitFor(() => {
      rects = container.querySelectorAll(
        'div[data-konva-type="Rect"][data-fill="rgba(255,255,255,0.12)"]'
      );
      expect(rects.length).toBe(3);
    });

    const saved = JSON.parse(localStorage.getItem('cachedCells') as string);
    expect(saved[0][1]).toBe(true);
  });
});
