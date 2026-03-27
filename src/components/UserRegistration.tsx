import React, { useState, useMemo } from 'react';
import Swal from 'sweetalert2';
import { User } from '../types';
import { addUser, updateUser, checkNicknameExists } from '../hooks/useFirestore';
import PinModal from './PinModal';

interface UserRegistrationProps {
  users: User[];
}

const RECORDS_PER_PAGE = 10;

const UserRegistration: React.FC<UserRegistrationProps> = ({ users }) => {
  const [fullname, setFullname] = useState('');
  const [nickname, setNickname] = useState('');
  const [position, setPosition] = useState('');
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');

  const [searchName, setSearchName] = useState('');
  const [filterPosition, setFilterPosition] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const [pinModal, setPinModal] = useState<{
    open: boolean; correctPin: string; title: string; summaryHtml: string; onSuccess: () => void;
  }>({ open: false, correctPin: '', title: '', summaryHtml: '', onSuccess: () => {} });

  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      const nameMatch = !searchName || u.fullname.toLowerCase().includes(searchName.toLowerCase()) || u.nickname.toLowerCase().includes(searchName.toLowerCase());
      const posMatch = !filterPosition || u.position === filterPosition;
      return nameMatch && posMatch;
    });
  }, [users, searchName, filterPosition]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / RECORDS_PER_PAGE));
  const paginatedUsers = filteredUsers.slice((currentPage - 1) * RECORDS_PER_PAGE, currentPage * RECORDS_PER_PAGE);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fullname.trim() || !nickname.trim()) { Swal.fire({ icon: 'error', title: 'กรุณากรอกชื่อ-สกุลและชื่อเล่น' }); return; }
    if (!position) { Swal.fire({ icon: 'error', title: 'กรุณาเลือกตำแหน่ง' }); return; }
    if (!/^\d{4}$/.test(pin)) { Swal.fire({ icon: 'error', title: 'PIN ต้องเป็นตัวเลข 4 หลักเท่านั้น' }); return; }
    if (pin !== pinConfirm) { Swal.fire({ icon: 'error', title: 'PIN ทั้งสองช่องไม่ตรงกัน' }); return; }

    Swal.fire({ title: 'กำลังตรวจสอบ...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    try {
      const exists = await checkNicknameExists(nickname.trim());
      if (exists) { Swal.fire({ icon: 'error', title: `ชื่อเล่น "${nickname}" นี้มีในระบบแล้ว` }); return; }
      await addUser({ fullname: fullname.trim(), nickname: nickname.trim(), position, pin });
      Swal.fire({ icon: 'success', title: 'ลงทะเบียนสำเร็จ', confirmButtonText: 'ตกลง' });
      setFullname(''); setNickname(''); setPosition(''); setPin(''); setPinConfirm('');
    } catch {
      Swal.fire({ icon: 'error', title: 'ลงทะเบียนล้มเหลว' });
    }
  }

  async function handleEditUser(user: User) {
    const { value: formValues } = await Swal.fire({
      title: 'แก้ไขข้อมูลผู้ใช้',
      showCancelButton: true,
      confirmButtonText: 'อัปเดตข้อมูล',
      cancelButtonText: 'ยกเลิก',
      html: `
        <div class="space-y-4 text-left">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">ชื่อ-สกุล</label>
            <input id="swal-fullname" class="w-full p-2 border border-gray-300 rounded-lg" value="${user.fullname}" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">ชื่อเล่น</label>
            <input id="swal-nickname" class="w-full p-2 border border-gray-300 rounded-lg" value="${user.nickname}" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">ตำแหน่ง</label>
            <select id="swal-position" class="w-full p-2 border border-gray-300 rounded-lg">
              <option value="เภสัช" ${user.position === 'เภสัช' ? 'selected' : ''}>เภสัช</option>
              <option value="จพง" ${user.position === 'จพง' ? 'selected' : ''}>จพง</option>
              <option value="จนท" ${user.position === 'จนท' ? 'selected' : ''}>จนท</option>
            </select>
          </div>
        </div>
      `,
      preConfirm: () => {
        const fn = (document.getElementById('swal-fullname') as HTMLInputElement).value;
        const nn = (document.getElementById('swal-nickname') as HTMLInputElement).value;
        const pos = (document.getElementById('swal-position') as HTMLSelectElement).value;
        if (!fn.trim() || !nn.trim()) { Swal.showValidationMessage('กรุณากรอกข้อมูลให้ครบถ้วน'); return false; }
        const taken = users.some(u => u.id !== user.id && u.nickname === nn);
        if (taken) { Swal.showValidationMessage(`ชื่อเล่น "${nn}" นี้มีผู้ใช้อื่นแล้ว`); return false; }
        return { fullname: fn, nickname: nn, position: pos };
      }
    });

    if (formValues) {
      setPinModal({
        open: true,
        correctPin: user.pin,
        title: 'กรุณากรอก PIN เพื่อยืนยัน',
        summaryHtml: `<p class="text-center"><b>ยืนยันการแก้ไขข้อมูลสำหรับ</b></p><p class="text-center font-semibold text-blue-600 text-lg">${user.nickname}</p>`,
        onSuccess: async () => {
          setPinModal(p => ({ ...p, open: false }));
          Swal.fire({ title: 'กำลังบันทึก...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
          try {
            await updateUser(user.id, { fullname: formValues.fullname, nickname: formValues.nickname, position: formValues.position });
            Swal.fire({ icon: 'success', title: 'อัปเดตข้อมูลสำเร็จ', confirmButtonText: 'ตกลง' });
          } catch {
            Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด' });
          }
        },
      });
    }
  }

  const positionBadge = (pos: string) => {
    const cls = pos === 'เภสัช' ? 'bg-blue-100 text-blue-700' : pos === 'จพง' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700';
    return <span className={`px-2 py-1 rounded-full text-xs font-medium ${cls}`}>{pos}</span>;
  };

  return (
    <div>
      <PinModal isOpen={pinModal.open} title={pinModal.title} summaryHtml={pinModal.summaryHtml} correctPin={pinModal.correctPin} onSuccess={pinModal.onSuccess} onCancel={() => setPinModal(p => ({ ...p, open: false }))} />

      {/* Registration Form */}
      <div className="bg-white rounded-2xl shadow-lg overflow-hidden mb-8">
        <div className="bg-gradient-to-r from-green-600 to-emerald-700 p-6 text-white">
          <h1 className="text-2xl font-bold">👤 ลงทะเบียน</h1>
          <p className="text-green-100 text-sm mt-1">กรุณากรอกข้อมูลให้ครบถ้วน</p>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">ชื่อ-สกุล</label>
            <input type="text" value={fullname} onChange={e => setFullname(e.target.value)} required placeholder="กรอกชื่อและนามสกุล" className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">ชื่อเล่น</label>
            <input type="text" value={nickname} onChange={e => setNickname(e.target.value)} required placeholder="กรอกชื่อเล่น" className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">ตำแหน่ง</label>
            <select value={position} onChange={e => setPosition(e.target.value)} required className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500">
              <option value="">เลือกตำแหน่ง</option>
              <option value="เภสัช">เภสัช</option>
              <option value="จพง">จพง</option>
              <option value="จนท">จนท</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">กำหนด PIN (ตัวเลข 4 หลัก)</label>
            <input type="password" value={pin} onChange={e => setPin(e.target.value)} required maxLength={4} pattern="[0-9]{4}" placeholder="กรอก PIN 4 หลัก" className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">ยืนยัน PIN</label>
            <input type="password" value={pinConfirm} onChange={e => setPinConfirm(e.target.value)} required maxLength={4} pattern="[0-9]{4}" placeholder="กรอก PIN อีกครั้ง" className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500" />
          </div>
          <button type="submit" className="w-full bg-gradient-to-r from-green-600 to-emerald-700 text-white py-3 rounded-xl font-semibold hover:opacity-90 transition-opacity">
            ลงทะเบียน
          </button>
        </form>
      </div>

      {/* User Table */}
      <div className="bg-white rounded-xl shadow-lg p-6">
        <h3 className="text-xl font-bold text-gray-800 mb-4">รายชื่อผู้ลงทะเบียนแล้ว</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4 p-4 bg-gray-50 rounded-lg">
          <input type="text" placeholder="ค้นหาชื่อ-ชื่อเล่น..." value={searchName} onChange={e => { setSearchName(e.target.value); setCurrentPage(1); }} className="p-2 border rounded-lg col-span-2 text-sm" />
          <select value={filterPosition} onChange={e => { setFilterPosition(e.target.value); setCurrentPage(1); }} className="p-2 border rounded-lg col-span-2 text-sm">
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
                {['ชื่อ-สกุล', 'ชื่อเล่น', 'ตำแหน่ง', 'การจัดการ'].map(h => (
                  <th key={h} className="px-4 py-3 text-center text-sm font-medium text-gray-700">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginatedUsers.map(user => (
                <tr key={user.id} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm">{user.fullname}</td>
                  <td className="px-4 py-3 text-sm">{user.nickname}</td>
                  <td className="px-4 py-3">{positionBadge(user.position)}</td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => handleEditUser(user)} className="p-2 rounded-full hover:bg-blue-100 text-blue-600" title="แก้ไข">
                      <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" />
                        <path fillRule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
              {paginatedUsers.length === 0 && <tr><td colSpan={4} className="py-6 text-center text-gray-400">ไม่มีข้อมูล</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="flex justify-between items-center mt-4">
          <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="bg-gray-200 hover:bg-gray-300 px-4 py-2 rounded-l disabled:opacity-50">ก่อนหน้า</button>
          <span className="text-sm">หน้า {currentPage} / {totalPages}</span>
          <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="bg-gray-200 hover:bg-gray-300 px-4 py-2 rounded-r disabled:opacity-50">ถัดไป</button>
        </div>
      </div>
    </div>
  );
};

export default UserRegistration;
