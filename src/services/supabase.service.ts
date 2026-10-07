import { Injectable, signal, computed } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Store } from './store.service';
import { BillData } from './history.service';
import { MeterPhotoRecord } from './indexed-db.service';

export interface SupabaseSyncState {
  connected: boolean;
  tableReady: boolean;
  checking: boolean;
  syncing: boolean;
  lastSync: string | null;
  message: string;
}

@Injectable({
  providedIn: 'root'
})
export class SupabaseService {
  private client: SupabaseClient | null = null;

  // Supabase Configuration
  readonly supabaseUrl = this.getEnvVar('SUPABASE_URL', 'https://epazfolcfbmedjxlchqb.supabase.co');
  readonly supabaseKey = this.getEnvVar('SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_c--UjXXWohgzQqj_Ky496g_G7h62ned');

  // Reactive State Signals
  readonly isConnected = signal<boolean>(false);
  readonly isTableReady = signal<boolean>(false);
  readonly isChecking = signal<boolean>(false);
  readonly isSyncing = signal<boolean>(false);
  readonly lastSyncTimestamp = signal<string | null>(null);
  readonly statusMessage = signal<string>('Inicializando conexão com Supabase...');
  readonly syncLog = signal<string[]>([]);

  // Computed summary
  readonly syncState = computed<SupabaseSyncState>(() => ({
    connected: this.isConnected(),
    tableReady: this.isTableReady(),
    checking: this.isChecking(),
    syncing: this.isSyncing(),
    lastSync: this.lastSyncTimestamp(),
    message: this.statusMessage()
  }));

  /**
   * Script SQL completo e idempotente para criação das tabelas no Supabase SQL Editor
   */
  readonly schemaSql = `
-- =========================================================================
-- BANCO DE DADOS SHOPPING RATEIO - SUPABASE POSTGRESQL SCHEMA
-- Execute este script no SQL Editor do Supabase (Dashboard -> SQL Editor)
-- =========================================================================

-- 1. Tabela de Lojas / Inquilinos (stores)
CREATE TABLE IF NOT EXISTS public.stores (
  id TEXT PRIMARY KEY,
  luc TEXT NOT NULL,
  contrato TEXT,
  name TEXT NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  deactivated_at TEXT,
  deactivation_reason TEXT,
  uses_luz BOOLEAN DEFAULT TRUE,
  uses_agua BOOLEAN DEFAULT TRUE,
  uses_gas BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Tabela de Fechamentos Mensais de Rateio (bills)
CREATE TABLE IF NOT EXISTS public.bills (
  id TEXT PRIMARY KEY,           -- Ex: 'luz_2026-10' ou 'agua_2026-10'
  type TEXT NOT NULL,            -- 'luz', 'agua', 'gas'
  month TEXT NOT NULL,           -- 'YYYY-MM'
  data JSONB NOT NULL,           -- Leituras, custos e rateio completo
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Tabela de Evidências Fotográficas dos Medidores (meter_photos)
CREATE TABLE IF NOT EXISTS public.meter_photos (
  id TEXT PRIMARY KEY,           -- Ex: 'luz_2026-10_storeId'
  type TEXT NOT NULL,            -- 'luz', 'agua', 'gas'
  month TEXT NOT NULL,           -- 'YYYY-MM'
  store_id TEXT NOT NULL,
  store_name TEXT NOT NULL,
  luc TEXT NOT NULL,
  reading_value NUMERIC DEFAULT 0,
  photo_data_url TEXT NOT NULL,  -- Base64 comprimida com marca d'água
  captured_at TIMESTAMPTZ DEFAULT NOW(),
  note TEXT
);

-- 4. Tabela de Fila de Sincronização Offline (sync_queue)
CREATE TABLE IF NOT EXISTS public.sync_queue (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  type TEXT NOT NULL,
  month TEXT NOT NULL,
  data JSONB NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  synced BOOLEAN DEFAULT FALSE
);

-- 5. Habilitar Row Level Security (RLS) com Acesso Aberto para a Chave Publicada
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meter_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_queue ENABLE ROW LEVEL SECURITY;

-- Políticas de Leitura e Escrita Públicas (Chave Publishable / Anônima)
DROP POLICY IF EXISTS "Public access for stores" ON public.stores;
CREATE POLICY "Public access for stores" ON public.stores FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access for bills" ON public.bills;
CREATE POLICY "Public access for bills" ON public.bills FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access for meter_photos" ON public.meter_photos;
CREATE POLICY "Public access for meter_photos" ON public.meter_photos FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access for sync_queue" ON public.sync_queue;
CREATE POLICY "Public access for sync_queue" ON public.sync_queue FOR ALL USING (true) WITH CHECK (true);

-- 6. Habilitar Realtime nas Tabelas
ALTER PUBLICATION supabase_realtime ADD TABLE public.stores;
ALTER PUBLICATION supabase_realtime ADD TABLE public.bills;
ALTER PUBLICATION supabase_realtime ADD TABLE public.meter_photos;

-- 7. Criar Bucket de Armazenamento de Fotos no Supabase Storage (meter-photos)
INSERT INTO storage.buckets (id, name, public) 
VALUES ('meter-photos', 'meter-photos', true) 
ON CONFLICT (id) DO UPDATE SET public = true;

-- Políticas de Acesso Público ao Bucket de Fotos
DROP POLICY IF EXISTS "Public access to meter-photos" ON storage.objects;
CREATE POLICY "Public access to meter-photos" ON storage.objects 
FOR ALL USING (bucket_id = 'meter-photos') WITH CHECK (bucket_id = 'meter-photos');
`;

