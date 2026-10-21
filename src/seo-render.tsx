import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { Landing } from './features/public/Landing';

// Render the real public page at build time, without sessions or private data.
// The browser mounts the interactive application into this same root.
export function renderLanding() {
  return renderToString(<MemoryRouter initialEntries={['/']}><Landing /></MemoryRouter>);
}
