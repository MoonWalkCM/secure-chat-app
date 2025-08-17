// Система зашифрованных звонков
class EncryptedCallSystem {
    constructor() {
        this.socket = null;
        this.peerConnection = null;
        this.localStream = null;
        this.remoteStream = null;
        this.currentCall = null;
        this.isMuted = false;
        this.isVideoEnabled = true;
        this.callTimer = null;
        this.callStartTime = null;
        this.currentUser = null;
        this.contacts = [];
        
        // STUN серверы для WebRTC
        this.iceServers = [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' }
        ];
        
        this.init();
    }
    
    async init() {
        // Проверяем авторизацию
        const token = localStorage.getItem('jwtToken');
        if (!token) {
            console.log('Токен не найден, перенаправляем на страницу входа');
            window.location.href = 'index.html';
            return;
        }
        
        console.log('Токен найден, продолжаем инициализацию');
        
        try {
            // Декодируем токен для получения информации о пользователе
            const payload = JSON.parse(atob(token.split('.')[1]));
            this.currentUser = payload.login;
            
            // Подключаемся к серверу звонков
            this.connectToCallServer(token);
            
            // Загружаем контакты
            await this.loadContacts();
            
            // Инициализируем обработчики событий
            this.initEventHandlers();
            
            console.log('Система звонков инициализирована для пользователя:', this.currentUser);
            
        } catch (error) {
            console.error('Ошибка инициализации системы звонков:', error);
            alert('Ошибка инициализации системы звонков');
        }
    }
    
