import React, { useState, useEffect } from 'react';
import { 
  User, Lock, Mail, RefreshCw, Smartphone, Monitor, 
  LogOut, Radio, 
  AlertCircle, ShieldCheck, Sparkles 
} from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import { pocketBaseService } from '../services/PocketBaseService';

export const AccountTab: React.FC = () => {
  const { user, isSyncing, syncStatus, lastSyncTime } = useAuthStore();
  
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

  const loadData = async () => {
    if (pocketBaseService.isLoggedIn()) {
      const devices = await pocketBaseService.getActiveDevices();
      setActiveDevices(devices);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 8000);
    return () => clearInterval(interval);
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

  // If LOGGED IN: Show Account Dashboard
  return (
    <div className="space-y-6 max-w-3xl mx-auto py-2 animate-in fade-in duration-200">
      {/* Profile Card */}
      <div className="p-5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-main)] shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-[var(--accent)] flex items-center justify-center text-[var(--text-main)] font-black text-xl shadow-lg shadow-[var(--accent)]/30 shrink-0">
            {user.name ? user.name.charAt(0).toUpperCase() : user.email.charAt(0).toUpperCase()}
          </div>
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-[var(--text-main)]">
                {user.name || 'Пользователь Aura'}
              </h3>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold">
                В сети
              </span>
            </div>
            <p className="text-xs text-[var(--text-secondary)]">{user.email}</p>
            <div className="text-[10px] text-[var(--text-secondary)]/60 flex items-center gap-1 pt-0.5">
              <span>Статус:</span>
              <span className="text-emerald-400 font-medium">{syncStatus}</span>
              {lastSyncTime && (
                <span>• {new Date(lastSyncTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleManualSync}
            disabled={isSyncing}
            className="px-4 py-2 rounded-xl bg-[var(--bg-surface-hover)] hover:brightness-110 active:scale-95 border border-[var(--border-main)] text-xs font-semibold text-[var(--text-main)] flex items-center gap-2 transition-all cursor-pointer shadow-sm disabled:opacity-50"
          >
            <RefreshCw size={14} className={isSyncing ? 'animate-spin text-[var(--accent)]' : ''} />
            <span>Синхронизировать</span>
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

      {/* Card: Active Devices Sync */}
      <div className="p-5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-main)] shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[var(--text-main)] font-bold text-sm">
            <Smartphone size={18} className="text-[var(--accent)]" />
            <span>Синхронизированные устройства</span>
          </div>
          <span className="text-xs text-[var(--text-secondary)] font-medium">
            {activeDevices.length > 0 ? `${activeDevices.length} онлайн` : '1 онлайн'}
          </span>
        </div>

        <div className="space-y-2.5">
          {activeDevices.length > 0 ? (
            activeDevices.map((dev, idx) => (
              <div
                key={idx}
                className="p-3.5 rounded-xl bg-[var(--bg-main)] border border-[var(--border-main)] flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3.5 min-w-0 flex-1">
                  <div className="w-10 h-10 rounded-xl bg-[var(--bg-surface)] flex items-center justify-center text-[var(--accent)] shrink-0 border border-[var(--border-main)]">
                    {dev.device_name?.includes('Android') || dev.device_name?.includes('iPhone') ? (
                      <Smartphone size={18} />
                    ) : (
                      <Monitor size={18} />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold text-[var(--text-main)] flex items-center gap-2">
                      <span className="truncate">{dev.device_name || 'Устройство Aura'}</span>
                      {dev.is_playing && (
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" title="Воспроизводится" />
                      )}
                    </div>
                    <div className="text-[11px] text-[var(--text-secondary)] truncate mt-0.5">
                      {dev.title ? `${dev.title} — ${dev.artist}` : 'Ожидание воспроизведения'}
                    </div>
                  </div>
                </div>
                <span className="text-[10px] text-emerald-400 font-semibold px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 shrink-0 whitespace-nowrap">
                  Синхронизировано
                </span>
              </div>
            ))
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
