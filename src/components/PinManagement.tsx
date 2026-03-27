import React, { useState, useMemo } from 'react';
import Swal from 'sweetalert2';
import { User, Admin } from '../types';
import { updateUserPin, updateAdminPin } from '../hooks/useFirestore';
import PinModal from './PinModal';
import UserSelect from './UserSelect';

interface PinManagementProps {
  users: User[];
  admins: Admin[];
}

const PinManagement: React.FC<PinManagementProps> = ({ users, admins }) => {
  const [selectedUser, setSelectedUser] = useState('');
  const [newPin, setNewPin] = useState('');
  const [newPinConfirm, setNewPinConfirm] = useState('');

  const [selectedAdmin, setSelectedAdmin] = useState('');
  const [newAdminPin, setNewAdminPin] = useState('');
  const [newAdminPinConfirm, setNewAdminPinConfirm] = useState('');

  const [pinModal, setPinModal] = useState<{
    open: boolean; correctPin: string; title: string; summaryHtml: string; onSuccess: () => void;
  }>({ open: false, correctPin: '', title: '', summaryHtml: '', onSuccess: () => {} });

  const userOptions = useMemo(
    () => users.map(u => ({ value: u.id, label: `${u.nickname} (${u.fullname}) - ${u.position}` })),
    [users]
  );

  const adminOptions = useMemo(
    () => admins.map(a => ({ value: a.id, label: a.username })),
    [admins]
  );

  // Change user PIN
  async function handleChangeUserPin(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedUser) { Swal.fire({ icon: 'error', title: 'กรุณาเลือกผู้ใช้' }); return; }
    if (!/^\d{4}$/.test(newPin)) { Swal.fire({ icon: 'error', title: 'PIN ต้องเป็นตัวเลข 4 หลัก' }); return; }
    if (newPin !== newPinConfirm) { Swal.fire({ icon: 'error', title: 'PIN ทั้งสองช่องไม่ตรงกัน' }); return; }

    const user = users.find(u => u.id === selectedUser);
    if (!user) return;

    setPinModal({
      open: true,
      correctPin: user.pin,
      title: 'กรุณากรอก PIN ปัจจุบันเพื่อยืนยัน',
      summaryHtml: `<p class="text-center">ยืนยันการเปลี่ยน PIN สำหรับ</p><p class="text-center font-semibold text-blue-600 text-lg">${user.nickname}</p>`,
      onSuccess: async () => {
        setPinModal(p => ({ ...p, open: false }));
        Swal.fire({ title: 'กำลังบันทึก...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        try {
          await updateUserPin(user.id, newPin);
          Swal.fire({ icon: 'success', title: 'เปลี่ยน PIN สำเร็จ', confirmButtonText: 'ตกลง' });
          setSelectedUser(''); setNewPin(''); setNewPinConfirm('');
        } catch {
          Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด กรุณาลองใหม่' });
        }
      },
    });
  }

  // Change admin PIN
  async function handleChangeAdminPin(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedAdmin) { Swal.fire({ icon: 'error', title: 'กรุณาเลือกแอดมิน' }); return; }
    if (!/^\d{4}$/.test(newAdminPin)) { Swal.fire({ icon: 'error', title: 'PIN ต้องเป็นตัวเลข 4 หลัก' }); return; }
    if (newAdminPin !== newAdminPinConfirm) { Swal.fire({ icon: 'error', title: 'PIN ทั้งสองช่องไม่ตรงกัน' }); return; }

    const admin = admins.find(a => a.id === selectedAdmin);
    if (!admin) return;

    setPinModal({
      open: true,
      correctPin: admin.pin,
      title: 'กรุณากรอก PIN ปัจจุบันเพื่อยืนยัน',
      summaryHtml: `<p class="text-center">ยืนยันการเปลี่ยน PIN แอดมิน</p><p class="text-center font-semibold text-yellow-600 text-lg">${admin.username}</p>`,
      onSuccess: async () => {
        setPinModal(p => ({ ...p, open: false }));
        Swal.fire({ title: 'กำลังบันทึก...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        try {
          await updateAdminPin(admin.id, newAdminPin);
          Swal.fire({ icon: 'success', title: 'เปลี่ยน PIN แอดมินสำเร็จ', confirmButtonText: 'ตกลง' });
          setSelectedAdmin(''); setNewAdminPin(''); setNewAdminPinConfirm('');
        } catch {
          Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด กรุณาลองใหม่' });
        }
      },
    });
  }

  const pinInput = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    placeholder: string,
    ringColor: string
  ) => (
    <div>
      <label className="block text-sm font-semibold text-gray-700 mb-1">{label}</label>
      <input
        type="password"
        value={value}
        onChange={e => onChange(e.target.value)}
        required
        maxLength={4}
        pattern="[0-9]{4}"
        placeholder={placeholder}
        className={`w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 ${ringColor}`}
      />
    </div>
  );

  return (
    <div className="space-y-6">
      <PinModal
        isOpen={pinModal.open}
        title={pinModal.title}
        summaryHtml={pinModal.summaryHtml}
        correctPin={pinModal.correctPin}
        onSuccess={pinModal.onSuccess}
        onCancel={() => setPinModal(p => ({ ...p, open: false }))}
      />

      {/* Side-by-side cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ── User PIN Card ── */}
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden flex flex-col">
          <div className="bg-gradient-to-r from-yellow-500 to-amber-600 p-5 text-white">
            <h2 className="text-xl font-bold">🔑 จัดการ PIN ผู้ใช้</h2>
            <p className="text-yellow-100 text-sm mt-0.5">เปลี่ยนรหัส PIN ส่วนตัวของผู้ใช้</p>
          </div>
          <form onSubmit={handleChangeUserPin} className="p-5 space-y-4 flex-1 flex flex-col">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">เลือกผู้ใช้</label>
              <UserSelect
                options={userOptions}
                value={selectedUser}
                onChange={setSelectedUser}
                placeholder="พิมพ์ค้นหาหรือเลือกผู้ใช้..."
                accentColor="orange"
                required
              />
            </div>

            {pinInput('PIN ใหม่ (4 หลัก)', newPin, setNewPin, 'กรอก PIN ใหม่ 4 หลัก', 'focus:ring-yellow-400')}
            {pinInput('ยืนยัน PIN ใหม่', newPinConfirm, setNewPinConfirm, 'กรอก PIN อีกครั้ง', 'focus:ring-yellow-400')}

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <p className="text-sm text-yellow-800">
                <span className="font-semibold">หมายเหตุ:</span> จำเป็นต้องกรอก PIN ปัจจุบันเพื่อยืนยันการเปลี่ยนแปลง
              </p>
            </div>
            <button
              type="submit"
              className="mt-auto w-full bg-gradient-to-r from-yellow-500 to-amber-600 text-white py-3 rounded-xl font-semibold hover:opacity-90 transition-opacity"
            >
              เปลี่ยน PIN ผู้ใช้
            </button>
          </form>
        </div>

        {/* ── Admin PIN Card ── */}
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden flex flex-col">
          <div className="bg-gradient-to-r from-red-600 to-rose-700 p-5 text-white">
            <h2 className="text-xl font-bold">👑 จัดการ PIN แอดมิน</h2>
            <p className="text-red-100 text-sm mt-0.5">เปลี่ยนรหัส PIN สำหรับแอดมิน</p>
          </div>
          <form onSubmit={handleChangeAdminPin} className="p-5 space-y-4 flex-1 flex flex-col">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">เลือกแอดมิน</label>
              <UserSelect
                options={adminOptions}
                value={selectedAdmin}
                onChange={setSelectedAdmin}
                placeholder="พิมพ์ค้นหาหรือเลือกแอดมิน..."
                accentColor="blue"
                required
              />
            </div>

            {pinInput('PIN ใหม่ (4 หลัก)', newAdminPin, setNewAdminPin, 'กรอก PIN ใหม่ 4 หลัก', 'focus:ring-red-400')}
            {pinInput('ยืนยัน PIN ใหม่', newAdminPinConfirm, setNewAdminPinConfirm, 'กรอก PIN อีกครั้ง', 'focus:ring-red-400')}

            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm text-red-800">
                <span className="font-semibold">หมายเหตุ:</span> จำเป็นต้องกรอก PIN แอดมินปัจจุบันเพื่อยืนยัน
              </p>
            </div>
            <button
              type="submit"
              className="mt-auto w-full bg-gradient-to-r from-red-600 to-rose-700 text-white py-3 rounded-xl font-semibold hover:opacity-90 transition-opacity"
            >
              เปลี่ยน PIN แอดมิน
            </button>
          </form>
        </div>
      </div>

      {/* ── User table ── */}
      <div className="bg-white rounded-xl shadow-lg p-6">
        <h3 className="text-xl font-bold text-gray-800 mb-4">รายชื่อผู้ใช้ในระบบ</h3>
        <div className="overflow-x-auto">
          <table className="w-full table-auto">
            <thead className="bg-gray-50">
              <tr>
                {['ชื่อ-สกุล', 'ชื่อเล่น', 'ตำแหน่ง', 'สถานะ PIN'].map(h => (
                  <th key={h} className="px-4 py-3 text-center text-sm font-medium text-gray-700">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map(user => (
                <tr key={user.id} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm">{user.fullname}</td>
                  <td className="px-4 py-3 text-sm font-medium text-blue-600">{user.nickname}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      user.position === 'เภสัช' ? 'bg-blue-100 text-blue-700' :
                      user.position === 'จพง'   ? 'bg-green-100 text-green-700' :
                                                   'bg-gray-100 text-gray-700'
                    }`}>{user.position}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      user.pin ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {user.pin ? 'ตั้งค่าแล้ว' : 'ยังไม่ตั้งค่า'}
                    </span>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr><td colSpan={4} className="py-6 text-center text-gray-400">ไม่มีข้อมูลผู้ใช้</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default PinManagement;
