import React, { useState, useRef, useEffect } from 'react';
import { Stage, Layer, Rect, Line, Circle, Group } from 'react-konva';
import Konva from 'konva';

interface Props {
  gridSize?: number;           // default 10 (NxN)
  totalWidth?: number;         // default 1200, pixel width of the entire grid
  totalHeight?: number;        // default 1200, pixel height of the entire grid
  indicatorOpacity?: number;   // default 1.0, opacity of the drag indicator
  cornerColors?: [string, string, string, string]; // colors for top-left, top-right, bottom-right, bottom-left corners
  onCellEnter?: (row: number, col: number) => void;
  onLatentChange?: (row: number, col: number, x: number, y: number) => void; // callback for when latent position changes
}

/**
 * LatentGrid – simple interactive N×N grid that calls `onCellEnter` whenever
 * the pointer moves into a new cell.  Visually highlights the active cell
 * with a glow.  Performance-optimised for the tight pointermove loop – no
 * new object allocations inside the handler.
 */
export const LatentGrid: React.FC<Props> = ({
  gridSize = 10,
  totalWidth = 400,
  totalHeight = 400,
  indicatorOpacity = 1.0,
  cornerColors = ['#FF5733', '#33FF57', '#3357FF', '#F033FF'], // default colors for corners
  onCellEnter = () => {},
  onLatentChange = () => {}
}) => {
  const cellWidth = totalWidth / gridSize;
  const cellHeight = totalHeight / gridSize;
  const stageRef = useRef<Konva.Stage>(null);
  
  // Initial position at center of grid
  const initialRow = Math.floor(gridSize / 2);
  const initialCol = Math.floor(gridSize / 2);
  const initialX = (initialCol + 0.5) * cellWidth;
  const initialY = (initialRow + 0.5) * cellHeight;
  
  const [active, setActive] = useState<[number, number]>([initialRow, initialCol]);
  const [indicatorPos, setIndicatorPos] = useState({ x: initialX, y: initialY });
  const isDragging = useRef(false);

  // Convert stage coordinates → cell indices (row, col).  Returns the same
  // tuple instance to avoid allocations.
  const cell = [0, 0] as [number, number];
  const toCell = (x: number, y: number) => {
    cell[0] = Math.max(0, Math.min(gridSize - 1, (y / cellHeight) | 0));
    cell[1] = Math.max(0, Math.min(gridSize - 1, (x / cellWidth) | 0));
    return cell;
  };
  
  // Update active cell when indicator position changes
  useEffect(() => {
    const c = toCell(indicatorPos.x, indicatorPos.y);
    if (c[0] !== active[0] || c[1] !== active[1]) {
      setActive([c[0], c[1]]);
      // Pass normalized x and y relative to totalWidth and totalHeight
      onLatentChange(c[0], c[1], indicatorPos.x / totalWidth, indicatorPos.y / totalHeight);
    }
  }, [indicatorPos, active, cellWidth, cellHeight, gridSize, onLatentChange, totalWidth, totalHeight, toCell]); // Added toCell to dependencies

  const handleDragStart = () => {
    isDragging.current = true;
  };

  const handleDragMove = (e: Konva.KonvaEventObject<DragEvent>) => {
    // Get the attempted new position
    const pos = e.target.position();
    // Constrain movement to keep circle center within stage bounds
    const x = Math.max(0, Math.min(totalWidth, pos.x));
    const y = Math.max(0, Math.min(totalHeight, pos.y));
    // Force the position to stay within bounds
    e.target.position({ x, y });
    setIndicatorPos({ x, y });
  };

  const handleDragEnd = () => {
    isDragging.current = false;
  };

  return (
    <Stage
      ref={stageRef}
      width={totalWidth}
      height={totalHeight}
      style={{ touchAction: 'none' }}
    >
      {/* Corner gradient background */}
      <Layer listening={false}>
        <Rect
          width={totalWidth}
          height={totalHeight}
          fillLinearGradientStartPoint={{ x: 0, y: 0 }}
          fillLinearGradientEndPoint={{ x: totalWidth, y: 0 }}
          fillLinearGradientColorStops={[0, cornerColors[0], 1, cornerColors[1]]}
        />
        <Rect
          width={totalWidth}
          height={totalHeight}
          opacity={0.5}
          fillLinearGradientStartPoint={{ x: 0, y: 0 }}
          fillLinearGradientEndPoint={{ x: 0, y: totalHeight }}
          fillLinearGradientColorStops={[0, 'transparent', 1, cornerColors[3]]}
        />
        <Rect
          width={totalWidth}
          height={totalHeight}
          opacity={0.5}
          fillLinearGradientStartPoint={{ x: totalWidth, y: 0 }}
          fillLinearGradientEndPoint={{ x: totalWidth, y: totalHeight }}
          fillLinearGradientColorStops={[0, 'transparent', 1, cornerColors[2]]}
        />
      </Layer>

      {/* Grid lines incl. outer border */}
      <Layer listening={false}>
        {Array.from({ length: gridSize + 1 }, (_, i) => (
          <Line
            key={`v${i}`}
            points={[i * cellWidth, 0, i * cellWidth, totalHeight]}
            stroke="#777"
            strokeWidth={1}
          />
        ))}
        {Array.from({ length: gridSize + 1 }, (_, i) => (
          <Line
            key={`h${i}`}
            points={[0, i * cellHeight, totalWidth, i * cellHeight]}
            stroke="#777"
            strokeWidth={1}
          />
        ))}
        <Rect
          x={0}
          y={0}
          width={totalWidth}
          height={totalHeight}
          stroke="#009775"
          strokeWidth={2}
          cornerRadius={4}
        />
      </Layer>

      {/* Active cell glow */}
      <Layer listening={false}>
        <Rect
          x={active[1] * cellWidth}
          y={active[0] * cellHeight}
          width={cellWidth}
          height={cellHeight}
          stroke="#009775"
          strokeWidth={4}
          shadowBlur={6}
          shadowColor="#009775"
          shadowOpacity={0.6}
        />
      </Layer>

      {/* Draggable circle indicator */}
      <Layer>
        <Group
          x={indicatorPos.x}
          y={indicatorPos.y}
          draggable
          onDragStart={handleDragStart}
          onDragMove={handleDragMove}
          onDragEnd={handleDragEnd}
          opacity={indicatorOpacity} // Apply opacity here
        >
          <Circle
            radius={16}
            fill="#ffffff"
            stroke="#009775"
            strokeWidth={2}
            shadowColor="black"
            shadowBlur={4}
            shadowOpacity={0.4}
            shadowOffset={{ x: 2, y: 2 }}
          />
          {/* Grip lines */}
          <Line
            points={[-6, -2, 6, -2]}
            stroke="#009775"
            strokeWidth={2}
            lineCap="round"
          />
          <Line
            points={[-6, 2, 6, 2]}
            stroke="#009775"
            strokeWidth={2}
            lineCap="round"
          />
        </Group>
      </Layer>
    </Stage>
  );
};
