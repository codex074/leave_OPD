import { useEffect, useState } from 'react';
import {
  collection,
  onSnapshot,
  doc,
  addDoc,
  deleteDoc,
  updateDoc,
  query,
  where,
  getDocs,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import { User, Admin, HourlyRecord, LeaveRecord } from '../types';

export function useUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'users'), (snapshot) => {
      const data = snapshot.docs
        .map(d => ({ id: d.id, ...d.data() } as User))
        .sort((a, b) => a.nickname.localeCompare(b.nickname, 'th'));
      setUsers(data);
      setLoading(false);
    });
    return unsub;
  }, []);

  return { users, loading };
}

export function useAdmins() {
  const [admins, setAdmins] = useState<Admin[]>([]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'admins'), (snapshot) => {
      const data = snapshot.docs
        .map(d => ({ id: d.id, ...d.data() } as Admin))
        .sort((a, b) => a.username.localeCompare(b.username, 'th'));
      setAdmins(data);
    });
    return unsub;
  }, []);

  return { admins };
}

export function useHourlyRecords() {
  const [records, setRecords] = useState<HourlyRecord[]>([]);

  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, 'hourlyRecords')), (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as HourlyRecord));
      setRecords(data);
    });
    return unsub;
  }, []);

  return { records };
}

export function useLeaveRecords() {
  const [records, setRecords] = useState<LeaveRecord[]>([]);

  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, 'leaveRecords')), (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as LeaveRecord));
      setRecords(data);
    });
    return unsub;
  }, []);

  return { records };
}

export function useSystemPin() {
  const [systemPin, setSystemPin] = useState<string | null>(null);

  useEffect(() => {
    const pinDocRef = doc(db, 'pin', 'config');
    const unsub = onSnapshot(pinDocRef, (docSnap) => {
      if (docSnap.exists()) {
        setSystemPin(docSnap.data().value);
      } else {
        setSystemPin(null);
      }
    });
    return unsub;
  }, []);

  return { systemPin };
}

export async function addHourlyRecord(data: Omit<HourlyRecord, 'id'>): Promise<void> {
  await addDoc(collection(db, 'hourlyRecords'), { ...data, timestamp: serverTimestamp() });
}

export async function addLeaveRecord(data: Omit<LeaveRecord, 'id'>): Promise<void> {
  await addDoc(collection(db, 'leaveRecords'), { ...data, createdDate: serverTimestamp() });
}

export async function deleteHourlyRecord(id: string): Promise<void> {
  await deleteDoc(doc(db, 'hourlyRecords', id));
}

export async function deleteLeaveRecord(id: string): Promise<void> {
  await deleteDoc(doc(db, 'leaveRecords', id));
}

export async function approveHourlyRecord(id: string): Promise<void> {
  await updateDoc(doc(db, 'hourlyRecords', id), { confirmed: true });
}

export async function approveLeaveRecord(id: string): Promise<void> {
  await updateDoc(doc(db, 'leaveRecords', id), { status: 'อนุมัติแล้ว' });
}

export async function addUser(data: Omit<User, 'id'>): Promise<void> {
  await addDoc(collection(db, 'users'), data);
}

export async function updateUser(id: string, data: Partial<Omit<User, 'id'>>): Promise<void> {
  await updateDoc(doc(db, 'users', id), data);
}

export async function updateUserPin(id: string, pin: string): Promise<void> {
  await updateDoc(doc(db, 'users', id), { pin });
}

export async function updateAdminPin(id: string, pin: string): Promise<void> {
  await updateDoc(doc(db, 'admins', id), { pin });
}

export async function checkNicknameExists(nickname: string): Promise<boolean> {
  const q = query(collection(db, 'users'), where('nickname', '==', nickname));
  const snapshot = await getDocs(q);
  return !snapshot.empty;
}

export async function batchApproveRecords(items: { id: string; type: 'leave' | 'hourly' }[]): Promise<void> {
  const promises = items.map(({ id, type }) => {
    if (type === 'leave') {
      return updateDoc(doc(db, 'leaveRecords', id), { status: 'อนุมัติแล้ว' });
    } else {
      return updateDoc(doc(db, 'hourlyRecords', id), { confirmed: true });
    }
  });
  await Promise.all(promises);
}
