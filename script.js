import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, collection, onSnapshot, addDoc, doc, deleteDoc, updateDoc, query, where, serverTimestamp, orderBy, getDocs, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyAGxbhp7jrMCVwXoqycYT5IT2wBxp25XBM",
    authDomain: "leaveopd.firebaseapp.com",
    projectId: "leaveopd",
    storageBucket: "leaveopd.appspot.com",
    messagingSenderId: "198276583055",
    appId: "1:198276583055:web:0bd83371a70f0fb891aafa"
};


// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
window.db = db;
window.firebase = {
    collection, onSnapshot, addDoc, doc, deleteDoc, updateDoc, query, where, serverTimestamp, orderBy, getDocs, setDoc
};

// --- Global variables ---
let currentDate = new Date();
let users = [];
let filteredUsers = [];
let allHourlyRecords = [];
let filteredHourlyRecords = [];
let allLeaveRecords = [];
let filteredLeaveRecords = [];
let hourlyRecordsUnsubscribe, leaveRecordsUnsubscribe, usersUnsubscribe, pinUnsubscribe;
let tomSelectHourly, tomSelectLeave, tomSelectPinUser;
let hourlyRecordsCurrentPage = 1;
let hourlySummaryCurrentPage = 1;
let leaveRecordsCurrentPage = 1;
let leaveSummaryCurrentPage = 1;
let usersCurrentPage = 1;
let currentFullDayLeaveType = null;
const recordsPerPage = 10;
const summaryRecordsPerPage = 10;
let systemPIN = null;
let holidays = [];
let currentCalendarView = 'month'; // 'day', 'week', 'month', 'year'

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    showTab('hourly');
    populateFiscalYearFilters();
    initializeDataListeners();
    initializePinListener();
    setDefaultDate();
    setupEventListeners();
    updateDateTime();
    setInterval(updateDateTime, 1000);
});

function setupEventListeners() {
    const registerForm = document.getElementById('register-form');
    if (registerForm) registerForm.addEventListener('submit', handleRegisterSubmit);
    
    const hourlyForm = document.getElementById('hourly-form');
    if (hourlyForm) hourlyForm.addEventListener('submit', handleHourlySubmit);

    const leaveForm = document.getElementById('leave-form');
    if (leaveForm) leaveForm.addEventListener('submit', handleLeaveSubmit);

    const changePersonalPinForm = document.getElementById('change-personal-pin-form');
    if (changePersonalPinForm) changePersonalPinForm.addEventListener('submit', handleChangePersonalPin);

    ['leave-filter-fiscal-year', 'summary-search-name', 'summary-filter-position', 'records-search-name', 'records-filter-position', 'records-filter-start', 'records-filter-end'].forEach(id => {
        const element = document.getElementById(id);
        if(element) element.addEventListener('input', () => {
            leaveRecordsCurrentPage = 1; 
            leaveSummaryCurrentPage = 1;
            applyLeaveFiltersAndRender();
        });
    });
    ['hourly-filter-fiscal-year', 'hourly-search-name', 'hourly-filter-position', 'hourly-filter-start', 'hourly-filter-end', 'hourly-summary-filter-position'].forEach(id => {
        const element = document.getElementById(id);
        if(element) element.addEventListener('input', () => {
            hourlyRecordsCurrentPage = 1;
            hourlySummaryCurrentPage = 1;
            applyHourlyFiltersAndRender();
        });
    });
     ['user-search-name', 'user-filter-position'].forEach(id => {
        const element = document.getElementById(id);
        if(element) element.addEventListener('input', () => {
            usersCurrentPage = 1;
            applyUserFiltersAndRender();
        });
    });
    
    // Event listener for new animated radio buttons
    const radioOptions = document.querySelectorAll('.radio-option-animated');
    radioOptions.forEach(option => {
        option.addEventListener('click', function() {
            radioOptions.forEach(opt => opt.classList.remove('selected'));
            this.classList.add('selected');

            const radioInput = this.querySelector('input[type="radio"]');
            if (radioInput) radioInput.checked = true;
        });
    });

    // Event listener for new full-day leave buttons
    const leaveButtons = document.querySelectorAll('#leave-type-buttons-new .leave-type-btn');
    leaveButtons.forEach(button => {
        button.addEventListener('click', function() {
            leaveButtons.forEach(btn => {
                btn.classList.remove('active', 'bg-purple-500', 'bg-green-500', 'bg-red-500', 'bg-pink-500', 'text-white', 'border-purple-500', 'border-green-500', 'border-red-500', 'border-pink-500');
                btn.classList.add('text-gray-700', 'border-gray-300');
            });

            this.classList.add('active');
            this.classList.remove('text-gray-700', 'border-gray-300');
            
            const color = this.dataset.color;
            const type = this.dataset.type;
            
            const colorClasses = {
                purple: ['bg-purple-500', 'text-white', 'border-purple-500'],
                green: ['bg-green-500', 'text-white', 'border-green-500'],
                red: ['bg-red-500', 'text-white', 'border-red-500'],
                pink: ['bg-pink-500', 'text-white', 'border-pink-500'],
            };
            if(colorClasses[color]) {
                this.classList.add(...colorClasses[color]);
            }

            currentFullDayLeaveType = type;
        });
    });

    // Calendar View Dropdown
    const dropdownBtn = document.getElementById('view-dropdown-btn');
    const dropdownMenu = document.getElementById('view-dropdown-menu');
    if(dropdownBtn) {
        document.body.addEventListener('click', function(e) {
            if (e.target.closest('#view-dropdown-btn')) {
                dropdownMenu.classList.toggle('hidden');
            } else {
                dropdownMenu.classList.add('hidden');
            }
        });
    }
}

function initializePinListener() {
    const pinDocRef = doc(db, "pin", "config");
    if (pinUnsubscribe) pinUnsubscribe();
    pinUnsubscribe = onSnapshot(pinDocRef, (docSnap) => {
        if (docSnap.exists()) {
            systemPIN = docSnap.data().value;
        } else {
            systemPIN = null;
        }
        const pinContent = document.getElementById('pin-content');
        if (pinContent && !pinContent.classList.contains('hidden')) {
            renderPinManagementPage();
        }
    }, (error) => {
        console.error("Error fetching system PIN:", error);
        showErrorPopup("ไม่สามารถโหลดข้อมูล PIN ได้");
    });
}

async function initializeDataListeners() {
    if (usersUnsubscribe) usersUnsubscribe();
    usersUnsubscribe = onSnapshot(collection(db, "users"), (snapshot) => {
        users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a,b) => a.nickname.localeCompare(b.nickname, 'th'));
        populateUserDropdowns();
        applyUserFiltersAndRender();
        
        const hourlyFiscalYearEl = document.getElementById('hourly-filter-fiscal-year');
        if (hourlyFiscalYearEl) {
            const hourlyFiscalYear = parseInt(hourlyFiscalYearEl.value);
            if(hourlyFiscalYear) loadHourlyData(hourlyFiscalYear);
        }
        
        loadLeaveData(); 

        const dbStatus = document.getElementById('db-status');
        dbStatus.textContent = '✅ Connected to Firebase';
        dbStatus.className = 'bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-medium';
        
        hideInitialLoader();
    }, (error) => {
        console.error("Error fetching users: ", error);
        showErrorPopup('ไม่สามารถเชื่อมต่อฐานข้อมูลผู้ใช้ได้');
    });

    await loadHolidays();
    
    const calendarContent = document.getElementById('calendar-content');
    if (calendarContent && !calendarContent.classList.contains('hidden')) {
        renderCalendar();
    }
}

function loadHourlyData(fiscalYear) {
     if (!fiscalYear) return;
     if (hourlyRecordsUnsubscribe) hourlyRecordsUnsubscribe();
     const hourlyQuery = query(collection(db, "hourlyRecords"), where("fiscalYear", "==", fiscalYear));
     hourlyRecordsUnsubscribe = onSnapshot(hourlyQuery, (snapshot) => {
        allHourlyRecords = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        applyHourlyFiltersAndRender();
     }, (error) => console.error("Error in hourlyRecords listener: ", error));
}

function loadLeaveData() {
    if (leaveRecordsUnsubscribe) leaveRecordsUnsubscribe();
    const leaveQuery = query(collection(db, "leaveRecords"));
    leaveRecordsUnsubscribe = onSnapshot(leaveQuery, (snapshot) => {
        allLeaveRecords = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        applyLeaveFiltersAndRender();
        const calendarContent = document.getElementById('calendar-content');
        if (calendarContent && !calendarContent.classList.contains('hidden')) {
            renderCalendar();
        }
    }, (error) => console.error("Error in leaveRecords listener: ", error));
}

function populateFiscalYearFilters() {
    const selects = [document.getElementById('leave-filter-fiscal-year'), document.getElementById('hourly-filter-fiscal-year')];
    const currentFiscalYear = getCurrentFiscalYear();
    selects.forEach(select => {
        if (!select) return;
        select.innerHTML = '';
        for (let i = 2; i >= -2; i--) {
            const year = currentFiscalYear + i;
            const option = document.createElement('option');
            option.value = year;
            option.textContent = year;
            select.add(option);
        }
        select.value = currentFiscalYear;
    });
}

function hideInitialLoader() {
     const loader = document.getElementById('initial-loader');
     if (loader) loader.style.display = 'none';
}

function populateUserDropdowns() {
    const userOptions = users.map(user => ({ value: user.nickname, text: `${user.nickname} (${user.fullname})`}));
    
    if (tomSelectHourly) tomSelectHourly.destroy();
    if (tomSelectLeave) tomSelectLeave.destroy();
    if (tomSelectPinUser) tomSelectPinUser.destroy();

    const hourlyUserEl = document.getElementById('hourly-user');
    if (hourlyUserEl) {
        tomSelectHourly = new TomSelect(hourlyUserEl, { options: userOptions, create: false });
    }
    
    const leaveUserEl = document.getElementById('leave-user');
    if (leaveUserEl) tomSelectLeave = new TomSelect(leaveUserEl, { options: userOptions, create: false });

    const pinUserEl = document.getElementById('change-pin-user');
    if (pinUserEl) tomSelectPinUser = new TomSelect(pinUserEl, { options: userOptions, create: false });
}

// --- UI & TAB MANAGEMENT ---
window.showTab = function(tabName) {
    document.querySelectorAll('.tab-content').forEach(content => content.classList.add('hidden'));
    document.querySelectorAll('.menu-item').forEach(tab => tab.classList.remove('active-tab'));
    
    const contentEl = document.getElementById(tabName + '-content');
    const tabEl = document.getElementById(tabName + '-tab');

    if(contentEl) contentEl.classList.remove('hidden');
    if(tabEl) tabEl.classList.add('active-tab');
    
    const body = document.body;
    body.className = "bg-gray-50 min-h-screen";
    body.classList.add(`bg-theme-${tabName}`);

    if (tabName === 'calendar') renderCalendar();
    if (tabName === 'pin') {
        renderPinManagementPage();
        const pinUserEl = document.getElementById('change-pin-user');
        if (pinUserEl && (!tomSelectPinUser || tomSelectPinUser.destroyed)) {
             const userOptions = users.map(user => ({ value: user.nickname, text: `${user.nickname} (${user.fullname})`}));
             tomSelectPinUser = new TomSelect(pinUserEl, { options: userOptions, create: false });
        }
    }
    closeSidebar();
}

