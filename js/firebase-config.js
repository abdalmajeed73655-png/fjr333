/**
 * نظام مؤسسة الفجر الخيرية الاجتماعية
 * إعدادات وتكامل Firebase والسحابة المباشرة (Authentication, Firestore, Storage, Cloud Sync)
 * مطور الموقع: عبد المجيد عياش برديني (770905092)
 */

// الرابط السحابي التلقائي المباشر (مفعل تلقائياً بدون أي إعدادات يدوية من المستخدم)
const CLOUD_SYNC_ENDPOINT = 'https://extendsclass.com/api/json-storage/bin/bacefeb';
const CLOUD_SYNC_TOPIC = 'https://ntfy.sh/alfajr_charity_live_sync_2026';
const STORAGE_KEY = 'alfajr_local_firestore_db';

// جلب إعدادات Firebase المخصصة إذا قام المدير بإدخالها
function getActiveFirebaseConfig() {
  try {
    const saved = localStorage.getItem('alfajr_custom_firebase_config');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.apiKey && !parsed.apiKey.includes('PLACEHOLDER')) {
        return parsed;
      }
    }
  } catch (e) {}

  return {
    apiKey: "AIzaSyD-ALFAJR-CHARITY-CLOUD-SYNC-2026",
    authDomain: "al-fajr-charity.firebaseapp.com",
    projectId: "al-fajr-charity",
    storageBucket: "al-fajr-charity.appspot.com",
    messagingSenderId: "109876543210",
    appId: "1:109876543210:web:abcdef123456789"
  };
}

const firebaseConfig = getActiveFirebaseConfig();
const isPlaceholderMode = !firebaseConfig.apiKey || firebaseConfig.apiKey.includes("PLACEHOLDER") || firebaseConfig.apiKey.includes("ALFAJR-CHARITY-CLOUD-SYNC");

let app = null, auth = null, db = null, storage = null;
let isFirebaseInitialized = false;

// تهيئة Firebase SDK إذا كان هناك مشروع حقيقي
if (!isPlaceholderMode && typeof firebase !== 'undefined') {
  try {
    app = firebase.initializeApp(firebaseConfig);
    auth = firebase.auth();
    db = firebase.firestore();
    storage = firebase.storage();

    db.enablePersistence({ synchronizeTabs: true }).catch((err) => {
      console.warn('تنبيه التخزين المؤقت لفايربيس:', err.message);
    });

    isFirebaseInitialized = true;
    console.log('✅ تم الاتصال السحابي المباشر بـ Firebase بمشروع:', firebaseConfig.projectId);
  } catch (e) {
    console.warn('تنبيه تهيئة فايربيس المباشر:', e.message);
  }
}

// دوال إدارة إعدادات Firebase
function saveCustomFirebaseConfig(config) {
  if (!config || !config.apiKey || !config.projectId) {
    throw new Error('يرجى ملء مفتاح API و Project ID على الأقل للربط السحابي');
  }
  localStorage.setItem('alfajr_custom_firebase_config', JSON.stringify(config));
  return true;
}

function resetCustomFirebaseConfig() {
  localStorage.removeItem('alfajr_custom_firebase_config');
  return true;
}

