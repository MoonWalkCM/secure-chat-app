// Глобальные переменные для звонков
let currentCall = null;
let localStream = null;
let remoteStream = null;
let peerConnection = null;
let callStatusPolling = null;
let contacts = [];
let currentUser = null;
let pingInterval = null;
let callTimer = null;

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
    initializeCalls();
});

async function initializeCalls() {
    const token = localStorage.getItem('jwtToken');
    if (!token) {
        window.location.href = '/';
        return;
    }

    try {
        // Получаем информацию о текущем пользователе
        const decoded = JSON.parse(atob(token.split('.')[1]));
        currentUser = decoded.login;
        
        // Загружаем контакты
        await loadContacts();
        
        // Начинаем опрос статуса звонков
        startCallStatusPolling();
        
        // Начинаем ping для поддержания онлайн статуса
        startPing();
        
        console.log('Звонки инициализированы');
    } catch (error) {
        console.error('Ошибка инициализации звонков:', error);
    }
}

// Функция ping для поддержания онлайн статуса
function startPing() {
    if (pingInterval) {
        clearInterval(pingInterval);
    }
    
    pingInterval = setInterval(async () => {
        try {
            await fetch('/ping', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('jwtToken')}`
                }
            });
        } catch (error) {
            console.error('Ошибка ping:', error);
        }
    }, 15000);
}

// Очистка ping при выходе
function stopPing() {
    if (pingInterval) {
        clearInterval(pingInterval);
        pingInterval = null;
    }
}

// Загрузка контактов
async function loadContacts() {
    try {
        const response = await fetch('/contacts', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('jwtToken')}`
            }
        });
        
        if (response.ok) {
            contacts = await response.json();
            renderContacts();
        } else {
            console.error('Ошибка загрузки контактов');
        }
    } catch (error) {
        console.error('Ошибка загрузки контактов:', error);
    }
}

// Отрисовка контактов
function renderContacts() {
    const contactsContainer = document.getElementById('contacts-list');
    if (!contactsContainer) return;

    contactsContainer.innerHTML = '';
    
    if (contacts.length === 0) {
        contactsContainer.innerHTML = `
            <div class="placeholder">
                <i class="fas fa-users"></i>
                <h3>Нет контактов</h3>
                <p>Добавьте контакты для начала звонков</p>
            </div>
        `;
        return;
    }
    
    contacts.forEach(contact => {
        const contactElement = document.createElement('div');
        contactElement.className = 'contact-item';
        contactElement.innerHTML = `
            <div class="contact-info">
                <div class="contact-name">${contact.nickname || contact.login}</div>
                <div class="contact-status ${contact.is_online ? 'online' : 'offline'}">
                    ${contact.is_online ? 'Онлайн' : 'Оффлайн'}
                </div>
            </div>
            <div class="contact-actions">
                <button class="call-btn video-call" onclick="startCall('${contact.login}', true)" ${currentCall ? 'disabled' : ''}>
                    <i class="fas fa-video"></i>
                </button>
                <button class="call-btn audio-call" onclick="startCall('${contact.login}', false)" ${currentCall ? 'disabled' : ''}>
                    <i class="fas fa-phone"></i>
                </button>
            </div>
        `;
        contactsContainer.appendChild(contactElement);
    });
}

// Получение ICE серверов
async function getIceServers() {
    try {
        const response = await fetch('/ice-servers');
        const data = await response.json();
        return data.iceServers;
    } catch (error) {
        console.error('Ошибка получения ICE серверов:', error);
        return [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
        ];
    }
}

