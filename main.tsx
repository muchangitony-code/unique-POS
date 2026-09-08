import { createRoot } from 'react-dom/client';

import App from './App';

import './index.css';

if (import.meta.env.PROD) {
  document.documentElement.dataset.uniquePosBuild = 'pos-sale-route-canonical';
}

createRoot(document.getElementById('root')!).render(<App />);
