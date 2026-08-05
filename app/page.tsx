'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { QRCodeSVG } from 'qrcode.react';
import {
  BarChart3, Settings, LayoutGrid, UtensilsCrossed, ClipboardList, Users, QrCode,
  LogOut, Loader2, Plus, Trash2, CheckCircle2, XCircle, Download, Eye, EyeOff,
  ChefHat, Zap, Clock, X, DollarSign, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, Store, AlertCircle, Hash,
  Volume2, UserPlus, Edit3, Bell, Printer, BellRing, DownloadCloud, Star
} from 'lucide-react';

// ─── TYPES ──────────────────────────────────────────────────────────────────
type Tab = 'dashboard' | 'ayarlar' | 'kategoriler' | 'urunler' | 'siparisler' | 'personel' | 'qr';
type Role = 'owner' | 'admin' | 'mudur' | 'kasa' | 'personel';
type Notification = { type: 'success' | 'error'; text: string } | null;

interface Restoran { id: string; user_id: string; ad: string; slug: string; logo_url?: string | null; tema?: string; siparis_pin?: string | null; google_maps_url?: string | null; personel_sifre?: string | null; gps_aktif?: boolean; enlem?: number | null; boylam?: number | null; gps_yaricap?: number; }
interface Kategori { id: string; restoran_id: string; ad: string; ad_ar?: string | null }
interface Urun { id: string; kategori_id: string; ad: string; fiyat: number; aciklama: string | null; resim_url: string | null; stok?: number | null; ad_en?: string | null; aciklama_en?: string | null; ad_ar?: string | null; aciklama_ar?: string | null; onerilen_urun_id?: string | null }
interface Personel { id: string; user_id: string; restoran_id: string; rol: string; ad?: string; email?: string }

// ─── TAB CONFIG ─────────────────────────────────────────────────────────────
const ALL_TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: BarChart3 },
  { key: 'ayarlar', label: 'Ayarlar', icon: Settings },
  { key: 'kategoriler', label: 'Kategoriler', icon: LayoutGrid },
  { key: 'urunler', label: 'Ürünler', icon: UtensilsCrossed },
  { key: 'siparisler', label: 'Siparişler', icon: ClipboardList },
  { key: 'personel', label: 'Personel', icon: Users },
  { key: 'qr', label: 'QR Kod', icon: QrCode },
];

const ROLE_TABS: Record<Role, Tab[]> = {
  owner: ['dashboard', 'ayarlar', 'kategoriler', 'urunler', 'siparisler', 'personel', 'qr'],
  admin: ['dashboard', 'ayarlar', 'kategoriler', 'urunler', 'siparisler', 'personel', 'qr'],
  mudur: ['dashboard', 'urunler', 'siparisler'],
  kasa: ['siparisler'],
  personel: ['siparisler'],
};

const ROLE_LABEL: Record<Role, string> = {
  owner: 'Restoran Sahibi',
  admin: 'Admin',
  mudur: 'Müdür',
  kasa: 'Kasa',
  personel: 'Personel',
};

const slugify = (text: string): string => {
  const map: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', Ç: 'c', Ğ: 'g', İ: 'i', Ö: 'o', Ş: 's', Ü: 'u' };
  return text.toLowerCase().replace(/[çğıöşüÇĞİÖŞÜ]/g, (c) => map[c] || c).replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').replace(/-+/g, '-');
};

