import { Timestamp } from 'firebase/firestore';
import { Holidays } from '../types';

export function toLocalISOString(date: Date): string {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function toLocalISOStringInThailand(date: Date): string {
  const options: Intl.DateTimeFormatOptions = {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  };
  return new Intl.DateTimeFormat('en-CA', options).format(date);
}

export function getCurrentFiscalYear(): number {
  const now = new Date();
  const yearFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric'
  });
  const monthFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Bangkok',
    month: 'numeric'
  });
  const year = parseInt(yearFormatter.format(now));
  const month = parseInt(monthFormatter.format(now)) - 1;
  return month >= 9 ? year + 544 : year + 543;
}

export function computeFiscalYearFromDateString(isoDateStr: string): number | null {
  if (!isoDateStr) return null;
  const d = new Date(isoDateStr + 'T00:00:00');
  const year = d.getFullYear();
  const month = d.getMonth();
  return month >= 9 ? year + 544 : year + 543;
}

export function formatDateThaiShort(dateStrOrObj: string | Date | Timestamp | null | undefined): string {
  if (!dateStrOrObj) return '';
  let date: Date;
  if (dateStrOrObj instanceof Timestamp) {
    date = dateStrOrObj.toDate();
  } else if (typeof dateStrOrObj === 'string') {
    date = new Date(dateStrOrObj + (dateStrOrObj.length === 10 ? 'T00:00:00' : ''));
  } else {
    date = dateStrOrObj as Date;
  }
  const year = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' })).getFullYear() + 543;
  const shortYear = year.toString().slice(-2);
  return new Intl.DateTimeFormat('th-TH', {
    month: 'short',
    day: 'numeric',
    timeZone: 'Asia/Bangkok'
  }).format(date) + ' ' + shortYear;
}

export function formatDateTimeThaiShort(dateStrOrObj: string | Date | Timestamp | null | undefined): string {
  if (!dateStrOrObj) return '';
  let date: Date;
  if (dateStrOrObj instanceof Timestamp) {
    date = dateStrOrObj.toDate();
  } else if (typeof dateStrOrObj === 'string') {
    date = new Date(dateStrOrObj);
  } else {
    date = dateStrOrObj as Date;
  }
  const datePart = formatDateThaiShort(date);
  const timePart = new Intl.DateTimeFormat('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Bangkok'
  }).format(date);
  return `${datePart}, ${timePart} น.`;
}

export function formatHoursAndMinutes(decimalHours: number): string {
  if (isNaN(decimalHours)) return '0 ชม. 0 นาที';
  const hours = Math.floor(Math.abs(decimalHours));
  const minutes = Math.round((Math.abs(decimalHours) - hours) * 60);
  return `${hours} ชม. ${minutes} นาที`;
}

export function calculateDuration(startTime: string, endTime: string): { total: number; hours: number; minutes: number } {
  const start = new Date(`1970-01-01T${startTime}`);
  const end = new Date(`1970-01-01T${endTime}`);
  const diff = (end.getTime() - start.getTime()) / 3600000;
  return diff > 0
    ? { total: diff, hours: Math.floor(diff), minutes: Math.round((diff % 1) * 60) }
    : { total: 0, hours: 0, minutes: 0 };
}

export function calculateLeaveDays(
  startDate: string,
  endDate: string,
  startPeriod: string,
  endPeriod: string,
  holidays: Holidays
): number {
  const sDate = new Date(startDate + 'T00:00:00');
  const eDate = new Date(endDate + 'T00:00:00');
  if (sDate > eDate) return 0;

  const toYYYYMMDD = (d: Date): string => {
    const year = d.getFullYear();
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  if (sDate.getTime() === eDate.getTime()) {
    const isHalf = (startPeriod && startPeriod.includes('ครึ่งวัน')) || (endPeriod && endPeriod.includes('ครึ่งวัน'));
    return isHalf ? 0.5 : 1;
  }

  let leaveDayCount = 0;
  const currentDate = new Date(sDate);
  while (currentDate <= eDate) {
    const dateString = toYYYYMMDD(currentDate);
    const isWeekend = (currentDate.getDay() === 0 || currentDate.getDay() === 6);
    const isHoliday = !!holidays[dateString];
    if (!isWeekend && !isHoliday) {
      leaveDayCount++;
    }
    currentDate.setDate(currentDate.getDate() + 1);
  }

  const sDateString = toYYYYMMDD(sDate);
  const sDateIsWorkday = (sDate.getDay() !== 0 && sDate.getDay() !== 6 && !holidays[sDateString]);
  if (sDateIsWorkday && startPeriod && startPeriod.includes('ครึ่งวัน')) {
    leaveDayCount -= 0.5;
  }

  const eDateString = toYYYYMMDD(eDate);
  const eDateIsWorkday = (eDate.getDay() !== 0 && eDate.getDay() !== 6 && !holidays[eDateString]);
  if (eDateIsWorkday && endPeriod && endPeriod.includes('ครึ่งวัน')) {
    leaveDayCount -= 0.5;
  }

  return Math.max(0, leaveDayCount);
}

export function getLeaveTypeColor(leaveType: string): string {
  if (leaveType.includes('ป่วย')) return 'text-red-500';
  if (leaveType.includes('พักผ่อน')) return 'text-green-500';
  if (leaveType.includes('กิจ')) return 'text-purple-500';
  if (leaveType.includes('คลอด')) return 'text-pink-500';
  return 'text-gray-700';
}

export function getLeaveEventClass(leaveType: string): string {
  if (leaveType.includes('ป่วย')) return 'sick-leave';
  if (leaveType.includes('พักผ่อน')) return 'vacation-leave';
  if (leaveType.includes('กิจ')) return 'personal-leave';
  if (leaveType.includes('คลอด')) return 'maternity-leave';
  return 'personal-leave';
}

export function isApproved(rec: { status?: string; confirmed?: boolean; leaveType?: string }): boolean {
  if (!rec || typeof rec !== 'object') return false;
  if ('leaveType' in rec) {
    const raw = (rec.status || '').toString().trim();
    const s = raw.replace(/\s/g, '').toLowerCase();
    if (!s) return false;
    if (/(รอ|ยังไม่|ไม่อนุมัติ|ปฏิเสธ|reject|pending)/.test(s)) return false;
    if (/(อนุมัติแล้ว|อนุมัติ|approved|approve)/.test(s)) return true;
    return false;
  }
  if ('confirmed' in rec) return !!rec.confirmed;
  return false;
}

export function getWeekDays(date: Date): Date[] {
  const startOfWeek = new Date(date);
  startOfWeek.setDate(date.getDate() - date.getDay());
  const week: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(startOfWeek);
    day.setDate(startOfWeek.getDate() + i);
    week.push(day);
  }
  return week;
}
