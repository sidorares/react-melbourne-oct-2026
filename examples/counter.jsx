import React, { useState } from 'react';
import { createRoot } from 'react-x11';

function Counter() {
  const [n, setN] = useState(0);
  return (
    <window title="counter"
      width={300} height={180}>
      <box style={s.center}>
        <text style={s.big}>{n}</text>
        <box style={s.button}
          onClick={() => setN(n + 1)}>
          <text style={s.label}>+1</text>
        </box>
      </box>
    </window>
  );
}

const s = {
  center: { flexGrow: 1, gap: 16,
    alignItems: 'center', justifyContent: 'center' },
  big: { fontSize: 40 },
  label: { color: 'white', fontSize: 18 },
  button: {
    backgroundColor: '#2563eb', borderRadius: 8, padding: 12,
    ':hover': { backgroundColor: '#1d4ed8' },
    ':active': { backgroundColor: '#1e3a8a' },
  },
};

const root = await createRoot();
root.render(<Counter />);
