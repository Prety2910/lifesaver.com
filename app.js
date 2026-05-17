/* ═══════════════════════════════════════════════
   LifeSaver Cloud – app.js
═══════════════════════════════════════════════ */

let currentLat = null;
let currentLng = null;
let map = null;
let marker = null;
let contacts = [];
let alertsSent = 0;
let currentUser = null;

// ─── Navigation ───────────────────────────────
document.querySelectorAll('.nav-link').forEach(link => {
  link.addEventListener('click', e => {
    e.preventDefault();
    navigateTo(link.dataset.page);
  });
});

function navigateTo(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));

  document.getElementById(pageId)?.classList.add('active');
  document.querySelector(`[data-page="${pageId}"]`)?.classList.add('active');

  if (pageId === 'contacts') renderContacts();
  if (pageId === 'history') loadHistory();
  if (pageId === 'profile') loadProfile();
}

// ─── Network / PWA-lite ───────────────────────
function updateNetworkStatus() {
  const el = document.getElementById('networkStatus');
  if (!el) return;
  el.textContent = navigator.onLine ? 'Online' : 'Offline';
}
window.addEventListener('online', updateNetworkStatus);
window.addEventListener('offline', updateNetworkStatus);

// ─── Auth ─────────────────────────────────────
firebase.auth().onAuthStateChanged(async user => {
  const authStatus = document.getElementById('authStatus');
  const authForm = document.getElementById('authForm');
  const loggedInBar = document.getElementById('loggedInBar');
  const loggedInText = document.getElementById('loggedInText');

  if (user) {
    currentUser = user;

    authStatus && (authStatus.textContent = `Logged in as ${user.email}`);
    authForm && authForm.classList.add('hidden');
    loggedInBar && loggedInBar.classList.remove('hidden');
    loggedInText && (loggedInText.textContent = `Welcome, ${user.email}`);

    await loadProfile();
    await loadContacts();
    await loadHistory();
    updateCounts();
    showToast('✅ Logged in');
  } else {
    currentUser = null;
    contacts = [];
    alertsSent = 0;

    authStatus && (authStatus.textContent = 'Not logged in');
    authForm && authForm.classList.remove('hidden');
    loggedInBar && loggedInBar.classList.add('hidden');

    document.getElementById('userName').textContent = 'Buddy';
    document.getElementById('avatarInitial').textContent = 'B';
    document.getElementById('contactCount').textContent = '0';
    document.getElementById('alertCount').textContent = '0';

    renderContacts();
    const historyList = document.getElementById('historyList');
    if (historyList) {
      historyList.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🔒</div>
          <p>Please log in to view your alert history.</p>
        </div>
      `;
    }
  }
});

function signup() {
  const email = document.getElementById('email')?.value.trim() || '';
  const password = document.getElementById('password')?.value.trim() || '';
  if (!email || !password) return showToast('⚠️ Enter email and password');

  firebase.auth()
    .createUserWithEmailAndPassword(email, password)
    .then(() => showToast('✅ Signed up successfully'))
    .catch(err => {
      console.error(err);
      showToast(`❌ ${err.message}`);
    });
}

function login() {
  const email = document.getElementById('email')?.value.trim() || '';
  const password = document.getElementById('password')?.value.trim() || '';
  if (!email || !password) return showToast('⚠️ Enter email and password');

  firebase.auth()
    .signInWithEmailAndPassword(email, password)
    .then(() => showToast('✅ Logged in successfully'))
    .catch(err => {
      console.error(err);
      showToast(`❌ ${err.message}`);
    });
}

function logout() {
  firebase.auth().signOut()
    .then(() => showToast('✅ Logged out'))
    .catch(err => {
      console.error(err);
      showToast(`❌ ${err.message}`);
    });
}

// ─── Maps / Location ──────────────────────────
function initMap() {
  const mapDiv = document.getElementById('map');
  if (!mapDiv) return;

  if (typeof google === 'undefined' || !google.maps) {
    showMapPlaceholder();
    return;
  }

  const defaultCoords = { lat: 12.9716, lng: 77.5946 };

  map = new google.maps.Map(mapDiv, {
    center: defaultCoords,
    zoom: 14,
    mapTypeId: 'roadmap',
    styles: getDarkMapStyle(),
    disableDefaultUI: false,
    zoomControl: true,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: true
  });

  marker = new google.maps.Marker({
    position: defaultCoords,
    map,
    title: 'Your Location',
    icon: {
      path: google.maps.SymbolPath.CIRCLE,
      scale: 10,
      fillColor: '#e8192c',
      fillOpacity: 1,
      strokeColor: '#fff',
      strokeWeight: 2
    },
    animation: google.maps.Animation.DROP
  });

  refreshLocation();
}

function refreshLocation() {
  const locationText = document.getElementById('locationText');
  const coordText = document.getElementById('coordText');

  locationText && (locationText.textContent = 'Locating...');
  coordText && (coordText.textContent = '');

  if (!navigator.geolocation) {
    locationText && (locationText.textContent = 'Geolocation not supported');
    return;
  }

  navigator.geolocation.getCurrentPosition(
    pos => {
      currentLat = pos.coords.latitude;
      currentLng = pos.coords.longitude;
      const coords = { lat: currentLat, lng: currentLng };

      if (map && marker) {
        map.setCenter(coords);
        map.setZoom(15);
        marker.setPosition(coords);
      }

      coordText && (coordText.textContent = `${currentLat.toFixed(5)}, ${currentLng.toFixed(5)}`);
      reverseGeocode(currentLat, currentLng);
      saveLocationToFirestore(currentLat, currentLng);

      localStorage.setItem('lastKnownLocation', JSON.stringify(coords));
    },
    error => {
      console.error('Geolocation error:', error);

      const saved = localStorage.getItem('lastKnownLocation');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          currentLat = parsed.lat;
          currentLng = parsed.lng;
          const coords = { lat: currentLat, lng: currentLng };

          if (map && marker) {
            map.setCenter(coords);
            map.setZoom(15);
            marker.setPosition(coords);
          }

          locationText && (locationText.textContent = 'Using last known location');
          coordText && (coordText.textContent = `${currentLat.toFixed(5)}, ${currentLng.toFixed(5)}`);
          reverseGeocode(currentLat, currentLng);
          return;
        } catch {}
      }

      if (!locationText) return;
      if (error.code === 1) locationText.textContent = 'Location permission denied';
      else if (error.code === 2) locationText.textContent = 'Location unavailable';
      else if (error.code === 3) locationText.textContent = 'Location request timed out';
      else locationText.textContent = 'Could not fetch location';
    },
    { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 }
  );
}

function reverseGeocode(lat, lng) {
  const locationText = document.getElementById('locationText');
  if (!locationText) return;

  if (typeof google === 'undefined' || !google.maps) {
    locationText.textContent = `Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}`;
    return;
  }

  const geocoder = new google.maps.Geocoder();
  geocoder.geocode({ location: { lat, lng } }, (results, status) => {
    if (status === 'OK' && results && results[0]) {
      locationText.textContent = results[0].formatted_address;
    } else {
      locationText.textContent = `Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}`;
    }
  });
}

function showMapPlaceholder() {
  const mapDiv = document.getElementById('map');
  if (!mapDiv) return;
  mapDiv.innerHTML = `
    <div class="map-placeholder">
      <div class="pin-icon">📍</div>
      <p>Map unavailable</p>
    </div>
  `;
}

function saveLocationToFirestore(lat, lng) {
  if (!currentUser || !navigator.onLine) return;

  db.collection('users')
    .doc(currentUser.uid)
    .collection('meta')
    .doc('location')
    .set({
      lat,
      lng,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    })
    .catch(err => console.error('Location save error:', err));
}

// ─── SOS helpers ──────────────────────────────
function buildAlertMessage() {
  const lat = currentLat || 12.9716;
  const lng = currentLng || 77.5946;
  const mapsLink = `https://maps.google.com/?q=${lat},${lng}`;
  const displayName =
    document.getElementById('profileName')?.value.trim() ||
    currentUser?.email ||
    'A LifeSaver user';

  return `🚨 EMERGENCY ALERT\n\n${displayName} needs help!\n📍 Location: ${mapsLink}\n\nPlease respond immediately.`;
}

function sortContactsByPriority() {
  const order = { primary: 1, secondary: 2, other: 3 };
  return [...contacts].sort((a, b) => (order[a.priority] || 3) - (order[b.priority] || 3));
}

function sendSmartWhatsApp(message) {
  const encoded = encodeURIComponent(message);
  const sendAll = document.getElementById('sendAllToggle')?.checked;

  const selected = sendAll ? sortContactsByPriority() : sortContactsByPriority().filter(c => c.priority === 'primary');

  if (!selected.length) {
    showToast('❌ No contact available for WhatsApp');
    return;
  }

  selected.forEach(contact => {
    let phone = (contact.phone || '').replace(/\D/g, '');
    if (phone) {
      window.open(`https://wa.me/${phone}?text=${encoded}`, '_blank');
    }
  });
}

async function sendSMSToAll(message) {
  const sendAll = document.getElementById('sendAllToggle')?.checked;
  const selected = sendAll ? sortContactsByPriority() : sortContactsByPriority().filter(c => c.priority === 'primary');

  if (!selected.length) {
    showToast('❌ No contact available for SMS');
    return;
  }

  const phoneNumbers = selected.map(contact => contact.phone).filter(Boolean);

  try {
    const response = await fetch('/api/send-sms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ message, contacts: phoneNumbers })
    });

    const data = await response.json();
    if (response.ok) {
      showToast('✅ SMS sent successfully via Twilio');
    } else {
      console.error('Twilio Error:', data.error);
      showToast('❌ SMS backend error. Check config.');
      // Fallback to native SMS
      fallbackNativeSMS(message, phoneNumbers);
    }
  } catch (err) {
    console.error('Failed to call SMS backend:', err);
    // Fallback to native SMS
    fallbackNativeSMS(message, phoneNumbers);
  }
}

