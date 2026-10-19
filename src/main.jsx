import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/400-italic.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-sans/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/600.css';
import './deck/deck.css';
import './components/components.css';

import { createRoot } from 'react-dom/client';
import { Deck } from './deck/Deck.jsx';
import { sections } from './slides/index.js';

createRoot(document.getElementById('root')).render(<Deck sections={sections} />);
