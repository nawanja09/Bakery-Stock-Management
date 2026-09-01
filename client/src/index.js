import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './css/theme.css';
import App from './App';
import {PopupProvider} from './components/context/PopupContext';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
      <PopupProvider>
          <App />
      </PopupProvider>
  </React.StrictMode>
);