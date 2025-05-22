import React from 'react';
import { createRoot } from 'react-dom/client';

import { LatentGrid } from './LatentGrid';

const rootElem = document.getElementById('app');
if (!rootElem) throw new Error('#app not found');

createRoot(rootElem).render(
  <LatentGrid
    gridSize={3}
    totalWidth={360}
    totalHeight={360}
    onLatentChange={(r, c) => console.log(`cell enter: (${r}, ${c})`)}
  />
);
