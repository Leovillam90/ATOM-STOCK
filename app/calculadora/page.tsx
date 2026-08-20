'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, doc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export default function CalculadoraPage() {
  const [userAuth, setUserAuth] = useState<any>(null);
  const [productos, setProductos] = useState<any[]>([]);
  const [sucursales, setSucursales] = useState<any[]>([]);

  // ==========================================
  // ESTADOS DEL SIMULADOR UNITARIO
  // ==========================================
  const [simCanal, setSimCanal] = useState<'POS' | 'MAYOR' | 'DROKO'>('DROKO');
  const [simCogs, setSimCogs] = useState<number>(45000); // Costo Producto
  const [simOps, setSimOps] = useState<number>(8000);   // Picking / Operación
  const [simOtros, setSimOtros] = useState<number>(2000); // Otros Gastos
  const [simMargenDeseado, setSimMargenDeseado] = useState<number>(25); // Margen Neto %
  const [simDevRate, setSimDevRate] = useState<number>(18); // % Devolución Logística
  const [simLossRate, setSimLossRate] = useState<number>(5);  // % Merma
  const [simPlatFee, setSimPlatFee] = useState<number>(3);    // % Comisión Pasarela / Plataforma

  // ==========================================
  // ESTADOS DE AUDITORÍA DE CATÁLOGO
  // ==========================================
  const [auditCanal, setAuditCanal] = useState<'POS' | 'MAYOR' | 'DROKO'>('DROKO');
  const [auditSearch, setAuditSearch] = useState('');
  const [auditFiltroSalud, setAuditFiltroSalud] = useState<'TODOS' | 'SALUDABLE' | 'ALERTA' | 'PERDIDA'>('TODOS');
  const [updatingSku, setUpdatingSku] = useState<string | null>(null);

  const formatoCOP = (v: number) =>
    new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(v || 0);

  useEffect(() => {
    const savedUser = localStorage.getItem('atom_user_session');
    if (savedUser) setUserAuth(JSON.parse(savedUser));
  }, []);

  // Cargar productos y sucursales de Firebase
  useEffect(() => {
    if (!userAuth || !userAuth.id_cuenta) return;

    const qProd = query(collection(db, 'productos'), where('id_cuenta', '==', userAuth.id_cuenta));
    const unsubProd = onSnapshot(qProd, (snap) => setProductos(snap.docs.map(d => ({ ...d.data(), sku: d.id }))));

    const qSuc = query(collection(db, 'sucursales'), where('id_cuenta', '==', userAuth.id_cuenta));
    const unsubSuc = onSnapshot(qSuc, (snap) => setSucursales(snap.docs.map(d => ({ ...d.data(), id_doc: d.id }))));

    return () => {
      unsubProd();
      unsubSuc();
    };
  }, [userAuth]);

  // Autoconfigurar parámetros del simulador según el canal seleccionado
  useEffect(() => {
    if (simCanal === 'POS') {
      setSimDevRate(0);
      setSimLossRate(2);
      setSimPlatFee(1.5);
      setSimMargenDeseado(30);
    } else if (simCanal === 'MAYOR') {
      setSimDevRate(1);
      setSimLossRate(1);
      setSimPlatFee(0);
      setSimMargenDeseado(15);
    } else {
      // DROKO / E-COMMERCE
      setSimDevRate(18);
      setSimLossRate(5);
      setSimPlatFee(3.5);
      setSimMargenDeseado(25);
    }
  }, [simCanal]);

  // ==========================================
  // 🧮 MATEMÁTICA DE BLINDAJE FINANCIERO (SIMULADOR)
  // ==========================================
  const calculoSimulador = useMemo(() => {
    const cogs = Number(simCogs) || 0;
    const ops = Number(simOps) || 0;
    const otros = Number(simOtros) || 0;
    const mTarget = (Number(simMargenDeseado) || 0) / 100;
    const devPct = (Number(simDevRate) || 0) / 100;
    const lossPct = (Number(simLossRate) || 0) / 100;
    const feePct = (Number(simPlatFee) || 0) / 100;

    const costoDirecto = cogs + ops + otros;
    
    // Fugas financieras: Costo de flete ida+vuelta en devolución + pérdida por merma
    const provDevolucion = (ops * 2) * devPct;
    const provMerma = (cogs + ops) * lossPct;
    const totalProvisionFuga = provDevolucion + provMerma;

    const costoRealTotal = costoDirecto + totalProvisionFuga;

    // Fórmula con Blindaje de Pasarela / Comisión y Margen Neto sobre Venta
    const denominador = 1 - mTarget - feePct;
    const precioSugerido = denominador > 0 ? (costoRealTotal / denominador) : (costoRealTotal * 2);
    
    const comisionMonto = precioSugerido * feePct;
    const ingresoNeto = precioSugerido - comisionMonto;
    const utilidadNeta = ingresoNeto - costoRealTotal;
    const factorBlindaje = costoDirecto > 0 ? (precioSugerido / costoDirecto) : 1;

    return {
      costoDirecto,
      totalProvisionFuga,
      costoRealTotal,
      precioSugerido,
      comisionMonto,
      utilidadNeta,
      factorBlindaje
    };
  }, [simCogs, simOps, simOtros, simMargenDeseado, simDevRate, simLossRate, simPlatFee]);

  // ==========================================
  // 🔍 DIAGNÓSTICO FINANCIERO MASIVO (FIREBASE)
  // ==========================================
  const auditoriaCatalogo = useMemo(() => {
    let saludables = 0;
    let alertas = 0;
    let perdidas = 0;

    // Parámetros estándar según el canal auditado
    let feePct = 0;
    let devPct = 0;
    let lossPct = 0;
    let targetM = 0.20;

    if (auditCanal === 'POS') {
      feePct = 0.015; devPct = 0; lossPct = 0.02; targetM = 0.25;
    } else if (auditCanal === 'MAYOR') {
      feePct = 0; devPct = 0.01; lossPct = 0.01; targetM = 0.12;
    } else {
      feePct = 0.035; devPct = 0.18; lossPct = 0.05; targetM = 0.20;
    }

    const listaAnalizada = productos.map(p => {
      const cogs = Number(p.costo_importacion) || 0;
      const ops = Number(p.costo_fulfilment) || 0;
      const costoDirecto = cogs + ops;

      const provFuga = ((ops * 2) * devPct) + ((cogs + ops) * lossPct);
      const costoReal = costoDirecto + provFuga;

      // Obtener el precio según el canal auditado
      let precioActual = 0;
      if (auditCanal === 'POS') precioActual = Number(p.plocal || p.precio) || 0;
      else if (auditCanal === 'MAYOR') precioActual = Number(p.pmayor) || 0;
      else precioActual = Number(p.pdroko || p.pecom || p.precio) || 0;

      const comision = precioActual * feePct;
      const ingresoNeto = precioActual - comision;
      const utilidadNeta = ingresoNeto - costoReal;
      const margenNetoReal = precioActual > 0 ? (utilidadNeta / precioActual) : -1;

      // Cálculo del precio blindado sugerido
      const den = 1 - targetM - feePct;
      const precioSugerido = den > 0 ? (costoReal / den) : (costoReal * 2);

      let estadoSalud: 'SALUDABLE' | 'ALERTA' | 'PERDIDA' = 'SALUDABLE';
      if (margenNetoReal < 0 || precioActual === 0) {
        estadoSalud = 'PERDIDA';
        perdidas++;
      } else if (margenNetoReal < targetM) {
        estadoSalud = 'ALERTA';
        alertas++;
      } else {
        estadoSalud = 'SALUDABLE';
        saludables++;
      }

      return {
        ...p,
        precioActual,
        costoReal,
        utilidadNeta,
        margenNetoReal: margenNetoReal * 100,
        precioSugerido,
        estadoSalud
      };
    });

    // Filtros de búsqueda y estado
    const filtrados = listaAnalizada.filter(p => {
      const matchQ = String(p.nombre || '').toLowerCase().includes(auditSearch.toLowerCase()) ||
                     String(p.sku || '').toLowerCase().includes(auditSearch.toLowerCase());
      if (!matchQ) return false;

      if (auditFiltroSalud === 'SALUDABLE') return p.estadoSalud === 'SALUDABLE';
      if (auditFiltroSalud === 'ALERTA') return p.estadoSalud === 'ALERTA';
      if (auditFiltroSalud === 'PERDIDA') return p.estadoSalud === 'PERDIDA';
      return true;
    });

    return {
      filtrados,
      totalCount: productos.length,
      saludables,
      alertas,
      perdidas
    };
  }, [productos, auditCanal, auditSearch, auditFiltroSalud]);

  // Actualizar precio de un producto en Firebase con el valor blindado sugerido
  const handleAplicarPrecioSugerido = async (p: any) => {
    if (!p.sku) return;
    setUpdatingSku(p.sku);
    try {
      const fieldName = auditCanal === 'POS' ? 'plocal' : (auditCanal === 'MAYOR' ? 'pmayor' : 'pdroko');
      
      const updateData: any = {
        [fieldName]: Math.round(p.precioSugerido),
        fecha_actualizacion: new Date().toISOString()
      };

      if (auditCanal === 'POS') updateData.precio = Math.round(p.precioSugerido);

      await setDoc(doc(db, 'productos', p.sku), updateData, { merge: true });
      alert(`¡Precio de ${p.nombre} actualizado correctamente para el canal ${auditCanal}!`);
    } catch (err: any) {
      alert('Error al actualizar el precio: ' + err.message);
    } finally {
      setUpdatingSku(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#F4F5F7] text-gray-800 p-6 md:p-10 font-sans relative pb-20">
      
      {/* CABECERA PRINCIPAL */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 border-b border-gray-200 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2.5 h-2.5 rounded-full bg-[#FFD800] border border-gray-800 animate-pulse"></span>
            <span className="text-[11px] font-satoshi-black text-gray-900 uppercase tracking-wider font-bold">
              Inteligencia Financiera & Rentabilidad
            </span>
          </div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight font-satoshi-black">
            SIMULADOR & BLINDAJE DE PRECIOS
          </h1>
          <p className="text-xs text-gray-500 mt-1 font-satoshi-regular max-w-2xl">
            Calcula precios de venta reales absorbiendo comisiones de pasarela, costos de logística inversa y mermas operativas para proteger la utilidad neta de tu empresa.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-12">
        
        {/* PANEL IZQUIERDO: SIMULADOR INTERACTIVO UNITARIO */}
        <aside className="lg:col-span-5 space-y-6">
          <div className="bg-[#222222] text-white rounded-2xl p-6 shadow-md border border-gray-800 space-y-5">
            <div className="flex justify-between items-center border-b border-gray-800 pb-3">
              <h2 className="text-sm font-satoshi-black uppercase text-[#FFD800] tracking-wider font-bold flex items-center gap-2">
                <span>⚡</span>
                <span>Simulador de Blindaje</span>
              </h2>

              {/* TABS DE CANAL */}
              <div className="flex gap-1 bg-[#1A1A1A] p-1 rounded-xl border border-gray-800">
                <button
                  type="button"
                  onClick={() => setSimCanal('POS')}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-satoshi-black transition ${
                    simCanal === 'POS' ? 'bg-[#FFD800] text-[#222222] font-bold' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  POS
                </button>
                <button
                  type="button"
                  onClick={() => setSimCanal('MAYOR')}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-satoshi-black transition ${
                    simCanal === 'MAYOR' ? 'bg-[#FFD800] text-[#222222] font-bold' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Mayor
                </button>
                <button
                  type="button"
                  onClick={() => setSimCanal('DROKO')}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-satoshi-black transition ${
                    simCanal === 'DROKO' ? 'bg-[#FFD800] text-[#222222] font-bold' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Droko
                </button>
              </div>
            </div>

            {/* INPUTS DEL SIMULADOR */}
            <div className="space-y-4 text-xs font-satoshi-regular">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-satoshi-black text-gray-400 uppercase mb-1">Costo Producto (COP)</label>
                  <input
                    type="number"
                    min="0"
                    value={simCogs}
                    onChange={(e) => setSimCogs(Number(e.target.value))}
                    className="w-full bg-[#1A1A1A] border border-gray-700 rounded-xl p-2.5 font-mono text-white focus:border-[#FFD800] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-satoshi-black text-gray-400 uppercase mb-1">Picking / Empaque (COP)</label>
                  <input
                    type="number"
                    min="0"
                    value={simOps}
                    onChange={(e) => setSimOps(Number(e.target.value))}
                    className="w-full bg-[#1A1A1A] border border-gray-700 rounded-xl p-2.5 font-mono text-white focus:border-[#FFD800] focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-satoshi-black text-gray-400 uppercase mb-1">Otros Gastos (COP)</label>
                  <input
                    type="number"
                    min="0"
                    value={simOtros}
                    onChange={(e) => setSimOtros(Number(e.target.value))}
                    className="w-full bg-[#1A1A1A] border border-gray-700 rounded-xl p-2.5 font-mono text-white focus:border-[#FFD800] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-satoshi-black text-[#FFD800] uppercase mb-1">Margen Neto Deseado (%)</label>
                  <input
                    type="number"
                    min="1"
                    max="80"
                    value={simMargenDeseado}
                    onChange={(e) => setSimMargenDeseado(Number(e.target.value))}
                    className="w-full bg-[#1A1A1A] border border-gray-700 rounded-xl p-2.5 font-mono text-white focus:border-[#FFD800] focus:outline-none text-right font-bold"
                  />
                </div>
              </div>

              {/* SECCIÓN FACTORES DE FUGA */}
              <div className="bg-[#1A1A1A] p-4 rounded-xl border border-gray-800 space-y-3">
                <span className="block text-[10px] font-satoshi-black text-red-400 uppercase tracking-wider font-bold">
                  ⚠️ Factores de Fuga & Operación
                </span>

                <div>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-gray-400">% Devolución Logística:</span>
                    <span className="font-mono text-red-400 font-bold">{simDevRate}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="40"
                    value={simDevRate}
                    onChange={(e) => setSimDevRate(Number(e.target.value))}
                    className="w-full accent-[#FFD800] cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-gray-400">% Merma / Pérdida en Bodega:</span>
                    <span className="font-mono text-red-400 font-bold">{simLossRate}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="20"
                    value={simLossRate}
                    onChange={(e) => setSimLossRate(Number(e.target.value))}
                    className="w-full accent-[#FFD800] cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-gray-400">% Comisión Pasarela / Plataforma:</span>
                    <span className="font-mono text-[#FFD800] font-bold">{simPlatFee}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="15"
                    step="0.5"
                    value={simPlatFee}
                    onChange={(e) => setSimPlatFee(Number(e.target.value))}
                    className="w-full accent-[#FFD800] cursor-pointer"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* TARJETA RESULTADO PRECIO SUGERIDO */}
          <div className="bg-white border-2 border-[#FFD800] rounded-2xl p-6 shadow-sm flex flex-col justify-between space-y-4">
            <div className="text-center space-y-1">
              <span className="text-[10px] font-satoshi-black text-gray-500 uppercase tracking-widest font-bold block">
                PRECIO SUGERIDO BLINDADO ({simCanal})
              </span>
              <div className="text-4xl font-black text-gray-900 font-satoshi-black">
                {formatoCOP(calculoSimulador.precioSugerido)}
              </div>
              <p className="text-[10px] text-emerald-700 font-satoshi-black">
                Garantiza {simMargenDeseado}% de utilidad neta libre tras pagar mermas y fletes
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-3 border-t border-gray-100 text-xs font-satoshi-regular">
              <div className="bg-gray-50 p-2.5 rounded-xl border border-gray-200 text-center">
                <span className="text-[9px] text-gray-500 block uppercase font-satoshi-black">Costo Real Total</span>
                <span className="font-mono font-bold text-gray-900">{formatoCOP(calculoSimulador.costoRealTotal)}</span>
              </div>
              <div className="bg-gray-50 p-2.5 rounded-xl border border-gray-200 text-center">
                <span className="text-[9px] text-gray-500 block uppercase font-satoshi-black">Provisión de Fuga</span>
                <span className="font-mono font-bold text-red-600">{formatoCOP(calculoSimulador.totalProvisionFuga)}</span>
              </div>
            </div>
          </div>
        </aside>

        {/* PANEL DERECHO: DIAGNÓSTICO MASIVO DEL CATÁLOGO DE FIREBASE */}
        <main className="lg:col-span-7 space-y-6">
          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-6">
            
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-gray-100 pb-4">
              <div>
                <h2 className="text-lg font-satoshi-black text-gray-900 uppercase font-bold">
                  Auditoría Financiera de Catálogo
                </h2>
                <p className="text-xs text-gray-500 font-satoshi-regular">
                  Semáforo de salud de precios según el canal de comercialización
                </p>
              </div>

              {/* BOTONES SELECCIÓN CANAL AUDITORÍA */}
              <div className="flex gap-1 bg-gray-100 p-1 rounded-xl border border-gray-200 shrink-0">
                <button
                  type="button"
                  onClick={() => setAuditCanal('POS')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-satoshi-black transition ${
                    auditCanal === 'POS' ? 'bg-[#FFD800] text-[#222222] font-bold shadow-xs' : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  POS
                </button>
                <button
                  type="button"
                  onClick={() => setAuditCanal('MAYOR')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-satoshi-black transition ${
                    auditCanal === 'MAYOR' ? 'bg-[#FFD800] text-[#222222] font-bold shadow-xs' : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  Por Mayor
                </button>
                <button
                  type="button"
                  onClick={() => setAuditCanal('DROKO')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-satoshi-black transition ${
                    auditCanal === 'DROKO' ? 'bg-[#FFD800] text-[#222222] font-bold shadow-xs' : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  Droko
                </button>
              </div>
            </div>

            {/* WIDGETS SEMÁFORO FINANCIERO */}
            <div className="grid grid-cols-3 gap-3">
              <button
                onClick={() => setAuditFiltroSalud('SALUDABLE')}
                className={`p-3 rounded-xl border text-left transition ${
                  auditFiltroSalud === 'SALUDABLE' ? 'bg-emerald-50 border-emerald-400' : 'bg-gray-50 border-gray-200 hover:border-gray-300'
                }`}
              >
                <span className="text-[10px] font-satoshi-black text-emerald-800 uppercase block font-bold">🟢 Blindados</span>
                <span className="text-xl font-black text-emerald-900">{auditoriaCatalogo.saludables} SKUs</span>
              </button>

              <button
                onClick={() => setAuditFiltroSalud('ALERTA')}
                className={`p-3 rounded-xl border text-left transition ${
                  auditFiltroSalud === 'ALERTA' ? 'bg-amber-50 border-amber-400' : 'bg-gray-50 border-gray-200 hover:border-gray-300'
                }`}
              >
                <span className="text-[10px] font-satoshi-black text-amber-800 uppercase block font-bold">🟡 Bajo Margen</span>
                <span className="text-xl font-black text-amber-900">{auditoriaCatalogo.alertas} SKUs</span>
              </button>

              <button
                onClick={() => setAuditFiltroSalud('PERDIDA')}
                className={`p-3 rounded-xl border text-left transition ${
                  auditFiltroSalud === 'PERDIDA' ? 'bg-red-50 border-red-400' : 'bg-gray-50 border-gray-200 hover:border-gray-300'
                }`}
              >
                <span className="text-[10px] font-satoshi-black text-red-800 uppercase block font-bold">🔴 Fuga Capital</span>
                <span className="text-xl font-black text-red-900">{auditoriaCatalogo.perdidas} SKUs</span>
              </button>
            </div>

            {/* BÚSQUEDA Y LIMPIEZA */}
            <div className="flex justify-between items-center gap-3">
              <input
                type="text"
                className="w-full bg-gray-50 border border-gray-300 focus:border-[#FFD800] rounded-xl px-3.5 py-2 text-xs focus:outline-none"
                placeholder="Buscar SKU o Producto en auditoría..."
                value={auditSearch}
                onChange={(e) => setAuditSearch(e.target.value)}
              />
              {auditFiltroSalud !== 'TODOS' && (
                <button
                  onClick={() => setAuditFiltroSalud('TODOS')}
                  className="text-[10px] font-satoshi-black text-gray-500 hover:text-gray-900 uppercase underline whitespace-nowrap"
                >
                  Ver Todos ({auditoriaCatalogo.totalCount})
                </button>
              )}
            </div>

            {/* TABLA DIAGNÓSTICO */}
            <div className="overflow-x-auto max-h-[26rem] overflow-y-auto border border-gray-200 rounded-xl">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 text-[10px] font-satoshi-black text-gray-600 uppercase border-b border-gray-200 sticky top-0 bg-gray-50 z-10">
                    <th className="p-3">SKU / Producto</th>
                    <th className="p-3 text-right">Precio Actual</th>
                    <th className="p-3 text-right">Margen Real</th>
                    <th className="p-3 text-right">Precio Blindado</th>
                    <th className="p-3 text-center">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-xs font-satoshi-regular">
                  {auditoriaCatalogo.filtrados.map((p) => (
                    <tr key={p.sku} className="hover:bg-gray-50 transition-colors">
                      <td className="p-3">
                        <div className="font-bold text-gray-900 truncate max-w-[12rem]">{p.nombre}</div>
                        <div className="font-mono text-[10px] text-gray-500">SKU: {p.sku}</div>
                      </td>

                      <td className="p-3 text-right font-satoshi-black font-bold text-gray-900">
                        {formatoCOP(p.precioActual)}
                      </td>

                      <td className="p-3 text-right font-mono font-bold">
                        <span className={`px-2 py-0.5 rounded text-[10px] ${
                          p.estadoSalud === 'SALUDABLE' ? 'bg-emerald-100 text-emerald-800' : (p.estadoSalud === 'ALERTA' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800')
                        }`}>
                          {p.margenNetoReal >= 0 ? `${p.margenNetoReal.toFixed(1)}%` : 'Sin Precio'}
                        </span>
                      </td>

                      <td className="p-3 text-right font-mono font-bold text-gray-900">
                        {formatoCOP(p.precioSugerido)}
                      </td>

                      <td className="p-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleAplicarPrecioSugerido(p)}
                          disabled={updatingSku === p.sku}
                          className="bg-[#222222] hover:bg-[#333333] text-[#FFD800] font-satoshi-black px-2.5 py-1 rounded-lg text-[10px] uppercase font-bold transition disabled:opacity-50"
                        >
                          {updatingSku === p.sku ? 'Ajustando...' : 'Aplicar'}
                        </button>
                      </td>
                    </tr>
                  ))}

                  {auditoriaCatalogo.filtrados.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-gray-500 text-xs">
                        No se encontraron productos bajo los criterios seleccionados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

          </div>
        </main>
      </div>
    </div>
  );
}