function fallbackNativeSMS(message, phoneNumbers) {
  const encoded = encodeURIComponent(message);
  phoneNumbers.forEach(phone => {
    let p = phone.replace(/\D/g, '');
    if (p) {
      window.location.href = `sms:${p}?body=${encoded}`;
    }
  });
}

function callPrimaryContact() {
  const primary = sortContactsByPriority()[0];
  let phone = (primary?.phone || '').replace(/\D/g, '');

  if (!phone) return showToast('❌ No valid phone number');
  window.location.href = `tel:${phone}`;
}

function copyAlertMessage(message) {
  if (!navigator.clipboard) return;
  navigator.clipboard.writeText(message).catch(() => {});
}

function cacheEmergencyData() {
  localStorage.setItem('lifesaver_contacts_cache', JSON.stringify(contacts));
  localStorage.setItem('lifesaver_profile_cache', JSON.stringify({
    name: document.getElementById('profileName')?.value.trim() || '',
    phone: document.getElementById('profilePhone')?.value.trim() || '',
    medical: document.getElementById('profileMedical')?.value.trim() || ''
  }));
}

// ─── Trigger Alert ────────────────────────────
async function triggerAlert() {
  if (!currentUser) return showToast('⚠️ Please log in first');
  if (contacts.length === 0) return showToast('⚠️ Add at least one emergency contact first');

  const statusDiv = document.getElementById('alertStatus');
  const msg = document.getElementById('alertMsg');
  const btn = document.getElementById('panicBtn');
  const lowNetworkMode = document.getElementById('lowNetworkToggle')?.checked || !navigator.onLine;

  if (btn) {
    btn.classList.add('activated');
    setTimeout(() => btn.classList.remove('activated'), 2000);
  }

  const siren = document.getElementById('sirenSound');
  if (siren) {
    siren.currentTime = 0;
    siren.play().catch(() => {});
    setTimeout(() => {
      siren.pause();
      siren.currentTime = 0;
    }, 4000);
  }

  statusDiv && statusDiv.classList.remove('hidden');
  msg && (msg.textContent = lowNetworkMode ? 'Low network mode active…' : 'Preparing emergency alert…');

  const audioRec = document.getElementById('audioRecording');
  if (audioRec) {
    audioRec.classList.remove('hidden');
    setTimeout(() => audioRec.classList.add('hidden'), 10000); // Hide after 10s
  }

  try {
    if (typeof refreshLocation === 'function') refreshLocation();

    const alertMessage = buildAlertMessage();
    cacheEmergencyData();
    copyAlertMessage(alertMessage);

    if (navigator.onLine) {
      await db.collection('users')
        .doc(currentUser.uid)
        .collection('alerts')
        .add({
          lat: currentLat || 12.9716,
          lng: currentLng || 77.5946,
          message: alertMessage,
          contacts: contacts.map(c => c.phone || c.email || c.name),
          status: lowNetworkMode ? 'low-network' : 'prepared',
          timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });

      alertsSent++;
      updateCounts();
      await loadHistory();
    } else {
      const offlineAlerts = JSON.parse(localStorage.getItem('lifesaver_offline_alerts') || '[]');
      offlineAlerts.push({
        message: alertMessage,
        timestamp: new Date().toISOString(),
        status: 'offline'
      });
      localStorage.setItem('lifesaver_offline_alerts', JSON.stringify(offlineAlerts));
    }

    if (lowNetworkMode) {
      sendSMSToAll(alertMessage);
      showToast('🚨 Low network mode: SMS fallback opened');
    } else {
      sendSmartWhatsApp(alertMessage);
      setTimeout(() => sendSMSToAll(alertMessage), 2000);
      showToast('🚨 WhatsApp + SMS fallback started');
    }
  } catch (err) {
    console.error(err);
    showToast('❌ Alert failed');
  }

  if (statusDiv) {
    setTimeout(() => statusDiv.classList.add('hidden'), 5000);
  }
}