// Создание RTCPeerConnection
function createPeerConnection() {
    const config = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
        ]
    };
    
    const pc = new RTCPeerConnection(config);
    
    // Обработка удаленного потока
    pc.ontrack = (event) => {
        console.log('Получен удаленный поток');
        if (event.streams && event.streams.length > 0) {
            remoteStream = event.streams[0];
            const remoteVideo = document.getElementById('remote-video');
            if (remoteVideo) {
                remoteVideo.srcObject = remoteStream;
                remoteVideo.play().catch(e => console.error('Ошибка воспроизведения:', e));
            }
        }
    };
    
    // Обработка ICE кандидатов
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            sendIceCandidate(event.candidate);
        }
    };
    
    // Обработка состояния соединения
    pc.onconnectionstatechange = () => {
        console.log('Состояние соединения:', pc.connectionState);
        if (pc.connectionState === 'connected') {
            updateCallStatus('Соединение установлено');
            startCallTimer();
        } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
            updateCallStatus('Соединение потеряно');
            stopCallTimer();
        }
    };
    
    return pc;
}

// Начало звонка
async function startCall(recipient, withVideo) {
    try {
        console.log(`Начинаем ${withVideo ? 'видео' : 'аудио'} звонок к ${recipient}`);
        
        // Получаем медиа потоки
        const constraints = {
            audio: true,
            video: withVideo
        };
        
        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        
        // Создаем RTCPeerConnection
        peerConnection = createPeerConnection();
        
        // Добавляем локальный поток
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
        
        // Создаем offer
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        
        // Отправляем offer на сервер
        const response = await fetch('/call/offer', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('jwtToken')}`
            },
            body: JSON.stringify({
                recipient: recipient,
                offer: offer,
                withVideo: withVideo
            })
        });
        
        if (response.ok) {
            const data = await response.json();
            
            // Устанавливаем текущий звонок
            currentCall = {
                id: data.callId,
                caller: currentUser,
                recipient: recipient,
                status: 'pending',
                withVideo: withVideo
            };
            
            // Показываем интерфейс звонка
            showCallInterface();
            updateCallStatus('Набор...');
            
            console.log('Звонок инициирован:', data.callId);
        }
    } catch (error) {
        console.error('Ошибка начала звонка:', error);
        alert(`Ошибка начала звонка: ${error.message}`);
    }
}

// Отправка ICE кандидата
async function sendIceCandidate(candidate) {
    if (!currentCall) return;
    
    try {
        await fetch('/call/ice-candidate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('jwtToken')}`
            },
            body: JSON.stringify({
                callId: currentCall.id,
                candidate: candidate
            })
        });
    } catch (error) {
        console.error('Ошибка отправки ICE кандидата:', error);
    }
}

// Завершение звонка
async function endCall() {
    console.log('Завершаем звонок');
    
    if (currentCall) {
        try {
            await fetch('/call/end', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('jwtToken')}`
                },
                body: JSON.stringify({
                    callId: currentCall.id
                })
            });
        } catch (error) {
            console.error('Ошибка завершения звонка:', error);
        }
    }
    
    // Очищаем ресурсы
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    
    currentCall = null;
    remoteStream = null;
    
    // Останавливаем таймер
    stopCallTimer();
    
    // Скрываем интерфейс звонка
    hideCallInterface();
    
    // Перезагружаем контакты
    await loadContacts();
    
    console.log('Звонок завершен');
}

// Получение статуса звонка
async function getCallStatus(callId) {
    try {
        const response = await fetch(`/call/status/${callId}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('jwtToken')}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            return data.callSession;
        }
    } catch (error) {
        console.error('Ошибка получения статуса звонка:', error);
    }
    return null;
}

// Опрос статуса звонков
function startCallStatusPolling() {
    callStatusPolling = setInterval(async () => {
        try {
            // Проверяем входящие звонки
            await checkIncomingCalls();
            
            // Проверяем статус активного звонка
            if (currentCall) {
                const callStatus = await getCallStatus(currentCall.id);
                if (callStatus) {
                    handleCallStatusUpdate(callStatus);
                } else {
                    // Звонок не найден, завершаем
                    endCall();
                }
            }
        } catch (error) {
            console.error('Ошибка опроса статуса звонков:', error);
        }
    }, 2000);
}

