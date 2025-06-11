import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useImperativeHandle,
  forwardRef,
} from 'react';
import { Stage, Layer, Rect, Line, Circle, Group } from 'react-konva';
import Konva from 'konva';

interface Props {
  gridSize?: number; // default 10 (NxN)
  totalWidth?: number; // default 1200, pixel width of the entire grid
  totalHeight?: number; // default 1200, pixel height of the entire grid
  indicatorOpacity?: number; // default 1.0, opacity of the drag indicator
  cornerColors?: [string, string, string, string]; // colors for top-left, top-right, bottom-right, bottom-left corners
  onCellEnter?: (row: number, col: number) => void;
  onLatentChange?: (row: number, col: number, x: number, y: number) => void; // callback for when latent position changes
  isLoading?: boolean; // highlight cell differently while loading
}

export interface LatentGridHandle {
  setActiveCell: (row: number, col: number) => void;
}

/**
 * LatentGrid – simple interactive N×N grid that calls `onCellEnter` whenever
 * the pointer moves into a new cell.  Visually highlights the active cell
 * with a glow.  Performance-optimised for the tight pointermove loop – no
 * new object allocations inside the handler.
 */
export const LatentGrid = forwardRef<LatentGridHandle, Props>(
  (
    {
      gridSize = 10,
      totalWidth = 400,
      totalHeight = 400,
      indicatorOpacity = 1.0,
      cornerColors = ['#FF5733', '#33FF57', '#3357FF', '#F033FF'],
      onCellEnter = () => {},
      onLatentChange = () => {},
      isLoading = false,
    },
    ref
  ) => {
    const cellWidth = totalWidth / gridSize;
    const cellHeight = totalHeight / gridSize;
    const stageRef = useRef<Konva.Stage>(null);

    // Track which cells have been loaded at least once
    const [cachedCells, setCachedCells] = useState<boolean[][]>(() => {
      const empty = Array.from({ length: gridSize }, () =>
        Array<boolean>(gridSize).fill(false)
      );
      try {
        const stored = localStorage.getItem('cachedCells');
        if (stored) {
          const arr = JSON.parse(stored);
          if (
            Array.isArray(arr) &&
            arr.length === gridSize &&
            arr.every(
              (row: any) => Array.isArray(row) && row.length === gridSize
            )
          ) {
            return arr.map((r: any[]) => r.map((v) => Boolean(v)));
          }
        }
      } catch {
        /* ignore malformed storage */
      }
      return empty;
    });

    const markCellCached = useCallback((row: number, col: number) => {
      setCachedCells((prev) => {
        if (prev[row][col]) return prev;
        const next = prev.map((r) => r.slice());
        next[row][col] = true;
        try {
          localStorage.setItem('cachedCells', JSON.stringify(next));
        } catch {
          /* ignore storage errors */
        }
        return next;
      });
    }, []);

    // Expose helper so main.ts can mark cells as cached
    useEffect(() => {
      (window as any).markCellCached = markCellCached;
      return () => {
        delete (window as any).markCellCached;
      };
    }, [markCellCached]);

    // Choose a random initial cell ensuring the drag indicator remains fully
    // visible (avoid the outermost cells so the 32-px diameter circle never
    // touches the border).  If the grid is smaller than 3×3 fall back to the
    // center cell.
    const safeMin = 1;
    const safeMax = gridSize - 2;

    const initialRow =
      gridSize > 2
        ? safeMin + Math.floor(Math.random() * (safeMax - safeMin + 1))
        : Math.floor(gridSize / 2);

    const initialCol =
      gridSize > 2
        ? safeMin + Math.floor(Math.random() * (safeMax - safeMin + 1))
        : Math.floor(gridSize / 2);
    const initialX = (initialCol + 0.5) * cellWidth;
    const initialY = (initialRow + 0.5) * cellHeight;

    const [active, setActive] = useState<[number, number]>([
      initialRow,
      initialCol,
    ]);
    const [indicatorPos, setIndicatorPos] = useState({
      x: initialX,
      y: initialY,
    });
    const isDragging = useRef(false);

    // Track whether the user has interacted with the handle.
    const [hasInteracted, setHasInteracted] = useState(false);
    const handleGroupRef = useRef<Konva.Group>(null);
    const circleRef = useRef<Konva.Circle>(null);

    const setActiveCell = useCallback(
      (row: number, col: number) => {
        const x = (col + 0.5) * cellWidth;
        const y = (row + 0.5) * cellHeight;
        setIndicatorPos({ x, y });
        setHasInteracted(true);
      },
      [cellWidth, cellHeight]
    );

    useImperativeHandle(ref, () => ({ setActiveCell }), [setActiveCell]);

    // Notify parent of the initially selected cell as soon as the component
    // mounts so the corresponding model can be loaded.
    useEffect(() => {
      onLatentChange(
        initialRow,
        initialCol,
        indicatorPos.x / totalWidth,
        indicatorPos.y / totalHeight
      );
      // We intentionally exclude dependencies to run exactly once on mount.
      // eslint-disable-next-line
    }, []);

    // Remove cell glow animation (obsolete)

    useEffect(() => {
      if (hasInteracted) return;

      const grp = handleGroupRef.current;
      if (!grp) return;

      const layer = grp.getLayer();
      if (!layer) return;

      const anim = new Konva.Animation((frame) => {
        const t = frame?.time ?? 0;
        const scale = 1 + 0.1 * Math.sin(t / 250);
        grp.scale({ x: scale, y: scale });
        grp.opacity(0.8 + 0.2 * Math.sin(t / 250));
      }, layer);

      anim.start();

      // Cleanup when the animation stops (first interaction or unmount).
      return () => {
        anim.stop();
        grp.scale({ x: 1, y: 1 });
        grp.opacity(indicatorOpacity);
      };
    }, [hasInteracted, indicatorOpacity]);

    // Loading outline animation (dashed stroke rotating)
    useEffect(() => {
      const circle = circleRef.current;
      if (!circle) return;

      let anim: Konva.Animation | null = null;

      if (isLoading) {
        // Enable dashed stroke
        circle.dash([6, 4]);
        circle.dashEnabled(true);

        const layer = circle.getLayer();
        if (layer) {
          anim = new Konva.Animation((frame) => {
            const dt = frame?.timeDiff ?? 0;
            // Dash offset increments producing rotation effect
            const offset = circle.dashOffset();
            circle.dashOffset(offset + dt * 0.1); // speed: 0.1 px per ms (~100 px/s)
          }, layer);
          anim.start();
        }
      } else {
        // Disable dashed stroke
        circle.dash([]);
        circle.dashOffset(0);
        circle.dashEnabled(false);
      }

      return () => {
        if (anim) anim.stop();
      };
    }, [isLoading]);

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
        onLatentChange(
          c[0],
          c[1],
          indicatorPos.x / totalWidth,
          indicatorPos.y / totalHeight
        );
      }
    }, [
      indicatorPos,
      active,
      cellWidth,
      cellHeight,
      gridSize,
      onLatentChange,
      totalWidth,
      totalHeight,
      toCell,
    ]); // Added toCell to dependencies

    const handleDragStart = () => {
      isDragging.current = true;
      if (!hasInteracted) {
        setHasInteracted(true);
      }
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
      if (!hasInteracted) {
        setHasInteracted(true);
      }
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
            fillLinearGradientColorStops={[
              0,
              cornerColors[0],
              1,
              cornerColors[1],
            ]}
          />
          <Rect
            width={totalWidth}
            height={totalHeight}
            opacity={0.5}
            fillLinearGradientStartPoint={{ x: 0, y: 0 }}
            fillLinearGradientEndPoint={{ x: 0, y: totalHeight }}
            fillLinearGradientColorStops={[
              0,
              'transparent',
              1,
              cornerColors[3],
            ]}
          />
          <Rect
            width={totalWidth}
            height={totalHeight}
            opacity={0.5}
            fillLinearGradientStartPoint={{ x: totalWidth, y: 0 }}
            fillLinearGradientEndPoint={{ x: totalWidth, y: totalHeight }}
            fillLinearGradientColorStops={[
              0,
              'transparent',
              1,
              cornerColors[2],
            ]}
          />
        </Layer>

        {/* Cached cell highlights */}
        <Layer listening={false}>
          {cachedCells.map((row, r) =>
            row.map(
              (cached, c) =>
                cached && (
                  <Rect
                    key={`${r}-${c}`}
                    x={c * cellWidth}
                    y={r * cellHeight}
                    width={cellWidth}
                    height={cellHeight}
                    fill="rgba(255,255,255,0.12)"
                  />
                )
            )
          )}
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

        {/* Active cell glow removed */}

        {/* Draggable circle indicator */}
        <Layer>
          <Group
            ref={handleGroupRef}
            x={indicatorPos.x}
            y={indicatorPos.y}
            draggable
            onDragStart={handleDragStart}
            onDragMove={handleDragMove}
            onDragEnd={handleDragEnd}
            opacity={indicatorOpacity}
          >
            <Circle
              ref={circleRef}
              name="indicatorCore"
              radius={16}
              fill="#ffffff"
              stroke={isLoading ? '#ffa500' : '#009775'}
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
  }
);
