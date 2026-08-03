'use client';

import { useEffect, useState, use } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import {
  ShoppingCart,
  Plus,
  Minus,
  ChefHat,
  CheckCircle2,
  X,
  StickyNote,
  Hash,
  ArrowRight,
  Clock,
  Utensils,
  Bell,
  Star,
  Globe
} from 'lucide-react';

interface Urun {
  id: string;
  ad: string;
  ad_en?: string | null;
  fiyat: number;
  aciklama: string | null;
  aciklama_en?: string | null;
  resim_url: string | null;
  kategori_id: string;
  stok?: number | null;
}

interface Kategori {
  id: string;
  ad: string;
  ad_en?: string | null;
}

interface SepetItem extends Urun {
  adet: number;
}

type Sayfa = 'menu' | 'sepet' | 'onay';

export default function MusteriMenuPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const searchParams = useSearchParams();

  const [restoran, setRestoran] = useState<any>(null);
  const [kategoriler, setKategoriler] = useState<Kategori[]>([]);
  const [urunler, setUrunler] = useState<Urun[]>([]);
  const [sepet, setSepet] = useState<SepetItem[]>([]);
  const [aktifKategori, setAktifKategori] = useState<string | null>(null);
  const [sayfa, setSayfa] = useState<Sayfa>('menu');
  const [masaNo, setMasaNo] = useState(searchParams?.get('masa') || '');
  const [musteriNotu, setMusteriNotu] = useState('');
  const [siparisDurumu, setSiparisDurumu] = useState<'gonderiliyor' | 'basarili' | null>(null);
  const [siparisId, setSiparisId] = useState<string | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [siparisHata, setSiparisHata] = useState('');

  const [lang, setLang] = useState<'tr' | 'en'>('tr');
  const [waiterCooldown, setWaiterCooldown] = useState(false);
  const [waiterMessage, setWaiterMessage] = useState('');

  useEffect(() => {
    const fetchMenu = async () => {
      setYukleniyor(true);
      let { data: restData } = await supabase
        .from('restoranlar')
        .select('*')
        .eq('slug', slug)
        .maybeSingle();

      if (!restData) {
        const { data } = await supabase
          .from('restoranlar')
          .select('*')
          .eq('id', slug)
          .maybeSingle();
        restData = data;
      }

      if (restData) {
        setRestoran(restData);

        const { data: katData } = await supabase
          .from('kategoriler')
          .select('*')
          .eq('restoran_id', restData.id)
          .order('order_index', { ascending: true });

        const { data: urunData } = await supabase
          .from('urunler')
          .select('*')
          .in('kategori_id', (katData || []).map((k) => k.id))
          .order('ad', { ascending: true });

        setKategoriler(katData || []);
        setUrunler(urunData || []);
        if (katData && katData.length > 0) setAktifKategori(katData[0].id);
      }
      setYukleniyor(false);
    };

    fetchMenu();
  }, [slug]);

  const t = (tr: string, en: string) => lang === 'tr' ? tr : en;

  const garsonCagir = async () => {
    if (waiterCooldown) return;
    
    let currentMasa = masaNo.trim();
    if (!currentMasa) {
      const input = window.prompt(t('Lütfen masa numaranızı girin:', 'Please enter your table number:'));
      if (!input || !input.trim()) return;
      currentMasa = input.trim();
      setMasaNo(currentMasa); // Sepet için de kaydet
    }

    try {
      setWaiterCooldown(true);
      await supabase.from('garson_cagri').insert({
        restoran_id: restoran.id,
        masa_no: currentMasa,
        durum: 'bekliyor'
      });
      setWaiterMessage(t('Garsonunuz çağrıldı!', 'Waiter called!'));
      setTimeout(() => setWaiterMessage(''), 3000);
      
      setTimeout(() => {
        setWaiterCooldown(false);
      }, 30000);
    } catch (err) {
      console.error(err);
      setWaiterCooldown(false);
    }
  };

  const sepeteTekle = (urun: Urun) => {
    if (urun.stok === 0) return;
    setSepet((prev) => {
      const var_ = prev.find((i) => i.id === urun.id);
      if (var_) return prev.map((i) => (i.id === urun.id ? { ...i, adet: i.adet + 1 } : i));
      return [...prev, { ...urun, adet: 1 }];
    });
  };

  const sepettenCikar = (urunId: string) => {
    setSepet((prev) => {
      const item = prev.find((i) => i.id === urunId);
      if (!item) return prev;
      if (item.adet === 1) return prev.filter((i) => i.id !== urunId);
      return prev.map((i) => (i.id === urunId ? { ...i, adet: i.adet - 1 } : i));
    });
  };

  const sepettekiAdet = (urunId: string) => sepet.find((i) => i.id === urunId)?.adet || 0;
  const sepetToplam = sepet.reduce((s, i) => s + i.fiyat * i.adet, 0);
  const sepetAdedToplam = sepet.reduce((s, i) => s + i.adet, 0);

  const siparisVer = async () => {
    if (!masaNo.trim()) {
      setSiparisHata(t('Lütfen masa numaranızı girin!', 'Please enter your table number!'));
      return;
    }
    if (sepet.length === 0) return;

    setSiparisHata('');
    setSiparisDurumu('gonderiliyor');

    try {
      const { data: yeniSiparis, error } = await supabase
        .from('siparisler')
        .insert({
          restoran_id: restoran.id,
          masa_no: masaNo.trim(),
          toplam_tutar: sepetToplam,
          durum: 'bekleniyor',
          musteri_notu: musteriNotu.trim() || null,
        })
        .select()
        .single();

      if (error) throw error;

      await supabase.from('siparis_urunleri').insert(
        sepet.map((item) => ({
          siparis_id: yeniSiparis.id,
          urun_id: item.id,
          adet: item.adet,
          birim_fiyat: item.fiyat,
        }))
      );

      setSiparisId(yeniSiparis.id);
      setSiparisDurumu('basarili');
      setSepet([]);
      setSayfa('onay');
    } catch (err: any) {
      setSiparisDurumu(null);
      setSiparisHata(err.message || t('Sipariş gönderilemedi, tekrar deneyin.', 'Failed to send order, try again.'));
    }
  };

  const getThemeClasses = () => {
    const tema = restoran?.tema || 'dark';
    switch (tema) {
      case 'light':
        return {
          bg: 'bg-slate-50',
          text: 'text-slate-900',
          textMuted: 'text-slate-500',
          card: 'bg-white',
          border: 'border-slate-200',
          accentBtn: 'bg-emerald-500 text-white',
          accentText: 'text-emerald-600',
          navBg: 'bg-white/90',
        };
      case 'modern':
        return {
          bg: 'bg-gradient-to-br from-indigo-950 to-purple-950',
          text: 'text-white',
          textMuted: 'text-indigo-200',
          card: 'bg-white/10',
          border: 'border-white/10',
          accentBtn: 'bg-purple-500 text-white',
          accentText: 'text-purple-400',
          navBg: 'bg-indigo-950/90',
        };
      case 'classic':
        return {
          bg: 'bg-[#F9F6F0]',
          text: 'text-[#4A3B32]',
          textMuted: 'text-[#8A7969]',
          card: 'bg-white',
          border: 'border-[#E6DFD5]',
          accentBtn: 'bg-[#8B5E34] text-white',
          accentText: 'text-[#8B5E34]',
          navBg: 'bg-[#F9F6F0]/90',
        };
      case 'dark':
      default:
        return {
          bg: 'bg-slate-950',
          text: 'text-white',
          textMuted: 'text-slate-400',
          card: 'bg-slate-900',
          border: 'border-white/10',
          accentBtn: 'bg-emerald-500 text-neutral-950',
          accentText: 'text-emerald-400',
          navBg: 'bg-slate-950/90',
        };
    }
  };

  const th = getThemeClasses();

  if (yukleniyor) {
    return (
      <div className={`flex min-h-screen items-center justify-center ${th.bg}`}>
        <div className="flex flex-col items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600">
            <Utensils className="h-8 w-8 text-white" />
          </div>
          <p className={`text-sm animate-pulse ${th.textMuted}`}>{t('Menü yükleniyor...', 'Loading menu...')}</p>
        </div>
      </div>
    );
  }

  if (!restoran) {
    return (
      <div className={`flex min-h-screen flex-col items-center justify-center ${th.bg} p-6 text-center`}>
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-red-500/10 mb-4">
          <X className="h-10 w-10 text-red-500" />
        </div>
        <h1 className={`text-xl font-bold ${th.text}`}>{t('Menü Bulunamadı', 'Menu Not Found')}</h1>
        <p className={`mt-2 text-sm ${th.textMuted}`}>{t('Bu QR koda ait bir menü mevcut değil.', 'Menu for this QR code does not exist.')}</p>
      </div>
    );
  }

  if (sayfa === 'onay') {
    return <SiparisTakip siparisId={siparisId} masaNo={masaNo} lang={lang} t={t} onYeniSiparis={() => { setSayfa('menu'); setSiparisDurumu(null); }} restoranAd={restoran?.ad || ''} restoranId={restoran.id} th={th} />;
  }

  if (sayfa === 'sepet') {
    return (
      <div className={`min-h-screen ${th.bg} flex flex-col`}>
        <div className={`sticky top-0 z-10 ${th.navBg} backdrop-blur-xl border-b ${th.border} px-4 py-4 flex items-center gap-3`}>
          <button
            onClick={() => setSayfa('menu')}
            className={`flex h-9 w-9 items-center justify-center rounded-xl bg-black/10 hover:bg-black/20 transition-all`}
          >
            <X className={`h-4 w-4 ${th.text}`} />
          </button>
          <div>
            <h1 className={`font-bold ${th.text}`}>{t('Sepetim', 'My Cart')}</h1>
            <p className={`text-xs ${th.textMuted}`}>{restoran.ad}</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6 pb-40">
          <div className="space-y-3">
            {sepet.map((item) => (
              <div
                key={item.id}
                className={`flex items-center justify-between ${th.card} border ${th.border} rounded-2xl p-4`}
              >
                <div className="flex-1 min-w-0">
                  <p className={`font-semibold ${th.text} truncate`}>{lang === 'en' ? (item.ad_en || item.ad) : item.ad}</p>
                  <p className={`text-sm ${th.accentText} font-bold mt-0.5`}>
                    ₺{(item.fiyat * item.adet).toFixed(2)}
                  </p>
                </div>
                <div className="flex items-center gap-3 ml-4 shrink-0">
                  <button
                    onClick={() => sepettenCikar(item.id)}
                    className="flex h-8 w-8 items-center justify-center rounded-xl bg-red-500/20 text-red-500 hover:bg-red-500/30 transition-all"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className={`w-5 text-center font-bold ${th.text}`}>{item.adet}</span>
                  <button
                    onClick={() => sepeteTekle(item)}
                    className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-500 hover:bg-emerald-500/30 transition-all"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className={`rounded-2xl border ${th.border} ${th.card} p-5 space-y-2`}>
            <label className={`flex items-center gap-2 text-sm font-semibold ${th.text}`}>
              <Hash className={`h-4 w-4 ${th.accentText}`} />
              {t('Masa Numarası', 'Table Number')} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder={t('Örn: 5', 'e.g. 5')}
              value={masaNo}
              onChange={(e) => { setMasaNo(e.target.value); setSiparisHata(''); }}
              className={`w-full rounded-xl border bg-transparent px-4 py-3 text-lg font-bold ${th.text} outline-none focus:ring-2 transition-all ${
                siparisHata ? 'border-red-500 focus:ring-red-500/20' : `${th.border} focus:border-emerald-400 focus:ring-emerald-400/20`
              }`}
            />
            {siparisHata && <p className="text-xs text-red-500">{siparisHata}</p>}
          </div>

          <div className={`rounded-2xl border ${th.border} ${th.card} p-5 space-y-2`}>
            <label className={`flex items-center gap-2 text-sm font-semibold ${th.text}`}>
              <StickyNote className="h-4 w-4 text-amber-500" />
              {t('Özel İstek / Not', 'Special Request / Note')} <span className={`font-normal text-xs ${th.textMuted}`}>({t('isteğe bağlı', 'optional')})</span>
            </label>
            <textarea
              placeholder={t('Örn: Köfte az pişmiş olsun...', 'e.g. Medium rare please...')}
              value={musteriNotu}
              onChange={(e) => setMusteriNotu(e.target.value)}
              rows={3}
              className={`w-full rounded-xl border ${th.border} bg-transparent px-4 py-3 text-sm ${th.text} outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 resize-none transition-all`}
            />
          </div>
        </div>

        <div className={`fixed bottom-0 left-0 right-0 border-t ${th.border} ${th.navBg} backdrop-blur-xl px-4 py-4 space-y-3`}>
          <div className={`flex items-center justify-between text-sm ${th.textMuted}`}>
            <span>{sepetAdedToplam} {t('ürün', 'items')}</span>
            <span className={`text-xl font-black ${th.text}`}>₺{sepetToplam.toFixed(2)}</span>
          </div>
          <button
            onClick={siparisVer}
            disabled={siparisDurumu === 'gonderiliyor'}
            className={`w-full flex items-center justify-center gap-2 rounded-2xl ${th.accentBtn} py-4 text-base font-bold shadow-lg hover:brightness-110 disabled:opacity-60 transition-all`}
          >
            {siparisDurumu === 'gonderiliyor' ? (
              <>
                <span className="animate-spin h-5 w-5 border-2 border-white/30 border-t-white rounded-full"></span>
                {t('Gönderiliyor...', 'Sending...')}
              </>
            ) : (
              <>
                {t('Siparişi Onayla', 'Confirm Order')}
                <ArrowRight className="h-5 w-5" />
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  const aktifKatUrunler = urunler.filter((u) => u.kategori_id === aktifKategori);

  return (
    <div className={`min-h-screen ${th.bg} ${th.text} pb-32`}>
      <div className={`relative overflow-hidden bg-gradient-to-br ${th.bg === 'bg-slate-950' ? 'from-emerald-900/40 via-slate-900 to-slate-950' : 'from-black/5 to-black/10'} px-5 py-8 border-b ${th.border}`}>
        <div className="flex justify-between items-start relative z-10">
          <div className="flex items-center gap-3 mb-1">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600">
              <Utensils className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className={`text-xl font-bold ${th.text}`}>{restoran.ad}</h1>
              <p className={`text-xs ${th.accentText}`}>{t('Dijital Menü', 'Digital Menu')}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setLang(lang === 'tr' ? 'en' : 'tr')}
              className={`flex h-10 px-3 items-center justify-center rounded-xl bg-black/10 hover:bg-black/20 transition-all font-bold text-sm`}
            >
              <Globe className="h-4 w-4 mr-1" />
              {lang.toUpperCase()}
            </button>
            <button
              onClick={garsonCagir}
              disabled={waiterCooldown}
              className={`relative flex h-10 w-10 items-center justify-center rounded-xl transition-all ${
                waiterCooldown ? 'bg-gray-500/20 text-gray-500' : 'bg-amber-500/20 text-amber-500 hover:bg-amber-500/30'
              }`}
              title={t('Garson Çağır', 'Call Waiter')}
            >
              <Bell className="h-5 w-5" />
              {waiterMessage && (
                <span className="absolute -bottom-8 right-0 whitespace-nowrap bg-black text-white text-xs px-2 py-1 rounded">
                  {waiterMessage}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {kategoriler.length > 0 && (
        <div className={`sticky top-0 z-10 ${th.navBg} backdrop-blur-xl border-b ${th.border}`}>
          <div className="flex overflow-x-auto scrollbar-hide px-4 py-3 gap-2">
            {kategoriler.map((kat) => (
              <button
                key={kat.id}
                onClick={() => setAktifKategori(kat.id)}
                className={`shrink-0 rounded-xl px-4 py-2 text-sm font-semibold transition-all ${
                  aktifKategori === kat.id
                    ? `${th.accentBtn} shadow-lg`
                    : `bg-black/5 ${th.textMuted} hover:bg-black/10 hover:${th.text}`
                }`}
              >
                {lang === 'en' ? (kat.ad_en || kat.ad) : kat.ad}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="px-4 py-5 space-y-3">
        {aktifKatUrunler.length === 0 ? (
          <div className="py-16 text-center">
            <ChefHat className={`mx-auto h-12 w-12 ${th.textMuted}`} />
            <p className={`mt-3 ${th.textMuted}`}>{t('Bu kategoride ürün bulunmuyor.', 'No items in this category.')}</p>
          </div>
        ) : (
          aktifKatUrunler.map((urun) => {
            const adet = sepettekiAdet(urun.id);
            const tukendi = urun.stok === 0;
            return (
              <div
                key={urun.id}
                className={`relative flex items-center gap-4 ${th.card} border ${th.border} rounded-2xl p-4 transition-all ${tukendi ? 'opacity-60 grayscale-[0.5]' : 'hover:border-emerald-500/30'}`}
              >
                {urun.resim_url ? (
                  <img
                    src={urun.resim_url}
                    alt={urun.ad}
                    className="h-20 w-20 rounded-xl object-cover shrink-0"
                  />
                ) : (
                  <div className={`flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-black/5`}>
                    <ChefHat className={`h-8 w-8 ${th.textMuted}`} />
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <h3 className={`font-bold ${th.text} text-base flex items-center gap-2`}>
                    {lang === 'en' ? (urun.ad_en || urun.ad) : urun.ad}
                    {tukendi && (
                      <span className="text-[10px] bg-red-500 text-white px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                        {t('Tükendi', 'Sold Out')}
                      </span>
                    )}
                  </h3>
                  {(urun.aciklama || urun.aciklama_en) && (
                    <p className={`text-xs ${th.textMuted} mt-0.5 line-clamp-2`}>
                      {lang === 'en' ? (urun.aciklama_en || urun.aciklama) : urun.aciklama}
                    </p>
                  )}
                  <p className={`text-lg font-black ${th.accentText} mt-1`}>₺{Number(urun.fiyat).toFixed(2)}</p>
                </div>

                <div className="shrink-0">
                  {tukendi ? null : adet === 0 ? (
                    <button
                      onClick={() => sepeteTekle(urun)}
                      className={`flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-600 hover:bg-emerald-500 hover:text-white transition-all`}
                    >
                      <Plus className="h-5 w-5" />
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => sepettenCikar(urun.id)}
                        className="flex h-8 w-8 items-center justify-center rounded-xl bg-red-500/20 text-red-500 hover:bg-red-500/30 transition-all"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className={`w-5 text-center font-black ${th.text} text-base`}>{adet}</span>
                      <button
                        onClick={() => sepeteTekle(urun)}
                        className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-600 hover:bg-emerald-500/30 transition-all"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {sepet.length > 0 && (
        <div className="fixed bottom-6 left-4 right-4 z-20">
          <button
            onClick={() => setSayfa('sepet')}
            className={`w-full flex items-center justify-between rounded-2xl ${th.accentBtn} px-5 py-4 shadow-2xl hover:brightness-110 transition-all`}
          >
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-black/20">
                <ShoppingCart className="h-4 w-4 text-white" />
              </div>
              <span className="font-bold text-white text-sm">{sepetAdedToplam} {t('ürün', 'items')}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-black text-white text-base">₺{sepetToplam.toFixed(2)}</span>
              <ArrowRight className="h-5 w-5 text-white" />
            </div>
          </button>
        </div>
      )}
    </div>
  );
}

function SiparisTakip({ siparisId, masaNo, lang, t, onYeniSiparis, restoranAd, restoranId, th }: {
  siparisId: string | null;
  masaNo: string;
  lang: string;
  t: (tr: string, en: string) => string;
  onYeniSiparis: () => void;
  restoranAd: string;
  restoranId: string;
  th: any;
}) {
  const [durum, setDurum] = useState('bekleniyor');
  const [puanlandi, setPuanlandi] = useState(false);
  const [puan, setPuan] = useState(0);
  const [yorum, setYorum] = useState('');
  const [yorumGonderildi, setYorumGonderildi] = useState(false);

  useEffect(() => {
    if (!siparisId) return;

    const fetchDurum = async () => {
      const { data } = await supabase.from('siparisler').select('durum').eq('id', siparisId).maybeSingle();
      if (data) setDurum(data.durum);
      
      const { data: yorumData } = await supabase.from('yorumlar').select('id').eq('siparis_id', siparisId).maybeSingle();
      if (yorumData) setPuanlandi(true);
    };
    fetchDurum();

    const ch = supabase
      .channel(`siparis-${siparisId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'siparisler',
        filter: `id=eq.${siparisId}`,
      }, (payload) => {
        if (payload.new?.durum) setDurum(payload.new.durum as string);
      })
      .subscribe();

    return () => { ch.unsubscribe(); };
  }, [siparisId]);

  const yorumaGonder = async () => {
    if (puan === 0) return;
    try {
      await supabase.from('yorumlar').insert({
        siparis_id: siparisId,
        restoran_id: restoranId,
        masa_no: masaNo,
        puan,
        yorum: yorum.trim() || null
      });
      setPuanlandi(true);
      setYorumGonderildi(true);
    } catch (e) {
      console.error(e);
    }
  };

  const adimlar = [
    { key: 'bekleniyor', label: t('Sipariş Alındı', 'Order Received'), emoji: '📋', aciklama: t('Siparişiniz restoran tarafından görüldü', 'Order seen by restaurant') },
    { key: 'hazirlaniyor', label: t('Hazırlanıyor', 'Preparing'), emoji: '👨‍🍳', aciklama: t('Siparişiniz mutfakta hazırlanıyor', 'Order is being prepared in the kitchen') },
    { key: 'tamamlandi', label: t('Hazır!', 'Ready!'), emoji: '✅', aciklama: t('Siparişiniz masanıza geliyor', 'Order is coming to your table') },
  ];

  const aktifIndex = adimlar.findIndex((a) => a.key === durum);
  const iptal = durum === 'iptal';

  return (
    <div className={`min-h-screen ${th.bg} flex flex-col items-center justify-center px-5 py-10 overflow-y-auto`}>
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-emerald-400 to-emerald-600 mb-4 shadow-2xl shadow-emerald-500/30">
            <span className="text-3xl">{iptal ? '❌' : adimlar[Math.min(aktifIndex, 2)]?.emoji || '📋'}</span>
          </div>
          <h1 className={`text-2xl font-bold ${th.text}`}>
            {iptal ? t('Sipariş İptal Edildi', 'Order Cancelled') : aktifIndex >= 2 ? t('Siparişiniz Hazır! 🎉', 'Order Ready! 🎉') : t('Sipariş Takibi', 'Order Tracking')}
          </h1>
          <p className={`mt-1 text-sm ${th.textMuted}`}>{restoranAd} · {t('Masa', 'Table')} {masaNo}</p>
        </div>

        {iptal ? (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-center">
            <p className="text-red-500 font-medium">{t('Siparişiniz iptal edildi.', 'Your order was cancelled.')}</p>
            <p className="text-xs text-red-400 mt-2">{t('Detaylı bilgi için personele danışabilirsiniz.', 'Please consult staff for details.')}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {adimlar.map((adim, i) => {
              const gecti = i <= aktifIndex;
              const aktif = i === aktifIndex;
              return (
                <div key={adim.key} className="flex items-start gap-4">
                  <div className="flex flex-col items-center">
                    <div className={`flex h-12 w-12 items-center justify-center rounded-2xl text-xl transition-all duration-500 ${
                      gecti ? 'bg-emerald-500 shadow-lg text-white' : `bg-black/5 border ${th.border} ${th.text}`
                    }`}>
                      {gecti ? adim.emoji : <span className="text-sm">{i + 1}</span>}
                    </div>
                    {i < adimlar.length - 1 && (
                      <div className={`w-0.5 h-8 mt-2 rounded-full transition-all duration-500 ${i < aktifIndex ? 'bg-emerald-500' : 'bg-black/10'}`} />
                    )}
                  </div>
                  <div className="pt-2.5">
                    <p className={`text-sm font-bold transition-all ${gecti ? th.text : th.textMuted}`}>{adim.label}</p>
                    {aktif && (
                      <div className="flex items-center gap-2 mt-1">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                        </span>
                        <p className={`text-xs ${th.accentText}`}>{adim.aciklama}</p>
                      </div>
                    )}
                    {gecti && !aktif && <p className={`text-xs ${th.textMuted} mt-0.5`}>✓ {t('Tamamlandı', 'Completed')}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {durum === 'tamamlandi' && !puanlandi && (
          <div className={`mt-8 rounded-2xl border ${th.border} ${th.card} p-5`}>
            <h3 className={`font-bold ${th.text} mb-3 text-center`}>{t('Siparişinizi Değerlendirin', 'Rate Your Order')}</h3>
            <div className="flex justify-center gap-2 mb-4">
              {[1, 2, 3, 4, 5].map((star) => (
                <button key={star} onClick={() => setPuan(star)} className="focus:outline-none">
                  <Star className={`h-8 w-8 ${puan >= star ? 'text-amber-400 fill-amber-400' : 'text-gray-300'}`} />
                </button>
              ))}
            </div>
            <textarea
              value={yorum}
              onChange={(e) => setYorum(e.target.value)}
              placeholder={t('Yorumunuz (isteğe bağlı)...', 'Your comment (optional)...')}
              className={`w-full rounded-xl border ${th.border} bg-transparent px-4 py-3 text-sm ${th.text} outline-none focus:border-amber-400 focus:ring-2 resize-none mb-3`}
              rows={3}
            />
            <button
              onClick={yorumaGonder}
              disabled={puan === 0}
              className={`w-full rounded-xl ${th.accentBtn} py-3 font-bold disabled:opacity-50`}
            >
              {t('Gönder', 'Submit')}
            </button>
          </div>
        )}

        {yorumGonderildi && (
          <div className={`mt-8 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 text-center`}>
            <p className="text-emerald-500 font-bold">{t('Değerlendirmeniz için teşekkürler!', 'Thank you for your rating!')}</p>
          </div>
        )}

        <div className={`mt-8 rounded-2xl border ${th.border} ${th.card} p-5 flex items-center gap-4`}>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 shrink-0">
            <Clock className="h-5 w-5 text-blue-500" />
          </div>
          <p className={`text-xs ${th.textMuted}`}>
            {durum === 'tamamlandi'
              ? t('Garsonumuz siparişinizi masanıza getiriyor. Afiyet olsun! 😊', 'Waiter is bringing your order. Enjoy! 😊')
              : t('Bu sayfa otomatik güncellenir. Bekleyebilirsiniz.', 'This page updates automatically. Please wait.')}
          </p>
        </div>

        {durum !== 'tamamlandi' && durum !== 'iptal' && (
          <div className="mt-4 flex items-center justify-center gap-2 text-xs text-emerald-500">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            {t('Canlı takip aktif', 'Live tracking active')}
          </div>
        )}

        <button onClick={onYeniSiparis}
          className={`mt-6 w-full rounded-2xl border ${th.border} ${th.card} py-3.5 text-sm font-medium ${th.text} hover:bg-black/5 transition-all`}>
          {t('Yeni Sipariş Ver', 'Place New Order')}
        </button>
      </div>
    </div>
  );
}