window.toggleSidebar = function() {
    document.getElementById('sidebar').classList.toggle('-translate-x-full');
    document.getElementById('sidebar-overlay').classList.toggle('hidden');
}
window.closeSidebar = function() {
    document.getElementById('sidebar').classList.add('-translate-x-full');
    document.getElementById('sidebar-overlay').classList.add('hidden');
}

function setDefaultDate() {
    const today = toLocalISOStringInThailand(new Date());
    const hourlyDateEl = document.getElementById('hourly-date');
    const leaveStartEl = document.getElementById('leave-start-date');
    const leaveEndEl = document.getElementById('leave-end-date');
    if(hourlyDateEl) hourlyDateEl.value = today;
    if(leaveStartEl) leaveStartEl.value = today;
    if(leaveEndEl) leaveEndEl.value = today;
}

// --- PIN Management ---
function renderPinManagementPage() {
    const container = document.getElementById('system-pin-management-container');
    if (!container) return;

    if (systemPIN === null) {
        container.innerHTML = `
            <div class="bg-white rounded-xl shadow-lg p-6">
                <h2 class="text-xl font-bold text-gray-800 mb-4 text-center">ตั้งค่า PIN ระบบ</h2>
                <p class="text-center text-sm text-gray-500 mb-6">ยังไม่มี PIN กลางของระบบ</p>
                <form id="set-pin-form">
                    <div class="mb-4">
                        <label for="initial-pin" class="block text-sm font-medium text-gray-700 mb-2">PIN 4 หลัก</label>
                        <input type="password" id="initial-pin" class="w-full" required maxlength="4" pattern="\\d{4}">
                    </div>
                    <div class="mb-6">
                        <label for="confirm-initial-pin" class="block text-sm font-medium text-gray-700 mb-2">ยืนยัน PIN</label>
                        <input type="password" id="confirm-initial-pin" class="w-full" required maxlength="4" pattern="\\d{4}">
                    </div>
                    <button type="submit" class="w-full bg-purple-600">บันทึก PIN ระบบ</button>
                </form>
            </div>
        `;
        document.getElementById('set-pin-form').addEventListener('submit', handleSetInitialPin);
    } else {
        container.innerHTML = `
            <div class="bg-white rounded-xl shadow-lg p-6">
                <h2 class="text-xl font-bold text-gray-800 mb-4 text-center">เปลี่ยน PIN ระบบ</h2>
                <form id="change-pin-form">
                    <div class="mb-4">
                        <label for="old-pin" class="block text-sm font-medium text-gray-700 mb-2">PIN ระบบเดิม</label>
                        <input type="password" id="old-pin" class="w-full" required maxlength="4" pattern="\\d{4}">
                    </div>
                    <div class="mb-4">
                        <label for="new-pin" class="block text-sm font-medium text-gray-700 mb-2">PIN ระบบใหม่</label>
                        <input type="password" id="new-pin" class="w-full" required maxlength="4" pattern="\\d{4}">
                    </div>
                    <div class="mb-6">
                        <label for="confirm-new-pin" class="block text-sm font-medium text-gray-700 mb-2">ยืนยัน PIN ระบบใหม่</label>
                        <input type="password" id="confirm-new-pin" class="w-full" required maxlength="4" pattern="\\d{4}">
                    </div>
                    <button type="submit" class="w-full bg-purple-600">เปลี่ยน PIN ระบบ</button>
                </form>
            </div>
        `;
        document.getElementById('change-pin-form').addEventListener('submit', handleChangePin);
    }
}

async function handleSetInitialPin(e) {
    e.preventDefault();
    const pin1 = document.getElementById('initial-pin').value;
    const pin2 = document.getElementById('confirm-initial-pin').value;

    if (pin1.length !== 4 || !/^\d{4}$/.test(pin1)) {
        return showErrorPopup('PIN ต้องเป็นตัวเลข 4 หลักเท่านั้น');
    }
    if (pin1 !== pin2) {
        return showErrorPopup('PIN ทั้งสองช่องไม่ตรงกัน');
    }

    showLoadingPopup('กำลังบันทึก PIN...');
    try {
        await setDoc(doc(db, "pin", "config"), { value: pin1 });
        showSuccessPopup('ตั้งค่า PIN สำเร็จ');
    } catch (error) {
        console.error("Error setting PIN:", error);
        showErrorPopup('ตั้งค่า PIN ล้มเหลว');
    }
}

async function handleChangePin(e) {
    e.preventDefault();
    const oldPin = document.getElementById('old-pin').value;
    const newPin1 = document.getElementById('new-pin').value;
    const newPin2 = document.getElementById('confirm-new-pin').value;

    if (oldPin !== systemPIN) {
        return showErrorPopup('PIN เดิมไม่ถูกต้อง');
    }
     if (newPin1.length !== 4 || !/^\d{4}$/.test(newPin1)) {
        return showErrorPopup('PIN ใหม่ต้องเป็นตัวเลข 4 หลักเท่านั้น');
    }
    if (newPin1 !== newPin2) {
        return showErrorPopup('PIN ใหม่ทั้งสองช่องไม่ตรงกัน');
    }
    if (oldPin === newPin1) {
        return showErrorPopup('PIN ใหม่ต้องไม่ซ้ำกับ PIN เดิม');
    }

    showLoadingPopup('กำลังเปลี่ยนรหัส PIN...');
    try {
        await updateDoc(doc(db, "pin", "config"), { value: newPin1 });
        showSuccessPopup('เปลี่ยนรหัส PIN สำเร็จ');
    } catch (error) {
        console.error("Error changing PIN:", error);
        showErrorPopup('เปลี่ยนรหัส PIN ล้มเหลว');
    }
}

async function getSystemPinConfirmation() {
    return new Promise((resolve) => {
        let pin = '';
        
        const pinModalHtml = `
            <div class="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-sm">
                <div class="text-center mb-8">
                    <div class="w-16 h-16 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path>
                        </svg>
                    </div>
                    <h1 class="text-2xl font-bold text-gray-800 mb-2">กรุณากรอกรหัสระบบ</h1>
                </div>
                <div id="pinDisplay" class="flex justify-center space-x-4 mb-8">
                    <div class="pin-dot w-4 h-4 rounded-full border-2 border-gray-300 bg-white"></div>
                    <div class="pin-dot w-4 h-4 rounded-full border-2 border-gray-300 bg-white"></div>
                    <div class="pin-dot w-4 h-4 rounded-full border-2 border-gray-300 bg-white"></div>
                    <div class="pin-dot w-4 h-4 rounded-full border-2 border-gray-300 bg-white"></div>
                </div>
                <div id="statusMessage" class="text-center mb-6 h-6">
                    <span class="text-sm text-gray-500">ใช้คีย์บอร์ดหรือแตะปุ่มด้านล่าง</span>
                </div>
                <div class="grid grid-cols-3 gap-2 mb-6">
                    ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => `<button class="keypad-btn bg-gray-50 hover:bg-gray-100 border-2 border-gray-300 text-2xl font-semibold text-gray-800 w-20 h-20 rounded-full flex items-center justify-center mx-auto" data-digit="${d}">${d}</button>`).join('')}
                    <button class="keypad-btn bg-red-50 hover:bg-red-100 border-2 border-red-200 text-red-600 w-20 h-20 rounded-full flex items-center justify-center mx-auto" data-action="cancel">
                        <svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                    <button class="keypad-btn bg-gray-50 hover:bg-gray-100 border-2 border-gray-300 text-2xl font-semibold text-gray-800 w-20 h-20 rounded-full flex items-center justify-center mx-auto" data-digit="0">0</button>
                    <button class="keypad-btn bg-red-50 hover:bg-red-100 border-2 border-red-200 text-red-600 w-20 h-20 rounded-full flex items-center justify-center mx-auto" data-action="delete">
                        <svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l6.414 6.414a2 2 0 001.414.586H19a2 2 0 002-2V7a2 2 0 00-2-2h-8.172a2 2 0 00-1.414.586L3 12z"></path></svg>
                    </button>
                </div>
            </div>
        `;

        Swal.fire({
            html: pinModalHtml,
            customClass: { popup: 'pin-modal' },
            showConfirmButton: false,
            showCancelButton: false,
            didOpen: (modal) => {
                const pinDisplay = modal.querySelector('#pinDisplay');
                const statusMessage = modal.querySelector('#statusMessage');
                const keypadButtons = modal.querySelectorAll('.keypad-btn');
                const dots = modal.querySelectorAll('.pin-dot');

                const updatePinDisplay = () => {
                    dots.forEach((dot, index) => {
                        if (index < pin.length) {
                            dot.classList.add('filled');
                            dot.style.backgroundColor = '#6366f1';
                            dot.style.borderColor = '#6366f1';
                        } else {
                            dot.classList.remove('filled');
                            dot.style.backgroundColor = 'white';
                            dot.style.borderColor = '#d1d5db';
                        }
                    });
                };

                const clearPin = () => {
                    pin = '';
                    updatePinDisplay();
                    statusMessage.innerHTML = '<span class="text-sm text-gray-500">ใช้คีย์บอร์ดหรือแตะปุ่มด้านล่าง</span>';
                };

                const handleIncorrectPin = () => {
                    statusMessage.innerHTML = '<span class="text-sm text-red-600 font-medium">✗ PIN ไม่ถูกต้อง</span>';
                    pinDisplay.classList.add('shake');
                    dots.forEach(dot => {
                        dot.style.backgroundColor = '#ef4444'; dot.style.borderColor = '#ef4444';
                        dot.style.boxShadow = '0 0 20px rgba(239, 68, 68, 0.5)';
                    });
                    setTimeout(() => {
                        pinDisplay.classList.remove('shake');
                        clearPin();
                    }, 1000);
                };

                const handleCorrectPin = () => {
                    statusMessage.innerHTML = '<span class="text-sm text-green-600 font-medium">✓ PIN ถูกต้อง!</span>';
                    pinDisplay.classList.add('success-pulse');
                     dots.forEach(dot => {
                        dot.style.backgroundColor = '#10b981'; dot.style.borderColor = '#10b981';
                        dot.style.boxShadow = '0 0 20px rgba(16, 185, 129, 0.5)';
                    });
                    setTimeout(() => {
                        Swal.close();
                        resolve(pin);
                    }, 800);
                };
                
                const checkPin = () => {
                    if (pin === systemPIN) handleCorrectPin();
                    else handleIncorrectPin();
                };
                
                const addDigit = (digit) => {
                    if (pin.length < 4) {
                        pin += digit;
                        updatePinDisplay();
                        if (pin.length === 4) setTimeout(checkPin, 300);
                    }
                };
                
                const deleteDigit = () => {
                    if (pin.length > 0) {
                        pin = pin.slice(0, -1);
                        updatePinDisplay();
                        statusMessage.innerHTML = '<span class="text-sm text-gray-500">ใช้คีย์บอร์ดหรือแตะปุ่มด้านล่าง</span>';
                    }
                };
                
                const cancel = () => {
                    Swal.close();
                    resolve(null);
                }

                keypadButtons.forEach(button => {
                    button.addEventListener('click', () => {
                        if (button.dataset.digit) addDigit(button.dataset.digit);
                        else if (button.dataset.action === 'delete') deleteDigit();
                        else if (button.dataset.action === 'cancel') cancel();
                    });
                });
                
                const handleKeyDown = (event) => {
                    event.stopPropagation();
                    if (event.key >= '0' && event.key <= '9') {
                        addDigit(event.key);
                    } else if (event.key === 'Backspace') {
                        event.preventDefault();
                        deleteDigit();
                    } else if (event.key === 'Escape') {
                        cancel();
                    }
                };

                modal.addEventListener('keydown', handleKeyDown);
                modal.tabIndex = -1;
                modal.focus();
            }
        });
    });
}


