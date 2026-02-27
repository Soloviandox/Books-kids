
import React, { useState, useEffect, useRef } from 'react';
import { FairyTaleService, decodeBase64, decodePCM, pcmToWavBlob } from './services/geminiService';
import { AVAILABLE_VOICES, EXAMPLE_STORIES, GEN_CHARACTERS, PLOT_POINTS, LENGTH_OPTIONS, LOCATIONS } from './constants';
import { AppState, CharacterAssignment, TabType, GenerationConfig, HistoryItem, Location } from './types';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('generation');
  const [appState, setAppState] = useState<AppState>(AppState.GEN_CONFIG);
  const [story, setStory] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isGeneratingPlots, setIsGeneratingPlots] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [currentAudioBase64, setCurrentAudioBase64] = useState<string | null>(null);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(0);
  
  // Custom Plot Points State
  const [availablePlotPoints, setAvailablePlotPoints] = useState<string[]>(PLOT_POINTS);
  const [editingPlotIndex, setEditingPlotIndex] = useState<number | null>(null);
  const [editingPlotValue, setEditingPlotValue] = useState('');
  const [customPlotInput, setCustomPlotInput] = useState('');

  // Location State
  const [selectedLocation, setSelectedLocation] = useState<Location>(LOCATIONS[0]);

  // History State
  const [history, setHistory] = useState<HistoryItem[]>(() => {
    const saved = localStorage.getItem('fairy_tale_history');
    return saved ? JSON.parse(saved) : [];
  });

  // Generation State
  const [genCharacters, setGenCharacters] = useState<string[]>([]);
  const [genPlotPoints, setGenPlotPoints] = useState<string[]>([]);
  const [genLength, setGenLength] = useState(LENGTH_OPTIONS[0].label);

  // Voiceover State
  const [characters, setCharacters] = useState<string[]>([]);
  const [assignments, setAssignments] = useState<CharacterAssignment[]>([]);
  const [previewingVoice, setPreviewingVoice] = useState<string | null>(null);
  
  // Player State
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const serviceRef = useRef(new FairyTaleService());

  useEffect(() => {
    localStorage.setItem('fairy_tale_history', JSON.stringify(history));
  }, [history]);

  const initAudioContext = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }
  };

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    if (tab === 'generation') setAppState(AppState.GEN_CONFIG);
    else if (tab === 'voiceover') setAppState(AppState.INPUT);
  };

  const handleGenerateMorePlots = async () => {
    setIsGeneratingPlots(true);
    try {
      const newPlots = await serviceRef.current.generatePlotPoints();
      setAvailablePlotPoints(prev => [...prev, ...newPlots]);
    } catch (e) {
      setError("Не удалось придумать новые сюжеты.");
    } finally {
      setIsGeneratingPlots(false);
    }
  };

  const handleAddCustomPlot = () => {
    if (!customPlotInput.trim()) return;
    setAvailablePlotPoints(prev => [customPlotInput.trim(), ...prev]);
    setCustomPlotInput('');
  };

  const handleStartEditPlot = (e: React.MouseEvent, index: number, value: string) => {
    e.stopPropagation();
    setEditingPlotIndex(index);
    setEditingPlotValue(value);
  };

  const handleSaveEditPlot = (e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    if (!editingPlotValue.trim()) return;
    const oldVal = availablePlotPoints[index];
    const newVal = editingPlotValue.trim();
    
    setAvailablePlotPoints(prev => {
      const next = [...prev];
      next[index] = newVal;
      return next;
    });

    if (genPlotPoints.includes(oldVal)) {
      setGenPlotPoints(prev => prev.map(p => p === oldVal ? newVal : p));
    }

    setEditingPlotIndex(null);
  };

  const handleDeletePlot = (e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    const valToRemove = availablePlotPoints[index];
    setAvailablePlotPoints(prev => prev.filter((_, i) => i !== index));
    setGenPlotPoints(prev => prev.filter(p => p !== valToRemove));
    if (editingPlotIndex === index) setEditingPlotIndex(null);
  };

  const toggleGenChar = (name: string) => {
    setGenCharacters(prev => prev.includes(name) ? prev.filter(c => c !== name) : [...prev, name]);
  };

  const togglePlotPoint = (point: string) => {
    if (editingPlotIndex !== null) return;
    setGenPlotPoints(prev => prev.includes(point) ? prev.filter(p => p !== point) : [...prev, point]);
  };

  const handleGenerateStory = async () => {
    if (genCharacters.length === 0 || genPlotPoints.length === 0) {
      setError("Выберите хотя бы одного персонажа и один сюжетный момент.");
      return;
    }
    setIsProcessing(true);
    setError(null);
    try {
      const config: GenerationConfig = {
        characters: genCharacters,
        plotPoints: genPlotPoints,
        length: genLength,
        location: selectedLocation.name
      };
      const result = await serviceRef.current.generateStory(config);
      setStory(result);
      setAppState(AppState.GEN_RESULT);
    } catch (e) {
      setError("Ошибка при генерации сказки. Попробуйте снова.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAddToHistory = () => {
    const titleMatch = story.match(/^([^\n]+)/);
    const title = titleMatch ? titleMatch[1].slice(0, 50) : "Сказка без названия";
    
    const newItem: HistoryItem = {
      id: Date.now().toString(),
      title: title,
      text: story,
      characters: activeTab === 'generation' ? genCharacters : assignments.map(a => a.character),
      plotPoints: genPlotPoints,
      audioBase64: currentAudioBase64 || undefined,
      date: Date.now(),
      location: selectedLocation.name
    };
    
    setHistory(prev => [newItem, ...prev]);
    alert("Сказка добавлена в историю!");
  };

  const handleCopyToClipboard = () => {
    navigator.clipboard.writeText(story);
    alert("Сказка скопирована в буфер обмена!");
  };

  const handleGoToVoiceover = () => {
    setActiveTab('voiceover');
    setAppState(AppState.INPUT);
  };

  const handleExtractCharacters = async () => {
    if (!story.trim()) return;
    setIsProcessing(true);
    setError(null);
    try {
      const extracted = await serviceRef.current.extractCharacters(story);
      setCharacters(extracted);
      setAppState(AppState.VOICE_ASSIGNMENT);
      setAssignments(extracted.map((char, idx) => ({
        character: char,
        voiceId: AVAILABLE_VOICES[idx % AVAILABLE_VOICES.length].id
      })));
    } catch (e) {
      setError("Не удалось определить персонажей.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePreviewVoice = async (voiceId: string) => {
    if (previewingVoice === voiceId) {
      if (audioSourceRef.current) audioSourceRef.current.stop();
      setPreviewingVoice(null);
      return;
    }
    setPreviewingVoice(voiceId);
    try {
      const base64 = await serviceRef.current.previewVoice(voiceId);
      const data = decodeBase64(base64);
      initAudioContext();
      const ctx = audioContextRef.current!;
      const buffer = await decodePCM(data, ctx);
      if (audioSourceRef.current) audioSourceRef.current.stop();
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.onended = () => setPreviewingVoice(null);
      source.start();
      audioSourceRef.current = source;
    } catch (e) {
      setError("Ошибка предпрослушивания.");
      setPreviewingVoice(null);
    }
  };

  const handleGenerateAudio = async () => {
    setIsProcessing(true);
    setError(null);
    try {
      const base64 = await serviceRef.current.generateAudio(story, assignments, playbackSpeed);
      setCurrentAudioBase64(base64);
      const data = decodeBase64(base64);
      const blob = pcmToWavBlob(data, 24000);
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
      const audio = new Audio(url);
      audioPlayerRef.current = audio;
      audio.ontimeupdate = () => setCurrentTime(audio.currentTime);
      audio.onloadedmetadata = () => setDuration(audio.duration);
      audio.onended = () => setIsPlaying(false);
      setAppState(AppState.PLAYBACK);
      audio.play();
      setIsPlaying(true);
    } catch (e) {
      setError("Ошибка озвучки.");
    } finally {
      setIsProcessing(false);
    }
  };

  const togglePlayback = () => {
    if (!audioPlayerRef.current) return;
    if (isPlaying) audioPlayerRef.current.pause();
    else audioPlayerRef.current.play();
    setIsPlaying(!isPlaying);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (audioPlayerRef.current) audioPlayerRef.current.currentTime = time;
    setCurrentTime(time);
  };

  const formatTime = (time: number) => {
    const m = Math.floor(time / 60);
    const s = Math.floor(time % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const playHistoryAudio = (item: HistoryItem) => {
    if (!item.audioBase64) return;
    const data = decodeBase64(item.audioBase64);
    const blob = pcmToWavBlob(data, 24000);
    const url = URL.createObjectURL(blob);
    setAudioUrl(url);
    const audio = new Audio(url);
    audioPlayerRef.current = audio;
    audio.ontimeupdate = () => setCurrentTime(audio.currentTime);
    audio.onloadedmetadata = () => setDuration(audio.duration);
    audio.onended = () => setIsPlaying(false);
    setAppState(AppState.PLAYBACK);
    audio.play();
    setIsPlaying(true);
  };

  const deleteHistoryItem = (id: string) => {
    if (confirm("Удалить эту сказку из истории?")) {
      setHistory(prev => prev.filter(h => h.id !== id));
    }
  };

  return (
    <div className={`min-h-screen transition-all duration-1000 bg-gradient-to-b ${selectedLocation.gradient} text-slate-100 flex flex-col items-center py-8 px-4`}>
      <header className="max-w-4xl w-full text-center mb-8 relative z-10">
        <h1 className="text-4xl sm:text-5xl font-serif font-bold mb-6 bg-gradient-to-r from-purple-400 via-pink-400 to-orange-400 bg-clip-text text-transparent text-shadow-glow">
          Студия Волшебных Сказок
        </h1>
        
        <div className="inline-flex p-1 bg-slate-900/80 backdrop-blur-md border border-white/10 rounded-2xl shadow-xl flex-wrap justify-center">
          <button 
            onClick={() => handleTabChange('generation')}
            className={`px-4 sm:px-6 py-2.5 rounded-xl font-bold transition-all text-sm sm:text-base ${activeTab === 'generation' ? 'bg-purple-600 shadow-lg shadow-purple-900/40 text-white' : 'text-slate-400 hover:text-white'}`}
          >
            Генерация
          </button>
          <button 
            onClick={() => handleTabChange('voiceover')}
            className={`px-4 sm:px-6 py-2.5 rounded-xl font-bold transition-all text-sm sm:text-base ${activeTab === 'voiceover' ? 'bg-purple-600 shadow-lg shadow-purple-900/40 text-white' : 'text-slate-400 hover:text-white'}`}
          >
            Озвучка
          </button>
          <button 
            onClick={() => handleTabChange('history')}
            className={`px-4 sm:px-6 py-2.5 rounded-xl font-bold transition-all text-sm sm:text-base ${activeTab === 'history' ? 'bg-purple-600 shadow-lg shadow-purple-900/40 text-white' : 'text-slate-400 hover:text-white'}`}
          >
            История
          </button>
        </div>
      </header>

      <main className="max-w-4xl w-full bg-slate-900/40 backdrop-blur-2xl border border-white/10 rounded-[2.5rem] p-6 sm:p-10 shadow-2xl relative z-10">
        <div className="absolute inset-0 rounded-[2.5rem] pointer-events-none transition-all duration-1000" style={{ boxShadow: `0 0 80px ${selectedLocation.glow}` }}></div>
        
        {error && (activeTab !== 'history') && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/50 rounded-2xl text-red-400 text-sm flex items-center">
            {error}
          </div>
        )}

        {/* --- GENERATION TAB --- */}
        {activeTab === 'generation' && appState === AppState.GEN_CONFIG && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
            {/* Location Selection */}
            <section>
              <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                <span className="text-2xl">🌍</span> Выберите локацию
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {LOCATIONS.map(loc => (
                  <button
                    key={loc.id}
                    onClick={() => setSelectedLocation(loc)}
                    className={`p-4 rounded-[1.5rem] border-2 transition-all flex flex-col items-center gap-2 ${selectedLocation.id === loc.id ? 'bg-white/10 border-white/40 shadow-xl' : 'bg-black/20 border-white/5 hover:border-white/20'}`}
                  >
                    <span className="text-4xl">{loc.icon}</span>
                    <span className="font-bold text-xs text-center">{loc.name}</span>
                  </button>
                ))}
              </div>
            </section>

            <section>
              <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                <span className="text-2xl">👥</span> Выберите персонажей
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {GEN_CHARACTERS.map(c => (
                  <button
                    key={c.id}
                    onClick={() => toggleGenChar(c.name)}
                    className={`p-4 rounded-[1.5rem] border-2 transition-all flex flex-col items-center gap-2 ${genCharacters.includes(c.name) ? 'bg-purple-600/20 border-purple-500 shadow-lg shadow-purple-900/20' : 'bg-black/20 border-white/5 hover:border-white/20'}`}
                  >
                    <span className="text-4xl">{c.icon}</span>
                    <span className="font-bold">{c.name}</span>
                  </button>
                ))}
              </div>
            </section>

            <section>
              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-4">
                <h3 className="text-xl font-bold flex items-center gap-2">
                  <span className="text-2xl">📍</span> Ключевые моменты сюжета
                </h3>
                <button 
                  onClick={handleGenerateMorePlots}
                  disabled={isGeneratingPlots}
                  className="text-xs px-3 py-1.5 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 rounded-full flex items-center gap-1.5 transition-all active:scale-95 disabled:opacity-50 w-fit"
                >
                  {isGeneratingPlots ? (
                    <div className="w-3 h-3 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
                  ) : "🪄"} 
                  Создать новые сюжеты
                </button>
              </div>

              <div className="flex gap-2 mb-4">
                <input 
                  type="text"
                  value={customPlotInput}
                  onChange={(e) => setCustomPlotInput(e.target.value)}
                  placeholder="Добавьте свой сюжет..."
                  className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-purple-500 outline-none transition-all"
                  onKeyDown={(e) => e.key === 'Enter' && handleAddCustomPlot()}
                />
                <button 
                  onClick={handleAddCustomPlot}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded-xl font-bold text-sm transition-all"
                >
                  +
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[350px] overflow-y-auto pr-2 custom-scrollbar">
                {availablePlotPoints.map((p, idx) => (
                  <div
                    key={`${p}-${idx}`}
                    onClick={() => togglePlotPoint(p)}
                    className={`group p-3 rounded-xl border text-sm transition-all relative flex items-center justify-between gap-2 cursor-pointer ${genPlotPoints.includes(p) ? 'bg-pink-600/20 border-pink-500 shadow-[0_0_10px_rgba(236,72,153,0.1)]' : 'bg-black/20 border-white/5 hover:border-white/10'}`}
                  >
                    {editingPlotIndex === idx ? (
                      <input 
                        autoFocus
                        value={editingPlotValue}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setEditingPlotValue(e.target.value)}
                        className="flex-1 bg-black/60 border border-purple-500 rounded px-2 py-1 text-xs outline-none"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveEditPlot(e as any, idx);
                          if (e.key === 'Escape') setEditingPlotIndex(null);
                        }}
                      />
                    ) : (
                      <span className="flex-1 line-clamp-2">{p}</span>
                    )}
                    
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {editingPlotIndex === idx ? (
                        <button onClick={(e) => handleSaveEditPlot(e, idx)} className="p-1 hover:text-green-400">✅</button>
                      ) : (
                        <button onClick={(e) => handleStartEditPlot(e, idx, p)} className="p-1 hover:text-blue-400">✏️</button>
                      )}
                      <button onClick={(e) => handleDeletePlot(e, idx)} className="p-1 hover:text-red-400">🗑</button>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                <span className="text-2xl">⏳</span> Длина сказки
              </h3>
              <div className="flex gap-4">
                {LENGTH_OPTIONS.map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => setGenLength(opt.label)}
                    className={`flex-1 py-3 rounded-xl border font-bold transition-all ${genLength === opt.label ? 'bg-orange-600/20 border-orange-500' : 'bg-black/20 border-white/5 hover:border-white/10'}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </section>

            <button
              onClick={handleGenerateStory}
              disabled={isProcessing}
              className="w-full py-5 bg-gradient-to-r from-purple-600 to-pink-600 rounded-[1.5rem] text-xl font-bold shadow-xl flex justify-center items-center gap-3 transform active:scale-95 transition-transform"
            >
              {isProcessing ? <div className="w-6 h-6 border-2 border-t-white rounded-full animate-spin" /> : <>Наколдовать сказку ✨</>}
            </button>
          </div>
        )}

        {activeTab === 'generation' && appState === AppState.GEN_RESULT && (
          <div className="space-y-6 animate-in zoom-in duration-300">
            <h2 className="text-3xl font-serif font-bold text-center">Ваша магическая история</h2>
            <div className="bg-white/5 border border-white/10 rounded-2xl p-3 flex items-center gap-2 text-xs text-slate-400">
               <span className="text-lg">{selectedLocation.icon}</span> Место действия: <span className="text-slate-200 font-bold">{selectedLocation.name}</span>
            </div>
            <textarea
              value={story}
              onChange={(e) => setStory(e.target.value)}
              className="w-full h-[400px] bg-black/40 border border-white/10 rounded-[2rem] p-8 text-lg font-serif leading-relaxed focus:ring-4 focus:ring-purple-500/20 outline-none resize-none"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button onClick={handleCopyToClipboard} className="py-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl font-bold flex items-center justify-center gap-2">
                📋 Копировать
              </button>
              <button onClick={handleAddToHistory} className="py-4 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 rounded-2xl font-bold flex items-center justify-center gap-2">
                📂 В историю
              </button>
              <button onClick={handleGoToVoiceover} className="sm:col-span-2 py-4 bg-purple-600 hover:bg-purple-500 rounded-2xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-purple-900/40">
                🎤 Озвучить сказку
              </button>
              <button onClick={() => setAppState(AppState.GEN_CONFIG)} className="sm:col-span-2 py-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl font-bold">
                🔄 Заново
              </button>
            </div>
          </div>
        )}

        {/* --- VOICEOVER TAB --- */}
        {activeTab === 'voiceover' && appState === AppState.INPUT && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-bold">Текст для озвучки</h3>
              <button onClick={() => setStory(EXAMPLE_STORIES[0].content)} className="text-xs text-purple-400 underline italic">Вставить пример</button>
            </div>
            <textarea
              value={story}
              onChange={(e) => setStory(e.target.value)}
              placeholder="Вставьте текст сказки здесь..."
              className="w-full h-80 bg-black/40 border border-white/10 rounded-[2rem] p-8 text-lg font-serif leading-relaxed focus:ring-4 focus:ring-purple-500/20 outline-none resize-none"
            />
            <button
              onClick={handleExtractCharacters}
              disabled={!story.trim() || isProcessing}
              className="w-full py-5 bg-gradient-to-r from-purple-600 to-pink-600 rounded-[1.5rem] text-xl font-bold shadow-xl flex justify-center items-center gap-3"
            >
              {isProcessing ? <div className="w-6 h-6 border-2 border-t-white rounded-full animate-spin" /> : <>Определить героев ✨</>}
            </button>
          </div>
        )}

        {activeTab === 'voiceover' && appState === AppState.VOICE_ASSIGNMENT && (
          <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
            <div className="bg-white/5 p-6 rounded-3xl border border-white/10">
              <h4 className="text-sm font-bold text-slate-400 mb-4 uppercase tracking-widest text-center">Темп речи</h4>
              <div className="grid grid-cols-7 gap-2">
                {[-40, -30, -20, -10, 0, 10, 20].map(s => (
                  <button 
                    key={s} onClick={() => setPlaybackSpeed(s)}
                    className={`py-2 rounded-xl border text-[10px] font-bold transition-all ${playbackSpeed === s ? 'bg-purple-600 border-purple-400 scale-105 shadow-[0_0_10px_rgba(147,51,234,0.3)]' : 'bg-black/40 border-white/5 hover:border-white/10'}`}
                  >
                    {s > 0 ? '+' : ''}{s}%
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
              {assignments.map((a, i) => (
                <div key={i} className="bg-white/5 p-6 rounded-[2rem] border border-white/10 space-y-4">
                  <h4 className="text-2xl font-serif font-bold text-purple-300">{a.character}</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    {AVAILABLE_VOICES.map(v => (
                      <button
                        key={v.id}
                        onClick={() => setAssignments(prev => prev.map(item => item.character === a.character ? { ...item, voiceId: v.id } : item))}
                        className={`py-2 px-1 rounded-xl border text-[10px] transition-all relative ${a.voiceId === v.id ? 'bg-purple-600 border-purple-400' : 'bg-black/40 border-white/5 hover:border-white/20'}`}
                      >
                        {v.name}
                        <div onClick={(e) => { e.stopPropagation(); handlePreviewVoice(v.id); }} className={`absolute -top-1 -right-1 p-1 rounded-full shadow-lg ${previewingVoice === v.id ? 'bg-pink-500' : 'bg-slate-700'}`}>
                           {previewingVoice === v.id ? '⏹' : '▶'}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-4">
              <button onClick={() => setAppState(AppState.INPUT)} className="flex-1 py-4 bg-white/5 rounded-2xl font-bold">Назад</button>
              <button onClick={handleGenerateAudio} disabled={isProcessing} className="flex-[2] py-4 bg-purple-600 rounded-2xl font-bold shadow-lg shadow-purple-900/40">
                {isProcessing ? "Озвучиваем..." : "Магическая озвучка 🔮"}
              </button>
            </div>
          </div>
        )}

        {appState === AppState.PLAYBACK && (activeTab !== 'history') && (
          <div className="text-center space-y-8 animate-in zoom-in duration-500">
            <div className="relative inline-block">
               <div className="absolute inset-0 bg-purple-500/20 blur-[60px] rounded-full animate-pulse"></div>
               <div className="relative bg-slate-800 p-12 rounded-full border-4 border-purple-500/30 shadow-2xl cursor-pointer hover:scale-105 transition-transform" onClick={togglePlayback}>
                 {isPlaying ? <span className="text-6xl">⏸</span> : <span className="text-6xl pl-2">▶️</span>}
               </div>
            </div>
            <div className="space-y-6 max-w-md mx-auto">
              <input type="range" min="0" max={duration} step="0.1" value={currentTime} onChange={handleSeek} className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500" />
              <div className="flex justify-between text-xs font-mono opacity-50">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <button onClick={() => { const a = document.createElement('a'); a.href = audioUrl!; a.download = 'fairy-tale.wav'; a.click(); }} className="py-4 bg-emerald-600/20 border border-emerald-500/40 rounded-2xl text-emerald-400 font-bold hover:bg-emerald-600/30 transition-all">Скачать</button>
                <button onClick={handleAddToHistory} className="py-4 bg-blue-600/20 border border-blue-500/40 rounded-2xl text-blue-400 font-bold hover:bg-blue-600/30 transition-all">В историю</button>
                <button onClick={() => { setAppState(AppState.INPUT); setAudioUrl(null); }} className="col-span-2 py-4 bg-white/5 rounded-2xl font-bold hover:bg-white/10 transition-all">Новая сказка</button>
              </div>
            </div>
          </div>
        )}

        {/* --- HISTORY TAB --- */}
        {activeTab === 'history' && (
          <div className="space-y-6 animate-in fade-in duration-500">
            <h2 className="text-3xl font-serif font-bold text-center mb-6">Ваши сказочные архивы</h2>
            {history.length === 0 ? (
              <div className="text-center py-20 opacity-40">
                <p className="text-xl">Архивы пока пусты...</p>
                <p className="text-sm">Создайте и озвучьте свою первую сказку!</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6">
                {history.map(item => (
                  <div key={item.id} className="bg-white/5 border border-white/10 rounded-[2rem] p-6 space-y-4 hover:border-purple-500/40 transition-all group">
                    <div className="flex justify-between items-start">
                      <div className="space-y-1">
                        <h3 className="text-xl font-bold text-purple-300">{item.title}</h3>
                        <p className="text-[10px] text-slate-500 uppercase tracking-widest">{new Date(item.date).toLocaleDateString()} {new Date(item.date).toLocaleTimeString()}</p>
                      </div>
                      <button onClick={() => deleteHistoryItem(item.id)} className="p-2 text-slate-600 hover:text-red-400 transition-colors">🗑</button>
                    </div>

                    <div className="flex flex-wrap gap-2 items-center">
                      {item.location && <span className="px-3 py-1 bg-white/10 border border-white/10 rounded-full text-[10px] text-slate-300 font-bold uppercase">{item.location}</span>}
                      {item.characters.map((c, i) => (
                        <span key={i} className="px-3 py-1 bg-white/5 border border-white/10 rounded-full text-xs text-slate-400">{c}</span>
                      ))}
                    </div>

                    {item.plotPoints.length > 0 && (
                      <div className="bg-black/20 p-4 rounded-2xl border border-white/5">
                        <h4 className="text-[10px] uppercase font-bold text-slate-500 mb-2">Сюжетные линии</h4>
                        <ul className="text-xs text-slate-400 list-disc list-inside space-y-1">
                          {item.plotPoints.map((p, i) => <li key={i}>{p}</li>)}
                        </ul>
                      </div>
                    )}

                    <div className="max-h-24 overflow-hidden relative">
                      <p className="text-sm text-slate-300 italic opacity-80 leading-relaxed line-clamp-3">{item.text}</p>
                      <div className="absolute bottom-0 inset-x-0 h-8 bg-gradient-to-t from-slate-900/90 to-transparent"></div>
                    </div>

                    <div className="flex gap-3 pt-2">
                      {item.audioBase64 && (
                        <button 
                          onClick={() => playHistoryAudio(item)}
                          className="flex-1 py-3 bg-purple-600/20 border border-purple-500/40 rounded-xl font-bold text-purple-300 hover:bg-purple-600/30 transition-all flex items-center justify-center gap-2"
                        >
                          🔊 Прослушать
                        </button>
                      )}
                      <button 
                        onClick={() => { setStory(item.text); setAppState(AppState.INPUT); setActiveTab('voiceover'); }}
                        className="flex-1 py-3 bg-white/5 border border-white/10 rounded-xl font-bold text-slate-300 hover:bg-white/10 transition-all flex items-center justify-center gap-2"
                      >
                        📖 Читать
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      <footer className="mt-8 text-slate-500 text-[10px] uppercase tracking-widest text-center opacity-60 relative z-10">
        Магия Gemini AI & Студия Волшебных Сказок v2.0
      </footer>
    </div>
  );
};

export default App;
