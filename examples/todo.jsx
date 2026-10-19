import React, { useState } from 'react';
import { createRoot } from 'react-x11';

function Todo() {
  const [items, setItems] =
    useState(['Try react-x11']);
  const [draft, setDraft] = useState('');
  const add = () => {
    if (!draft.trim()) return;
    setItems([...items, draft]);
    setDraft('');
  };
  return (
    <window title="todo" width={360} height={300}>
      <box style={{ flexGrow: 1, padding: 16, gap: 10 }}>
        <textinput value={draft} onSubmit={add}
          placeholder="What next? Press Enter"
          onChange={(ev) => setDraft(ev.value)}
          style={{ padding: 8, borderRadius: 6,
                   borderWidth: 1, borderColor: '#888' }} />
        {items.map((item, i) => <text key={i}>• {item}</text>)}
      </box>
    </window>
  );
}

const root = await createRoot();
root.render(<Todo />);