    connectToCallServer(token) {
        // Подключаемся к серверу через WebSocket для сигналинга
        // Используем текущий хост для WebSocket соединения
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        this.socket = new WebSocket(`${protocol}//${host}`);
        
        this.socket.onopen = () => {
            console.log('Подключение к серверу звонков установлено');
            // Отправляем токен для авторизации
            this.socket.send(JSON.stringify({
                type: 'call_login',
                token: token
            }));
        };
        
        this.socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                console.log('Получено WebSocket сообщение в calls.js:', data);
                this.handleSocketMessage(data);
            } catch (error) {
                console.error('Ошибка парсинга WebSocket сообщения:', error);
            }
        };
        
        this.socket.onclose = () => {
            console.log('Соединение с сервером звонков закрыто');
        };
        
        this.socket.onerror = (error) => {
            console.error('Ошибка WebSocket:', error);
        };
    }
    
    async loadContacts() {
        try {
            const response = await fetch('/contacts', {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('jwtToken')}`
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                this.contacts = data.contacts || data; // Поддержка старого и нового формата
                this.renderContacts();
            } else {
                console.error('Ошибка загрузки контактов:', response.status);
                // Показываем заглушку если контакты не загрузились
                this.showContactsPlaceholder();
            }
        } catch (error) {
            console.error('Ошибка загрузки контактов:', error);
            this.showContactsPlaceholder();
        }
    }
    
    showContactsPlaceholder() {
        const contactsList = document.getElementById('contacts-list');
        contactsList.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #666;">
                <i class="fas fa-users" style="font-size: 48px; margin-bottom: 20px; opacity: 0.5;"></i>
                <h3>Контакты не загружены</h3>
                <p>Попробуйте обновить страницу или войти заново</p>
            </div>
        `;
    }
    
    renderContacts() {
        const contactsList = document.getElementById('contacts-list');
        if (!contactsList) {
            console.error('Элемент contacts-list не найден');
            return;
        }
        
        contactsList.innerHTML = '';
        
        if (!this.contacts || this.contacts.length === 0) {
            contactsList.innerHTML = `
                <div style="text-align: center; padding: 40px; color: #666;">
                    <i class="fas fa-users" style="font-size: 48px; margin-bottom: 20px; opacity: 0.5;"></i>
                    <h3>Нет контактов</h3>
                    <p>Добавьте контакты в чатах для звонков</p>
                </div>
            `;
            return;
        }
        
        // Проверяем, есть ли активный звонок
        const isCallActive = this.currentCall !== null;
        
        this.contacts.forEach(contact => {
            const contactCard = document.createElement('div');
            contactCard.className = `contact-card ${contact.is_online ? 'online' : ''}`;
            
            contactCard.innerHTML = `
                <div class="contact-avatar">
                    <i class="fas fa-user"></i>
                </div>
                <div class="contact-info">
                    <div class="contact-name">${contact.nickname || contact.login}</div>
                    <div class="contact-status ${contact.is_online ? 'online' : ''}">
                        ${contact.is_online ? 'Онлайн' : 'Офлайн'}
                    </div>
                </div>
                <div class="contact-actions">
                    <button class="call-btn call" onclick="event.stopPropagation(); callSystem.startCall('${contact.login}', true)" 
                            title="Видеозвонок" ${isCallActive ? 'disabled' : ''}>
                        <i class="fas fa-video"></i>
                    </button>
                    <button class="call-btn audio-call" onclick="event.stopPropagation(); callSystem.startCall('${contact.login}', false)" 
                            title="Аудиозвонок" ${isCallActive ? 'disabled' : ''}>
                        <i class="fas fa-phone"></i>
                    </button>
                </div>
            `;
            
            contactsList.appendChild(contactCard);
        });
    }
    
    initEventHandlers() {
        // Кнопки управления звонком
        const muteBtn = document.getElementById('mute-btn');
        const videoBtn = document.getElementById('video-btn');
        const fullscreenBtn = document.getElementById('fullscreen-btn');
        const endCallBtn = document.getElementById('end-call-btn');
        const acceptCallBtn = document.getElementById('accept-call-btn');
        const rejectCallBtn = document.getElementById('reject-call-btn');
        
        // Кнопки полноэкранного режима
        const fullscreenMuteBtn = document.getElementById('fullscreen-mute-btn');
        const fullscreenVideoBtn = document.getElementById('fullscreen-video-btn');
        const exitFullscreenBtn = document.getElementById('exit-fullscreen-btn');
        const fullscreenEndCallBtn = document.getElementById('fullscreen-end-call-btn');
        
        console.log('Инициализация обработчиков событий:');
        console.log('muteBtn:', muteBtn);
        console.log('videoBtn:', videoBtn);
        console.log('fullscreenBtn:', fullscreenBtn);
        console.log('endCallBtn:', endCallBtn);
        console.log('acceptCallBtn:', acceptCallBtn);
        console.log('rejectCallBtn:', rejectCallBtn);
        
        if (muteBtn) muteBtn.onclick = () => this.toggleMute();
        if (videoBtn) videoBtn.onclick = () => this.toggleVideo();
        if (fullscreenBtn) fullscreenBtn.onclick = () => this.enterFullscreen();
        if (endCallBtn) endCallBtn.onclick = () => this.endCall();
        
        // Полноэкранные кнопки
        if (fullscreenMuteBtn) fullscreenMuteBtn.onclick = () => this.toggleMute();
        if (fullscreenVideoBtn) fullscreenVideoBtn.onclick = () => this.toggleVideo();
        if (exitFullscreenBtn) exitFullscreenBtn.onclick = () => this.exitFullscreen();
        if (fullscreenEndCallBtn) fullscreenEndCallBtn.onclick = () => this.endCall();
        
        if (acceptCallBtn) {
            acceptCallBtn.onclick = () => {
                console.log('Кнопка "Принять" нажата');
                this.acceptCall();
            };
        }
        if (rejectCallBtn) {
            rejectCallBtn.onclick = () => {
                console.log('Кнопка "Отклонить" нажата');
                this.rejectCall();
            };
        }
    }
    
    handleSocketMessage(data) {
        console.log('Получено сообщение от сервера:', data);
        
        switch (data.type) {
            case 'call_offer':
                this.handleIncomingCall(data);
                break;
            case 'call_answer':
                this.handleCallAnswer(data);
                break;
            case 'ice_candidate':
                this.handleIceCandidate(data);
                break;
            case 'call_end':
                this.handleCallEnd(data);
                break;
            case 'call_accepted':
                this.handleCallAccepted(data);
                break;
            case 'call_rejected':
                this.handleCallRejected(data);
                break;
            case 'user_online':
                this.updateUserStatus(data.login, true);
                break;
            case 'user_offline':
                this.updateUserStatus(data.login, false);
                break;
        }
    }
    
    async startCall(targetUser, withVideo = true) {
        try {
            // Проверяем, не идет ли уже звонок
            if (this.currentCall) {
                alert('Завершите текущий звонок перед началом нового');
                return;
            }
            
            console.log('Начинаем звонок пользователю:', targetUser, 'с видео:', withVideo);
            
            // Получаем медиапоток
            this.localStream = await navigator.mediaDevices.getUserMedia({
                video: withVideo,
                audio: true
            });
            
            // Показываем локальное видео только если включено
            const localVideo = document.getElementById('local-video');
            if (localVideo) {
                if (withVideo) {
                    localVideo.srcObject = this.localStream;
                    // Важно для мобильных устройств
                    localVideo.play().catch(e => console.log('Ошибка воспроизведения локального видео:', e));
                } else {
                    // Для аудиозвонка показываем заглушку
                    localVideo.srcObject = null;
                    localVideo.style.background = '#2c3e50';
                    localVideo.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: white; font-size: 48px;"><i class="fas fa-microphone"></i></div>';
                }
            }
            
            // Создаем PeerConnection
            this.peerConnection = new RTCPeerConnection({
                iceServers: this.iceServers
            });
            
            // Добавляем локальный поток
            this.localStream.getTracks().forEach(track => {
                this.peerConnection.addTrack(track, this.localStream);
            });
            
            // Обработчики ICE кандидатов
            this.peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    this.socket.send(JSON.stringify({
                        type: 'ice_candidate',
                        candidate: event.candidate,
                        target: targetUser
                    }));
                }
            };
            
            // Обработчик получения удаленного потока
            this.peerConnection.ontrack = (event) => {
                console.log('Получен удаленный поток:', event);
                this.remoteStream = event.streams[0];
                const remoteVideo = document.getElementById('remote-video');
                if (remoteVideo && this.remoteStream) {
                    console.log('Устанавливаем удаленный поток в видео элемент');
                    if (withVideo) {
                        remoteVideo.srcObject = this.remoteStream;
                        // Важно для мобильных устройств - принудительное воспроизведение
                        remoteVideo.play().catch(e => {
                            console.log('Ошибка воспроизведения удаленного видео:', e);
                            // Попытка повторного воспроизведения через небольшую задержку
                            setTimeout(() => {
                                remoteVideo.play().catch(e2 => console.log('Повторная ошибка воспроизведения:', e2));
                            }, 1000);
                        });
                    } else {
                        // Для аудиозвонка показываем заглушку
                        remoteVideo.srcObject = null;
                        remoteVideo.style.background = '#34495e';
                        remoteVideo.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: white; font-size: 48px;"><i class="fas fa-user"></i></div>';
                    }
                } else {
                    console.error('Видео элемент или поток не найден');
                }
            };
            
            // Создаем предложение
            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);
            
            // Отправляем предложение
            this.socket.send(JSON.stringify({
                type: 'call_offer',
                offer: offer,
                target: targetUser,
                caller: this.currentUser,
                withVideo: withVideo
            }));
            
            // Находим никнейм целевого пользователя
            const targetContact = this.contacts.find(contact => contact.login === targetUser);
            const targetDisplayName = targetContact ? (targetContact.nickname || targetContact.login) : targetUser;
            
            // Показываем интерфейс звонка
            const callType = withVideo ? 'Видеозвонок' : 'Аудиозвонок';
            this.showCallInterface(`Исходящий ${callType.toLowerCase()}...`, targetDisplayName);
            this.currentCall = { 
                target: targetUser, 
                targetDisplayName: targetDisplayName, 
                type: 'outgoing',
                withVideo: withVideo
            };
            
            // Обновляем список контактов (блокируем кнопки)
            this.renderContacts();
            
        } catch (error) {
            console.error('Ошибка начала звонка:', error);
            alert('Ошибка начала звонка: ' + error.message);
        }
    }
    
    handleIncomingCall(data) {
        console.log('Входящий звонок от:', data.caller);
        console.log('Данные звонка:', data);
        
        // Находим никнейм звонящего в списке контактов
        const callerContact = this.contacts.find(contact => contact.login === data.caller);
        const callerDisplayName = callerContact ? (callerContact.nickname || callerContact.login) : data.caller;
        
        // Показываем кнопки входящего звонка вверху страницы
        const callerNameTop = document.getElementById('caller-name-top');
        const incomingCallButtons = document.getElementById('incoming-call-buttons');
        
        console.log('callerNameTop элемент:', callerNameTop);
        console.log('incomingCallButtons элемент:', incomingCallButtons);
        console.log('Отображаемое имя звонящего:', callerDisplayName);
        
        if (callerNameTop) {
            callerNameTop.textContent = callerDisplayName;
            console.log('Имя звонящего установлено:', callerDisplayName);
        } else {
            console.error('Элемент caller-name-top не найден');
        }
        
        if (incomingCallButtons) {
            incomingCallButtons.style.display = 'block';
            console.log('Кнопки входящего звонка показаны');
        } else {
            console.error('Элемент incoming-call-buttons не найден');
        }
        
        // Сохраняем данные звонка
        this.currentCall = {
            caller: data.caller,
            callerDisplayName: callerDisplayName,
            offer: data.offer,
            type: 'incoming',
            withVideo: data.withVideo !== false // По умолчанию с видео
        };
        
        // Воспроизводим звук входящего звонка
        this.playIncomingCallSound();
    }
    
    async acceptCall() {
        try {
            console.log('Принимаем звонок');
            
            // Получаем медиапоток
            const withVideo = this.currentCall.withVideo !== false; // По умолчанию с видео
            this.localStream = await navigator.mediaDevices.getUserMedia({
                video: withVideo,
                audio: true
            });
            
            // Показываем локальное видео
            const localVideo = document.getElementById('local-video');
            if (localVideo) {
                if (withVideo) {
                    localVideo.srcObject = this.localStream;
                    // Важно для мобильных устройств
                    localVideo.play().catch(e => console.log('Ошибка воспроизведения локального видео:', e));
                } else {
                    // Для аудиозвонка показываем заглушку
                    localVideo.srcObject = null;
                    localVideo.style.background = '#2c3e50';
                    localVideo.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: white; font-size: 48px;"><i class="fas fa-microphone"></i></div>';
                }
            }
            
            // Создаем PeerConnection
            this.peerConnection = new RTCPeerConnection({
                iceServers: this.iceServers
            });
            
            // Добавляем локальный поток
            this.localStream.getTracks().forEach(track => {
                this.peerConnection.addTrack(track, this.localStream);
            });
            
            // Обработчики ICE кандидатов
            this.peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    this.socket.send(JSON.stringify({
                        type: 'ice_candidate',
                        candidate: event.candidate,
                        target: this.currentCall.caller
                    }));
                }
            };
            
            // Обработчик получения удаленного потока
            this.peerConnection.ontrack = (event) => {
                console.log('Получен удаленный поток:', event);
                this.remoteStream = event.streams[0];
                const remoteVideo = document.getElementById('remote-video');
                if (remoteVideo && this.remoteStream) {
                    console.log('Устанавливаем удаленный поток в видео элемент');
                    if (withVideo) {
                        remoteVideo.srcObject = this.remoteStream;
                        // Важно для мобильных устройств - принудительное воспроизведение
                        remoteVideo.play().catch(e => {
                            console.log('Ошибка воспроизведения удаленного видео:', e);
                            // Попытка повторного воспроизведения через небольшую задержку
                            setTimeout(() => {
                                remoteVideo.play().catch(e2 => console.log('Повторная ошибка воспроизведения:', e2));
                            }, 1000);
                        });
                    } else {
                        // Для аудиозвонка показываем заглушку
                        remoteVideo.srcObject = null;
                        remoteVideo.style.background = '#34495e';
                        remoteVideo.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: white; font-size: 48px;"><i class="fas fa-user"></i></div>';
                    }
                } else {
                    console.error('Видео элемент или поток не найден');
                }
            };
            
            // Устанавливаем удаленное описание
            await this.peerConnection.setRemoteDescription(this.currentCall.offer);
            
            // Создаем ответ
            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);
            
            // Отправляем ответ
            this.socket.send(JSON.stringify({
                type: 'call_answer',
                answer: answer,
                target: this.currentCall.caller
            }));
            
            // Скрываем кнопки входящего звонка
            const incomingCallButtons = document.getElementById('incoming-call-buttons');
            if (incomingCallButtons) incomingCallButtons.style.display = 'none';
            
            // Останавливаем звук входящего звонка
            this.stopIncomingCallSound();
            
            // Показываем интерфейс звонка
            const callType = withVideo ? 'Видеозвонок' : 'Аудиозвонок';
            this.showCallInterface('Подключено', this.currentCall.callerDisplayName || this.currentCall.caller);
            this.startCallTimer();
            
            // Обновляем список контактов (блокируем кнопки)
            this.renderContacts();
            
        } catch (error) {
            console.error('Ошибка принятия звонка:', error);
            alert('Ошибка принятия звонка: ' + error.message);
        }
    }
    
    rejectCall() {
        console.log('Отклоняем звонок');
        
        if (this.socket && this.currentCall) {
            this.socket.send(JSON.stringify({
                type: 'call_reject',
                target: this.currentCall.caller
            }));
        }
        
        const incomingCallButtons = document.getElementById('incoming-call-buttons');
        if (incomingCallButtons) incomingCallButtons.style.display = 'none';
        this.currentCall = null;
        this.stopIncomingCallSound();
    }
    
    handleCallAnswer(data) {
        console.log('Получен ответ на звонок');
        
        if (this.peerConnection) {
            this.peerConnection.setRemoteDescription(data.answer);
            this.showCallInterface('Подключено', this.currentCall.targetDisplayName || this.currentCall.target);
            this.startCallTimer();
        }
    }
    
    handleCallAccepted(data) {
        console.log('Звонок принят');
        this.showCallInterface('Подключено', this.currentCall.targetDisplayName || this.currentCall.target);
        this.startCallTimer();
    }
    
    handleCallRejected(data) {
        console.log('Звонок отклонен');
        this.stopIncomingCallSound(); // Останавливаем звук сразу
        this.endCall();
        alert('Звонок отклонен');
    }
    
    handleIceCandidate(data) {
        if (this.peerConnection) {
            this.peerConnection.addIceCandidate(data.candidate);
        }
    }
    
    handleCallEnd(data) {
        console.log('Звонок завершен');
        this.stopIncomingCallSound(); // Останавливаем звук сразу
        this.endCall();
    }
    
    endCall() {
        console.log('Завершаем звонок');
        
        // Останавливаем таймер
        this.stopCallTimer();
        
        // Останавливаем медиапотоки
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }
        
        // Закрываем PeerConnection
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }
        
        // Очищаем видео
        const localVideo = document.getElementById('local-video');
        const remoteVideo = document.getElementById('remote-video');
        if (localVideo) localVideo.srcObject = null;
        if (remoteVideo) remoteVideo.srcObject = null;
        
        // Скрываем интерфейс звонка
        this.hideCallInterface();
        
        // Отправляем сигнал о завершении звонка
        if (this.currentCall && this.socket) {
            this.socket.send(JSON.stringify({
                type: 'call_end',
                target: this.currentCall.target || this.currentCall.caller
            }));
        }
        
        this.currentCall = null;
        this.stopIncomingCallSound();
        
        // Выходим из полноэкранного режима если он активен
        this.exitFullscreen();
        
        // Скрываем кнопки входящего звонка на всякий случай
        const incomingCallButtons = document.getElementById('incoming-call-buttons');
        if (incomingCallButtons) incomingCallButtons.style.display = 'none';
        
        // Обновляем список контактов (разблокируем кнопки)
        this.renderContacts();
    }
    
    toggleMute() {
        if (this.localStream) {
            const audioTrack = this.localStream.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                this.isMuted = !audioTrack.enabled;
                
                // Обновляем обычную кнопку
                const muteBtn = document.getElementById('mute-btn');
                if (muteBtn) {
                    if (this.isMuted) {
                        muteBtn.classList.add('active');
                        muteBtn.innerHTML = '<i class="fas fa-microphone-slash"></i>';
                    } else {
                        muteBtn.classList.remove('active');
                        muteBtn.innerHTML = '<i class="fas fa-microphone"></i>';
                    }
                }
                
                // Обновляем полноэкранную кнопку
                const fullscreenMuteBtn = document.getElementById('fullscreen-mute-btn');
                if (fullscreenMuteBtn) {
                    if (this.isMuted) {
                        fullscreenMuteBtn.innerHTML = '<i class="fas fa-microphone-slash"></i>';
                    } else {
                        fullscreenMuteBtn.innerHTML = '<i class="fas fa-microphone"></i>';
                    }
                }
            }
        }
    }
    
    toggleVideo() {
        if (this.localStream) {
            const videoTrack = this.localStream.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = !videoTrack.enabled;
                this.isVideoEnabled = videoTrack.enabled;
                
                // Обновляем обычную кнопку
                const videoBtn = document.getElementById('video-btn');
                if (videoBtn) {
                    if (!this.isVideoEnabled) {
                        videoBtn.classList.add('active');
                        videoBtn.innerHTML = '<i class="fas fa-video-slash"></i>';
                    } else {
                        videoBtn.classList.remove('active');
                        videoBtn.innerHTML = '<i class="fas fa-video"></i>';
                    }
                }
                
                // Обновляем полноэкранную кнопку
                const fullscreenVideoBtn = document.getElementById('fullscreen-video-btn');
                if (fullscreenVideoBtn) {
                    if (!this.isVideoEnabled) {
                        fullscreenVideoBtn.innerHTML = '<i class="fas fa-video-slash"></i>';
                    } else {
                        fullscreenVideoBtn.innerHTML = '<i class="fas fa-video"></i>';
                    }
                }
            }
        }
    }
    
    showCallInterface(status, remoteUser) {
        const callStatus = document.getElementById('call-status');
        const statusText = document.getElementById('status-text');
        const videoContainer = document.getElementById('video-container');
        const callControls = document.getElementById('call-controls');
        const remoteName = document.getElementById('remote-name');
        
        if (callStatus) callStatus.style.display = 'block';
        if (statusText) statusText.textContent = status;
        if (videoContainer) videoContainer.style.display = 'grid';
        if (callControls) callControls.style.display = 'flex';
        if (remoteName) remoteName.textContent = remoteUser;
        
        if (status === 'Подключено' && callStatus) {
            callStatus.className = 'call-status connected';
        } else if (callStatus) {
            callStatus.className = 'call-status connecting';
        }
    }
    
    hideCallInterface() {
        const callStatus = document.getElementById('call-status');
        const videoContainer = document.getElementById('video-container');
        const callControls = document.getElementById('call-controls');
        const callTimer = document.getElementById('call-timer');
        const callQuality = document.getElementById('call-quality');
        
        if (callStatus) callStatus.style.display = 'none';
        if (videoContainer) videoContainer.style.display = 'none';
        if (callControls) callControls.style.display = 'none';
        if (callTimer) callTimer.style.display = 'none';
        if (callQuality) callQuality.style.display = 'none';
    }
    
    startCallTimer() {
        this.callStartTime = Date.now();
        this.callTimer = setInterval(() => {
            const elapsed = Math.floor((Date.now() - this.callStartTime) / 1000);
            const minutes = Math.floor(elapsed / 60);
            const seconds = elapsed % 60;
            const timeString = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            
            // Обновляем обычный таймер
            const callTimer = document.getElementById('call-timer');
            if (callTimer) {
                callTimer.textContent = timeString;
                callTimer.style.display = 'block';
            }
            
            // Обновляем полноэкранный таймер
            const fullscreenTimer = document.getElementById('fullscreen-timer');
            if (fullscreenTimer) {
                fullscreenTimer.textContent = timeString;
            }
        }, 1000);
    }
    
    stopCallTimer() {
        if (this.callTimer) {
            clearInterval(this.callTimer);
            this.callTimer = null;
        }
    }
    
    playIncomingCallSound() {
        // Создаем звук входящего звонка
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
        oscillator.frequency.setValueAtTime(600, audioContext.currentTime + 0.5);
        
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.5);
        
        // Повторяем звук каждые 2 секунды
        this.incomingCallInterval = setInterval(() => {
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
            oscillator.frequency.setValueAtTime(600, audioContext.currentTime + 0.5);
            
            gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
            
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.5);
        }, 2000);
    }
    
    stopIncomingCallSound() {
        if (this.incomingCallInterval) {
            clearInterval(this.incomingCallInterval);
            this.incomingCallInterval = null;
        }
    }
    
    enterFullscreen() {
        if (!this.currentCall || !this.remoteStream) {
            console.log('Нет активного звонка или удаленного потока для полноэкранного режима');
            return;
        }
        
        console.log('Вход в полноэкранный режим');
        
        // Получаем элементы полноэкранного режима
        const fullscreenOverlay = document.getElementById('fullscreen-overlay');
        const fullscreenVideo = document.getElementById('fullscreen-remote-video');
        const fullscreenCallerName = document.getElementById('fullscreen-caller-name');
        const fullscreenTimer = document.getElementById('fullscreen-timer');
        
        if (fullscreenOverlay && fullscreenVideo) {
            // Устанавливаем удаленное видео в полноэкранный режим
            fullscreenVideo.srcObject = this.remoteStream;
            
            // Устанавливаем имя собеседника
            if (fullscreenCallerName && this.currentCall.targetDisplayName) {
                fullscreenCallerName.textContent = this.currentCall.targetDisplayName;
            }
            
            // Синхронизируем таймер
            if (fullscreenTimer) {
                const callTimer = document.getElementById('call-timer');
                if (callTimer && callTimer.textContent) {
                    fullscreenTimer.textContent = callTimer.textContent;
                }
            }
            
            // Показываем полноэкранный режим
            fullscreenOverlay.style.display = 'flex';
            
            // Обновляем иконку кнопки полноэкранного режима
            const fullscreenBtn = document.getElementById('fullscreen-btn');
            if (fullscreenBtn) {
                fullscreenBtn.innerHTML = '<i class="fas fa-compress"></i>';
                fullscreenBtn.title = 'Выйти из полноэкранного режима';
            }
            
            // Скрываем обычные элементы управления звонком
            const callControls = document.getElementById('call-controls');
            if (callControls) {
                callControls.style.display = 'none';
            }
        }
    }
    
    exitFullscreen() {
        console.log('Выход из полноэкранного режима');
        
        // Скрываем полноэкранный режим
        const fullscreenOverlay = document.getElementById('fullscreen-overlay');
        if (fullscreenOverlay) {
            fullscreenOverlay.style.display = 'none';
        }
        
        // Возвращаем иконку кнопки полноэкранного режима
        const fullscreenBtn = document.getElementById('fullscreen-btn');
        if (fullscreenBtn) {
            fullscreenBtn.innerHTML = '<i class="fas fa-expand"></i>';
            fullscreenBtn.title = 'Полноэкранный режим';
        }
        
        // Показываем обычные элементы управления звонком
        const callControls = document.getElementById('call-controls');
        if (callControls) {
            callControls.style.display = 'flex';
        }
    }
    
    updateUserStatus(login, isOnline) {
        const contact = this.contacts.find(c => c.login === login);
        if (contact) {
            contact.is_online = isOnline;
            this.renderContacts();
        }
    }
}

// Инициализация системы звонков
let callSystem;

document.addEventListener('DOMContentLoaded', () => {
    try {
        callSystem = new EncryptedCallSystem();
        console.log('Система звонков инициализирована');
    } catch (error) {
        console.error('Ошибка инициализации системы звонков:', error);
        // Показываем сообщение об ошибке
        const contactsList = document.getElementById('contacts-list');
        if (contactsList) {
            contactsList.innerHTML = `
                <div style="text-align: center; padding: 40px; color: #666;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 48px; margin-bottom: 20px; color: #ff4757;"></i>
                    <h3>Ошибка загрузки</h3>
                    <p>Не удалось инициализировать систему звонков</p>
                    <button onclick="location.reload()" style="margin-top: 20px; padding: 10px 20px; background: #007bff; color: white; border: none; border-radius: 5px; cursor: pointer;">
                        Обновить страницу
                    </button>
                </div>
            `;
        }
    }
});

// Глобальные функции для кнопок
window.startCall = (targetUser, withVideo = true) => {
    callSystem.startCall(targetUser, withVideo);
}; 