import React, { useState } from 'react';
import { Button } from 'react-x11';

export default function App() {
  const [n, setN] = useState(0);
  return (
    <box style={{ padding: 24, gap: 12, alignItems: 'center' }}>
      <text style={{ fontSize: 24 }}>You clicked {n} times</text>
      <Button onPress={() => setN(n + 1)}>Click me</Button>
    </box>
  );
}
