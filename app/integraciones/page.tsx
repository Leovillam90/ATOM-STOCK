'use client';

import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export default function IntegracionesPage() {
  const [userAuth, setUserAuth] = useState<any>(null);
  const [cuentasVentas, setCuentasVentas] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filtroPlataforma, setFiltroPlataforma] = useState<'TODAS' | 'DROPI' | 'VENDELO' | 'MASTER'>('TODAS');

  // Modal Configuración de Cuenta de Ventas (Para Vendelo y Master)
  const [showModal, setShowModal] = useState(false);
  const [selectedCanal, setSelectedCanal] = useState<any>(null);
  const [nombreCuenta, setNombreCuenta] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [webhookToken, setWebhookToken] = useState('');
  const [estadoConexion, setEstadoConexion] = useState<'CONECTADO' | 'DESCONECTADO'>('CONECTADO');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const savedUser = localStorage.getItem('atom_user_session');
    if (savedUser) {
      setUserAuth(JSON.parse(savedUser));
    }
  }, []);

  // Escuchar 'integraciones' en Firestore
  useEffect(() => {
    if (!userAuth || !userAuth.id_cuenta) return;

    const q = query(collection(db, 'integraciones'), where('id_cuenta', '==', userAuth.id_cuenta));
    const unsub = onSnapshot(q, (snap) => {
      setCuentasVentas(snap.docs.map(d => ({ ...d.data(), id_doc: d.id })));
    });

    return () => unsub();
  }, [userAuth]);

  // Integraciones Nativas de Cuentas de Ventas
  const canalesNativos = [
    {
      id_canal: 'DROPI',
      nombre: 'Dropi',
      tipo: 'DROPI',
      descripcion: 'Sincronización mediante OAuth de ATOM. Permite el intercambio de guías, pedidos e inventario en tiempo real.',
      colorBadge: '#0DE8C0',
      requiereLoginAtom: true
    },
    {
      id_canal: 'VENDELO',
      nombre: 'Vendelo',
      tipo: 'VENDELO',
      descripcion: 'Conexión mediante API Key para orquestación de envíos contraentrega, novedades y recaudos.',
      colorBadge: '#C81FDA',
      requiereLoginAtom: false
    },
    {
      id_canal: 'MASTER',
      nombre: 'Master',
      tipo: 'MASTER',
      descripcion: 'Cuenta principal de consolidación para delegación de stock multibodega y facturación centralizada.',
      colorBadge: '#6884C5',
      requiereLoginAtom: false
    }
  ];

  // Acción al presionar Vincular o Configurar
  const handleVincularCanal = (canal: any) => {
    if (canal.requiereLoginAtom) {
      // 1. Lógica especial para DROPI: Redireccionar al login de ATOM con parámetros de retorno y Handshake OAuth
      const idCuenta = userAuth?.id_cuenta || 'DEMO';
      const redirectUri = window.location.href;
      
      const atomLoginUrl = `https://atomapp.com.co/login?grant_type=authorization_code&client_id=DROPI&account_id=${encodeURIComponent(idCuenta)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=read_write_inventory_orders`;
      
      // Redirigir al login oficial de ATOM para autorizar la entrega de datos a DROPI
      window.location.href = atomLoginUrl;
    } else {
      // 2. Lógica para Vendelo y Master: Abrir Modal de Credenciales API
      const cuentaExistente = cuentasVentas.find(i => i.id_canal === canal.id_canal);
      setSelectedCanal(canal);
      setNombreCuenta(cuentaExistente?.nombre_cuenta || `Cuenta ${canal.nombre}`);
      setApiKey(cuentaExistente?.api_key || '');
      setWebhookToken(cuentaExistente?.webhook_token || '');
      setEstadoConexion(cuentaExistente?.estado || 'CONECTADO');
      setShowModal(true);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCanal) return;

    setLoading(true);
    try {
      const docId = `INT_${selectedCanal.id_canal}_${userAuth.id_cuenta}`;

      const cuentaData = {
        id_cuenta: userAuth.id_cuenta,
        id_canal: selectedCanal.id_canal,
        nombre_canal: selectedCanal.nombre,
        nombre_cuenta: nombreCuenta.trim(),
        tipo: selectedCanal.tipo,
        api_key: apiKey.trim(),
        webhook_token: webhookToken.trim(),
        estado: estadoConexion,
        ultima_sincronizacion: new Date().toISOString()
      };

      await setDoc(doc(db, 'integraciones', docId), cuentaData, { merge: true });
      setShowModal(false);
      alert(`¡Cuenta de Ventas ${selectedCanal.nombre} vinculada correctamente!`);
    } catch (err: any) {
      console.error(err);
      alert('Error al vincular la cuenta: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Conteos
  const totalConectadas = cuentasVentas.filter(i => i.estado === 'CONECTADO').length;

  return (
    <div className="min-h-screen bg-[#1D2935] text-slate-100 p-6 md:p-10 font-sans relative pb-20">
      
      {/* CABECERA PRINCIPAL */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 border-b border-slate-700/60 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-[#0DE8C0] animate-pulse"></span>
            <span className="text-[11px] font-satoshi-black text-[#0DE8C0] uppercase tracking-wider">
              Conexión Directa de Cuentas Comercializadoras
            </span>
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight font-satoshi-black">
            Cuentas de Ventas e Integraciones
          </h1>
          <p className="text-xs text-[#A0AEC0] mt-1 font-satoshi-regular max-w-xl">
            Vincula tus cuentas comerciales de DROPI, Vendelo y Master para la ingesta y entrega automática de datos, pedidos y guías.
          </p>
        </div>

        {/* CTA PRINCIPAL (SEA GREEN) */}
        <button
          type="button"
          onClick={() => handleVincularCanal(canalesNativos[0])}
          className="bg-[#0DE8C0] hover:bg-[#0bcfa8] text-[#1D2935] font-satoshi-black px-6 py-3.5 rounded-xl text-xs uppercase tracking-wider transition-all duration-300 shadow-lg shadow-emerald-950/40 flex items-center gap-2 shrink-0"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
          <span>Vincular DROPI via ATOM</span>
        </button>
      </div>

      {/* METRICAS SUPERIORES (GRID DE 3 COLUMNAS IDÉNTICAS) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        
        {/* TARJETA 1: CANALES REGISTRADOS */}
        <div className="bg-[#253443] border border-slate-700/50 rounded-2xl p-5 shadow-xl flex flex-col justify-between relative overflow-hidden h-36">
          <div className="flex justify-between items-start">
            <span className="text-[11px] font-satoshi-black text-[#0DE8C0] uppercase tracking-wider">
              INTEGRACIONES NATIVAS
            </span>
            <div className="w-10 h-10 rounded-full bg-[#0DE8C0]/10 flex items-center justify-center text-[#0DE8C0]">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
          </div>
          <div className="my-1 flex items-baseline gap-3">
            <span className="text-4xl font-black text-white font-satoshi-black">
              {canalesNativos.length}
            </span>
            <span className="text-sm font-satoshi-regular text-slate-200">
              Plataformas Soportadas
            </span>
          </div>
          <p className="text-xs text-[#A0AEC0] font-satoshi-regular truncate">
            DROPI, Vendelo y Master
          </p>
        </div>

        {/* TARJETA 2: CUENTAS ACTIVAS */}
        <div className="bg-[#253443] border border-slate-700/50 rounded-2xl p-5 shadow-xl flex flex-col justify-between relative overflow-hidden h-36">
          <div className="flex justify-between items-start">
            <span className="text-[11px] font-satoshi-black text-[#6884C5] uppercase tracking-wider">
              CUENTAS VINCULADAS
            </span>
            <div className="w-10 h-10 rounded-full bg-[#6884C5]/10 flex items-center justify-center text-[#6884C5]">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <div className="my-1 flex items-baseline gap-3">
            <span className="text-4xl font-black text-white font-satoshi-black">
              {totalConectadas}
            </span>
            <span className="text-sm font-satoshi-regular text-slate-200">
              {totalConectadas === 1 ? 'Cuenta Operativa' : 'Cuentas Operativas'}
            </span>
          </div>
          <p className="text-xs text-[#A0AEC0] font-satoshi-regular truncate">
            Recepción activa de pedidos y ordenes
          </p>
        </div>

        {/* TARJETA 3: ESTADO WEBOOK */}
        <div className="bg-[#253443] border border-slate-700/50 rounded-2xl p-5 shadow-xl flex flex-col justify-between relative overflow-hidden h-36">
          <div className="flex justify-between items-start">
            <span className="text-[11px] font-satoshi-black text-[#C81FDA] uppercase tracking-wider">
              ENTREGA DE DATOS
            </span>
            <div className="w-10 h-10 rounded-full bg-[#C81FDA]/10 flex items-center justify-center text-[#C81FDA]">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
          </div>
          <div className="my-1 flex items-baseline gap-3">
            <span className="text-4xl font-black text-white font-satoshi-black">
              OAuth / API
            </span>
          </div>
          <p className="text-xs text-[#A0AEC0] font-satoshi-regular truncate">
            Intercambio seguro de datos via ATOM Auth
          </p>
        </div>

      </div>

      {/* BARRA DE BÚSQUEDA LIMPIA */}
      <div className="bg-[#253443] border border-slate-700/50 rounded-2xl p-3 mb-8 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-80">
          <svg className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input 
            type="text" 
            className="w-full bg-[#1D2935] border border-slate-700 focus:border-[#0DE8C0] rounded-xl pl-10 pr-3 py-2.5 text-xs text-white placeholder-[#A0AEC0] focus:outline-none font-satoshi-regular transition"
            placeholder="Buscar por Nombre de Cuenta o Canal..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
          <button
            type="button"
            onClick={() => setFiltroPlataforma('TODAS')}
            className={`px-3.5 py-2 rounded-xl text-xs font-satoshi-black transition ${
              filtroPlataforma === 'TODAS'
                ? 'bg-[#0DE8C0] text-[#1D2935]'
                : 'bg-[#1D2935] text-[#A0AEC0] hover:text-white border border-slate-700/60'
            }`}
          >
            Todas ({canalesNativos.length})
          </button>
        </div>
      </div>

      {/* GRID DE CUENTAS DE VENTAS NATIVAS (3 COLUMNAS) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {canalesNativos.map((canal, idx) => {
          const cuentaInfo = cuentasVentas.find(i => i.id_canal === canal.id_canal);
          const isConectado = cuentaInfo?.estado === 'CONECTADO';

          return (
            <div
              key={canal.id_canal || idx}
              className="group relative bg-[#253443] border border-slate-700/50 rounded-2xl p-6 shadow-xl flex flex-col justify-between transition-all duration-300 hover:border-slate-600"
            >
              <div>
                <div className="flex justify-between items-start mb-4">
                  <span className="text-[10px] font-satoshi-black uppercase px-2.5 py-1 rounded-lg tracking-wider bg-[#1D2935] text-slate-300 border border-slate-700">
                    {canal.tipo}
                  </span>

                  <span className={`text-[10px] font-satoshi-black px-2.5 py-0.5 rounded-full ${
                    isConectado 
                      ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/40' 
                      : 'bg-slate-800 text-slate-400 border border-slate-700'
                  }`}>
                    {isConectado ? '✓ Activa' : '✕ No Vinculada'}
                  </span>
                </div>

                <div className="flex items-center gap-3 mb-3">
                  <div className="w-12 h-12 rounded-xl bg-[#1D2935] border border-slate-700 flex items-center justify-center font-satoshi-black text-white text-lg shrink-0">
                    {canal.nombre.charAt(0)}
                  </div>
                  <div className="truncate">
                    <h3 className="font-black text-base text-white font-satoshi-black uppercase tracking-wide truncate">
                      {canal.nombre}
                    </h3>
                    <p className="text-[10px] text-[#0DE8C0] font-satoshi-black truncate">
                      {cuentaInfo?.nombre_cuenta || (canal.requiereLoginAtom ? 'Autenticación Login ATOM' : 'Pendiente de Configurar')}
                    </p>
                  </div>
                </div>

                <p className="text-xs text-[#A0AEC0] font-satoshi-regular mt-2 leading-relaxed">
                  {canal.descripcion}
                </p>
              </div>

              {/* BOTÓN PRINCIPAL DE CONEXIÓN */}
              <div className="mt-6 pt-4 border-t border-slate-700/60 flex items-center justify-between">
                <span className="text-[10px] text-slate-400 font-satoshi-regular">
                  {cuentaInfo?.ultima_sincronizacion ? `Sincro: ${new Date(cuentaInfo.ultima_sincronizacion).toLocaleDateString()}` : 'Sin Vincular'}
                </span>

                <button
                  type="button"
                  onClick={() => handleVincularCanal(canal)}
                  className="bg-[#1D2935] hover:bg-[#15202b] text-[#0DE8C0] border border-[#0DE8C0]/40 font-satoshi-black px-4 py-2 rounded-xl text-xs uppercase tracking-wider transition flex items-center gap-1.5"
                >
                  <span>{canal.requiereLoginAtom ? 'Vincular via Login ATOM' : (isConectado ? 'Ajustes Cuenta' : 'Vincular API')}</span>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>

            </div>
          );
        })}
      </div>

      {/* MODAL CONFIGURACIÓN DE CUENTA DE VENTAS (PARA VENDELO Y MASTER) */}
      {showModal && selectedCanal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#253443] border border-slate-700 rounded-2xl p-6 w-full max-w-lg shadow-2xl font-sans">
            <div className="flex justify-between items-center mb-6 border-b border-slate-700/60 pb-3">
              <h3 className="text-lg font-satoshi-black text-white uppercase tracking-wide">
                Configurar Cuenta {selectedCanal.nombre}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-white transition">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSaveConfig} className="space-y-4">
              <div>
                <label className="block text-xs font-satoshi-black text-white uppercase tracking-wider mb-1.5">
                  Nombre Identificador de la Cuenta *
                </label>
                <input 
                  type="text"
                  className="w-full bg-[#1D2935] border border-slate-700 focus:border-[#0DE8C0] rounded-xl p-3 text-xs text-white focus:outline-none font-satoshi-regular"
                  placeholder={`Ej: Cuenta ${selectedCanal.nombre} Principal`}
                  value={nombreCuenta}
                  onChange={(e) => setNombreCuenta(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-satoshi-black text-white uppercase tracking-wider mb-1.5">
                  API Token / Secret Key de la Cuenta *
                </label>
                <input 
                  type="text"
                  className="w-full bg-[#1D2935] border border-slate-700 focus:border-[#0DE8C0] rounded-xl p-3 text-xs text-white font-mono focus:outline-none"
                  placeholder="token_xxxxxxxxxxxxxxxxxxxx"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-satoshi-black text-white uppercase tracking-wider mb-1.5">
                  Webhook Signature Token
                </label>
                <input 
                  type="text"
                  className="w-full bg-[#1D2935] border border-slate-700 focus:border-[#0DE8C0] rounded-xl p-3 text-xs text-white font-mono focus:outline-none"
                  placeholder="whsec_xxxxxxxxxxxxxxxx"
                  value={webhookToken}
                  onChange={(e) => setWebhookToken(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-satoshi-black text-white uppercase tracking-wider mb-1.5">
                  Estado de Operación
                </label>
                <select
                  className="w-full bg-[#1D2935] border border-slate-700 focus:border-[#0DE8C0] rounded-xl p-3 text-xs text-white font-satoshi-black focus:outline-none"
                  value={estadoConexion}
                  onChange={(e: any) => setEstadoConexion(e.target.value)}
                >
                  <option value="CONECTADO">✓ Activa / Recibiendo Pedidos</option>
                  <option value="DESCONECTADO">✕ Pausada / Inactiva</option>
                </select>
              </div>

              <div className="flex gap-3 pt-4 border-t border-slate-700/60 mt-6">
                <button 
                  type="button" 
                  onClick={() => setShowModal(false)}
                  className="flex-1 bg-[#1D2935] text-slate-300 hover:text-white font-satoshi-black py-3 rounded-xl text-xs uppercase"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  disabled={loading}
                  className="flex-1 bg-[#0DE8C0] hover:bg-[#0bcfa8] text-[#1D2935] font-satoshi-black py-3 rounded-xl text-xs uppercase tracking-wider shadow-lg disabled:opacity-50"
                >
                  {loading ? 'Guardando...' : 'Guardar Cuenta'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}