// ─── Contacts ─────────────────────────────────
async function loadContacts() {
  if (!currentUser) {
    contacts = [];
    renderContacts();
    return;
  }

  try {
    const snapshot = await db.collection('users')
      .doc(currentUser.uid)
      .collection('contacts')
      .orderBy('createdAt', 'desc')
      .get();

    contacts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    localStorage.setItem('lifesaver_contacts_cache', JSON.stringify(contacts));
    renderContacts();
  } catch (err) {
    console.error('Load contacts error:', err);
    contacts = JSON.parse(localStorage.getItem('lifesaver_contacts_cache') || '[]');
    renderContacts();
  }
}

function renderContacts() {
  const list = document.getElementById('contactsList');
  const contactCount = document.getElementById('contactCount');

  if (contactCount) contactCount.textContent = contacts.length;
  if (!list) return;

  if (!currentUser) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔒</div>
        <p>Please log in to manage contacts.</p>
      </div>
    `;
    return;
  }

  if (contacts.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📭</div>
        <p>No emergency contacts added yet.</p>
      </div>
    `;
    return;
  }

  list.innerHTML = contacts.map(contact => `
    <div class="contact-card">
      <div class="contact-top">
        <div class="contact-avatar">${escapeHtml((contact.name || 'U').charAt(0).toUpperCase())}</div>
        <div>
          <div class="contact-name">${escapeHtml(contact.name || 'Unnamed')}</div>
          <span class="contact-relation">${escapeHtml(contact.relation || '-')}</span>
          <span class="contact-relation priority-badge ${contact.priority || 'other'}">${escapeHtml(contact.priority || 'other')}</span>
        </div>
      </div>
      <div class="contact-detail"><span>📞</span>${escapeHtml(contact.phone || '-')}</div>
      ${contact.email ? `<div class="contact-detail"><span>✉️</span>${escapeHtml(contact.email)}</div>` : ''}
      <div class="contact-actions">
        <button type="button" class="btn-sm danger" onclick="deleteContact('${contact.id}')">Delete</button>
      </div>
    </div>
  `).join('');
}

