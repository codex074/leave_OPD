import { useRegisterSW } from 'virtual:pwa-register/react';

function ReloadPrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, r) {
      if (r) {
        setInterval(() => r.update(), 60 * 60 * 1000);
      }
    },
  });

  if (!needRefresh) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 flex justify-center">
      <div className="bg-white rounded-xl shadow-2xl border border-violet-200 p-4 flex items-center gap-3 max-w-sm w-full">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-800">มีเวอร์ชันใหม่</p>
          <p className="text-xs text-gray-500">กดอัปเดตเพื่อใช้งานเวอร์ชันล่าสุด</p>
        </div>
        <button
          onClick={() => updateServiceWorker(true)}
          className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 transition-colors"
        >
          อัปเดต
        </button>
        <button
          onClick={() => setNeedRefresh(false)}
          className="p-1 text-gray-400 hover:text-gray-600"
          aria-label="ปิด"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default ReloadPrompt;
