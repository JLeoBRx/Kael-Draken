/**
 * Ornamentos editoriais: filetes dourados com a Chama ao centro, à maneira
 * dos divisores de um livro antigo. São decorativos (aria-hidden).
 */

export function Fleuron({ className = '', align = 'center' }: { className?: string; align?: 'center' | 'start' }) {
  return (
    <div className={`fleuron fleuron--${align} ${className}`.trim()} aria-hidden="true">
      <span className="fleuron__line" />
      <svg className="fleuron__mark" viewBox="0 0 64 16" fill="none">
        <path d="M6 8h12M46 8h12" stroke="currentColor" strokeWidth="0.8" />
        <path d="M21 8 23.5 5.5 26 8 23.5 10.5Z" stroke="currentColor" strokeWidth="0.9" />
        <path d="M38 8 40.5 5.5 43 8 40.5 10.5Z" stroke="currentColor" strokeWidth="0.9" />
        <path d="M32 1.6c1 2.2 3.4 3.8 3.4 6.8a3.4 3.4 0 0 1-6.8 0c0-1.6.8-2.5 1.6-3.3.1 1 .5 1.6 1.2 1.9 0-1.9.2-3.7.6-5.4Z" fill="currentColor" />
        <circle cx="2.5" cy="8" r="1" fill="currentColor" />
        <circle cx="61.5" cy="8" r="1" fill="currentColor" />
      </svg>
      <span className="fleuron__line" />
    </div>
  )
}