async function addContact() {
  if (!currentUser) return showToast('⚠️ Please log in first');

  const name = document.getElementById('cName')?.value.trim() || '';
  const phone = document.getElementById('cPhone')?.value.trim() || '';
  const email = document.getElementById('cEmail')?.value.trim() || '';
  const relation = document.getElementById('cRelation')?.value || 'Family';
  const priority = document.getElementById('cPriority')?.value || 'other';

  if (!name || (!phone && !email)) return showToast('⚠️ Enter name and phone or email');

  try {
    await db.collection('users')
      .doc(currentUser.uid)
      .collection('contacts')
      .add({
        name,
        phone,
        email,
        relation,
        priority,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });

    document.getElementById('cName').value = '';
    document.getElementById('cPhone').value = '';
    document.getElementById('cEmail').value = '';
    document.getElementById('cRelation').selectedIndex = 0;
    document.getElementById('cPriority').value = 'other';

    closeModal();
    showToast('✅ Contact added');
    await loadContacts();
  } catch (err) {
    console.error('Add contact error:', err);
    showToast('❌ Failed to add contact');
  }
}

async function deleteContact(contactId) {
  if (!currentUser) return;

  try {
    await db.collection('users')
      .doc(currentUser.uid)
      .collection('contacts')
      .doc(contactId)
      .delete();

    showToast('🗑️ Contact deleted');
    await loadContacts();
  } catch (err) {
    console.error('Delete contact error:', err);
    showToast('❌ Failed to delete contact');
  }
}

