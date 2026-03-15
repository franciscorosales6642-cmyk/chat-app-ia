const state = {
  token: localStorage.getItem('token') || '',
  user: JSON.parse(localStorage.getItem('user') || 'null'),
  conversations: [],
  currentConversationId: null,
  currentConversationKind: null,
  socket: null,
};

const $ = (id) => document.getElementById(id);
const authView = $('authView');
const chatView = $('chatView');
const flash = $('flash');
const currentUserLabel = $('currentUserLabel');
const conversationList = $('conversationList');
const searchResults = $('searchResults');
const messagesBox = $('messages');
const chatTitle = $('chatTitle');
const chatSubtitle = $('chatSubtitle');

function showFlash(text, isError = false) {
  flash.textContent = text;
  flash.style.color = isError ? '#fca5a5' : '#fde68a';
}

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const response = await fetch(path, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Error de servidor');
  return data;
}

function setAuthTab(name) {
  document.querySelectorAll('[data-auth-tab]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.authTab === name);
  });
  document.querySelectorAll('.auth-form').forEach((form) => form.classList.remove('active'));
  const formMap = {
    login: 'loginForm',
    register: 'registerForm',
    verify: 'verifyForm',
    recover: 'recoverForm',
  };
  $(formMap[name]).classList.add('active');
}

async function loadConversations() {
  const data = await api('/api/chat/conversations');
  const aiData = await api('/api/ai/conversation');
  state.conversations = data.conversations;
  if (!state.conversations.find((c) => c.id === aiData.conversationId)) {
    state.conversations.unshift({ id: aiData.conversationId, kind: 'ai', title: 'Asistente IA', last_message: '' });
  }
  renderConversations();
}

function renderConversations() {
  conversationList.innerHTML = '';
  state.conversations.forEach((conv) => {
    const div = document.createElement('div');
    div.className = 'card' + (state.currentConversationId === conv.id ? ' active' : '');
    div.innerHTML = `
      <strong>${conv.title || 'Chat'}</strong>
      <small>${conv.last_message || 'Sin mensajes aún'}</small>
    `;
    div.onclick = () => selectConversation(conv);
    conversationList.appendChild(div);
  });
}

function renderMessages(messages) {
  messagesBox.innerHTML = '';
  messages.forEach((msg) => appendMessage(msg));
  messagesBox.scrollTop = messagesBox.scrollHeight;
}

function appendMessage(msg) {
  const div = document.createElement('div');
  const isMine = Number(msg.sender_id) === Number(state.user?.id);
  const isAi = msg.message_type === 'ai' || msg.sender_name === 'Asistente IA';
  div.className = 'message' + (isMine ? ' mine' : '') + (isAi ? ' ai' : '');
  const time = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  let content = escapeHtml(msg.message);
  if (msg.message_type === 'file' && msg.file_url) {
    const fileName = String(msg.message || '');
    const fileUrl = String(msg.file_url || '');
    const isImage = /\.(jpg|jpeg|png|gif|webp|bmp|svg|avif)$/i.test(fileName) || /\.(jpg|jpeg|png|gif|webp|bmp|svg|avif)$/i.test(fileUrl);
    if (isImage) {
      content = `
        <a href="${msg.file_url}" target="_blank" rel="noopener noreferrer" class="chat-image-link">
          <img src="${msg.file_url}" alt="${escapeHtml(msg.message)}" class="chat-image" />
        </a>
      `;
    } else {
      content = `<a href="${msg.file_url}" target="_blank" rel="noopener noreferrer">${escapeHtml(msg.message)}</a>`;
    }
  } else if (msg.latitude != null && msg.longitude != null) {
    const latitude = Number(msg.latitude);
    const longitude = Number(msg.longitude);
    const label = msg.location_label ? escapeHtml(msg.location_label) : 'Ubicacion compartida';
    const coords = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
    const mapUrl = `https://www.google.com/maps?q=${encodeURIComponent(`${latitude},${longitude}`)}`;
    content = `
      <div class="location-card">
        <div class="location-title">${label}</div>
        <div class="location-coords">${coords}</div>
        <a href="${mapUrl}" target="_blank" rel="noopener noreferrer">Abrir en mapa</a>
      </div>
    `;
  }

  div.innerHTML = `
    <div class="message-content">${content}</div>
    <div class="message-time">${time}</div>
  `;
  messagesBox.appendChild(div);
  messagesBox.scrollTop = messagesBox.scrollHeight;
}

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

async function selectConversation(conv) {
  state.currentConversationId = conv.id;
  state.currentConversationKind = conv.kind;
  chatTitle.textContent = conv.title || 'Chat';
  chatSubtitle.textContent = conv.kind === 'ai'
    ? 'Habla con la inteligencia artificial usando tu API configurada.'
    : (conv.other_user?.status_text || conv.other_user?.email || 'Conversación privada');

  renderConversations();
  state.socket?.emit('joinConversation', conv.id);
  const data = await api(`/api/chat/conversations/${conv.id}/messages`);
  renderMessages(data.messages);
}