// ==========================================
// محرك المزامنة السحابية التلقائي (Auto Cloud Sync Engine)
// يزامن البيانات تلقائياً وفورياً بين الهواتف والحواسيب عبر الإنترنت و GitHub Pages
// ==========================================
const CloudSyncEngine = {
  isSyncing: false,
  pendingPush: false,
  lastSyncTime: null,
  syncListeners: [],
  debounceTimer: null,

  // تسجيل مستمعي تحديث البيانات لتحديث الشاشات تلقائياً
  onSync(callback) {
    if (typeof callback === 'function') {
      this.syncListeners.push(callback);
    }
  },

  notifyListeners(data) {
    this.syncListeners.forEach(fn => {
      try { fn(data); } catch (e) { console.warn('Sync listener error:', e); }
    });
  },

  // سحب أحدث نسخة من السحابة ودمجها محلياً
  async pull() {
    try {
      const res = await fetch(CLOUD_SYNC_ENDPOINT, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        cache: 'no-cache'
      });
      if (!res.ok) return null;

      let remote = await res.json();
      // إذا كان الخادم يغلف البيانات داخل خاصية data
      if (remote && remote.data && typeof remote.data === 'object' && remote.data.users) {
        remote = remote.data;
      }
      if (!remote || typeof remote !== 'object' || !remote.users) return null;

      const local = getLocalData();
      let hasUpdates = false;

      const collections = [
        'users', 'employees', 'attendance', 'leaves', 'excuses',
        'settings', 'organization', 'leaveTypes', 'salaryHistory', 'activityLogs'
      ];

      for (const col of collections) {
        if (remote[col] && typeof remote[col] === 'object') {
          if (!local[col]) local[col] = {};
          for (const key of Object.keys(remote[col])) {
            const remoteItem = remote[col][key];
            const localItem = local[col][key];
            if (!localItem || JSON.stringify(localItem) !== JSON.stringify(remoteItem)) {
              local[col][key] = remoteItem;
              hasUpdates = true;
            }
          }
        }
      }

      if (hasUpdates) {
        saveLocalDataInternal(local);
        this.lastSyncTime = new Date();
        this.notifyListeners(local);
        console.log('🔄 تم استقبال وتطبيق التحديثات السحابية حياً');
      }
      return remote;
    } catch (err) {
      console.warn('تنبيه السحب السحابي:', err.message);
      return null;
    }
  },

  // جدولة رفع التغييرات إلى السحابة
  schedulePush() {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.push();
    }, 350);
  },

  // رفع البيانات المحلية إلى السحابة
  async push() {
    if (this.isSyncing) {
      this.pendingPush = true;
      return;
    }
    this.isSyncing = true;
    try {
      const local = getLocalData();
      await fetch(CLOUD_SYNC_ENDPOINT, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json; charset=utf-8'
        },
        body: JSON.stringify(local)
      });
      this.lastSyncTime = new Date();
      this.broadcastEvent();
      console.log('☁️ تم رفع وتحديث البيانات في السحابة بنجاح');
    } catch (err) {
      console.warn('فشل الرفع السحابي (سيتم تكراره عند توفر الشبكة):', err.message);
    } finally {
      this.isSyncing = false;
      if (this.pendingPush) {
        this.pendingPush = false;
        this.schedulePush();
      }
    }
  },

  // إرسال إشعار لحظي للأجهزة الأخرى لتحديث شاشاتها
  broadcastEvent() {
    try {
      // إشعار سحابي للأجهزة البعيدة (الهواتف والكمبيوترات)
      fetch(CLOUD_SYNC_TOPIC, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: 'sync_update'
      }).catch(() => {});

      // إشعار بين التبويبات المفتوحة محلياً
      if (typeof BroadcastChannel !== 'undefined') {
        const bc = new BroadcastChannel('alfajr_sync_channel');
        bc.postMessage({ type: 'sync', time: Date.now() });
        bc.close();
      }
    } catch (e) {}
  },

  // بدء الاستماع المباشر للتحديثات
  startLiveListener() {
    // 1. مزامنة التبويبات المحلية
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        const bc = new BroadcastChannel('alfajr_sync_channel');
        bc.onmessage = (ev) => {
          if (ev.data && ev.data.type === 'sync') {
            this.pull();
          }
        };
      } catch (e) {}
    }

    // 2. الاستماع الفوري عبر SSE للأجهزة الأخرى
    try {
      if (typeof EventSource !== 'undefined') {
        const sse = new EventSource(`${CLOUD_SYNC_TOPIC}/sse`);
        sse.onmessage = () => {
          this.pull();
        };
        sse.onerror = () => {
          sse.close();
        };
      }
    } catch (e) {}

    // 3. فحص دوري كل 20 ثانية لضمان تطابق البيانات
    setInterval(() => {
      this.pull();
    }, 20000);

    // 4. سحب التحديثات فور تركيز الشاشة (عند فتح التطبيق على الجوال أو الحاسوب)
    window.addEventListener('focus', () => {
      this.pull();
    });

    // 5. السحب الأولي فوراً
    this.pull();
  }
};

// دالة فحص حالة الاتصال السحابي
function getFirebaseConnectionStatus() {
  const isCustom = !isPlaceholderMode && isFirebaseInitialized;
  return {
    isCloudActive: true,
    isCustomFirebase: isCustom,
    isAutomaticCloud: true,
    cloudProvider: isCustom ? 'Firebase Cloud' : 'السحابة التلقائية المباشرة (GitHub / Cloud Sync)',
    projectId: isCustom ? firebaseConfig.projectId : 'alfajr-cloud-github',
    config: firebaseConfig,
    lastSyncTime: CloudSyncEngine.lastSyncTime
  };
}

// دالة حفظ محلية داخلية
function saveLocalDataInternal(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('فشل حفظ التخزين المحلي:', e);
  }
}

// دالة حفظ عامة وتمرير المزامنة للسحابة
function saveLocalData(data) {
  saveLocalDataInternal(data);
  CloudSyncEngine.schedulePush();
}

