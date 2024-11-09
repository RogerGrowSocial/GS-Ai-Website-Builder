import React from 'react';
import { useDrag } from 'react-dnd';

// Definieer het Sidebar-item dat gebruikers kunnen slepen
const SidebarItem = ({ name }) => {
  const [{ isDragging }, drag] = useDrag(() => ({
    type: 'element', // Type element voor drag-and-drop herkenning
    item: { name }, // Item dat gesleept wordt
    collect: (monitor) => ({
      isDragging: !!monitor.isDragging(), // Controleer of het item gesleept wordt
    }),
  }));

  return (
    <div ref={drag} style={{
      opacity: isDragging ? 0.5 : 1,
      padding: '8px',
      margin: '8px',
      backgroundColor: '#EA5D0D',
      cursor: 'move'
    }}>
      {name}
    </div>
  );
};

const Sidebar = () => {
  return (
    <div style={{ width: '200px', padding: '10px', backgroundColor: '#FFFF' }}>
      <SidebarItem name="Tekst" />
      <SidebarItem name="Afbeelding" />
      <SidebarItem name="Knop" />
    </div>
  );
};

export default Sidebar;
