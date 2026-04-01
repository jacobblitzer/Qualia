import React, { useState } from 'react';

interface CollapsibleSectionProps {
  title: string;
  defaultOpen?: boolean;
  enabled?: boolean;
  onToggleEnabled?: (enabled: boolean) => void;
  children: React.ReactNode;
}

export function CollapsibleSection({
  title,
  defaultOpen = false,
  enabled,
  onToggleEnabled,
  children,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={`collapsible-section ${open ? 'open' : ''} ${enabled === false ? 'disabled' : ''}`}>
      <div className="collapsible-header" onClick={() => setOpen(v => !v)}>
        <span className={`collapsible-arrow ${open ? 'open' : ''}`}>&#9654;</span>
        <span className="collapsible-title">{title}</span>
        {onToggleEnabled !== undefined && (
          <input
            type="checkbox"
            className="collapsible-toggle"
            checked={enabled ?? true}
            onChange={(e) => {
              e.stopPropagation();
              onToggleEnabled(e.target.checked);
            }}
            onClick={(e) => e.stopPropagation()}
          />
        )}
      </div>
      {open && (
        <div className="collapsible-body">
          {children}
        </div>
      )}
    </div>
  );
}
