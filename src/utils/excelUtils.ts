import * as XLSX from 'xlsx';
import { User, HourlyRecord, LeaveRecord } from '../types';
import { toLocalISOStringInThailand, calculateLeaveDays, getCurrentFiscalYear, formatHoursAndMinutes } from './dateUtils';
import { Holidays } from '../types';

export function exportAllDataToExcel(
  users: User[],
  allLeaveRecords: LeaveRecord[],
  allHourlyRecords: HourlyRecord[],
  holidays: Holidays
): void {
  const usersData = users.map(u => ({
    'ชื่อ-สกุล': u.fullname,
    'ชื่อเล่น': u.nickname,
    'ตำแหน่ง': u.position
  }));

  const leaveRecordsData = allLeaveRecords.map(r => {
    const user = users.find(u => u.nickname === r.userNickname) || {} as User;
    const leaveDays = calculateLeaveDays(r.startDate, r.endDate, r.startPeriod, r.endPeriod, holidays);
    return {
      'ปีงบประมาณ': r.fiscalYear,
      'วันที่บันทึก': r.createdDate ? new Date(r.createdDate.seconds * 1000) : 'N/A',
      'ชื่อ-สกุล': user.fullname || r.userNickname,
      'ชื่อเล่น': user.nickname || r.userNickname,
      'ตำแหน่ง': user.position || 'N/A',
      'ประเภทการลา': r.leaveType,
      'วันลาเริ่มต้น': r.startDate,
      'วันลาสิ้นสุด': r.endDate,
      'ช่วงเวลาเริ่มต้น': r.startPeriod,
      'ช่วงเวลาสิ้นสุด': r.endPeriod,
      'จำนวนวันลา': leaveDays,
      'สถานะ': r.status,
      'ผู้อนุมัติ': r.approver
    };
  }).sort((a, b) => {
    const da = a['วันที่บันทึก'] instanceof Date ? a['วันที่บันทึก'].getTime() : 0;
    const db2 = b['วันที่บันทึก'] instanceof Date ? b['วันที่บันทึก'].getTime() : 0;
    return db2 - da;
  });

  const hourlyRecordsData = allHourlyRecords.map(r => {
    const user = users.find(u => u.nickname === r.userNickname) || {} as User;
    return {
      'ปีงบประมาณ': r.fiscalYear,
      'วันที่บันทึก': r.timestamp ? new Date(r.timestamp.seconds * 1000) : 'N/A',
      'ชื่อ-สกุล': user.fullname || r.userNickname,
      'ชื่อเล่น': user.nickname || r.userNickname,
      'ตำแหน่ง': user.position || 'N/A',
      'ประเภทรายการ': r.type === 'leave' ? 'ลาชั่วโมง' : 'ใช้ชั่วโมง',
      'วันที่': r.date,
      'เวลาเริ่มต้น': r.startTime,
      'เวลาสิ้นสุด': r.endTime,
      'ระยะเวลา (ชม.)': r.duration,
      'สถานะ': r.confirmed ? 'อนุมัติแล้ว' : 'รออนุมัติ',
      'ผู้อนุมัติ': r.approver
    };
  }).sort((a, b) => {
    const da = a['วันที่บันทึก'] instanceof Date ? a['วันที่บันทึก'].getTime() : 0;
    const db2 = b['วันที่บันทึก'] instanceof Date ? b['วันที่บันทึก'].getTime() : 0;
    return db2 - da;
  });

  const fiscalYear = getCurrentFiscalYear();
  const summaryMap: Record<string, { nickname: string; position: string; leaveHours: number; usedHours: number }> = {};
  users.forEach(u => {
    summaryMap[u.nickname] = { nickname: u.nickname, position: u.position, leaveHours: 0, usedHours: 0 };
  });
  allHourlyRecords.forEach(r => {
    if (r.fiscalYear === fiscalYear && summaryMap[r.userNickname] && r.confirmed) {
      if (r.type === 'leave') summaryMap[r.userNickname].leaveHours += r.duration || 0;
      else if (r.type === 'use') summaryMap[r.userNickname].usedHours += r.duration || 0;
    }
  });
  const summaryData = Object.values(summaryMap).map(item => ({
    'ชื่อเล่น': item.nickname,
    'ตำแหน่ง': item.position,
    'ชั่วโมงที่ลา (อนุมัติ)': item.leaveHours,
    'ชั่วโมงที่ใช้ (อนุมัติ)': item.usedHours,
    'คงเหลือ (ชม.)': item.usedHours - item.leaveHours,
    'สถานะ': (item.usedHours - item.leaveHours) >= 0 ? 'ปกติ' : 'ติดลบ'
  })).sort((a, b) => a['คงเหลือ (ชม.)'] - b['คงเหลือ (ชม.)']);

  const wb = XLSX.utils.book_new();

  const fitToColumn = (data: Record<string, unknown>[]) => {
    if (!data || data.length === 0) return [];
    const columnWidths: { wch: number }[] = [];
    for (const key in data[0]) {
      columnWidths.push({ wch: Math.max(key.length, ...data.map(row => (row[key] || '').toString().length)) + 2 });
    }
    return columnWidths;
  };

  const wsUsers = XLSX.utils.json_to_sheet(usersData);
  const wsLeaveRecords = XLSX.utils.json_to_sheet(leaveRecordsData);
  const wsHourlyRecords = XLSX.utils.json_to_sheet(hourlyRecordsData);
  const wsSummary = XLSX.utils.json_to_sheet(summaryData);

  wsUsers['!cols'] = fitToColumn(usersData);
  wsLeaveRecords['!cols'] = fitToColumn(leaveRecordsData as Record<string, unknown>[]);
  wsHourlyRecords['!cols'] = fitToColumn(hourlyRecordsData as Record<string, unknown>[]);
  wsSummary['!cols'] = fitToColumn(summaryData);

  XLSX.utils.book_append_sheet(wb, wsSummary, `สรุปชั่วโมงปีงบ ${fiscalYear}`);
  XLSX.utils.book_append_sheet(wb, wsHourlyRecords, 'ข้อมูลลาชั่วโมงทั้งหมด');
  XLSX.utils.book_append_sheet(wb, wsLeaveRecords, 'ข้อมูลการลาทั้งหมด');
  XLSX.utils.book_append_sheet(wb, wsUsers, 'รายชื่อผู้ใช้');

  const today = toLocalISOStringInThailand(new Date());
  const filename = `leave-opd-backup-${today}.xlsx`;
  XLSX.writeFile(wb, filename);
}

export function exportDataToJSON(type: 'leave' | 'hourly', allLeaveRecords: LeaveRecord[], allHourlyRecords: HourlyRecord[]): void {
  let data: unknown[];
  let filename: string;
  const today = toLocalISOStringInThailand(new Date());

  if (type === 'leave') {
    data = allLeaveRecords;
    filename = `leave-records-${today}.json`;
  } else {
    data = allHourlyRecords;
    filename = `hourly-records-${today}.json`;
  }

  const jsonStr = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Re-export formatHoursAndMinutes for use in export display
export { formatHoursAndMinutes };
