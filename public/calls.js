// Глобальные переменные для звонков
let currentCall = null;
let localStream = null;
let remoteStream = null;
let peerConnection = null;
let callStatusPolling = null;
let contacts = [];
let currentUser = null;

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
        
        console.log('Звонки инициализированы');
    } catch (error) {
        console.error('Ошибка инициализации звонков:', error);
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
        const iceServers = await getIceServers();
        peerConnection = new RTCPeerConnection({ iceServers });
        
        // Добавляем локальный поток
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
        
        // Обработка удаленного потока
        peerConnection.ontrack = (event) => {
            console.log('Получен удаленный поток');
            remoteStream = event.streams[0];
            const remoteVideo = document.getElementById('remote-video');
            if (remoteVideo) {
                remoteVideo.srcObject = remoteStream;
                remoteVideo.play().catch(e => console.error('Ошибка воспроизведения видео:', e));
            }
        };
        
        // Обработка ICE кандидатов
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                sendIceCandidate(event.candidate);
            }
        };
        
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
            currentCall = {
                id: data.callId,
                recipient: recipient,
                withVideo: withVideo,
                status: 'pending'
            };
            
            showCallInterface();
            updateCallStatus('Исходящий звонок...');
            
            console.log('Звонок инициирован:', data.callId);
        } else {
            const error = await response.json();
            throw new Error(error.error || 'Ошибка инициации звонка');
        }
        
    } catch (error) {
        console.error('Ошибка начала звонка:', error);
        alert(`Ошибка начала звонка: ${error.message}`);
        endCall();
    }
}

// Получение ICE серверов
async function getIceServers() {
    try {
        const response = await fetch('/ice-servers');
        const data = await response.json();
        return data.iceServers;
    } catch (error) {
        console.error('Ошибка получения ICE серверов:', error);
        return [];
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

// Принятие звонка
async function acceptCall() {
    if (!currentCall) return;
    
    try {
        console.log('Принимаем звонок');
        
        // Получаем медиа потоки
        const constraints = {
            audio: true,
            video: currentCall.withVideo
        };
        
        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        
        // Создаем RTCPeerConnection
        const iceServers = await getIceServers();
        peerConnection = new RTCPeerConnection({ iceServers });
        
        // Добавляем локальный поток
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
        
        // Обработка удаленного потока
        peerConnection.ontrack = (event) => {
            console.log('Получен удаленный поток');
            remoteStream = event.streams[0];
            const remoteVideo = document.getElementById('remote-video');
            if (remoteVideo) {
                remoteVideo.srcObject = remoteStream;
                remoteVideo.play().catch(e => console.error('Ошибка воспроизведения видео:', e));
            }
        };
        
        // Обработка ICE кандидатов
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                sendIceCandidate(event.candidate);
            }
        };
        
        // Получаем offer от сервера
        const callStatus = await getCallStatus(currentCall.id);
        if (callStatus.offer) {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(callStatus.offer));
            
            // Создаем answer
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            
            // Отправляем answer на сервер
            await fetch('/call/answer', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('jwtToken')}`
                },
                body: JSON.stringify({
                    callId: currentCall.id,
                    answer: answer
                })
            });
            
            currentCall.status = 'active';
            updateCallStatus('Звонок активен');
            startCallTimer();
        }
        
    } catch (error) {
        console.error('Ошибка принятия звонка:', error);
        alert(`Ошибка принятия звонка: ${error.message}`);
        endCall();
    }
}

// Отклонение звонка
async function rejectCall() {
    if (!currentCall) return;
    
    try {
        await fetch('/call/reject', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('jwtToken')}`
            },
            body: JSON.stringify({
                callId: currentCall.id
            })
        });
        
        endCall();
    } catch (error) {
        console.error('Ошибка отклонения звонка:', error);
    }
}

// Завершение звонка
async function endCall() {
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
        if (currentCall) {
            const callStatus = await getCallStatus(currentCall.id);
            if (callStatus) {
                handleCallStatusUpdate(callStatus);
            }
        }
    }, 2000); // Проверяем каждые 2 секунды
}

// Обработка обновления статуса звонка
function handleCallStatusUpdate(callStatus) {
    if (callStatus.status === 'rejected') {
        alert('Звонок отклонен');
        endCall();
    } else if (callStatus.status === 'ended') {
        alert('Звонок завершен');
        endCall();
    } else if (callStatus.status === 'active' && currentCall.status === 'pending') {
        // Звонок принят, устанавливаем соединение
        handleCallAccepted(callStatus);
    }
}

// Обработка принятого звонка
async function handleCallAccepted(callStatus) {
    try {
        if (callStatus.answer) {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(callStatus.answer));
            currentCall.status = 'active';
            updateCallStatus('Звонок активен');
            startCallTimer();
        }
    } catch (error) {
        console.error('Ошибка установки соединения:', error);
    }
}

// Показ интерфейса звонка
function showCallInterface() {
    const callInterface = document.getElementById('call-interface');
    if (callInterface) {
        callInterface.style.display = 'flex';
    }
    
    // Показываем локальное видео
    const localVideo = document.getElementById('local-video');
    if (localVideo && localStream) {
        localVideo.srcObject = localStream;
        localVideo.play().catch(e => console.error('Ошибка воспроизведения локального видео:', e));
    }
}

// Скрытие интерфейса звонка
function hideCallInterface() {
    const callInterface = document.getElementById('call-interface');
    if (callInterface) {
        callInterface.style.display = 'none';
    }
    
    // Очищаем видео
    const localVideo = document.getElementById('local-video');
    const remoteVideo = document.getElementById('remote-video');
    if (localVideo) localVideo.srcObject = null;
    if (remoteVideo) remoteVideo.srcObject = null;
    
    // Останавливаем таймер
    stopCallTimer();
}

// Обновление статуса звонка
function updateCallStatus(status) {
    const statusElement = document.getElementById('call-status');
    if (statusElement) {
        statusElement.textContent = status;
    }
}

// Таймер звонка
let callTimer = null;
let callStartTime = null;

function startCallTimer() {
    callStartTime = Date.now();
    callTimer = setInterval(() => {
        const elapsed = Date.now() - callStartTime;
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
            }
        }
    }
}

// Полноэкранный режим
function enterFullscreen() {
    const fullscreenOverlay = document.getElementById('fullscreen-overlay');
    if (fullscreenOverlay) {
        fullscreenOverlay.style.display = 'flex';
    }
}

function exitFullscreen() {
    const fullscreenOverlay = document.getElementById('fullscreen-overlay');
    if (fullscreenOverlay) {
        fullscreenOverlay.style.display = 'none';
    }
}

// Очистка при закрытии страницы
window.addEventListener('beforeunload', () => {
    if (callStatusPolling) {
        clearInterval(callStatusPolling);
    }
    endCall();
}); 
