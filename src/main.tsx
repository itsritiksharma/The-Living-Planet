import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { WEBSOCKET_PATH } from './contracts/protocol';
import { App } from './ui/App';
import { GameClient } from './ui/client/GameClient';
import { ReflectionJournal } from './ui/client/ReflectionJournal';
import { SessionStore } from './ui/client/SessionStore';
import { browserSessionStorage } from './ui/client/storage';
import './ui/styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

const storage = browserSessionStorage();
const client = new GameClient({
  url: `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}${WEBSOCKET_PATH}`,
  createSocket: (url) => new WebSocket(url),
  sessions: new SessionStore(storage),
});

createRoot(root).render(
  <StrictMode>
    <App client={client} journal={new ReflectionJournal(storage)} />
  </StrictMode>,
);
