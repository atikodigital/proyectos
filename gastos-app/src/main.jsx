import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import GastosApp from './gastos/GastosApp.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <GastosApp />
  </StrictMode>
);