// قراءة البيانات المحلية وضمان سلامة حساب المسؤول والموظف
function getLocalData() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (!parsed.users) parsed.users = {};
      if (!parsed.employees) parsed.employees = {};
      if (!parsed.settings) parsed.settings = {};
      if (!parsed.settings.gpsSettings) parsed.settings.gpsSettings = {};

      // تفعيل الحضور السحابي من أي مكان افتراضياً لتفادي مشاكل الـ GPS
      if (parsed.settings.gpsSettings.allowAnywhere === undefined) {
        parsed.settings.gpsSettings.allowAnywhere = true;
      }

      // ضمان حساب المسؤول الأولي المعتمد (fjr / 316501)
      if (!parsed.users.admin_fjr) {
        parsed.users.admin_fjr = {
          uid: "admin_fjr",
          username: "fjr",
          email: "fjr@alfajr.org",
          role: "admin",
          name: "إدارة المؤسسة - المدير العام",
          phone: "770905092",
          password: "316501",
          status: "active"
        };
      } else {
        parsed.users.admin_fjr.password = "316501";
      }

      // ضمان حساب الموظف التجريبي (ahmed / 123456)
      if (!parsed.users.emp_ahmed) {
        parsed.users.emp_ahmed = {
          uid: "emp_ahmed",
          username: "ahmed",
          email: "ahmed@alfajr.org",
          role: "employee",
          name: "أحمد محمد سالم باوزير",
          phone: "771234567",
          employeeId: "emp_ahmed",
          password: "123456",
          status: "active"
        };
      } else {
        parsed.users.emp_ahmed.password = "123456";
      }

      if (!parsed.employees.emp_ahmed) {
        parsed.employees.emp_ahmed = {
          id: "emp_ahmed",
          name: "أحمد محمد سالم باوزير",
          jobTitle: "أخصائي اجتماعي",
          phone: "771234567",
          username: "ahmed",
          email: "ahmed@alfajr.org",
          startDate: "2026-01-01",
          salary: 120000,
          annualLeaveBalance: 30,
          usedLeave: 0,
          remainingLeave: 30,
          status: "active",
          createdAt: new Date().toISOString()
        };
      }

      return parsed;
    }
  } catch (e) {}

  // البيانات الأولية الافتراضية الشاملة
  const initialData = {
    organization: {
      info: {
        name: "مؤسسة الفجر الخيرية الاجتماعية",
        region: "حضرموت – المكلا",
        developer: "عبد المجيد عياش برديني",
        phone: "770905092",
        logoUrl: "assets/logo.svg",
        updatedAt: new Date().toISOString()
      }
    },
    settings: {
      workSettings: {
        startTime: "07:00:00",
        endTime: "14:00:00",
        gracePeriodMinutes: 15,
        earlyArrivalAllowed: true,
        dailyWorkHours: 7,
        updatedAt: new Date().toISOString()
      },
      gpsSettings: {
        latitude: 14.5424,
        longitude: 49.1248,
        radius: 100,
        allowAnywhere: true,
        locationName: "المقر الرئيسي - حضرموت، المكلا",
        updatedAt: new Date().toISOString()
      },
      salarySettings: {
        approvedMonthDays: 30,
        dailyWorkHours: 7,
        roundingMethod: "exact_seconds",
        updatedAt: new Date().toISOString()
      }
    },
    leaveTypes: {
      annual: {
        id: "annual",
        name: "إجازة سنوية",
        defaultBalance: 30,
        deductFromBalance: true,
        requiresApproval: true,
        requiresAttachment: false,
        active: true
      },
      sick: {
        id: "sick",
        name: "إجازة مرضية",
        defaultBalance: 15,
        deductFromBalance: false,
        requiresApproval: true,
        requiresAttachment: true,
        active: true
      },
      emergency: {
        id: "emergency",
        name: "إجازة طارئة / عارضة",
        defaultBalance: 7,
        deductFromBalance: true,
        requiresApproval: true,
        requiresAttachment: false,
        active: true
      }
    },
    users: {
      admin_fjr: {
        uid: "admin_fjr",
        username: "fjr",
        email: "fjr@alfajr.org",
        role: "admin",
        name: "إدارة المؤسسة - المدير العام",
        phone: "770905092",
        password: "316501",
        status: "active"
      },
      emp_ahmed: {
        uid: "emp_ahmed",
        username: "ahmed",
        email: "ahmed@alfajr.org",
        role: "employee",
        name: "أحمد محمد سالم باوزير",
        phone: "771234567",
        employeeId: "emp_ahmed",
        password: "123456",
        status: "active"
      }
    },
    employees: {
      emp_ahmed: {
        id: "emp_ahmed",
        name: "أحمد محمد سالم باوزير",
        jobTitle: "أخصائي اجتماعي",
        phone: "771234567",
        username: "ahmed",
        email: "ahmed@alfajr.org",
        startDate: "2026-01-01",
        salary: 120000,
        annualLeaveBalance: 30,
        usedLeave: 0,
        remainingLeave: 30,
        status: "active",
        createdAt: new Date().toISOString()
      }
    },
    attendance: {},
    leaves: {},
    excuses: {},
    salaryHistory: {},
    activityLogs: {}
  };

  saveLocalDataInternal(initialData);
  return initialData;
}

