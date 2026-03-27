import React, { useEffect, useRef, useState } from 'react';

interface PinModalProps {
  isOpen: boolean;
  title: string;
  subtitle?: string;
  summaryHtml?: string;
  correctPin: string;
  onSuccess: () => void;
  onCancel: () => void;
}

const PinModal: React.FC<PinModalProps> = ({
  isOpen,
  title,
  subtitle,
  summaryHtml,
  correctPin,
  onSuccess,
  onCancel,
}) => {
  const [pin, setPin] = useState('');
  const [status, setStatus] = useState<'idle' | 'error' | 'success'>('idle');
  const [shake, setShake] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setPin('');
      setStatus('idle');
      setShake(false);
      setTimeout(() => modalRef.current?.focus(), 100);
    }
  }, [isOpen]);

  useEffect(() => {
    if (pin.length === 4) {
      setTimeout(() => {
        if (pin === correctPin) {
          setStatus('success');
          setTimeout(() => {
            onSuccess();
            setPin('');
            setStatus('idle');
          }, 800);
        } else {
          setStatus('error');
          setShake(true);
          setTimeout(() => {
            setPin('');
            setStatus('idle');
            setShake(false);
          }, 1000);
        }
      }, 300);
    }
  }, [pin, correctPin, onSuccess]);

  const addDigit = (digit: string) => {
    if (pin.length < 4 && status !== 'success') {
      setPin(prev => prev + digit);
    }
  };

  const deleteDigit = () => {
    if (pin.length > 0 && status !== 'success') {
      setPin(prev => prev.slice(0, -1));
      setStatus('idle');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key >= '0' && e.key <= '9') addDigit(e.key);
    else if (e.key === 'Backspace') { e.preventDefault(); deleteDigit(); }
    else if (e.key === 'Escape') onCancel();
  };

  if (!isOpen) return null;

  const getDotStyle = (index: number): React.CSSProperties => {
    if (status === 'success') return { backgroundColor: '#10b981', borderColor: '#10b981', boxShadow: '0 0 20px rgba(16,185,129,0.5)' };
    if (status === 'error' && index < pin.length) return { backgroundColor: '#ef4444', borderColor: '#ef4444', boxShadow: '0 0 20px rgba(239,68,68,0.5)' };
    if (index < pin.length) return { backgroundColor: '#6366f1', borderColor: '#6366f1' };
    return { backgroundColor: 'white', borderColor: '#d1d5db' };
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div
        ref={modalRef}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-sm outline-none"
      >
        {summaryHtml && (
          <div
            className="text-left text-sm mb-6 p-4 bg-yellow-50 rounded-lg border border-yellow-200"
            dangerouslySetInnerHTML={{ __html: summaryHtml }}
          />
        )}
        {summaryHtml && <hr className="my-4" />}
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-800 mb-1">{title}</h1>
          {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
        </div>

        <div className={`flex justify-center space-x-4 mb-6 ${shake ? 'animate-bounce' : ''}`}>
          {[0, 1, 2, 3].map(i => (
            <div
              key={i}
              className="w-4 h-4 rounded-full border-2 transition-all duration-200"
              style={getDotStyle(i)}
            />
          ))}
        </div>

        <div className="text-center h-6 mb-4">
          {status === 'error' && <span className="text-sm text-red-600 font-medium">✗ PIN ไม่ถูกต้อง</span>}
          {status === 'success' && <span className="text-sm text-green-600 font-medium">✓ PIN ถูกต้อง!</span>}
          {status === 'idle' && <span className="text-sm text-gray-400">ใช้คีย์บอร์ดหรือแตะปุ่มด้านล่าง</span>}
        </div>

        <div className="grid grid-cols-3 gap-2 mb-4">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => (
            <button
              key={d}
              onClick={() => addDigit(String(d))}
              className="bg-gray-50 hover:bg-gray-100 border-2 border-gray-300 text-2xl font-semibold text-gray-800 w-20 h-20 rounded-full flex items-center justify-center mx-auto transition-colors"
            >
              {d}
            </button>
          ))}
          <button
            onClick={onCancel}
            className="bg-red-50 hover:bg-red-100 border-2 border-red-200 text-red-600 w-20 h-20 rounded-full flex items-center justify-center mx-auto transition-colors"
          >
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <button
            onClick={() => addDigit('0')}
            className="bg-gray-50 hover:bg-gray-100 border-2 border-gray-300 text-2xl font-semibold text-gray-800 w-20 h-20 rounded-full flex items-center justify-center mx-auto transition-colors"
          >
            0
          </button>
          <button
            onClick={deleteDigit}
            className="bg-red-50 hover:bg-red-100 border-2 border-red-200 text-red-600 w-20 h-20 rounded-full flex items-center justify-center mx-auto transition-colors"
          >
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l6.414 6.414a2 2 0 001.414.586H19a2 2 0 002-2V7a2 2 0 00-2-2h-8.172a2 2 0 00-1.414.586L3 12z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};

export default PinModal;