// --- UTILITY FUNCTIONS ---
async function loadHolidays() {
    try {
      const response = await fetch('holidays.json');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const holidayData = await response.json();
      holidays = holidayData;
      console.log('✅ โหลดข้อมูลวันหยุดจาก holidays.json สำเร็จ');
  
    } catch (error) {
      console.error("❌ ไม่สามารถโหลดไฟล์ holidays.json ได้:", error);
      holidays = []; 
    }
}

function toLocalISOString(date) {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function toLocalISOStringInThailand(date) {
    const options = {
        timeZone: 'Asia/Bangkok',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    };
    return new Intl.DateTimeFormat('en-CA', options).format(date);
}

function updateDateTime() {
    const now = new Date();
    const options = { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit',
        timeZone: 'Asia/Bangkok'
    };
    document.getElementById('datetime-display').textContent = now.toLocaleDateString('th-TH', options);
}

function getCurrentFiscalYear() {
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

function formatDateThaiShort(dateStrOrObj) {
    if (!dateStrOrObj) return '';
    const date = dateStrOrObj.toDate ? dateStrOrObj.toDate() : new Date(dateStrOrObj);
    const year = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' })).getFullYear() + 543;
    const shortYear = year.toString().slice(-2);

    return new Intl.DateTimeFormat('th-TH', { 
        month: 'short', 
        day: 'numeric',
        timeZone: 'Asia/Bangkok'
    }).format(date) + ' ' + shortYear;
}

function formatDateTimeThaiShort(dateStrOrObj) {
    if (!dateStrOrObj) return '';
    const date = dateStrOrObj.toDate ? dateStrOrObj.toDate() : new Date(dateStrOrObj);
    const datePart = formatDateThaiShort(date);
    const timePart = new Intl.DateTimeFormat('th-TH', { 
        hour: '2-digit', 
        minute: '2-digit', 
        hour12: false,
        timeZone: 'Asia/Bangkok'
    }).format(date);
    return `${datePart}, ${timePart} น.`;
}

function formatHoursAndMinutes(decimalHours) {
    if (isNaN(decimalHours)) return '0 ชม. 0 นาที';
    const hours = Math.floor(decimalHours);
    const minutes = Math.round((decimalHours - hours) * 60);
    return `${hours} ชม. ${minutes} นาที`;
}
function calculateDuration(startTime, endTime) {
    const start = new Date(`1970-01-01T${startTime}`);
    const end = new Date(`1970-01-01T${endTime}`);
    const diff = (end - start) / 3600000;
    return diff > 0 ? { total: diff, hours: Math.floor(diff), minutes: Math.round((diff % 1) * 60) } : { total: 0, hours: 0, minutes: 0 };
}

function calculateLeaveDays(startDate, endDate, startPeriod, endPeriod) {
    const sDate = new Date(startDate + 'T00:00:00');
    const eDate = new Date(endDate + 'T00:00:00');

    if (sDate > eDate) return 0;

    let leaveDayCount = 0;
    const currentDate = new Date(sDate);

    const toYYYYMMDD = (d) => {
        const year = d.getFullYear();
        const month = (d.getMonth() + 1).toString().padStart(2, '0');
        const day = d.getDate().toString().padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    while (currentDate <= eDate) {
        const dayOfWeek = currentDate.getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const dateString = toYYYYMMDD(currentDate);
        const isHoliday = holidays.find(h => h.date === dateString);

        if (!isWeekend && !isHoliday) {
            leaveDayCount++;
        }

        currentDate.setDate(currentDate.getDate() + 1);
    }

    const sDateString = toYYYYMMDD(sDate);
    const sDateIsWorkday = (sDate.getDay() !== 0 && sDate.getDay() !== 6 && !holidays.find(h => h.date === sDateString));
    if (sDateIsWorkday && startPeriod && startPeriod.includes('ครึ่งวัน')) {
         leaveDayCount -= 0.5;
    }

    if (sDate.getTime() !== eDate.getTime()) {
        const eDateString = toYYYYMMDD(eDate);
        const eDateIsWorkday = (eDate.getDay() !== 0 && eDate.getDay() !== 6 && !holidays.find(h => h.date === eDateString));
        if (eDateIsWorkday && endPeriod && endPeriod.includes('ครึ่งวัน')) {
             leaveDayCount -= 0.5;
        }
    }
    
    return Math.max(0, leaveDayCount);
}

function getPositionBadgeClass(position) {
    switch (position) {
        case 'เภสัช': return 'pos-เภสัช';
        case 'จพง': return 'pos-จพง';
        case 'จนท': return 'pos-จนท';
        default: return 'pos-default';
    }
}
function getLeaveTypeClass(leaveType) {
    if (leaveType.includes('ป่วย')) return 'text-red-500';
    if (leaveType.includes('พักผ่อน')) return 'text-green-500';
    if (leaveType.includes('กิจ')) return 'text-purple-500';
    if (leaveType.includes('คลอด')) return 'text-pink-500';
    return 'text-gray-700';
}

function showLoadingPopup(message = 'กำลังประมวลผล...') {
    Swal.fire({ title: message, allowOutsideClick: false, didOpen: () => { Swal.showLoading(); }});
}
function showSuccessPopup(message = 'สำเร็จ') {
    Swal.fire({ title: message, icon: 'success', confirmButtonText: 'ตกลง' });
}
function showErrorPopup(message = 'เกิดข้อผิดพลาด') {
    Swal.fire({ title: 'เกิดข้อผิดพลาด!', text: message, icon: 'error', confirmButtonText: 'ตกลง' });
}

// --- FORM SUBMISSIONS & PIN LOGIC ---

async function handleRegisterSubmit(e) {
    e.preventDefault();
    const fullname = document.getElementById('register-fullname').value.trim();
    const nickname = document.getElementById('register-nickname').value.trim();
    const pin = document.getElementById('register-pin').value;
    const pinConfirm = document.getElementById('register-pin-confirm').value;

    if (!fullname || !nickname) return showErrorPopup("กรุณากรอกชื่อ-สกุล และชื่อเล่นให้ครบถ้วน");
    
    if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
        return showErrorPopup('PIN ต้องเป็นตัวเลข 4 หลักเท่านั้น');
    }
    if (pin !== pinConfirm) {
        return showErrorPopup('PIN ทั้งสองช่องไม่ตรงกัน');
    }

    showLoadingPopup("กำลังตรวจสอบ...");
    try {
        const usersRef = collection(db, "users");
        const qNickname = query(usersRef, where("nickname", "==", nickname));
        const nicknameSnapshot = await getDocs(qNickname);
        if (!nicknameSnapshot.empty) return showErrorPopup(`ชื่อเล่น "${nickname}" นี้มีในระบบแล้ว`);
        
        showLoadingPopup("กำลังบันทึก...");
        await addDoc(usersRef, { 
            fullname, 
            nickname, 
            position: document.getElementById('register-position').value,
            pin: pin
        });
        showSuccessPopup('ลงทะเบียนสำเร็จ');
        e.target.reset();
    } catch (error) { showErrorPopup('ลงทะเบียนล้มเหลว: ' + error.message); }
}

async function handleChangePersonalPin(e) {
    e.preventDefault();
    const nickname = tomSelectPinUser.getValue();
    const oldPin = document.getElementById('old-personal-pin').value;
    const newPin = document.getElementById('new-personal-pin').value;
    const confirmNewPin = document.getElementById('confirm-new-personal-pin').value;

    if (!nickname) return showErrorPopup('กรุณาเลือกผู้ใช้');

    const user = users.find(u => u.nickname === nickname);
    if (!user) return showErrorPopup('ไม่พบข้อมูลผู้ใช้');

    if (oldPin !== user.pin) return showErrorPopup('PIN เดิมไม่ถูกต้อง');

    if (newPin.length !== 4 || !/^\d{4}$/.test(newPin)) {
        return showErrorPopup('PIN ใหม่ต้องเป็นตัวเลข 4 หลักเท่านั้น');
    }
    if (newPin !== confirmNewPin) return showErrorPopup('PIN ใหม่ทั้งสองช่องไม่ตรงกัน');
    if (oldPin === newPin) return showErrorPopup('PIN ใหม่ต้องไม่ซ้ำกับ PIN เดิม');

    showLoadingPopup('กำลังเปลี่ยนรหัส PIN...');
    try {
        const userDocRef = doc(db, "users", user.id);
        await updateDoc(userDocRef, { pin: newPin });
        showSuccessPopup('เปลี่ยนรหัส PIN สำเร็จ');
        user.pin = newPin;
        e.target.reset();
        tomSelectPinUser.clear();
    } catch (error) {
        console.error("Error changing personal PIN:", error);
        showErrorPopup('เปลี่ยนรหัส PIN ล้มเหลว');
    }
}

async function handleHourlySubmit(e) {
    e.preventDefault();
    
    const selectedTypeInput = document.querySelector('input[name="hourlyLeaveType"]:checked');
    if (!selectedTypeInput) return showErrorPopup('กรุณาเลือกประเภทรายการ');
    
    const currentLeaveType = selectedTypeInput.value;

    const formData = {
        fiscalYear: parseInt(document.getElementById('hourly-filter-fiscal-year').value),
        userNickname: tomSelectHourly.getValue(), 
        date: document.getElementById('hourly-date').value,
        startTime: document.getElementById('hourly-start').value, 
        endTime: document.getElementById('hourly-end').value,
        duration: calculateDuration(document.getElementById('hourly-start').value, document.getElementById('hourly-end').value).total,
        type: currentLeaveType, 
        note: document.getElementById('hourly-note').value, 
        confirmed: false,
    };

    if (formData.startTime >= formData.endTime) {
        return showErrorPopup('เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่มต้น');
    }
    if (!formData.userNickname) return showErrorPopup('กรุณาเลือกผู้ใช้');

    const conflict = hasHourlyConflict(formData.userNickname, formData.date, formData.startTime, formData.endTime);
    if (conflict) {
        Swal.fire({
            icon: 'warning',
            title: 'ตรวจพบรายการซ้ำซ้อน',
            html: `มีการบันทึกข้อมูลในช่วงเวลา <b>${conflict.startTime} - ${conflict.endTime}</b> ของวันนี้ไปแล้ว<br><br>กรุณาตรวจสอบข้อมูลอีกครั้ง`,
            confirmButtonText: 'รับทราบ',
            confirmButtonColor: '#f59e0b'
        });
        return; 
    }

    const durationText = formatHoursAndMinutes(formData.duration);
    const summaryHtml = `
        <p><b>ผู้ใช้:</b> ${formData.userNickname}</p>
        <p><b>ประเภท:</b> ${formData.type === 'leave' ? 'ลาชั่วโมง' : 'ใช้ชั่วโมง'}</p>
        <p><b>วันที่:</b> ${formatDateThaiShort(formData.date)}</p>
        <p><b>เวลา:</b> ${formData.startTime} - ${formData.endTime}</p>
        <p><b>รวมเป็นเวลา:</b> ${durationText}</p>
    `;

    const isPinCorrect = await confirmWithUserPin(formData.userNickname, summaryHtml);

    if (isPinCorrect) {
        showLoadingPopup();
        try {
            await addDoc(collection(db, "hourlyRecords"), {...formData, timestamp: serverTimestamp()});
            showSuccessPopup('บันทึกสำเร็จ');
            e.target.reset(); 
            tomSelectHourly.clear();
            setDefaultDate();
            document.querySelectorAll('.radio-option-animated').forEach(opt => opt.classList.remove('selected'));
        } catch (error) { showErrorPopup('บันทึกล้มเหลว'); }
    }
}

async function handleLeaveSubmit(e) {
    e.preventDefault();
    if (!currentFullDayLeaveType) {
        showErrorPopup('กรุณาเลือกประเภทการลา');
        return;
    }
    
    const formData = {
        fiscalYear: parseInt(document.getElementById('leave-filter-fiscal-year').value),
        userNickname: tomSelectLeave.getValue(), 
        leaveType: currentFullDayLeaveType,
        startDate: document.getElementById('leave-start-date').value,
        endDate: document.getElementById('leave-end-date').value,
        startPeriod: document.getElementById('leave-start-period').value,
        endPeriod: document.getElementById('leave-end-period').value,
        approver: document.getElementById('leave-approver').value, 
        note: document.getElementById('leave-note').value, 
        status: 'รออนุมัติ',
    };
    
    if (!formData.approver) {
        return showErrorPopup('กรุณาเลือกผู้อนุมัติ');
    }
    
    if (!formData.userNickname) return showErrorPopup('กรุณาเลือกผู้ลา');
    if (new Date(formData.endDate) < new Date(formData.startDate)) return showErrorPopup('วันที่สิ้นสุดต้องไม่มาก่อนวันที่เริ่มต้น');

    const conflict = hasFullDayConflict(formData.userNickname, formData.startDate, formData.endDate, formData.startPeriod, formData.endPeriod);
    if (conflict) {
        Swal.fire({
            icon: 'warning',
            title: 'ตรวจพบการลาซ้ำซ้อน',
            html: `คุณมีข้อมูลการลาในวันที่ <b>${formatDateThaiShort(conflict.date)}</b> อยู่แล้ว<br>(${conflict.type})<br><br>กรุณาตรวจสอบข้อมูลอีกครั้ง`,
            confirmButtonText: 'รับทราบ',
            confirmButtonColor: '#f59e0b'
        });
        return;
    }
    
    const leaveDays = calculateLeaveDays(formData.startDate, formData.endDate, formData.startPeriod, formData.endPeriod);
    const dateDisplay = formData.startDate === formData.endDate ? formatDateThaiShort(formData.startDate) : `${formatDateThaiShort(formData.startDate)} - ${formatDateThaiShort(formData.endDate)}`;
    let periodDisplay = '';
    if (formData.startDate === formData.endDate) {
        periodDisplay = formData.startPeriod;
    } else {
        periodDisplay = `เริ่มต้น (${formData.startPeriod}) ถึง สิ้นสุด (${formData.endPeriod})`;
    }
    
    const summaryHtml = `
        <p><b>ผู้ลา:</b> ${formData.userNickname}</p>
        <p><b>ประเภท:</b> ${formData.leaveType}</p>
        <p><b>วันที่:</b> ${dateDisplay}</p>
        <p><b>ช่วงเวลา:</b> ${periodDisplay}</p>
        <p><b>จำนวนวันลา:</b> ${leaveDays} วัน</p>
    `;
    
    const isPinCorrect = await confirmWithUserPin(formData.userNickname, summaryHtml);

    if (isPinCorrect) {
        showLoadingPopup();
        try {
            await addDoc(collection(db, "leaveRecords"), {...formData, createdDate: serverTimestamp()});
            showSuccessPopup('บันทึกสำเร็จ');
            e.target.reset(); 
            tomSelectLeave.clear(); 
            setDefaultDate();
            currentFullDayLeaveType = null;
            
            const leaveButtons = document.querySelectorAll('#leave-type-buttons-new .leave-type-btn');
            leaveButtons.forEach(btn => {
                btn.classList.remove('active', 'bg-purple-500', 'bg-green-500', 'bg-red-500', 'bg-pink-500', 'text-white', 'border-purple-500', 'border-green-500', 'border-red-500', 'border-pink-500');
                btn.classList.add('text-gray-700', 'border-gray-300');
            });

        } catch (error) { showErrorPopup('บันทึกล้มเหลว');}
    }
}

async function confirmWithUserPin(nickname, summaryHtml) {
    const user = users.find(u => u.nickname === nickname);
    if (!user || !user.pin) {
        showErrorPopup('ไม่พบข้อมูล PIN สำหรับผู้ใช้นี้ หรือยังไม่ได้ตั้งค่า PIN');
        return false;
    }
    const correctPin = user.pin;

    return new Promise((resolve) => {
        let pin = '';
        
        const pinModalHtml = `
            <div class="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-sm">
                <div class="text-left text-sm mb-6 p-4 bg-gray-50 rounded-lg border">${summaryHtml}</div>
                <hr class="my-4"/>
                <h1 class="text-xl font-bold text-gray-800 mb-2 text-center">กรุณากรอก PIN เพื่อยืนยัน</h1>
                <div id="pinDisplay" class="flex justify-center space-x-4 mb-8">
                    <div class="pin-dot w-4 h-4 rounded-full border-2 border-gray-300 bg-white"></div>
                    <div class="pin-dot w-4 h-4 rounded-full border-2 border-gray-300 bg-white"></div>
                    <div class="pin-dot w-4 h-4 rounded-full border-2 border-gray-300 bg-white"></div>
                    <div class="pin-dot w-4 h-4 rounded-full border-2 border-gray-300 bg-white"></div>
                </div>
                <div id="statusMessage" class="text-center mb-6 h-6"></div>
                <div class="grid grid-cols-3 gap-2 mb-6">
                    ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => `<button class="keypad-btn bg-gray-50 hover:bg-gray-100 border-2 border-gray-300 text-2xl font-semibold text-gray-800 w-20 h-20 rounded-full flex items-center justify-center mx-auto" data-digit="${d}">${d}</button>`).join('')}
                    <button class="keypad-btn bg-red-50 hover:bg-red-100 border-2 border-red-200 text-red-600 w-20 h-20 rounded-full flex items-center justify-center mx-auto" data-action="cancel">
                        <svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                    <button class="keypad-btn bg-gray-50 hover:bg-gray-100 border-2 border-gray-300 text-2xl font-semibold text-gray-800 w-20 h-20 rounded-full flex items-center justify-center mx-auto" data-digit="0">0</button>
                    <button class="keypad-btn bg-red-50 hover:bg-red-100 border-2 border-red-200 text-red-600 w-20 h-20 rounded-full flex items-center justify-center mx-auto" data-action="delete">
                        <svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l6.414 6.414a2 2 0 001.414.586H19a2 2 0 002-2V7a2 2 0 00-2-2h-8.172a2 2 0 00-1.414.586L3 12z"></path></svg>
                    </button>
                </div>
            </div>
        `;
        
        Swal.fire({
            html: pinModalHtml,
            customClass: { popup: 'pin-modal' },
            showConfirmButton: false,
            showCancelButton: false,
            didOpen: (modal) => {
                const pinDisplay = modal.querySelector('#pinDisplay');
                const statusMessage = modal.querySelector('#statusMessage');
                const keypadButtons = modal.querySelectorAll('.keypad-btn');
                const dots = modal.querySelectorAll('.pin-dot');

                const updatePinDisplay = () => {
                    dots.forEach((dot, index) => {
                        if (index < pin.length) {
                            dot.classList.add('filled');
                            dot.style.backgroundColor = '#6366f1';
                            dot.style.borderColor = '#6366f1';
                        } else {
                            dot.classList.remove('filled');
                            dot.style.backgroundColor = 'white';
                            dot.style.borderColor = '#d1d5db';
                        }
                    });
                };

                const clearPin = () => {
                    pin = '';
                    updatePinDisplay();
                };

                const handleIncorrectPin = () => {
                    statusMessage.innerHTML = '<span class="text-sm text-red-600 font-medium">✗ PIN ไม่ถูกต้อง</span>';
                    pinDisplay.classList.add('shake');
                    dots.forEach(dot => {
                        dot.style.backgroundColor = '#ef4444'; dot.style.borderColor = '#ef4444';
                    });
                    setTimeout(() => {
                        pinDisplay.classList.remove('shake');
                        clearPin();
                        statusMessage.innerHTML = '';
                    }, 1000);
                };

                const handleCorrectPin = () => {
                    statusMessage.innerHTML = '<span class="text-sm text-green-600 font-medium">✓ PIN ถูกต้อง!</span>';
                    pinDisplay.classList.add('success-pulse');
                     dots.forEach(dot => {
                        dot.style.backgroundColor = '#10b981'; dot.style.borderColor = '#10b981';
                    });
                    setTimeout(() => {
                        Swal.close();
                        resolve(true);
                    }, 800);
                };
                
                const checkPin = () => {
                    if (pin === correctPin) handleCorrectPin();
                    else handleIncorrectPin();
                };
                
                const addDigit = (digit) => {
                    if (pin.length < 4) {
                        pin += digit;
                        updatePinDisplay();
                        if (pin.length === 4) setTimeout(checkPin, 300);
                    }
                };
                
                const deleteDigit = () => {
                    if (pin.length > 0) {
                        pin = pin.slice(0, -1);
                        updatePinDisplay();
                        statusMessage.innerHTML = '';
                    }
                };
                
                const cancel = () => {
                    Swal.close();
                    resolve(false);
                }

                keypadButtons.forEach(button => {
                    button.addEventListener('click', () => {
                        if (button.dataset.digit) addDigit(button.dataset.digit);
                        else if (button.dataset.action === 'delete') deleteDigit();
                        else if (button.dataset.action === 'cancel') cancel();
                    });
                });
                
                const handleKeyDown = (event) => {
                    event.stopPropagation();
                    if (event.key >= '0' && event.key <= '9') { addDigit(event.key); } 
                    else if (event.key === 'Backspace') { event.preventDefault(); deleteDigit(); } 
                    else if (event.key === 'Escape') { cancel(); }
                };

                modal.addEventListener('keydown', handleKeyDown);
                modal.tabIndex = -1;
                modal.focus();
            }
        });
    });
}


// --- CONFLICT CHECKING FUNCTIONS ---
function hasHourlyConflict(nickname, date, newStartTime, newEndTime) {
    const newStart = new Date(`${date}T${newStartTime}`);
    const newEnd = new Date(`${date}T${newEndTime}`);

    const userRecordsOnDate = allHourlyRecords.filter(r => 
        r.userNickname === nickname && r.date === date
    );

    for (const record of userRecordsOnDate) {
        const existingStart = new Date(`${record.date}T${record.startTime}`);
        const existingEnd = new Date(`${record.date}T${record.endTime}`);
        if (newStart < existingEnd && existingStart < newEnd) {
            return record;
        }
    }
    return null;
}

function hasFullDayConflict(nickname, newStartDate, newEndDate, newStartPeriod, newEndPeriod) {
    const userRecords = allLeaveRecords.filter(r => r.userNickname === nickname);
    
    let currentDate = new Date(newStartDate + 'T00:00:00');
    const lastDate = new Date(newEndDate + 'T00:00:00');

    while (currentDate <= lastDate) {
        const dateStr = toLocalISOString(currentDate);
        
        let newPeriodForCurrentDay;
        if (dateStr === newStartDate) {
            newPeriodForCurrentDay = newStartPeriod;
        } else if (dateStr === newEndDate) {
            newPeriodForCurrentDay = newEndPeriod;
        } else {
            newPeriodForCurrentDay = 'เต็มวัน';
        }

        const existingLeavesOnDay = userRecords.filter(r => {
            const existingStart = new Date(r.startDate + 'T00:00:00');
            const existingEnd = new Date(r.endDate + 'T00:00:00');
            return currentDate >= existingStart && currentDate <= existingEnd;
        });

        if (existingLeavesOnDay.length > 0) {
            let existingMorning = false;
            let existingAfternoon = false;

            for (const leave of existingLeavesOnDay) {
                const isSingleDayLeave = leave.startDate === leave.endDate;
                let period;
                if (isSingleDayLeave) {
                    period = leave.startPeriod;
                } else if (dateStr === leave.startDate) {
                    period = leave.startPeriod;
                } else if (dateStr === leave.endDate) {
                    period = leave.endPeriod;
                } else {
                    period = 'เต็มวัน';
                }

                if (period === 'เต็มวัน') {
                    return { date: dateStr, type: 'มีรายการลาเต็มวันอยู่แล้ว' };
                }
                if (period === 'ครึ่งวัน-เช้า') {
                    existingMorning = true;
                }
                if (period === 'ครึ่งวัน-บ่าย') {
                    existingAfternoon = true;
                }
            }

            if (existingMorning && existingAfternoon) {
                 return { date: dateStr, type: 'มีรายการลาทั้งเช้าและบ่ายแล้ว' };
            }
            if (newPeriodForCurrentDay === 'เต็มวัน' && (existingMorning || existingAfternoon)) {
                return { date: dateStr, type: 'มีรายการลาครึ่งวันอยู่แล้ว' };
            }
            if (newPeriodForCurrentDay === 'ครึ่งวัน-เช้า' && existingMorning) {
                return { date: dateStr, type: 'มีรายการลาช่วงเช้าอยู่แล้ว' };
            }
            if (newPeriodForCurrentDay === 'ครึ่งวัน-บ่าย' && existingAfternoon) {
                return { date: dateStr, type: 'มีรายการลาช่วงบ่ายอยู่แล้ว' };
            }
        }
        
        currentDate.setDate(currentDate.getDate() + 1);
    }

    return null;
}


// --- DATA FILTERING & RENDERING ---
function applyHourlyFiltersAndRender() {
    const fiscalYearEl = document.getElementById('hourly-filter-fiscal-year');
    if (!fiscalYearEl) return;
    const fiscalYear = parseInt(fiscalYearEl.value);

    const searchTerm = document.getElementById('hourly-search-name')?.value.toLowerCase() || '';
    const position = document.getElementById('hourly-filter-position')?.value || '';
    const startDate = document.getElementById('hourly-filter-start')?.value || '';
    const endDate = document.getElementById('hourly-filter-end')?.value || '';

    filteredHourlyRecords = allHourlyRecords.filter(record => {
        if (record.fiscalYear !== fiscalYear) return false;
        const user = users.find(u => u.nickname === record.userNickname);
        if (!user) return false;

        const nameMatch = user.fullname.toLowerCase().includes(searchTerm) || user.nickname.toLowerCase().includes(searchTerm);
        const positionMatch = !position || user.position === position;
        const dateMatch = (!startDate || record.date >= startDate) && (!endDate || record.date <= endDate);
        
        return nameMatch && positionMatch && dateMatch;
    });
    
    const summaryPositionFilter = document.getElementById('hourly-summary-filter-position')?.value || '';
    const summaryMap = {};
    const filteredSummaryUsers = users.filter(u => {
        if (!summaryPositionFilter) return true;
        return u.position === summaryPositionFilter;
    });

    filteredSummaryUsers.forEach(u => { 
        summaryMap[u.nickname] = { nickname: u.nickname, position: u.position, leaveHours: 0, usedHours: 0 }; 
    });
    
    allHourlyRecords.forEach(r => {
        if (r.fiscalYear === fiscalYear && summaryMap[r.userNickname]) {
            if (r.type === 'leave') summaryMap[r.userNickname].leaveHours += r.duration || 0;
            else if (r.type === 'use') summaryMap[r.userNickname].usedHours += r.duration || 0;
        }
    });
    
    const summary = Object.values(summaryMap).map(item => ({
        ...item,
        balance: item.usedHours - item.leaveHours
    }));

    summary.sort((a, b) => a.balance - b.balance);
    
    renderHourlySummary(summary);
    renderRankings(summary);
    renderHourlyRecords(filteredHourlyRecords);
}

function applyLeaveFiltersAndRender() {
    const fiscalYearEl = document.getElementById('leave-filter-fiscal-year');
    if(!fiscalYearEl) return;
    const fiscalYear = parseInt(fiscalYearEl.value);

    const fiscalYearSpan = document.getElementById('leave-summary-fiscal-year');
    if (fiscalYearSpan) fiscalYearSpan.textContent = fiscalYear;
    
    const summarySearchTerm = document.getElementById('summary-search-name')?.value.toLowerCase() || '';
    const summaryPosition = document.getElementById('summary-filter-position')?.value || '';
    let filteredSummaryUsers = users.filter(user => (user.fullname.toLowerCase().includes(summarySearchTerm) || user.nickname.toLowerCase().includes(summarySearchTerm)) && (!summaryPosition || user.position === summaryPosition));

    const recordsSearchTerm = document.getElementById('records-search-name')?.value.toLowerCase() || '';
    const recordsPosition = document.getElementById('records-filter-position')?.value || '';
    const recordsStart = document.getElementById('records-filter-start')?.value || '';
    const recordsEnd = document.getElementById('records-filter-end')?.value || '';

    filteredLeaveRecords = allLeaveRecords.filter(record => {
        if (record.fiscalYear !== fiscalYear) return false;
        const user = users.find(u => u.nickname === record.userNickname);
        if (!user) return false;
        const nameMatch = user.fullname.toLowerCase().includes(recordsSearchTerm) || user.nickname.toLowerCase().includes(recordsSearchTerm);
        const positionMatch = !recordsPosition || user.position === recordsPosition;
        const startDateMatch = !recordsStart || record.startDate >= recordsStart;
        const endDateMatch = !recordsEnd || record.endDate <= recordsEnd;
        return nameMatch && positionMatch && startDateMatch && endDateMatch;
    });
    
    renderLeaveSection(fiscalYear, filteredLeaveRecords, filteredSummaryUsers);
}

function applyUserFiltersAndRender() {
    const searchTerm = document.getElementById('user-search-name')?.value.toLowerCase() || '';
    const position = document.getElementById('user-filter-position')?.value || '';

    filteredUsers = users.filter(user => {
        const nameMatch = user.fullname.toLowerCase().includes(searchTerm) || user.nickname.toLowerCase().includes(searchTerm);
        const positionMatch = !position || user.position === position;
        return nameMatch && positionMatch;
    });
    
    renderUsersTable();
}

function renderLeaveSection(fiscalYear, records, summaryUsers) {
    const summaryMap = {};
    summaryUsers.forEach(u => { summaryMap[u.nickname] = { ...u, totalDays: 0 }; });
    allLeaveRecords.forEach(r => {
        const sPeriod = r.startPeriod || r.period;
        const ePeriod = r.endPeriod || r.period;
        if (r.fiscalYear === fiscalYear && r.status === 'อนุมัติแล้ว' && summaryMap[r.userNickname]) {
            summaryMap[r.userNickname].totalDays += calculateLeaveDays(r.startDate, r.endDate, sPeriod, ePeriod);
        }
    });

    const summaryData = Object.values(summaryMap);
    summaryData.sort((a, b) => b.totalDays - a.totalDays);
    
    renderLeaveSummary(summaryData);
    renderLeaveRecords(records);
}

function renderUsersTable() {
    const tbody = document.getElementById('users-table');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    const totalRecords = filteredUsers.length;
    const totalPages = Math.ceil(totalRecords / recordsPerPage);
    usersCurrentPage = Math.max(1, Math.min(usersCurrentPage, totalPages || 1));
    
    const startIndex = (usersCurrentPage - 1) * recordsPerPage;
    const paginatedUsers = filteredUsers.slice(startIndex, startIndex + recordsPerPage);

    paginatedUsers.forEach(user => {
        tbody.innerHTML += `
            <tr class="border-b hover:bg-gray-50">
                <td class="px-4 py-3">${user.fullname}</td>
                <td class="px-4 py-3">${user.nickname}</td>
                <td class="px-4 py-3"><span class="position-badge ${getPositionBadgeClass(user.position)}">${user.position}</span></td>
                <td class="px-4 py-3">
                    <button onclick="editUser('${user.id}')" class="p-2 rounded-full hover:bg-blue-100 text-blue-600" title="แก้ไข">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" />
                            <path fill-rule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clip-rule="evenodd" />
                        </svg>
                    </button>
                </td>
            </tr>`;
    });
    
    const pageInfo = document.getElementById('user-page-info');
    const prevBtn = document.getElementById('user-prev-btn');
    const nextBtn = document.getElementById('user-next-btn');

    if (pageInfo) pageInfo.textContent = `หน้า ${usersCurrentPage} / ${totalPages || 1}`;
    if (prevBtn) prevBtn.disabled = usersCurrentPage === 1;
    if (nextBtn) nextBtn.disabled = usersCurrentPage === totalPages || totalPages === 0;
}

function renderHourlySummary(summary) {
    const tbody = document.getElementById('hourly-summary-table');
    if(!tbody) return;
    tbody.innerHTML = '';

    const totalRecords = summary.length;
    const totalPages = Math.ceil(totalRecords / summaryRecordsPerPage) || 1;
    hourlySummaryCurrentPage = Math.max(1, Math.min(hourlySummaryCurrentPage, totalPages));

    const startIndex = (hourlySummaryCurrentPage - 1) * summaryRecordsPerPage;
    const paginatedData = summary.slice(startIndex, startIndex + summaryRecordsPerPage);

    paginatedData.forEach(item => {
        const balance = item.balance;
        tbody.innerHTML += `<tr class="border-b hover:bg-gray-50"><td class="px-4 py-3">${item.nickname}</td><td class="px-4 py-3"><span class="position-badge ${getPositionBadgeClass(item.position)}">${item.position}</span></td><td class="px-4 py-3">${formatHoursAndMinutes(item.leaveHours)}</td><td class="px-4 py-3">${formatHoursAndMinutes(item.usedHours)}</td><td class="px-4 py-3 font-semibold ${balance < 0 ? 'text-red-500' : 'text-green-500'}">${formatHoursAndMinutes(Math.abs(balance))}</td><td class="px-4 py-3 font-semibold ${balance < 0 ? 'text-red-500' : 'text-green-500'}">${balance >= 0 ? 'OK' : 'ติดลบ'}</td></tr>`;
    });

    const pageInfo = document.getElementById('hourly-summary-page-info');
    const prevBtn = document.getElementById('hourly-summary-prev-btn');
    const nextBtn = document.getElementById('hourly-summary-next-btn');
    
    if(pageInfo) pageInfo.textContent = `หน้า ${hourlySummaryCurrentPage} / ${totalPages}`;
    if(prevBtn) prevBtn.disabled = hourlySummaryCurrentPage === 1;
    if(nextBtn) nextBtn.disabled = hourlySummaryCurrentPage === totalPages;
}

function renderRankings(summary) {
    const negativeDiv = document.getElementById('negative-ranking');
    const positiveDiv = document.getElementById('positive-ranking');
    if(!negativeDiv || !positiveDiv) return;
    
    const negativeRanked = summary.filter(s => s.balance < 0).sort((a,b) => a.balance - b.balance).slice(0,3);
    const positiveRanked = summary.filter(s => s.balance > 0).sort((a,b) => b.balance - a.balance).slice(0,3);

    const crowns = { 1: '👑', 2: '🥈', 3: '🥉' };

    const createPodiumHTML = (data, type) => {
        let html = '';
        let displayData = [null, null, null];
        if (data[0]) displayData[1] = {...data[0], rank: 1};
        if (data[1]) displayData[0] = {...data[1], rank: 2};
        if (data[2]) displayData[2] = {...data[2], rank: 3};

        displayData.forEach(s => {
            if (s) {
                const timeValue = type === 'negative' ? Math.abs(s.balance) : s.balance;
                html += `
                <div class="podium-item">
                    <div class="podium-name">${s.nickname}</div>
                    <div class="podium-time">${formatHoursAndMinutes(timeValue)}</div>
                    <div class="podium-bar ${s.rank === 1 ? 'first' : s.rank === 2 ? 'second' : 'third'}">
                        <div class="podium-crown">${crowns[s.rank]}</div>
                        <span>${s.rank}</span>
                    </div>
                </div>`;
            } else {
                html += '<div class="podium-item" style="visibility: hidden;"></div>';
            }
        });
        return html;
    };
    
    negativeDiv.innerHTML = createPodiumHTML(negativeRanked, 'negative');
    negativeDiv.classList.add('negative');
    
    positiveDiv.innerHTML = createPodiumHTML(positiveRanked, 'positive');
    positiveDiv.classList.add('positive');
}


function renderHourlyRecords(records) {
    const tbody = document.getElementById('hourly-records-table');
    if(!tbody) return;
    tbody.innerHTML = '';

    const totalRecords = records.length;
    const totalPages = Math.ceil(totalRecords / recordsPerPage);
    hourlyRecordsCurrentPage = Math.max(1, Math.min(hourlyRecordsCurrentPage, totalPages || 1));

    const startIndex = (hourlyRecordsCurrentPage - 1) * recordsPerPage;
    const paginatedRecords = records.sort((a,b) => (b.timestamp?.toDate() || 0) - (a.timestamp?.toDate() || 0)).slice(startIndex, startIndex + recordsPerPage);

    paginatedRecords.forEach(r => {
        const user = users.find(u => u.nickname === r.userNickname) || {};
        tbody.innerHTML += `<tr class="border-b hover:bg-gray-50"><td class="px-4 py-3">${formatDateThaiShort(r.date)}</td><td class="px-4 py-3">${r.userNickname}</td><td class="px-4 py-3"><span class="position-badge ${getPositionBadgeClass(user.position)}">${user.position || ''}</span></td><td class="px-4 py-3 font-semibold ${r.type === 'leave' ? 'text-red-500':'text-green-500'}">${r.type === 'leave' ? 'ลา' : 'ใช้'}</td><td class="px-4 py-3">${r.startTime}-${r.endTime}</td><td class="px-4 py-3">${formatHoursAndMinutes(r.duration)}</td><td class="px-4 py-3 flex items-center space-x-1">${!r.confirmed ? `<button onclick="manageRecord('confirmHourly', '${r.id}')" class="p-2 rounded-full hover:bg-green-100 text-green-600" title="ยืนยัน"><svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" /></svg></button>` : '<span class="text-green-600 font-semibold">ยืนยันแล้ว</span>'}<button onclick="manageRecord('deleteHourly', '${r.id}')" class="p-2 rounded-full hover:bg-red-100 text-red-600" title="ลบ"><svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" /></svg></button></td></tr>`;
    });
    
    const pageInfo = document.getElementById('hourly-page-info');
    const prevBtn = document.getElementById('hourly-prev-btn');
    const nextBtn = document.getElementById('hourly-next-btn');
    
    if(pageInfo) pageInfo.textContent = `หน้า ${hourlyRecordsCurrentPage} / ${totalPages || 1}`;
    if(prevBtn) prevBtn.disabled = hourlyRecordsCurrentPage === 1;
    if(nextBtn) nextBtn.disabled = hourlyRecordsCurrentPage === totalPages || totalPages === 0;
}

function renderLeaveSummary(summaryData) {
    const tbody = document.getElementById('leave-summary-table');
    if(!tbody) return;
    tbody.innerHTML = '';

    const totalRecords = summaryData.length;
    const totalPages = Math.ceil(totalRecords / summaryRecordsPerPage) || 1;
    leaveSummaryCurrentPage = Math.max(1, Math.min(leaveSummaryCurrentPage, totalPages));

    const startIndex = (leaveSummaryCurrentPage - 1) * summaryRecordsPerPage;
    const paginatedData = summaryData.slice(startIndex, startIndex + summaryRecordsPerPage);

    paginatedData.forEach((user) => {
         tbody.innerHTML += `<tr class="border-b hover:bg-gray-50"><td class="px-4 py-3"><a href="#" onclick="event.preventDefault(); showLeaveDetailPopup('${user.nickname}')" class="text-purple-600 hover:underline">${user.fullname}</a></td><td class="px-4 py-3">${user.nickname}</td><td class="px-4 py-3"><span class="position-badge ${getPositionBadgeClass(user.position)}">${user.position}</span></td><td class="px-4 py-3 font-semibold">${user.totalDays} วัน</td></tr>`;
    });

    const pageInfo = document.getElementById('summary-page-info');
    const prevBtn = document.getElementById('summary-prev-btn');
    const nextBtn = document.getElementById('summary-next-btn');
    
    if(pageInfo) pageInfo.textContent = `หน้า ${leaveSummaryCurrentPage} / ${totalPages}`;
    if(prevBtn) prevBtn.disabled = leaveSummaryCurrentPage === 1;
    if(nextBtn) nextBtn.disabled = leaveSummaryCurrentPage === totalPages;
}

function renderLeaveRecords(records) {
    const tbody = document.getElementById('leave-records-table');
    if(!tbody) return;
    tbody.innerHTML = '';

    const totalRecords = records.length;
    const totalPages = Math.ceil(totalRecords / recordsPerPage);
    leaveRecordsCurrentPage = Math.max(1, Math.min(leaveRecordsCurrentPage, totalPages || 1));

    const startIndex = (leaveRecordsCurrentPage - 1) * recordsPerPage;
    const paginatedRecords = records.sort((a,b) => (b.createdDate?.toDate() || 0) - (a.createdDate?.toDate() || 0)).slice(startIndex, startIndex + recordsPerPage);

    paginatedRecords.forEach(r => {
        const user = users.find(u => u.nickname === r.userNickname) || {};
        const dateDisplay = r.startDate === r.endDate ? formatDateThaiShort(r.startDate) : `${formatDateThaiShort(r.startDate)} - ${formatDateThaiShort(r.endDate)}`;
        const sPeriod = r.startPeriod || r.period;
        const ePeriod = r.endPeriod || r.period;
        const leaveDays = calculateLeaveDays(r.startDate, r.endDate, sPeriod, ePeriod);
        tbody.innerHTML += `<tr class="border-b hover:bg-gray-50"><td class="px-4 py-3 text-xs">${formatDateTimeThaiShort(r.createdDate)}</td><td class="px-4 py-3">${user.fullname || r.userNickname}</td><td class="px-4 py-3">${user.nickname}</td><td class="px-4 py-3"><span class="position-badge ${getPositionBadgeClass(user.position)}">${user.position}</span></td><td class="px-4 py-3"><span class="font-semibold ${getLeaveTypeClass(r.leaveType)}">${r.leaveType}</span></td><td class="px-4 py-3">${dateDisplay}</td><td class="px-4 py-3">${leaveDays}</td><td class="px-4 py-3 text-xs">${r.approver}</td><td class="px-4 py-3 font-semibold ${r.status === 'อนุมัติแล้ว' ? 'text-green-500' : 'text-yellow-500'}">${r.status}</td><td class="px-4 py-3 flex items-center space-x-1">${r.status === 'รออนุมัติ' ? `<button onclick="manageRecord('approveLeave', '${r.id}')" class="p-2 rounded-full hover:bg-green-100 text-green-600" title="อนุมัติ"><svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" /></svg></button>` : ''}<button onclick="manageRecord('deleteLeave', '${r.id}')" class="p-2 rounded-full hover:bg-red-100 text-red-600" title="ลบ"><svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" /></svg></button></td></tr>`;
    });
    
    const pageInfo = document.getElementById('leave-page-info');
    const prevBtn = document.getElementById('leave-prev-btn');
    const nextBtn = document.getElementById('leave-next-btn');
    
    if(pageInfo) pageInfo.textContent = `หน้า ${leaveRecordsCurrentPage} / ${totalPages || 1}`;
    if(prevBtn) prevBtn.disabled = leaveRecordsCurrentPage === 1;
    if(nextBtn) nextBtn.disabled = leaveRecordsCurrentPage === totalPages || totalPages === 0;
}

// --- START: NEW MODAL FUNCTION ---
window.showLeaveDetailPopup = async function(nickname) {
    const user = users.find(u => u.nickname === nickname);
    if (!user) return showErrorPopup('ไม่พบข้อมูลผู้ใช้');

    const fiscalYear = parseInt(document.getElementById('leave-filter-fiscal-year').value);
    
    const userLeaves = allLeaveRecords.filter(r => 
        r.userNickname === nickname && 
        r.fiscalYear === fiscalYear &&
        r.status === 'อนุมัติแล้ว'
    );

    const stats = {
        'ลาป่วย': { days: 0, color: 'red' },
        'ลากิจ': { days: 0, color: 'purple' },
        'ลากิจฉุกเฉิน': { days: 0, color: 'purple' },
        'ลาพักผ่อน': { days: 0, color: 'green' },
        'ลาคลอด': { days: 0, color: 'pink' }
    };

    userLeaves.forEach(leave => {
        const leaveDays = calculateLeaveDays(leave.startDate, leave.endDate, leave.startPeriod, leave.endPeriod);
        if (stats[leave.leaveType]) {
            stats[leave.leaveType].days += leaveDays;
        }
    });
    
    const totalPersonalLeave = stats['ลากิจ'].days + stats['ลากิจฉุกเฉิน'].days;

    const modalHtml = `
        <div class="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <div class="stat-card bg-red-50 border-l-4 border-red-500 p-4 rounded-lg">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-red-600 text-sm font-medium">ลาป่วย</p>
                            <p class="text-2xl font-bold text-red-700">${stats['ลาป่วย'].days} วัน</p>
                        </div>
                    </div>
                </div>
                <div class="stat-card bg-purple-50 border-l-4 border-purple-500 p-4 rounded-lg">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-purple-600 text-sm font-medium">ลากิจ/ฉุกเฉิน</p>
                            <p class="text-2xl font-bold text-purple-700">${totalPersonalLeave} วัน</p>
                        </div>
                    </div>
                </div>
                <div class="stat-card bg-green-50 border-l-4 border-green-500 p-4 rounded-lg">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-green-600 text-sm font-medium">ลาพักผ่อน</p>
                            <p class="text-2xl font-bold text-green-700">${stats['ลาพักผ่อน'].days} วัน</p>
                        </div>
                    </div>
                </div>
                <div class="stat-card bg-pink-50 border-l-4 border-pink-500 p-4 rounded-lg">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-pink-600 text-sm font-medium">ลาคลอด</p>
                            <p class="text-2xl font-bold text-pink-700">${stats['ลาคลอด'].days} วัน</p>
                        </div>
                    </div>
                </div>
            </div>

            <div class="bg-white rounded-lg shadow-sm border overflow-hidden">
                <div class="bg-gray-50 px-6 py-4 border-b">
                    <h3 class="text-lg font-semibold text-gray-800">ประวัติการลาทั้งหมด (ปีงบประมาณ ${fiscalYear})</h3>
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full">
                        <thead class="bg-gray-100">
                            <tr>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ประเภท</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">วันที่ลา</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">จำนวนวัน</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ผู้อนุมัติ</th>
                            </tr>
                        </thead>
                        <tbody class="bg-white divide-y divide-gray-200">
                            ${userLeaves.length > 0 ? userLeaves.map(leave => {
                                const leaveDays = calculateLeaveDays(leave.startDate, leave.endDate, leave.startPeriod, leave.endPeriod);
                                const dateDisplay = leave.startDate === leave.endDate ? formatDateThaiShort(leave.startDate) : `${formatDateThaiShort(leave.startDate)} - ${formatDateThaiShort(leave.endDate)}`;
                                const typeColorClasses = {
                                    'ลาป่วย': 'bg-red-100 text-red-800',
                                    'ลากิจ': 'bg-purple-100 text-purple-800',
                                    'ลากิจฉุกเฉิน': 'bg-purple-100 text-purple-800',
                                    'ลาพักผ่อน': 'bg-green-100 text-green-800',
                                    'ลาคลอด': 'bg-pink-100 text-pink-800',
                                };
                                const colorClass = typeColorClasses[leave.leaveType] || 'bg-gray-100 text-gray-800';
                                
                                return `
                                <tr class="table-row">
                                    <td class="px-6 py-4 whitespace-nowrap">
                                        <span class="inline-flex px-2 py-1 text-xs font-semibold rounded-full ${colorClass}">
                                            ${leave.leaveType}
                                        </span>
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${dateDisplay}</td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${leaveDays} วัน</td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${leave.approver}</td>
                                </tr>`;
                            }).join('') : `<tr><td colspan="4" class="text-center p-6 text-gray-500">ไม่มีประวัติการลาในปีงบประมาณนี้</td></tr>`}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;

    Swal.fire({
        width: '90%',
        maxWidth: '1152px',
        html: modalHtml,
        showConfirmButton: true,
        confirmButtonText: 'ปิด',
        customClass: {
            popup: 'p-0 rounded-xl',
            header: 'bg-gradient-to-r from-blue-600 to-blue-700 text-white p-6',
            title: 'text-2xl font-semibold',
            htmlContainer: 'p-0 m-0',
        },
        title: `รายละเอียดการลาของ ${user.fullname}`,
    });
}
// --- END: NEW MODAL FUNCTION ---

// --- CALENDAR RENDERING ---
window.changeCalendarView = function(view) {
    currentCalendarView = view;
    
    const viewText = { day: 'วัน', week: 'สัปดาห์', month: 'เดือน', year: 'ปี' };
    document.getElementById('current-view-text').textContent = viewText[view];

    const menuItems = document.querySelectorAll('#view-dropdown-menu a');
    menuItems.forEach(item => {
        item.classList.remove('bg-gray-100', 'font-semibold');
        if (item.textContent === viewText[view]) {
            item.classList.add('bg-gray-100', 'font-semibold');
        }
    });
    
    document.getElementById('view-dropdown-menu').classList.add('hidden');
    renderCalendar();
}

window.goToToday = function() {
    currentDate = new Date();
    renderCalendar();
}

window.navigateCalendar = function(direction) {
    if (currentCalendarView === 'month') {
        currentDate.setMonth(currentDate.getMonth() + direction);
    } else if (currentCalendarView === 'week') {
        currentDate.setDate(currentDate.getDate() + (7 * direction));
    } else if (currentCalendarView === 'day') {
        currentDate.setDate(currentDate.getDate() + direction);
    } else if (currentCalendarView === 'year') {
        currentDate.setFullYear(currentDate.getFullYear() + direction);
    }
    renderCalendar();
}

window.renderCalendar = function() {
    const container = document.getElementById('calendar-grid-container');
    if (!container) return;

    switch(currentCalendarView) {
        case 'day':
            renderDayView();
            break;
        case 'week':
            renderWeekView();
            break;
        case 'year':
            renderYearView();
            break;
        case 'month':
        default:
            renderMonthView();
            break;
    }
}

function renderMonthView() {
    const container = document.getElementById('calendar-grid-container');
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const today = new Date();
    document.getElementById('calendar-title').textContent = new Intl.DateTimeFormat('th-TH', {month: 'long', year: 'numeric'}).format(currentDate);
    
    container.innerHTML = `<div class="grid grid-cols-7 gap-1 text-center font-semibold text-gray-600 mb-2"><div>อา</div><div>จ</div><div>อ</div><div>พ</div><div>พฤ</div><div>ศ</div><div>ส</div></div><div id="calendar-grid" class="grid grid-cols-7 gap-1"></div>`;
    const calendarGrid = document.getElementById('calendar-grid');

    const firstDayOfMonth = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    for (let i = 0; i < firstDayOfMonth; i++) {
        const day = daysInPrevMonth - firstDayOfMonth + 1 + i;
        calendarGrid.innerHTML += `<div class="calendar-day other-month-day"><div>${day}</div></div>`;
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month, day);
        const dateString = toLocalISOString(date);
        const holidayInfo = holidays.find(h => h.date === dateString);
        let dayCell = document.createElement('div');
        dayCell.className = `calendar-day border p-2 min-h-[120px] flex flex-col ${holidayInfo ? 'holiday-day' : ''} ${(date.getDay() === 0 || date.getDay() === 6) ? 'weekend-day' : 'bg-white'} ${date.toDateString() === today.toDateString() ? 'today-day' : ''}`;
        
        dayCell.innerHTML = `<div class="current-month-day font-semibold text-sm mb-1 ${holidayInfo ? 'text-red-700' : ''}">${day}</div>`;
        
        if (holidayInfo) {
            const holidayDiv = document.createElement('div');
            holidayDiv.className = 'holiday-event';
            holidayDiv.textContent = holidayInfo.name;
            dayCell.appendChild(holidayDiv);
        }
        
        const dayEvents = allLeaveRecords.filter(r => {
            if (r.status !== 'อนุมัติแล้ว') return false;
            const currentDateString = toLocalISOString(date);
            return currentDateString >= r.startDate && currentDateString <= r.endDate;
        });

        dayEvents.slice(0, 5).forEach(leave => {
            const user = users.find(u => u.nickname === leave.userNickname);
            if (user) {
                const eventDiv = document.createElement('div');
                eventDiv.className = `calendar-event ${getEventClass(leave.leaveType)}`;
                eventDiv.textContent = `${user.nickname}(${user.position})-${leave.leaveType}`;
                eventDiv.onclick = () => showLeaveDetailModal(leave.id);
                dayCell.appendChild(eventDiv);
            }
        });

        if (dayEvents.length > 5) {
            const showMore = document.createElement('div');
            showMore.className = 'show-more-btn';
            showMore.textContent = `+${dayEvents.length - 5} เพิ่มเติม`;
            showMore.onclick = () => showMoreEventsModal(dateString);
            dayCell.appendChild(showMore);
        }
        calendarGrid.appendChild(dayCell);
    }

    const totalCells = 42;
    const renderedCells = firstDayOfMonth + daysInMonth;
    const remainingCells = totalCells - renderedCells;
    for (let i = 1; i <= remainingCells; i++) {
        calendarGrid.innerHTML += `<div class="calendar-day other-month-day"><div>${i}</div></div>`;
    }
}

function renderDayView() {
    const container = document.getElementById('calendar-grid-container');
    document.getElementById('calendar-title').textContent = new Intl.DateTimeFormat('th-TH', {dateStyle: 'full'}).format(currentDate);
    container.innerHTML = '';
    container.appendChild(createDayCard(currentDate));
}

function renderWeekView() {
    const container = document.getElementById('calendar-grid-container');
    const week = getWeekDays(currentDate);
    document.getElementById('calendar-title').textContent = `${formatDateThaiShort(week[0])} - ${formatDateThaiShort(week[6])}`;
    
    let gridHtml = '<div class="grid grid-cols-7 gap-1 text-center font-semibold text-gray-600 mb-2">';
    week.forEach(day => {
        const dayName = new Intl.DateTimeFormat('th-TH', { weekday: 'short' }).format(day);
        gridHtml += `<div>${dayName}${day.getDate()}</div>`;
    });
    gridHtml += '</div><div id="calendar-grid" class="grid grid-cols-7 gap-1"></div>';
    container.innerHTML = gridHtml;

    const calendarGrid = document.getElementById('calendar-grid');
    week.forEach(day => {
        calendarGrid.appendChild(createDayCard(day, true));
    });
}

function renderYearView() {
    const container = document.getElementById('calendar-grid-container');
    const year = currentDate.getFullYear();
    document.getElementById('calendar-title').textContent = `ปี ${year + 543}`;
    
    container.innerHTML = '<div class="year-grid"></div>';
    const yearGrid = container.querySelector('.year-grid');
    const today = new Date();
    const todayString = toLocalISOString(today);

    for (let month = 0; month < 12; month++) {
        const monthContainer = document.createElement('div');
        monthContainer.className = 'month-container';
        monthContainer.onclick = () => {
            currentDate = new Date(year, month, 1);
            changeCalendarView('month');
        };
        
        const monthDate = new Date(year, month, 1);
        const monthHeader = document.createElement('div');
        monthHeader.className = 'month-header';
        monthHeader.textContent = new Intl.DateTimeFormat('th-TH', { month: 'long' }).format(monthDate);
        monthContainer.appendChild(monthHeader);

        const weekDaysHeader = document.createElement('div');
        weekDaysHeader.className = 'week-days-header';
        ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'].forEach(day => {
            const dayEl = document.createElement('div');
            dayEl.textContent = day;
            weekDaysHeader.appendChild(dayEl);
        });
        monthContainer.appendChild(weekDaysHeader);

        const daysGrid = document.createElement('div');
        daysGrid.className = 'days-grid';
        
        const firstDayOfMonth = monthDate.getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        
        for (let i = 0; i < firstDayOfMonth; i++) {
            daysGrid.innerHTML += '<div class="day-cell-mini"></div>';
        }
        
        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, month, day);
            const dateString = toLocalISOString(date);
            
            const hasLeave = allLeaveRecords.some(r => {
                if (r.status !== 'อนุมัติแล้ว') return false;
                return dateString >= r.startDate && dateString <= r.endDate;
            });
            
            const dayCell = document.createElement('div');
            dayCell.className = 'day-cell-mini';
            if (dateString === todayString) {
                dayCell.classList.add('is-today-mini');
            } else if (hasLeave) {
                dayCell.classList.add('has-leave-mini');
            }
            dayCell.textContent = day;
            daysGrid.appendChild(dayCell);
        }
        
        monthContainer.appendChild(daysGrid);
        yearGrid.appendChild(monthContainer);
    }
}

function createDayCard(date, isWeekView = false) {
    const container = document.createElement('div');
    
    const dayEvents = allLeaveRecords.filter(r => {
        if (r.status !== 'อนุมัติแล้ว') return false;
        const currentDateString = toLocalISOString(date);
        return currentDateString >= r.startDate && currentDateString <= r.endDate;
    });

    let eventsHtml = '';
    if (dayEvents.length > 0) {
        dayEvents.forEach(leave => {
            const user = users.find(u => u.nickname === leave.userNickname);
            if (user) eventsHtml += `<div class="calendar-event ${getEventClass(leave.leaveType)}" onclick="showLeaveDetailModal('${leave.id}')">${user.nickname} - ${leave.leaveType}</div>`;
        });
    } else {
        eventsHtml = isWeekView ? '' : '<div class="events-list empty">ไม่มีรายการลา</div>';
    }

    if (isWeekView) {
        container.className = `border p-2 min-h-[120px] flex flex-col ${toLocalISOString(date) === toLocalISOString(new Date()) ? 'today-day' : ''}`;
        container.innerHTML = `<div class="events-list">${eventsHtml}</div>`;
    } else {
        const dayName = new Intl.DateTimeFormat('th-TH', {weekday: 'long'}).format(date);
        const dateFormatted = new Intl.DateTimeFormat('th-TH', {dateStyle: 'long'}).format(date);
        container.innerHTML = `
            <div class="list-view-container">
                <div class="day-header">
                    <span class="day-header-date">${dateFormatted}</span>
                    <span class="day-header-day">${dayName}</span>
                </div>
                <div class="events-list">${eventsHtml}</div>
            </div>
        `;
    }
    return container;
}

function getWeekDays(date) {
    const startOfWeek = new Date(date);
    startOfWeek.setDate(date.getDate() - date.getDay());
    const week = [];
    for(let i=0; i<7; i++){
        const day = new Date(startOfWeek);
        day.setDate(startOfWeek.getDate() + i);
        week.push(day);
    }
    return week;
}

window.showMoreEventsModal = function(dateString) {
    const date = new Date(dateString + 'T00:00:00');
    const dayEvents = allLeaveRecords.filter(r => {
        if (r.status !== 'อนุมัติแล้ว') return false;
        const startDate = new Date(r.startDate + 'T00:00:00');
        const endDate = new Date(r.endDate + 'T00:00:00');
        return date >= startDate && date <= endDate;
    });

    let eventsHtml = '<div class="space-y-2">';
    dayEvents.forEach(leave => {
        const user = users.find(u => u.nickname === leave.userNickname);
        if (user) {
            eventsHtml += `<div onclick="Swal.close(); showLeaveDetailModal('${leave.id}')" class="calendar-event ${getEventClass(leave.leaveType)}">${user.nickname}(${user.position})-${leave.leaveType}</div>`;
        }
    });
    eventsHtml += '</div>';

    Swal.fire({
        title: `รายการลาทั้งหมดวันที่ ${formatDateThaiShort(date)}`,
        html: eventsHtml,
        confirmButtonText: 'ปิด'
    });
}

window.showLeaveDetailModal = function(id) {
    const record = allLeaveRecords.find(r => r.id === id);
    if (!record) return;
    const user = users.find(u => u.nickname === record.userNickname);
    if (!user) return;

    const sPeriod = record.startPeriod || record.period;
    const ePeriod = record.endPeriod || record.period;
    const leaveDays = calculateLeaveDays(record.startDate, record.endDate, sPeriod, ePeriod);
    const dateDisplay = record.startDate === record.endDate ? formatDateThaiShort(record.startDate) : `${formatDateThaiShort(record.startDate)} - ${formatDateThaiShort(record.endDate)}`;

    const html = `
        <div class="space-y-1">
            <p><b>ชื่อ-สกุล:</b> ${user.fullname}</p>
            <p><b>ชื่อเล่น:</b> ${user.nickname}</p>
            <p><b>ตำแหน่ง:</b> ${user.position}</p>
            <p><b>ประเภทการลา:</b> ${record.leaveType}</p>
            <p><b>วันที่ลา:</b> ${dateDisplay}</p>
            <p><b>จำนวนวันลา:</b> ${leaveDays} วัน</p>
            <p><b>ผู้อนุมัติ:</b> ${record.approver}</p>
        </div>
    `;
    Swal.fire({ title: 'รายละเอียดการลา', html: html, confirmButtonText: 'ปิด' });
}


function getEventClass(leaveType) {
    if (leaveType.includes('ป่วย')) return 'sick-leave'; if (leaveType.includes('พักผ่อน')) return 'vacation-leave';
    if (leaveType.includes('กิจ')) return 'personal-leave'; if (leaveType.includes('คลอด')) return 'maternity-leave';
    return 'personal-leave';
}
window.previousMonth = function() { currentDate.setMonth(currentDate.getMonth() - 1); renderCalendar(); }
window.nextMonth = function() { currentDate.setMonth(currentDate.getMonth() + 1); renderCalendar(); }

// --- USER & RECORD MANAGEMENT ---
window.changeHourlyPage = function(direction) {
    hourlyRecordsCurrentPage += direction;
    applyHourlyFiltersAndRender();
}
window.changeHourlySummaryPage = function(direction) {
    hourlySummaryCurrentPage += direction;
    applyHourlyFiltersAndRender();
}
window.changeLeavePage = function(direction) {
    leaveRecordsCurrentPage += direction;
    applyLeaveFiltersAndRender();
}
window.changeLeaveSummaryPage = function(direction) {
    leaveSummaryCurrentPage += direction;
    applyLeaveFiltersAndRender();
}
window.changeUserPage = function(direction) {
    usersCurrentPage += direction;
    applyUserFiltersAndRender();
}
        
window.editUser = async function(id) {
    const user = users.find(u => u.id === id);
    if (!user) {
        showErrorPopup('ไม่พบข้อมูลผู้ใช้');
        return;
    }

    const { value: formValues } = await Swal.fire({
        showConfirmButton: true,
        showCancelButton: true,
        confirmButtonText: 'อัปเดตข้อมูล',
        cancelButtonText: 'ยกเลิก',
        customClass: {
            popup: 'swal-edit-user-popup',
            confirmButton: 'btn-primary',
            cancelButton: 'btn-cancel',
        },
        html: `
            <div class="edit-user-header">
                <div class="edit-user-icon-wrapper">
                    <svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
                    </svg>
                </div>
                <h1 class="text-2xl font-semibold text-gray-800">แก้ไขข้อมูลผู้ใช้</h1>
            </div>
            <div class="edit-user-form">
                <div class="input-group">
                    <input type="text" id="swal-fullname" class="input-field" value="${user.fullname}" required>
                    <label for="swal-fullname" class="label-float">ชื่อ-สกุล</label>
                </div>
                <div class="input-group">
                    <input type="text" id="swal-nickname" class="input-field" value="${user.nickname}" required>
                    <label for="swal-nickname" class="label-float">ชื่อเล่น</label>
                </div>
                <div class="input-group">
                     <select id="swal-position" class="input-field">
                        <option value="เภสัช" ${user.position === 'เภสัช' ? 'selected' : ''}>เภสัช</option>
                        <option value="จพง" ${user.position === 'จพง' ? 'selected' : ''}>จพง</option>
                        <option value="จนท" ${user.position === 'จนท' ? 'selected' : ''}>จนท</option>
                    </select>
                    <label for="swal-position" class="label-float">ตำแหน่ง</label>
                </div>
            </div>
        `,
        didOpen: () => {
            const popup = Swal.getPopup();
            const inputGroups = popup.querySelectorAll('.input-group');
            inputGroups.forEach(group => {
                const input = group.querySelector('.input-field');
                
                const checkValue = () => {
                    if (input.value && input.value.trim() !== '') {
                        group.classList.add('has-value');
                    } else {
                        group.classList.remove('has-value');
                    }
                };

                checkValue();
                input.addEventListener('focus', () => group.classList.add('has-value'));
                input.addEventListener('blur', checkValue);
            });
        },
        preConfirm: () => {
            const fullname = document.getElementById('swal-fullname').value;
            const nickname = document.getElementById('swal-nickname').value;
            const position = document.getElementById('swal-position').value;

            if (!fullname.trim() || !nickname.trim()) {
                Swal.showValidationMessage(`กรุณากรอกข้อมูลให้ครบถ้วน`);
                return false;
            }

            const isNicknameTaken = users.some(u => u.id !== id && u.nickname === nickname);
            if (isNicknameTaken) {
                Swal.showValidationMessage(`ชื่อเล่น "${nickname}" นี้มีผู้ใช้อื่นแล้ว`);
                return false;
            }
            
            return { fullname, nickname, position };
        }
    });

    if (formValues) {
        const summaryHtml = `
            <p class="text-center"><b>กรุณายืนยันการแก้ไขข้อมูลสำหรับ</b></p>
            <p class="text-center font-semibold text-blue-600 text-lg">${user.nickname}</p>
        `;
        const isPinCorrect = await confirmWithUserPin(user.nickname, summaryHtml);

        if (isPinCorrect) {
            showLoadingPopup('กำลังบันทึก...');
            try {
                const userDocRef = doc(db, "users", id);
                await updateDoc(userDocRef, {
                    fullname: formValues.fullname,
                    nickname: formValues.nickname,
                    position: formValues.position
                });
                showSuccessPopup('อัปเดตข้อมูลสำเร็จ');
            } catch (error) {
                console.error("Error updating user:", error);
                showErrorPopup('เกิดข้อผิดพลาดในการอัปเดตข้อมูล');
            }
        }
    }
}

window.manageRecord = async function(action, id) {
    const actionsRequiringPin = ['approveLeave', 'confirmHourly', 'deleteLeave', 'deleteHourly'];
    
    if (actionsRequiringPin.includes(action)) {
        if (systemPIN === null) {
            return showErrorPopup('ยังไม่ได้ตั้งค่า PIN ของระบบ กรุณาไปที่เมนู "จัดการ PIN"');
        }
        const enteredPin = await getSystemPinConfirmation();
        if (!enteredPin) return;
    }
    
    showLoadingPopup('กำลังดำเนินการ...');
    try {
        let recordDoc;
        if (action.includes('Hourly')) recordDoc = doc(db, "hourlyRecords", id);
        else if (action.includes('Leave')) recordDoc = doc(db, "leaveRecords", id);
        
        if (action.includes('delete')) {
            await deleteDoc(recordDoc);
        } else if (action === 'confirmHourly') {
            await updateDoc(recordDoc, { confirmed: true });
        } else if (action === 'approveLeave') {
            await updateDoc(recordDoc, { status: 'อนุมัติแล้ว' });
        }
        
        showSuccessPopup('ดำเนินการสำเร็จ');
    } catch(error) { 
        console.error("Error managing record:", error);
        showErrorPopup('เกิดข้อผิดพลาด: ' + error.message); 
    }
}