// Проверка входящих звонков
async function checkIncomingCalls() {
    try {
        const response = await fetch('/call/incoming', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('jwtToken')}`
            }
        });
        
        if (response.ok) {
            const incomingCalls = await response.json();
            
            for (const call of incomingCalls) {
                if (call.recipient === currentUser && call.status === 'pending' && !currentCall) {
                    showIncomingCall(call);
                    break;
                }
            }
        }
    } catch (error) {
        console.error('Ошибка проверки входящих звонков:', error);
    }
}

// Показ входящего звонка
function showIncomingCall(call) {
    console.log('Входящий звонок от:', call.caller);
    
    const incomingCallHTML = `
        <div id="incoming-call-overlay" class="incoming-call-overlay">
            <div class="incoming-call-modal">
                <div class="incoming-call-info">
                    <h3>Входящий ${call.withVideo ? 'видео' : 'аудио'} звонок</h3>
                    <p>От: ${call.caller}</p>
                </div>
                <div class="incoming-call-actions">
                    <button id="accept-call-btn" class="accept-btn">
                        <i class="fas fa-phone"></i> Принять
                    </button>
                    <button id="reject-call-btn" class="reject-btn">
                        <i class="fas fa-phone-slash"></i> Отклонить
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', incomingCallHTML);
    
    document.getElementById('accept-call-btn').onclick = () => acceptIncomingCall(call);
    document.getElementById('reject-call-btn').onclick = () => rejectIncomingCall(call);
    
    playRingtone();
}

// Принятие входящего звонка
async function acceptIncomingCall(call) {
    try {
        console.log('Принимаем входящий звонок');
        
        // Получаем медиа потоки
        const constraints = {
            audio: true,
            video: call.withVideo
        };
        
        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        
        // Создаем RTCPeerConnection
        peerConnection = createPeerConnection();
        
        // Добавляем локальный поток
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
        
        // Устанавливаем удаленное описание
        await peerConnection.setRemoteDescription(new RTCSessionDescription(call.offer));
        
        // Создаем answer
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        
        // Отправляем answer
        const response = await fetch('/call/answer', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('jwtToken')}`
            },
            body: JSON.stringify({
                callId: call.id,
                answer: answer
            })
        });
        
        if (response.ok) {
            currentCall = {
                id: call.id,
                caller: call.caller,
                recipient: call.recipient,
                status: 'active',
                withVideo: call.withVideo
            };
            
            hideIncomingCall();
            showCallInterface();
            updateCallStatus('Звонок активен');
        }
    } catch (error) {
        console.error('Ошибка принятия звонка:', error);
        hideIncomingCall();
    }
}

// Отклонение входящего звонка
async function rejectIncomingCall(call) {
    try {
        await fetch('/call/reject', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('jwtToken')}`
            },
            body: JSON.stringify({
                callId: call.id
            })
        });
        
        hideIncomingCall();
    } catch (error) {
        console.error('Ошибка отклонения звонка:', error);
        hideIncomingCall();
    }
}

// Скрытие интерфейса входящего звонка
function hideIncomingCall() {
    const overlay = document.getElementById('incoming-call-overlay');
    if (overlay) {
        overlay.remove();
    }
    stopRingtone();
}

// Воспроизведение звука звонка
let ringtone = null;

function playRingtone() {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
    oscillator.frequency.setValueAtTime(600, audioContext.currentTime + 0.5);
    
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 1);
    
    ringtone = setInterval(() => {
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        
        osc.connect(gain);
        gain.connect(audioContext.destination);
        
        osc.frequency.setValueAtTime(800, audioContext.currentTime);
        osc.frequency.setValueAtTime(600, audioContext.currentTime + 0.5);
        
        gain.gain.setValueAtTime(0.3, audioContext.currentTime);
        
        osc.start();
        osc.stop(audioContext.currentTime + 1);
    }, 2000);
}

