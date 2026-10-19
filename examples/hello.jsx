import React from 'react';
import { createRoot } from 'react-x11';

function App() {
  return (
    <window title="hello" width={360} height={180}>
      <box style={{ flexGrow: 1,
        alignItems: 'center', justifyContent: 'center' }}>
        <text style={{ fontSize: 24 }}>hello from react-x11</text>
      </box>
    </window>
  );
}

const root = await createRoot();
root.render(<App />);
