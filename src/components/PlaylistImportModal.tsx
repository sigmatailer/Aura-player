import React, { useState } from 'react';
import { X, Link2, DownloadCloud, Sparkles, Check, AlertCircle, Loader2, ChevronDown, ChevronUp, Music2, Clipboard } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import { useCollectionStore } from '../store/useCollectionStore';
import { Track } from '../types';

interface ExternalTrackInfo {
  title: string;
  artist: string;
  yandex_id?: string | null;
  album?: string | null;
  duration_sec?: number | null;
  cover_url?: string | null;
}

interface ExternalPlaylistData {
  title: string;
  cover_url?: string | null;
  platform: string;
  tracks: ExternalTrackInfo[];
}

interface PlaylistImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenPlaylist?: (playlistId: string) => void;
}

export const PlaylistImportModal: React.FC<PlaylistImportModalProps> = ({
  isOpen,
  onClose,
  onOpenPlaylist,
}) => {
  const [url, setUrl] = useState('');
  const [step, setStep] = useState<'input' | 'parsing' | 'matching' | 'done'>('input');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Parsed playlist data
  const [playlistMeta, setPlaylistMeta] = useState<ExternalPlaylistData | null>(null);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [currentSearchTrack, setCurrentSearchTrack] = useState<string>('');
  const [foundTracksCount, setFoundTracksCount] = useState(0);
  const [missingTracks, setMissingTracks] = useState<ExternalTrackInfo[]>([]);
  const [createdPlaylistId, setCreatedPlaylistId] = useState<string | null>(null);
  const [showMissingList, setShowMissingList] = useState(false);
  const [copiedMissing, setCopiedMissing] = useState(false);

  const yaToken = localStorage.getItem('yandex_access_token');
  const { createPlaylist, updatePlaylist, addTrackToPlaylist } = useCollectionStore();

  if (!isOpen) return null;

  const resetState = () => {
    setUrl('');
    setStep('input');
    setErrorMsg(null);
    setPlaylistMeta(null);
    setCurrentTrackIndex(0);
    setCurrentSearchTrack('');
    setFoundTracksCount(0);
    setMissingTracks([]);
    setCreatedPlaylistId(null);
    setShowMissingList(false);
    setCopiedMissing(false);
  };

  const handleCopyMissing = () => {
    const text = missingTracks.map(t => `${t.artist} — ${t.title}`).join('\n');
    navigator.clipboard.writeText(text);
    setCopiedMissing(true);
    setTimeout(() => setCopiedMissing(false), 2000);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setUrl(text.trim());
    } catch (e) {
      console.error('Clipboard paste failed', e);
    }
  };

  const mapYandexTrack = (item: any): Track => ({
    id: `ya_${item.id}`,
    filePath: `yandex:${item.id}`,
    title: item.title,
    artist: item.artists?.[0]?.name || 'Unknown Artist',
    album: item.albums?.[0]?.title || 'Yandex Music',
    duration: Math.floor((item.durationMs || 0) / 1000),
    originalCoverUrl: item.coverUri 
      ? `https://${item.coverUri.replace('%%', '1000x1000')}` 
      : 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=200&auto=format&fit=crop',
    customCoverPath: null
  });

  const ARTIST_ALIASES: Record<string, string> = {
    'alyona shvets': 'алёна швец',
    'alena shvets': 'алёна швец',
    'korol i shut': 'король и шут',
    'poshlaya molly': 'пошлая молли',
    'valentin strykalo': 'валентин стрыкало',
    'tri dnya dozhdya': 'три дня дождя',
    'dead blonde': 'дэд блонд',
    'smetana band': 'сметана band',
    'egor kreed': 'егор крид',
    'oxxxymiron': 'оксимирон',
    'slava kpss': 'слава кпсс',
    'nautilus pompilius': 'наутилус помпилиус',
    'kino': 'кино',
    'bi-2': 'би-2',
    'pyrokinesis': 'пирокинезис',
    'mukka': 'мукка',
    'morgenshtern': 'моргенштерн',
    'dora': 'дора',
    'polmateri': 'полматери',
    'instasamka': 'инстасамка',
    'zemfira': 'земфира',
    'serebro': 'серебро',
    'krovostok': 'кровосток',
    'nervy': 'нервы',
    'nerves': 'нервы',
    'splean': 'сплин',
    'aigel': 'аигел',
    'lsp': 'лсп',
    'skriptonit': 'скриптонит',
    'macan': 'макан',
    'maksim': 'максим',
    'anacondaz': 'анакондаз',
    'louna': 'лоуна'
  };

  const latToRuMulti: [string, string][] = [
    ['shch', 'щ'], ['yo', 'ё'], ['zh', 'ж'], ['kh', 'х'], ['ts', 'ц'],
    ['ch', 'ч'], ['sh', 'ш'], ['yu', 'ю'], ['ya', 'я'], ['ye', 'е']
  ];
  const latToRuSingle: Record<string, string> = {
    'a': 'а', 'b': 'б', 'v': 'в', 'g': 'г', 'd': 'д', 'e': 'е', 'z': 'з',
    'i': 'и', 'y': 'й', 'k': 'к', 'l': 'л', 'm': 'м', 'n': 'н', 'o': 'о',
    'p': 'п', 'r': 'р', 's': 'с', 't': 'т', 'u': 'у', 'f': 'ф', 'h': 'х',
    'c': 'к', 'w': 'в', 'j': 'дж', 'x': 'кс', 'q': 'к'
  };

  const transliterate = (text: string): string => {
    let res = text.toLowerCase();
    for (const [lat, ru] of latToRuMulti) {
      res = res.replaceAll(lat, ru);
    }
    let out = '';
    for (const ch of res) {
      out += latToRuSingle[ch] || ch;
    }
    return out;
  };

  const searchTrackInYandex = async (track: ExternalTrackInfo): Promise<Track | null> => {
    if (track.yandex_id) {
      return {
        id: `ya_${track.yandex_id}`,
        filePath: `yandex:${track.yandex_id}`,
        title: track.title,
        artist: track.artist,
        album: track.album || 'Yandex Music',
        duration: track.duration_sec || 0,
        originalCoverUrl: track.cover_url || 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=200&auto=format&fit=crop',
        customCoverPath: null
      };
    }

    const cleanTitle = track.title
      .replace(/\([^)]*\)|\[[^\]]*\]/g, '')
      .replace(/- Single$/i, '')
      .replace(/Single$/i, '')
      .replace(/[«»"'\/\\]/g, '')
      .trim();

    const cleanArtist = track.artist
      .replace(/\([^)]*\)|\[[^\]]*\]/g, '')
      .replace(/[«»"'\/\\]/g, '')
      .trim();

    const artistLower = cleanArtist.toLowerCase();
    const aliasArtist = ARTIST_ALIASES[artistLower] || null;
    const translitArt = transliterate(cleanArtist);
    const firstArtist = cleanArtist.split(/[,&/]|feat\./i)[0].trim();
    const translitFirst = transliterate(firstArtist);
    const translitTitle = transliterate(cleanTitle);

    const queries: string[] = [];

    // 1. Direct artist + title
    if (cleanArtist) queries.push(`${cleanArtist} ${cleanTitle}`);

    // 2. Known alias if exists (e.g. Alyona Shvets -> Алёна Швец)
    if (aliasArtist) queries.push(`${aliasArtist} ${cleanTitle}`);

    // 3. Transliterated artist + title
    if (translitArt && translitArt !== artistLower) {
      queries.push(`${translitArt} ${cleanTitle}`);
    }

    // 4. First artist only (if multiple artists in tag)
    if (firstArtist && firstArtist !== cleanArtist) {
      queries.push(`${firstArtist} ${cleanTitle}`);
      if (ARTIST_ALIASES[firstArtist.toLowerCase()]) {
        queries.push(`${ARTIST_ALIASES[firstArtist.toLowerCase()]} ${cleanTitle}`);
      }
      if (translitFirst !== firstArtist.toLowerCase()) {
        queries.push(`${translitFirst} ${cleanTitle}`);
      }
    }

    // 5. Transliterated title (if title in English but meant to be Russian e.g. Sopernitsa -> Соперница)
    if (translitTitle && translitTitle !== cleanTitle.toLowerCase()) {
      if (cleanArtist) queries.push(`${cleanArtist} ${translitTitle}`);
      if (aliasArtist) queries.push(`${aliasArtist} ${translitTitle}`);
    }

    // 6. Title only (if descriptive)
    if (cleanTitle.length >= 3) {
      queries.push(cleanTitle);
    }

    // Deduplicate queries
    const uniqueQueries = Array.from(new Set(queries));

    for (const q of uniqueQueries) {
      try {
        const response = await invoke<string>('yandex_api_request', {
          url: `https://api.music.yandex.net/search?type=track&text=${encodeURIComponent(q)}&page=0`,
          token: yaToken || ''
        });

        const data = JSON.parse(response);
        const results = data.result?.tracks?.results;
        if (results && results.length > 0) {
          // Check for best matching result title
          const targetTitle = cleanTitle.toLowerCase();
          for (const res of results) {
            const resTitle = (res.title || '').toLowerCase();
            if (resTitle.includes(targetTitle) || targetTitle.includes(resTitle)) {
              return mapYandexTrack(res);
            }
          }
          // If no exact substring match, pick the top result
          return mapYandexTrack(results[0]);
        }
      } catch (e) {
        console.warn('Search query failed:', q, e);
      }
    }

    return null;
  };

  const handleStartImport = async () => {
    if (!url.trim()) return;
    setErrorMsg(null);
    setStep('parsing');

    try {
      // Step 1: Parse external playlist data via Rust backend
      const data = await invoke<ExternalPlaylistData>('parse_external_playlist', { url: url.trim() });
      if (!data || !data.tracks || data.tracks.length === 0) {
        throw new Error('В плейлисте не найдено ни одного трека');
      }

      setPlaylistMeta(data);
      setStep('matching');

      // Step 2: Sequentially search tracks in Yandex Music with live progress
      const foundTracks: Track[] = [];
      const notFound: ExternalTrackInfo[] = [];
      const seenIds = new Set<string>();
      const isDirectYandex = data.tracks.some(t => !!t.yandex_id);

      for (let i = 0; i < data.tracks.length; i++) {
        const extTrack = data.tracks[i];
        setCurrentTrackIndex(i + 1);
        setCurrentSearchTrack(`${extTrack.artist} — ${extTrack.title}`);

        const found = await searchTrackInYandex(extTrack);
        if (found) {
          if (!seenIds.has(found.id)) {
            seenIds.add(found.id);
            foundTracks.push(found);
          }
          setFoundTracksCount(foundTracks.length);
        } else {
          notFound.push(extTrack);
          setMissingTracks([...notFound]);
        }

        // Smart pacing delay
        if (isDirectYandex) {
          if (i % 25 === 0) {
            await new Promise(r => setTimeout(r, 10));
          }
        } else {
          if (i % 3 === 0) {
            await new Promise(r => setTimeout(r, 40));
          }
        }
      }

      // Step 3: Create the playlist in store
      const playlistTitle = data.title || 'Импортированный плейлист';
      createPlaylist(playlistTitle);

      // Find created playlist
      const allPlaylists = useCollectionStore.getState().playlists;
      const newPlaylist = allPlaylists[allPlaylists.length - 1];

      if (newPlaylist) {
        setCreatedPlaylistId(newPlaylist.id);
        if (data.cover_url) {
          updatePlaylist(newPlaylist.id, { coverUrl: data.cover_url });
        }
        for (const tr of foundTracks) {
          addTrackToPlaylist(newPlaylist.id, tr);
        }
      }

      setStep('done');
    } catch (err: any) {
      console.error('Import error:', err);
      setErrorMsg(err?.message || err || 'Ошибка при импорте плейлиста');
      setStep('input');
    }
  };

  const progressPercent = playlistMeta && playlistMeta.tracks.length > 0
    ? Math.round((currentTrackIndex / playlistMeta.tracks.length) * 100)
    : 0;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={step === 'matching' ? undefined : handleClose}
          className="absolute inset-0 bg-black/75 backdrop-blur-md"
        />

        <motion.div 
          initial={{ scale: 0.92, opacity: 0, y: 15 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.92, opacity: 0, y: 15 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="relative bg-[var(--bg-surface)] border border-[var(--border-main)] rounded-3xl p-6 w-full max-w-lg shadow-2xl flex flex-col overflow-hidden max-h-[90vh]"
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-[var(--accent)]/15 text-[var(--accent)] flex items-center justify-center">
                <DownloadCloud size={20} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-[var(--text-main)]">Импорт плейлиста</h2>
                <span className="text-xs text-[var(--text-secondary)]">Перенос треков, названия и обложки</span>
              </div>
            </div>

            {step !== 'matching' && (
              <button 
                onClick={handleClose}
                className="p-1.5 rounded-full text-[var(--text-secondary)] hover:text-[var(--text-main)] hover:bg-[var(--bg-surface-hover)] transition-colors"
              >
                <X size={20} />
              </button>
            )}
          </div>

          {/* STEP 1: Input URL */}
          {step === 'input' && (
            <div className="flex flex-col gap-4 py-2">
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                    Ссылка на плейлист или список треков
                  </label>
                  <span className="text-[11px] text-[var(--text-secondary)]">
                    Поддерживает vk.com, vk.ru, spotify, apple, text
                  </span>
                </div>
                <div className="flex gap-2.5 items-start">
                  <div className="relative flex-1 min-w-0">
                    <div className={`absolute left-3.5 text-[var(--text-secondary)] pointer-events-none transition-all ${
                      url.includes('\n') ? 'top-3.5' : 'top-1/2 -translate-y-1/2'
                    }`}>
                      <Link2 size={18} />
                    </div>
                    <textarea 
                      autoFocus
                      rows={url.includes('\n') ? 4 : 1}
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey && !url.includes('\n')) {
                          e.preventDefault();
                          handleStartImport();
                        }
                      }}
                      placeholder="Вставьте ссылку или список треков..."
                      className={`w-full bg-[var(--bg-surface-hover)] border border-[var(--border-main)] rounded-2xl pl-10 pr-3 text-sm text-[var(--text-main)] placeholder:text-[var(--text-secondary)] focus:outline-none focus:border-[var(--accent)] transition-all shadow-inner resize-none scrollbar-hide ${
                        url.includes('\n')
                          ? 'py-3 min-h-[110px] whitespace-pre-wrap'
                          : 'h-12 py-3 leading-[22px] whitespace-nowrap overflow-hidden'
                      }`}
                    />
                  </div>
                  <button
                    onClick={handlePaste}
                    className="h-12 px-4 bg-[var(--bg-surface-hover)] hover:bg-[var(--border-main)] border border-[var(--border-main)] text-[var(--text-main)] text-xs font-bold rounded-2xl transition-colors flex items-center gap-1.5 shrink-0 shadow-sm"
                    title="Вставить из буфера обмена"
                  >
                    <Clipboard size={14} />
                    Вставить
                  </button>
                </div>
              </div>

              {errorMsg && (
                <div className="flex items-start gap-2.5 p-3.5 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium leading-relaxed">
                  <AlertCircle size={17} className="shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Supported Platforms Badges */}
              <div className="flex flex-col gap-2 p-3.5 rounded-2xl bg-[var(--bg-surface-hover)]/60 border border-[var(--border-main)]">
                <span className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                  Поддерживаемые площадки
                </span>
                <div className="flex flex-wrap gap-2">
                  <span className="text-xs px-2.5 py-1 rounded-lg bg-[var(--bg-surface)] text-[var(--text-main)] border border-[var(--border-main)] font-medium">
                    🔴 Яндекс Музыка
                  </span>
                  <span className="text-xs px-2.5 py-1 rounded-lg bg-[var(--bg-surface)] text-[var(--text-main)] border border-[var(--border-main)] font-medium">
                    🍎 Apple Music
                  </span>
                  <span className="text-xs px-2.5 py-1 rounded-lg bg-[var(--bg-surface)] text-[var(--text-main)] border border-[var(--border-main)] font-medium">
                    🟢 Spotify
                  </span>
                  <span className="text-xs px-2.5 py-1 rounded-lg bg-[var(--bg-surface)] text-[var(--text-main)] border border-[var(--border-main)] font-medium">
                    ▶ YouTube Music
                  </span>
                  <span className="text-xs px-2.5 py-1 rounded-lg bg-[var(--bg-surface)] text-[var(--text-main)] border border-[var(--border-main)] font-medium">
                    🔵 VK Музыка (vk.com / vk.ru)
                  </span>
                  <span className="text-xs px-2.5 py-1 rounded-lg bg-[var(--bg-surface)] text-[var(--text-main)] border border-[var(--border-main)] font-medium">
                    📝 Список треков текстом
                  </span>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-2">
                <button 
                  onClick={handleClose}
                  className="px-5 py-2.5 rounded-full font-bold text-xs text-[var(--text-secondary)] hover:text-[var(--text-main)] transition-colors"
                >
                  Отмена
                </button>
                <button 
                  onClick={handleStartImport}
                  disabled={!url.trim()}
                  className="flex items-center gap-2 px-6 py-2.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] rounded-full font-bold text-xs transition-colors shadow-lg disabled:opacity-40"
                >
                  <Sparkles size={15} />
                  Начать импорт
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: Parsing URL */}
          {step === 'parsing' && (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <div className="w-14 h-14 rounded-2xl bg-[var(--accent)]/15 text-[var(--accent)] flex items-center justify-center animate-pulse">
                <Loader2 size={28} className="animate-spin" />
              </div>
              <div className="flex flex-col items-center gap-1">
                <h3 className="text-base font-bold text-[var(--text-main)]">Считываем данные плейлиста</h3>
                <p className="text-xs text-[var(--text-secondary)]">Получение списка треков, названия и обложки...</p>
              </div>
            </div>
          )}

          {/* STEP 3: Matching & Cool Progress Bar */}
          {step === 'matching' && playlistMeta && (
            <div className="flex flex-col gap-5 py-2">
              {/* Preview Card */}
              <div className="flex items-center gap-4 p-3 rounded-2xl bg-[var(--bg-surface-hover)] border border-[var(--border-main)]">
                <div className="w-16 h-16 rounded-xl overflow-hidden bg-black/30 shrink-0 border border-[var(--border-main)] shadow-md">
                  {playlistMeta.cover_url ? (
                    <img src={playlistMeta.cover_url} alt={playlistMeta.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[var(--text-secondary)]">
                      <Music2 size={24} />
                    </div>
                  )}
                </div>
                <div className="flex flex-col truncate min-w-0 flex-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--accent)]">
                    {playlistMeta.platform}
                  </span>
                  <span className="text-base font-bold text-[var(--text-main)] truncate mt-0.5">
                    {playlistMeta.title}
                  </span>
                  <span className="text-xs text-[var(--text-secondary)] mt-0.5">
                    Всего треков: {playlistMeta.tracks.length}
                  </span>
                </div>
              </div>

              {/* Progress Container */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="text-[var(--text-main)]">
                    Поиск в Яндекс Музыке: {currentTrackIndex} из {playlistMeta.tracks.length}
                  </span>
                  <span className="text-[var(--accent)]">{progressPercent}%</span>
                </div>

                {/* Glowing Progress Bar */}
                <div className="w-full h-3.5 rounded-full bg-[var(--bg-surface-hover)] border border-[var(--border-main)] overflow-hidden p-0.5 relative shadow-inner">
                  <div 
                    className="h-full bg-[var(--accent)] rounded-full transition-all duration-200 relative shadow-[0_0_12px_var(--accent)]"
                    style={{ width: `${progressPercent}%` }}
                  >
                    <div className="absolute inset-0 bg-white/20 animate-pulse rounded-full" />
                  </div>
                </div>

                {/* Current Track Ticker */}
                <div className="flex items-center gap-2 mt-1 px-1">
                  <Loader2 size={13} className="animate-spin text-[var(--accent)] shrink-0" />
                  <span className="text-xs text-[var(--text-secondary)] truncate">
                    {currentSearchTrack}
                  </span>
                </div>
              </div>

              {/* Live Status Badges */}
              <div className="flex items-center gap-3 pt-1">
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 text-emerald-400 text-xs font-semibold border border-emerald-500/20">
                  <Check size={14} strokeWidth={3} />
                  <span>Найдено: {foundTracksCount}</span>
                </div>
                {missingTracks.length > 0 && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 text-[var(--text-secondary)] text-xs font-semibold border border-[var(--border-main)]">
                    <X size={14} />
                    <span>Пропущено: {missingTracks.length}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 4: Done Summary */}
          {step === 'done' && playlistMeta && (
            <div className="flex flex-col gap-5 py-2">
              <div className="flex flex-col items-center justify-center text-center gap-2 pt-2">
                <div className="w-14 h-14 rounded-full bg-emerald-500/15 text-emerald-400 flex items-center justify-center shadow-lg border border-emerald-500/30">
                  <Check size={30} strokeWidth={3} />
                </div>
                <h3 className="text-lg font-bold text-[var(--text-main)]">Плейлист успешно импортирован!</h3>
                <p className="text-xs text-[var(--text-secondary)] max-w-sm">
                  Добавлено <span className="text-emerald-400 font-bold">{foundTracksCount}</span> из {playlistMeta.tracks.length} треков в плейлист «{playlistMeta.title}»
                </p>
              </div>

              {/* Playlist Summary Card */}
              <div className="flex items-center gap-4 p-3 rounded-2xl bg-[var(--bg-surface-hover)] border border-[var(--border-main)]">
                <div className="w-16 h-16 rounded-xl overflow-hidden bg-black/30 shrink-0 border border-[var(--border-main)] shadow-md">
                  {playlistMeta.cover_url ? (
                    <img src={playlistMeta.cover_url} alt={playlistMeta.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[var(--text-secondary)]">
                      <Music2 size={24} />
                    </div>
                  )}
                </div>
                <div className="flex flex-col truncate min-w-0 flex-1">
                  <span className="text-base font-bold text-[var(--text-main)] truncate">
                    {playlistMeta.title}
                  </span>
                  <span className="text-xs text-emerald-400 font-medium mt-0.5">
                    Готов к воспроизведению
                  </span>
                </div>
              </div>

              {/* Missing Tracks Section */}
              {missingTracks.length > 0 && (
                <div className="flex flex-col border border-[var(--border-main)] rounded-2xl overflow-hidden bg-[var(--bg-surface-hover)]/40">
                  <div className="flex items-center justify-between p-3 bg-[var(--bg-surface-hover)]/50">
                    <button 
                      onClick={() => setShowMissingList(!showMissingList)}
                      className="flex items-center gap-2 text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-main)] transition-colors flex-1 text-left"
                    >
                      <span>Не найдены в каталоге ({missingTracks.length})</span>
                      {showMissingList ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                    </button>

                    {showMissingList && (
                      <button
                        onClick={handleCopyMissing}
                        className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-main)] bg-white/[0.04] hover:bg-white/[0.08] rounded-lg border border-white/[0.06] transition-colors shrink-0"
                        title="Скопировать список треков"
                      >
                        {copiedMissing ? (
                          <>
                            <Check size={12} className="text-emerald-400" />
                            <span className="text-emerald-400">Скопировано</span>
                          </>
                        ) : (
                          <>
                            <Clipboard size={12} />
                            <span>Скопировать</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>

                  {showMissingList && (
                    <div className="p-3 pt-1 border-t border-[var(--border-main)]/60 flex flex-col gap-2">
                      <div className="max-h-[210px] overflow-y-auto pr-1 flex flex-col gap-1.5 [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.18)_transparent]">
                        {missingTracks.map((tr, idx) => (
                          <div 
                            key={idx} 
                            className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.04] shrink-0 min-h-[42px] transition-colors overflow-hidden"
                          >
                            <span className="w-5 h-5 rounded-md bg-white/[0.06] text-[10px] font-bold text-[var(--text-secondary)] flex items-center justify-center shrink-0">
                              {idx + 1}
                            </span>
                            <div className="flex flex-col min-w-0 flex-1 overflow-hidden leading-tight">
                              <span className="text-xs font-semibold text-[var(--text-main)] truncate" title={tr.title}>
                                {tr.title || 'Без названия'}
                              </span>
                              <span className="text-[11px] text-[var(--text-secondary)] truncate mt-0.5" title={tr.artist}>
                                {tr.artist || 'Неизвестный исполнитель'}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                      {missingTracks.length > 4 && (
                        <div className="text-[10px] text-[var(--text-secondary)] text-center pt-0.5 opacity-60">
                          Листайте вниз, чтобы увидеть все {missingTracks.length} треков
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Final Actions */}
              <div className="flex justify-end gap-3 pt-2">
                <button 
                  onClick={handleClose}
                  className="px-5 py-2.5 rounded-full font-bold text-xs text-[var(--text-secondary)] hover:text-[var(--text-main)] transition-colors"
                >
                  Закрыть
                </button>
                {createdPlaylistId && onOpenPlaylist && (
                  <button 
                    onClick={() => {
                      onOpenPlaylist(createdPlaylistId);
                      handleClose();
                    }}
                    className="flex items-center gap-2 px-6 py-2.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] rounded-full font-bold text-xs transition-colors shadow-lg"
                  >
                    <Music2 size={15} />
                    Открыть плейлист
                  </button>
                )}
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
