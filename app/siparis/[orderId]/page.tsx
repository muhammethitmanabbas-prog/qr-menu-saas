'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import {
  Loader2,
  Clock,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';

interface Urun {
  id: string;
  ad: string;
  fiyat: number;
}

interface SiparisUrun {
  id: string;
  adet: number;
  birim_fiyat: number;
  urun?: Urun;
}

interface Siparis {
  id: string;
  masa_no: string;
  durum: 'bekleniyor' | 'hazirlaniyor' | 'tamamlandi' | 'iptal';
  toplam_tutar: number;
  musteri_notu: string;
  created_at: string;
  siparis_urunleri?: SiparisUrun[];
}

// ✅ TYPE TANIMLAMA (Hata çözümü)
interface DatabasePayload {
  new?: Siparis;
  old?: Siparis;
  eventType?: string;
}

export default function SiparisTrackingPage() {
  const params = useParams();
  const orderId = params.orderId as string;

  const [siparis, setSiparis] = useState<Siparis | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Siparişi getir
  const fetchSiparis = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('siparisler')
        .select(`
          *,
          siparis_urunleri (
            *,
            urun:urunler(*)
          )
        `)
        .eq('id', orderId)
        .maybeSingle();

      if (!error && data) {
        setSiparis(data as Siparis);
      }
    } catch (err) {
      console.error('Sipariş yüklenemedi:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [orderId]);

  useEffect(() => {
    fetchSiparis();

    // ✅ REALTIME SUBSCRIPTION (Type tanımı eklendi)
    const channel = supabase
  .channel('siparis_takip')
  .on(
    'postgres_changes',
    { 
      event: '*', 
      schema: 'public', // EKLEMEN GEREKEN KRİTİK SATIR BU
      table: 'siparisler' 
    },
    (payload) => {
      // payload işlemleri...
    }
  )
  .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [orderId, fetchSiparis]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchSiparis();
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-zinc-950">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
          <p className="text-sm text-neutral-400">Sipariş yükleniyor...</p>
        </div>
      </div>
    );
  }

  if (!siparis) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-zinc-950">
        <div className="text-center">
          <AlertCircle className="mx-auto h-12 w-12 text-red-400" />
          <p className="mt-4 text-lg font-semibold text-white">Sipariş bulunamadı.</p>
        </div>
      </div>
    );
  }

  const durum = siparis.durum;
  const durumlariGoster = [
    { label: 'Alındı', key: 'bekleniyor', icon: '📝' },
    { label: 'Hazırlanıyor', key: 'hazirlaniyor', icon: '👨‍🍳' },
    { label: 'Tamamlandı', key: 'tamamlandi', icon: '✅' },
  ];

  const suanDurumIndex = durumlariGoster.findIndex((d) => d.key === durum);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-zinc-950 px-4 py-8">
      <div className="mx-auto max-w-md">
        {/* Başlık */}
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-white">Siparişiniz Takibi</h1>
          <p className="mt-1 text-xs text-neutral-500">Masa: {siparis.masa_no}</p>
        </div>

        {/* Durum Progress */}
        <div className="mb-8 rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
          <div className="space-y-4">
            {durumlariGoster.map((item, idx) => {
              const isActive = suanDurumIndex >= idx;
              const isCurrent = suanDurumIndex === idx;

              return (
                <div key={item.key}>
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-full text-lg font-bold transition-all ${
                        isActive
                          ? 'bg-emerald-500 text-white'
                          : 'bg-white/10 text-neutral-600'
                      }`}
                    >
                      {item.icon}
                    </div>
                    <div className="flex-1">
                      <p
                        className={`font-medium ${
                          isActive ? 'text-white' : 'text-neutral-500'
                        }`}
                      >
                        {item.label}
                      </p>
                      {isCurrent && durum !== 'tamamlandi' && (
                        <p className="text-xs text-emerald-400 mt-0.5">
                          Şu anda bu aşamasında
                        </p>
                      )}
                    </div>
                  </div>

                  {idx < durumlariGoster.length - 1 && (
                    <div
                      className={`ml-5 h-8 w-0.5 ${
                        isActive ? 'bg-emerald-500' : 'bg-white/10'
                      }`}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Sipariş Detayları */}
        <div className="mb-8 rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
          <h2 className="mb-4 font-semibold text-white">Sipariş Detayları</h2>

          {/* Ürünler */}
          <div className="mb-4 space-y-2 border-b border-white/10 pb-4">
            {siparis.siparis_urunleri?.map((su) => (
              <div key={su.id} className="flex items-center justify-between">
                <span className="text-sm text-neutral-400">
                  {su.urun?.ad} x{su.adet}
                </span>
                <span className="text-sm font-medium text-white">
                  ₺{(su.birim_fiyat * su.adet).toFixed(2)}
                </span>
              </div>
            ))}
          </div>

          {/* Toplam */}
          <div className="mb-4 flex items-center justify-between">
            <span className="font-semibold text-white">Toplam</span>
            <span className="text-2xl font-bold text-emerald-300">
              ₺{siparis.toplam_tutar?.toFixed(2)}
            </span>
          </div>

          {/* Müşteri Notu */}
          {siparis.musteri_notu && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
              <p className="text-xs font-semibold text-amber-300 uppercase mb-1">
                📝 Özel İstek
              </p>
              <p className="text-sm text-amber-200">{siparis.musteri_notu}</p>
            </div>
          )}
        </div>

        {/* Refresh Butonu */}
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-slate-700 to-slate-800 px-4 py-3 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50 transition-all"
        >
          {refreshing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Güncelleniyor...
            </>
          ) : (
            <>
              <RefreshCw className="h-4 w-4" />
              Yenile
            </>
          )}
        </button>

        {/* Tamamlandı Mesajı */}
        {durum === 'tamamlandi' && (
          <div className="mt-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-400" />
            <p className="mt-4 text-lg font-semibold text-emerald-300">
              Siparişiniz Hazır!
            </p>
            <p className="mt-1 text-sm text-emerald-200">
              Lütfen kasa görevlisine başvurun.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}