function connectSocket() {
  if (!state.token) return;
  state.socket?.disconnect();
  state.socket = io({ auth: { token: state.token } });
  state.socket.on('newMessage', (message) => {
    if (Number(message.conversation_id) === Number(state.currentConversationId)) {
      appendMessage(message);
    }
    loadConversations().catch(() => {});
  });
}

function enterApp() {
  authView.classList.add('hidden');
  chatView.classList.remove('hidden');
  currentUserLabel.textContent = `${state.user.name} · ${state.user.email}`;
  $('profileForm').name.value = state.user.name || '';
  $('profileForm').status_text.value = state.user.status_text || '';
  // $('profileForm').avatar_url.value = state.user.avatar_url || '';
  const avatarImg = $('currentAvatar');
  if (state.user.avatar_url) {
    avatarImg.src = state.user.avatar_url;
    avatarImg.style.display = 'block';
  } else {
    avatarImg.style.display = 'none';
  }
  connectSocket();
  loadConversations().then(() => {
    const preferredConversation = state.conversations.find((conv) => conv.kind !== 'ai') || state.conversations[0];
    if (preferredConversation) selectConversation(preferredConversation);
  }).catch((e) => alert(e.message));
}

function leaveApp() {
  state.token = '';
  state.user = null;
  state.currentConversationId = null;
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  state.socket?.disconnect();
  chatView.classList.add('hidden');
  authView.classList.remove('hidden');
}

document.querySelectorAll('[data-auth-tab]').forEach((btn) => btn.addEventListener('click', () => setAuthTab(btn.dataset.authTab)));

$('registerForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const body = Object.fromEntries(new FormData(e.target).entries());
    const data = await api('/api/auth/register', { method: 'POST', body: JSON.stringify(body) });
    showFlash(data.message);
    setAuthTab('verify');
    $('verifyForm').email.value = body.email;
  } catch (err) {
    showFlash(err.message, true);
  }
});

$('verifyForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const body = Object.fromEntries(new FormData(e.target).entries());
    const data = await api('/api/auth/verify-email', { method: 'POST', body: JSON.stringify(body) });
    showFlash(data.message);
    setAuthTab('login');
    $('loginForm').email.value = body.email;
  } catch (err) {
    showFlash(err.message, true);
  }
});

$('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const body = Object.fromEntries(new FormData(e.target).entries());
    const data = await api('/api/auth/login', { method: 'POST', body: JSON.stringify(body) });
    state.token = data.token;
    state.user = data.user;
    localStorage.setItem('token', state.token);
    localStorage.setItem('user', JSON.stringify(state.user));
    enterApp();
  } catch (err) {
    showFlash(err.message, true);
  }
});

$('sendRecoveryBtn').addEventListener('click', async () => {
  try {
    const email = $('recoverForm').email.value;
    const data = await api('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) });
    showFlash(data.message);
  } catch (err) {
    showFlash(err.message, true);
  }
});

$('recoverForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const body = Object.fromEntries(new FormData(e.target).entries());
    const data = await api('/api/auth/reset-password', { method: 'POST', body: JSON.stringify(body) });
    showFlash(data.message);
    setAuthTab('login');
  } catch (err) {
    showFlash(err.message, true);
  }
});

$('logoutBtn').addEventListener('click', leaveApp);

$('changeAvatarBtn').addEventListener('click', () => {
  $('avatarModal').classList.remove('hidden');
});

$('closeModalBtn').addEventListener('click', () => {
  $('avatarModal').classList.add('hidden');
});

$('galleryBtn').addEventListener('click', () => {
  $('avatarModal').classList.add('hidden');
  $('avatarInput').click();
});

$('cameraBtn').addEventListener('click', async () => {
  $('avatarModal').classList.add('hidden');
  $('cameraModal').classList.remove('hidden');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    const video = $('cameraVideo');
    video.srcObject = stream;
  } catch (err) {
    alert('Error al acceder a la cámara: ' + err.message);
    $('cameraModal').classList.add('hidden');
  }
});

$('captureBtn').addEventListener('click', () => {
  const video = $('cameraVideo');
  const canvas = $('cameraCanvas');
  const context = canvas.getContext('2d');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  context.drawImage(video, 0, 0);
  const dataUrl = canvas.toDataURL('image/png');
  // Mostrar preview o algo, pero por ahora, ocultar video y mostrar botones
  video.style.display = 'none';
  canvas.style.display = 'block';
  $('captureBtn').style.display = 'none';
  $('retakeBtn').style.display = 'inline';
  $('uploadPhotoBtn').style.display = 'inline';
});

$('retakeBtn').addEventListener('click', () => {
  const video = $('cameraVideo');
  const canvas = $('cameraCanvas');
  video.style.display = 'block';
  canvas.style.display = 'none';
  $('captureBtn').style.display = 'inline';
  $('retakeBtn').style.display = 'none';
  $('uploadPhotoBtn').style.display = 'none';
});

