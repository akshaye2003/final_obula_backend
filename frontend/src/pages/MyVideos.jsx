import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { m, AnimatePresence } from 'framer-motion';
import LandingNav from '../components/LandingNav.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { supabase } from '../lib/supabase.js';

const EXPIRY_MS = 30 * 60 * 1000; // 30 minutes

function getExpiryInfo(createdAt) {
  const created = new Date(createdAt);
  const expiry = new Date(created.getTime() + EXPIRY_MS);
  const now = new Date();
  const remaining = expiry - now;
  const progress = Math.max(0, Math.min(100, (remaining / EXPIRY_MS) * 100));
  const isExpiringSoon = remaining > 0 && remaining < 5 * 60 * 1000;
  const isExpired = remaining <= 0;
  const expiryTimeStr = expiry.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  return { remaining, progress, isExpiringSoon, isExpired, expiryTimeStr };
}

function fmtSize(bytes) {
  if (!bytes) return null;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function DeleteModal({ title, onConfirm, onCancel, loading }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <m.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.15 }}
        className="bg-[#141414] border border-white/10 rounded-2xl p-6 w-full max-w-sm space-y-4"
      >
        <div>
          <h3 className="text-white font-semibold text-base">Delete clip?</h3>
          <p className="text-white/50 text-sm mt-1">
            "<span className="text-white/80">{title}</span>" will be permanently deleted and cannot be recovered.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl border border-white/10 text-white/60 hover:text-white hover:border-white/30 text-sm transition"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 py-2.5 rounded-xl bg-red-500/20 text-red-400 hover:bg-red-500/30 text-sm font-semibold transition disabled:opacity-50"
          >
            {loading ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </m.div>
    </div>
  );
}

function ExpiryBar({ createdAt }) {
  const [info, setInfo] = useState(() => getExpiryInfo(createdAt));

  useEffect(() => {
    const iv = setInterval(() => setInfo(getExpiryInfo(createdAt)), 30_000);
    return () => clearInterval(iv);
  }, [createdAt]);

  if (info.isExpired) return null;

  return (
    <div className="mt-2">
      <p className={`text-xs mb-1 ${info.isExpiringSoon ? 'text-amber-400' : 'text-white/30'}`}>
        {info.isExpiringSoon ? 'Expiring soon · ' : 'Saved · '}
        expires at {info.expiryTimeStr}
      </p>
      <div className="h-[2px] rounded-full bg-white/[0.06] overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-[30000ms] ease-linear ${info.isExpiringSoon ? 'bg-amber-400' : 'bg-primary'}`}
          style={{ width: `${info.progress}%` }}
        />
      </div>
    </div>
  );
}