// بدء تشغيل محرك المزامنة السحابية فور تحميل الصفحة
CloudSyncEngine.startLiveListener();

// ==========================================
// محاكي كائنات Firestore المنسجم تماماً مع واجهات Firebase الرسمية
// ==========================================
if (!db) {
  class LocalDocRef {
    constructor(collName, docId) {
      this.collName = collName;
      this.id = docId;
    }

    async get() {
      const data = getLocalData();
      const coll = data[this.collName] || {};
      const docData = coll[this.id];
      return {
        exists: Boolean(docData),
        id: this.id,
        data: () => docData ? JSON.parse(JSON.stringify(docData)) : undefined
      };
    }

    async set(newData, options = {}) {
      const data = getLocalData();
      if (!data[this.collName]) data[this.collName] = {};

      if (options.merge && data[this.collName][this.id]) {
        data[this.collName][this.id] = { ...data[this.collName][this.id], ...newData };
      } else {
        data[this.collName][this.id] = { ...newData, id: this.id };
      }
      saveLocalData(data);
    }

    async update(updateData) {
      const data = getLocalData();
      if (!data[this.collName] || !data[this.collName][this.id]) {
        throw new Error('الوثيقة غير موجودة لتحديثها');
      }
      data[this.collName][this.id] = { ...data[this.collName][this.id], ...updateData };
      saveLocalData(data);
    }

    async delete() {
      const data = getLocalData();
      if (data[this.collName] && data[this.collName][this.id]) {
        delete data[this.collName][this.id];
        saveLocalData(data);
      }
    }
  }

  class LocalQuery {
    constructor(collName, filters = [], orderField = null, orderDir = 'asc', limitCount = null) {
      this.collName = collName;
      this.filters = filters;
      this.orderField = orderField;
      this.orderDir = orderDir;
      this.limitCount = limitCount;
    }

    where(field, op, val) {
      return new LocalQuery(
        this.collName,
        [...this.filters, { field, op, val }],
        this.orderField,
        this.orderDir,
        this.limitCount
      );
    }

    orderBy(field, dir = 'asc') {
      return new LocalQuery(this.collName, this.filters, field, dir, this.limitCount);
    }

    limit(n) {
      return new LocalQuery(this.collName, this.filters, this.orderField, this.orderDir, n);
    }

    async get() {
      const data = getLocalData();
      const coll = data[this.collName] || {};
      let list = Object.keys(coll).map(id => ({ id, ...coll[id] }));

      // تطبيق الفلاتر
      for (const f of this.filters) {
        list = list.filter(item => {
          const itemVal = item[f.field];
          if (f.op === '==') return itemVal === f.val;
          if (f.op === '>=') return itemVal >= f.val;
          if (f.op === '<=') return itemVal <= f.val;
          if (f.op === '>') return itemVal > f.val;
          if (f.op === '<') return itemVal < f.val;
          return true;
        });
      }

      // تطبيق الترتيب
      if (this.orderField) {
        list.sort((a, b) => {
          const valA = a[this.orderField];
          const valB = b[this.orderField];
          if (valA === valB) return 0;
          if (valA === undefined) return 1;
          if (valB === undefined) return -1;
          const res = valA > valB ? 1 : -1;
          return this.orderDir === 'desc' ? -res : res;
        });
      }

      // تطبيق الحد الأقصى
      if (this.limitCount && this.limitCount > 0) {
        list = list.slice(0, this.limitCount);
      }

      const docs = list.map(item => ({
        id: item.id,
        exists: true,
        data: () => JSON.parse(JSON.stringify(item))
      }));

      return {
        empty: docs.length === 0,
        size: docs.length,
        docs: docs,
        forEach: (callback) => docs.forEach(callback)
      };
    }
  }

  class LocalCollectionRef extends LocalQuery {
    doc(id) {
      const docId = id || `doc_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      return new LocalDocRef(this.collName, docId);
    }

    async add(newData) {
      const newId = `doc_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      const docRef = this.doc(newId);
      await docRef.set(newData);
      return { id: newId };
    }
  }

  // كائن db المتوافق
  db = {
    collection: (name) => new LocalCollectionRef(name),
    runTransaction: async (updateFunction) => {
      const transaction = {
        get: async (docRef) => docRef.get(),
        set: (docRef, data, opts) => docRef.set(data, opts),
        update: (docRef, data) => docRef.update(data),
        delete: (docRef) => docRef.delete()
      };
      return await updateFunction(transaction);
    }
  };

  // محاكي Auth المطابق
  auth = {
    currentUser: null,
    onAuthStateChanged: (callback) => {
      const uid = localStorage.getItem('alfajr_uid');
      if (uid) {
        const email = `${localStorage.getItem('alfajr_username') || 'user'}@alfajr.org`;
        auth.currentUser = { uid, email };
        callback(auth.currentUser);
      } else {
        auth.currentUser = null;
        callback(null);
      }
      return () => {};
    },
    setPersistence: async () => true,
    signInWithEmailAndPassword: async (email, password) => {
      const username = email.split('@')[0].toLowerCase();
      if (username === 'fjr') {
        if (password === '316501') {
          auth.currentUser = { uid: 'admin_fjr', email: 'fjr@alfajr.org' };
          return { user: auth.currentUser };
        } else {
          const err = new Error('كلمة المرور غير صحيحة');
          err.code = 'auth/wrong-password';
          throw err;
        }
      }

      // فحص الموظفين
      const data = getLocalData();
      const users = data.users || {};
      for (const uid in users) {
        const u = users[uid];
        if (u.username === username) {
          if (u.password && u.password !== password) {
            const err = new Error('كلمة المرور غير صحيحة');
            err.code = 'auth/wrong-password';
            throw err;
          }
          auth.currentUser = { uid: u.uid, email: u.email };
          return { user: auth.currentUser };
        }
      }

      const err = new Error('بيانات الدخول غير صحيحة');
      err.code = 'auth/invalid-credential';
      throw err;
    },
    createUserWithEmailAndPassword: async (email, password) => {
      const username = email.split('@')[0].toLowerCase();
      const newUid = `user_${Date.now()}`;
      auth.currentUser = { uid: newUid, email };

      const data = getLocalData();
      if (!data.users) data.users = {};
      data.users[newUid] = {
        uid: newUid,
        username: username,
        email: email,
        password: password,
        role: 'employee',
        status: 'active'
      };
      saveLocalData(data);

      return { user: auth.currentUser };
    },
    signOut: async () => {
      auth.currentUser = null;
      return true;
    }
  };

  // محاكي Storage لحفظ الصور والمرفقات
  storage = {
    ref: (path) => ({
      put: async (file) => ({
        ref: {
          getDownloadURL: async () => {
            return new Promise((resolve) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result);
              reader.readAsDataURL(file);
            });
          }
        }
      })
    })
  };
}

