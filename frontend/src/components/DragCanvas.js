import React from 'react';
import { useDrop } from 'react-dnd';

const DragCanvas = () => {
  // Gebruik de `useDrop` hook van react-dnd om te detecteren wanneer een item op het canvas wordt geplaatst
  const [{ isOver }, drop] = useDrop(() => ({
    accept: 'element',
    drop: () => ({ name: 'Canvas' }), // Actie wanneer een element wordt neergezet
    collect: (monitor) => ({
      isOver: !!monitor.isOver(), // Controleer of een item boven het canvas zweeft
    }),
  }));

  return (
    <div ref={drop} style={{
      width: '100%',
      height: '100vh',
      border: '1px solid black',
      backgroundColor: isOver ? 'lightgray' : 'white' // Verander kleur als iets boven canvas zweeft
    }}>
      {isOver ? 'Laat hier los om te plaatsen' : 'Sleep elementen hierheen'}
    </div>
  );
};

export default DragCanvas;