function stopRingtone() {
    if (ringtone) {
        clearInterval(ringtone);
        ringtone = null;
    }
}

// Обработка обновления статуса звонка
function handleCallStatusUpdate(callStatus) {
    console.log('Обновление статуса звонка:', callStatus.status);
    
    if (callStatus.status === 'rejected') {
        alert('Звонок отклонен');
        endCall();
    } else if (callStatus.status === 'ended') {
        alert('Звонок завершен');
        endCall();
    } else if (callStatus.status === 'active' && currentCall && currentCall.status === 'pending') {
        // Звонок принят
        if (callStatus.answer) {
            peerConnection.setRemoteDescription(new RTCSessionDescription(callStatus.answer))
                .then(() => {
                    currentCall.status = 'active';
                    updateCallStatus('Звонок активен');
                })
                .catch(error => {
                    console.error('Ошибка установки соединения:', error);
                });
        }
    }
}

// Показ интерфейса звонка
function showCallInterface() {
    const callInterface = document.getElementById('call-interface');
    const noCallPlaceholder = document.getElementById('no-call-placeholder');
    
    if (callInterface) {
        callInterface.style.display = 'flex';
    }
    
    if (noCallPlaceholder) {
        noCallPlaceholder.style.display = 'none';
    }
    
    const localVideo = document.getElementById('local-video');
    if (localVideo && localStream) {
        localVideo.srcObject = localStream;
        localVideo.play().catch(e => console.error('Ошибка воспроизведения локального видео:', e));
    }
}

// Скрытие интерфейса звонка
function hideCallInterface() {
    const callInterface = document.getElementById('call-interface');
    const noCallPlaceholder = document.getElementById('no-call-placeholder');
    
    if (callInterface) {
        callInterface.style.display = 'none';
    }
    
    if (noCallPlaceholder) {
        noCallPlaceholder.style.display = 'flex';
    }
    
    const localVideo = document.getElementById('local-video');
    const remoteVideo = document.getElementById('remote-video');
    if (localVideo) localVideo.srcObject = null;
    if (remoteVideo) remoteVideo.srcObject = null;
}

// Обновление статуса звонка
function updateCallStatus(status) {
    const statusElement = document.getElementById('call-status');
    if (statusElement) {
        statusElement.textContent = status;
    }
}

// Таймер звонка
function startCallTimer() {
    if (callTimer) {
        clearInterval(callTimer);
    }
    
    const startTime = Date.now();
    callTimer = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const minutes = Math.floor(elapsed / 60000);
        const seconds = Math.floor((elapsed % 60000) / 1000);
        updateCallStatus(`Звонок активен (${minutes}:${seconds.toString().padStart(2, '0')})`);
    }, 1000);
}

function stopCallTimer() {
    if (callTimer) {
        clearInterval(callTimer);
        callTimer = null;
    }
}

// Управление микрофоном
function toggleMute() {
    if (localStream) {
        const audioTrack = localStream.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            const muteBtn = document.getElementById('mute-btn');
            if (muteBtn) {
                muteBtn.innerHTML = audioTrack.enabled ? '<i class="fas fa-microphone"></i>' : '<i class="fas fa-microphone-slash"></i>';
                muteBtn.style.background = audioTrack.enabled ? '#a0aec0' : '#f56565';
            }
        }
    }
}

// Управление камерой
function toggleVideo() {
    if (localStream) {
        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.enabled = !videoTrack.enabled;
            const videoBtn = document.getElementById('video-btn');
            if (videoBtn) {
                videoBtn.innerHTML = videoTrack.enabled ? '<i class="fas fa-video"></i>' : '<i class="fas fa-video-slash"></i>';
                videoBtn.style.background = videoTrack.enabled ? '#a0aec0' : '#f56565';
            }
        }
    }
}

// Очистка при выходе
window.addEventListener('beforeunload', () => {
    if (currentCall) {
        endCall();
    }
    stopPing();
}); 