function VideoCard({ video, onDelete, onRename, onDownloadAndDelete }) {
  const [videoUrl, setVideoUrl] = useState(null);
  const [loadingUrl, setLoadingUrl] = useState(true);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(video.title);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    supabase.storage
      .from('videos')
      .createSignedUrl(video.storage_path, 3600)
      .then(({ data }) => {
        setVideoUrl(data?.signedUrl ?? null);
        setLoadingUrl(false);
      });
  }, [video.storage_path]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const saveTitle = async () => {
    const trimmed = title.trim();
    if (!trimmed) { setTitle(video.title); setEditing(false); return; }
    if (trimmed === video.title) { setEditing(false); return; }
    setSaving(true);
    const { error } = await supabase.from('videos').update({ title: trimmed }).eq('id', video.id);
    if (!error) onRename(video.id, trimmed);
    else setTitle(video.title);
    setSaving(false);
    setEditing(false);
  };

  const handleDownload = () => {
    if (!videoUrl) return;
    const a = document.createElement('a');
    a.href = videoUrl;
    a.download = `${title}.mp4`;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Remove the card after download starts
    onDownloadAndDelete(video);
  };

  const handleConfirmDelete = async () => {
    setDeleting(true);
    await onDelete(video);
    setDeleting(false);
    setConfirmDelete(false);
  };

  return (
    <>
      <AnimatePresence>
        {confirmDelete && (
          <DeleteModal
            title={title}
            onConfirm={handleConfirmDelete}
            onCancel={() => setConfirmDelete(false)}
            loading={deleting}
          />
        )}
      </AnimatePresence>

      <m.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.2 }}
        className="rounded-2xl overflow-hidden border border-white/[0.08] bg-white/[0.03] flex flex-col group"
      >
        {/* Video thumbnail */}
        <div className="aspect-[9/16] bg-black flex items-center justify-center relative overflow-hidden">
          {loadingUrl ? (
            <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
          ) : videoUrl ? (
            <video src={videoUrl} controls playsInline className="w-full h-full object-contain" />
          ) : (
            <div className="flex flex-col items-center gap-2 text-white/30">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span className="text-xs">Preview unavailable</span>
            </div>
          )}
        </div>

        {/* Info + actions */}
        <div className="p-4 flex flex-col gap-3 flex-1">
          {/* Editable title */}
          <div>
            {editing ? (
              <div className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onBlur={saveTitle}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') { setTitle(video.title); setEditing(false); } }}
                  className="flex-1 bg-white/[0.08] border border-primary/50 rounded-lg px-2.5 py-1.5 text-white text-sm focus:outline-none focus:border-primary min-w-0"
                  maxLength={80}
                />
                {saving && <div className="animate-spin w-3.5 h-3.5 border border-primary border-t-transparent rounded-full flex-shrink-0" />}
              </div>
            ) : (
              <button
                onClick={() => setEditing(true)}
                className="group/title flex items-center gap-1.5 w-full text-left"
                title="Click to rename"
              >
                <span className="text-white font-medium text-sm truncate flex-1">{title}</span>
                <svg className="w-3 h-3 text-white/0 group-hover/title:text-white/40 transition flex-shrink-0" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M11.013 1.427a1.75 1.75 0 012.474 0l1.086 1.086a1.75 1.75 0 010 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 01-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61zm.176 4.823L9.75 4.81l-6.286 6.287a.253.253 0 00-.064.108l-.558 1.953 1.953-.558a.253.253 0 00.108-.064zm1.238-3.763a.25.25 0 00-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 000-.354z"/>
                </svg>
              </button>
            )}
            {/* Meta */}
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-white/40 text-xs">
                {new Date(video.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
              </span>
              {fmtSize(video.file_size) && (
                <span className="text-white/25 text-xs">· {fmtSize(video.file_size)}</span>
              )}
            </div>
            <ExpiryBar createdAt={video.created_at} />
          </div>

          {/* Actions */}
          <div className="flex gap-2 mt-auto">
            <button
              onClick={handleDownload}
              disabled={!videoUrl}
              className="flex-1 py-2 text-sm bg-primary text-white font-semibold rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-40 flex items-center justify-center gap-1.5"
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
                <path d="M7.47 10.78a.75.75 0 001.06 0l3.75-3.75a.75.75 0 00-1.06-1.06L8.75 8.44V1.75a.75.75 0 00-1.5 0v6.69L4.78 5.97a.75.75 0 00-1.06 1.06l3.75 3.75zM3.75 13a.75.75 0 000 1.5h8.5a.75.75 0 000-1.5h-8.5z"/>
              </svg>
              Download
            </button>
            <button
              onClick={() => setConfirmDelete(true)}
              className="px-3 py-2 text-sm text-white/40 border border-white/[0.08] rounded-lg hover:text-red-400 hover:border-red-400/30 hover:bg-red-400/5 transition-colors"
              title="Delete clip"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M11 1.75V3h2.25a.75.75 0 010 1.5H2.75a.75.75 0 010-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75zM6.5 1.75v1.25h3V1.75a.25.25 0 00-.25-.25h-2.5a.25.25 0 00-.25.25zM4.997 6.5a.75.75 0 10-1.5.056l.527 8.76A1.75 1.75 0 005.77 16.93h4.46a1.75 1.75 0 001.746-1.615l.527-8.76a.75.75 0 10-1.498-.056l-.527 8.76a.25.25 0 01-.25.231H5.77a.25.25 0 01-.249-.23l-.524-8.76z"/>
              </svg>
            </button>
          </div>
        </div>
      </m.div>
    </>
  );
}

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'name', label: 'Name A–Z' },
  { value: 'size', label: 'Largest' },
];

async function deleteVideo(video) {
  try {
    await supabase.storage.from('videos').remove([video.storage_path]);
  } catch (e) {
    console.error('Storage delete error:', e);
  }
  try {
    await supabase.from('videos').delete().eq('id', video.id);
  } catch (e) {
    console.error('DB delete error:', e);
  }
}

