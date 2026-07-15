import type { CSSProperties, HTMLAttributes } from 'react';

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  height?: CSSProperties['height'];
  width?: CSSProperties['width'];
}

export function Skeleton({ className, height, style, width, ...props }: SkeletonProps) {
  return (
    <div className={className} aria-hidden="true" {...props}>
      <span className="ui-skeleton" aria-hidden="true" style={{ ...style, height, width }} />
    </div>
  );
}
