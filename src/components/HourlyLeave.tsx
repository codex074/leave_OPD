import React, { useState, useMemo } from 'react';
import Swal from 'sweetalert2';
import { User, Admin, HourlyRecord } from '../types';
import {
  formatDateThaiShort,
  formatHoursAndMinutes,
  calculateDuration,
  getCurrentFiscalYear,
  toLocalISOStringInThailand,
  computeFiscalYearFromDateString,
} from '../utils/dateUtils';
import { addHourlyRecord, deleteHourlyRecord, approveHourlyRecord } from '../hooks/useFirestore';
import { sendHourlyTelegramNotification } from '../utils/telegramUtils';
import PinModal from './PinModal';
import UserSelect from './UserSelect';

interface HourlyLeaveProps {
  users: User[];
  admins: Admin[];
  allHourlyRecords: HourlyRecord[];
}

const RECORDS_PER_PAGE = 10;

const HourlyLeave: React.FC<HourlyLeaveProps> = ({ users, admins, allHourlyRecords }) => {
  const today = toLocalISOStringInThailand(new Date());

  // Form state
  const [selectedUser, setSelectedUser] = useState('');
  const [leaveType, setLeaveType] = useState<'leave' | 'use'>('leave');
  const [date, setDate] = useState(today);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [approver, setApprover] = useState('');
  const [note, setNote] = useState('');

  // Filter state
  const allFiscalYears = useMemo(() => {
    const fy = getCurrentFiscalYear();
    const years = new Set<number>([fy]);
    allHourlyRecords.forEach(r => { if (Number.isFinite(r.fiscalYear)) years.add(r.fiscalYear); });
    return Array.from(years).sort((a, b) => b - a);
  }, [allHourlyRecords]);

  const [fiscalYear, setFiscalYear] = useState(() => getCurrentFiscalYear());
  const [searchName, setSearchName] = useState('');
  const [filterPosition, setFilterPosition] = useState('');
  const [filterStart, setFilterStart] = useState('');
  const [filterEnd, setFilterEnd] = useState('');
  const [summaryFilterPosition, setSummaryFilterPosition] = useState('');
  const [recordsPage, setRecordsPage] = useState(1);
  const [summaryPage, setSummaryPage] = useState(1);

  // PIN modal state
  const [pinModal, setPinModal] = useState<{
    open: boolean;
    correctPin: string;
    title: string;
    summaryHtml: string;
    onSuccess: () => void;
  }>({ open: false, correctPin: '', title: '', summaryHtml: '', onSuccess: () => {} });

  const userOptions = useMemo(
    () => users.map(u => ({ value: u.nickname, label: `${u.nickname} (${u.fullname})` })),
    [users]
  );

  const filteredRecords = useMemo(() => {
    return allHourlyRecords.filter(r => {
      if (r.fiscalYear !== fiscalYear) return false;
      const user = users.find(u => u.nickname === r.userNickname);
      if (!user) return false;
      const nameMatch = !searchName || user.fullname.toLowerCase().includes(searchName.toLowerCase()) || user.nickname.toLowerCase().includes(searchName.toLowerCase());
      const posMatch = !filterPosition || user.position === filterPosition;
      const startMatch = !filterStart || r.date >= filterStart;
      const endMatch = !filterEnd || r.date <= filterEnd;
      return nameMatch && posMatch && startMatch && endMatch;
    }).sort((a, b) => {
      const ta = a.timestamp?.toDate?.()?.getTime?.() ?? 0;
      const tb = b.timestamp?.toDate?.()?.getTime?.() ?? 0;
      return tb - ta;
    });
  }, [allHourlyRecords, fiscalYear, users, searchName, filterPosition, filterStart, filterEnd]);

  const summary = useMemo(() => {
    const map: Record<string, { nickname: string; position: string; leaveHours: number; usedHours: number }> = {};
    users.filter(u => !summaryFilterPosition || u.position === summaryFilterPosition).forEach(u => {
      map[u.nickname] = { nickname: u.nickname, position: u.position, leaveHours: 0, usedHours: 0 };
    });
    allHourlyRecords.forEach(r => {
      if (r.fiscalYear === fiscalYear && map[r.userNickname] && r.confirmed) {
        if (r.type === 'leave') map[r.userNickname].leaveHours += r.duration || 0;
        else if (r.type === 'use') map[r.userNickname].usedHours += r.duration || 0;
      }
    });
    return Object.values(map).map(item => ({
      ...item,
      balance: item.usedHours - item.leaveHours
    })).sort((a, b) => a.balance - b.balance);
  }, [allHourlyRecords, fiscalYear, users, summaryFilterPosition]);

  const top3Negative = summary.filter(s => s.balance < 0).slice(0, 3);
  const top3Positive = summary.filter(s => s.balance > 0).sort((a, b) => b.balance - a.balance).slice(0, 3);

  const totalRecordPages = Math.max(1, Math.ceil(filteredRecords.length / RECORDS_PER_PAGE));
  const totalSummaryPages = Math.max(1, Math.ceil(summary.length / RECORDS_PER_PAGE));
  const paginatedRecords = filteredRecords.slice((recordsPage - 1) * RECORDS_PER_PAGE, recordsPage * RECORDS_PER_PAGE);
  const paginatedSummary = summary.slice((summaryPage - 1) * RECORDS_PER_PAGE, summaryPage * RECORDS_PER_PAGE);

  function hasHourlyConflict(nickname: string, d: string, s: string, e: string): HourlyRecord | null {
    const newStart = new Date(`${d}T${s}`);
    const newEnd = new Date(`${d}T${e}`);
    for (const r of allHourlyRecords.filter(r => r.userNickname === nickname && r.date === d)) {
      const existStart = new Date(`${r.date}T${r.startTime}`);
      const existEnd = new Date(`${r.date}T${r.endTime}`);
      if (newStart < existEnd && existStart < newEnd) return r;
    }
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedUser) { Swal.fire({ icon: 'error', title: 'กรุณาเลือกผู้ใช้' }); return; }
    if (!approver) { Swal.fire({ icon: 'error', title: 'กรุณาเลือกผู้อนุมัติ' }); return; }
    if (!startTime || !endTime) { Swal.fire({ icon: 'error', title: 'กรุณากรอกเวลา' }); return; }
    if (endTime <= startTime) { Swal.fire({ icon: 'error', title: 'เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่มต้น' }); return; }

    const conflict = hasHourlyConflict(selectedUser, date, startTime, endTime);
    if (conflict) {
      Swal.fire({
        icon: 'warning', title: 'ตรวจพบรายการซ้ำซ้อน',
        html: `มีการบันทึกข้อมูลในช่วงเวลา <b>${conflict.startTime} - ${conflict.endTime}</b> ของวันนี้ไปแล้ว`,
        confirmButtonText: 'รับทราบ',
      });
      return;
    }

    const duration = calculateDuration(startTime, endTime).total;
    const fy = computeFiscalYearFromDateString(date) ?? getCurrentFiscalYear();
    const formData = {
      fiscalYear: fy,
      userNickname: selectedUser,
      date,
      startTime,
      endTime,
      duration,
      type: leaveType,
      note,
      approver,
      confirmed: false,
    };

    const durationText = formatHoursAndMinutes(duration);
    const summaryHtml = `
      <p><b>ผู้ใช้:</b> ${selectedUser}</p>
      <p><b>ประเภท:</b> ${leaveType === 'leave' ? 'ลาชั่วโมง' : 'ใช้ชั่วโมง'}</p>
      <p><b>วันที่:</b> ${formatDateThaiShort(date)}</p>
      <p><b>เวลา:</b> ${startTime} - ${endTime}</p>
      <p><b>ผู้อนุมัติ:</b> ${approver}</p>
      <p><b>รวมเป็นเวลา:</b> ${durationText}</p>
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
          await addHourlyRecord(formData as Omit<HourlyRecord, 'id'>);
          if (user) await sendHourlyTelegramNotification(formData as Omit<HourlyRecord, 'id'>, user);
          Swal.fire({ icon: 'success', title: 'บันทึกสำเร็จ', confirmButtonText: 'ตกลง' });
          setSelectedUser(''); setLeaveType('leave');
          setDate(today); setStartTime(''); setEndTime(''); setApprover(''); setNote('');
        } catch {
          Swal.fire({ icon: 'error', title: 'บันทึกล้มเหลว' });
        }
      },
    });
  }

  async function handleDelete(r: HourlyRecord) {
    const user = users.find(u => u.nickname === r.userNickname);
    const summaryHtml = `<p><b>ยืนยันการลบรายการลาชั่วโมงของ ${r.userNickname}</b></p>
      <p><b>ประเภท:</b> ${r.type === 'leave' ? 'ลาชั่วโมง' : 'ใช้ชั่วโมง'}</p>
      <p><b>วันที่:</b> ${formatDateThaiShort(r.date)}</p>`;

    let correctPin = '';
    let title = '';
    if (r.confirmed) {
      const admin = admins.find(a => a.username === r.approver);
      if (!admin) { Swal.fire({ icon: 'error', title: 'ไม่พบข้อมูล Admin' }); return; }
      correctPin = admin.pin;
      title = `ยืนยันโดย: ${r.approver}`;
    } else {
      if (!user?.pin) { Swal.fire({ icon: 'error', title: 'ไม่พบ PIN ผู้ใช้' }); return; }
      correctPin = user.pin;
      title = 'กรุณากรอก PIN เพื่อยืนยันการลบ';
    }

    setPinModal({
      open: true,
      correctPin,
      title,
      summaryHtml,
      onSuccess: async () => {
        setPinModal(p => ({ ...p, open: false }));
        Swal.fire({ title: 'กำลังลบ...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        try {
          await deleteHourlyRecord(r.id);
          Swal.fire({ icon: 'success', title: 'ลบข้อมูลสำเร็จ', confirmButtonText: 'ตกลง' });
        } catch {
          Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาดในการลบ' });
        }
      },
    });
  }

  async function handleApprove(r: HourlyRecord) {
    const user = users.find(u => u.nickname === r.userNickname) || {} as User;
    const summaryHtml = `<p><b>อนุมัติรายการของ:</b> ${user.nickname}</p>
      <p><b>ประเภท:</b> ${r.type === 'leave' ? 'ลาชั่วโมง' : 'ใช้ชั่วโมง'}</p>
      <p><b>เวลา:</b> ${r.startTime} - ${r.endTime}</p>`;
    const admin = admins.find(a => a.username === r.approver);
    if (!admin) { Swal.fire({ icon: 'error', title: 'ไม่พบข้อมูล Admin' }); return; }

    setPinModal({
      open: true,
      correctPin: admin.pin,
      title: `ยืนยันการอนุมัติโดย: ${r.approver}`,
      summaryHtml,
      onSuccess: async () => {
        setPinModal(p => ({ ...p, open: false }));
        Swal.fire({ title: 'กำลังอนุมัติ...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        try {
          await approveHourlyRecord(r.id);
          Swal.fire({ icon: 'success', title: 'อนุมัติสำเร็จ', confirmButtonText: 'ตกลง' });
        } catch {
          Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาดในการอนุมัติ' });
        }
      },
    });
  }

  function showDetailModal(r: HourlyRecord) {
    const user = users.find(u => u.nickname === r.userNickname) || {} as User;
    const isLeave = r.type === 'leave';
    const typeClass = isLeave ? 'color:red' : 'color:green';
    const statusClass = r.confirmed ? 'color:green' : 'color:orange';
    Swal.fire({
      title: 'รายละเอียดลาชั่วโมง',
      html: `<div class="space-y-3 text-left p-4">
        <p><strong>ชื่อ-สกุล:</strong> ${user.fullname || r.userNickname} (${user.nickname})</p>
        <p><strong>ตำแหน่ง:</strong> ${user.position || '-'}</p>
        <hr/>
        <p><strong>ประเภทรายการ:</strong> <span style="${typeClass}">${isLeave ? 'ลาชั่วโมง' : 'ใช้ชั่วโมง'}</span></p>
        <p><strong>วันที่:</strong> ${formatDateThaiShort(r.date)}</p>
        <p><strong>ช่วงเวลา:</strong> ${r.startTime} - ${r.endTime}</p>
        <p><strong>รวมเวลา:</strong> ${formatHoursAndMinutes(r.duration)}</p>
        <p><strong>ผู้อนุมัติ:</strong> ${r.approver || '-'}</p>
        <p><strong>สถานะ:</strong> <span style="${statusClass}">${r.confirmed ? 'อนุมัติแล้ว' : 'รออนุมัติ'}</span></p>
        <p><strong>หมายเหตุ:</strong> ${r.note || '-'}</p>
      </div>`,
      confirmButtonText: 'ปิด',
      width: window.innerWidth < 560 ? '95vw' : '500px',
    });
  }

  function showHistoryModal(nickname: string) {
    const user = users.find(u => u.nickname === nickname);
    if (!user) return;
    const records = allHourlyRecords
      .filter(r => r.userNickname === nickname && r.fiscalYear === fiscalYear && r.confirmed)
      .sort((a, b) => b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime));

    let totalLeave = 0, totalUse = 0;
    records.forEach(r => { if (r.type === 'leave') totalLeave += r.duration; else totalUse += r.duration; });
    const balance = totalUse - totalLeave;

    const PER_PAGE = 10;
    const totalPages = Math.max(1, Math.ceil(records.length / PER_PAGE));

    const buildRows = (page: number) => {
      const slice = records.slice(page * PER_PAGE, (page + 1) * PER_PAGE);
      if (slice.length === 0)
        return '<tr><td colspan="5" class="py-6 text-center text-gray-400">ไม่พบประวัติ</td></tr>';
      return slice.map(r => {
        const isLeave = r.type === 'leave';
        return `<tr class="border-b hover:bg-gray-50">
          <td class="px-3 py-2"><div class="font-semibold">${formatDateThaiShort(r.date)}</div><div class="text-xs text-gray-400">${r.startTime}-${r.endTime}</div></td>
          <td class="px-3 py-2 text-center"><span class="px-2 py-0.5 rounded text-xs font-bold ${isLeave ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}">${isLeave ? 'ลา' : 'ใช้'}</span></td>
          <td class="px-3 py-2 text-center ${isLeave ? 'text-red-500' : 'text-green-600 font-bold'}">${isLeave ? '-' : '+'}${formatHoursAndMinutes(r.duration)}</td>
          <td class="px-3 py-2 text-xs text-gray-500">${r.note || '-'}</td>
          <td class="px-3 py-2 text-xs text-center">${r.approver || '-'}</td>
        </tr>`;
      }).join('');
    };

    const buildPager = (page: number) => {
      const start = page * PER_PAGE + 1;
      const end = Math.min((page + 1) * PER_PAGE, records.length);
      const prevDisabled = page === 0 ? 'opacity-40 cursor-not-allowed' : 'hover:bg-gray-200 cursor-pointer';
      const nextDisabled = page >= totalPages - 1 ? 'opacity-40 cursor-not-allowed' : 'hover:bg-gray-200 cursor-pointer';
      return `
        <div class="flex items-center justify-between mt-3 px-1">
          <button id="hist-prev" class="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-100 text-sm font-medium transition-colors ${prevDisabled}">
            ← ก่อนหน้า
          </button>
          <span class="text-xs text-gray-500">
            ${records.length === 0 ? 'ไม่มีรายการ' : `${start}–${end} จาก ${records.length} รายการ (หน้า ${page + 1}/${totalPages})`}
          </span>
          <button id="hist-next" class="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-100 text-sm font-medium transition-colors ${nextDisabled}">
            ถัดไป →
          </button>
        </div>`;
    };

    Swal.fire({
      title: `ประวัติ: ${user.nickname} (${user.fullname})`,
      html: `
        <div class="grid grid-cols-3 gap-3 mb-4">
          <div class="p-3 rounded-xl bg-green-50 border border-green-200 text-center text-green-700">
            <div class="text-xs mb-1">ใช้ชั่วโมง</div>
            <div class="text-xl font-bold">${formatHoursAndMinutes(totalUse)}</div>
          </div>
          <div class="p-3 rounded-xl bg-red-50 border border-red-200 text-center text-red-700">
            <div class="text-xs mb-1">ลาชั่วโมง</div>
            <div class="text-xl font-bold">${formatHoursAndMinutes(totalLeave)}</div>
          </div>
          <div class="p-3 rounded-xl ${balance >= 0 ? 'bg-white border-gray-300' : 'bg-red-50 border-red-200'} border text-center ${balance >= 0 ? 'text-gray-700' : 'text-red-700'}">
            <div class="text-xs mb-1">${balance >= 0 ? 'คงเหลือ' : 'ติดลบ'}</div>
            <div class="text-xl font-bold">${formatHoursAndMinutes(Math.abs(balance))}</div>
          </div>
        </div>
        <div class="overflow-hidden rounded-lg border border-gray-200">
          <table class="min-w-full text-sm">
            <thead class="bg-gray-100">
              <tr>
                <th class="px-3 py-2">วันที่/เวลา</th>
                <th class="px-3 py-2">ประเภท</th>
                <th class="px-3 py-2">จำนวน</th>
                <th class="px-3 py-2">หมายเหตุ</th>
                <th class="px-3 py-2">ผู้อนุมัติ</th>
              </tr>
            </thead>
            <tbody id="hist-tbody"></tbody>
          </table>
        </div>
        <div id="hist-pager"></div>
      `,
      width: window.innerWidth < 740 ? '95vw' : '700px',
      confirmButtonText: 'ปิดหน้าต่าง',
      didOpen: () => {
        let page = 0;

        const render = () => {
          const tbody = document.getElementById('hist-tbody');
          const pager = document.getElementById('hist-pager');
          if (tbody) tbody.innerHTML = buildRows(page);
          if (pager) pager.innerHTML = buildPager(page);

          const prevBtn = document.getElementById('hist-prev');
          const nextBtn = document.getElementById('hist-next');

          prevBtn?.addEventListener('click', () => {
            if (page > 0) { page--; render(); }
          });
          nextBtn?.addEventListener('click', () => {
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

  // data[0]=1st, data[1]=2nd, data[2]=3rd
  // display order: 2nd(left) | 1st(center) | 3rd(right)
  const renderPodium = (data: typeof top3Negative, type: 'negative' | 'positive') => {
    const slots = [
      { item: data[1], rank: 2, crown: '🥈' },
      { item: data[0], rank: 1, crown: '👑' },
      { item: data[2], rank: 3, crown: '🥉' },
    ];
    return (
      <div className="flex items-end justify-center gap-3 mt-4" style={{ minHeight: '220px' }}>
        {slots.map(({ item, rank, crown }, i) =>
          item ? (
            <div key={item.nickname} className={`podium-item rank-${rank}`}>
              <div className="text-sm font-bold text-gray-800 mb-1 text-center">{item.nickname}</div>
              <div
                className="text-xs text-gray-500 mb-3 text-center px-2 py-1 rounded-full"
                style={{ background: 'rgba(255,255,255,0.85)', boxShadow: '0 2px 6px rgba(0,0,0,0.08)' }}
              >
                {formatHoursAndMinutes(Math.abs(item.balance))}
              </div>
              <div className={`podium-bar ${type} rank-${rank}`}>
                <span className="podium-crown">{crown}</span>
                <span style={{ position: 'relative', zIndex: 1 }}>{rank}</span>
              </div>
            </div>
          ) : (
            <div key={i} style={{ width: '100px' }} />
          )
        )}
      </div>
    );
  };

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

      {/* Form */}
      <div className="bg-white rounded-2xl shadow-lg overflow-hidden mb-6">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-4 sm:p-6 text-white">
          <h1 className="text-xl sm:text-2xl font-bold">⏰ ลาชั่วโมง</h1>
          <p className="text-blue-100 text-sm mt-1">กรุณากรอกข้อมูลให้ครบถ้วน</p>
        </div>
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4">
          {/* User Select */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">ชื่อผู้ใช้</label>
            <UserSelect
              options={userOptions}
              value={selectedUser}
              onChange={setSelectedUser}
              placeholder="พิมพ์ค้นหาหรือเลือกผู้ใช้..."
              accentColor="blue"
              required
            />
          </div>

          {/* Type Radio */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">ประเภทรายการ</label>
            <div className="flex gap-3">
              {(['leave', 'use'] as const).map(t => (
                <label key={t} className={`flex-1 flex items-center justify-center p-3 rounded-xl border-2 cursor-pointer transition-all ${leaveType === t ? (t === 'leave' ? 'border-red-500 bg-red-50 text-red-700' : 'border-green-500 bg-green-50 text-green-700') : 'border-gray-200 hover:border-gray-300'}`}>
                  <input type="radio" name="hourlyLeaveType" value={t} checked={leaveType === t} onChange={() => setLeaveType(t)} className="hidden" />
                  <span className="font-semibold">{t === 'leave' ? '🔴 ลาชั่วโมง' : '🟢 ใช้ชั่วโมง'}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Date */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">วันที่</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} required className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
          </div>

          {/* Time */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">เวลาเริ่มต้น</label>
              <input type="time" value={startTime} onChange={e => { setStartTime(e.target.value); if (endTime && endTime <= e.target.value) setEndTime(''); }} required className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">เวลาสิ้นสุด</label>
              <input type="time" value={endTime} min={startTime} onChange={e => setEndTime(e.target.value)} required className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          {/* Approver */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">ผู้อนุมัติ</label>
            <select value={approver} onChange={e => setApprover(e.target.value)} required className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
              <option value="">-- เลือกผู้อนุมัติ --</option>
              {admins.map(a => <option key={a.id} value={a.username}>{a.username}</option>)}
            </select>
          </div>

          {/* Note */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">หมายเหตุ</label>
            <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="รายละเอียดเพิ่มเติม..." rows={2} className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>

          <button type="submit" className="w-full bg-gradient-to-r from-blue-600 to-indigo-700 text-white py-3 rounded-xl font-semibold hover:opacity-90 transition-opacity">
            💾 บันทึกข้อมูล
          </button>
        </form>
      </div>

      {/* Rankings */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h2 className="text-center text-lg font-bold text-gray-800 mb-4">🏆 Top 3 ติดลบ 🏆</h2>
          {top3Negative.length > 0 ? renderPodium(top3Negative, 'negative') : <p className="text-center text-gray-400 text-sm">ไม่มีข้อมูล</p>}
        </div>
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h2 className="text-center text-lg font-bold text-gray-800 mb-4">🥇 Top 3 คงเหลือ 🥇</h2>
          {top3Positive.length > 0 ? renderPodium(top3Positive, 'positive') : <p className="text-center text-gray-400 text-sm">ไม่มีข้อมูล</p>}
        </div>
      </div>

      {/* Summary Table */}
      <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
        <div className="flex flex-wrap justify-between items-center mb-4 gap-3">
          <h3 className="text-xl font-bold text-gray-800">สรุปลาชั่วโมง</h3>
          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">ตำแหน่ง:</label>
              <select value={summaryFilterPosition} onChange={e => { setSummaryFilterPosition(e.target.value); setSummaryPage(1); }} className="p-2 border rounded-lg text-sm">
                <option value="">ทุกตำแหน่ง</option>
                <option value="เภสัช">เภสัช</option>
                <option value="จพง">จพง</option>
                <option value="จนท">จนท</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">ปีงบ:</label>
              <select value={fiscalYear} onChange={e => { setFiscalYear(Number(e.target.value)); setSummaryPage(1); setRecordsPage(1); }} className="p-2 border rounded-lg text-sm">
                {allFiscalYears.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full table-auto">
            <thead className="bg-gray-50">
              <tr>
                {['ชื่อเล่น', 'ตำแหน่ง', 'ชั่วโมงที่ลา', 'ชั่วโมงที่ใช้', 'ผลรวม', 'สถานะ'].map(h => (
                  <th key={h} className="px-4 py-3 text-center text-sm font-medium text-gray-700">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginatedSummary.map(item => (
                <tr key={item.nickname} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => showHistoryModal(item.nickname)} className="text-blue-600 font-bold hover:underline">{item.nickname}</button>
                  </td>
                  <td className="px-4 py-3 text-center">{positionBadge(item.position)}</td>
                  <td className="px-4 py-3 text-center text-gray-600">{formatHoursAndMinutes(item.leaveHours)}</td>
                  <td className="px-4 py-3 text-center text-gray-600">{formatHoursAndMinutes(item.usedHours)}</td>
                  <td className={`px-4 py-3 text-center font-bold ${item.balance < 0 ? 'text-red-600' : 'text-green-600'}`}>{formatHoursAndMinutes(Math.abs(item.balance))}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${item.balance < 0 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                      {item.balance < 0 ? 'ติดลบ' : 'ปกติ'}
                    </span>
                  </td>
                </tr>
              ))}
              {paginatedSummary.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-gray-400">ไม่มีข้อมูล</td></tr>}
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
      <div className="bg-white rounded-xl shadow-lg p-6">
        <h3 className="text-xl font-bold text-gray-800 mb-4">รายการ</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-4 p-4 bg-gray-50 rounded-lg">
          <input type="text" placeholder="ค้นหาชื่อ..." value={searchName} onChange={e => { setSearchName(e.target.value); setRecordsPage(1); }} className="p-2 border rounded-lg sm:col-span-2 lg:col-span-2 text-sm" />
          <select value={filterPosition} onChange={e => { setFilterPosition(e.target.value); setRecordsPage(1); }} className="p-2 border rounded-lg text-sm">
            <option value="">ทุกตำแหน่ง</option>
            <option value="เภสัช">เภสัช</option>
            <option value="จพง">จพง</option>
            <option value="จนท">จนท</option>
          </select>
          <input type="date" value={filterStart} onChange={e => { setFilterStart(e.target.value); setRecordsPage(1); }} className="p-2 border rounded-lg text-sm" />
          <input type="date" value={filterEnd} onChange={e => { setFilterEnd(e.target.value); setRecordsPage(1); }} className="p-2 border rounded-lg text-sm" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full table-auto">
            <thead className="bg-gray-50">
              <tr>
                {['วันที่', 'ชื่อเล่น', 'ตำแหน่ง', 'ประเภท', 'เวลา', 'ผู้อนุมัติ', 'สถานะ', 'การจัดการ'].map(h => (
                  <th key={h} className="px-3 py-3 text-center text-sm font-medium text-gray-700">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginatedRecords.map(r => {
                const user = users.find(u => u.nickname === r.userNickname) || {} as User;
                const isLeave = r.type === 'leave';
                return (
                  <tr key={r.id} className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => showDetailModal(r)}>
                    <td className="px-3 py-3 text-center text-sm">{formatDateThaiShort(r.date)}</td>
                    <td className="px-3 py-3 text-center text-sm font-medium">{r.userNickname}</td>
                    <td className="px-3 py-3 text-center">{positionBadge(user.position || '')}</td>
                    <td className={`px-3 py-3 text-center font-semibold text-sm ${isLeave ? 'text-red-500' : 'text-green-500'}`}>{isLeave ? 'ลา' : 'ใช้'}</td>
                    <td className="px-3 py-3 text-center text-sm">{r.startTime}-{r.endTime}<br /><span className={`text-xs font-semibold ${isLeave ? 'text-red-500' : 'text-green-500'}`}>({formatHoursAndMinutes(r.duration)})</span></td>
                    <td className="px-3 py-3 text-center text-sm">{r.approver || '-'}</td>
                    <td className={`px-3 py-3 text-center font-semibold text-sm ${r.confirmed ? 'text-green-500' : 'text-yellow-500'}`}>{r.confirmed ? 'อนุมัติแล้ว' : 'รออนุมัติ'}</td>
                    <td className="px-3 py-3 text-center" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-1">
                        {!r.confirmed && (
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
              {paginatedRecords.length === 0 && <tr><td colSpan={8} className="py-6 text-center text-gray-400">ไม่มีข้อมูล</td></tr>}
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

export default HourlyLeave;
