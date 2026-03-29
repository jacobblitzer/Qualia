import React, { useState, useCallback } from 'react';

interface DropZoneProps {
  onDrop: (content: string, filename: string) => void;
}

export function DropZone({ onDrop }: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (!file) return;

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext === 'json' || ext === 'csv' || ext === 'canvas') {
      file.text().then(text => onDrop(text, file.name));
    }
  }, [onDrop]);

  return (
    <div
      className={`qualia-dropzone ${isDragging ? 'active' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className="qualia-dropzone-overlay">
          <span>Drop JSON / CSV / .canvas to load graph</span>
        </div>
      )}
    </div>
  );
}
