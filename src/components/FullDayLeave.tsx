import React, { useState, useMemo } from 'react';
import Swal from 'sweetalert2';
import { User, Admin, LeaveRecord, Holidays } from '../types';
import {
  formatDateThaiShort,
  formatDateTimeThaiShort,
  calculateLeaveDays,
  getCurrentFiscalYear,
  toLocalISOStringInThailand,
  computeFiscalYearFromDateString,
  getLeaveTypeColor,
} from '../utils/dateUtils';
import { addLeaveRecord, deleteLeaveRecord, approveLeaveRecord } from '../hooks/useFirestore';
import { sendLeaveTelegramNotification } from '../utils/telegramUtils';
import PinModal from './PinModal';
import UserSelect from './UserSelect';

interface FullDayLeaveProps {
  users: User[];
  admins: Admin[];
  allLeaveRecords: LeaveRecord[];
  holidays: Holidays;
}

const LEAVE_TYPES = [
  { type: 'ลากิจ', color: 'purple' },
  { type: 'ลาพักผ่อน', color: 'green' },
  { type: 'ลาป่วย', color: 'red' },
  { type: 'ลากิจฉุกเฉิน', color: 'purple' },
  { type: 'ลาคลอด', color: 'pink' },
];

const COLOR_CLASSES: Record<string, string> = {
  purple: 'bg-purple-500 text-white border-purple-500',
  green: 'bg-green-500 text-white border-green-500',
  red: 'bg-red-500 text-white border-red-500',
  pink: 'bg-pink-500 text-white border-pink-500',
};

const PERIODS = ['เต็มวัน', 'ครึ่งวัน-เช้า', 'ครึ่งวัน-บ่าย'];
const RECORDS_PER_PAGE = 10;