const timeAgo = (date: string): string => {
  const diff = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (diff < 60) return 'Az önce';
  if (diff < 3600) return `${Math.floor(diff / 60)} dk önce`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} saat önce`;
  return `${Math.floor(diff / 86400)} gün önce`;
};

const playNotificationSound = () => {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 800;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.5);
    // İkinci bip
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.frequency.value = 1000;
    osc2.type = 'sine';
    gain2.gain.setValueAtTime(0.3, ctx.currentTime + 0.2);
    gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.7);
    osc2.start(ctx.currentTime + 0.2);
    osc2.stop(ctx.currentTime + 0.7);
  } catch { /* ses çalamazsa sessiz devam */ }
};

// ─── MAIN APP ───────────────────────────────────────────────────────────────
export default function App() {
  const [authState, setAuthState] = useState<'loading' | 'login' | 'ready'>('loading');
  const [userId, setUserId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<Role>('owner');
  const [restoranId, setRestoranId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [notification, setNotification] = useState<Notification>(null);
  const [garsonCagrilar, setGarsonCagrilar] = useState<any[]>([]);
  const [cagriModalAcik, setCagriModalAcik] = useState(false);

  // Restoran state
  const [restoran, setRestoran] = useState<Restoran | null>(null);
  const [restoranAdi, setRestoranAdi] = useState('');
  const [restoranSlug, setRestoranSlug] = useState('');
  const [seciliTema, setSeciliTema] = useState('dark');
  const [siparisPin, setSiparisPin] = useState('');
  const [googleMapsUrl, setGoogleMapsUrl] = useState('');
  const [personelSifre, setPersonelSifre] = useState('');
  const [gpsAktif, setGpsAktif] = useState(false);
  const [enlem, setEnlem] = useState<number | null>(null);
  const [boylam, setBoylam] = useState<number | null>(null);
  const [gpsYaricap, setGpsYaricap] = useState(100);
  const [savingRestoran, setSavingRestoran] = useState(false);
  const [sesAcik, setSesAcik] = useState(true);

  // Kategori state
  const [kategoriler, setKategoriler] = useState<Kategori[]>([]);
  const [yeniKategoriAdi, setYeniKategoriAdi] = useState('');
  const [yeniKategoriAdiAr, setYeniKategoriAdiAr] = useState('');
  const [kategoriEkleniyor, setKategoriEkleniyor] = useState(false);

  // Ürün state
  const [urunler, setUrunler] = useState<Urun[]>([]);
  const [seciliKategoriId, setSeciliKategoriId] = useState('');
  const [yeniUrun, setYeniUrun] = useState({ ad: '', fiyat: '', aciklama: '', resim_url: '', stok: '', ad_en: '', aciklama_en: '', ad_ar: '', aciklama_ar: '', onerilen_urun_id: '' });
  const [urunEkleniyor, setUrunEkleniyor] = useState(false);

  // Personel state
  const [personelListesi, setPersonelListesi] = useState<Personel[]>([]);

  // QR state
  const [masaSayisi, setMasaSayisi] = useState(10);

  const [dataLoading, setDataLoading] = useState(true);

  const showNotification = (type: 'success' | 'error', text: string) => {
    setNotification({ type, text });
    setTimeout(() => setNotification(null), 4000);
  };

  // ─── AUTH ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const checkAuth = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session) {
        setAuthState('login');
        return;
      }

      const uid = data.session.user.id;
      setUserId(uid);

      const { data: p } = await supabase.from('personel').select('*').eq('user_id', uid).maybeSingle();

      if (p?.rol) {
        const roleMap: Record<string, Role> = { admin: 'admin', mudur: 'mudur', kasa: 'kasa', personel: 'personel', garson: 'personel' };
        setUserRole(roleMap[p.rol] || 'owner');
        if (p.restoran_id) setRestoranId(p.restoran_id);
      } else {
        setUserRole('owner');
      }

      setAuthState('ready');
    };
    checkAuth();
  }, []);

  // Set default tab based on role
  useEffect(() => {
    if (authState === 'ready') {
      const tabs = ROLE_TABS[userRole];
      setActiveTab(tabs[0]);
    }
  }, [authState, userRole]);

  // ─── DATA FETCH ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (authState !== 'ready' || !userId) return;

    const loadData = async () => {
      setDataLoading(true);
      let r: Restoran | null = null;

      // Restoran bul
      if (restoranId) {
        const { data } = await supabase.from('restoranlar').select('*').eq('id', restoranId).maybeSingle();
        r = data as Restoran | null;
      }
      if (!r) {
        const { data } = await supabase.from('restoranlar').select('*').eq('user_id', userId).maybeSingle();
        r = data as Restoran | null;
      }

      if (r) {
        setRestoran(r);
        setRestoranAdi(r.ad);
        setRestoranSlug(r.slug);
        setSeciliTema(r.tema || 'dark');
        setSiparisPin(r.siparis_pin || '');
        setGoogleMapsUrl(r.google_maps_url || '');
        setPersonelSifre(r.personel_sifre || '');
        setGpsAktif(r.gps_aktif || false);
        setEnlem(r.enlem || null);
        setBoylam(r.boylam || null);
        setGpsYaricap(r.gps_yaricap || 100);

        const { data: katData } = await supabase.from('kategoriler').select('*').eq('restoran_id', r.id).order('ad');
        if (katData) {
          setKategoriler(katData as Kategori[]);
          if (katData.length > 0 && !seciliKategoriId) setSeciliKategoriId(katData[0].id);
        }

        const { data: urunData } = await supabase.from('urunler').select('*').in('kategori_id', (katData || []).map((k) => k.id)).order('ad');
        if (urunData) setUrunler(urunData as Urun[]);

        // Personel listesi (owner/admin)
        if (userRole === 'owner' || userRole === 'admin') {
          const { data: pData } = await supabase.from('personel').select('*').eq('restoran_id', r.id);
          if (pData) setPersonelListesi(pData as Personel[]);
        }

        // Garson Çağrı (Kasa hariç)
        if (userRole !== 'kasa') {
          const { data: cagriData } = await supabase.from('garson_cagri').select('*').eq('restoran_id', r.id).eq('durum', 'bekliyor').order('created_at', { ascending: false });
          if (cagriData) setGarsonCagrilar(cagriData);
        }
      }
      setDataLoading(false);
    };

    loadData();

    // Realtime Garson Cagri
    const rid = restoranId || (restoran ? restoran.id : null);
    let ch: any = null;
    if (rid && userRole !== 'kasa') {
      ch = supabase.channel('cagri-canli').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'garson_cagri', filter: `restoran_id=eq.${rid}` }, (payload) => {
        if (payload.new.durum === 'bekliyor') {
          setGarsonCagrilar((prev) => [payload.new, ...prev]);
          if (sesAcik) playNotificationSound();
          showNotification('success', `Masa ${payload.new.masa_no} garson çağırıyor!`);
        }
      }).subscribe();
    }
    return () => { if (ch) ch.unsubscribe(); };
  }, [authState, userId, restoranId, userRole, restoran?.id, sesAcik]);

  // ─── HANDLERS ────────────────────────────────────────────────────────────
  const handleCagriGoruldu = async (id: string) => {
    try {
      await supabase.from('garson_cagri').update({ durum: 'goruldu' }).eq('id', id);
      setGarsonCagrilar((prev) => prev.filter(c => c.id !== id));
    } catch (err) {}
  };

  const handleRestoranKaydet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;
    setSavingRestoran(true);
    try {
      const payload = {
        ad: restoranAdi, slug: restoranSlug, tema: seciliTema, siparis_pin: siparisPin || null,
        google_maps_url: googleMapsUrl || null, personel_sifre: personelSifre || null,
        gps_aktif: gpsAktif, enlem: enlem, boylam: boylam, gps_yaricap: gpsYaricap
      };

      if (restoran) {
        const { error } = await supabase.from('restoranlar').update(payload).eq('id', restoran.id);
        if (error) throw error;
        setRestoran({ ...restoran, ...payload });
        showNotification('success', 'Restoran bilgileri güncellendi.');
      } else {
        const { data, error } = await supabase.from('restoranlar').insert({ user_id: userId, ...payload }).select().single();
        if (error) throw error;
        setRestoran(data as Restoran);
        showNotification('success', 'Restoran oluşturuldu.');
      }
    } catch (err: any) { showNotification('error', err.message); }
    finally { setSavingRestoran(false); }
  };

  const handleKategoriEkle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restoran || !yeniKategoriAdi.trim()) return;
    setKategoriEkleniyor(true);
    try {
      const { data, error } = await supabase.from('kategoriler').insert({ restoran_id: restoran.id, ad: yeniKategoriAdi.trim(), ad_ar: yeniKategoriAdiAr.trim() || null }).select().single();
      if (error) throw error;
      setKategoriler((prev) => [...prev, data as Kategori]);
      setYeniKategoriAdi('');
      setYeniKategoriAdiAr('');
      showNotification('success', 'Kategori eklendi.');
    } catch (err: any) { showNotification('error', err.message); }
    finally { setKategoriEkleniyor(false); }
  };

  const handleKategoriSil = async (id: string) => {
    try {
      await supabase.from('kategoriler').delete().eq('id', id);
      setKategoriler((prev) => prev.filter((k) => k.id !== id));
      showNotification('success', 'Kategori silindi.');
    } catch (err: any) { showNotification('error', err.message); }
  };

  const handleUrunEkle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!seciliKategoriId || !yeniUrun.ad.trim() || !yeniUrun.fiyat) {
      showNotification('error', 'Ürün adı ve fiyat zorunludur.');
      return;
    }
    setUrunEkleniyor(true);
    try {
      const { data, error } = await supabase.from('urunler').insert({
        kategori_id: seciliKategoriId,
        ad: yeniUrun.ad.trim(),
        fiyat: parseFloat(yeniUrun.fiyat),
        aciklama: yeniUrun.aciklama.trim() || null,
        resim_url: yeniUrun.resim_url.trim() || null,
        stok: yeniUrun.stok ? parseInt(yeniUrun.stok) : null,
        ad_en: yeniUrun.ad_en.trim() || null,
        aciklama_en: yeniUrun.aciklama_en.trim() || null,
        ad_ar: yeniUrun.ad_ar.trim() || null,
        aciklama_ar: yeniUrun.aciklama_ar.trim() || null,
        onerilen_urun_id: yeniUrun.onerilen_urun_id || null,
      }).select().single();
      if (error) throw error;
      setUrunler((prev) => [...prev, data as Urun]);
      setYeniUrun({ ad: '', fiyat: '', aciklama: '', resim_url: '', stok: '', ad_en: '', aciklama_en: '', ad_ar: '', aciklama_ar: '', onerilen_urun_id: '' });
      showNotification('success', 'Ürün eklendi.');
    } catch (err: any) { showNotification('error', err.message); }
    finally { setUrunEkleniyor(false); }
  };

  const handleUrunSil = async (id: string) => {
    try {
      await supabase.from('urunler').delete().eq('id', id);
      setUrunler((prev) => prev.filter((u) => u.id !== id));
      showNotification('success', 'Ürün silindi.');
    } catch (err: any) { showNotification('error', err.message); }
  };

  const handlePersonelSil = async (id: string) => {
    try {
      await supabase.from('personel').delete().eq('id', id);
      setPersonelListesi((prev) => prev.filter((p) => p.id !== id));
      showNotification('success', 'Personel silindi.');
    } catch (err: any) { showNotification('error', err.message); }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.reload();
  };

  const qrValue = restoran
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/menu/${restoran.slug || restoran.id}`
    : '';

  const handleQrIndir = () => {
    const svg = document.getElementById('qr-svg');
    if (!svg) return;
    const source = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${restoran?.slug || 'menu'}-qr.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleTumunuIndir = () => {
    for (let i = 1; i <= masaSayisi; i++) {
      setTimeout(() => {
        const svg = document.getElementById(`qr-svg-masa-${i}`);
        if (!svg) return;
        const source = new XMLSerializer().serializeToString(svg);
        const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${restoran?.slug || 'menu'}-masa-${i}-qr.svg`;
        a.click();
        URL.revokeObjectURL(url);
      }, i * 200);
    }
  };

  // ─── RENDER ──────────────────────────────────────────────────────────────
  if (authState === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
      </div>
    );
  }

  if (authState === 'login') {
    return <LoginForm onSuccess={() => window.location.reload()} />;
  }

  const visibleTabs = ALL_TABS.filter((t) => ROLE_TABS[userRole].includes(t.key));

  return (
    <div className="flex min-h-screen bg-neutral-950">
      {/* ─── SIDEBAR ─── */}
      <aside className="fixed hidden h-screen w-64 flex-col border-r border-white/10 bg-neutral-900/60 backdrop-blur-xl lg:flex z-30">
        <div className="px-6 py-6 relative">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 font-bold text-neutral-950 shadow-lg shadow-emerald-500/30">
                <ChefHat className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-white truncate">{restoran?.ad || 'QRMenu'}</h2>
                <p className="text-[10px] text-emerald-400 font-medium uppercase tracking-wider">{ROLE_LABEL[userRole]}</p>
              </div>
            </div>
            {restoran && userRole !== 'kasa' && (
              <div className="relative">
                <button onClick={() => setCagriModalAcik(!cagriModalAcik)} className={`p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-all ${garsonCagrilar.length > 0 ? 'text-amber-400' : 'text-neutral-400'}`}>
                  {garsonCagrilar.length > 0 ? <BellRing className="h-5 w-5 animate-pulse" /> : <Bell className="h-5 w-5" />}
                </button>
                {garsonCagrilar.length > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
                    {garsonCagrilar.length}
                  </span>
                )}
              </div>
            )}
          </div>
          {cagriModalAcik && (
            <div className="absolute top-20 left-6 w-56 rounded-xl border border-white/10 bg-neutral-900 p-2 shadow-2xl z-50">
              <h3 className="text-xs font-bold text-neutral-400 px-2 py-1 mb-1 border-b border-white/10">Bekleyen Çağrılar</h3>
              {garsonCagrilar.length === 0 ? (
                <p className="text-xs text-neutral-500 px-2 py-2">Çağrı yok</p>
              ) : (
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {garsonCagrilar.map(c => (
                    <div key={c.id} className="flex items-center justify-between px-2 py-2 hover:bg-white/5 rounded-lg border border-white/5 bg-white/5">
                      <div>
                        <p className="text-sm font-bold text-amber-400">Masa {c.masa_no}</p>
                        <p className="text-[10px] text-neutral-500">{timeAgo(c.created_at)}</p>
                      </div>
                      <button onClick={() => handleCagriGoruldu(c.id)} className="text-[10px] font-bold text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 px-2 py-1 rounded">Görüldü</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <nav className="flex-1 space-y-1 px-3 overflow-y-auto">
          {visibleTabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.key;
            return (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all ${active ? 'bg-emerald-500/10 text-emerald-300' : 'text-neutral-400 hover:bg-white/5 hover:text-white'}`}>
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>

        <div className="border-t border-white/10 p-3">
          <button onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-red-400 hover:bg-red-500/10 transition-all">
            <LogOut className="h-4 w-4" />
            Çıkış Yap
          </button>
        </div>
      </aside>

      {/* ─── MOBİL TAB BAR ─── */}
      <div className="fixed bottom-0 left-0 right-0 z-20 flex border-t border-white/10 bg-neutral-900/90 backdrop-blur-xl lg:hidden">
        {visibleTabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`flex flex-1 flex-col items-center gap-1 py-3 text-[10px] font-medium ${activeTab === tab.key ? 'text-emerald-300' : 'text-neutral-500'}`}>
              <Icon className="h-4 w-4" />
              {tab.label.split(' ')[0]}
            </button>
          );
        })}
        <button onClick={handleLogout} className="flex flex-col items-center gap-1 py-3 text-[10px] font-medium text-red-400 px-3">
          <LogOut className="h-4 w-4" />
          Çıkış
        </button>
      </div>

      {/* ─── CONTENT ─── */}
      <main className="flex-1 px-5 py-8 pb-24 lg:ml-64 lg:px-12 lg:py-10 lg:pb-10">
        {/* Bildirim */}
        {notification && (
          <div className={`mb-6 flex items-center gap-3 rounded-xl border px-4 py-3 text-sm ${notification.type === 'success' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-red-500/30 bg-red-500/10 text-red-300'}`}>
            {notification.type === 'success' ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <XCircle className="h-4 w-4 shrink-0" />}
            {notification.text}
          </div>
        )}

        {dataLoading ? (
          <div className="flex items-center gap-3 text-neutral-400"><Loader2 className="h-5 w-5 animate-spin text-emerald-400" /> Yükleniyor...</div>
        ) : (
          <>
            {/* DASHBOARD */}
            {activeTab === 'dashboard' && restoran && <DashboardStats restoranId={restoran.id} />}

            {/* AYARLAR */}
            {activeTab === 'ayarlar' && (
              <section className="max-w-2xl">
                <h1 className="text-2xl font-bold text-white">Restoran Ayarları</h1>
                <p className="mt-1 text-sm text-neutral-400">Restoranınızın temel bilgilerini buradan yönetin.</p>
                <form onSubmit={handleRestoranKaydet} className="mt-8 space-y-5 rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-neutral-300">Restoran Adı</label>
                    <input type="text" required value={restoranAdi} onChange={(e) => { setRestoranAdi(e.target.value); if (!restoran) setRestoranSlug(slugify(e.target.value)); }}
                      placeholder="Örn: Lezzet Durağı" className="w-full rounded-xl border border-white/10 bg-neutral-950 px-4 py-3 text-sm text-white placeholder-neutral-600 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20" />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-neutral-300">Menü URL (Slug)</label>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-neutral-500 shrink-0">/menu/</span>
                      <input type="text" required value={restoranSlug} onChange={(e) => setRestoranSlug(e.target.value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''))}
                        placeholder="lezzet-duragi" className="flex-1 rounded-xl border border-white/10 bg-neutral-950 px-4 py-3 text-sm text-white placeholder-neutral-600 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20" />
                      {restoranAdi && <button type="button" onClick={() => setRestoranSlug(slugify(restoranAdi))} className="shrink-0 rounded-lg bg-emerald-600/20 border border-emerald-500/30 px-3 py-2 text-xs font-medium text-emerald-300 hover:bg-emerald-600/30">Otomatik</button>}
                    </div>
                    {restoranSlug && <p className="mt-1.5 text-xs text-neutral-500">QR URL: <span className="text-emerald-400 font-mono">{typeof window !== 'undefined' ? window.location.origin : ''}/menu/{restoranSlug}</span></p>}
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-neutral-300">Sipariş PIN Kodu <span className="text-neutral-500 text-xs">(Müşteri siparişi onaylamak için bu kodu girmelidir)</span></label>
                    <input type="text" maxLength={4} value={siparisPin} onChange={(e) => setSiparisPin(e.target.value)}
                      placeholder="Boş bırakırsanız PIN sorulmaz (Örn: 1453)" className="w-full rounded-xl border border-white/10 bg-neutral-950 px-4 py-3 text-sm text-white placeholder-neutral-600 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20" />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-neutral-300">Personel Paneli Şifresi <span className="text-neutral-500 text-xs">(Garsonların kendi cihazından girmesi için)</span></label>
                    <input type="text" value={personelSifre} onChange={(e) => setPersonelSifre(e.target.value)}
                      placeholder="Örn: gs123" className="w-full rounded-xl border border-white/10 bg-neutral-950 px-4 py-3 text-sm text-white placeholder-neutral-600 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20" />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-neutral-300">Google Haritalar İşletme Linki <span className="text-neutral-500 text-xs">(4-5 yıldız veren müşteriler buraya yönlendirilir)</span></label>
                    <input type="url" value={googleMapsUrl} onChange={(e) => setGoogleMapsUrl(e.target.value)}
                      placeholder="https://g.page/r/..." className="w-full rounded-xl border border-white/10 bg-neutral-950 px-4 py-3 text-sm text-white placeholder-neutral-600 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20" />
                  </div>
                  
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-medium text-white">Akıllı GPS Konum Koruması</h3>
                        <p className="text-xs text-neutral-400 mt-1">Müşteriler sadece restorandayken sipariş verebilir.</p>
                      </div>
                      <label className="relative inline-flex cursor-pointer items-center">
                        <input type="checkbox" checked={gpsAktif} onChange={(e) => setGpsAktif(e.target.checked)} className="peer sr-only" />
                        <div className="h-6 w-11 rounded-full bg-neutral-700 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-emerald-500 peer-checked:after:translate-x-full peer-checked:after:border-white"></div>
                      </label>
                    </div>
                    {gpsAktif && (
                      <div className="space-y-4 pt-4 border-t border-white/10">
                        <div className="flex flex-col sm:flex-row gap-4 items-end">
                          <div className="flex-1">
                            <label className="mb-1.5 block text-xs font-medium text-neutral-300">Restoran Enlem (Latitude)</label>
                            <input type="number" step="any" value={enlem || ''} onChange={(e) => setEnlem(parseFloat(e.target.value))} className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm text-white" />
                          </div>
                          <div className="flex-1">
                            <label className="mb-1.5 block text-xs font-medium text-neutral-300">Restoran Boylam (Longitude)</label>
                            <input type="number" step="any" value={boylam || ''} onChange={(e) => setBoylam(parseFloat(e.target.value))} className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm text-white" />
                          </div>
                          <button type="button" onClick={() => {
                            if (!navigator.geolocation) { alert('Tarayıcınız konumu desteklemiyor.'); return; }
                            navigator.geolocation.getCurrentPosition((pos) => { setEnlem(pos.coords.latitude); setBoylam(pos.coords.longitude); alert('Konum alındı!'); }, () => alert('Konum izni reddedildi.'));
                          }} className="rounded-lg bg-blue-600/20 border border-blue-500/30 px-4 py-2 text-sm text-blue-300 hover:bg-blue-600/30">Mevcut Konumumu Al</button>
                        </div>
                        <div>
                          <label className="mb-1.5 block text-xs font-medium text-neutral-300">İzin Verilen Maksimum Çap (Metre)</label>
                          <input type="number" value={gpsYaricap} onChange={(e) => setGpsYaricap(parseInt(e.target.value))} className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm text-white" />
                        </div>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-neutral-300">Müşteri Menüsü Teması</label>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { id: 'dark', name: 'Karanlık (Modern)', bg: 'bg-neutral-950', border: 'border-neutral-800', text: 'text-white' },
                        { id: 'light', name: 'Aydınlık (Ferah)', bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-900' },
                        { id: 'classic', name: 'Klasik (Sade)', bg: 'bg-stone-100', border: 'border-stone-300', text: 'text-stone-800' },
                        { id: 'modern', name: 'Modern (Renkli)', bg: 'bg-gradient-to-br from-indigo-950 to-purple-900', border: 'border-indigo-500/30', text: 'text-white' },
                      ].map(tema => (
                        <div key={tema.id} onClick={() => setSeciliTema(tema.id)} className={`cursor-pointer rounded-xl border-2 p-3 transition-all ${seciliTema === tema.id ? 'border-emerald-500 bg-emerald-500/10' : 'border-transparent bg-white/5 hover:bg-white/10'}`}>
                          <div className={`h-12 w-full rounded-lg border ${tema.border} ${tema.bg} flex items-center justify-center`}>
                            <span className={`text-[10px] font-bold ${tema.text}`}>Önizleme</span>
                          </div>
                          <p className="mt-2 text-center text-xs font-medium text-neutral-300">{tema.name}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <button type="submit" disabled={savingRestoran}
                    className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-400 to-emerald-600 px-6 py-3 text-sm font-semibold text-neutral-950 shadow-lg shadow-emerald-500/30 hover:brightness-110 disabled:opacity-50">
                    {savingRestoran ? <><Loader2 className="h-4 w-4 animate-spin" /> Kaydediliyor...</> : 'Kaydet'}
                  </button>
                </form>
              </section>
            )}

            {/* KATEGORİLER */}
            {activeTab === 'kategoriler' && (
              <section className="max-w-2xl">
                <h1 className="text-2xl font-bold text-white">Kategoriler</h1>
                <p className="mt-1 text-sm text-neutral-400">Menü kategorilerini yönetin.</p>
                {!restoran && <div className="mt-6 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 flex items-center gap-3"><AlertCircle className="h-5 w-5 text-amber-400 shrink-0" /><p className="text-sm text-amber-200">Önce Ayarlar bölümünden restoranınızı kaydedin.</p></div>}
                <form onSubmit={handleKategoriEkle} className="mt-6 flex flex-col sm:flex-row gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                  <input type="text" value={yeniKategoriAdi} onChange={(e) => setYeniKategoriAdi(e.target.value)} placeholder="Yeni kategori..."
                    className="flex-1 rounded-xl border border-white/10 bg-neutral-950 px-4 py-3 text-sm text-white placeholder-neutral-600 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20" />
                  <input type="text" value={yeniKategoriAdiAr} onChange={(e) => setYeniKategoriAdiAr(e.target.value)} placeholder="Arapça isim (opsiyonel)"
                    className="flex-1 rounded-xl border border-white/10 bg-neutral-950 px-4 py-3 text-sm text-white placeholder-neutral-600 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20" dir="auto" />
                  <button type="submit" disabled={kategoriEkleniyor || !restoran}
                    className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-neutral-950 hover:bg-emerald-700 disabled:opacity-50">
                    {kategoriEkleniyor ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Ekle
                  </button>
                </form>
                <div className="mt-4 space-y-2">
                  {kategoriler.map((k) => (
                    <div key={k.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3 hover:bg-white/10 transition-all">
                      <span className="text-sm text-white">{k.ad}</span>
                      <button onClick={() => handleKategoriSil(k.id)} className="text-neutral-500 hover:text-red-400 transition-colors"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  ))}
                  {kategoriler.length === 0 && <p className="text-sm text-neutral-500">Henüz kategori eklenmedi.</p>}
                </div>
              </section>
            )}

            {/* ÜRÜNLER */}
            {activeTab === 'urunler' && (
              <section className="max-w-3xl">
                <h1 className="text-2xl font-bold text-white">Ürünler</h1>
                <p className="mt-1 text-sm text-neutral-400">Menü ürünlerini ekleyin ve yönetin.</p>
                {kategoriler.length === 0 ? (
                  <div className="mt-6 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 flex items-center gap-3"><AlertCircle className="h-5 w-5 text-amber-400 shrink-0" /><p className="text-sm text-amber-200">Ürün eklemek için önce kategori oluşturun.</p></div>
                ) : (
                  <form onSubmit={handleUrunEkle} className="mt-6 space-y-4 rounded-2xl border border-white/10 bg-white/5 p-6">
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-neutral-300">Kategori</label>
                      <select value={seciliKategoriId} onChange={(e) => setSeciliKategoriId(e.target.value)}
                        className="w-full rounded-xl border border-white/10 bg-neutral-950 px-4 py-3 text-sm text-white outline-none focus:border-emerald-400">
                        {kategoriler.map((k) => <option key={k.id} value={k.id}>{k.ad}</option>)}
                      </select>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-neutral-300">Ürün Adı</label>
                        <input type="text" required value={yeniUrun.ad} onChange={(e) => setYeniUrun({ ...yeniUrun, ad: e.target.value })} placeholder="Izgara Köfte"
                          className="w-full rounded-xl border border-white/10 bg-neutral-950 px-4 py-3 text-sm text-white placeholder-neutral-600 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20" />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-neutral-300">İngilizce Ad <span className="text-neutral-600">(opsiyonel)</span></label>
                        <input type="text" value={yeniUrun.ad_en} onChange={(e) => setYeniUrun({ ...yeniUrun, ad_en: e.target.value })} placeholder="Grilled Meatballs"
                          className="w-full rounded-xl border border-white/10 bg-neutral-950 px-4 py-3 text-sm text-white placeholder-neutral-600 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20" />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-neutral-300">Arapça Ad <span className="text-neutral-600">(opsiyonel)</span></label>
                        <input type="text" value={yeniUrun.ad_ar} onChange={(e) => setYeniUrun({ ...yeniUrun, ad_ar: e.target.value })} placeholder="الاسم بالعربية"
                          className="w-full rounded-xl border border-white/10 bg-neutral-950 px-4 py-3 text-sm text-white placeholder-neutral-600 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20" dir="auto" />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-neutral-300">Stok Adedi <span className="text-neutral-600">(opsiyonel)</span></label>
                        <input type="number" value={yeniUrun.stok} onChange={(e) => setYeniUrun({ ...yeniUrun, stok: e.target.value })} placeholder="Sınırsız"
                          className="w-full rounded-xl border border-white/10 bg-neutral-950 px-4 py-3 text-sm text-white placeholder-neutral-600 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20" />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-neutral-300">Fiyat (₺)</label>
                        <input type="number" step="0.01" required value={yeniUrun.fiyat} onChange={(e) => setYeniUrun({ ...yeniUrun, fiyat: e.target.value })} placeholder="150"
                          className="w-full rounded-xl border border-white/10 bg-neutral-950 px-4 py-3 text-sm text-white placeholder-neutral-600 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20" />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-neutral-300">Stok Adedi <span className="text-neutral-600">(opsiyonel)</span></label>
                        <input type="number" value={yeniUrun.stok} onChange={(e) => setYeniUrun({ ...yeniUrun, stok: e.target.value })} placeholder="Sınırsız"
                          className="w-full rounded-xl border border-white/10 bg-neutral-950 px-4 py-3 text-sm text-white placeholder-neutral-600 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20" />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-neutral-300">Açıklama <span className="text-neutral-600">(opsiyonel)</span></label>
                        <textarea value={yeniUrun.aciklama} onChange={(e) => setYeniUrun({ ...yeniUrun, aciklama: e.target.value })} placeholder="Ürün açıklaması..." rows={2}
                          className="w-full rounded-xl border border-white/10 bg-neutral-950 px-4 py-3 text-sm text-white placeholder-neutral-600 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20" />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-neutral-300">İngilizce Açıklama <span className="text-neutral-600">(opsiyonel)</span></label>
                        <textarea value={yeniUrun.aciklama_en} onChange={(e) => setYeniUrun({ ...yeniUrun, aciklama_en: e.target.value })} placeholder="Product description..." rows={2}
                          className="w-full rounded-xl border border-white/10 bg-neutral-950 px-4 py-3 text-sm text-white placeholder-neutral-600 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20" />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-neutral-300">Arapça Açıklama <span className="text-neutral-600">(opsiyonel)</span></label>
                        <textarea value={yeniUrun.aciklama_ar} onChange={(e) => setYeniUrun({ ...yeniUrun, aciklama_ar: e.target.value })} placeholder="الوصف بالعربية..." rows={2}
                          className="w-full rounded-xl border border-white/10 bg-neutral-950 px-4 py-3 text-sm text-white placeholder-neutral-600 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20" dir="auto" />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-neutral-300">Görsel URL <span className="text-neutral-600">(opsiyonel)</span></label>
                        <input type="text" value={yeniUrun.resim_url} onChange={(e) => setYeniUrun({ ...yeniUrun, resim_url: e.target.value })} placeholder="https://..."
                          className="w-full rounded-xl border border-white/10 bg-neutral-950 px-4 py-3 text-sm text-white placeholder-neutral-600 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20" />
                      </div>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-neutral-300">Önerilen Ürün (Çapraz Satış) <span className="text-neutral-600">(opsiyonel)</span></label>
                      <select value={yeniUrun.onerilen_urun_id} onChange={(e) => setYeniUrun({ ...yeniUrun, onerilen_urun_id: e.target.value })}
                        className="w-full rounded-xl border border-white/10 bg-neutral-950 px-4 py-3 text-sm text-white outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20">
                        <option value="">-- Önerilen Ürün Seçin --</option>
                        {urunler.map(u => (
                          <option key={u.id} value={u.id}>{u.ad} (₺{u.fiyat})</option>
                        ))}
                      </select>
                      <p className="mt-1 text-xs text-neutral-500">Müşteri bu ürünü sepete eklerken seçtiğiniz bu ürünü de almak isteyip istemediği sorulur.</p>
                    </div>
                    <button type="submit" disabled={urunEkleniyor}
                      className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-400 to-emerald-600 py-3 text-sm font-semibold text-neutral-950 shadow-lg shadow-emerald-500/30 hover:brightness-110 disabled:opacity-50">
                      {urunEkleniyor ? <><Loader2 className="h-4 w-4 animate-spin" /> Ekleniyor...</> : <><Plus className="h-4 w-4" /> Ürün Ekle</>}
                    </button>
                  </form>
                )}
                <div className="mt-6 space-y-2">
                  {urunler.map((u) => {
                    const katAd = kategoriler.find((k) => k.id === u.kategori_id)?.ad;
                    return (
                      <div key={u.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3 hover:bg-white/10 transition-all">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          {u.resim_url && <img src={u.resim_url} alt={u.ad} className="h-10 w-10 rounded-lg object-cover shrink-0" />}
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-white truncate">{u.ad}</span>
                              {katAd && <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-300">{katAd}</span>}
                              {u.stok !== null && u.stok !== undefined ? (
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${u.stok === 0 ? 'bg-red-500/10 text-red-400' : u.stok < 5 ? 'bg-amber-500/10 text-amber-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                                  {u.stok} Stok
                                </span>
                              ) : (
                                <span className="rounded-full bg-neutral-500/10 px-2 py-0.5 text-[10px] font-bold text-neutral-400">
                                  Sınırsız
                                </span>
                              )}
                            </div>
                            {u.aciklama && <p className="text-xs text-neutral-500 truncate">{u.aciklama}</p>}
                          </div>
                        </div>
                        <div className="flex items-center gap-4 shrink-0">
                          <span className="text-sm font-bold text-emerald-300">₺{Number(u.fiyat).toFixed(2)}</span>
                          <button onClick={() => handleUrunSil(u.id)} className="text-neutral-500 hover:text-red-400"><Trash2 className="h-4 w-4" /></button>
                        </div>
                      </div>
                    );
                  })}
                  {urunler.length === 0 && <p className="text-sm text-neutral-500">Henüz ürün eklenmedi.</p>}
                </div>
              </section>
            )}

            {/* SİPARİŞLER */}
            {activeTab === 'siparisler' && restoran && <SiparislerPro restoranId={restoran.id} restoranAdi={restoran.ad} role={userRole} sesAcik={sesAcik} setSesAcik={setSesAcik} />}
            {activeTab === 'siparisler' && !restoran && (
              <div className="py-16 text-center"><p className="text-neutral-500">Restoran ayarlarını kaydedin.</p></div>
            )}

            {/* PERSONEL */}
            {activeTab === 'personel' && restoran && (
              <PersonelYonetimi restoranId={restoran.id} personelListesi={personelListesi} setPersonelListesi={setPersonelListesi} showNotification={showNotification} handlePersonelSil={handlePersonelSil} />
            )}

            {/* QR KOD */}
            {activeTab === 'qr' && (
              <section className="max-w-4xl">
                <h1 className="text-2xl font-bold text-white">QR Kod</h1>
                <p className="mt-1 text-sm text-neutral-400">Masalara yerleştirmek için QR kodunuzu indirin.</p>
                {!restoran ? (
                  <div className="mt-6 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 flex items-center gap-3"><AlertCircle className="h-5 w-5 text-amber-400 shrink-0" /><p className="text-sm text-amber-200">Önce restoran ayarlarını kaydedin.</p></div>
                ) : (
                  <div className="mt-8 space-y-8">
                    <div className="flex flex-col md:flex-row items-center gap-6 rounded-2xl border border-white/10 bg-white/5 p-6 md:p-10">
                      <div className="rounded-2xl bg-white p-6 shadow-2xl shadow-emerald-500/10">
                        <QRCodeSVG id="qr-svg" value={qrValue} size={220} bgColor="#ffffff" fgColor="#0a0a0a" level="H" includeMargin />
                      </div>
                      <div className="text-center md:text-left flex-1">
                        <p className="text-lg font-bold text-white">{restoran.ad} - Genel QR</p>
                        <p className="mt-1 break-all text-sm text-neutral-500 font-mono">{qrValue}</p>
                        <p className="mt-3 text-sm text-neutral-400">Bu QR kodu taratanlar, masa numarası girmeden sadece menüyü görüntüleyebilir.</p>
                        <button onClick={handleQrIndir}
                          className="mt-6 flex items-center justify-center md:justify-start gap-2 rounded-xl bg-gradient-to-r from-emerald-400 to-emerald-600 px-6 py-3 text-sm font-semibold text-neutral-950 shadow-lg shadow-emerald-500/30 hover:brightness-110">
                          <Download className="h-4 w-4" /> Genel QR İndir
                        </button>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/5 p-6 md:p-10">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-6 border-b border-white/10">
                        <div>
                          <h2 className="text-lg font-bold text-white">Masa Bazlı QR Kodlar</h2>
                          <p className="text-sm text-neutral-400">Müşteriler bu kodları okuttuğunda masaları otomatik algılanır.</p>
                        </div>
                        <div className="flex items-center gap-4">
                          <div>
                            <label className="text-xs font-medium text-neutral-400 block mb-1">Masa Sayısı</label>
                            <input type="number" min="1" max="100" value={masaSayisi} onChange={(e) => setMasaSayisi(Number(e.target.value))}
                              className="w-24 rounded-xl border border-white/10 bg-neutral-950 px-4 py-2.5 text-sm text-white outline-none focus:border-emerald-400" />
                          </div>
                          <button onClick={handleTumunuIndir}
                            className="mt-5 flex items-center justify-center gap-2 rounded-xl bg-blue-500 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/30 hover:bg-blue-600">
                            <DownloadCloud className="h-4 w-4" /> Tümünü İndir
                          </button>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6">
                        {Array.from({ length: masaSayisi }).map((_, i) => {
                          const masaNo = i + 1;
                          const mQr = `${qrValue}?masa=${masaNo}`;
                          return (
                            <div key={masaNo} className="flex flex-col items-center bg-neutral-900/50 p-4 rounded-xl border border-white/5">
                              <div className="bg-white p-3 rounded-xl">
                                <QRCodeSVG id={`qr-svg-masa-${masaNo}`} value={mQr} size={120} bgColor="#ffffff" fgColor="#0a0a0a" level="M" includeMargin />
                              </div>
                              <p className="mt-3 text-sm font-bold text-white">Masa {masaNo}</p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}

// ─── LOGIN FORM ─────────────────────────────────────────────────────────────
function LoginForm({ onSuccess }: { onSuccess: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hata, setHata] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setHata('');
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) { setHata('E-posta veya şifre hatalı.'); setLoading(false); return; }
      onSuccess();
    } catch { setHata('Bir hata oluştu.'); setLoading(false); }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-zinc-950 px-4">
      <div className="mb-8 flex flex-col items-center gap-3">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-2xl shadow-emerald-500/30">
          <ChefHat className="h-8 w-8 text-neutral-950" />
        </div>
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white">QRMenu</h1>
          <p className="text-sm text-neutral-400 mt-1">Restoran Yönetim Sistemi</p>
        </div>
      </div>

      <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-white/5 p-8 backdrop-blur-xl">
        <h2 className="text-lg font-bold text-white mb-6">Giriş Yap</h2>
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-neutral-300">E-posta</label>
            <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ornek@email.com"
              className="w-full rounded-xl border border-white/10 bg-neutral-950 px-4 py-3 text-sm text-white placeholder-neutral-600 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-neutral-300">Şifre</label>
            <div className="relative">
              <input type={showPw ? 'text' : 'password'} required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••"
                className="w-full rounded-xl border border-white/10 bg-neutral-950 px-4 py-3 pr-12 text-sm text-white placeholder-neutral-600 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20" />
              <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300">
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          {hata && <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300"><XCircle className="h-4 w-4 shrink-0" />{hata}</div>}
          <button type="submit" disabled={loading}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-400 to-emerald-600 py-3.5 text-sm font-bold text-neutral-950 shadow-lg shadow-emerald-500/30 hover:brightness-110 disabled:opacity-60 mt-2">
            {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Giriş yapılıyor...</> : 'Giriş Yap'}
          </button>
        </form>
        <p className="mt-6 text-xs text-neutral-500 text-center">Tüm roller tek giriş noktasından yönlendirilir.</p>
      </div>
    </div>
  );
}

// ─── DASHBOARD STATS ────────────────────────────────────────────────────────
function DashboardStats({ restoranId }: { restoranId: string }) {
  const [stats, setStats] = useState({ gunluk: 0, haftalik: 0, aylik: 0, toplam: 0, bekleyen: 0, gunlukEski: 0, haftalikEski: 0, aylikEski: 0 });
  const [enCok, setEnCok] = useState<{ ad: string; adet: number }[]>([]);
  const [haftalikCiro, setHaftalikCiro] = useState<{ gun: string; ciro: number }[]>([]);
  const [saatlikDagitim, setSaatlikDagitim] = useState<{ saat: string; adet: number }[]>([]);
  const [yorumlar, setYorumlar] = useState<any[]>([]);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase.from('siparisler').select('*, siparis_urunleri(*, urun:urunler(*))').eq('restoran_id', restoranId);
      if (!data) return;
      
      const now = new Date();
      const gun = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const dun = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      
      const hafta = new Date(now.getTime() - 7 * 86400000);
      const gecenHafta = new Date(now.getTime() - 14 * 86400000);
      
      const ay = new Date(now.getFullYear(), now.getMonth(), 1);
      const gecenAy = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      
      let g = 0, h = 0, a = 0, t = 0, b = 0;
      let gEski = 0, hEski = 0, aEski = 0;
      
      const uMap: Record<string, number> = {};
      const haftalikMap: Record<string, number> = {};
      const saatlikMap: Record<string, number> = {};

      data.forEach((s: any) => {
        const d = new Date(s.created_at);
        if (s.durum === 'bekleniyor') b++;
        if (s.durum !== 'tamamlandi') return;
        const tutar = s.toplam_tutar || 0;
        t += tutar;
        
        // Güncel
        if (d >= gun) g += tutar;
        if (d >= hafta) {
          h += tutar;
          const gunIsmi = d.toLocaleDateString('tr-TR', { weekday: 'short' });
          haftalikMap[gunIsmi] = (haftalikMap[gunIsmi] || 0) + tutar;
        }
        if (d >= ay) a += tutar;
        
        // Eski
        if (d >= dun && d < gun) gEski += tutar;
        if (d >= gecenHafta && d < hafta) hEski += tutar;
        if (d >= gecenAy && d < ay) aEski += tutar;
        
        const saatStr = d.getHours() + ':00';
        saatlikMap[saatStr] = (saatlikMap[saatStr] || 0) + 1;

        s.siparis_urunleri?.forEach((su: any) => {
          const ad = su.urun?.ad || '?';
          uMap[ad] = (uMap[ad] || 0) + su.adet;
        });
      });
      setStats({ gunluk: g, haftalik: h, aylik: a, toplam: t, bekleyen: b, gunlukEski: gEski, haftalikEski: hEski, aylikEski: aEski });
      setEnCok(Object.entries(uMap).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([ad, adet]) => ({ ad, adet })));

      const gunler = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const name = d.toLocaleDateString('tr-TR', { weekday: 'short' });
        gunler.push({ gun: name, ciro: haftalikMap[name] || 0 });
      }
      setHaftalikCiro(gunler.reverse());
      setSaatlikDagitim(Object.entries(saatlikMap).map(([saat, adet]) => ({ saat, adet })).sort((a, b) => a.saat.localeCompare(b.saat)));

      const { data: yData } = await supabase.from('yorumlar').select('*').eq('restoran_id', restoranId).order('created_at', { ascending: false }).limit(5);
      if (yData) setYorumlar(yData);
    };
    fetch();
  }, [restoranId]);

  const cards = [
    { label: 'Günlük Ciro', value: stats.gunluk, eski: stats.gunlukEski, icon: DollarSign, gradient: 'from-blue-500/10 to-blue-600/5' },
    { label: 'Haftalık Ciro', value: stats.haftalik, eski: stats.haftalikEski, icon: TrendingUp, gradient: 'from-emerald-500/10 to-emerald-600/5' },
    { label: 'Aylık Ciro', value: stats.aylik, eski: stats.aylikEski, icon: DollarSign, gradient: 'from-purple-500/10 to-purple-600/5' },
    { label: 'Toplam', value: stats.toplam, eski: 0, icon: Store, gradient: 'from-orange-500/10 to-orange-600/5', noTrend: true },
  ];

  return (
    <section>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-sm text-neutral-400 mt-0.5">Güncel istatistikler</p>
        </div>
        {stats.bekleyen > 0 && (
          <div className="flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 px-4 py-2 rounded-xl">
            <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span></span>
            <span className="text-sm font-bold text-blue-300">{stats.bekleyen} bekleyen sipariş</span>
          </div>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => {
          const Icon = c.icon;
          const yuzde = c.eski === 0 ? (c.value > 0 ? 100 : 0) : ((c.value - c.eski) / c.eski) * 100;
          const isUp = yuzde >= 0;
          
          return (
            <div key={c.label} className={`rounded-2xl border border-white/10 bg-gradient-to-br ${c.gradient} p-6 relative overflow-hidden group`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-neutral-400">{c.label}</p>
                  <p className="mt-2 text-2xl font-bold text-white">₺{c.value.toFixed(2)}</p>
                </div>
                <Icon className="h-8 w-8 text-neutral-700" />
              </div>
              
              {!c.noTrend && (
                <div className={`mt-4 flex items-center gap-1 text-xs font-medium ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
                  {isUp ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                  <span>{Math.abs(yuzde).toFixed(1)}%</span>
                  <span className="text-neutral-500 ml-1">geçen döneme göre</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {enCok.length > 0 && (
        <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 lg:col-span-1">
            <h2 className="text-lg font-semibold text-white mb-4">En Çok Satanlar</h2>
            <div className="space-y-2">
              {enCok.map((item, i) => (
                <div key={i} className="flex items-center justify-between rounded-xl bg-neutral-950/50 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-xs font-bold text-emerald-300">{i + 1}</span>
                    <span className="text-sm text-white">{item.ad}</span>
                  </div>
                  <span className="text-sm font-bold text-emerald-300">{item.adet} adet</span>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 lg:col-span-2">
            <h2 className="text-lg font-semibold text-white mb-6">Haftalık Ciro ve Yoğun Saatler</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <h3 className="text-xs font-medium text-neutral-400 mb-4 uppercase tracking-widest">Son 7 Gün</h3>
                <div className="relative h-40 w-full mt-4">
                  {(() => {
                    const maxCiro = Math.max(...haftalikCiro.map(x => x.ciro), 1);
                    const points = haftalikCiro.map((d, i) => {
                      const x = (i / (haftalikCiro.length - 1)) * 100;
                      // Biraz boşluk bırakmak için Y eksenini %90'a kadar kullanıyoruz
                      const y = 100 - ((d.ciro / maxCiro) * 90); 
                      return { x, y, ciro: d.ciro, gun: d.gun };
                    });
                    const linePoints = points.map(p => `${p.x},${p.y}`).join(' ');
                    const areaPoints = `0,100 ${linePoints} 100,100`;

                    return (
                      <div className="w-full h-full relative">
                        <svg className="w-full h-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
                          <defs>
                            <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#10b981" stopOpacity="0.4" />
                              <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                            </linearGradient>
                          </defs>
                          <polygon points={areaPoints} fill="url(#areaGradient)" />
                          <polyline points={linePoints} fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                          {points.map((p, i) => (
                            <circle key={i} cx={p.x} cy={p.y} r="3" fill="#042f2e" stroke="#10b981" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
                          ))}
                        </svg>
                        {/* Tooltipler ve Eksen İsimleri */}
                        <div className="absolute inset-0 w-full h-full pointer-events-none">
                          {points.map((p, i) => (
                            <div key={i} className="absolute flex flex-col items-center justify-end" style={{ left: `${p.x}%`, bottom: '-20px', transform: 'translateX(-50%)' }}>
                              <span className="text-[10px] text-neutral-500 whitespace-nowrap">{p.gun}</span>
                              <div className="absolute opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap bg-neutral-800 text-white text-xs px-2 py-1 rounded pointer-events-auto" style={{ bottom: `calc(100% + ${100 - p.y}% + 30px)` }}>
                                ₺{p.ciro.toFixed(0)}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
              <div>
                <h3 className="text-xs font-medium text-neutral-400 mb-4 uppercase tracking-widest">En Yoğun Saatler (Sipariş Sayısı)</h3>
                <div className="flex flex-col gap-3 justify-center h-40">
                  {saatlikDagitim.length === 0 ? <p className="text-xs text-neutral-500">Veri yok</p> : saatlikDagitim.map((d, i) => {
                    const maxAdet = Math.max(...saatlikDagitim.map(x => x.adet), 1);
                    const w = (d.adet / maxAdet) * 100;
                    return (
                      <div key={i} className="flex items-center gap-3">
                        <span className="text-xs text-neutral-400 w-10">{d.saat}</span>
                        <div className="flex-1 bg-neutral-800 h-4 rounded-full overflow-hidden">
                          <div style={{ width: `${w}%` }} className="h-full bg-blue-500 rounded-full transition-all duration-500"></div>
                        </div>
                        <span className="text-xs font-bold text-white w-6">{d.adet}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Son Müşteri Değerlendirmeleri</h2>
        {yorumlar.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {yorumlar.map((y) => (
              <div key={y.id} className="rounded-xl bg-neutral-950/50 p-4 border border-white/5">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex text-amber-400">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} className={`h-4 w-4 ${i < y.puan ? 'fill-current' : 'text-neutral-700'}`} />
                    ))}
                  </div>
                  <span className="text-xs text-neutral-500">Masa: {y.masa_no}</span>
                </div>
                {y.yorum && <p className="text-sm text-neutral-300 line-clamp-3">"{y.yorum}"</p>}
                <div className="text-[10px] text-neutral-600 mt-2 text-right">{new Date(y.created_at).toLocaleDateString('tr-TR')}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-neutral-500">
            <Star className="h-10 w-10 mx-auto text-neutral-800 mb-2" />
            <p>Henüz hiç değerlendirme yapılmamış.</p>
          </div>
        )}
      </div>
    </section>
  );
}

// ─── PROFESYONEl SİPARİŞ YÖNETİMİ ─────────────────────────────────────────
function SiparislerPro({ restoranId, restoranAdi, role, sesAcik, setSesAcik }: { restoranId: string; restoranAdi?: string; role: Role; sesAcik: boolean; setSesAcik: (val: boolean) => void }) {
  const [siparisler, setSiparisler] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtre, setFiltre] = useState<'aktif' | 'tamamlandi' | 'hepsi' | 'odenmedi'>('aktif');
  const prevCountRef = useRef(0);
  const isInitialLoadRef = useRef(true);
  const [, setTick] = useState(0);
  const isKasa = role === 'kasa';

  useEffect(() => {
    const iv = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(iv);
  }, []);

  const fetchSiparisler = useCallback(async () => {
    const { data } = await supabase
      .from('siparisler')
      .select('*, siparis_urunleri(*, urun:urunler(*))')
      .eq('restoran_id', restoranId)
      .order('created_at', { ascending: false });
    if (data) {
      const bekCount = data.filter((s: any) => s.durum === 'bekleniyor').length;
      if (!isInitialLoadRef.current && bekCount > prevCountRef.current && sesAcik) {
        playNotificationSound();
      }
      prevCountRef.current = bekCount;
      isInitialLoadRef.current = false;
      setSiparisler(data);
    }
    setLoading(false);
  }, [restoranId, sesAcik]);

  useEffect(() => {
    fetchSiparisler();
    const ch = supabase.channel('siparis-canli').on('postgres_changes', { event: '*', schema: 'public', table: 'siparisler' }, () => fetchSiparisler()).subscribe();
    return () => { ch.unsubscribe(); };
  }, [fetchSiparisler]);

  const durumGuncelle = async (id: string, d: string) => {
    await supabase.from('siparisler').update({ durum: d, updated_at: new Date().toISOString() }).eq('id', id);
    setSiparisler((prev) => prev.map((s) => (s.id === id ? { ...s, durum: d } : s)));
  };

  const odemeGuncelle = async (id: string, odendi: boolean) => {
    await supabase.from('siparisler').update({ odendi }).eq('id', id);
    setSiparisler((prev) => prev.map((s) => (s.id === id ? { ...s, odendi } : s)));
  };

  const aktifler = siparisler.filter((s) => s.durum === 'bekleniyor' || s.durum === 'hazirlaniyor');
  const tamamlananlar = siparisler.filter((s) => s.durum === 'tamamlandi');
  const odenmeyenler = siparisler.filter((s) => s.durum === 'tamamlandi' && !s.odendi);

  let f: any[];
  if (filtre === 'aktif') f = aktifler;
  else if (filtre === 'tamamlandi') f = tamamlananlar;
  else if (filtre === 'odenmedi') f = odenmeyenler;
  else f = siparisler;

  const gunlukCiro = tamamlananlar
    .filter((s) => new Date(s.created_at).toDateString() === new Date().toDateString())
    .reduce((sum: number, s: any) => sum + Number(s.toplam_tutar), 0);
  const toplamCiro = tamamlananlar.reduce((sum: number, s: any) => sum + Number(s.toplam_tutar), 0);
  const odenenCiro = tamamlananlar.filter((s) => s.odendi).reduce((sum: number, s: any) => sum + Number(s.toplam_tutar), 0);

  const printAdisyon = (s: any) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    const content = `
      <html>
        <head>
          <title>Adisyon - Masa ${s.masa_no}</title>
          <style>
            body { font-family: 'Courier New', Courier, monospace; width: 300px; margin: 0 auto; color: #000; padding: 10px; font-size: 14px; }
            h2, h3, p { text-align: center; margin: 2px 0; }
            .header-info { text-align: center; font-size: 12px; margin-bottom: 10px; }
            .divider { border-top: 1px dashed #000; margin: 8px 0; }
            .item { display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 13px; }
            .item-name { flex: 1; margin-left: 8px; }
            .summary { margin-top: 10px; font-size: 14px; }
            .summary-row { display: flex; justify-content: space-between; margin-bottom: 4px; }
            .total { display: flex; justify-content: space-between; font-weight: bold; font-size: 16px; margin-top: 5px; border-top: 2px solid #000; padding-top: 5px; }
            .footer { text-align: center; font-size: 12px; margin-top: 20px; }
            @media print { body { width: 100%; margin: 0; padding: 0; } }
          </style>
        </head>
        <body>
          <h2>${restoranAdi || 'RESTO'}</h2>
          <div class="header-info">
            V.D. / V.No: 1234567890<br>
            Tarih: ${new Date(s.created_at).toLocaleDateString('tr-TR')} Saat: ${new Date(s.created_at).toLocaleTimeString('tr-TR', {hour:'2-digit', minute:'2-digit'})}
          </div>
          <div class="divider"></div>
          <h3>FİŞ NO: #${s.id.substring(0,6).toUpperCase()}</h3>
          <h3>MASA: ${s.masa_no}</h3>
          <div class="divider"></div>
          ${s.siparis_urunleri?.map((su: any) => `
            <div class="item">
              <span style="width: 20px;">${su.adet}x</span>
              <span class="item-name">${su.urun?.ad || 'Ürün'}</span>
              <span>${(su.adet * (su.birim_fiyat || 0)).toFixed(2)} TL</span>
            </div>
          `).join('')}
          ${s.musteri_notu ? `
            <div class="divider"></div>
            <div style="font-size:12px; margin-top:5px; font-weight:bold;">
              NOT: ${s.musteri_notu}
            </div>
          ` : ''}
          <div class="divider"></div>
          <div class="summary">
            <div class="summary-row">
              <span>Ara Toplam:</span>
              <span>${(Number(s.toplam_tutar) / 1.1).toFixed(2)} TL</span>
            </div>
            <div class="summary-row">
              <span>KDV (%10):</span>
              <span>${(Number(s.toplam_tutar) - (Number(s.toplam_tutar) / 1.1)).toFixed(2)} TL</span>
            </div>
          </div>
          <div class="total">
            <span>GENEL TOPLAM:</span>
            <span>${Number(s.toplam_tutar).toFixed(2)} TL</span>
          </div>
          <div class="divider"></div>
          <div class="footer">
            BİZİ TERCİH ETTİĞİNİZ İÇİN<br>TEŞEKKÜR EDERİZ.<br><br>
            Lütfen fişinizi kontrol ediniz.
          </div>
          <script>
            window.onload = () => { window.print(); window.setTimeout(() => window.close(), 500); }
          </script>
        </body>
      </html>
    `;
    printWindow.document.write(content);
    printWindow.document.close();
  };

  const durumConfig: Record<string, { bg: string; border: string; badge: string; text: string; emoji: string }> = {
    bekleniyor: { bg: 'from-blue-500/5 to-slate-900', border: 'border-blue-500/30', badge: 'bg-blue-500/20 text-blue-300 border-blue-500/30', text: 'Yeni', emoji: '🔔' },
    hazirlaniyor: { bg: 'from-amber-500/5 to-slate-900', border: 'border-amber-500/30', badge: 'bg-amber-500/20 text-amber-300 border-amber-500/30', text: 'Hazırlanıyor', emoji: '🔥' },
    tamamlandi: { bg: 'from-emerald-500/5 to-slate-900', border: 'border-emerald-500/30', badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30', text: 'Tamamlandı', emoji: '✅' },
    iptal: { bg: 'from-red-500/5 to-slate-900', border: 'border-red-500/30', badge: 'bg-red-500/20 text-red-300 border-red-500/30', text: 'İptal', emoji: '❌' },
  };

  return (
    <section>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">{isKasa ? '💰 Kasa Paneli' : 'Siparişler'}</h1>
          <p className="text-sm text-neutral-400 mt-0.5">{isKasa ? 'Sipariş ve ödeme takibi' : 'Gelen siparişleri yönetin'}</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setSesAcik(!sesAcik)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${sesAcik ? 'bg-blue-500/10 border-blue-500/20 text-blue-400' : 'bg-neutral-800 border-white/10 text-neutral-500'}`}>
            {sesAcik ? <Volume2 className="h-3.5 w-3.5" /> : <Bell className="h-3.5 w-3.5" />}
            {sesAcik ? 'Ses Açık' : 'Ses Kapalı'}
          </button>
          <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-full text-xs font-medium text-emerald-400">
            <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span></span>
            Canlı
          </div>
        </div>
      </div>

      {isKasa && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-emerald-500/10 to-slate-900 p-5">
            <p className="text-xs text-neutral-400 font-medium">Bugün Ciro</p>
            <p className="text-2xl font-black text-emerald-400 mt-1">₺{gunlukCiro.toFixed(2)}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-blue-500/10 to-slate-900 p-5">
            <p className="text-xs text-neutral-400 font-medium">Ödenen</p>
            <p className="text-2xl font-black text-blue-400 mt-1">₺{odenenCiro.toFixed(2)}</p>
          </div>
          <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-slate-900 p-5">
            <p className="text-xs text-neutral-400 font-medium">Ödenmemiş</p>
            <p className="text-2xl font-black text-amber-400 mt-1">₺{(toplamCiro - odenenCiro).toFixed(2)}</p>
            {odenmeyenler.length > 0 && <p className="text-[10px] text-amber-500 mt-1">{odenmeyenler.length} sipariş bekliyor</p>}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-6">
        {[
          { key: 'aktif', label: `🔔 Aktif (${aktifler.length})` },
          { key: 'tamamlandi', label: `✅ Tamamlandı (${tamamlananlar.length})` },
          ...(isKasa ? [{ key: 'odenmedi', label: `💰 Ödenmedi (${odenmeyenler.length})` }] : []),
          { key: 'hepsi', label: `Tümü (${siparisler.length})` },
        ].map((btn) => (
          <button key={btn.key} onClick={() => setFiltre(btn.key as any)}
            className={`rounded-xl px-4 py-2 text-xs font-semibold transition-all ${filtre === btn.key ? 'bg-emerald-500 text-neutral-950 shadow-lg shadow-emerald-500/30' : 'bg-white/5 text-neutral-400 hover:bg-white/10 hover:text-white'}`}>
            {btn.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-12 flex items-center justify-center gap-3 text-neutral-400"><Loader2 className="h-6 w-6 animate-spin text-emerald-400" /> Yükleniyor...</div>
      ) : f.length === 0 ? (
        <div className="py-20 text-center rounded-3xl border border-dashed border-white/10 bg-white/5">
          <ClipboardList className="mx-auto h-16 w-16 text-neutral-700" />
          <p className="mt-4 text-lg font-semibold text-white">{filtre === 'aktif' ? 'Aktif sipariş yok' : filtre === 'odenmedi' ? 'Tüm ödemeler alındı 🎉' : 'Sipariş yok'}</p>
          <p className="mt-1 text-sm text-neutral-500">Yeni siparişler geldiğinde otomatik görünecek.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {f.map((s) => {
            const cfg = durumConfig[s.durum] || durumConfig.bekleniyor;
            const isBek = s.durum === 'bekleniyor';
            const isHaz = s.durum === 'hazirlaniyor';
            const isTam = s.durum === 'tamamlandi';
            const isAktif = isBek || isHaz;
            return (
              <div key={s.id} className={`rounded-3xl border ${cfg.border} bg-gradient-to-br ${cfg.bg} p-6 flex flex-col gap-4 transition-all hover:shadow-xl ${isBek ? 'ring-2 ring-blue-500/20 animate-pulse-slow' : ''}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">Masa</p>
                    <p className="text-5xl font-black text-white leading-none mt-1">{s.masa_no}</p>
                    <p className="text-xs text-neutral-600 mt-1.5">
                      {new Date(s.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                      <span className="text-neutral-700 ml-1">· {timeAgo(s.created_at)}</span>
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className={`text-xs font-bold px-3 py-1.5 rounded-full border ${cfg.badge}`}>{cfg.emoji} {cfg.text}</span>
                    {isKasa && isTam && (
                      <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${s.odendi ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-red-500/20 text-red-300 border-red-500/30'}`}>
                        {s.odendi ? '💵 Ödendi' : '⏳ Ödenmedi'}
                      </span>
                    )}
                    <button onClick={() => printAdisyon(s)} className="mt-1 p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white transition-colors" title="Adisyon Yazdır">
                      <Printer className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {s.musteri_notu && (
                  <div className="rounded-xl border border-orange-500/30 bg-orange-500/10 p-3">
                    <p className="text-[10px] font-bold text-orange-300 uppercase mb-1">📝 Müşteri Notu</p>
                    <p className="text-sm text-orange-200">{s.musteri_notu}</p>
                  </div>
                )}

                <div className="space-y-1.5 border-t border-white/10 pt-4">
                  {s.siparis_urunleri?.map((su: any) => (
                    <div key={su.id} className="flex items-center justify-between text-sm">
                      <span className="text-neutral-200">{su.urun?.ad || 'Ürün'}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-neutral-500 text-xs">₺{su.birim_fiyat?.toFixed(2)}</span>
                        <span className="bg-neutral-800 border border-white/10 px-2 py-0.5 rounded-lg font-bold text-white text-xs">x{su.adet}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between border-t border-white/10 pt-3">
                  <span className="text-sm text-neutral-400 font-medium">Toplam</span>
                  <span className="text-2xl font-black text-emerald-400">₺{Number(s.toplam_tutar).toFixed(2)}</span>
                </div>

                <div className="space-y-2 mt-auto">
                  {!isKasa && isBek && (
                    <button onClick={() => durumGuncelle(s.id, 'hazirlaniyor')}
                      className="w-full flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-400 to-amber-500 py-3.5 text-sm font-bold text-amber-950 hover:brightness-110 transition-all shadow-lg shadow-amber-500/20">
                      <Zap className="h-4 w-4" /> Siparişi Al
                    </button>
                  )}
                  {!isKasa && isHaz && (
                    <button onClick={() => durumGuncelle(s.id, 'tamamlandi')}
                      className="w-full flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-400 to-teal-500 py-3.5 text-sm font-bold text-neutral-950 hover:brightness-110 transition-all shadow-lg shadow-emerald-500/20">
                      <CheckCircle2 className="h-4 w-4" /> Tamamlandı — Masaya Götür
                    </button>
                  )}
                  {!isKasa && isAktif && (
                    <button onClick={() => { if (confirm('İptal?')) durumGuncelle(s.id, 'iptal'); }}
                      className="w-full flex items-center justify-center gap-2 rounded-2xl bg-red-500/10 border border-red-500/20 py-2.5 text-xs font-semibold text-red-400 hover:bg-red-500/20 transition-all">
                      <X className="h-3.5 w-3.5" /> İptal Et
                    </button>
                  )}
                  {isKasa && isTam && !s.odendi && (
                    <button onClick={() => odemeGuncelle(s.id, true)}
                      className="w-full flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-400 to-blue-600 py-3.5 text-sm font-bold text-white hover:brightness-110 transition-all shadow-lg shadow-blue-500/20">
                      <DollarSign className="h-4 w-4" /> Ödeme Al — ₺{Number(s.toplam_tutar).toFixed(2)}
                    </button>
                  )}
                  {isKasa && isTam && s.odendi && (
                    <button onClick={() => odemeGuncelle(s.id, false)}
                      className="w-full flex items-center justify-center gap-2 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 py-2.5 text-xs font-semibold text-emerald-400">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Ödeme Alındı ✓
                    </button>
                  )}
                  {isKasa && isAktif && (
                    <div className="text-center py-2"><p className="text-xs text-neutral-600 italic">Sipariş hazırlanıyor...</p></div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {f.length > 0 && (
        <div className="mt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-6 py-4">
          <span className="text-sm text-neutral-400">{f.length} sipariş</span>
          <div className="flex flex-wrap gap-4">
            <span className="text-sm font-bold text-emerald-300">Ciro: ₺{toplamCiro.toFixed(2)}</span>
            {isKasa && <span className="text-sm font-bold text-blue-300">Ödenen: ₺{odenenCiro.toFixed(2)}</span>}
          </div>
        </div>
      )}
    </section>
  );
}


// ─── PERSONEL YÖNETİMİ ─────────────────────────────────────────────────────
function PersonelYonetimi({ restoranId, personelListesi, setPersonelListesi, showNotification, handlePersonelSil }: {
  restoranId: string;
  personelListesi: Personel[];
  setPersonelListesi: React.Dispatch<React.SetStateAction<Personel[]>>;
  showNotification: (type: 'success' | 'error', text: string) => void;
  handlePersonelSil: (id: string) => void;
}) {
  const [formAcik, setFormAcik] = useState(false);
  const [yeniAd, setYeniAd] = useState('');
  const [yeniEmail, setYeniEmail] = useState('');
  const [yeniSifre, setYeniSifre] = useState('');
  const [yeniRol, setYeniRol] = useState('personel');
  const [ekleniyor, setEkleniyor] = useState(false);

  const handleEkle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!yeniEmail.trim() || !yeniSifre.trim() || !yeniAd.trim()) {
      showNotification('error', 'Ad, e-posta ve şifre zorunludur.');
      return;
    }
    setEkleniyor(true);
    try {
      let uid: string | null = null;

      // 1. Kullanıcı oluşturmayı dene
      const { data: authData, error: authErr } = await supabase.auth.signUp({
        email: yeniEmail.trim(),
        password: yeniSifre.trim(),
      });

      if (authErr && authErr.message.includes('already registered')) {
        // Kullanıcı zaten var — ID'sini bul
        const { data: existingId } = await supabase.rpc('get_user_id_by_email', { user_email: yeniEmail.trim() });
        if (existingId) {
          uid = existingId;
        } else {
          throw new Error('Bu e-posta kayıtlı ama kullanıcı bulunamadı. SQL fonksiyonunu oluşturun.');
        }
      } else if (authErr) {
        throw authErr;
      } else if (authData?.user) {
        uid = authData.user.id;
      } else {
        throw new Error('Kullanıcı oluşturulamadı.');
      }

      // 2. Zaten personel olarak ekli mi kontrol et
      const { data: mevcutP } = await supabase.from('personel').select('id').eq('user_id', uid).maybeSingle();
      if (mevcutP) {
        showNotification('error', 'Bu kullanıcı zaten personel olarak kayıtlı.');
        setEkleniyor(false);
        return;
      }

      // 3. Personel tablosuna ekle
      const { data: pData, error: pErr } = await supabase.from('personel').insert({
        user_id: uid,
        restoran_id: restoranId,
        rol: yeniRol,
        ad: yeniAd.trim(),
        email: yeniEmail.trim(),
      }).select().single();
      if (pErr) throw pErr;

      setPersonelListesi((prev) => [...prev, pData as Personel]);
      setYeniAd('');
      setYeniEmail('');
      setYeniSifre('');
      setYeniRol('personel');
      setFormAcik(false);
      showNotification('success', `${yeniAd.trim()} eklendi.`);
    } catch (err: any) {
      showNotification('error', err.message || 'Personel eklenemedi.');
    } finally {
      setEkleniyor(false);
    }
  };

  const rolRenk: Record<string, string> = {
    admin: 'bg-purple-500/10 text-purple-300 border-purple-500/20',
    mudur: 'bg-blue-500/10 text-blue-300 border-blue-500/20',
    kasa: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
    personel: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
    garson: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20',
  };

  return (
    <section className="max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Personel Yönetimi</h1>
          <p className="text-sm text-neutral-400 mt-0.5">{personelListesi.length} kayıtlı personel</p>
        </div>
        <button onClick={() => setFormAcik(!formAcik)}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${formAcik ? 'bg-neutral-800 text-neutral-300' : 'bg-gradient-to-r from-emerald-400 to-emerald-600 text-neutral-950 shadow-lg shadow-emerald-500/20 hover:brightness-110'}`}>
          {formAcik ? <><X className="h-4 w-4" /> Kapat</> : <><UserPlus className="h-4 w-4" /> Personel Ekle</>}
        </button>
      </div>

      {/* Ekleme Formu */}
      {formAcik && (
        <form onSubmit={handleEkle} className="mb-6 space-y-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-6">
          <h3 className="text-sm font-bold text-emerald-300 flex items-center gap-2"><UserPlus className="h-4 w-4" /> Yeni Personel Ekle</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-400">Ad Soyad</label>
              <input type="text" required value={yeniAd} onChange={(e) => setYeniAd(e.target.value)} placeholder="Ahmet Yılmaz"
                className="w-full rounded-xl border border-white/10 bg-neutral-950 px-4 py-2.5 text-sm text-white placeholder-neutral-600 outline-none focus:border-emerald-400" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-400">Rol</label>
              <select value={yeniRol} onChange={(e) => setYeniRol(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-neutral-950 px-4 py-2.5 text-sm text-white outline-none focus:border-emerald-400">
                <option value="personel">👤 Personel / Garson</option>
                <option value="kasa">💰 Kasa</option>
                <option value="mudur">👔 Müdür</option>
                <option value="admin">🔑 Admin</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-400">E-posta</label>
              <input type="email" required value={yeniEmail} onChange={(e) => setYeniEmail(e.target.value)} placeholder="personel@email.com"
                className="w-full rounded-xl border border-white/10 bg-neutral-950 px-4 py-2.5 text-sm text-white placeholder-neutral-600 outline-none focus:border-emerald-400" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-400">Şifre</label>
              <input type="text" required value={yeniSifre} onChange={(e) => setYeniSifre(e.target.value)} placeholder="En az 6 karakter"
                className="w-full rounded-xl border border-white/10 bg-neutral-950 px-4 py-2.5 text-sm text-white placeholder-neutral-600 outline-none focus:border-emerald-400" />
            </div>
          </div>
          <button type="submit" disabled={ekleniyor}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-400 to-emerald-600 py-3 text-sm font-bold text-neutral-950 shadow-lg shadow-emerald-500/30 hover:brightness-110 disabled:opacity-50">
            {ekleniyor ? <><Loader2 className="h-4 w-4 animate-spin" /> Ekleniyor...</> : <><UserPlus className="h-4 w-4" /> Personeli Kaydet</>}
          </button>
        </form>
      )}

      {/* Liste */}
      <div className="space-y-2">
        {personelListesi.map((p) => (
          <div key={p.id} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 p-4 hover:bg-white/10 transition-all">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-800 text-sm font-bold text-white">
                {(p.ad || '?')[0].toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-medium text-white">{p.ad || p.email || p.user_id.slice(0, 8)}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${rolRenk[p.rol] || 'bg-neutral-800 text-neutral-300 border-neutral-700'}`}>{p.rol}</span>
                  {p.email && <span className="text-[10px] text-neutral-600">{p.email}</span>}
                </div>
              </div>
            </div>
            <button onClick={() => handlePersonelSil(p.id)} className="text-neutral-600 hover:text-red-400 transition-colors p-2"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
        {personelListesi.length === 0 && (
          <div className="py-12 text-center rounded-2xl border border-dashed border-white/10 bg-white/5">
            <Users className="mx-auto h-10 w-10 text-neutral-700" />
            <p className="mt-3 text-sm text-neutral-500">Henüz personel eklenmedi.</p>
            <p className="text-xs text-neutral-600 mt-1">Yukarıdaki &quot;Personel Ekle&quot; butonunu kullanın.</p>
          </div>
        )}
      </div>
    </section>
  );
}