export default function MyVideos() {
  const { user } = useAuth();
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('newest');

  useEffect(() => {
    if (!user) return;
    loadVideos();
  }, [user]);

  // Every 30s, remove newly expired videos from state (and clean storage)
  useEffect(() => {
    const iv = setInterval(() => {
      setVideos((prev) => {
        const expired = prev.filter((v) => getExpiryInfo(v.created_at).isExpired);
        expired.forEach((v) => deleteVideo(v));
        return prev.filter((v) => !getExpiryInfo(v.created_at).isExpired);
      });
    }, 30_000);
    return () => clearInterval(iv);
  }, []);

  const loadVideos = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('videos')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      // Silently clean up any already-expired videos
      const expired = data.filter((v) => getExpiryInfo(v.created_at).isExpired);
      expired.forEach((v) => deleteVideo(v));
      setVideos(data.filter((v) => !getExpiryInfo(v.created_at).isExpired));
    }
    setLoading(false);
  };

  const handleDelete = async (video) => {
    await deleteVideo(video);
    setVideos((prev) => prev.filter((v) => v.id !== video.id));
  };

  // Called immediately after download starts — no confirmation needed
  const handleDownloadAndDelete = (video) => {
    deleteVideo(video);
    setVideos((prev) => prev.filter((v) => v.id !== video.id));
  };

  const handleRename = (id, newTitle) => {
    setVideos((prev) => prev.map((v) => v.id === id ? { ...v, title: newTitle } : v));
  };

  const totalBytes = videos.reduce((sum, v) => sum + (v.file_size ?? 0), 0);

  const filtered = videos
    .filter((v) => v.title.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sort === 'oldest') return new Date(a.created_at) - new Date(b.created_at);
      if (sort === 'name') return a.title.localeCompare(b.title);
      if (sort === 'size') return (b.file_size ?? 0) - (a.file_size ?? 0);
      return new Date(b.created_at) - new Date(a.created_at);
    });

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-body">
      <LandingNav />
      <main className="pt-24 pb-20 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto">

        {/* Header */}
        <m.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white font-display tracking-tight">My Videos</h1>
              {!loading && videos.length > 0 && (
                <p className="text-white/40 text-sm mt-1">
                  {videos.length} clip{videos.length !== 1 ? 's' : ''}
                  {totalBytes > 0 && <span> · {fmtSize(totalBytes)} total</span>}
                </p>
              )}
            </div>
            <Link
              to="/upload"
              className="px-5 py-2.5 bg-primary text-white font-semibold rounded-xl hover:bg-primary-dark transition-colors text-sm flex items-center gap-2"
            >
              <span>+</span> Create clip
            </Link>
          </div>

          {/* 30-min storage info banner */}
          {!loading && videos.length > 0 && (
            <div className="mt-4 flex items-start gap-2.5 px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.07]">
              <svg className="w-4 h-4 text-primary shrink-0 mt-0.5" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 0a8 8 0 110 16A8 8 0 018 0zm0 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zm0 3.25a.75.75 0 01.75.75v3.25h2a.75.75 0 010 1.5H7.25a.75.75 0 01-.75-.75V5.5a.75.75 0 01.75-.75z"/>
              </svg>
              <p className="text-white/45 text-xs leading-relaxed">
                Clips are auto-deleted after <span className="text-white/70 font-medium">30 minutes</span>. Download before they're gone.
              </p>
            </div>
          )}

          {/* Search + Sort */}
          {!loading && videos.length > 0 && (
            <div className="flex gap-3 mt-4 flex-wrap">
              <div className="relative flex-1 min-w-[180px]">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M10.68 11.74a6 6 0 01-7.922-8.982 6 6 0 018.982 7.922l3.04 3.04a.749.749 0 11-1.06 1.06l-3.04-3.04zm-5.44-1.19a4.5 4.5 0 100-9 4.5 4.5 0 000 9z"/>
                </svg>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search clips…"
                  className="w-full bg-white/[0.05] border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-white placeholder-white/30 focus:outline-none focus:border-primary text-sm transition"
                />
              </div>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                className="bg-white/[0.05] border border-white/10 rounded-xl px-4 py-2.5 text-white/70 text-sm focus:outline-none focus:border-primary transition appearance-none pr-8"
                style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 16 16'%3E%3Cpath fill='%23ffffff50' d='M4.427 7.427l3.396 3.396a.25.25 0 00.354 0l3.396-3.396A.25.25 0 0011.396 7H4.604a.25.25 0 00-.177.427z'/%3E%3C%2Fsvg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center' }}
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value} className="bg-[#1a1a1a]">{o.label}</option>
                ))}
              </select>
            </div>
          )}
        </m.div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        ) : videos.length === 0 ? (
          <div className="text-center py-24 space-y-3">
            <div className="w-16 h-16 rounded-2xl bg-white/[0.05] border border-white/[0.08] flex items-center justify-center mx-auto">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/30">
                <path d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <p className="text-white/60 text-lg font-medium">No clips yet</p>
            <p className="text-white/35 text-sm">Process a video and it'll appear here for 30 minutes so you can download it.</p>
            <Link
              to="/upload"
              className="inline-block mt-3 px-6 py-3 bg-primary text-white font-semibold rounded-xl hover:bg-primary-dark transition-colors"
            >
              Create your first clip
            </Link>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-white/40 text-sm">No clips match "<span className="text-white/60">{search}</span>"</p>
            <button onClick={() => setSearch('')} className="mt-3 text-primary text-sm hover:underline">Clear search</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            <AnimatePresence>
              {filtered.map((video) => (
                <VideoCard
                  key={video.id}
                  video={video}
                  onDelete={handleDelete}
                  onRename={handleRename}
                  onDownloadAndDelete={handleDownloadAndDelete}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </main>
    </div>
  );
}
