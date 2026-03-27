import React, { useState, useRef, useEffect, useCallback } from 'react';

interface Option {
  value: string;
  label: string;
}

interface UserSelectProps {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  accentColor?: string; // e.g. 'blue' | 'orange'
  required?: boolean;
  id?: string;
}

const UserSelect: React.FC<UserSelectProps> = ({
  options,
  value,
  onChange,
  placeholder = '-- เลือกผู้ใช้ --',
  accentColor = 'blue',
  required = false,
  id,
}) => {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selectedOption = options.find(o => o.value === value);

  const filtered = query
    ? options.filter(o => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;

  // close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // scroll highlighted item into view
  useEffect(() => {
    if (open && listRef.current) {
      const item = listRef.current.children[highlighted] as HTMLElement;
      item?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlighted, open]);

  const selectOption = useCallback((opt: Option) => {
    onChange(opt.value);
    setQuery('');
    setOpen(false);
    setHighlighted(0);
  }, [onChange]);

  const clearSelection = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setQuery('');
    setHighlighted(0);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [onChange]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    setOpen(true);
    setHighlighted(0);
    if (value) onChange(''); // clear selection when typing
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setOpen(true);
        return;
      }
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlighted(h => Math.min(h + 1, filtered.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlighted(h => Math.max(h - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (filtered[highlighted]) selectOption(filtered[highlighted]);
        break;
      case 'Escape':
        setOpen(false);
        setQuery('');
        break;
      case 'Tab':
        setOpen(false);
        setQuery('');
        break;
    }
  };

  // accent ring/border color
  const ringColor = accentColor === 'orange'
    ? 'focus-within:border-orange-400 focus-within:ring-orange-200'
    : 'focus-within:border-blue-500 focus-within:ring-blue-200';

  const highlightColor = accentColor === 'orange'
    ? 'bg-orange-50 text-orange-700 font-semibold'
    : 'bg-blue-50 text-blue-700 font-semibold';

  const badgeColor = accentColor === 'orange'
    ? 'bg-orange-100 text-orange-700'
    : 'bg-blue-100 text-blue-700';

  // display text in input
  const inputDisplay = open ? query : (selectedOption ? selectedOption.label : query);

  return (
    <div ref={containerRef} className="relative" id={id}>
      {/* hidden input for form required validation */}
      {required && (
        <input
          type="text"
          required
          value={value}
          onChange={() => {}}
          className="absolute opacity-0 w-0 h-0 pointer-events-none"
          tabIndex={-1}
          aria-hidden="true"
        />
      )}

      {/* Main control */}
      <div
        className={`flex items-center min-h-[46px] w-full bg-white border-2 border-gray-300 rounded-xl px-3 py-1.5 gap-2 cursor-text transition-all duration-150 ring-2 ring-transparent ${ringColor}`}
        onClick={() => { setOpen(true); inputRef.current?.focus(); }}
      >
        {/* Selected badge or input */}
        {selectedOption && !open ? (
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-sm font-medium ${badgeColor} truncate`}>
              {selectedOption.label}
            </span>
          </div>
        ) : (
          <input
            ref={inputRef}
            type="text"
            value={inputDisplay}
            onChange={handleInputChange}
            onFocus={() => { setOpen(true); if (selectedOption) setQuery(''); }}
            onKeyDown={handleKeyDown}
            placeholder={selectedOption ? '' : placeholder}
            className="flex-1 min-w-0 bg-transparent outline-none text-sm text-gray-800 placeholder-gray-400"
            autoComplete="off"
            spellCheck={false}
          />
        )}

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          {value && (
            <button
              type="button"
              onClick={clearSelection}
              className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors text-xs font-bold"
              tabIndex={-1}
              title="ล้างค่า"
            >
              ✕
            </button>
          )}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setOpen(o => !o); inputRef.current?.focus(); }}
            className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors"
            tabIndex={-1}
          >
            <svg
              className={`w-4 h-4 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Dropdown */}
      {open && (
        <ul
          ref={listRef}
          className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-60 overflow-auto"
          role="listbox"
        >
          {filtered.length === 0 ? (
            <li className="px-4 py-3 text-sm text-gray-400 text-center">ไม่พบชื่อที่ค้นหา</li>
          ) : (
            filtered.map((opt, i) => (
              <li
                key={opt.value}
                role="option"
                aria-selected={opt.value === value}
                onMouseDown={(e) => { e.preventDefault(); selectOption(opt); }}
                onMouseEnter={() => setHighlighted(i)}
                className={`
                  px-4 py-2.5 text-sm cursor-pointer transition-colors
                  ${i === highlighted ? highlightColor : 'hover:bg-gray-50 text-gray-700'}
                  ${opt.value === value ? 'font-semibold' : ''}
                  ${i === 0 ? 'rounded-t-xl' : ''}
                  ${i === filtered.length - 1 ? 'rounded-b-xl' : 'border-b border-gray-50'}
                `}
              >
                {opt.value === value && (
                  <span className="mr-1.5 text-xs">✓</span>
                )}
                {opt.label}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
};

export default UserSelect;
