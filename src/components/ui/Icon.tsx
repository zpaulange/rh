import type { CSSProperties } from 'react';

interface IconProps {
  name: string;
  className?: string;
  filled?: boolean;
  title?: string;
}

const FILLED: CSSProperties = { fontVariationSettings: "'FILL' 1" };

export default function Icon({ name, className = '', filled = false, title }: IconProps) {
  return (
    <span className={`material-symbols-outlined ${className}`} style={filled ? FILLED : undefined} title={title}>
      {name}
    </span>
  );
}
