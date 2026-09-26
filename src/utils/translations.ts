export type Language = 'ru' | 'en';

export const translations = {
  ru: {
    // Navigation
    nav_myvibe: 'Моя волна',
    nav_queue: 'Очередь',
    nav_search: 'Поиск',
    nav_collections: 'Коллекции',
    nav_settings: 'Настройки',
    mini_player_tooltip: 'Мини-плеер',

    // Settings Main Tabs
    tab_account: 'Аккаунт',
    tab_general: 'Общие',
    tab_appearance: 'Внешний вид',

    // Settings Subtabs
    subtab_general: 'Общие',
    subtab_edit: 'Изменить',
    subtab_services: 'Сервисы',
    subtab_storage: 'Хранилище',
    subtab_themes: 'Темы',
    subtab_custom: 'Своя тема',
    subtab_wallpaper: 'Обои',
    subtab_fonts: 'Шрифты',
    subtab_miniplayer: 'Мини-плеер',

    // General Tab
    app_language: 'Язык приложения',
    interface_language: 'Язык интерфейса',
    autolaunch_title: 'Автозапуск',
    autolaunch_desc: 'Запускать приложение при включении системы',
    tray_title: 'Сворачивать в трей вместо закрытия',
    tray_desc: 'Приложение останется работать в фоне при закрытии',
    auto_similar_title: 'Авто похожие',
    auto_similar_desc: 'Автоматически догружать похожие треки, когда следующего нет',
    startup_restore: 'Восстановление при запуске',
    startup_restore_desc: 'Что восстанавливать при открытии приложения',
    startup_none: '✕ Ничего',
    startup_track: '♫ Трек',
    startup_queue: '☰ Очередь',

    // Storage
    storage_title: 'Локальное хранилище треков',
    storage_desc: 'Кэшированные аудиозаписи для оффлайн воспроизведения',
    cache_size: 'Размер кэша',
    cached_tracks: 'Кэшировано треков',
    clear_cache: 'Очистить кэш треков',
    cache_cleared: 'Кэш успешно очищен',

    // Artist
    listeners_yandex: 'слушателей на Яндекс Музыке',
    play_top: 'Слушать топ',
    play_all: 'Слушать все',
    continue_play: 'Продолжить',
    pause_play: 'Пауза',
    shuffle: 'Перемешать',
    tab_popular: 'Популярные',
    tab_albums: 'Альбомы',
    tab_all_tracks: 'Все треки',
    all_tracks_artist: 'Все треки исполнителя',
    loading_artist: 'Загрузка данных артиста...',
    tracks_not_found: 'Треки не найдены',
    albums_not_found: 'Альбомы не найдены',

    // Player
    nothing_playing: 'Ничего не играет',
    choose_track: 'Выберите трек для воспроизведения',
    repeat_off: 'Повтор выкл',
    repeat_all: 'Повторять все',
    repeat_one: 'Повторять этот трек',
    shuffle_on: 'Случайный порядок включен',
    shuffle_off: 'Случайный порядок выключен',
    volume: 'Громкость',
    fullscreen: 'Полноэкранный режим',
    equalizer: 'Эквалайзер',
    add_to_playlist: 'Добавить в плейлист',
  },
  en: {
    // Navigation
    nav_myvibe: 'My Vibe',
    nav_queue: 'Queue',
    nav_search: 'Search',
    nav_collections: 'Collections',
    nav_settings: 'Settings',
    mini_player_tooltip: 'Mini Player',

    // Settings Main Tabs
    tab_account: 'Account',
    tab_general: 'General',
    tab_appearance: 'Appearance',

    // Settings Subtabs
    subtab_general: 'General',
    subtab_edit: 'Edit',
    subtab_services: 'Services',
    subtab_storage: 'Storage',
    subtab_themes: 'Themes',
    subtab_custom: 'Custom Theme',
    subtab_wallpaper: 'Wallpaper',
    subtab_fonts: 'Fonts',
    subtab_miniplayer: 'Mini Player',

    // General Tab
    app_language: 'App Language',
    interface_language: 'Interface language',
    autolaunch_title: 'Autostart',
    autolaunch_desc: 'Launch application on system boot',
    tray_title: 'Minimize to tray on close',
    tray_desc: 'Application will keep running in the background when closed',
    auto_similar_title: 'Auto-similar tracks',
    auto_similar_desc: 'Automatically load similar tracks when queue reaches the end',
    startup_restore: 'Restore on startup',
    startup_restore_desc: 'What to restore when application opens',
    startup_none: '✕ None',
    startup_track: '♫ Track',
    startup_queue: '☰ Queue',

    // Storage
    storage_title: 'Local Track Storage',
    storage_desc: 'Cached audio tracks for offline playback',
    cache_size: 'Cache size',
    cached_tracks: 'Cached tracks',
    clear_cache: 'Clear track cache',
    cache_cleared: 'Cache cleared successfully',

    // Artist
    listeners_yandex: 'monthly listeners on Yandex Music',
    play_top: 'Play top',
    play_all: 'Play all',
    continue_play: 'Continue',
    pause_play: 'Pause',
    shuffle: 'Shuffle',
    tab_popular: 'Popular',
    tab_albums: 'Albums',
    tab_all_tracks: 'All Tracks',
    all_tracks_artist: 'All artist tracks',
    loading_artist: 'Loading artist details...',
    tracks_not_found: 'Tracks not found',
    albums_not_found: 'Albums not found',

    // Player
    nothing_playing: 'Nothing playing',
    choose_track: 'Select a track to play',
    repeat_off: 'Repeat off',
    repeat_all: 'Repeat all',
    repeat_one: 'Repeat track',
    shuffle_on: 'Shuffle on',
    shuffle_off: 'Shuffle off',
    volume: 'Volume',
    fullscreen: 'Fullscreen mode',
    equalizer: 'Equalizer',
    add_to_playlist: 'Add to playlist',
  }
};

export type TranslationKey = keyof typeof translations.ru;
