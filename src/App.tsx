import React, { useState, useEffect } from 'react';
import Swal from 'sweetalert2';
import { TabName } from './types';
import { useUsers, useAdmins, useHourlyRecords, useLeaveRecords } from './hooks/useFirestore';
import { exportAllDataToExcel, exportDataToJSON } from './utils/excelUtils';
import Sidebar from './components/Sidebar';
import HourlyLeave from './components/HourlyLeave';
import FullDayLeave from './components/FullDayLeave';
import CalendarView from './components/CalendarView';
import UserRegistration from './components/UserRegistration';
import PinManagement from './components/PinManagement';
import AdminDashboard from './components/AdminDashboard';
import holidaysJson from './holidays.json';

const holidays = holidaysJson as Record<string, string>;

function useCurrentDateTime() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabName>('hourly');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const { users, loading: usersLoading } = useUsers();
  const { admins } = useAdmins();
  const { records: hourlyRecords } = useHourlyRecords();
  const { records: leaveRecords } = useLeaveRecords();
  const now = useCurrentDateTime();

  const isLoading = usersLoading;

  const formatDateTimeThai = (date: Date) => {
    return date.toLocaleDateString('th-TH', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'Asia/Bangkok',
    }) + ' ' + date.toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok' });
  };

  async function handleBackup() {
    const { value: backupType } = await Swal.fire({
      title: 'Backup ข้อมูล',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Excel (.xlsx)',
      cancelButtonText: 'ยกเลิก',
      html: `
        <div class="space-y-3 text-left mt-4">
          <p class="text-sm text-gray-600">เลือกรูปแบบการ Backup:</p>
          <div class="space-y-2">
            <button id="btn-excel" class="w-full p-3 bg-green-50 border-2 border-green-300 rounded-xl text-left hover:bg-green-100">
              <span class="font-semibold text-green-700">📊 Excel (.xlsx)</span>
              <span class="block text-xs text-gray-500">ส่งออกทุกข้อมูลเป็นไฟล์ Excel หลายชีต</span>
            </button>
            <button id="btn-json-leave" class="w-full p-3 bg-blue-50 border-2 border-blue-300 rounded-xl text-left hover:bg-blue-100">
              <span class="font-semibold text-blue-700">📋 JSON (รายการลา)</span>
              <span class="block text-xs text-gray-500">ส่งออกข้อมูลการลาเป็นไฟล์ JSON</span>
            </button>
            <button id="btn-json-hourly" class="w-full p-3 bg-purple-50 border-2 border-purple-300 rounded-xl text-left hover:bg-purple-100">
              <span class="font-semibold text-purple-700">⏰ JSON (ชั่วโมงลา)</span>
              <span class="block text-xs text-gray-500">ส่งออกข้อมูลชั่วโมงลาเป็นไฟล์ JSON</span>
            </button>
          </div>
        </div>
      `,
      didOpen: () => {
        document.getElementById('btn-excel')?.addEventListener('click', () => Swal.clickConfirm());
        document.getElementById('btn-json-leave')?.addEventListener('click', () => {
          exportDataToJSON('leave', leaveRecords, hourlyRecords);
          Swal.close();
        });
        document.getElementById('btn-json-hourly')?.addEventListener('click', () => {
          exportDataToJSON('hourly', leaveRecords, hourlyRecords);
          Swal.close();
        });
      },
      showConfirmButton: false,
    });
    if (backupType !== undefined) {
      // Excel was selected via confirm
      exportAllDataToExcel(users, leaveRecords, hourlyRecords, holidays);
    }
  }

  // Separate handler for Excel confirm
  async function handleBackupClick() {
    const result = await Swal.fire({
      title: 'Backup ข้อมูล',
      icon: 'question',
      html: `
        <div class="space-y-3 text-left mt-2">
          <p class="text-sm text-gray-600 mb-3">เลือกรูปแบบการ Backup:</p>
          <div id="backup-options" class="space-y-2"></div>
        </div>
      `,
      showConfirmButton: false,
      showCancelButton: true,
      cancelButtonText: 'ยกเลิก',
      didOpen: () => {
        const container = document.getElementById('backup-options');
        if (!container) return;
        const options = [
          { label: '📊 Excel (.xlsx)', sub: 'ส่งออกทุกข้อมูลเป็นไฟล์ Excel', color: 'green', action: 'excel' },
          { label: '📋 JSON (รายการลา)', sub: 'ส่งออกข้อมูลการลาเป็น JSON', color: 'blue', action: 'leave' },
          { label: '⏰ JSON (ชั่วโมงลา)', sub: 'ส่งออกชั่วโมงลาเป็น JSON', color: 'purple', action: 'hourly' },
        ];
        options.forEach(opt => {
          const btn = document.createElement('button');
          btn.className = `w-full p-3 bg-${opt.color}-50 border-2 border-${opt.color}-300 rounded-xl text-left hover:bg-${opt.color}-100 transition-colors`;
          btn.innerHTML = `<span class="font-semibold text-${opt.color}-700 block">${opt.label}</span><span class="text-xs text-gray-500">${opt.sub}</span>`;
          btn.addEventListener('click', () => {
            Swal.close();
            if (opt.action === 'excel') {
              exportAllDataToExcel(users, leaveRecords, hourlyRecords, holidays);
            } else if (opt.action === 'leave') {
              exportDataToJSON('leave', leaveRecords, hourlyRecords);
            } else {
              exportDataToJSON('hourly', leaveRecords, hourlyRecords);
            }
          });
          container.appendChild(btn);
        });
      },
    });
    void result;
  }

  const tabTitle: Record<TabName, string> = {
    'hourly': 'แจ้งลาชั่วโมง',
    'leave': 'แจ้งลา/ลาล่วงหน้า',
    'calendar': 'ปฏิทินแจ้งลา',
    'register': 'ลงทะเบียน',
    'pin': 'จัดการ PIN',
    'admin-dashboard': 'Admin Dashboard',
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-gray-600 font-medium">กำลังโหลดข้อมูล...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 font-sarabun">
      <Sidebar
        isOpen={sidebarOpen}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onClose={() => setSidebarOpen(false)}
        onBackup={handleBackupClick}
      />

      {/* Header */}
      <header className="bg-gradient-to-r from-blue-700 to-indigo-800 text-white shadow-lg sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-lg hover:bg-white/10 transition-colors"
              aria-label="เมนู"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div>
              <h1 className="text-lg font-bold leading-tight">ระบบลา OPD</h1>
              <p className="text-blue-200 text-xs">โรงพยาบาลอุตรดิตถ์ — ฝ่ายเภสัชกรรม</p>
            </div>
          </div>
          <div className="text-right hidden sm:block">
            <div className="text-xs text-blue-200">{formatDateTimeThai(now)}</div>
          </div>
        </div>

        {/* Tab breadcrumb */}
        <div className="max-w-5xl mx-auto px-4 pb-2">
          <div className="text-sm text-blue-200">
            <span className="text-white font-medium">{tabTitle[activeTab]}</span>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-5xl mx-auto px-3 sm:px-4 py-3 sm:py-6">
        {activeTab === 'hourly' && (
          <HourlyLeave
            users={users}
            admins={admins}
            allHourlyRecords={hourlyRecords}
          />
        )}
        {activeTab === 'leave' && (
          <FullDayLeave
            users={users}
            admins={admins}
            allLeaveRecords={leaveRecords}
            holidays={holidays}
          />
        )}
        {activeTab === 'calendar' && (
          <CalendarView
            users={users}
            allLeaveRecords={leaveRecords}
            allHourlyRecords={hourlyRecords}
            holidays={holidays}
          />
        )}
        {activeTab === 'register' && (
          <UserRegistration users={users} />
        )}
        {activeTab === 'pin' && (
          <PinManagement users={users} admins={admins} />
        )}
        {activeTab === 'admin-dashboard' && (
          <AdminDashboard
            users={users}
            admins={admins}
            hourlyRecords={hourlyRecords}
            leaveRecords={leaveRecords}
            holidays={holidays}
          />
        )}
      </main>
    </div>
  );
};

export default App;
