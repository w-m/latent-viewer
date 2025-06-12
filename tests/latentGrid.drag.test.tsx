import React from 'react';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect } from 'vitest';

// Mock react-konva components to avoid canvas dependency issues in CI
vi.mock('react-konva', () => {
  const make = (type: string) => {
    return ({ children, ...props }: any) => {
      const dataProps: Record<string, any> = { 'data-konva-type': type };
      if (props.fill) dataProps['data-fill'] = props.fill;
      if (props.name) dataProps['data-name'] = props.name;

      // Use React.createElement directly since React is imported at the top
      return (React as any).createElement('div', dataProps, children);
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

// Mock Konva to provide the stage functionality the test needs
const mockIndicatorPosition = { x: 50, y: 50 };

vi.mock('konva', () => ({
  default: {
    stages: [
      {
        content: document.createElement('div'),
        findOne: (selector: string) => {
          if (selector === '.indicatorCore') {
            return {
              getAbsolutePosition: () => mockIndicatorPosition,
            };
          }
          return null;
        },
      },
    ],
    Animation: class {
      start() {}
      stop() {}
    },
  },
}));

import Konva from 'konva';
import { LatentGrid } from '../public/LatentGrid';

function getIndicatorPosition() {
  const stage = Konva.stages[0];
  const circle = stage.findOne('.indicatorCore');
  if (!circle) {
    throw new Error('Indicator circle not found');
  }
  return circle.getAbsolutePosition();
}

describe('LatentGrid drag clamping', () => {
  it('keeps handle inside grid and emits final debounced cell', async () => {
    const events: Array<[number, number]> = [];
    const onLatentChange = vi.fn((r: number, c: number) => {
      events.push([r, c]);
    });

    const user = userEvent.setup();
    render(
      <LatentGrid
        gridSize={4}
        totalWidth={100}
        totalHeight={100}
        onLatentChange={onLatentChange}
      />
    );

    const stage = Konva.stages[0];
    const canvas = stage.content;
    const start = getIndicatorPosition();

    // Start drag on the handle
    await user.pointer([
      {
        target: canvas,
        coords: { x: start.x, y: start.y },
        keys: '[MouseLeft>]',
      },
    ]);
    // Rapid moves beyond grid bounds
    await user.pointer([
      { coords: { x: 150, y: -50 } },
      { coords: { x: 200, y: 200 } },
      { coords: { x: -40, y: 120 } },
    ]);
    // Release pointer
    await user.pointer([{ keys: '[/MouseLeft]', coords: { x: 500, y: 500 } }]);

    const pos = getIndicatorPosition();
    expect(pos.x).toBeGreaterThanOrEqual(0);
    expect(pos.y).toBeGreaterThanOrEqual(0);
    expect(pos.x).toBeLessThanOrEqual(100);
    expect(pos.y).toBeLessThanOrEqual(100);

    const last = events[events.length - 1];
    const expectedCol = Math.min(3, Math.max(0, Math.floor(pos.x / 25)));
    const expectedRow = Math.min(3, Math.max(0, Math.floor(pos.y / 25)));
    expect(last).toEqual([expectedRow, expectedCol]);
  }, 10000);
});
