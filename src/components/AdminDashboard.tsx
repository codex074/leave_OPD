import React, { useState, useMemo } from 'react';
import Swal from 'sweetalert2';
import { User, Admin, HourlyRecord, LeaveRecord } from '../types';
import { approveHourlyRecord, approveLeaveRecord, deleteHourlyRecord, deleteLeaveRecord, batchApproveRecords } from '../hooks/useFirestore';
import { formatDateThaiShort, formatHoursAndMinutes, getCurrentFiscalYear, isApproved, calculateLeaveDays } from '../utils/dateUtils';
import PinModal from './PinModal';

interface AdminDashboardProps {
  users: User[];
  admins: Admin[];
  hourlyRecords: HourlyRecord[];
  leaveRecords: LeaveRecord[];
  holidays: Record<string, string>;
}

const leaveTypeColors: Record<string, string> = {
  'ลากิจ': 'bg-purple-100 text-purple-700',
  'ลาพักผ่อน': 'bg-green-100 text-green-700',
  'ลาป่วย': 'bg-red-100 text-red-700',
  'ลากิจฉุกเฉิน': 'bg-purple-100 text-purple-700',
  'ลาคลอด': 'bg-pink-100 text-pink-700',
};

const AdminDashboard: React.FC<AdminDashboardProps> = ({ users, admins, hourlyRecords, leaveRecords, holidays }) => {
  const [activeSection, setActiveSection] = useState<'pending' | 'today' | 'summary'>('pending');
  const [selectedFY, setSelectedFY] = useState<number>(getCurrentFiscalYear());
  const [filterPosition, setFilterPosition] = useState('');
  const [filterUser, setFilterUser] = useState('');
  const [selectedLeaveIds, setSelectedLeaveIds] = useState<Set<string>>(new Set());
  const [selectedHourlyIds, setSelectedHourlyIds] = useState<Set<string>>(new Set());
  const [approverFilter, setApproverFilter] = useState<string>('all');

  // Pagination state
  const PER_PAGE = 10;
  const [pendingLeavePage, setPendingLeavePage] = useState(0);
  const [pendingHourlyPage, setPendingHourlyPage] = useState(0);
  const [todayLeavePage, setTodayLeavePage] = useState(0);
  const [todayHourlyPage, setTodayHourlyPage] = useState(0);
  const [sumLeavePage, setSumLeavePage] = useState(0);
  const [sumHourlyPage, setSumHourlyPage] = useState(0);

  const [pinModal, setPinModal] = useState<{
    open: boolean; correctPin: string; title: string; summaryHtml: string; onSuccess: () => void;
  }>({ open: false, correctPin: '', title: '', summaryHtml: '', onSuccess: () => {} });

  function openPinModal(title: string, summaryHtml: string, correctPin: string, onSuccess: () => void) {
    setPinModal({ open: true, correctPin, title, summaryHtml, onSuccess });
  }

  function getAdminPin(adminUsername?: string): string {
    if (adminUsername) {
      return admins.find(a => a.username === adminUsername)?.pin ?? admins[0]?.pin ?? '';
    }
    return admins[0]?.pin ?? '';
  }

  const todayStr = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Bangkok' });

  const pendingLeave = useMemo(() =>
    leaveRecords
      .filter(r => !isApproved(r))
      .filter(r => approverFilter === 'all' || r.approver === approverFilter),
    [leaveRecords, approverFilter]
  );
  const pendingHourly = useMemo(() =>
    hourlyRecords
      .filter(r => !r.confirmed)
      .filter(r => approverFilter === 'all' || r.approver === approverFilter),
    [hourlyRecords, approverFilter]
  );
  const todayLeave = useMemo(() =>
    leaveRecords.filter(r => r.startDate <= todayStr && r.endDate >= todayStr),
    [leaveRecords, todayStr]
  );
  const todayHourly = useMemo(() =>
    hourlyRecords.filter(r => r.date === todayStr),
    [hourlyRecords, todayStr]
  );
  const fyLeave = useMemo(() => leaveRecords.filter(r => r.fiscalYear === selectedFY), [leaveRecords, selectedFY]);
  const fyHourly = useMemo(() => hourlyRecords.filter(r => r.fiscalYear === selectedFY), [hourlyRecords, selectedFY]);
  const filteredFYLeave = useMemo(() =>
    fyLeave.filter(r => {
      const user = users.find(u => u.nickname === r.userNickname);
      return (!filterPosition || user?.position === filterPosition) && (!filterUser || r.userNickname === filterUser);
    }),
    [fyLeave, filterPosition, filterUser, users]
  );

  const leaveTypeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredFYLeave.filter(r => isApproved(r)).forEach(r => {
      const days = calculateLeaveDays(r.startDate, r.endDate, r.startPeriod, r.endPeriod, holidays);
      counts[r.leaveType] = (counts[r.leaveType] || 0) + days;
    });
    return counts;
  }, [filteredFYLeave, holidays]);

  const uniqueNicknames = Array.from(new Set(leaveRecords.map(r => r.userNickname))).sort();
  const fiscalYears = Array.from(new Set([...leaveRecords.map(r => r.fiscalYear), ...hourlyRecords.map(r => r.fiscalYear)])).sort((a, b) => b - a);

  // ---------- approve/delete handlers ----------
  async function handleApproveLeave(record: LeaveRecord) {
    const { value: adminUsername } = await Swal.fire({
      title: 'เลือกผู้อนุมัติ',
      input: 'select',
      inputOptions: Object.fromEntries(admins.map(a => [a.username, a.username])),
      inputPlaceholder: 'เลือกชื่อผู้อนุมัติ',
      showCancelButton: true,
      confirmButtonText: 'ต่อไป',
      cancelButtonText: 'ยกเลิก',
      inputValidator: v => (!v ? 'กรุณาเลือกชื่อผู้อนุมัติ' : null),
    });
    if (!adminUsername) return;
    openPinModal(
      'ยืนยันการอนุมัติ',
      `<p class="text-center">อนุมัติการลาของ <b>${record.userNickname}</b></p><p class="text-center text-sm text-gray-500">${record.leaveType} | ${formatDateThaiShort(record.startDate)}</p>`,
      getAdminPin(adminUsername as string),
      async () => {
        setPinModal(p => ({ ...p, open: false }));
        try {
          await approveLeaveRecord(record.id);
          Swal.fire({ icon: 'success', title: 'อนุมัติสำเร็จ', timer: 1500, showConfirmButton: false });
        } catch { Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด' }); }
      }
    );
  }

  async function handleApproveHourly(record: HourlyRecord) {
    const { value: adminUsername } = await Swal.fire({
      title: 'เลือกผู้อนุมัติ',
      input: 'select',
      inputOptions: Object.fromEntries(admins.map(a => [a.username, a.username])),
      inputPlaceholder: 'เลือกชื่อผู้อนุมัติ',
      showCancelButton: true,
      confirmButtonText: 'ต่อไป',
      cancelButtonText: 'ยกเลิก',
      inputValidator: v => (!v ? 'กรุณาเลือกชื่อผู้อนุมัติ' : null),
    });
    if (!adminUsername) return;
    openPinModal(
      'ยืนยันการอนุมัติ',
      `<p class="text-center">อนุมัติชั่วโมงของ <b>${record.userNickname}</b></p><p class="text-center text-sm text-gray-500">${formatDateThaiShort(record.date)} | ${record.startTime}-${record.endTime}</p>`,
      getAdminPin(adminUsername as string),
      async () => {
        setPinModal(p => ({ ...p, open: false }));
        try {
          await approveHourlyRecord(record.id);
          Swal.fire({ icon: 'success', title: 'อนุมัติสำเร็จ', timer: 1500, showConfirmButton: false });
        } catch { Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด' }); }
      }
    );
  }

  async function handleDeleteLeave(record: LeaveRecord) {
    openPinModal(
      'ยืนยันการลบ',
      `<p class="text-center text-red-600">ลบรายการลาของ <b>${record.userNickname}</b>?</p>`,
      admins[0]?.pin ?? '',
      async () => {
        setPinModal(p => ({ ...p, open: false }));
        try {
          await deleteLeaveRecord(record.id);
          Swal.fire({ icon: 'success', title: 'ลบสำเร็จ', timer: 1500, showConfirmButton: false });
        } catch { Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด' }); }
      }
    );
  }

  async function handleDeleteHourly(record: HourlyRecord) {
    openPinModal(
      'ยืนยันการลบ',
      `<p class="text-center text-red-600">ลบรายการชั่วโมงของ <b>${record.userNickname}</b>?</p>`,
      admins[0]?.pin ?? '',
      async () => {
        setPinModal(p => ({ ...p, open: false }));
        try {
          await deleteHourlyRecord(record.id);
          Swal.fire({ icon: 'success', title: 'ลบสำเร็จ', timer: 1500, showConfirmButton: false });
        } catch { Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด' }); }
      }
    );
  }

  async function handleBatchApproveLeave() {
    if (selectedLeaveIds.size === 0) return;
    const { value: adminUsername } = await Swal.fire({
      title: `อนุมัติ ${selectedLeaveIds.size} รายการลา`,
      input: 'select',
      inputOptions: Object.fromEntries(admins.map(a => [a.username, a.username])),
      inputPlaceholder: 'เลือกชื่อผู้อนุมัติ',
      showCancelButton: true, confirmButtonText: 'ต่อไป', cancelButtonText: 'ยกเลิก',
      inputValidator: v => (!v ? 'กรุณาเลือกชื่อผู้อนุมัติ' : null),
    });
    if (!adminUsername) return;
    openPinModal(
      'ยืนยันการอนุมัติหลายรายการ',
      `<p class="text-center">อนุมัติ <b>${selectedLeaveIds.size} รายการลา</b></p>`,
      getAdminPin(adminUsername as string),
      async () => {
        setPinModal(p => ({ ...p, open: false }));
        Swal.fire({ title: 'กำลังอนุมัติ...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        try {
          await batchApproveRecords(Array.from(selectedLeaveIds).map(id => ({ id, type: 'leave' as const })));
          Swal.fire({ icon: 'success', title: `อนุมัติ ${selectedLeaveIds.size} รายการสำเร็จ` });
          setSelectedLeaveIds(new Set());
        } catch { Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด' }); }
      }
    );
  }

  async function handleBatchApproveHourly() {
    if (selectedHourlyIds.size === 0) return;
    const { value: adminUsername } = await Swal.fire({
      title: `อนุมัติ ${selectedHourlyIds.size} รายการชั่วโมง`,
      input: 'select',
      inputOptions: Object.fromEntries(admins.map(a => [a.username, a.username])),
      inputPlaceholder: 'เลือกชื่อผู้อนุมัติ',
      showCancelButton: true, confirmButtonText: 'ต่อไป', cancelButtonText: 'ยกเลิก',
      inputValidator: v => (!v ? 'กรุณาเลือกชื่อผู้อนุมัติ' : null),
    });
    if (!adminUsername) return;
    openPinModal(
      'ยืนยันการอนุมัติหลายรายการ',
      `<p class="text-center">อนุมัติ <b>${selectedHourlyIds.size} รายการชั่วโมง</b></p>`,
      getAdminPin(adminUsername as string),
      async () => {
        setPinModal(p => ({ ...p, open: false }));
        Swal.fire({ title: 'กำลังอนุมัติ...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        try {
          await batchApproveRecords(Array.from(selectedHourlyIds).map(id => ({ id, type: 'hourly' as const })));
          Swal.fire({ icon: 'success', title: `อนุมัติ ${selectedHourlyIds.size} รายการสำเร็จ` });
          setSelectedHourlyIds(new Set());
        } catch { Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด' }); }
      }
    );
  }

  // ---------- paginator ----------
  const Paginator = ({
    total, page, setPage, accent = 'indigo',
  }: { total: number; page: number; setPage: (p: number) => void; accent?: string }) => {
    const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
    const start = total === 0 ? 0 : page * PER_PAGE + 1;
    const end = Math.min((page + 1) * PER_PAGE, total);
    const btnBase = 'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border';
    const activeBtn = `bg-${accent}-600 text-white border-${accent}-600`;
    const disabledBtn = 'bg-gray-100 text-gray-300 border-gray-100 cursor-not-allowed';
    const normalBtn = 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50';
    return (
      <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-100 bg-gray-50">
        <button
          onClick={() => setPage(Math.max(0, page - 1))}
          disabled={page === 0}
          className={`${btnBase} ${page === 0 ? disabledBtn : normalBtn}`}
        >← ก่อนหน้า</button>
        <span className="text-xs text-gray-500">
          {total === 0 ? 'ไม่มีรายการ' : `${start}–${end} จาก ${total} (หน้า ${page + 1}/${totalPages})`}
        </span>
        <button
          onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
          disabled={page >= totalPages - 1}
          className={`${btnBase} ${page >= totalPages - 1 ? disabledBtn : normalBtn}`}
        >ถัดไป →</button>
      </div>
    );
  };

  // ---------- helpers ----------
  const positionBadge = (pos: string) => {
    const cls = pos === 'เภสัช' ? 'bg-blue-100 text-blue-700' : pos === 'จพง' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700';
    return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{pos}</span>;
  };

  // ---------- sub-components ----------
  const ApproveIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
  const DeleteIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );

  return (
    <div>
      <PinModal
        isOpen={pinModal.open}
        title={pinModal.title}
        summaryHtml={pinModal.summaryHtml}
        correctPin={pinModal.correctPin}
        onSuccess={pinModal.onSuccess}
        onCancel={() => setPinModal(p => ({ ...p, open: false }))}
      />

      {/* ===== STATS HEADER ===== */}
      <div className="bg-gradient-to-r from-gray-700 to-gray-900 rounded-2xl p-4 sm:p-6 text-white mb-6">
        <h1 className="text-xl sm:text-2xl font-bold font-kanit">👑 Admin Dashboard</h1>
        <p className="text-gray-300 text-sm mt-1">สรุปภาพรวมและจัดการระบบลา OPD</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
          <div className="bg-white/10 rounded-xl p-3 text-center">
            <div className="text-2xl font-bold">{users.length}</div>
            <div className="text-xs text-gray-300">ผู้ใช้ทั้งหมด</div>
          </div>
          <div className="bg-yellow-500/20 rounded-xl p-3 text-center">
            <div className="text-2xl font-bold text-yellow-300">{pendingLeave.length + pendingHourly.length}</div>
            <div className="text-xs text-gray-300">รอดำเนินการ</div>
          </div>
          <div className="bg-green-500/20 rounded-xl p-3 text-center">
            <div className="text-2xl font-bold text-green-300">{todayLeave.length + todayHourly.length}</div>
            <div className="text-xs text-gray-300">ลาวันนี้</div>
          </div>
          <div className="bg-blue-500/20 rounded-xl p-3 text-center">
            <div className="text-2xl font-bold text-blue-300">{leaveRecords.filter(r => r.fiscalYear === getCurrentFiscalYear()).length}</div>
            <div className="text-xs text-gray-300">ปีงบปัจจุบัน</div>
          </div>
        </div>
      </div>

      {/* ===== SECTION TABS ===== */}
      <div className="flex flex-wrap gap-2 mb-6">
        {[
          { id: 'pending', label: 'รอดำเนินการ', count: pendingLeave.length + pendingHourly.length, active: 'bg-yellow-500', badge: 'bg-yellow-600' },
          { id: 'today',   label: 'วันนี้',       count: todayLeave.length + todayHourly.length,   active: 'bg-green-500',  badge: 'bg-green-600' },
          { id: 'summary', label: 'สรุปประจำปี',  count: null,                                     active: 'bg-blue-500',   badge: '' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveSection(tab.id as 'pending' | 'today' | 'summary')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium text-sm transition-all ${
              activeSection === tab.id ? `${tab.active} text-white shadow-md` : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {tab.label}
            {tab.count !== null && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${activeSection === tab.id ? 'bg-white/25 text-white' : 'bg-gray-100 text-gray-600'}`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ===== PENDING SECTION — 2 COLUMNS ===== */}
      {activeSection === 'pending' && (
        <div className="space-y-4">

        {/* Admin Filter Bar */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 px-4 py-3 flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-gray-600 flex items-center gap-1.5">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            กรองตาม Admin:
          </span>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => { setApproverFilter('all'); setSelectedLeaveIds(new Set()); setSelectedHourlyIds(new Set()); }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all border ${
                approverFilter === 'all'
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              ทั้งหมด
              <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full font-bold ${approverFilter === 'all' ? 'bg-white/25 text-white' : 'bg-gray-100 text-gray-500'}`}>
                {leaveRecords.filter(r => !isApproved(r)).length + hourlyRecords.filter(r => !r.confirmed).length}
              </span>
            </button>
            {admins.map(admin => {
              const count =
                leaveRecords.filter(r => !isApproved(r) && r.approver === admin.username).length +
                hourlyRecords.filter(r => !r.confirmed && r.approver === admin.username).length;
              return (
                <button
                  key={admin.id}
                  onClick={() => { setApproverFilter(admin.username); setSelectedLeaveIds(new Set()); setSelectedHourlyIds(new Set()); }}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all border ${
                    approverFilter === admin.username
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                      : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {admin.username}
                  <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full font-bold ${approverFilter === admin.username ? 'bg-white/25 text-white' : count > 0 ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-400'}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
          {approverFilter !== 'all' && (
            <span className="ml-auto text-xs text-gray-400 flex items-center gap-1">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
              </svg>
              กำลังกรอง: <b className="text-indigo-600">{approverFilter}</b>
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          {/* ── Left: ลาปกติ ── */}
          <div className="bg-white rounded-xl shadow-md overflow-hidden flex flex-col">
            {/* card header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100" style={{ background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)' }}>
              <div className="flex items-center gap-2">
                <span className="text-xl">📢</span>
                <div>
                  <h3 className="text-base font-bold text-white">ลาปกติ (รอดำเนินการ)</h3>
                  <p className="text-orange-100 text-xs">ลากิจ · ลาพักผ่อน · ลาป่วย · ฯลฯ</p>
                </div>
              </div>
              <span className="bg-white/25 text-white text-sm font-bold px-3 py-1 rounded-full">{pendingLeave.length}</span>
            </div>

            {/* batch bar */}
            <div className="flex items-center gap-2 px-4 py-2 bg-orange-50 border-b border-orange-100">
              <input
                type="checkbox"
                className="h-5 w-5 rounded border-gray-300 accent-orange-500"
                checked={selectedLeaveIds.size === pendingLeave.length && pendingLeave.length > 0}
                onChange={e => setSelectedLeaveIds(e.target.checked ? new Set(pendingLeave.map(r => r.id)) : new Set())}
              />
              <span className="text-xs text-gray-500 flex-1">เลือกทั้งหมด</span>
              {selectedLeaveIds.size > 0 && (
                <>
                  <button
                    onClick={handleBatchApproveLeave}
                    className="inline-flex items-center gap-1 text-xs px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium transition-colors"
                  >
                    <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                    อนุมัติ {selectedLeaveIds.size} รายการ
                  </button>
                  <button onClick={() => setSelectedLeaveIds(new Set())} className="text-xs px-2 py-1.5 bg-gray-200 text-gray-600 rounded-lg hover:bg-gray-300 transition-colors">ยกเลิก</button>
                </>
              )}
            </div>

            {/* list */}
            <div className="flex-1">
              {pendingLeave.length === 0 ? (
                <div className="py-10 text-center text-gray-400 text-sm">
                  <div className="text-3xl mb-2">✅</div>
                  ไม่มีรายการรอดำเนินการ
                </div>
              ) : (
                pendingLeave.slice(pendingLeavePage * PER_PAGE, (pendingLeavePage + 1) * PER_PAGE).map(r => {
                  const user = users.find(u => u.nickname === r.userNickname);
                  const days = calculateLeaveDays(r.startDate, r.endDate, r.startPeriod, r.endPeriod, holidays);
                  return (
                    <div key={r.id} className="flex items-center px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <div className="mr-3 flex-shrink-0">
                        <input
                          type="checkbox"
                          className="h-5 w-5 rounded border-gray-300 accent-orange-500"
                          checked={selectedLeaveIds.has(r.id)}
                          onChange={() => setSelectedLeaveIds(prev => {
                            const next = new Set(prev);
                            next.has(r.id) ? next.delete(r.id) : next.add(r.id);
                            return next;
                          })}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800 truncate">
                          {user?.fullname ?? r.userNickname}
                          <span className="text-gray-400 font-normal"> ({r.userNickname})</span>
                          {user && <span className="ml-1">{positionBadge(user.position)}</span>}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${leaveTypeColors[r.leaveType] || 'bg-gray-100 text-gray-600'}`}>{r.leaveType}</span>
                          <span className="text-xs text-gray-500">{formatDateThaiShort(r.startDate)}{r.startDate !== r.endDate && ` – ${formatDateThaiShort(r.endDate)}`}</span>
                          <span className="text-xs text-gray-500">({days} วัน)</span>
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">ผู้อนุมัติ: {r.approver || '-'}</p>
                      </div>
                      <div className="flex-shrink-0 flex gap-1 ml-2">
                        <button onClick={() => handleApproveLeave(r)} className="p-2 rounded-full text-green-600 hover:bg-green-100 transition-colors" title="อนุมัติ"><ApproveIcon /></button>
                        <button onClick={() => handleDeleteLeave(r)} className="p-2 rounded-full text-red-500 hover:bg-red-100 transition-colors" title="ปฏิเสธ/ลบ"><DeleteIcon /></button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            <Paginator total={pendingLeave.length} page={pendingLeavePage} setPage={setPendingLeavePage} accent="orange" />
          </div>

          {/* ── Right: ลาชั่วโมง ── */}
          <div className="bg-white rounded-xl shadow-md overflow-hidden flex flex-col">
            {/* card header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100" style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #6d28d9 100%)' }}>
              <div className="flex items-center gap-2">
                <span className="text-xl">⏰</span>
                <div>
                  <h3 className="text-base font-bold text-white">ลาชั่วโมง (รอดำเนินการ)</h3>
                  <p className="text-indigo-200 text-xs">ลาชั่วโมง · ใช้ชั่วโมง</p>
                </div>
              </div>
              <span className="bg-white/25 text-white text-sm font-bold px-3 py-1 rounded-full">{pendingHourly.length}</span>
            </div>

            {/* batch bar */}
            <div className="flex items-center gap-2 px-4 py-2 bg-indigo-50 border-b border-indigo-100">
              <input
                type="checkbox"
                className="h-5 w-5 rounded border-gray-300 accent-indigo-500"
                checked={selectedHourlyIds.size === pendingHourly.length && pendingHourly.length > 0}
                onChange={e => setSelectedHourlyIds(e.target.checked ? new Set(pendingHourly.map(r => r.id)) : new Set())}
              />
              <span className="text-xs text-gray-500 flex-1">เลือกทั้งหมด</span>
              {selectedHourlyIds.size > 0 && (
                <>
                  <button
                    onClick={handleBatchApproveHourly}
                    className="inline-flex items-center gap-1 text-xs px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium transition-colors"
                  >
                    <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                    อนุมัติ {selectedHourlyIds.size} รายการ
                  </button>
                  <button onClick={() => setSelectedHourlyIds(new Set())} className="text-xs px-2 py-1.5 bg-gray-200 text-gray-600 rounded-lg hover:bg-gray-300 transition-colors">ยกเลิก</button>
                </>
              )}
            </div>

            {/* list */}
            <div className="flex-1">
              {pendingHourly.length === 0 ? (
                <div className="py-10 text-center text-gray-400 text-sm">
                  <div className="text-3xl mb-2">✅</div>
                  ไม่มีรายการรอดำเนินการ
                </div>
              ) : (
                pendingHourly.slice(pendingHourlyPage * PER_PAGE, (pendingHourlyPage + 1) * PER_PAGE).map(r => {
                  const user = users.find(u => u.nickname === r.userNickname);
                  const isLeave = r.type === 'leave';
                  return (
                    <div key={r.id} className="flex items-center px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <div className="mr-3 flex-shrink-0">
                        <input
                          type="checkbox"
                          className="h-5 w-5 rounded border-gray-300 accent-indigo-500"
                          checked={selectedHourlyIds.has(r.id)}
                          onChange={() => setSelectedHourlyIds(prev => {
                            const next = new Set(prev);
                            next.has(r.id) ? next.delete(r.id) : next.add(r.id);
                            return next;
                          })}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800 truncate">
                          {user?.fullname ?? r.userNickname}
                          <span className="text-gray-400 font-normal"> ({r.userNickname})</span>
                          {user && <span className="ml-1">{positionBadge(user.position)}</span>}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${isLeave ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                            {isLeave ? '🔴 ลาชั่วโมง' : '🟢 ใช้ชั่วโมง'}
                          </span>
                          <span className="text-xs text-gray-500">{formatDateThaiShort(r.date)}</span>
                          <span className="text-xs text-gray-500">{r.startTime} – {r.endTime}</span>
                          <span className="text-xs font-medium text-indigo-600">({formatHoursAndMinutes(r.duration)})</span>
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">ผู้อนุมัติ: {r.approver || '-'}{r.note ? ` · ${r.note}` : ''}</p>
                      </div>
                      <div className="flex-shrink-0 flex gap-1 ml-2">
                        <button onClick={() => handleApproveHourly(r)} className="p-2 rounded-full text-green-600 hover:bg-green-100 transition-colors" title="อนุมัติ"><ApproveIcon /></button>
                        <button onClick={() => handleDeleteHourly(r)} className="p-2 rounded-full text-red-500 hover:bg-red-100 transition-colors" title="ปฏิเสธ/ลบ"><DeleteIcon /></button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            <Paginator total={pendingHourly.length} page={pendingHourlyPage} setPage={setPendingHourlyPage} accent="indigo" />
          </div>
        </div>
        </div>
      )}

      {/* ===== TODAY SECTION — 2 COLUMNS ===== */}
      {activeSection === 'today' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          {/* Left: ลาปกติวันนี้ */}
          <div className="bg-white rounded-xl shadow-md overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b" style={{ background: 'linear-gradient(135deg, #059669 0%, #047857 100%)' }}>
              <div className="flex items-center gap-2">
                <span className="text-xl">📅</span>
                <div>
                  <h3 className="text-base font-bold text-white">ลาปกติวันนี้</h3>
                  <p className="text-emerald-100 text-xs">
                    {new Date().toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Bangkok' })}
                  </p>
                </div>
              </div>
              <span className="bg-white/25 text-white text-sm font-bold px-3 py-1 rounded-full">{todayLeave.length}</span>
            </div>
            <div>
              {todayLeave.length === 0 ? (
                <div className="py-10 text-center text-gray-400 text-sm">
                  <div className="text-3xl mb-2">🏖️</div>
                  ไม่มีการลาวันนี้
                </div>
              ) : (
                todayLeave.slice(todayLeavePage * PER_PAGE, (todayLeavePage + 1) * PER_PAGE).map(r => {
                  const user = users.find(u => u.nickname === r.userNickname);
                  const days = calculateLeaveDays(r.startDate, r.endDate, r.startPeriod, r.endPeriod, holidays);
                  return (
                    <div key={r.id} className="flex items-center px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800">
                          {user?.nickname ?? r.userNickname}
                          {user && <span className="ml-1">{positionBadge(user.position)}</span>}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${leaveTypeColors[r.leaveType] || 'bg-gray-100'}`}>{r.leaveType}</span>
                          <span className="text-xs text-gray-500">{r.startPeriod}</span>
                          <span className="text-xs text-gray-500">({days} วัน)</span>
                        </div>
                      </div>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium flex-shrink-0 ${isApproved(r) ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                        {isApproved(r) ? 'อนุมัติแล้ว' : 'รอดำเนินการ'}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
            <Paginator total={todayLeave.length} page={todayLeavePage} setPage={setTodayLeavePage} accent="green" />
          </div>

          {/* Right: ลาชั่วโมงวันนี้ */}
          <div className="bg-white rounded-xl shadow-md overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b" style={{ background: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)' }}>
              <div className="flex items-center gap-2">
                <span className="text-xl">⏱️</span>
                <div>
                  <h3 className="text-base font-bold text-white">ลาชั่วโมงวันนี้</h3>
                  <p className="text-sky-100 text-xs">
                    {new Date().toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Bangkok' })}
                  </p>
                </div>
              </div>
              <span className="bg-white/25 text-white text-sm font-bold px-3 py-1 rounded-full">{todayHourly.length}</span>
            </div>
            <div>
              {todayHourly.length === 0 ? (
                <div className="py-10 text-center text-gray-400 text-sm">
                  <div className="text-3xl mb-2">⏰</div>
                  ไม่มีรายการชั่วโมงวันนี้
                </div>
              ) : (
                todayHourly.slice(todayHourlyPage * PER_PAGE, (todayHourlyPage + 1) * PER_PAGE).map(r => {
                  const user = users.find(u => u.nickname === r.userNickname);
                  return (
                    <div key={r.id} className="flex items-center px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800">
                          {user?.nickname ?? r.userNickname}
                          {user && <span className="ml-1">{positionBadge(user.position)}</span>}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${r.type === 'leave' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                            {r.type === 'leave' ? '🔴 ลาชั่วโมง' : '🟢 ใช้ชั่วโมง'}
                          </span>
                          <span className="text-xs text-gray-500">{r.startTime} – {r.endTime}</span>
                          <span className="text-xs font-medium text-sky-600">({formatHoursAndMinutes(r.duration)})</span>
                        </div>
                        {r.note && <p className="text-xs text-gray-400 mt-0.5">{r.note}</p>}
                      </div>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium flex-shrink-0 ${r.confirmed ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                        {r.confirmed ? 'อนุมัติแล้ว' : 'รอดำเนินการ'}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
            <Paginator total={todayHourly.length} page={todayHourlyPage} setPage={setTodayHourlyPage} accent="indigo" />
          </div>
        </div>
      )}

      {/* ===== SUMMARY SECTION ===== */}
      {activeSection === 'summary' && (
        <div className="space-y-5">
          {/* Filters */}
          <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-100">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">ปีงบประมาณ</label>
                <select value={selectedFY} onChange={e => setSelectedFY(Number(e.target.value))} className="w-full p-2 border border-gray-200 rounded-lg text-sm">
                  {fiscalYears.map(fy => <option key={fy} value={fy}>ปีงบประมาณ {fy}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">ตำแหน่ง</label>
                <select value={filterPosition} onChange={e => setFilterPosition(e.target.value)} className="w-full p-2 border border-gray-200 rounded-lg text-sm">
                  <option value="">ทุกตำแหน่ง</option>
                  <option value="เภสัช">เภสัช</option>
                  <option value="จพง">จพง</option>
                  <option value="จนท">จนท</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">ชื่อผู้ใช้</label>
                <select value={filterUser} onChange={e => setFilterUser(e.target.value)} className="w-full p-2 border border-gray-200 rounded-lg text-sm">
                  <option value="">ทุกคน</option>
                  {uniqueNicknames.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Leave type summary cards */}
          <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
            {[
              { type: 'ลากิจ',       color: 'from-purple-400 to-purple-600' },
              { type: 'ลาพักผ่อน',  color: 'from-green-400 to-green-600' },
              { type: 'ลาป่วย',      color: 'from-red-400 to-red-600' },
              { type: 'ลากิจฉุกเฉิน', color: 'from-orange-400 to-orange-600' },
              { type: 'ลาคลอด',     color: 'from-pink-400 to-pink-600' },
            ].map(({ type, color }) => (
              <div key={type} className={`bg-gradient-to-br ${color} rounded-xl p-4 text-center text-white shadow`}>
                <div className="text-2xl font-bold">{leaveTypeCounts[type] || 0}</div>
                <div className="text-xs font-medium mt-1 opacity-90">{type}</div>
                <div className="text-xs opacity-70">วัน</div>
              </div>
            ))}
          </div>

          {/* Per-user leave summary */}
          {(() => {
            const sumLeaveUsers = users
              .filter(u => !filterPosition || u.position === filterPosition)
              .filter(u => !filterUser || u.nickname === filterUser);
            const pagedSumLeave = sumLeaveUsers.slice(sumLeavePage * PER_PAGE, (sumLeavePage + 1) * PER_PAGE);
            return (
              <div className="bg-white rounded-xl shadow-md overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100">
                  <h3 className="text-base font-bold text-gray-800">สรุปการลาแต่ละคน — ปีงบประมาณ {selectedFY}</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        {['ชื่อเล่น', 'ตำแหน่ง', 'ลากิจ', 'ลาพักผ่อน', 'ลาป่วย', 'ฉุกเฉิน', 'รวม (วัน)'].map(h => (
                          <th key={h} className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wide">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {pagedSumLeave.map(user => {
                        const ul = filteredFYLeave.filter(r => r.userNickname === user.nickname && isApproved(r));
                        const byType = (t: string) => ul.filter(r => r.leaveType === t).reduce((s, r) => s + calculateLeaveDays(r.startDate, r.endDate, r.startPeriod, r.endPeriod, holidays), 0);
                        const lk = byType('ลากิจ'), lp = byType('ลาพักผ่อน'), ly = byType('ลาป่วย'), le = byType('ลากิจฉุกเฉิน');
                        const total = lk + lp + ly + le + byType('ลาคลอด');
                        return (
                          <tr key={user.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm font-semibold text-indigo-600">{user.nickname}</td>
                            <td className="px-4 py-3 text-center">{positionBadge(user.position)}</td>
                            <td className="px-4 py-3 text-center text-sm">{lk || <span className="text-gray-300">—</span>}</td>
                            <td className="px-4 py-3 text-center text-sm">{lp || <span className="text-gray-300">—</span>}</td>
                            <td className="px-4 py-3 text-center text-sm">{ly || <span className="text-gray-300">—</span>}</td>
                            <td className="px-4 py-3 text-center text-sm">{le || <span className="text-gray-300">—</span>}</td>
                            <td className="px-4 py-3 text-center">
                              <span className={`px-2 py-1 rounded-full text-xs font-bold ${total > 0 ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-400'}`}>{total}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <Paginator total={sumLeaveUsers.length} page={sumLeavePage} setPage={setSumLeavePage} accent="orange" />
              </div>
            );
          })()}

          {/* Hourly summary per user */}
          {(() => {
            const sumHourlyUsers = users
              .filter(u => !filterPosition || u.position === filterPosition)
              .filter(u => !filterUser || u.nickname === filterUser);
            const pagedSumHourly = sumHourlyUsers.slice(sumHourlyPage * PER_PAGE, (sumHourlyPage + 1) * PER_PAGE);
            return (
              <div className="bg-white rounded-xl shadow-md overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100">
                  <h3 className="text-base font-bold text-gray-800">สรุปชั่วโมงลา/ชดเชย — ปีงบประมาณ {selectedFY}</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        {['ชื่อเล่น', 'ตำแหน่ง', 'ชั่วโมงลา', 'ชั่วโมงชดเชย', 'คงเหลือ'].map(h => (
                          <th key={h} className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wide">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {pagedSumHourly.map(user => {
                        const uh = fyHourly.filter(r => r.userNickname === user.nickname && r.confirmed);
                        const leaveH = uh.filter(r => r.type === 'leave').reduce((s, r) => s + r.duration, 0);
                        const useH  = uh.filter(r => r.type === 'use').reduce((s, r) => s + r.duration, 0);
                        const balance = useH - leaveH;
                        return (
                          <tr key={user.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm font-semibold text-indigo-600">{user.nickname}</td>
                            <td className="px-4 py-3 text-center">{positionBadge(user.position)}</td>
                            <td className="px-4 py-3 text-center text-sm text-red-600">{formatHoursAndMinutes(leaveH)}</td>
                            <td className="px-4 py-3 text-center text-sm text-green-600">{formatHoursAndMinutes(useH)}</td>
                            <td className="px-4 py-3 text-center">
                              <span className={`px-2 py-1 rounded-full text-xs font-bold ${balance >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                {balance >= 0 ? '+' : ''}{formatHoursAndMinutes(Math.abs(balance))}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <Paginator total={sumHourlyUsers.length} page={sumHourlyPage} setPage={setSumHourlyPage} accent="indigo" />
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
