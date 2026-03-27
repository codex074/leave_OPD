import React, { useState, useRef, useEffect } from 'react';
import Swal from 'sweetalert2';
import { User, HourlyRecord, LeaveRecord, CalendarView as CalendarViewType, Holidays } from '../types';
import {
  toLocalISOString,
  formatDateThaiShort,
  formatHoursAndMinutes,
  calculateDuration,
  calculateLeaveDays,
  getLeaveEventClass,
  isApproved,
  getWeekDays,
} from '../utils/dateUtils';

interface CalendarViewProps {
  users: User[];
  allLeaveRecords: LeaveRecord[];
  allHourlyRecords: HourlyRecord[];
  holidays: Holidays;
}

const CalendarView: React.FC<CalendarViewProps> = ({ users, allLeaveRecords, allHourlyRecords, holidays }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<CalendarViewType>('month');
  const [showFullDay, setShowFullDay] = useState(true);
  const [showHourly, setShowHourly] = useState(true);
  const [positionFilter, setPositionFilter] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function getEventsForDate(dateString: string) {
    let dayEvents = showFullDay ? allLeaveRecords.filter(r => dateString >= r.startDate && dateString <= r.endDate) : [];
    let hourlyDayEvents = showHourly ? allHourlyRecords.filter(r => r.date === dateString) : [];
    if (positionFilter) {
      dayEvents = dayEvents.filter(e => { const u = users.find(u => u.nickname === e.userNickname); return u && u.position === positionFilter; });
      hourlyDayEvents = hourlyDayEvents.filter(e => { const u = users.find(u => u.nickname === e.userNickname); return u && u.position === positionFilter; });
    }
    return [...dayEvents, ...hourlyDayEvents];
  }

  function showLeaveDetailModal(id: string) {
    const record = allLeaveRecords.find(r => r.id === id);
    if (!record) return;
    const user = users.find(u => u.nickname === record.userNickname);
    if (!user) return;
    const sp = record.startPeriod || record.period || 'เต็มวัน';
    const ep = record.endPeriod || record.period || 'เต็มวัน';
    const leaveDays = calculateLeaveDays(record.startDate, record.endDate, sp, ep, holidays);
    const dateDisplay = record.startDate === record.endDate
      ? `${formatDateThaiShort(record.startDate)} (${sp})`
      : `${formatDateThaiShort(record.startDate)} (${sp}) - ${formatDateThaiShort(record.endDate)} (${ep})`;
    Swal.fire({
      title: 'รายละเอียดการลา', confirmButtonText: 'ปิด',
      html: `<div class="space-y-1 text-left">
        <p><b>ชื่อ-สกุล:</b> ${user.fullname}</p>
        <p><b>ชื่อเล่น:</b> ${user.nickname}</p>
        <p><b>ตำแหน่ง:</b> ${user.position}</p>
        <p><b>ประเภทการลา:</b> ${record.leaveType}</p>
        <p><b>วันที่ลา:</b> ${dateDisplay}</p>
        <p><b>จำนวนวันลา:</b> ${leaveDays} วัน</p>
        <p><b>ผู้อนุมัติ:</b> ${record.approver}</p>
        <p><b>สถานะ:</b> ${record.status}</p>
      </div>`,
    });
  }

  function showHourlyDetailModal(id: string) {
    const record = allHourlyRecords.find(r => r.id === id);
    if (!record) return;
    const user = users.find(u => u.nickname === record.userNickname) || {} as User;
    Swal.fire({
      title: 'รายละเอียดลาชั่วโมง', confirmButtonText: 'ปิด',
      html: `<div class="space-y-1 text-left">
        <p><b>ชื่อ-สกุล:</b> ${user.fullname || record.userNickname}</p>
        <p><b>ตำแหน่ง:</b> ${user.position || '-'}</p>
        <p><b>ประเภท:</b> ${record.type === 'leave' ? 'ลาชั่วโมง' : 'ใช้ชั่วโมง'}</p>
        <p><b>วันที่:</b> ${formatDateThaiShort(record.date)}</p>
        <p><b>เวลา:</b> ${record.startTime} - ${record.endTime}</p>
        <p><b>รวมเวลา:</b> ${formatHoursAndMinutes(record.duration)}</p>
        <p><b>ผู้อนุมัติ:</b> ${record.approver || '-'}</p>
        <p><b>สถานะ:</b> ${record.confirmed ? 'อนุมัติแล้ว' : 'รออนุมัติ'}</p>
      </div>`,
    });
  }

  function showMoreEventsModal(dateString: string) {
    const events = getEventsForDate(dateString);
    const date = new Date(dateString + 'T00:00:00');
    let eventsHtml = '<div class="space-y-2">';
    events.forEach(event => {
      const user = users.find(u => u.nickname === event.userNickname);
      if (!user) return;
      const approved = isApproved(event as LeaveRecord | HourlyRecord);
      const pendingEmoji = !approved ? '⏳ ' : '';
      if ('leaveType' in event) {
        const colorMap: Record<string, string> = { 'ป่วย': 'bg-red-100 text-red-700', 'พักผ่อน': 'bg-green-100 text-green-700', 'คลอด': 'bg-pink-100 text-pink-700', 'กิจ': 'bg-purple-100 text-purple-700' };
        const tagColor = Object.keys(colorMap).find(k => event.leaveType.includes(k)) ? colorMap[Object.keys(colorMap).find(k => event.leaveType.includes(k))!] : 'bg-gray-100 text-gray-700';
        eventsHtml += `<div class="p-2 rounded-lg border ${approved ? 'border-green-200 bg-green-50' : 'border-yellow-200 bg-yellow-50'} cursor-pointer hover:opacity-80" onclick="window.dispatchEvent(new CustomEvent('showLeave', {detail:'${event.id}'}))">
          <span class="px-2 py-0.5 rounded text-xs font-bold ${tagColor}">${pendingEmoji}${event.leaveType}</span>
          <span class="ml-2 text-sm">${user.nickname} (${user.position})</span>
        </div>`;
      } else {
        const r = event as HourlyRecord;
        const isLeave = r.type === 'leave';
        const dur = calculateDuration(r.startTime, r.endTime);
        eventsHtml += `<div class="p-2 rounded-lg border ${approved ? 'border-blue-200 bg-blue-50' : 'border-yellow-200 bg-yellow-50'} cursor-pointer hover:opacity-80" onclick="window.dispatchEvent(new CustomEvent('showHourly', {detail:'${event.id}'}))">
          <span class="px-2 py-0.5 rounded text-xs font-bold ${isLeave ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}">${pendingEmoji}${isLeave ? 'ลาชม.' : 'ใช้ชม.'}</span>
          <span class="ml-2 text-sm ${isLeave ? 'text-red-600' : 'text-green-700'}">${user.nickname} (${user.position}) ${r.startTime}-${r.endTime} ${formatHoursAndMinutes(dur.total)}</span>
        </div>`;
      }
    });
    eventsHtml += '</div>';

    Swal.fire({
      title: `รายการลาทั้งหมดวันที่ ${formatDateThaiShort(date)}`,
      html: eventsHtml,
      confirmButtonText: 'ปิด',
      didOpen: () => {
        const leaveHandler = (e: Event) => { Swal.close(); showLeaveDetailModal((e as CustomEvent).detail); };
        const hourlyHandler = (e: Event) => { Swal.close(); showHourlyDetailModal((e as CustomEvent).detail); };
        window.addEventListener('showLeave', leaveHandler);
        window.addEventListener('showHourly', hourlyHandler);
      },
    });
  }

  function navigate(direction: number) {
    const d = new Date(currentDate);
    if (view === 'month') d.setMonth(d.getMonth() + direction);
    else if (view === 'week') d.setDate(d.getDate() + 7 * direction);
    else if (view === 'day') d.setDate(d.getDate() + direction);
    else if (view === 'year') d.setFullYear(d.getFullYear() + direction);
    setCurrentDate(d);
  }

  function getTitle() {
    if (view === 'month') return new Intl.DateTimeFormat('th-TH', { month: 'long', year: 'numeric' }).format(currentDate);
    if (view === 'week') {
      const week = getWeekDays(currentDate);
      return `${formatDateThaiShort(week[0])} - ${formatDateThaiShort(week[6])}`;
    }
    if (view === 'day') return new Intl.DateTimeFormat('th-TH', { dateStyle: 'full' }).format(currentDate);
    if (view === 'year') return `ปี ${currentDate.getFullYear() + 543}`;
    return '';
  }

  function renderEventChip(event: LeaveRecord | HourlyRecord, compact = false) {
    const user = users.find(u => u.nickname === event.userNickname);
    if (!user) return null;
    const approved = isApproved(event);
    const pendingCls = !approved ? 'opacity-70 italic' : '';

    if ('leaveType' in event) {
      const colorMap: Record<string, string> = {
        sick: 'bg-red-400 text-white',
        vacation: 'bg-green-400 text-white',
        personal: 'bg-purple-400 text-white',
        maternity: 'bg-pink-400 text-white',
      };
      const key = event.leaveType.includes('ป่วย') ? 'sick'
        : event.leaveType.includes('พักผ่อน') ? 'vacation'
        : event.leaveType.includes('คลอด') ? 'maternity'
        : 'personal';
      return (
        <div
          key={event.id}
          className={`text-xs px-1 py-0.5 rounded mb-0.5 truncate cursor-pointer ${colorMap[key]} ${pendingCls}`}
          onClick={e => { e.stopPropagation(); showLeaveDetailModal(event.id); }}
        >
          {user.nickname}({user.position})-{event.leaveType}
        </div>
      );
    } else {
      const r = event as HourlyRecord;
      const isLeave = r.type === 'leave';
      return (
        <div
          key={event.id}
          className={`text-xs px-1 py-0.5 rounded mb-0.5 truncate cursor-pointer ${isLeave ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'} ${pendingCls}`}
          onClick={e => { e.stopPropagation(); showHourlyDetailModal(event.id); }}
        >
          {isLeave ? '🔴' : '🟢'} {user.nickname} ({isLeave ? 'ลาชม.' : 'ใช้ชม.'})
        </div>
      );
    }
  }

  const renderMonthView = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const today = new Date();
    const firstDayOfMonth = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();
    const totalCells = 42;

    const cells = [];
    for (let i = 0; i < firstDayOfMonth; i++) {
      const day = daysInPrevMonth - firstDayOfMonth + 1 + i;
      cells.push(<div key={`prev-${i}`} className="calendar-day-cell bg-gray-50 p-1 min-h-24 text-gray-300 border border-gray-100"><div className="text-sm">{day}</div></div>);
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const dateString = toLocalISOString(date);
      const holidayName = holidays[dateString];
      const isToday = date.toDateString() === today.toDateString();
      const isWeekend = date.getDay() === 0 || date.getDay() === 6;
      const events = getEventsForDate(dateString);

      cells.push(
        <div
          key={day}
          className={`border p-1 min-h-24 flex flex-col cursor-pointer transition-colors ${isToday ? 'bg-indigo-50 border-indigo-300' : isWeekend ? 'bg-orange-50 border-orange-100' : holidayName ? 'bg-red-50 border-red-100' : 'bg-white border-gray-100'}`}
          onClick={() => showMoreEventsModal(dateString)}
        >
          <div className={`text-sm font-semibold mb-0.5 ${isToday ? 'text-indigo-700' : holidayName ? 'text-red-600' : isWeekend ? 'text-orange-500' : 'text-gray-700'}`}>
            {day}
            {holidayName && <span className="ml-1 text-xs font-normal text-red-500 truncate block">{holidayName}</span>}
          </div>
          <div className="flex-1 overflow-hidden">
            {events.slice(0, 3).map(e => renderEventChip(e as LeaveRecord | HourlyRecord))}
            {events.length > 3 && <div className="text-xs text-indigo-600 hover:underline cursor-pointer">+{events.length - 3} เพิ่มเติม</div>}
          </div>
        </div>
      );
    }

    const remaining = totalCells - cells.length;
    for (let i = 1; i <= remaining; i++) {
      cells.push(<div key={`next-${i}`} className="calendar-day-cell bg-gray-50 p-1 min-h-24 text-gray-300 border border-gray-100"><div className="text-sm">{i}</div></div>);
    }

    return (
      <div>
        <div className="grid grid-cols-7 gap-0 text-center font-semibold text-gray-600 mb-1 text-sm">
          {['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'].map(d => <div key={d} className="py-2">{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-0">{cells}</div>
      </div>
    );
  };

  const renderWeekView = () => {
    const week = getWeekDays(currentDate);
    const todayStr = toLocalISOString(new Date());
    return (
      <div>
        <div className="grid grid-cols-7 gap-1 text-center font-semibold text-gray-600 mb-2 text-sm">
          {week.map(d => {
            const isToday = toLocalISOString(d) === todayStr;
            return <div key={d.toISOString()} className={`py-2 rounded-lg ${isToday ? 'bg-indigo-100 text-indigo-700' : ''}`}>
              {new Intl.DateTimeFormat('th-TH', { weekday: 'short' }).format(d)} {d.getDate()}
            </div>;
          })}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {week.map(d => {
            const dateString = toLocalISOString(d);
            const events = getEventsForDate(dateString);
            const isToday = dateString === todayStr;
            return (
              <div key={dateString} className={`border rounded-lg p-1 min-h-32 ${isToday ? 'bg-indigo-50 border-indigo-300' : 'bg-white border-gray-200'}`}>
                {events.map(e => renderEventChip(e as LeaveRecord | HourlyRecord, true))}
                {events.length === 0 && <div className="text-xs text-gray-300 text-center mt-4">-</div>}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderDayView = () => {
    const dateString = toLocalISOString(currentDate);
    const events = getEventsForDate(dateString);
    const holidayName = holidays[dateString];
    return (
      <div className="border rounded-xl p-4 bg-white">
        <div className="text-lg font-semibold text-gray-700 mb-3">
          {new Intl.DateTimeFormat('th-TH', { dateStyle: 'long' }).format(currentDate)}
          {holidayName && <span className="ml-2 text-sm text-red-500">({holidayName})</span>}
        </div>
        <div className="space-y-2">
          {events.length > 0 ? events.map(e => renderEventChip(e as LeaveRecord | HourlyRecord)) : <div className="text-gray-400 text-sm">ไม่มีรายการลา</div>}
        </div>
      </div>
    );
  };

  const renderYearView = () => {
    const year = currentDate.getFullYear();
    const today = new Date();
    const todayStr = toLocalISOString(today);
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {Array.from({ length: 12 }, (_, month) => {
          const monthDate = new Date(year, month, 1);
          const daysInMonth = new Date(year, month + 1, 0).getDate();
          const firstDay = monthDate.getDay();
          return (
            <div
              key={month}
              className="border rounded-xl p-3 bg-white hover:shadow-md cursor-pointer transition-shadow"
              onClick={() => { setCurrentDate(new Date(year, month, 1)); setView('month'); }}
            >
              <div className="text-sm font-semibold text-gray-700 mb-2 text-center">
                {new Intl.DateTimeFormat('th-TH', { month: 'long' }).format(monthDate)}
              </div>
              <div className="grid grid-cols-7 gap-0.5 text-center text-xs text-gray-400 mb-1">
                {['อ', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'].map((d, i) => <div key={i}>{d}</div>)}
              </div>
              <div className="grid grid-cols-7 gap-0.5">
                {Array.from({ length: firstDay }, (_, i) => <div key={`e-${i}`} />)}
                {Array.from({ length: daysInMonth }, (_, i) => {
                  const day = i + 1;
                  const dateStr = toLocalISOString(new Date(year, month, day));
                  const hasLeave = allLeaveRecords.some(r => dateStr >= r.startDate && dateStr <= r.endDate);
                  const isToday = dateStr === todayStr;
                  return (
                    <div key={day} className={`text-xs text-center rounded-full w-5 h-5 flex items-center justify-center mx-auto ${isToday ? 'bg-indigo-500 text-white' : hasLeave ? 'bg-green-200 text-green-800' : 'text-gray-500'}`}>
                      {day}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const viewLabels: Record<CalendarViewType, string> = { day: 'วัน', week: 'สัปดาห์', month: 'เดือน', year: 'ปี' };

  return (
    <div className="bg-white rounded-2xl shadow-xl p-6">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-center mb-4 gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => setCurrentDate(new Date())} className="px-3 py-2 border border-gray-300 rounded-lg text-gray-700 font-semibold hover:bg-gray-100 text-sm transition-colors">วันนี้</button>
          <div className="flex items-center gap-1">
            <button onClick={() => navigate(-1)} className="p-2 rounded-full hover:bg-gray-100 transition-colors">
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <button onClick={() => navigate(1)} className="p-2 rounded-full hover:bg-gray-100 transition-colors">
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>
          <h3 className="text-xl font-semibold text-gray-800 min-w-48">{getTitle()}</h3>
        </div>
        <div ref={dropdownRef} className="relative">
          <button onClick={() => setDropdownOpen(!dropdownOpen)} className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 font-semibold hover:bg-gray-100 transition-colors flex items-center gap-2 text-sm">
            <span>{viewLabels[view]}</span>
            <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </button>
          {dropdownOpen && (
            <div className="absolute right-0 mt-2 w-36 bg-white rounded-lg shadow-xl z-10 border">
              {(['day', 'week', 'month', 'year'] as CalendarViewType[]).map(v => (
                <button key={v} onClick={() => { setView(v); setDropdownOpen(false); }} className={`block w-full px-4 py-2 text-left text-gray-700 hover:bg-gray-100 text-sm ${view === v ? 'font-semibold bg-gray-50' : ''}`}>
                  {viewLabels[v]}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4 mb-4 pb-4 border-b">
        <span className="font-semibold text-gray-700 text-sm">ตัวกรอง:</span>
        <label className="inline-flex items-center cursor-pointer">
          <input type="checkbox" checked={showFullDay} onChange={e => setShowFullDay(e.target.checked)} className="w-4 h-4 text-green-600 rounded" />
          <span className="ml-2 text-sm text-gray-700">ลาในระบบ</span>
        </label>
        <label className="inline-flex items-center cursor-pointer">
          <input type="checkbox" checked={showHourly} onChange={e => setShowHourly(e.target.checked)} className="w-4 h-4 text-blue-600 rounded" />
          <span className="ml-2 text-sm text-gray-700">ลาชั่วโมง</span>
        </label>
        <div className="ml-auto">
          <select value={positionFilter} onChange={e => setPositionFilter(e.target.value)} className="p-2 border rounded-lg text-sm">
            <option value="">ทุกตำแหน่ง</option>
            <option value="เภสัช">เภสัช</option>
            <option value="จพง">จพง</option>
            <option value="จนท">จนท</option>
          </select>
        </div>
      </div>

      {/* Calendar Grid */}
      <div>
        {view === 'month' && renderMonthView()}
        {view === 'week' && renderWeekView()}
        {view === 'day' && renderDayView()}
        {view === 'year' && renderYearView()}
      </div>

      {/* Legend */}
      <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { cls: 'bg-red-400', label: 'ลาป่วย' },
          { cls: 'bg-green-400', label: 'ลาพักผ่อน' },
          { cls: 'bg-purple-400', label: 'ลากิจ' },
          { cls: 'bg-pink-400', label: 'ลาคลอด' },
        ].map(item => (
          <div key={item.label} className="flex items-center gap-2">
            <div className={`w-4 h-4 rounded ${item.cls}`} />
            <span className="text-sm text-gray-600">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CalendarView;
