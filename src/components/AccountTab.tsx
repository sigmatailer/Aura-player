import React, { useState, useEffect } from 'react';
import { 
  User, Lock, Mail, RefreshCw, Smartphone, Monitor, 
  LogOut, Play, ShieldCheck, Sparkles, Camera, Image as ImageIcon,
  Send, Globe, Music, Check, Trash2, AlertCircle, Radio,
  ChevronLeft, ChevronRight
} from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import { pocketBaseService } from '../services/PocketBaseService';
import { 
  PROFILE_COLORS, NICKNAME_FONTS, NICKNAME_EFFECTS, 
  getNicknameFontFamily, getNicknameFontClass, getNicknameEffectStyle
} from '../utils/profileStyles';
import { useHorizontalScroll } from '../utils/useHorizontalScroll';
import { open } from '@tauri-apps/plugin-dialog';
import { convertFileSrc } from '@tauri-apps/api/core';

// Discord Icon SVG
const DiscordIcon: React.FC<{ size?: number; className?: string }> = ({ size = 15, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.893.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
  </svg>
);

export const AccountTab: React.FC = () => {
  const { user, updateUser, isSyncing, syncStatus, lastSyncTime } = useAuthStore();
  
  // Auth Form State
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Devices State
  const [activeDevices, setActiveDevices] = useState<any[]>([]);

  // Horizontal scroll refs for Nickname Font and Effect rows
  const fontScrollRef = useHorizontalScroll<HTMLDivElement>();
  const effectScrollRef = useHorizontalScroll<HTMLDivElement>();

  const loadData = async () => {
    if (pocketBaseService.isLoggedIn()) {
      const devices = await pocketBaseService.getActiveDevices();
      setActiveDevices(devices);
    }
  };

  useEffect(() => {
    loadData();
    const unsub = pocketBaseService.onDevicesChanged(() => {
      loadData();
    });
    const interval = setInterval(loadData, 5000);
    return () => {
      unsub();
      clearInterval(interval);
    };
  }, [user]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (!email || !password) {
      setErrorMsg('Заполните почту и пароль');
      return;
    }

    setIsLoading(true);
    const res = await pocketBaseService.login(email.trim(), password);
    setIsLoading(false);
    if (!res.success) {
      setErrorMsg(res.error || 'Неверный логин или пароль');
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (!email || !password || !passwordConfirm) {
      setErrorMsg('Заполните все обязательные поля');
      return;
    }
    if (password !== passwordConfirm) {
      setErrorMsg('Пароли не совпадают');
      return;
    }
    if (password.length < 8) {
      setErrorMsg('Пароль должен содержать не менее 8 символов');
      return;
    }

    setIsLoading(true);
    const res = await pocketBaseService.register(email.trim(), password, passwordConfirm, name.trim());
    setIsLoading(false);
    if (!res.success) {
      setErrorMsg(res.error || 'Ошибка при регистрации');
    }
  };

  const handleManualSync = async () => {
    await pocketBaseService.syncAll();
    await loadData();
  };

  const handleLogout = () => {
    if (window.confirm('Вы действительно хотите выйти из учетной записи?')) {
      pocketBaseService.logout();
    }
  };

  // If NOT logged in: Show Login / Register
  if (!user) {
    return (
      <div className="space-y-6 max-w-xl mx-auto py-2 animate-in fade-in duration-200">
        {/* Header Banner */}
        <div className="text-center space-y-2">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-[var(--accent)]/15 border border-[var(--accent)]/30 flex items-center justify-center text-[var(--accent)] shadow-lg shadow-[var(--accent)]/10">
            <User size={28} />
          </div>
          <h2 className="text-xl font-bold text-[var(--text-main)]">
            {isRegisterMode ? 'Создание аккаунта Aura' : 'Вход в аккаунт Aura'}
          </h2>
          <p className="text-xs text-[var(--text-secondary)] max-w-md mx-auto leading-relaxed">
            Синхронизируйте любимые треки и плейлисты между телефоном и компьютером в реальном времени. Сервер также сохраняет ваши персональные вкусы для идеальной подборки в «Моей волне».
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex bg-[var(--bg-surface)] p-1 rounded-xl border border-[var(--border-main)] max-w-xs mx-auto">
          <button
            type="button"
            onClick={() => { setIsRegisterMode(false); setErrorMsg(''); }}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              !isRegisterMode 
                ? 'bg-[var(--accent)] text-[var(--text-main)] shadow-sm' 
                : 'text-[var(--text-secondary)] hover:text-[var(--text-main)]'
            }`}
          >
            Войти
          </button>
          <button
            type="button"
            onClick={() => { setIsRegisterMode(true); setErrorMsg(''); }}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              isRegisterMode 
                ? 'bg-[var(--accent)] text-[var(--text-main)] shadow-sm' 
                : 'text-[var(--text-secondary)] hover:text-[var(--text-main)]'
            }`}
          >
            Регистрация
          </button>
        </div>

        {/* Error message */}
        {errorMsg && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
            <AlertCircle size={16} className="shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={isRegisterMode ? handleRegister : handleLogin} className="space-y-4">
          {isRegisterMode && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[var(--text-secondary)] flex items-center gap-1.5">
                <User size={14} /> Имя или никнейм
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Как вас называть"
                className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-main)] focus:border-[var(--accent)] text-xs text-[var(--text-main)] outline-none transition-colors"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[var(--text-secondary)] flex items-center gap-1.5">
              <Mail size={14} /> Электронная почта
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="example@mail.ru"
              className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-main)] focus:border-[var(--accent)] text-xs text-[var(--text-main)] outline-none transition-colors"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[var(--text-secondary)] flex items-center gap-1.5">
              <Lock size={14} /> Пароль
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-main)] focus:border-[var(--accent)] text-xs text-[var(--text-main)] outline-none transition-colors"
            />
          </div>

          {isRegisterMode && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[var(--text-secondary)] flex items-center gap-1.5">
                <Lock size={14} /> Подтвердите пароль
              </label>
              <input
                type="password"
                required
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-main)] focus:border-[var(--accent)] text-xs text-[var(--text-main)] outline-none transition-colors"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 bg-[var(--accent)] hover:brightness-110 active:scale-[0.98] text-[var(--text-main)] text-xs font-bold rounded-xl shadow-lg shadow-[var(--accent)]/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {isLoading ? (
              <RefreshCw size={16} className="animate-spin" />
            ) : isRegisterMode ? (
              <ShieldCheck size={16} />
            ) : (
              <User size={16} />
            )}
            <span>
              {isLoading 
                ? (isRegisterMode ? 'Создание аккаунта...' : 'Вход...') 
                : (isRegisterMode ? 'Зарегистрироваться' : 'Войти в аккаунт')}
            </span>
          </button>
        </form>

        {/* Feature summary pills */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 border-t border-[var(--border-main)]">
          <div className="p-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-main)] flex flex-col items-center text-center gap-1.5">
            <RefreshCw size={18} className="text-[var(--accent)]" />
            <span className="text-[11px] font-semibold text-[var(--text-main)]">Синхронизация</span>
            <span className="text-[10px] text-[var(--text-secondary)]">Все лайки и плейлисты доступны на всех устройствах</span>
          </div>
          <div className="p-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-main)] flex flex-col items-center text-center gap-1.5">
            <Radio size={18} className="text-[var(--accent)]" />
            <span className="text-[11px] font-semibold text-[var(--text-main)]">Моя Волна</span>
            <span className="text-[10px] text-[var(--text-secondary)]">Умный подбор любимых треков и жанров</span>
          </div>
          <div className="p-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-main)] flex flex-col items-center text-center gap-1.5">
            <Smartphone size={18} className="text-[var(--accent)]" />
            <span className="text-[11px] font-semibold text-[var(--text-main)]">ПК + Телефон</span>
            <span className="text-[10px] text-[var(--text-secondary)]">Мгновенное переключение между приложениями</span>
          </div>
        </div>
      </div>
    );
  }

  const handlePickAvatar = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'Изображения', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'] }]
      });
      if (selected && typeof selected === 'string') {
        const url = convertFileSrc(selected);
        updateUser({ avatar: url });
        await pocketBaseService.updateProfile({ avatar: url });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handlePickBanner = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'Изображения', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'] }]
      });
      if (selected && typeof selected === 'string') {
        const url = convertFileSrc(selected);
        updateUser({ banner: url });
        await pocketBaseService.updateProfile({ banner: url });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateCustomization = async (fields: any) => {
    updateUser(fields);
    try {
      await pocketBaseService.updateProfile(fields);
    } catch (e) {
      console.warn('Failed to update customization:', e);
    }
  };

  // If LOGGED IN: Show Account Dashboard
  return (
    <div className="space-y-6 max-w-3xl mx-auto py-2 animate-in fade-in duration-200">
      {/* Profile Card */}
      <div 
        className="relative p-5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-main)] shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 overflow-hidden transition-all"
        style={{
          background: user.banner 
            ? `url(${user.banner}) center/cover no-repeat`
            : user.profileColor 
              ? `linear-gradient(135deg, ${user.profileColor} 0%, rgba(20, 20, 28, 0.95) 100%)`
              : undefined
        }}
      >
        {user.banner && (
          <div 
            className="absolute inset-0 bg-cover bg-center opacity-35 pointer-events-none transition-all duration-300"
            style={{ backgroundImage: `url(${user.banner})` }}
          />
        )}

        <div className="relative z-10 flex items-center gap-4">
          <div className="relative group w-14 h-14 rounded-2xl bg-[var(--accent)] flex items-center justify-center text-[var(--text-main)] font-black text-xl shadow-lg shadow-[var(--accent)]/30 shrink-0 overflow-hidden border border-white/10">
            {user.avatar ? (
              <img src={user.avatar} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              user.name ? user.name.charAt(0).toUpperCase() : user.email.charAt(0).toUpperCase()
            )}
            <button
              onClick={handlePickAvatar}
              className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity cursor-pointer"
              title="Сменить аватар"
            >
              <Camera size={18} />
            </button>
          </div>

          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <h3 
                className={`text-base font-bold text-[var(--text-main)] ${getNicknameFontClass(user.nicknameFont)}`}
                style={{
                  fontFamily: getNicknameFontFamily(user.nicknameFont),
                  ...getNicknameEffectStyle(user.nicknameEffect)
                }}
              >
                {user.name || 'Пользователь Aura'}
              </h3>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold">
                В сети
              </span>
            </div>
            <p className="text-xs text-[var(--text-secondary)] font-mono">
              @{user.username || (user.name ? user.name.toLowerCase().replace(/\s+/g, '_') : 'user')} • {user.email}
            </p>
            <div className="text-[10px] text-[var(--text-secondary)]/60 flex items-center gap-1 pt-0.5">
              <span>Статус:</span>
              <span className="text-emerald-400 font-medium">{syncStatus}</span>
              {lastSyncTime && (
                <span>• {new Date(lastSyncTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              )}
            </div>
          </div>
        </div>

        <div className="relative z-10 flex items-center gap-2 flex-wrap">
          <button
            onClick={handlePickBanner}
            className="px-3 py-2 rounded-xl bg-[var(--bg-surface-hover)] hover:brightness-110 active:scale-95 border border-[var(--border-main)] text-xs font-semibold text-[var(--text-main)] flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
            title="Загрузить баннер"
          >
            <ImageIcon size={14} className="text-[var(--accent)]" />
            <span>Баннер</span>
          </button>
          <button
            onClick={handleManualSync}
            disabled={isSyncing}
            className="px-3.5 py-2 rounded-xl bg-[var(--bg-surface-hover)] hover:brightness-110 active:scale-95 border border-[var(--border-main)] text-xs font-semibold text-[var(--text-main)] flex items-center gap-1.5 transition-all cursor-pointer shadow-sm disabled:opacity-50"
          >
            <RefreshCw size={14} className={isSyncing ? 'animate-spin text-[var(--accent)]' : ''} />
            <span className="hidden sm:inline">Синхронизировать</span>
          </button>
          <button
            onClick={handleLogout}
            className="p-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 transition-all cursor-pointer active:scale-95"
            title="Выйти из аккаунта"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>

      {/* Card: Account Customization (Цвет, шрифт, эффект, интеграции, закреплено) */}
      <div className="p-4 sm:p-5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-main)] shadow-sm space-y-5">
        <div className="flex items-center gap-2 text-[var(--text-main)] font-bold text-sm">
          <Sparkles size={18} className="text-[var(--accent)]" />
          <span>Кастомизация аккаунта</span>
        </div>

        {/* 1. Цвет профиля */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-[var(--text-secondary)] block">Цвет профиля</label>
          <div className="flex items-center gap-2.5 flex-wrap p-3 rounded-xl bg-[var(--bg-main)] border border-[var(--border-main)]">
            {PROFILE_COLORS.map((col) => {
              const isSelected = (user.profileColor || '') === col.value;
              return (
                <button
                  key={col.id}
                  type="button"
                  onClick={() => handleUpdateCustomization({ profileColor: col.value })}
                  className={`w-8 h-8 rounded-full border-2 transition-all cursor-pointer relative flex items-center justify-center ${
                    isSelected ? 'scale-110 border-white ring-2 ring-[var(--accent)]/50' : 'border-white/20 hover:scale-105 hover:border-white/50'
                  }`}
                  style={{ backgroundColor: col.value || '#18181f' }}
                  title={col.label}
                >
                  {!col.value && <span className="text-[10px] text-white/50 font-bold">∅</span>}
                  {isSelected && <Check size={14} className={col.id === 'yellow' ? 'text-black' : 'text-white'} />}
                </button>
              );
            })}
          </div>
        </div>

        {/* 2. Шрифт никнейма */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-[var(--text-secondary)] block">Шрифт никнейма</label>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => {
                  if (fontScrollRef.current) {
                    fontScrollRef.current.scrollBy({ left: -220, behavior: 'smooth' });
                  }
                }}
                className="w-6 h-6 rounded-full bg-white/[0.04] hover:bg-white/10 border border-white/10 flex items-center justify-center text-white/60 hover:text-white transition-all cursor-pointer"
                title="Назад"
              >
                <ChevronLeft size={13} />
              </button>
              <button
                type="button"
                onClick={() => {
                  if (fontScrollRef.current) {
                    fontScrollRef.current.scrollBy({ left: 220, behavior: 'smooth' });
                  }
                }}
                className="w-6 h-6 rounded-full bg-white/[0.04] hover:bg-white/10 border border-white/10 flex items-center justify-center text-white/60 hover:text-white transition-all cursor-pointer"
                title="Вперед"
              >
                <ChevronRight size={13} />
              </button>
            </div>
          </div>
          <div 
            ref={fontScrollRef}
            className="flex gap-2.5 overflow-x-auto scrollbar-hide py-1 scroll-smooth select-none cursor-grab active:cursor-grabbing overscroll-contain"
          >
            {NICKNAME_FONTS.map((f) => {
              const isSelected = (user.nicknameFont || 'default') === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => handleUpdateCustomization({ nicknameFont: f.id })}
                  className={`w-28 h-20 shrink-0 rounded-2xl border p-2.5 flex flex-col justify-between items-center transition-all cursor-pointer ${
                    isSelected
                      ? 'border-white ring-2 ring-white/30 bg-white/10 shadow-sm'
                      : 'border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.05]'
                  }`}
                >
                  <span 
                    className={`text-xl font-bold text-white truncate ${getNicknameFontClass(f.id)}`}
                    style={{ fontFamily: getNicknameFontFamily(f.id) }}
                  >
                    Aa
                  </span>
                  <span className="text-[11px] font-medium text-white/80 truncate w-full text-center">
                    {f.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 3. Эффект никнейма */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-[var(--text-secondary)] block">Эффект никнейма</label>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => {
                  if (effectScrollRef.current) {
                    effectScrollRef.current.scrollBy({ left: -220, behavior: 'smooth' });
                  }
                }}
                className="w-6 h-6 rounded-full bg-white/[0.04] hover:bg-white/10 border border-white/10 flex items-center justify-center text-white/60 hover:text-white transition-all cursor-pointer"
                title="Назад"
              >
                <ChevronLeft size={13} />
              </button>
              <button
                type="button"
                onClick={() => {
                  if (effectScrollRef.current) {
                    effectScrollRef.current.scrollBy({ left: 220, behavior: 'smooth' });
                  }
                }}
                className="w-6 h-6 rounded-full bg-white/[0.04] hover:bg-white/10 border border-white/10 flex items-center justify-center text-white/60 hover:text-white transition-all cursor-pointer"
                title="Вперед"
              >
                <ChevronRight size={13} />
              </button>
            </div>
          </div>
          <div 
            ref={effectScrollRef}
            className="flex gap-2.5 overflow-x-auto scrollbar-hide py-1 scroll-smooth select-none cursor-grab active:cursor-grabbing overscroll-contain"
          >
            {NICKNAME_EFFECTS.map((eff) => {
              const isSelected = (user.nicknameEffect || 'none') === eff.id;
              return (
                <button
                  key={eff.id}
                  type="button"
                  onClick={() => handleUpdateCustomization({ nicknameEffect: eff.id })}
                  className={`w-28 h-20 shrink-0 rounded-2xl border p-2.5 flex flex-col justify-between items-center transition-all cursor-pointer ${
                    isSelected
                      ? 'border-white ring-2 ring-white/30 bg-white/10 shadow-sm'
                      : 'border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.05]'
                  }`}
                >
                  <span 
                    className="text-xl font-bold text-white truncate"
                    style={getNicknameEffectStyle(eff.id)}
                  >
                    Aa
                  </span>
                  <span className="text-[11px] font-medium text-white/80 truncate w-full text-center">
                    {eff.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 4. Интеграции */}
        <div className="space-y-3 pt-1">
          <label className="text-xs font-semibold text-[var(--text-secondary)] block">Интеграции</label>
          
          {/* Discord */}
          <div className="relative flex items-center">
            <div className="absolute left-3.5 text-[#5865F2]">
              <DiscordIcon size={16} />
            </div>
            <input
              type="text"
              maxLength={64}
              defaultValue={user.discord || ''}
              onBlur={(e) => handleUpdateCustomization({ discord: e.target.value.trim() })}
              placeholder="Discord тег или никнейм"
              className="w-full h-10 rounded-xl bg-[var(--bg-main)] border border-[var(--border-main)] focus:border-[var(--accent)] text-xs text-[var(--text-main)] pl-10 pr-14 outline-none font-mono"
            />
            <span className="absolute right-4 text-[11px] text-[var(--text-secondary)]/50 font-mono select-none">
              {(user.discord || '').length}/64
            </span>
          </div>

          {/* Telegram */}
          <div className="relative flex items-center">
            <div className="absolute left-3.5 text-[#229ED9]">
              <Send size={15} />
            </div>
            <input
              type="text"
              maxLength={64}
              defaultValue={user.telegram || ''}
              onBlur={(e) => handleUpdateCustomization({ telegram: e.target.value.trim() })}
              placeholder="Telegram @username"
              className="w-full h-10 rounded-xl bg-[var(--bg-main)] border border-[var(--border-main)] focus:border-[var(--accent)] text-xs text-[var(--text-main)] pl-10 pr-14 outline-none font-mono"
            />
            <span className="absolute right-4 text-[11px] text-[var(--text-secondary)]/50 font-mono select-none">
              {(user.telegram || '').length}/64
            </span>
          </div>

          {/* Website */}
          <div className="relative flex items-center">
            <div className="absolute left-3.5 text-[var(--text-secondary)]">
              <Globe size={15} />
            </div>
            <input
              type="text"
              maxLength={256}
              defaultValue={user.website || ''}
              onBlur={(e) => handleUpdateCustomization({ website: e.target.value.trim() })}
              placeholder="Сайт или ссылка (https://...)"
              className="w-full h-10 rounded-xl bg-[var(--bg-main)] border border-[var(--border-main)] focus:border-[var(--accent)] text-xs text-[var(--text-main)] pl-10 pr-16 outline-none"
            />
            <span className="absolute right-4 text-[11px] text-[var(--text-secondary)]/50 font-mono select-none">
              {(user.website || '').length}/256
            </span>
          </div>
        </div>

        {/* 5. Закреплено */}
        <div className="space-y-2 pt-1">
          <div>
            <h3 className="text-sm font-bold text-[var(--text-main)] tracking-tight">Закреплено</h3>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Закрепите любимый трек или плейлист в своем профиле
            </p>
          </div>

          {user.pinnedTrackTitle ? (
            <div className="p-3.5 rounded-xl bg-[var(--bg-main)] border border-[var(--border-main)] flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-[var(--bg-surface)] overflow-hidden shrink-0">
                  {user.pinnedTrackCover ? (
                    <img src={user.pinnedTrackCover} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <Music size={18} className="m-auto text-[var(--text-secondary)] h-full" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-[var(--text-main)] truncate">{user.pinnedTrackTitle}</div>
                  <div className="text-[11px] text-[var(--text-secondary)] truncate">{user.pinnedTrackArtist}</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleUpdateCustomization({
                  pinnedTrackId: '',
                  pinnedTrackTitle: '',
                  pinnedTrackArtist: '',
                  pinnedTrackCover: ''
                })}
                className="p-2 rounded-lg bg-[var(--bg-surface)] hover:bg-red-500/20 text-[var(--text-secondary)] hover:text-red-400 transition-all cursor-pointer"
                title="Открепить"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ) : (
            <div className="py-6 px-4 rounded-xl bg-[var(--bg-main)] border border-[var(--border-main)] text-center space-y-1">
              <div className="text-xs sm:text-sm font-bold text-[var(--text-main)]">Ничего не закреплено</div>
              <p className="text-[11px] sm:text-xs text-[var(--text-secondary)]">
                Закрепите любимый трек или плейлист в своем профиле
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Card: Active Devices Sync */}
      <div className="p-4 sm:p-5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-main)] shadow-sm space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[var(--text-main)] font-bold text-sm min-w-0">
            <Smartphone size={18} className="text-[var(--accent)] shrink-0" />
            <span className="hidden sm:inline">Синхронизированные устройства</span>
            <span className="sm:hidden inline truncate">Устройства</span>
          </div>
          <span className="text-xs text-[var(--text-secondary)] font-medium shrink-0 whitespace-nowrap">
            {activeDevices.length > 0 ? `${activeDevices.length} онлайн` : '1 онлайн'}
          </span>
        </div>

        <div className="space-y-2.5">
          {activeDevices.length > 0 ? (
            activeDevices.map((dev: any, idx: number) => {
              const isCurrentDevice = pocketBaseService.isCurrentDevice(dev);
              const cleanName = pocketBaseService.cleanDeviceName(dev.device_name);
              const isMobile = cleanName.includes('Android') || cleanName.includes('iPhone') || cleanName.includes('iPad');
              const contextName = dev.device_name?.includes(':::') ? dev.device_name.split(':::')[1] : '';
              return (
                <div
                  key={dev.id || idx}
                  className="p-3 sm:p-3.5 rounded-xl bg-[var(--bg-main)] border border-[var(--border-main)] flex items-center justify-between gap-3 sm:gap-4"
                >
                  <div className="flex items-center gap-3 sm:gap-3.5 min-w-0 flex-1">
                    <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-[var(--bg-surface)] flex items-center justify-center text-[var(--accent)] shrink-0 border border-[var(--border-main)]">
                      {isMobile ? (
                        <Smartphone size={17} />
                      ) : (
                        <Monitor size={17} />
                      )}
                    </div>
                    <div className="min-w-0 flex-1 overflow-hidden">
                      <div className="text-xs font-bold text-[var(--text-main)] flex items-center gap-2">
                        <span className="truncate whitespace-nowrap">{cleanName}</span>
                        {dev.is_playing && (
                          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" title="Воспроизводится" />
                        )}
                        {isCurrentDevice && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-[var(--accent)]/15 text-[var(--accent)] font-semibold border border-[var(--accent)]/30">
                            Текущее
                          </span>
                        )}
                        {contextName && (
                          <span className="text-[10px] text-[var(--accent)] font-medium truncate max-w-[120px]">
                            • {contextName}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-[var(--text-secondary)] truncate whitespace-nowrap mt-0.5">
                        {dev.title ? `${dev.title} — ${dev.artist || 'Неизвестный'}` : 'Ожидание воспроизведения'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {!isCurrentDevice && dev.track_id && (
                      <button
                        onClick={() => pocketBaseService.transferPlaybackFromDevice(dev)}
                        className="px-2.5 py-1 rounded-lg bg-[var(--accent)] hover:brightness-110 active:scale-95 text-[var(--accent-contrast)] text-[11px] font-bold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
                        title="Слушать на этом устройстве"
                      >
                        <Play size={11} fill="currentColor" />
                        <span className="hidden sm:inline">Слушать здесь</span>
                      </button>
                    )}
                    <span className="text-[10px] text-emerald-400 font-semibold px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 whitespace-nowrap">
                      {dev.is_playing ? 'Играет' : 'В сети'}
                    </span>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="p-3.5 rounded-xl bg-[var(--bg-main)] border border-[var(--border-main)] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Monitor size={18} className="text-[var(--accent)]" />
                <span className="text-xs text-[var(--text-main)] font-semibold">Текущее устройство</span>
              </div>
              <span className="text-[10px] text-emerald-400 font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                Активно
              </span>
            </div>
          )}
        </div>

        <div className="p-3.5 rounded-xl bg-[var(--accent)]/10 border border-[var(--accent)]/20 flex items-start gap-2.5">
          <Sparkles size={16} className="text-[var(--accent)] shrink-0 mt-0.5" />
          <p className="text-[11px] text-[var(--text-main)]/90 leading-relaxed">
            Лайк или добавление плейлиста на одном устройстве мгновенно отображается на всех остальных благодаря базе данных PocketBase.
          </p>
        </div>
      </div>
    </div>
  );
};