const FullDayLeave: React.FC<FullDayLeaveProps> = ({ users, admins, allLeaveRecords, holidays }) => {
  const today = toLocalISOStringInThailand(new Date());

  const [selectedUser, setSelectedUser] = useState('');
  const [leaveType, setLeaveType] = useState('');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [startPeriod, setStartPeriod] = useState('เต็มวัน');
  const [endPeriod, setEndPeriod] = useState('เต็มวัน');
  const [approver, setApprover] = useState('');
  const [note, setNote] = useState('');

  const allFiscalYears = useMemo(() => {
    const fy = getCurrentFiscalYear();
    const years = new Set<number>([fy]);
    allLeaveRecords.forEach(r => {
      if (Number.isFinite(r.fiscalYear)) years.add(r.fiscalYear);
      else if (r.startDate) { const y = computeFiscalYearFromDateString(r.startDate); if (y) years.add(y); }
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [allLeaveRecords]);

  const [fiscalYear, setFiscalYear] = useState(() => getCurrentFiscalYear());
  const [summarySearch, setSummarySearch] = useState('');
  const [summaryPosition, setSummaryPosition] = useState('');
  const [recordsSearch, setRecordsSearch] = useState('');
  const [recordsPosition, setRecordsPosition] = useState('');
  const [recordsStart, setRecordsStart] = useState('');
  const [recordsEnd, setRecordsEnd] = useState('');
  const [summaryPage, setSummaryPage] = useState(1);
  const [recordsPage, setRecordsPage] = useState(1);

  const [pinModal, setPinModal] = useState<{
    open: boolean; correctPin: string; title: string; summaryHtml: string; onSuccess: () => void;
  }>({ open: false, correctPin: '', title: '', summaryHtml: '', onSuccess: () => {} });

  const userOptions = useMemo(
    () => users.map(u => ({ value: u.nickname, label: `${u.nickname} (${u.fullname})` })),
    [users]
  );

  function hasFullDayConflict(nickname: string, ns: string, ne: string, nsp: string, nep: string): { date: string; type: string } | null {
    const userRecords = allLeaveRecords.filter(r => r.userNickname === nickname);
    let current = new Date(ns + 'T00:00:00');
    const last = new Date(ne + 'T00:00:00');
    const toISO = (d: Date) => { const y = d.getFullYear(); const m = (d.getMonth()+1).toString().padStart(2,'0'); const day = d.getDate().toString().padStart(2,'0'); return `${y}-${m}-${day}`; };

    while (current <= last) {
      const dateStr = toISO(current);
      let newPeriod = dateStr === ns ? nsp : dateStr === ne ? nep : 'เต็มวัน';
      const existing = userRecords.filter(r => dateStr >= r.startDate && dateStr <= r.endDate);
      if (existing.length > 0) {
        let existMorning = false, existAfternoon = false;
        for (const leave of existing) {
          const p = leave.startDate === leave.endDate ? (leave.startPeriod || leave.period || 'เต็มวัน')
            : dateStr === leave.startDate ? (leave.startPeriod || 'เต็มวัน')
            : dateStr === leave.endDate ? (leave.endPeriod || 'เต็มวัน')
            : 'เต็มวัน';
          if (p === 'เต็มวัน') return { date: dateStr, type: 'มีรายการลาเต็มวันอยู่แล้ว' };
          if (p === 'ครึ่งวัน-เช้า') existMorning = true;
          if (p === 'ครึ่งวัน-บ่าย') existAfternoon = true;
        }
        if (existMorning && existAfternoon) return { date: dateStr, type: 'มีรายการลาทั้งเช้าและบ่ายแล้ว' };
        if (newPeriod === 'เต็มวัน' && (existMorning || existAfternoon)) return { date: dateStr, type: 'มีรายการลาครึ่งวันอยู่แล้ว' };
        if (newPeriod === 'ครึ่งวัน-เช้า' && existMorning) return { date: dateStr, type: 'มีรายการลาช่วงเช้าอยู่แล้ว' };
        if (newPeriod === 'ครึ่งวัน-บ่าย' && existAfternoon) return { date: dateStr, type: 'มีรายการลาช่วงบ่ายอยู่แล้ว' };
      }
      current.setDate(current.getDate() + 1);
    }
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedUser) { Swal.fire({ icon: 'error', title: 'กรุณาเลือกผู้ลา' }); return; }
    if (!leaveType) { Swal.fire({ icon: 'error', title: 'กรุณาเลือกประเภทการลา' }); return; }
    if (!approver) { Swal.fire({ icon: 'error', title: 'กรุณาเลือกผู้อนุมัติ' }); return; }
    if (endDate < startDate) { Swal.fire({ icon: 'error', title: 'วันที่สิ้นสุดต้องไม่น้อยกว่าวันที่เริ่มต้น' }); return; }

    const conflict = hasFullDayConflict(selectedUser, startDate, endDate, startPeriod, endPeriod);
    if (conflict) {
      Swal.fire({ icon: 'warning', title: 'ตรวจพบการลาซ้ำซ้อน', html: `มีข้อมูลการลาในวันที่ <b>${formatDateThaiShort(conflict.date)}</b> อยู่แล้ว (${conflict.type})`, confirmButtonText: 'ตกลง' });
      return;
    }

    const leaveDays = calculateLeaveDays(startDate, endDate, startPeriod, endPeriod, holidays);
    const fy = computeFiscalYearFromDateString(startDate) ?? getCurrentFiscalYear();
    const formData: Omit<LeaveRecord, 'id'> = {
      fiscalYear: fy,
      userNickname: selectedUser,
      leaveType,
      startDate,
      endDate,
      startPeriod,
      endPeriod,
      approver,
      note,
      status: 'รออนุมัติ',
    };

    const dateDisplay = startDate === endDate ? formatDateThaiShort(startDate) : `${formatDateThaiShort(startDate)} - ${formatDateThaiShort(endDate)}`;
    const periodDisplay = startDate === endDate ? startPeriod : `เริ่มต้น (${startPeriod}) ถึง สิ้นสุด (${endPeriod})`;
    const summaryHtml = `
      <p><b>ผู้ลา:</b> ${selectedUser}</p>
      <p><b>ประเภท:</b> ${leaveType}</p>
      <p><b>วันที่:</b> ${dateDisplay}</p>
      <p><b>ช่วงเวลา:</b> ${periodDisplay}</p>
      <p><b>จำนวนวันลา:</b> ${leaveDays} วัน</p>
    `;

    const user = users.find(u => u.nickname === selectedUser);
    if (!user?.pin) { Swal.fire({ icon: 'error', title: 'ไม่พบ PIN ผู้ใช้' }); return; }

    setPinModal({
      open: true,
      correctPin: user.pin,
      title: 'กรุณากรอก PIN เพื่อยืนยัน',
      summaryHtml,
      onSuccess: async () => {
        setPinModal(p => ({ ...p, open: false }));
        Swal.fire({ title: 'กำลังบันทึก...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        try {
          await addLeaveRecord(formData);
          if (user) await sendLeaveTelegramNotification(formData, user, leaveDays);
          Swal.fire({ icon: 'success', title: 'บันทึกสำเร็จ', confirmButtonText: 'ตกลง' });
          setSelectedUser(''); setLeaveType(''); setStartDate(today); setEndDate(today);
          setStartPeriod('เต็มวัน'); setEndPeriod('เต็มวัน'); setApprover(''); setNote('');
        } catch {
          Swal.fire({ icon: 'error', title: 'บันทึกล้มเหลว' });
        }
      },
    });
  }

  const filteredLeaveRecords = useMemo(() => {
    return allLeaveRecords.filter(r => {
      const fy = Number.isFinite(r.fiscalYear) ? r.fiscalYear : (computeFiscalYearFromDateString(r.startDate) ?? 0);
      if (fy !== fiscalYear) return false;
      const user = users.find(u => u.nickname === r.userNickname);
      if (!user) return false;
      const nameMatch = !recordsSearch || user.fullname.toLowerCase().includes(recordsSearch.toLowerCase()) || user.nickname.toLowerCase().includes(recordsSearch.toLowerCase());
      const posMatch = !recordsPosition || user.position === recordsPosition;
      const startMatch = !recordsStart || r.startDate >= recordsStart;
      const endMatch = !recordsEnd || r.endDate <= recordsEnd;
      return nameMatch && posMatch && startMatch && endMatch;
    }).sort((a, b) => {
      const ta = a.createdDate?.toDate?.()?.getTime?.() ?? 0;
      const tb = b.createdDate?.toDate?.()?.getTime?.() ?? 0;
      return tb - ta;
    });
  }, [allLeaveRecords, fiscalYear, users, recordsSearch, recordsPosition, recordsStart, recordsEnd]);

  const summaryData = useMemo(() => {
    const filtUsers = users.filter(u => {
      const nameMatch = !summarySearch || u.fullname.toLowerCase().includes(summarySearch.toLowerCase()) || u.nickname.toLowerCase().includes(summarySearch.toLowerCase());
      const posMatch = !summaryPosition || u.position === summaryPosition;
      return nameMatch && posMatch;
    });
    const map: Record<string, { id: string; fullname: string; nickname: string; position: string; totalDays: number }> = {};
    filtUsers.forEach(u => { map[u.nickname] = { id: u.id, fullname: u.fullname, nickname: u.nickname, position: u.position, totalDays: 0 }; });
    allLeaveRecords.forEach(r => {
      const fy = Number.isFinite(r.fiscalYear) ? r.fiscalYear : (computeFiscalYearFromDateString(r.startDate) ?? 0);
      if (fy === fiscalYear && r.status === 'อนุมัติแล้ว' && map[r.userNickname]) {
        const sp = r.startPeriod || r.period || 'เต็มวัน';
        const ep = r.endPeriod || r.period || 'เต็มวัน';
        map[r.userNickname].totalDays += calculateLeaveDays(r.startDate, r.endDate, sp, ep, holidays);
      }
    });
    return Object.values(map).sort((a, b) => b.totalDays - a.totalDays);
  }, [allLeaveRecords, fiscalYear, users, summarySearch, summaryPosition, holidays]);

  const totalSummaryPages = Math.max(1, Math.ceil(summaryData.length / RECORDS_PER_PAGE));
  const totalRecordPages = Math.max(1, Math.ceil(filteredLeaveRecords.length / RECORDS_PER_PAGE));
  const paginatedSummary = summaryData.slice((summaryPage - 1) * RECORDS_PER_PAGE, summaryPage * RECORDS_PER_PAGE);
  const paginatedRecords = filteredLeaveRecords.slice((recordsPage - 1) * RECORDS_PER_PAGE, recordsPage * RECORDS_PER_PAGE);

  async function handleDelete(r: LeaveRecord) {
    const user = users.find(u => u.nickname === r.userNickname);
    const leaveDays = calculateLeaveDays(r.startDate, r.endDate, r.startPeriod, r.endPeriod, holidays);
    const dateDisplay = r.startDate === r.endDate ? formatDateThaiShort(r.startDate) : `${formatDateThaiShort(r.startDate)} - ${formatDateThaiShort(r.endDate)}`;
    const summaryHtml = `<p><b>ยืนยันการลบรายการลาของ ${user?.fullname || r.userNickname}</b></p>
      <p><b>ประเภท:</b> ${r.leaveType}</p>
      <p><b>วันที่:</b> ${dateDisplay} (${leaveDays} วัน)</p>`;

    let correctPin = '';
    let title = '';
    const approved = r.status === 'อนุมัติแล้ว';
    if (approved) {
      const admin = admins.find(a => a.username === r.approver);
      if (!admin) { Swal.fire({ icon: 'error', title: 'ไม่พบข้อมูล Admin' }); return; }
      correctPin = admin.pin; title = `ยืนยันโดย: ${r.approver}`;
    } else {
      if (!user?.pin) { Swal.fire({ icon: 'error', title: 'ไม่พบ PIN ผู้ใช้' }); return; }
      correctPin = user.pin; title = 'กรุณากรอก PIN เพื่อยืนยันการลบ';
    }

    setPinModal({
      open: true, correctPin, title, summaryHtml,
      onSuccess: async () => {
        setPinModal(p => ({ ...p, open: false }));
        Swal.fire({ title: 'กำลังลบ...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        try {
          await deleteLeaveRecord(r.id);
          Swal.fire({ icon: 'success', title: 'ลบข้อมูลสำเร็จ', confirmButtonText: 'ตกลง' });
        } catch {
          Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาดในการลบ' });
        }
      },
    });
  }

  async function handleApprove(r: LeaveRecord) {
    const user = users.find(u => u.nickname === r.userNickname) || {} as User;
    const leaveDays = calculateLeaveDays(r.startDate, r.endDate, r.startPeriod, r.endPeriod, holidays);
    const summaryHtml = `<p><b>อนุมัติการลาของ:</b> ${user.fullname || r.userNickname}</p>
      <p><b>ประเภท:</b> ${r.leaveType}</p>
      <p><b>จำนวน:</b> ${leaveDays} วัน</p>`;
    const admin = admins.find(a => a.username === r.approver);
    if (!admin) { Swal.fire({ icon: 'error', title: 'ไม่พบข้อมูล Admin' }); return; }

    setPinModal({
      open: true, correctPin: admin.pin, title: `ยืนยันการอนุมัติโดย: ${r.approver}`, summaryHtml,
      onSuccess: async () => {
        setPinModal(p => ({ ...p, open: false }));
        Swal.fire({ title: 'กำลังอนุมัติ...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        try {
          await approveLeaveRecord(r.id);
          Swal.fire({ icon: 'success', title: 'อนุมัติสำเร็จ', confirmButtonText: 'ตกลง' });
        } catch {
          Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด' });
        }
      },
    });
  }

  function showRecordDetail(r: LeaveRecord) {
    const user = users.find(u => u.nickname === r.userNickname) || {} as User;
    const leaveDays = calculateLeaveDays(r.startDate, r.endDate, r.startPeriod || r.period || 'เต็มวัน', r.endPeriod || r.period || 'เต็มวัน', holidays);
    const sp = r.startPeriod || r.period || 'เต็มวัน';
    const ep = r.endPeriod || r.period || 'เต็มวัน';
    const dateDisplay = r.startDate === r.endDate
      ? `${formatDateThaiShort(r.startDate)} (${sp})`
      : `${formatDateThaiShort(r.startDate)} (${sp}) - ${formatDateThaiShort(r.endDate)} (${ep})`;
    Swal.fire({
      title: 'รายละเอียดการลา', width: window.innerWidth < 560 ? '95vw' : '500px', confirmButtonText: 'ปิด',
      html: `<div class="space-y-3 text-left p-4">
        <p><strong>ชื่อ-สกุล:</strong> ${user.fullname || r.userNickname} (${user.nickname})</p>
        <p><strong>ตำแหน่ง:</strong> ${user.position || '-'}</p>
        <hr/>
        <p><strong>ประเภทการลา:</strong> <span style="${getLeaveTypeColor(r.leaveType).replace('text-', 'color:').replace('-500', '')}">${r.leaveType}</span></p>
        <p><strong>วันที่ลา:</strong> ${dateDisplay}</p>
        <p><strong>จำนวนวัน:</strong> ${leaveDays} วัน</p>
        <p><strong>ผู้อนุมัติ:</strong> ${r.approver || '-'}</p>
        <p><strong>สถานะ:</strong> <span style="${r.status === 'อนุมัติแล้ว' ? 'color:green' : 'color:orange'}">${r.status}</span></p>
        <p><strong>หมายเหตุ:</strong> ${r.note || '-'}</p>
        <hr/><p class="text-xs text-gray-500"><strong>วันที่แจ้งลา:</strong> ${formatDateTimeThaiShort(r.createdDate)}</p>
      </div>`,
    });
  }

  function showLeaveSummaryPopup(nickname: string) {
    const user = users.find(u => u.nickname === nickname);
    if (!user) return;

    const getTypeKey = (t: string) => {
      if (/พักผ่อน/i.test(t)) return 'vacation';
      if (/ป่วย/i.test(t)) return 'sick';
      if (/คลอด/i.test(t)) return 'maternity';
      return 'personal';
    };

    const totals = { vacation: 0, sick: 0, personal: 0, maternity: 0 };
    const records = allLeaveRecords
      .filter(r => {
        const fy = Number.isFinite(r.fiscalYear) ? r.fiscalYear : (computeFiscalYearFromDateString(r.startDate) ?? 0);
        return r.userNickname === nickname && fy === fiscalYear && r.status === 'อนุมัติแล้ว';
      })
      .sort((a, b) => b.startDate.localeCompare(a.startDate))
      .map(r => {
        const sp = r.startPeriod || r.period || 'เต็มวัน';
        const ep = r.endPeriod || r.period || 'เต็มวัน';
        const days = calculateLeaveDays(r.startDate, r.endDate, sp, ep, holidays);
        const key = getTypeKey(r.leaveType) as keyof typeof totals;
        totals[key] += days;
        return { ...r, days, key, sp, ep };
      });

    const tagColors: Record<string, string> = {
      vacation: 'bg-green-100 text-green-700',
      sick: 'bg-red-100 text-red-700',
      maternity: 'bg-pink-100 text-pink-700',
      personal: 'bg-purple-100 text-purple-700',
    };

    const PER_PAGE = 10;
    const totalPages = Math.max(1, Math.ceil(records.length / PER_PAGE));

    const buildRows = (page: number) => {
      const slice = records.slice(page * PER_PAGE, (page + 1) * PER_PAGE);
      if (slice.length === 0)
        return '<tr><td colspan="5" class="py-4 text-center text-gray-400">ไม่มีข้อมูล</td></tr>';
      return slice.map(r => {
        const dateText = r.startDate === r.endDate
          ? `${formatDateThaiShort(r.startDate)} (${r.sp})`
          : `${formatDateThaiShort(r.startDate)} (${r.sp}) – ${formatDateThaiShort(r.endDate)} (${r.ep})`;
        return `<tr class="border-b hover:bg-gray-50">
          <td class="px-3 py-2"><span class="px-2 py-0.5 rounded text-xs font-medium ${tagColors[r.key]}">${r.leaveType}</span></td>
          <td class="px-3 py-2 text-left text-sm">${dateText}</td>
          <td class="px-3 py-2 text-xs text-gray-500">${r.note || '-'}</td>
          <td class="px-3 py-2 text-center font-semibold">${r.days}</td>
          <td class="px-3 py-2 text-center text-xs">${r.approver || '-'}</td>
        </tr>`;
      }).join('');
    };

    const buildPager = (page: number) => {
      const start = page * PER_PAGE + 1;
      const end = Math.min((page + 1) * PER_PAGE, records.length);
      const prevDis = page === 0 ? 'opacity-40 cursor-not-allowed' : 'hover:bg-gray-200 cursor-pointer';
      const nextDis = page >= totalPages - 1 ? 'opacity-40 cursor-not-allowed' : 'hover:bg-gray-200 cursor-pointer';
      return `
        <div class="flex items-center justify-between mt-3 px-1">
          <button id="leave-prev" class="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-100 text-sm font-medium transition-colors ${prevDis}">
            ← ก่อนหน้า
          </button>
          <span class="text-xs text-gray-500">
            ${records.length === 0 ? 'ไม่มีรายการ' : `${start}–${end} จาก ${records.length} รายการ (หน้า ${page + 1}/${totalPages})`}
          </span>
          <button id="leave-next" class="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-100 text-sm font-medium transition-colors ${nextDis}">
            ถัดไป →
          </button>
        </div>`;
    };

    Swal.fire({
      title: `สรุปวันลาของ ${user.fullname} – ปีงบ ${fiscalYear}`,
      width: window.innerWidth < 840 ? '95vw' : '800px',
      confirmButtonText: 'ปิด',
      html: `
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div class="rounded-xl p-4 text-center bg-green-50 border border-green-200">
            <div class="text-sm text-green-700">ลาพักผ่อน</div>
            <div class="text-3xl font-extrabold text-green-700">${totals.vacation}</div>
            <div class="text-xs text-green-600">วัน (อนุมัติ)</div>
          </div>
          <div class="rounded-xl p-4 text-center bg-red-50 border border-red-200">
            <div class="text-sm text-red-700">ลาป่วย</div>
            <div class="text-3xl font-extrabold text-red-700">${totals.sick}</div>
            <div class="text-xs text-red-600">วัน (อนุมัติ)</div>
          </div>
          <div class="rounded-xl p-4 text-center bg-purple-50 border border-purple-200">
            <div class="text-sm text-purple-700">ลากิจ/ฉุกเฉิน</div>
            <div class="text-3xl font-extrabold text-purple-700">${totals.personal}</div>
            <div class="text-xs text-purple-600">วัน (อนุมัติ)</div>
          </div>
          <div class="rounded-xl p-4 text-center bg-pink-50 border border-pink-200">
            <div class="text-sm text-pink-700">ลาคลอด</div>
            <div class="text-3xl font-extrabold text-pink-700">${totals.maternity}</div>
            <div class="text-xs text-pink-600">วัน (อนุมัติ)</div>
          </div>
        </div>
        <div class="bg-gray-50 border rounded-lg">
          <div class="px-3 py-2 text-sm font-semibold text-gray-700">รายการวันลา</div>
          <div class="overflow-x-auto">
            <table class="min-w-full text-sm">
              <thead class="bg-white">
                <tr class="text-gray-600">
                  <th class="px-3 py-2 text-center">ประเภท</th>
                  <th class="px-3 py-2 text-center">ช่วงวัน</th>
                  <th class="px-3 py-2 text-center">หมายเหตุ</th>
                  <th class="px-3 py-2 text-center w-20">วันลา</th>
                  <th class="px-3 py-2 text-center">ผู้อนุมัติ</th>
                </tr>
              </thead>
              <tbody id="leave-tbody"></tbody>
            </table>
          </div>
        </div>
        <div id="leave-pager"></div>
      `,
      didOpen: () => {
        let page = 0;

        const render = () => {
          const tbody = document.getElementById('leave-tbody');
          const pager = document.getElementById('leave-pager');
          if (tbody) tbody.innerHTML = buildRows(page);
          if (pager) pager.innerHTML = buildPager(page);

          document.getElementById('leave-prev')?.addEventListener('click', () => {
            if (page > 0) { page--; render(); }
          });
          document.getElementById('leave-next')?.addEventListener('click', () => {
            if (page < totalPages - 1) { page++; render(); }
          });
        };

        render();
      },
    });
  }

  const positionBadge = (pos: string) => {
    const cls = pos === 'เภสัช' ? 'bg-blue-100 text-blue-700' : pos === 'จพง' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700';
    return <span className={`px-2 py-1 rounded-full text-xs font-medium ${cls}`}>{pos}</span>;
  };

  return (
    <div>
      <PinModal isOpen={pinModal.open} title={pinModal.title} summaryHtml={pinModal.summaryHtml} correctPin={pinModal.correctPin} onSuccess={pinModal.onSuccess} onCancel={() => setPinModal(p => ({ ...p, open: false }))} />

      {/* Form */}
      <div className="bg-white rounded-2xl shadow-lg overflow-hidden mb-6">
        <div className="relative bg-gradient-to-r from-orange-500 to-amber-600 p-4 sm:p-6 text-white">
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-xl sm:text-2xl font-bold">📢 แจ้งลา/ลาล่วงหน้า</h1>
            <a
              href="http://122.154.234.182:3001/authen?redirect=http://122.154.234.182:3001/leave/p&name=ระบบวันลา"
              target="_blank" rel="noopener noreferrer"
              className="flex-shrink-0 flex items-center gap-1.5 bg-teal-500 hover:bg-teal-600 text-white font-bold py-1.5 px-2.5 rounded-lg shadow text-xs sm:text-sm transition-colors"
            >
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" /><path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" /></svg>
              <span>เข้าระบบลา รพ.</span>
            </a>
          </div>
          <p className="text-orange-100 text-sm mt-1">กรุณากรอกข้อมูลการลาให้ครบถ้วน</p>
          <p className="text-amber-200 font-bold text-xs mt-3">**เป็นเพียงระบบแจ้งลาภายในห้องยาเท่านั้น ให้ลาในระบบของโรงพยาบาลด้วย**</p>
        </div>
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-5">
          {/* User */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">ชื่อผู้ใช้</label>
            <UserSelect
              options={userOptions}
              value={selectedUser}
              onChange={setSelectedUser}
              placeholder="พิมพ์ค้นหาหรือเลือกผู้ใช้..."
              accentColor="orange"
              required
            />
          </div>

          {/* Leave Type Buttons */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">ประเภทการลา</label>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {LEAVE_TYPES.map(lt => (
                <button
                  key={lt.type}
                  type="button"
                  onClick={() => setLeaveType(lt.type)}
                  className={`px-3 py-3 rounded-lg border-2 font-medium transition-all text-sm ${leaveType === lt.type ? COLOR_CLASSES[lt.color] : 'border-gray-300 text-gray-700 hover:border-gray-400'}`}
                >
                  {lt.type}
                </button>
              ))}
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">วันที่เริ่มต้น</label>
              <input type="date" value={startDate} onChange={e => { setStartDate(e.target.value); if (endDate < e.target.value) setEndDate(e.target.value); }} required className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500" />
              <label className="block text-sm font-semibold text-gray-700 mt-3 mb-1">ช่วงเวลา</label>
              <select value={startPeriod} onChange={e => setStartPeriod(e.target.value)} className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500">
                {PERIODS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">วันที่สิ้นสุด</label>
              <input type="date" value={endDate} min={startDate} onChange={e => setEndDate(e.target.value)} required className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500" />
              <label className="block text-sm font-semibold text-gray-700 mt-3 mb-1">ช่วงเวลา</label>
              <select value={endPeriod} onChange={e => setEndPeriod(e.target.value)} className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500">
                {PERIODS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>

          {/* Note */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">หมายเหตุ</label>
            <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="รายละเอียดเพิ่มเติม..." rows={3} className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 resize-none" />
          </div>

          {/* Approver */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">ผู้อนุมัติ</label>
            <select value={approver} onChange={e => setApprover(e.target.value)} required className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500">
              <option value="">-- เลือกผู้อนุมัติ --</option>
              {admins.map(a => <option key={a.id} value={a.username}>{a.username}</option>)}
            </select>
          </div>

          <button type="submit" className="w-full bg-gradient-to-r from-orange-500 to-amber-600 text-white py-3 rounded-xl font-semibold hover:opacity-90 transition-opacity">
            💾 บันทึกข้อมูล
          </button>
        </form>
      </div>

      {/* Summary Table */}
      <div className="bg-white rounded-xl shadow-lg p-6 mt-6">
        <div className="flex flex-wrap justify-between items-center mb-4 gap-3">
          <h3 className="text-xl font-bold text-gray-800">สรุปวันลา (ปีงบประมาณ {fiscalYear})</h3>
          <div className="flex gap-2 items-center">
            <label className="text-sm font-medium text-gray-700">เลือกปีงบประมาณ:</label>
            <select value={fiscalYear} onChange={e => { setFiscalYear(Number(e.target.value)); setSummaryPage(1); setRecordsPage(1); }} className="p-2 border rounded-lg text-sm">
              {allFiscalYears.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4 p-4 bg-gray-50 rounded-lg">
          <input type="text" placeholder="ค้นหาชื่อ..." value={summarySearch} onChange={e => { setSummarySearch(e.target.value); setSummaryPage(1); }} className="p-2 border rounded-lg text-sm" />
          <select value={summaryPosition} onChange={e => { setSummaryPosition(e.target.value); setSummaryPage(1); }} className="p-2 border rounded-lg text-sm">
            <option value="">ทุกตำแหน่ง</option>
            <option value="เภสัช">เภสัช</option>
            <option value="จพง">จพง</option>
            <option value="จนท">จนท</option>
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full table-auto">
            <thead className="bg-gray-50">
              <tr>
                {['ชื่อ-สกุล', 'ชื่อเล่น', 'ตำแหน่ง', 'รวมวันลา (อนุมัติ)'].map(h => (
                  <th key={h} className="px-4 py-3 text-center text-sm font-medium text-gray-700">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginatedSummary.map(u => (
                <tr key={u.nickname} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <button onClick={() => showLeaveSummaryPopup(u.nickname)} className="text-purple-600 hover:underline">{u.fullname}</button>
                  </td>
                  <td className="px-4 py-3">{u.nickname}</td>
                  <td className="px-4 py-3">{positionBadge(u.position)}</td>
                  <td className="px-4 py-3 font-semibold">{u.totalDays} วัน</td>
                </tr>
              ))}
              {paginatedSummary.length === 0 && <tr><td colSpan={4} className="py-6 text-center text-gray-400">ไม่มีข้อมูล</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="flex justify-between items-center mt-4">
          <button onClick={() => setSummaryPage(p => Math.max(1, p - 1))} disabled={summaryPage === 1} className="bg-gray-200 hover:bg-gray-300 px-4 py-2 rounded-l disabled:opacity-50">ก่อนหน้า</button>
          <span className="text-sm">หน้า {summaryPage} / {totalSummaryPages}</span>
          <button onClick={() => setSummaryPage(p => Math.min(totalSummaryPages, p + 1))} disabled={summaryPage === totalSummaryPages} className="bg-gray-200 hover:bg-gray-300 px-4 py-2 rounded-r disabled:opacity-50">ถัดไป</button>
        </div>
      </div>

      {/* Records Table */}
      <div className="bg-white rounded-xl shadow-lg p-6 mt-6">
        <h3 className="text-xl font-bold text-gray-800 mb-4">รายการล่าสุด</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-4 p-4 bg-gray-50 rounded-lg">
          <input type="text" placeholder="ค้นหาชื่อ..." value={recordsSearch} onChange={e => { setRecordsSearch(e.target.value); setRecordsPage(1); }} className="p-2 border rounded-lg sm:col-span-2 lg:col-span-2 text-sm" />
          <select value={recordsPosition} onChange={e => { setRecordsPosition(e.target.value); setRecordsPage(1); }} className="p-2 border rounded-lg text-sm">
            <option value="">ทุกตำแหน่ง</option>
            <option value="เภสัช">เภสัช</option>
            <option value="จพง">จพง</option>
            <option value="จนท">จนท</option>
          </select>
          <input type="date" value={recordsStart} onChange={e => { setRecordsStart(e.target.value); setRecordsPage(1); }} className="p-2 border rounded-lg text-sm" />
          <input type="date" value={recordsEnd} onChange={e => { setRecordsEnd(e.target.value); setRecordsPage(1); }} className="p-2 border rounded-lg text-sm" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full table-auto">
            <thead className="bg-gray-50">
              <tr>
                {['ชื่อ-สกุล', 'ชื่อเล่น', 'ตำแหน่ง', 'ประเภท', 'วันที่ลา', 'จำนวนวัน', 'ผู้อนุมัติ', 'สถานะ', 'การจัดการ'].map(h => (
                  <th key={h} className="px-3 py-3 text-center text-sm font-medium text-gray-700">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginatedRecords.map(r => {
                const user = users.find(u => u.nickname === r.userNickname) || {} as User;
                const sp = r.startPeriod || r.period || 'เต็มวัน';
                const ep = r.endPeriod || r.period || 'เต็มวัน';
                const leaveDays = calculateLeaveDays(r.startDate, r.endDate, sp, ep, holidays);
                const dateDisplay = r.startDate === r.endDate ? formatDateThaiShort(r.startDate) : `${formatDateThaiShort(r.startDate)} - ${formatDateThaiShort(r.endDate)}`;
                return (
                  <tr key={r.id} className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => showRecordDetail(r)}>
                    <td className="px-3 py-3 text-sm">{user.fullname || r.userNickname}</td>
                    <td className="px-3 py-3 text-sm">{user.nickname || r.userNickname}</td>
                    <td className="px-3 py-3">{positionBadge(user.position || '')}</td>
                    <td className={`px-3 py-3 font-semibold text-sm ${getLeaveTypeColor(r.leaveType)}`}>{r.leaveType}</td>
                    <td className="px-3 py-3 text-sm">{dateDisplay}</td>
                    <td className="px-3 py-3 text-center text-sm">{leaveDays}</td>
                    <td className="px-3 py-3 text-sm">{r.approver}</td>
                    <td className={`px-3 py-3 font-semibold text-sm ${r.status === 'อนุมัติแล้ว' ? 'text-green-500' : 'text-yellow-500'}`}>{r.status}</td>
                    <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-1">
                        {r.status !== 'อนุมัติแล้ว' && (
                          <button onClick={() => handleApprove(r)} className="p-2 rounded-full hover:bg-green-100 text-green-600" title="อนุมัติ">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                          </button>
                        )}
                        <button onClick={() => handleDelete(r)} className="p-2 rounded-full hover:bg-red-100 text-red-600" title="ลบ">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {paginatedRecords.length === 0 && <tr><td colSpan={9} className="py-6 text-center text-gray-400">ไม่มีข้อมูล</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="flex justify-between items-center mt-4">
          <button onClick={() => setRecordsPage(p => Math.max(1, p - 1))} disabled={recordsPage === 1} className="bg-gray-200 hover:bg-gray-300 px-4 py-2 rounded-l disabled:opacity-50">ก่อนหน้า</button>
          <span className="text-sm">หน้า {recordsPage} / {totalRecordPages}</span>
          <button onClick={() => setRecordsPage(p => Math.min(totalRecordPages, p + 1))} disabled={recordsPage === totalRecordPages} className="bg-gray-200 hover:bg-gray-300 px-4 py-2 rounded-r disabled:opacity-50">ถัดไป</button>
        </div>
      </div>
    </div>
  );
};

export default FullDayLeave;