// ─── History ──────────────────────────────────
async function loadHistory() {
  const historyList = document.getElementById('historyList');
  const alertCount = document.getElementById('alertCount');
  if (!historyList) return;

  if (!currentUser) {
    historyList.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔒</div>
        <p>Please log in to view your alert history.</p>
      </div>
    `;
    alertCount && (alertCount.textContent = '0');
    return;
  }

  try {
    const snapshot = await db.collection('users')
      .doc(currentUser.uid)
      .collection('alerts')
      .orderBy('timestamp', 'desc')
      .get();

    alertsSent = snapshot.size;
    updateCounts();

    if (snapshot.empty) {
      historyList.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📜</div>
          <p>No alerts sent yet.</p>
        </div>
      `;
      return;
    }

    historyList.innerHTML = snapshot.docs.map(doc => {
      const data = doc.data();
      const timeText = data.timestamp?.toDate ? data.timestamp.toDate().toLocaleString() : 'Just now';

      return `
        <div class="history-card">
          <div class="history-header">
            <span class="status ${data.status || 'prepared'}">${escapeHtml(data.status || 'prepared')}</span>
            <span class="time">${escapeHtml(timeText)}</span>
          </div>
          <div class="history-message">
            <pre>${escapeHtml(data.message || '')}</pre>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error('Load history error:', err);
    historyList.innerHTML = `<p>❌ Failed to load history.</p>`;
  }
}

// ─── Profile ──────────────────────────────────
async function loadProfile() {
  if (!currentUser) return;

  try {
    const doc = await db.collection('users')
      .doc(currentUser.uid)
      .collection('meta')
      .doc('profile')
      .get();

    const nameInput = document.getElementById('profileName');
    const phoneInput = document.getElementById('profilePhone');
    const medicalInput = document.getElementById('profileMedical');
    const userName = document.getElementById('userName');
    const avatarInitial = document.getElementById('avatarInitial');

    if (doc.exists) {
      const data = doc.data();

      nameInput && (nameInput.value = data.name || '');
      phoneInput && (phoneInput.value = data.phone || '');
      medicalInput && (medicalInput.value = data.medical || '');

      localStorage.setItem('lifesaver_profile_cache', JSON.stringify(data));

      const displayName = data.name || currentUser.email || 'Buddy';
      userName && (userName.textContent = displayName);
      avatarInitial && (avatarInitial.textContent = displayName.charAt(0).toUpperCase());
    } else {
      const cached = JSON.parse(localStorage.getItem('lifesaver_profile_cache') || '{}');
      if (cached.name) {
        nameInput && (nameInput.value = cached.name || '');
        phoneInput && (phoneInput.value = cached.phone || '');
        medicalInput && (medicalInput.value = cached.medical || '');
        userName && (userName.textContent = cached.name);
        avatarInitial && (avatarInitial.textContent = cached.name.charAt(0).toUpperCase());
      }
    }
  } catch (err) {
    console.error('Load profile error:', err);
  }
}

async function saveProfile() {
  try {
    const user = firebase.auth().currentUser;
    if (!user) return showToast('⚠️ Please log in first');

    const name = document.getElementById('profileName')?.value.trim() || '';
    const phone = document.getElementById('profilePhone')?.value.trim() || '';
    const medical = document.getElementById('profileMedical')?.value.trim() || '';

    const payload = {
      name,
      phone,
      medical,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    localStorage.setItem('lifesaver_profile_cache', JSON.stringify({ name, phone, medical }));

    if (navigator.onLine) {
      await db.collection('users')
        .doc(user.uid)
        .collection('meta')
        .doc('profile')
        .set(payload);
    }

    const displayName = name || user.email || 'Buddy';
    document.getElementById('userName').textContent = displayName;
    document.getElementById('avatarInitial').textContent = displayName.charAt(0).toUpperCase();

    showToast('✅ Profile saved');
  } catch (err) {
    console.error('Save profile error:', err);
    showToast('❌ Failed to save profile');
  }
}

// ─── Modal ────────────────────────────────────
function openModal() {
  if (!currentUser) return showToast('⚠️ Please log in first');
  document.getElementById('modal')?.classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal')?.classList.add('hidden');
}

// ─── Utilities ────────────────────────────────
function updateCounts() {
  document.getElementById('contactCount').textContent = contacts.length;
  document.getElementById('alertCount').textContent = alertsSent;
  updateNetworkStatus();
}

function showToast(message) {
  const toast = document.getElementById('toast');
  if (!toast) return;

  toast.textContent = message;
  toast.classList.remove('hidden');
  toast.classList.add('show');

  setTimeout(() => {
    toast.classList.remove('show');
    toast.classList.add('hidden');
  }, 2500);
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, m => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[m]));
}

function getDarkMapStyle() {
  return [
    { elementType: 'geometry', stylers: [{ color: '#1d2c4d' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: '#8ec3b9' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#1a3646' }] },
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#304a7d' }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0e1626' }] }
  ];
}

// ─── Init ─────────────────────────────────────
(function init() {
  renderContacts();
  updateNetworkStatus();

  const saved = localStorage.getItem('lastKnownLocation');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      currentLat = parsed.lat;
      currentLng = parsed.lng;
      const coordText = document.getElementById('coordText');
      if (coordText) coordText.textContent = `${currentLat.toFixed(5)}, ${currentLng.toFixed(5)}`;
    } catch {}
  }

  setTimeout(() => {
    if (typeof refreshLocation === 'function') refreshLocation();
  }, 1000);

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
})();

// ─── Globals ──────────────────────────────────
window.signup = signup;
window.login = login;
window.logout = logout;
window.initMap = initMap;
window.refreshLocation = refreshLocation;
window.triggerAlert = triggerAlert;
window.openModal = openModal;
window.closeModal = closeModal;
window.addContact = addContact;
window.saveProfile = saveProfile;
window.deleteContact = deleteContact;
window.callPrimaryContact = callPrimaryContact;
window.scheduleFakeCall = scheduleFakeCall;

function scheduleFakeCall() {
  showToast('📱 Fake call scheduled in 10 seconds. Keep your volume up.');
  setTimeout(() => {
    // Attempt to play a ringtone or vibrate
    if (navigator.vibrate) {
      navigator.vibrate([1000, 500, 1000, 500, 1000]);
    }
    const siren = document.getElementById('sirenSound');
    if (siren) {
      siren.currentTime = 0;
      siren.play().catch(() => {});
      setTimeout(() => siren.pause(), 5000);
    }
    
    // Create a fake incoming call UI
    const fakeCallUI = document.createElement('div');
    fakeCallUI.style.position = 'fixed';
    fakeCallUI.style.inset = '0';
    fakeCallUI.style.background = '#1a1a1a';
    fakeCallUI.style.zIndex = '9999';
    fakeCallUI.style.display = 'flex';
    fakeCallUI.style.flexDirection = 'column';
    fakeCallUI.style.alignItems = 'center';
    fakeCallUI.style.justifyContent = 'center';
    fakeCallUI.innerHTML = `
      <div style="font-size: 2rem; color: #fff; margin-bottom: 10px;">Dad</div>
      <div style="font-size: 1.2rem; color: #aaa; margin-bottom: 50px;">Incoming Call...</div>
      <div style="display: flex; gap: 40px;">
        <button id="declineCall" style="width: 70px; height: 70px; border-radius: 50%; background: #e8192c; border: none; font-size: 1.5rem; cursor: pointer;">📞</button>
        <button id="acceptCall" style="width: 70px; height: 70px; border-radius: 50%; background: #0dff8c; border: none; font-size: 1.5rem; cursor: pointer;">📞</button>
      </div>
    `;
    document.body.appendChild(fakeCallUI);

    document.getElementById('declineCall').onclick = () => {
      document.body.removeChild(fakeCallUI);
      if (siren) siren.pause();
    };
    
    document.getElementById('acceptCall').onclick = () => {
      document.body.removeChild(fakeCallUI);
      if (siren) siren.pause();
      // Simulate talking interface briefly
      showToast('Fake call answered.');
    };
  }, 10000);
}