  constructor() {
    this.initClient();
    this.checkConnection();
  }

  private getEnvVar(name: string, fallback: string): string {
    if (typeof process !== 'undefined' && process.env) {
      if (process.env[name]) return process.env[name];
      if (process.env[`NEXT_PUBLIC_${name}`]) return process.env[`NEXT_PUBLIC_${name}`];
    }
    if (typeof window !== 'undefined') {
      const w = window as any;
      if (w.process?.env?.[name]) return w.process.env[name];
      if (w.process?.env?.[`NEXT_PUBLIC_${name}`]) return w.process.env[`NEXT_PUBLIC_${name}`];
      if (w[`__${name}__`]) return w[`__${name}__`];
    }
    return fallback;
  }

  private initClient(): SupabaseClient {
    if (!this.client) {
      this.client = createClient(this.supabaseUrl, this.supabaseKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true
        }
      });
    }
    return this.client;
  }

  getClient(): SupabaseClient {
    return this.initClient();
  }

  /**
   * Verifica a conectividade com o projeto Supabase e checa se as tabelas já foram criadas
   */
  async checkConnection(): Promise<{ connected: boolean; tableReady: boolean }> {
    this.isChecking.set(true);
    this.statusMessage.set('Testando conexão com Supabase...');

    try {
      const client = this.getClient();
      // Teste de consulta à tabela stores
      const { data, error } = await client.from('stores').select('id').limit(1);

      if (error) {
        // Se o erro for PGRST205 (tabela não existe no schema), o Supabase está respondendo, mas falta executar o SQL
        if (error.code === 'PGRST205' || error.message.includes('Could not find the table') || error.message.includes('schema cache')) {
          this.isConnected.set(true);
          this.isTableReady.set(false);
          this.statusMessage.set('Supabase conectado! As tabelas precisam ser criadas no SQL Editor do Supabase.');
          this.addLog('Supabase conectado com sucesso, aguardando criação das tabelas via SQL.');
          return { connected: true, tableReady: false };
        }

        console.warn('Erro ao consultar Supabase:', error);
        this.isConnected.set(false);
        this.isTableReady.set(false);
        this.statusMessage.set(`Erro no Supabase: ${error.message}`);
        return { connected: false, tableReady: false };
      }

      this.isConnected.set(true);
      this.isTableReady.set(true);
      this.statusMessage.set('Supabase conectado e sincronizado com o banco de dados PostgreSQL!');
      this.addLog('Conexão ativa com o banco PostgreSQL do Supabase.');
      return { connected: true, tableReady: true };

    } catch (err: any) {
      console.warn('Falha de rede ao conectar com Supabase:', err);
      this.isConnected.set(false);
      this.isTableReady.set(false);
      this.statusMessage.set('Não foi possível conectar ao Supabase (verifique a internet).');
      return { connected: false, tableReady: false };
    } finally {
      this.isChecking.set(false);
    }
  }

  /**
   * Sincroniza lista de lojas locais para o Supabase (Upsert)
   */
  async syncStores(stores: Store[]): Promise<boolean> {
    if (!stores || stores.length === 0) return true;
    try {
      const client = this.getClient();
      const records = stores.map(s => ({
        id: s.id,
        luc: s.luc,
        contrato: s.contrato || null,
        name: s.name,
        active: s.active !== false,
        deactivated_at: s.deactivatedAt || null,
        deactivation_reason: s.deactivationReason || null,
        uses_luz: s.usesLuz !== false,
        uses_agua: s.usesAgua !== false,
        uses_gas: s.usesGas === true,
        updated_at: new Date().toISOString()
      }));

      const { error } = await client.from('stores').upsert(records, { onConflict: 'id' });
      if (error) {
        if (error.code === 'PGRST205') {
          this.isTableReady.set(false);
          return false;
        }
        console.error('Erro ao salvar lojas no Supabase:', error);
        return false;
      }

      this.isTableReady.set(true);
      this.isConnected.set(true);
      this.addLog(`✓ ${stores.length} lojas sincronizadas no Supabase.`);
      this.lastSyncTimestamp.set(new Date().toISOString());
      return true;
    } catch (err) {
      console.error('Falha de rede ao sincronizar lojas no Supabase:', err);
      return false;
    }
  }

  /**
   * Exclui uma loja permanentemente do Supabase
   */
  async deleteStore(id: string): Promise<boolean> {
    try {
      const client = this.getClient();
      const { error } = await client.from('stores').delete().eq('id', String(id));
      if (error) {
        console.warn('Erro ao excluir loja do Supabase:', error);
        return false;
      }
      this.addLog(`🗑️ Loja id "${id}" excluída definitivamente do Supabase.`);
      return true;
    } catch (err) {
      console.error('Falha de rede ao excluir loja no Supabase:', err);
      return false;
    }
  }

  /**
   * Busca todas as lojas cadastradas no Supabase
   */
  async fetchStores(): Promise<Store[] | null> {
    try {
      const client = this.getClient();
      const { data, error } = await client.from('stores').select('*').order('luc', { ascending: true });

      if (error) {
        if (error.code === 'PGRST205') this.isTableReady.set(false);
        return null;
      }

      if (!data) return [];

      return data.map((row: any) => ({
        id: String(row.id),
        luc: String(row.luc),
        contrato: row.contrato ? String(row.contrato) : undefined,
        name: String(row.name),
        active: row.active !== false,
        deactivatedAt: row.deactivated_at || undefined,
        deactivationReason: row.deactivation_reason || undefined,
        usesLuz: row.uses_luz !== false,
        usesAgua: row.uses_agua !== false,
        usesGas: row.uses_gas === true
      }));
    } catch {
      return null;
    }
  }

  /**
   * Salva um fechamento mensal de rateio no Supabase
   */
  async syncBill(type: string, month: string, data: BillData): Promise<boolean> {
    try {
      const client = this.getClient();
      const id = `${type}_${month}`;

      const { error } = await client.from('bills').upsert({
        id,
        type,
        month,
        data,
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' });

      if (error) {
        if (error.code === 'PGRST205') this.isTableReady.set(false);
        console.warn('Erro ao salvar rateio no Supabase:', error);
        return false;
      }

      this.isTableReady.set(true);
      this.isConnected.set(true);
      this.addLog(`✓ Rateio de ${type.toUpperCase()} (${month}) sincronizado na nuvem.`);
      this.lastSyncTimestamp.set(new Date().toISOString());
      return true;
    } catch (err) {
      console.warn('Erro de rede ao salvar rateio no Supabase:', err);
      return false;
    }
  }

  /**
   * Busca um fechamento mensal de rateio do Supabase
   */
  async fetchBill(type: string, month: string): Promise<BillData | null> {
    try {
      const client = this.getClient();
      const id = `${type}_${month}`;
      const { data, error } = await client.from('bills').select('data').eq('id', id).maybeSingle();

      if (error || !data) return null;
      return data.data as BillData;
    } catch {
      return null;
    }
  }

  /**
   * Faz upload da imagem para o Bucket 'meter-photos' no Supabase Storage
   * Retorna a URL pública da imagem ou null se o bucket não estiver disponível
   */
  async uploadPhotoToStorage(photo: MeterPhotoRecord): Promise<string | null> {
    try {
      if (!photo.photoDataUrl || !photo.photoDataUrl.startsWith('data:')) {
        return null;
      }
      const client = this.getClient();
      const base64Data = photo.photoDataUrl.split(',')[1];
      if (!base64Data) return null;

      const binaryStr = atob(base64Data);
      const len = binaryStr.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: 'image/jpeg' });
      const filePath = `${photo.type}/${photo.month}/${photo.storeId}.jpg`;

      const { error } = await client.storage
        .from('meter-photos')
        .upload(filePath, blob, {
          contentType: 'image/jpeg',
          upsert: true
        });

      if (error) {
        // Se bucket ainda não existe no Storage, retorna null para fallback em base64
        return null;
      }

      const { data: publicUrlData } = client.storage
        .from('meter-photos')
        .getPublicUrl(filePath);

      return publicUrlData?.publicUrl || null;
    } catch {
      return null;
    }
  }

  /**
   * Salva foto do medidor no Supabase (Storage + PostgreSQL)
   */
  async syncMeterPhoto(photo: MeterPhotoRecord): Promise<boolean> {
    try {
      const client = this.getClient();

      // Tenta upload para o bucket do Supabase Storage
      const storageUrl = await this.uploadPhotoToStorage(photo);
      const finalPhotoUrl = storageUrl || photo.photoDataUrl;

      const { error } = await client.from('meter_photos').upsert({
        id: photo.id,
        type: photo.type,
        month: photo.month,
        store_id: photo.storeId,
        store_name: photo.storeName,
        luc: photo.luc,
        reading_value: photo.readingValue,
        photo_data_url: finalPhotoUrl,
        captured_at: photo.capturedAt,
        note: photo.note || null
      }, { onConflict: 'id' });

      if (error) {
        if (error.code === 'PGRST205') this.isTableReady.set(false);
        console.error('Erro ao salvar foto na tabela meter_photos:', error);
        return false;
      }

      if (storageUrl) {
        photo.photoDataUrl = storageUrl;
      }
      photo.synced = true;

      this.addLog(`✓ Foto do medidor ${photo.luc} salva no Supabase (${storageUrl ? 'Storage Bucket + ' : ''}PostgreSQL).`);
      return true;
    } catch (e) {
      console.error('Falha geral ao sincronizar foto com Supabase:', e);
      return false;
    }
  }

  /**
   * Exclui foto do medidor permanentemente do Supabase (PostgreSQL e Storage Bucket)
   */
  async deleteMeterPhoto(type: string, month: string, storeId: string): Promise<boolean> {
    const id = `${type}_${month}_${storeId}`;
    try {
      const client = this.getClient();

      // 1. Exclui do banco de dados PostgreSQL
      const { error } = await client.from('meter_photos').delete().eq('id', id);
      if (error) {
        console.warn('Erro ao excluir foto do banco Supabase:', error);
      }

      // 2. Exclui do Supabase Storage (se estiver armazenado no bucket)
      try {
        const filePath = `${type}/${month}/${storeId}.jpg`;
        await client.storage.from('meter-photos').remove([filePath]);
      } catch {}

      this.addLog(`🗑️ Foto do medidor (${id}) excluída do Supabase.`);
      return true;
    } catch (err) {
      console.warn('Falha de rede ao excluir foto do Supabase:', err);
      return false;
    }
  }

  /**
   * Busca fotos de medidores do Supabase para um mês e utilidade
   */
  async fetchMeterPhotos(type: string, month: string): Promise<Record<string, MeterPhotoRecord>> {
    try {
      const client = this.getClient();
      const { data, error } = await client.from('meter_photos')
        .select('*')
        .eq('type', type)
        .eq('month', month);

      if (error || !data) return {};

      const map: Record<string, MeterPhotoRecord> = {};
      for (const row of data) {
        map[row.store_id] = {
          id: row.id,
          type: row.type,
          month: row.month,
          storeId: row.store_id,
          storeName: row.store_name,
          luc: row.luc,
          readingValue: Number(row.reading_value || 0),
          photoDataUrl: row.photo_data_url,
          capturedAt: row.captured_at,
          note: row.note || undefined,
          synced: true
        };
      }
      return map;
    } catch {
      return {};
    }
  }

  /**
   * Busca todos os rateios/fechamentos mensais do Supabase
   */
  async fetchAllBills(): Promise<Record<string, BillData> | null> {
    try {
      const client = this.getClient();
      const { data, error } = await client.from('bills').select('*');
      if (error) {
        if (error.code === 'PGRST205') this.isTableReady.set(false);
        return null;
      }
      if (!data) return {};

      const map: Record<string, BillData> = {};
      for (const row of data) {
        map[row.id] = row.data as BillData;
      }
      return map;
    } catch {
      return null;
    }
  }

  /**
   * Zera / apaga todas as lojas no Supabase
   */
  async clearAllStores(): Promise<boolean> {
    try {
      const client = this.getClient();
      const { error } = await client.from('stores').delete().neq('id', '___impossible___');
      if (error) {
        console.warn('Erro ao zerar tabela stores no Supabase:', error);
        return false;
      }
      this.addLog('🗑️ Todas as lojas foram apagadas do Supabase com sucesso.');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Inscreve-se nas alterações em tempo real da tabela "stores"
   */
  subscribeToStores(onChange: () => void): () => void {
    const client = this.getClient();
    const channel = client
      .channel('realtime_stores_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'stores' },
        (payload) => {
          this.addLog(`⚡ Alteração em tempo real recebida na tabela "stores" (${payload.eventType}).`);
          onChange();
        }
      )
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }

  /**
   * Inscreve-se nas alterações em tempo real da tabela "bills"
   */
  subscribeToBills(onChange: () => void): () => void {
    const client = this.getClient();
    const channel = client
      .channel('realtime_bills_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bills' },
        (payload) => {
          this.addLog(`⚡ Alteração em tempo real recebida na tabela "bills" (${payload.eventType}).`);
          onChange();
        }
      )
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }

  /**
   * Inscreve-se nas alterações em tempo real da tabela "meter_photos"
   */
  subscribeToPhotos(onChange: (payload?: any) => void): () => void {
    const client = this.getClient();
    const channel = client
      .channel('realtime_photos_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'meter_photos' },
        (payload) => {
          this.addLog(`⚡ Alteração em tempo real recebida na tabela "meter_photos" (${payload.eventType}).`);
          onChange(payload);
        }
      )
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }

  private addLog(entry: string) {
    const time = new Date().toLocaleTimeString('pt-BR');
    this.syncLog.update(prev => [`[${time}] ${entry}`, ...prev.slice(0, 49)]);
  }
}
