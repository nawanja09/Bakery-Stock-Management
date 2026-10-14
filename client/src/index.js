import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './styles/pages/report-filter-ui.css';
import App from './App';
import {PopupProvider} from './components/context/PopupContext';
import { ConfirmProvider } from './components/common/ui';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
      <PopupProvider>
          <ConfirmProvider>
              <App />
          </ConfirmProvider>
      </PopupProvider>
  </React.StrictMode>
);