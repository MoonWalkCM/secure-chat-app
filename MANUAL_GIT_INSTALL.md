# 🚀 Ручная установка Git и загрузка в GitHub

## 📋 **Пошаговая инструкция:**

### 1. **Установите Git:**
1. Перейдите на: https://git-scm.com/downloads
2. Скачайте "Git for Windows"
3. Запустите установщик
4. Нажимайте "Next" с настройками по умолчанию
5. Завершите установку

### 2. **Перезапустите командную строку:**
- Закройте текущее окно PowerShell
- Откройте новое окно PowerShell
- Перейдите в папку проекта: `cd C:\Users\rasau\OneDrive\Desktop\progect`

### 3. **Настройте Git:**
```bash
git config --global user.name "Ваше Имя"
git config --global user.email "ваш@email.com"
```

### 4. **Инициализируйте репозиторий:**
```bash
git init
git add .
git commit -m "Initial commit: Secure Chat Application"
```

### 5. **Подключите к GitHub:**
```bash
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git branch -M main
git push -u origin main
```

**Замените `YOUR_USERNAME` и `YOUR_REPO` на ваши данные!**

### 6. **Разверните на Vercel:**
1. Зайдите на: https://vercel.com
2. Войдите через GitHub
3. Нажмите "New Project"
4. Выберите ваш репозиторий
5. Нажмите "Deploy"

### 7. **Получите URL:**
- Vercel даст вам URL вида: `https://your-app.vercel.app`
- Этот URL будет работать везде!

---

## 🎯 **Пример команд:**

```bash
# Настройка Git
git config --global user.name "Иван Иванов"
git config --global user.email "ivan@example.com"

# Инициализация
git init
git add .
git commit -m "Initial commit: Secure Chat Application"

# Подключение к GitHub (замените на ваш URL)
git remote add origin https://github.com/ivan/secure-chat-app.git
git branch -M main
git push -u origin main
```

---

## ✅ **Проверка:**

После выполнения команд:
1. Перейдите на ваш GitHub репозиторий
2. Убедитесь, что все файлы загружены
3. Перейдите к развертыванию на Vercel

---

## 🚨 **Если что-то не работает:**

1. **Git не найден:** Перезапустите командную строку
2. **Ошибка push:** Проверьте URL репозитория
3. **Ошибка авторизации:** Войдите в GitHub в браузере

---

## 🎉 **Готово!**

После загрузки кода в GitHub, разверните на Vercel и получите рабочий URL! 🚀 