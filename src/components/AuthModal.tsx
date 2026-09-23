import React, { useState } from 'react';
import { 
  X, User, Lock, Mail, RefreshCw, 
  ShieldCheck, AlertCircle, Music, ChevronRight
} from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import { pocketBaseService } from '../services/PocketBaseService';

export const AuthModal: React.FC = () => {
  const { isAuthModalOpen, closeAuthModal, skipAuthModal, user } = useAuthStore();
  
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isAuthModalOpen) return null;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (!email || !password) {
      setErrorMsg('Пожалуйста, введите электронную почту и пароль');
      return;
    }

    setIsLoading(true);
    const res = await pocketBaseService.login(email.trim(), password);
    setIsLoading(false);
    if (!res.success) {
      setErrorMsg(res.error || 'Неверная почта или пароль');
    } else {
      closeAuthModal();
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMsg('Пожалуйста, укажите уникальное имя пользователя (логин)');
      return;
    }
    if (!email || !password || !passwordConfirm) {
      setErrorMsg('Заполните все обязательные поля');
      return;
    }
    if (password !== passwordConfirm) {
      setErrorMsg('Пароли не совпадают');
      return;
    }
    if (password.length < 8) {
      setErrorMsg('Пароль должен содержать минимум 8 символов');
      return;
    }

    setIsLoading(true);
    const res = await pocketBaseService.register(email.trim(), password, passwordConfirm, name.trim());
    setIsLoading(false);
    if (!res.success) {
      setErrorMsg(res.error || 'Ошибка при регистрации');
    } else {
      closeAuthModal();
    }
  };

  return (
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200 select-none"
      onClick={skipAuthModal}
    >
      <div 
        className="w-full max-w-md bg-[var(--bg-main)] border border-[var(--border-main)] rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden flex flex-col gap-6"
        onClick={(e) => e.stopPropagation()}
        style={{
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 40px -10px var(--accent-glow, rgba(255, 85, 0, 0.2))'
        }}
      >
        {/* Close / Skip button */}
        <button 
          onClick={skipAuthModal}
          className="absolute top-5 right-5 w-8 h-8 rounded-full flex items-center justify-center bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-main)] text-[var(--text-secondary)] hover:text-[var(--text-main)] transition-all cursor-pointer shadow-sm"
          title="Закрыть"
        >
          <X size={16} />
        </button>

        {/* Branding & Header */}
        <div className="flex flex-col items-center text-center gap-3 pt-2">
          <div className="w-16 h-16 rounded-2xl bg-[var(--accent)]/15 border border-[var(--accent)]/40 flex items-center justify-center text-[var(--accent)] shadow-xl shadow-[var(--accent)]/20 relative">
            <Music size={32} />
            <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[var(--accent)] flex items-center justify-center text-white text-[9px] font-black">
              ✦
            </div>
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-black text-[var(--text-main)] tracking-tight">
              {user ? 'Ваш аккаунт Aura' : isRegisterMode ? 'Регистрация в Aura' : 'Вход в аккаунт Aura'}
            </h2>
            <p className="text-xs text-[var(--text-secondary)] mt-1.5 leading-relaxed max-w-xs mx-auto">
              Синхронизация избранного, плейлистов и персональная настройка «Моей волны» между ПК и телефоном.
            </p>
          </div>
        </div>

        {/* If already logged in: Profile summary */}
        {user ? (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-main)] flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-xl bg-[var(--accent)] text-[var(--text-main)] font-black text-lg flex items-center justify-center shadow-md">
                {(user.name || user.email).charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-[var(--text-main)] truncate">
                  {user.name || 'Пользователь Aura'}
                </div>
                <div className="text-xs text-[var(--text-secondary)] truncate">
                  {user.email}
                </div>
                <div className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1 mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Синхронизация активна
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={closeAuthModal}
                className="flex-1 py-3 bg-[var(--accent)] hover:brightness-110 active:scale-95 text-[var(--text-main)] text-xs font-bold rounded-xl shadow-lg shadow-[var(--accent)]/20 transition-all cursor-pointer"
              >
                Продолжить
              </button>
              <button
                type="button"
                onClick={() => pocketBaseService.logout()}
                className="px-4 py-3 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 text-xs font-semibold rounded-xl transition-all cursor-pointer"
              >
                Выйти
              </button>
            </div>
          </div>
        ) : (
          /* Login / Register Form */
          <div className="space-y-4">
            {/* Tabs */}
            <div className="flex bg-[var(--bg-surface)] p-1 rounded-xl border border-[var(--border-main)]">
              <button
                type="button"
                onClick={() => { setIsRegisterMode(false); setErrorMsg(''); }}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  !isRegisterMode 
                    ? 'bg-[var(--accent)] text-[var(--text-main)] shadow-sm' 
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-main)]'
                }`}
              >
                Вход
              </button>
              <button
                type="button"
                onClick={() => { setIsRegisterMode(true); setErrorMsg(''); }}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  isRegisterMode 
                    ? 'bg-[var(--accent)] text-[var(--text-main)] shadow-sm' 
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-main)]'
                }`}
              >
                Регистрация
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2 animate-in fade-in">
                <AlertCircle size={16} className="shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={isRegisterMode ? handleRegister : handleLogin} className="space-y-3.5">
              {isRegisterMode && (
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-[var(--text-secondary)] flex items-center gap-1.5">
                    <User size={13} /> Уникальное имя (логин)
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Например, alex_aura"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-main)] focus:border-[var(--accent)] text-xs text-[var(--text-main)] outline-none transition-all placeholder-[var(--text-secondary)]/40"
                  />
                </div>
              )}

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-[var(--text-secondary)] flex items-center gap-1.5">
                  <Mail size={13} /> {isRegisterMode ? 'Электронная почта' : 'Почта или имя пользователя'}
                </label>
                <input
                  type={isRegisterMode ? "email" : "text"}
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={isRegisterMode ? "name@example.com" : "name@example.com или логин"}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-main)] focus:border-[var(--accent)] text-xs text-[var(--text-main)] outline-none transition-all placeholder-[var(--text-secondary)]/40"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-[var(--text-secondary)] flex items-center gap-1.5">
                  <Lock size={13} /> Пароль
                </label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Минимум 8 символов"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-main)] focus:border-[var(--accent)] text-xs text-[var(--text-main)] outline-none transition-all placeholder-[var(--text-secondary)]/40"
                />
              </div>

              {isRegisterMode && (
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-[var(--text-secondary)] flex items-center gap-1.5">
                    <Lock size={13} /> Повторите пароль
                  </label>
                  <input
                    type="password"
                    required
                    value={passwordConfirm}
                    onChange={(e) => setPasswordConfirm(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-main)] focus:border-[var(--accent)] text-xs text-[var(--text-main)] outline-none transition-all placeholder-[var(--text-secondary)]/40"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full mt-2 py-3 bg-[var(--accent)] hover:brightness-110 active:scale-[0.98] text-[var(--text-main)] text-xs font-bold rounded-xl shadow-lg shadow-[var(--accent)]/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isLoading ? (
                  <RefreshCw size={16} className="animate-spin" />
                ) : isRegisterMode ? (
                  <ShieldCheck size={16} />
                ) : (
                  <ChevronRight size={16} />
                )}
                <span>
                  {isLoading 
                    ? (isRegisterMode ? 'Создание аккаунта...' : 'Вход...') 
                    : (isRegisterMode ? 'Зарегистрироваться' : 'Войти в аккаунт')}
                </span>
              </button>
            </form>

            {/* Skip / Continue as guest button */}
            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={skipAuthModal}
                className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-main)] underline transition-colors cursor-pointer"
              >
                Продолжить без входа (как гость)
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
