import { Timestamp } from 'firebase/firestore';

export interface User {
  id: string;
  fullname: string;
  nickname: string;
  position: string;
  pin: string;
}

export interface Admin {
  id: string;
  username: string;
  pin: string;
}

export interface HourlyRecord {
  id: string;
  fiscalYear: number;
  userNickname: string;
  date: string;
  startTime: string;
  endTime: string;
  duration: number;
  type: 'leave' | 'use';
  note: string;
  approver: string;
  confirmed: boolean;
  timestamp?: Timestamp;
}

export interface LeaveRecord {
  id: string;
  fiscalYear: number;
  userNickname: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  startPeriod: string;
  endPeriod: string;
  approver: string;
  note: string;
  status: string;
  createdDate?: Timestamp;
  period?: string;
}

export type TabName = 'hourly' | 'leave' | 'calendar' | 'register' | 'pin' | 'admin-dashboard';

export type CalendarView = 'day' | 'week' | 'month' | 'year';

export interface HourlySummaryItem {
  nickname: string;
  position: string;
  leaveHours: number;
  usedHours: number;
  balance: number;
}

export interface LeaveSummaryItem {
  id: string;
  fullname: string;
  nickname: string;
  position: string;
  totalDays: number;
}

export type Holidays = Record<string, string>;
