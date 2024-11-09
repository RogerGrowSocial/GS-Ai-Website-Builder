import React from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import Sidebar from './components/Sidebar';
import DragCanvas from './components/DragCanvas';
import './App.css';

function App() {
  return (
    <DndProvider backend={HTML5Backend}>
      <div className="App">
        <Sidebar />
        <DragCanvas />
      </div>
    </DndProvider>
  );
}

export default App;
