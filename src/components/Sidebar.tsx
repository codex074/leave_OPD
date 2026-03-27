import React from 'react';
import { TabName } from '../types';

interface SidebarProps {
  isOpen: boolean;
  activeTab: TabName;
  onTabChange: (tab: TabName) => void;
  onClose: () => void;
  onBackup: () => void;
}

const menuItems: { id: TabName; icon: string; title: string; desc: string; color: string }[] = [
  { id: 'hourly', icon: '⏰', title: 'แจ้งลาชั่วโมง', desc: 'จัดการการลาและใช้ชั่วโมง', color: 'hover:bg-blue-50 hover:border-blue-300' },
  { id: 'leave', icon: '📢', title: 'แจ้งลา/ลาล่วงหน้า', desc: 'ยื่นคำขอลาประเภทต่างๆ', color: 'hover:bg-orange-50 hover:border-orange-300' },
  { id: 'calendar', icon: '📅', title: 'ปฏิทินแจ้งลา', desc: 'ดูปฏิทินการลาทั้งหมด', color: 'hover:bg-purple-50 hover:border-purple-300' },
  { id: 'register', icon: '👤', title: 'ลงทะเบียน', desc: 'ลงทะเบียนผู้ใช้ใหม่', color: 'hover:bg-green-50 hover:border-green-300' },
  { id: 'pin', icon: '🔑', title: 'จัดการ PIN', desc: 'ตั้งค่ารหัส PIN', color: 'hover:bg-yellow-50 hover:border-yellow-300' },
  { id: 'admin-dashboard', icon: '👑', title: 'Admin Dashboard', desc: 'สรุปภาพรวมและจัดการ', color: 'hover:bg-gray-50 hover:border-gray-300' },
];

const Sidebar: React.FC<SidebarProps> = ({ isOpen, activeTab, onTabChange, onClose, onBackup }) => {
  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-30"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <nav
        className={`fixed left-0 top-0 h-full w-[min(320px,100vw)] bg-white shadow-2xl z-40 transform transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-6 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-xl font-bold text-gray-800">ระบบลา OPD</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
            <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-4 space-y-2 overflow-y-auto h-[calc(100%-80px)]">
          {menuItems.map(item => (
            <button
              key={item.id}
              onClick={() => { onTabChange(item.id); onClose(); }}
              className={`w-full text-left bg-white rounded-xl p-4 shadow-sm border-2 transition-all duration-200 ${item.color} ${
                activeTab === item.id
                  ? 'border-purple-500 bg-purple-50'
                  : 'border-transparent'
              }`}
            >
              <div className="flex items-center">
                <div className="text-3xl mr-4">{item.icon}</div>
                <div>
                  <h3 className={`text-lg font-semibold ${activeTab === item.id ? 'text-purple-700' : 'text-gray-800'}`}>
                    {item.title}
                  </h3>
                  <p className="text-sm text-gray-500">{item.desc}</p>
                </div>
              </div>
            </button>
          ))}

          {/* Backup button */}
          <button
            onClick={() => { onBackup(); onClose(); }}
            className="w-full text-left bg-white rounded-xl p-4 shadow-sm border-2 border-transparent hover:bg-green-50 hover:border-green-300 transition-all duration-200"
          >
            <div className="flex items-center">
              <div className="text-3xl mr-4">💾</div>
              <div>
                <h3 className="text-lg font-semibold text-gray-800">Backup ข้อมูล</h3>
                <p className="text-sm text-gray-500">ส่งออกข้อมูลเป็น excel หรือ json</p>
              </div>
            </div>
          </button>
        </div>
      </nav>
    </>
  );
};

export default Sidebar;
