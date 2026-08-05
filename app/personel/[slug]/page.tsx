'use client';
import { use, useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { BellRing, CheckCircle, Clock, Loader2, Lock, LogOut } from 'lucide-react';

export default function PersonelSayfasi({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [restoran, setRestoran] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Auth State
  const [authOk, setAuthOk] = useState(false);
  const [sifre, setSifre] = useState('');

  // Data State
  const [siparisler, setSiparisler] = useState<any[]>([]);
  const [cagrilar, setCagrilar] = useState<any[]>([]);

  useEffect(() => {
    const fetchRestoran = async () => {
      const { data, error } = await supabase.from('restoranlar').select('*').eq('slug', slug).single();
      if (error || !data) {
        setError('Restoran bulunamadı.');
        setLoading(false);
        return;
      }
      setRestoran(data);
      
      const isAuth = localStorage.getItem(`personelAuth_${data.id}`);
      if (isAuth === 'true') {
        setAuthOk(true);
      }
      setLoading(false);
    };
    fetchRestoran();
  }, [slug]);

  useEffect(() => {
    if (!authOk || !restoran) return;

    const loadData = async () => {
      const { data: sData } = await supabase.from('siparisler').select('*, siparis_urunleri(*, urunler(ad))').eq('restoran_id', restoran.id).neq('durum', 'tamamlandi').order('created_at', { ascending: false });
      if (sData) setSiparisler(sData);

      const { data: cData } = await supabase.from('garson_cagri').select('*').eq('restoran_id', restoran.id).eq('durum', 'bekliyor').order('created_at', { ascending: false });
      if (cData) setCagrilar(cData);
    };

    loadData();

    const ch = supabase.channel('personel-canli')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'siparisler', filter: `restoran_id=eq.${restoran.id}` }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'garson_cagri', filter: `restoran_id=eq.${restoran.id}` }, () => loadData())
      .subscribe();

    return () => { ch.unsubscribe(); };
  }, [authOk, restoran]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!restoran?.personel_sifre) {
      alert('Bu restoran için personel şifresi ayarlanmamış.');
      return;
    }
    if (sifre === restoran.personel_sifre) {
      localStorage.setItem(`personelAuth_${restoran.id}`, 'true');
      setAuthOk(true);
    } else {
      alert('Hatalı şifre!');
    }
  };

  const handleLogout = () => {
    if (restoran) localStorage.removeItem(`personelAuth_${restoran.id}`);
    setAuthOk(false);
    setSifre('');
  };

  const siparisTamamla = async (id: string) => {
    await supabase.from('siparisler').update({ durum: 'tamamlandi' }).eq('id', id);
  };

  const cagriGoruldu = async (id: string) => {
    await supabase.from('garson_cagri').update({ durum: 'goruldu' }).eq('id', id);
  };

  if (loading) return <div className="min-h-screen bg-neutral-950 flex items-center justify-center"><Loader2 className="animate-spin text-emerald-500 w-8 h-8" /></div>;
  if (error) return <div className="min-h-screen bg-neutral-950 flex items-center justify-center text-red-500">{error}</div>;

  if (!authOk) {
    return (
      <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-sm bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl">
          <div className="w-12 h-12 bg-emerald-500/10 rounded-xl flex items-center justify-center mb-6 mx-auto">
            <Lock className="text-emerald-500 w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold text-white text-center mb-2">{restoran?.ad} Personel</h1>
          <p className="text-sm text-neutral-400 text-center mb-6">Devam etmek için personel şifresini girin.</p>
          <form onSubmit={handleLogin} className="space-y-4">
            <input type="password" placeholder="Şifre" value={sifre} onChange={(e) => setSifre(e.target.value)} required
              className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white focus:border-emerald-500 outline-none" />
            <button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl transition-colors">Giriş Yap</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-white p-4">
      <header className="flex items-center justify-between bg-neutral-900 border border-neutral-800 p-4 rounded-2xl mb-6 sticky top-4 z-10 shadow-lg">
        <div>
          <h1 className="font-bold text-emerald-400">{restoran?.ad}</h1>
          <p className="text-xs text-neutral-400">Personel Paneli</p>
        </div>
        <button onClick={handleLogout} className="p-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20">
          <LogOut className="w-5 h-5" />
        </button>
      </header>

      <div className="space-y-6">
        <section>
          <div className="flex items-center gap-2 mb-4">
            <BellRing className="w-5 h-5 text-amber-500" />
            <h2 className="text-lg font-bold">Bekleyen Çağrılar</h2>
            <span className="bg-amber-500 text-black text-xs font-bold px-2 py-0.5 rounded-full">{cagrilar.length}</span>
          </div>
          {cagrilar.length === 0 ? <p className="text-neutral-500 text-sm">Çağrı yok.</p> : (
            <div className="grid gap-3">
              {cagrilar.map(c => (
                <div key={c.id} className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-amber-400">Masa {c.masa_no}</h3>
                    <p className="text-xs text-neutral-400">{new Date(c.created_at).toLocaleTimeString()}</p>
                  </div>
                  <button onClick={() => cagriGoruldu(c.id)} className="bg-amber-500 hover:bg-amber-400 text-black px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" /> Görüldü
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-5 h-5 text-emerald-500" />
            <h2 className="text-lg font-bold">Aktif Siparişler</h2>
            <span className="bg-emerald-500 text-black text-xs font-bold px-2 py-0.5 rounded-full">{siparisler.length}</span>
          </div>
          {siparisler.length === 0 ? <p className="text-neutral-500 text-sm">Aktif sipariş yok.</p> : (
            <div className="grid gap-4">
              {siparisler.map(s => (
                <div key={s.id} className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3 border-b border-neutral-800 pb-3">
                    <div>
                      <h3 className="font-bold text-white text-lg">Masa {s.masa_no}</h3>
                      <p className="text-xs text-neutral-400">{new Date(s.created_at).toLocaleTimeString()}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-black text-emerald-400">₺{s.toplam_tutar}</p>
                      <span className="text-[10px] uppercase tracking-wider text-blue-400 font-bold bg-blue-500/10 px-2 py-1 rounded">{s.durum}</span>
                    </div>
                  </div>
                  <ul className="space-y-2 mb-4">
                    {s.siparis_urunleri?.map((item: any) => (
                      <li key={item.id} className="flex justify-between text-sm">
                        <span className="text-neutral-300">{item.adet}x {item.urunler?.ad}</span>
                      </li>
                    ))}
                  </ul>
                  {s.musteri_notu && (
                    <div className="bg-neutral-950 p-2 rounded-lg text-xs text-neutral-400 mb-4 border border-neutral-800">
                      <span className="font-bold text-white">Not:</span> {s.musteri_notu}
                    </div>
                  )}
                  <button onClick={() => siparisTamamla(s.id)} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2">
                    <CheckCircle className="w-5 h-5" /> Teslim Edildi
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