// دالة مساعدة للحصول على ServerTimestamp
function getServerTimestamp() {
  if (typeof firebase !== 'undefined' && firebase.firestore && isFirebaseInitialized) {
    return firebase.firestore.FieldValue.serverTimestamp();
  }
  return new Date();
}

// مراقبة حالة الاتصال بالإنترنت
window.addEventListener('online', () => {
  const banner = document.getElementById('offline-banner');
  if (banner) banner.style.display = 'none';
  if (typeof showToast === 'function') {
    showToast('تم استعادة الاتصال بالإنترنت بنجاح - جاري المزامنة السحابية', 'success', 'متصل الآن');
  }
  CloudSyncEngine.pull();
  CloudSyncEngine.push();
});

window.addEventListener('offline', () => {
  const banner = document.getElementById('offline-banner');
  if (banner) banner.style.display = 'block';
  if (typeof showToast === 'function') {
    showToast('أنت تعمل في وضع دون اتصال - سيتم حفظ البيانات ومزامنتها تلقائياً عند عودة الإنترنت', 'warning', 'بدون اتصال');
  }
});

// تهيئة الإعدادات الافتراضية
async function bootstrapSystemDefaults() {
  if (!db) return;
  try {
    const orgDoc = await db.collection('organization').doc('info').get();
    if (!orgDoc.exists) {
      await db.collection('organization').doc('info').set({
        name: "مؤسسة الفجر الخيرية الاجتماعية",
        region: "حضرموت – المكلا",
        developer: "عبد المجيد عياش برديني",
        phone: "770905092",
        logoUrl: "assets/logo.svg",
        updatedAt: getServerTimestamp()
      });
    }
  } catch (err) {
    console.warn('تهيئة الإعدادات:', err);
  }
}
