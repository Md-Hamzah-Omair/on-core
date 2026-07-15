import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react';

export interface TooltipProps {
  children: ReactElement<{ 'aria-describedby'?: string }>;
  className?: string;
  content: ReactNode;
}

export function Tooltip({ children, className, content }: TooltipProps) {
  const id = useId();
  if (!isValidElement(children)) return children;
  const describedBy = [children.props['aria-describedby'], id].filter(Boolean).join(' ');

  return (
    <span className={['ui-tooltip-anchor', className].filter(Boolean).join(' ')}>
      {cloneElement(children, { 'aria-describedby': describedBy })}
      <span id={id} role="tooltip" className="ui-tooltip">{content}</span>
    </span>
  );
}
