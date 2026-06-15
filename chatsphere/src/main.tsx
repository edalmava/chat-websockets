import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// StrictMode removido intencionalmente en este proyecto:
// En modo desarrollo monta los componentes DOS veces, lo que provoca
// que se abran dos conexiones WebSocket simultáneas para el mismo userId.
// El servidor detecta la sesión duplicada, cierra la primera (código 4002)
// y eso desencadena un bucle infinito de reconexiones.
createRoot(document.getElementById('root')!).render(
  <App />
);