$('uploadPhotoBtn').addEventListener('click', async () => {
  const canvas = $('cameraCanvas');
  canvas.toBlob(async (blob) => {
    const formData = new FormData();
    formData.append('avatar', blob, 'photo.png');

    try {
      const response = await fetch('/api/users/upload-avatar', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${state.token}` },
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      state.user.avatar_url = data.avatar_url;
      localStorage.setItem('user', JSON.stringify(state.user));
      const avatarImg = $('currentAvatar');
      avatarImg.src = data.avatar_url;
      avatarImg.style.display = 'block';
      alert('Foto de perfil actualizada');
      closeCamera();
    } catch (err) {
      alert('Error al subir foto: ' + err.message);
    }
  });
});

$('closeCameraBtn').addEventListener('click', () => {
  closeCamera();
});

function closeCamera() {
  const video = $('cameraVideo');
  const stream = video.srcObject;
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
  }
  video.style.display = 'block';
  $('cameraCanvas').style.display = 'none';
  $('captureBtn').style.display = 'inline';
  $('retakeBtn').style.display = 'none';
  $('uploadPhotoBtn').style.display = 'none';
  $('cameraModal').classList.add('hidden');
}

$('avatarInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append('avatar', file);

  try {
    const response = await fetch('/api/users/upload-avatar', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${state.token}` },
      body: formData,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    state.user.avatar_url = data.avatar_url;
    localStorage.setItem('user', JSON.stringify(state.user));
    const avatarImg = $('currentAvatar');
    avatarImg.src = data.avatar_url;
    avatarImg.style.display = 'block';
    alert('Foto de perfil actualizada');
  } catch (err) {
    alert('Error al subir avatar: ' + err.message);
  }
});

$('profileForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const body = Object.fromEntries(new FormData(e.target).entries());
    delete body.avatar; // por si acaso
    const data = await api('/api/users/me', { method: 'PUT', body: JSON.stringify(body) });
    state.user = data.user;
    localStorage.setItem('user', JSON.stringify(state.user));
    currentUserLabel.textContent = `${state.user.name} · ${state.user.email}`;
    alert('Perfil actualizado');
  } catch (err) {
    alert(err.message);
  }
});

$('searchUsersBtn').addEventListener('click', async () => {
  try {
    const q = $('userSearchInput').value.trim();
    const data = await api(`/api/users/search?q=${encodeURIComponent(q)}`);
    searchResults.innerHTML = '';
    data.users.forEach((user) => {
      const div = document.createElement('div');
      div.className = 'card';
      div.innerHTML = `<strong>${escapeHtml(user.name)}</strong><small>${escapeHtml(user.email)}</small>`;
      div.onclick = async () => {
        const created = await api(`/api/chat/direct/${user.id}`, { method: 'POST' });
        await loadConversations();
        const conv = state.conversations.find((c) => Number(c.id) === Number(created.conversationId));
        if (conv) selectConversation(conv);
      };
      searchResults.appendChild(div);
    });
  } catch (err) {
    alert(err.message);
  }
});

$('attachBtn').addEventListener('click', () => {
  $('fileInput').click();
});

$('locationBtn').addEventListener('click', async () => {
  if (!state.currentConversationId) return;
  if (state.currentConversationKind === 'ai') {
    alert('La ubicacion solo esta disponible en chats directos.');
    return;
  }
  if (!navigator.geolocation) {
    alert('Tu navegador no soporta geolocalizacion.');
    return;
  }

  const locationBtn = $('locationBtn');
  locationBtn.disabled = true;
  locationBtn.textContent = 'Ubicando...';

  try {
    const position = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      });
    });

    await api(`/api/chat/conversations/${state.currentConversationId}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        message: 'Ubicacion compartida',
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        locationLabel: 'Ubicacion actual',
      }),
    });
  } catch (err) {
    alert(err.message || 'No se pudo compartir la ubicacion');
  } finally {
    locationBtn.disabled = false;
    locationBtn.textContent = 'Ubicacion';
  }
});

$('fileInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file || !state.currentConversationId) return;

  if (state.currentConversationKind === 'ai') {
    alert('Las imagenes y archivos solo estan disponibles en chats directos.');
    e.target.value = '';
    return;
  }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('message', file.name);

  try {
    const response = await fetch(`/api/chat/conversations/${state.currentConversationId}/upload`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${state.token}` },
      body: formData,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Error al enviar archivo');
    e.target.value = '';
  } catch (err) {
    alert('Error al enviar archivo: ' + err.message);
  }
});

$('messageForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = $('messageInput');
  const text = input.value.trim();
  if (!text || !state.currentConversationId) return;

  try {
    if (state.currentConversationKind === 'ai') {
      await api('/api/ai/message', {
        method: 'POST',
        body: JSON.stringify({ conversationId: state.currentConversationId, prompt: text }),
      });
    } else {
      await api(`/api/chat/conversations/${state.currentConversationId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ message: text }),
      });
    }
    input.value = '';
  } catch (err) {
    alert(err.message);
  }
});

if (state.token && state.user) {
  enterApp();
} else {
  setAuthTab('login');
}
