import { HourlyRecord, LeaveRecord, User } from '../types';
import { formatDateThaiShort, formatHoursAndMinutes } from './dateUtils';

const TELEGRAM_TOKEN = '8256265459:AAGPbAd_-wDPW0FSZUm49SwZD8FdEzy2zTQ';
const TELEGRAM_CHAT_ID = '-1002988996292';
const SYSTEM_URL = 'https://codex074.github.io/leave_OPD/';

async function sendTelegramMessage(message: string): Promise<void> {
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  const params = {
    chat_id: TELEGRAM_CHAT_ID,
    text: message,
    parse_mode: 'HTML',
    reply_markup: JSON.stringify({
      inline_keyboard: [
        [{ text: '🔗 เปิดระบบแจ้งลา', url: SYSTEM_URL }]
      ]
    })
  };
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
    const data = await response.json();
    if (!data.ok) {
      console.error('Failed to send Telegram notification:', data.description);
    }
  } catch (error) {
    console.error('Error sending Telegram notification:', error);
  }
}

export async function sendHourlyTelegramNotification(hourlyData: Omit<HourlyRecord, 'id'>, user: User): Promise<void> {
  const typeDisplay = hourlyData.type === 'leave' ? 'ลาชั่วโมง 🔴' : 'ใช้ชั่วโมง 🟢';
  const durationDisplay = formatHoursAndMinutes(hourlyData.duration);
  const message = `
🔵⏰ <b>มีรายการแจ้งลาชั่วโมงใหม่</b> ⏰🔵
--------------------------------------
<b>ชื่อ:</b> ${user.fullname} (${user.nickname})-${user.position}
<b>ประเภท:</b> ${typeDisplay}
<b>วันที่:</b> ${formatDateThaiShort(hourlyData.date)}
<b>เวลา:</b> ${hourlyData.startTime} - ${hourlyData.endTime} (${durationDisplay})
<b>หมายเหตุ:</b> ${hourlyData.note || '-'}
--------------------------------------
👩‍⚕️ <b>ผู้อนุมัติ:</b> ${hourlyData.approver}
<i>*กรุณาตรวจสอบและอนุมัติในระบบ*</i>
  `;
  await sendTelegramMessage(message);
}

export async function sendLeaveTelegramNotification(leaveData: Omit<LeaveRecord, 'id'>, user: User, leaveDays: number): Promise<void> {
  const dateDisplay = leaveData.startDate === leaveData.endDate
    ? formatDateThaiShort(leaveData.startDate)
    : `${formatDateThaiShort(leaveData.startDate)} - ${formatDateThaiShort(leaveData.endDate)}`;

  let periodDisplay = '';
  if (leaveData.startDate === leaveData.endDate) {
    periodDisplay = `(${leaveData.startPeriod})`;
  } else {
    periodDisplay = `(เริ่ม${leaveData.startPeriod} - สิ้นสุด${leaveData.endPeriod})`;
  }

  const message = `
🔔📅 <b>มีรายการแจ้งลาใหม่</b> 📅 🔔
--------------------------------------
<b>ผู้ลา:</b> ${user.fullname} (${user.nickname})-${user.position}
<b>ประเภท:</b> ${leaveData.leaveType}
<b>วันที่:</b> ${dateDisplay} ${periodDisplay} (${leaveDays} วัน)
<b>หมายเหตุ:</b> ${leaveData.note || '-'}
--------------------------------------
👩‍⚕️ <b>ผู้อนุมัติ:</b> ${leaveData.approver}
<i>*กรุณาตรวจสอบและอนุมัติในระบบ*</i>
  `;
  await sendTelegramMessage(message);
}
