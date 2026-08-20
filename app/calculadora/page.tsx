'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, doc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { formatearMonedaGlobal, obtenerTarifasImpuesto } from '@/lib/moneda';

export default function CalculadoraPage() {
  const [userAuth, setUserAuth] = useState<any>(null);
  const [productos, setProductos] = useState<any[]>([]);
  const [sucursales, setSucursales] = useState<any[]>([]);

  // Moneda Oficial leída desde la sesión del usuario
  const monedaLocal = userAuth?.moneda_oficial || 'COP';
  const formatoMoneda = (v: number) => formatearMonedaGlobal(v, monedaLocal);
  
  // Opciones de IVA conectadas al módulo centralizado lib/moneda.ts
  const opcionesIvaActuales = useMemo(() => obtenerTarifasImpuesto(monedaLocal), [monedaLocal]);

  // ==========================================
  // ESTADOS DEL SIMULADOR UNITARIO
  // ==========================================
  const [simCanal, setSimCanal] = useState<'POS' | 'MAYOR' | 'ECOM' | 'DROKO'>('ECOM');
  const [simCogs, setSimCogs] = useState<number>(45000); // Costo Producto
  const [simOps, setSimOps] = useState<number>(8000);   // Picking / Empaque (Solo E-Com)
  const [simOtros, setSimOtros] = useState<number>(2000); // Otros Gastos
  const [simMargenDeseado, setSimMargenDeseado] = useState<number>(25); // Margen Neto %
  
  // E-COMMERCE: Factores de Fuga, Vendedor, Volumen e IVA
  const [simDevRate, setSimDevRate] = useState<number>(18); // % Devolución Logística (Solo E-Com)
  const [simLossRate, setSimLossRate] = useState<number>(5);  // % Merma (Solo E-Com)
  const [simBonifVendedor, setSimBonifVendedor] = useState<number>(5); // % Comisión / Bonificación Vendedor (Solo E-Com)
  const [simCantidadEcom, setSimCantidadEcom] = useState<number>(100); // Cantidad proyectada E-Com
  const [simAplicaIvaEcom, setSimAplicaIvaEcom] = useState<boolean>(false); // ¿Aplica IVA en E-Com?
  const [simTarifaIvaEcom, setSimTarifaIvaEcom] = useState<number>(19); // Tarifa IVA % E-Com

  // DROKO: Cantidad, Comisión 1% e IVA Opcional
  const [simPlatFee, setSimPlatFee] = useState<number>(1);    // % Comisión Plataforma Droko (Por defecto 1%)
  const [simCantidadDroko, setSimCantidadDroko] = useState<number>(100); // Cantidad proyectada Droko
  const [simAplicaIvaDroko, setSimAplicaIvaDroko] = useState<boolean>(false); // ¿Aplica IVA en Droko?
  const [simTarifaIvaDroko, setSimTarifaIvaDroko] = useState<number>(19); // Tarifa IVA % Droko

  // ==========================================
  // ESTADOS DE AUDITORÍA DE CATÁLOGO
  // ==========================================
  const [auditCanal, setAuditCanal] = useState<'POS' | 'MAYOR' | 'ECOM' | 'DROKO'>('ECOM');
  const [auditSearch, setAuditSearch] = useState('');
  const [auditFiltroSalud, setAuditFiltroSalud] = useState<'TODOS' | 'SALUDABLE' | 'ALERTA' | 'PERDIDA'>('TODOS');
  const [updatingSku, setUpdatingSku] = useState<string | null>(null);

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

  // Autoseleccionar la primera tarifa de IVA oficial cuando cambia la divisa del usuario
  useEffect(() => {
    if (opcionesIvaActuales && opcionesIvaActuales.length > 0) {
      setSimTarifaIvaEcom(opcionesIvaActuales[0].valor);
      setSimTarifaIvaDroko(opcionesIvaActuales[0].valor);
    }
  }, [opcionesIvaActuales]);

  // Autoconfigurar parámetros según el canal seleccionado
  useEffect(() => {
    if (simCanal === 'POS') {
      setSimDevRate(0);
      setSimLossRate(0);
      setSimPlatFee(0);
      setSimBonifVendedor(0);
      setSimMargenDeseado(30);
      setSimOps(0);
    } else if (simCanal === 'MAYOR') {
      setSimDevRate(0);
      setSimLossRate(0);
      setSimPlatFee(0);
      setSimBonifVendedor(0);
      setSimMargenDeseado(15);
      setSimOps(0);
    } else if (simCanal === 'ECOM') {
      setSimDevRate(18);
      setSimLossRate(5);
      setSimPlatFee(0);
      setSimBonifVendedor(5);
      setSimMargenDeseado(25);
      setSimOps(8000);
    } else {
      // DROKO
      setSimDevRate(0);
      setSimLossRate(0);
      setSimPlatFee(1);
      setSimBonifVendedor(0);
      setSimMargenDeseado(20);
      setSimOps(0);
    }
  }, [simCanal]);

  // ==========================================
  // 🧮 MATEMÁTICA DE BLINDAJE FINANCIERO (SIMULADOR)
  // ==========================================
  const calculoSimulador = useMemo(() => {
    const cogs = Number(simCogs) || 0;
    const ops = simCanal === 'ECOM' ? (Number(simOps) || 0) : 0;
    const otros = Number(simOtros) || 0;
    const mTarget = (Number(simMargenDeseado) || 0) / 100;

    // Factores de Fuga & Vendedores (Solo E-Commerce)
    const devPct = simCanal === 'ECOM' ? ((Number(simDevRate) || 0) / 100) : 0;
    const lossPct = simCanal === 'ECOM' ? ((Number(simLossRate) || 0) / 100) : 0;
    const sellerBonusPct = simCanal === 'ECOM' ? ((Number(simBonifVendedor) || 0) / 100) : 0;

    // Comisión Plataforma (Solo Droko)
    const platFeePct = simCanal === 'DROKO' ? ((Number(simPlatFee) || 0) / 100) : 0;

    const costoDirectoUnit = cogs + ops + otros;
    
    // Provisión de fuga por fletes y merma (Solo E-Commerce)
    const provDevolucion = (ops * 2) * devPct;
    const provMerma = (cogs + ops) * lossPct;
    const totalProvisionFuga = provDevolucion + provMerma;

    const costoRealUnit = costoDirectoUnit + totalProvisionFuga;

    // --- OPCIÓN 1: SUBIR PRECIO PARA CONSERVAR GANANCIA ---
    const denOpt1 = 1 - mTarget - platFeePct - sellerBonusPct;
    const precioOpt1Unit = denOpt1 > 0 ? (costoRealUnit / denOpt1) : (costoRealUnit * 2);
    const bonifVendedorMontoOpt1 = precioOpt1Unit * sellerBonusPct;
    const comisionPlatMontoOpt1 = precioOpt1Unit * platFeePct;
    const utilidadNetaUnitOpt1 = precioOpt1Unit * mTarget;

    // --- OPCIÓN 2: MANTENER PRECIO BASE Y DISMINUIR % DE GANANCIA (E-Com) ---
    const denOpt2 = 1 - mTarget - platFeePct;
    const precioOpt2Unit = denOpt2 > 0 ? (costoRealUnit / denOpt2) : (costoRealUnit * 2);
    const bonifVendedorMontoOpt2 = precioOpt2Unit * sellerBonusPct;
    const comisionPlatMontoOpt2 = precioOpt2Unit * platFeePct;
    const utilidadNetaUnitOpt2 = precioOpt2Unit - comisionPlatMontoOpt2 - bonifVendedorMontoOpt2 - costoRealUnit;
    const margenRealPctOpt2 = precioOpt2Unit > 0 ? (utilidadNetaUnitOpt2 / precioOpt2Unit) * 100 : 0;

    // IVA si aplica
    const aplicaIvaActual = simCanal === 'DROKO' ? simAplicaIvaDroko : (simCanal === 'ECOM' ? simAplicaIvaEcom : false);
    const tarifaIvaActual = simCanal === 'DROKO' ? simTarifaIvaDroko : (simCanal === 'ECOM' ? simTarifaIvaEcom : 0);
    const ivaPct = aplicaIvaActual ? ((Number(tarifaIvaActual) || 0) / 100) : 0;
    
    const ivaMontoUnitOpt1 = precioOpt1Unit * ivaPct;

    // Proyecciones Masivas por Cantidad
    let cantidadProyectada = 1;
    if (simCanal === 'DROKO') cantidadProyectada = Math.max(1, Number(simCantidadDroko) || 1);
    else if (simCanal === 'ECOM') cantidadProyectada = Math.max(1, Number(simCantidadEcom) || 1);

    // Opcion 1 Totales
    const totalVentasProyectadasOpt1 = precioOpt1Unit * cantidadProyectada;
    const totalCostoProducto = cogs * cantidadProyectada;
    const totalPickingEmpaque = ops * cantidadProyectada;
    const totalOtrosGastos = otros * cantidadProyectada;
    const totalProvisionFugaProyectada = totalProvisionFuga * cantidadProyectada;
    const totalComisionPlataforma = comisionPlatMontoOpt1 * cantidadProyectada;
    const totalBonifVendedorOpt1 = bonifVendedorMontoOpt1 * cantidadProyectada;
    const totalIvaMontoOpt1 = ivaMontoUnitOpt1 * cantidadProyectada;
    const totalUtilidadNetaOpt1 = utilidadNetaUnitOpt1 * cantidadProyectada;

    const totalDeduciblesUnitOpt1 = costoRealUnit + comisionPlatMontoOpt1 + bonifVendedorMontoOpt1 + ivaMontoUnitOpt1;
    const totalDeduciblesProyectadoOpt1 = totalDeduciblesUnitOpt1 * cantidadProyectada;

    // Opcion 2 Totales (E-Com)
    const totalUtilidadNetaOpt2 = utilidadNetaUnitOpt2 * cantidadProyectada;

    return {
      costoDirectoUnit,
      totalProvisionFuga,
      costoRealUnit,
      precioSugeridoUnit: precioOpt1Unit,
      precioBaseOpt2: precioOpt2Unit,
      utilidadNetaUnitOpt1,
      utilidadNetaUnitOpt2,
      margenRealPctOpt2,
      
      comisionPlatMontoOpt1,
      bonifVendedorMontoOpt1,
      bonifVendedorMontoOpt2,
      ivaMontoUnitOpt1,
      
      cantidadProyectada,
      totalVentasProyectadasOpt1,
      totalCostoProducto,
      totalPickingEmpaque,
      totalOtrosGastos,
      totalProvisionFugaProyectada,
      totalComisionPlataforma,
      totalBonifVendedorOpt1,
      totalIvaMontoOpt1,
      totalUtilidadNetaOpt1,
      totalUtilidadNetaOpt2,
      totalDeduciblesProyectadoOpt1
    };
  }, [simCogs, simOps, simOtros, simMargenDeseado, simDevRate, simLossRate, simBonifVendedor, simPlatFee, simCantidadDroko, simAplicaIvaDroko, simTarifaIvaDroko, simCantidadEcom, simAplicaIvaEcom, simTarifaIvaEcom, simCanal]);

  // ==========================================
  // 🔍 DIAGNÓSTICO FINANCIERO MASIVO (FIREBASE)
  // ==========================================
  const auditoriaCatalogo = useMemo(() => {
    let saludables = 0;
    let alertas = 0;
    let perdidas = 0;

    let feePct = 0;
    let devPct = 0;
    let lossPct = 0;
    let targetM = 0.20;

    if (auditCanal === 'POS') {
      feePct = 0; devPct = 0; lossPct = 0; targetM = 0.25;
    } else if (auditCanal === 'MAYOR') {
      feePct = 0; devPct = 0; lossPct = 0; targetM = 0.12;
    } else if (auditCanal === 'ECOM') {
      feePct = 0; devPct = 0.18; lossPct = 0.05; targetM = 0.25;
    } else {
      // DROKO
      feePct = 0.01; devPct = 0; lossPct = 0; targetM = 0.20;
    }

    const listaAnalizada = productos.map(p => {
      const cogs = Number(p.costo_importacion) || 0;
      const ops = auditCanal === 'ECOM' ? (Number(p.costo_fulfilment) || 0) : 0;
      const costoDirecto = cogs + ops;

      const provFuga = ((ops * 2) * devPct) + ((cogs + ops) * lossPct);
      const costoReal = costoDirecto + provFuga;

      let precioActual = 0;
      if (auditCanal === 'POS') precioActual = Number(p.plocal || p.precio) || 0;
      else if (auditCanal === 'MAYOR') precioActual = Number(p.pmayor) || 0;
      else if (auditCanal === 'ECOM') precioActual = Number(p.pecom || p.precio) || 0;
      else precioActual = Number(p.pdroko || p.precio) || 0;

      const comision = precioActual * feePct;
      const ingresoNeto = precioActual - comision;
      const utilidadNeta = ingresoNeto - costoReal;
      const margenNetoReal = precioActual > 0 ? (utilidadNeta / precioActual) : -1;

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

  const handleAplicarPrecioSugerido = async (p: any) => {
    if (!p.sku) return;
    setUpdatingSku(p.sku);
    try {
      let fieldName = 'precio';
      if (auditCanal === 'POS') fieldName = 'plocal';
      else if (auditCanal === 'MAYOR') fieldName = 'pmayor';
      else if (auditCanal === 'ECOM') fieldName = 'pecom';
      else if (auditCanal === 'DROKO') fieldName = 'pdroko';
      
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
              Inteligencia Financiera & Rentabilidad ({monedaLocal})
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
                <svg className="w-4 h-4 text-[#FFD800]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <span>Simulador de Blindaje</span>
              </h2>

              {/* TABS DE CANAL */}
              <div className="flex gap-1 bg-[#1A1A1A] p-1 rounded-xl border border-gray-800">
                <button
                  type="button"
                  onClick={() => setSimCanal('POS')}
                  className={`px-2 py-1 rounded-lg text-[10px] font-satoshi-black transition ${
                    simCanal === 'POS' ? 'bg-[#FFD800] text-[#222222] font-bold' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  POS
                </button>
                <button
                  type="button"
                  onClick={() => setSimCanal('MAYOR')}
                  className={`px-2 py-1 rounded-lg text-[10px] font-satoshi-black transition ${
                    simCanal === 'MAYOR' ? 'bg-[#FFD800] text-[#222222] font-bold' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Mayor
                </button>
                <button
                  type="button"
                  onClick={() => setSimCanal('ECOM')}
                  className={`px-2 py-1 rounded-lg text-[10px] font-satoshi-black transition ${
                    simCanal === 'ECOM' ? 'bg-[#FFD800] text-[#222222] font-bold' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  E-Com
                </button>
                <button
                  type="button"
                  onClick={() => setSimCanal('DROKO')}
                  className={`px-2 py-1 rounded-lg text-[10px] font-satoshi-black transition ${
                    simCanal === 'DROKO' ? 'bg-[#FFD800] text-[#222222] font-bold' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Droko
                </button>
              </div>
            </div>

            {/* INPUTS DEL SIMULADOR */}
            <div className="space-y-4 text-xs font-satoshi-regular">
              <div className={`grid gap-3 ${simCanal === 'ECOM' ? 'grid-cols-2' : 'grid-cols-1'}`}>
                <div>
                  <label className="block text-[10px] font-satoshi-black text-gray-400 uppercase mb-1">Costo Producto ({monedaLocal})</label>
                  <input
                    type="number"
                    min="0"
                    value={simCogs}
                    onChange={(e) => setSimCogs(Number(e.target.value))}
                    className="w-full bg-[#1A1A1A] border border-gray-700 rounded-xl p-2.5 font-mono text-white focus:border-[#FFD800] focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>

                {/* PICKING Y EMPAQUE SOLO EN E-COMMERCE */}
                {simCanal === 'ECOM' && (
                  <div>
                    <label className="block text-[10px] font-satoshi-black text-gray-400 uppercase mb-1">Picking / Empaque ({monedaLocal})</label>
                    <input
                      type="number"
                      min="0"
                      value={simOps}
                      onChange={(e) => setSimOps(Number(e.target.value))}
                      className="w-full bg-[#1A1A1A] border border-gray-700 rounded-xl p-2.5 font-mono text-white focus:border-[#FFD800] focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-satoshi-black text-gray-400 uppercase mb-1">Otros Gastos ({monedaLocal})</label>
                  <input
                    type="number"
                    min="0"
                    value={simOtros}
                    onChange={(e) => setSimOtros(Number(e.target.value))}
                    className="w-full bg-[#1A1A1A] border border-gray-700 rounded-xl p-2.5 font-mono text-white focus:border-[#FFD800] focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
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
                    className="w-full bg-[#1A1A1A] border border-gray-700 rounded-xl p-2.5 font-mono text-white focus:border-[#FFD800] focus:outline-none text-right font-bold [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
              </div>

              {/* OPCIONES DE PROYECCIÓN E IVA PARA E-COMMERCE */}
              {simCanal === 'ECOM' && (
                <div className="bg-[#1A1A1A] p-4 rounded-xl border border-gray-800 space-y-3">
                  <span className="block text-[10px] font-satoshi-black text-[#FFD800] uppercase tracking-wider font-bold flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5 text-[#FFD800]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                    <span>Proyección de Volumen E-Commerce</span>
                  </span>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-satoshi-black text-gray-400 uppercase mb-1">Cantidad Esperada a Vender</label>
                      <input
                        type="number"
                        min="1"
                        value={simCantidadEcom}
                        onChange={(e) => setSimCantidadEcom(Math.max(1, Number(e.target.value)))}
                        className="w-full bg-[#222222] border border-gray-700 rounded-xl p-2 font-mono text-white focus:border-[#FFD800] focus:outline-none text-center font-bold [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-[10px] font-satoshi-black text-gray-400 uppercase">Tarifa IVA E-Com</label>
                      <div className="flex items-center gap-2 pt-1">
                        <input
                          type="checkbox"
                          id="checkIvaEcom"
                          checked={simAplicaIvaEcom}
                          onChange={(e) => setSimAplicaIvaEcom(e.target.checked)}
                          className="rounded bg-[#222222] border-gray-700 text-[#FFD800] focus:ring-0 w-4 h-4 cursor-pointer accent-[#FFD800]"
                        />
                        <label htmlFor="checkIvaEcom" className="text-xs text-gray-300 cursor-pointer">
                          ¿Aplica IVA?
                        </label>
                      </div>
                      {simAplicaIvaEcom && (
                        <select
                          value={simTarifaIvaEcom}
                          onChange={(e) => setSimTarifaIvaEcom(Number(e.target.value))}
                          className="w-full bg-[#222222] border border-gray-700 rounded-lg p-1 text-[11px] font-mono text-[#FFD800] focus:outline-none mt-1"
                        >
                          {opcionesIvaActuales.map((opcion) => (
                            <option key={opcion.label} value={opcion.valor}>{opcion.label}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* OPCIONES DE PROYECCIÓN E IVA PARA DROKO */}
              {simCanal === 'DROKO' && (
                <div className="bg-[#1A1A1A] p-4 rounded-xl border border-gray-800 space-y-3">
                  <span className="block text-[10px] font-satoshi-black text-[#FFD800] uppercase tracking-wider font-bold flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5 text-[#FFD800]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                    <span>Proyección de Volumen Droko</span>
                  </span>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-satoshi-black text-gray-400 uppercase mb-1">Cantidad Esperada a Vender</label>
                      <input
                        type="number"
                        min="1"
                        value={simCantidadDroko}
                        onChange={(e) => setSimCantidadDroko(Math.max(1, Number(e.target.value)))}
                        className="w-full bg-[#222222] border border-gray-700 rounded-xl p-2 font-mono text-white focus:border-[#FFD800] focus:outline-none text-center font-bold [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-[10px] font-satoshi-black text-gray-400 uppercase">Tarifa IVA Droko</label>
                      <div className="flex items-center gap-2 pt-1">
                        <input
                          type="checkbox"
                          id="checkIvaDroko"
                          checked={simAplicaIvaDroko}
                          onChange={(e) => setSimAplicaIvaDroko(e.target.checked)}
                          className="rounded bg-[#222222] border-gray-700 text-[#FFD800] focus:ring-0 w-4 h-4 cursor-pointer accent-[#FFD800]"
                        />
                        <label htmlFor="checkIvaDroko" className="text-xs text-gray-300 cursor-pointer">
                          ¿Aplica IVA?
                        </label>
                      </div>
                      {simAplicaIvaDroko && (
                        <select
                          value={simTarifaIvaDroko}
                          onChange={(e) => setSimTarifaIvaDroko(Number(e.target.value))}
                          className="w-full bg-[#222222] border border-gray-700 rounded-lg p-1 text-[11px] font-mono text-[#FFD800] focus:outline-none mt-1"
                        >
                          {opcionesIvaActuales.map((opcion) => (
                            <option key={opcion.label} value={opcion.valor}>{opcion.label}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-[11px] mb-1">
                      <span className="text-gray-400">% Comisión Plataforma Droko:</span>
                      <span className="font-mono text-[#FFD800] font-bold">{simPlatFee}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="10"
                      step="0.5"
                      value={simPlatFee}
                      onChange={(e) => setSimPlatFee(Number(e.target.value))}
                      className="w-full accent-[#FFD800] cursor-pointer"
                    />
                  </div>
                </div>
              )}

              {/* SECCIÓN FACTORES DE FUGA & VENDEDOR (SOLO E-COMMERCE) */}
              {simCanal === 'ECOM' && (
                <div className="bg-[#1A1A1A] p-4 rounded-xl border border-gray-800 space-y-3">
                  <span className="block text-[10px] font-satoshi-black text-red-400 uppercase tracking-wider font-bold flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <span>Factores de Fuga & Operación</span>
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

                  <div className="pt-2 border-t border-gray-800">
                    <div className="flex justify-between text-[11px] mb-1">
                      <span className="text-gray-300 font-bold">% Comisión / Bonificación Vendedor:</span>
                      <span className="font-mono text-[#FFD800] font-bold">{simBonifVendedor}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="20"
                      step="0.5"
                      value={simBonifVendedor}
                      onChange={(e) => setSimBonifVendedor(Number(e.target.value))}
                      className="w-full accent-[#FFD800] cursor-pointer"
                    />
                    <p className="text-[9px] text-gray-400 italic mt-0.5">
                      Evalúa abajo el impacto entre subir el precio de venta o absorber la comisión en tu margen.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* TARJETAS RESULTADO PRECIO SUGERIDO */}
          <div className="space-y-4">
            {simCanal === 'ECOM' ? (
              /* VISTA DUAL DE E-COMMERCE (2 OPCIONES ESTRATÉGICAS) */
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* OPCIÓN 1: SUBIR EL PRECIO DE VENTA (CONSERVA GANANCIA) */}
                <div className="bg-white border-2 border-[#FFD800] rounded-2xl p-5 shadow-sm flex flex-col justify-between space-y-4">
                  <div className="text-center space-y-1">
                    <span className="text-[10px] font-satoshi-black text-gray-500 uppercase tracking-widest font-bold block">
                      OPCIÓN 1: SUBIR PRECIO DE VENTA
                    </span>
                    <div className="text-3xl font-black text-gray-900 font-satoshi-black">
                      {formatoMoneda(calculoSimulador.precioSugeridoUnit)}
                    </div>
                    <p className="text-[9px] text-emerald-700 font-satoshi-black">
                      Conserva intacto el {simMargenDeseado}% de margen neto
                    </p>
                  </div>

                  <div className="bg-emerald-50 p-2.5 rounded-xl border border-emerald-200 text-center">
                    <span className="text-[10px] text-emerald-800 font-satoshi-black uppercase block font-bold">
                      Ganancia Total ({calculoSimulador.cantidadProyectada} unds)
                    </span>
                    <span className="text-xl font-black text-emerald-900 font-mono">
                      {formatoMoneda(calculoSimulador.totalUtilidadNetaOpt1)}
                    </span>
                  </div>
                </div>

                {/* OPCIÓN 2: MANTENER PRECIO BASE (DISMINUYE MARGEN NETO) */}
                <div className="bg-white border border-gray-300 rounded-2xl p-5 shadow-sm flex flex-col justify-between space-y-4">
                  <div className="text-center space-y-1">
                    <span className="text-[10px] font-satoshi-black text-gray-500 uppercase tracking-widest font-bold block">
                      OPCIÓN 2: MANTENER PRECIO BASE
                    </span>
                    <div className="text-3xl font-black text-gray-600 font-satoshi-black">
                      {formatoMoneda(calculoSimulador.precioBaseOpt2)}
                    </div>
                    <p className="text-[9px] text-amber-600 font-satoshi-black">
                      El margen neto cae al {calculoSimulador.margenRealPctOpt2.toFixed(1)}% por la comisión ({simBonifVendedor}%)
                    </p>
                  </div>

                  <div className="bg-gray-50 p-2.5 rounded-xl border border-gray-200 text-center">
                    <span className="text-[10px] text-gray-600 font-satoshi-black uppercase block font-bold">
                      Ganancia Total ({calculoSimulador.cantidadProyectada} unds)
                    </span>
                    <span className="text-xl font-black text-gray-800 font-mono">
                      {formatoMoneda(calculoSimulador.totalUtilidadNetaOpt2)}
                    </span>
                  </div>
                </div>

              </div>
            ) : (
              /* VISTA ÚNICA PARA POS, MAYOR Y DROKO */
              <div className="bg-white border-2 border-[#FFD800] rounded-2xl p-6 shadow-sm flex flex-col justify-between space-y-4">
                <div className="text-center space-y-1">
                  <span className="text-[10px] font-satoshi-black text-gray-500 uppercase tracking-widest font-bold block">
                    PRECIO SUGERIDO BLINDADO
                  </span>
                  <div className="text-4xl font-black text-gray-900 font-satoshi-black">
                    {formatoMoneda(calculoSimulador.precioSugeridoUnit)}
                  </div>
                  <p className="text-[10px] text-emerald-700 font-satoshi-black">
                    Garantiza {simMargenDeseado}% de utilidad neta libre por unidad
                  </p>
                </div>
              </div>
            )}

            {/* DESGLOSE DE DEDUCIBLES (DROKO Y E-COMMERCE) */}
            {(simCanal === 'DROKO' || simCanal === 'ECOM') ? (
              <div className="bg-white p-4 rounded-xl border border-gray-200 space-y-1.5 text-[11px] shadow-sm font-satoshi-regular">
                <span className="text-[10px] font-satoshi-black uppercase text-gray-600 block font-bold border-b border-gray-200 pb-1 mb-2">
                  Desglose de Deducibles ({calculoSimulador.cantidadProyectada} unds) - Basado en Opción 1:
                </span>
                <div className="flex justify-between text-gray-600">
                  <span>Inversión Producto (COGS):</span>
                  <span className="font-mono text-gray-900 font-bold">{formatoMoneda(calculoSimulador.totalCostoProducto)}</span>
                </div>

                {simCanal === 'ECOM' && (
                  <div className="flex justify-between text-gray-600">
                    <span>Picking / Empaque:</span>
                    <span className="font-mono text-gray-900 font-bold">{formatoMoneda(calculoSimulador.totalPickingEmpaque)}</span>
                  </div>
                )}

                <div className="flex justify-between text-gray-600">
                  <span>Otros Gastos Operativos:</span>
                  <span className="font-mono text-gray-900 font-bold">{formatoMoneda(calculoSimulador.totalOtrosGastos)}</span>
                </div>

                {simCanal === 'ECOM' && (
                  <div className="flex justify-between text-gray-600">
                    <span>Provisión Fuga / Devoluciones:</span>
                    <span className="font-mono text-red-600 font-bold">{formatoMoneda(calculoSimulador.totalProvisionFugaProyectada)}</span>
                  </div>
                )}

                {simCanal === 'ECOM' && simBonifVendedor > 0 && (
                  <div className="flex justify-between text-gray-600">
                    <span>Comisión / Bonificación Vendedor ({simBonifVendedor}%):</span>
                    <span className="font-mono text-amber-800 font-bold">{formatoMoneda(calculoSimulador.totalBonifVendedorOpt1)}</span>
                  </div>
                )}

                {simCanal === 'DROKO' && (
                  <div className="flex justify-between text-gray-600">
                    <span>Comisión Plataforma Droko ({simPlatFee}%):</span>
                    <span className="font-mono text-amber-800 font-bold">{formatoMoneda(calculoSimulador.totalComisionPlataforma)}</span>
                  </div>
                )}

                {((simCanal === 'DROKO' && simAplicaIvaDroko) || (simCanal === 'ECOM' && simAplicaIvaEcom)) && (
                  <div className="flex justify-between text-gray-600">
                    <span>Monto IVA ({simCanal === 'DROKO' ? simTarifaIvaDroko : simTarifaIvaEcom}%):</span>
                    <span className="font-mono text-gray-900 font-bold">{formatoMoneda(calculoSimulador.totalIvaMontoOpt1)}</span>
                  </div>
                )}

                <div className="flex justify-between text-gray-900 font-satoshi-black pt-1 border-t border-gray-200 font-bold">
                  <span>Total Deducibles (Costo Real):</span>
                  <span className="font-mono text-red-600">{formatoMoneda(calculoSimulador.totalDeduciblesProyectadoOpt1)}</span>
                </div>
              </div>
            ) : (
              /* DESGLOSE ESTÁNDAR PARA POS Y MAYOR */
              <div className="grid grid-cols-2 gap-3 text-xs font-satoshi-regular">
                <div className="bg-white p-3 rounded-xl border border-gray-200 text-center shadow-sm">
                  <span className="text-[9px] text-gray-500 block uppercase font-satoshi-black">Costo Real Total</span>
                  <span className="font-mono font-bold text-gray-900">{formatoMoneda(calculoSimulador.costoRealUnit)}</span>
                </div>

                <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-200 text-center shadow-sm">
                  <span className="text-[9px] text-emerald-800 block uppercase font-satoshi-black">Utilidad Neta / Und</span>
                  <span className="font-mono font-bold text-emerald-900">{formatoMoneda(calculoSimulador.utilidadNetaUnitOpt1)}</span>
                </div>
              </div>
            )}

            {/* BOTÓN IMPRIMIR RESULTADO ABAJO EN LA CALCULADORA */}
            <button
              type="button"
              onClick={() => window.print()}
              className="w-full bg-[#FFD800] hover:bg-[#FDCB13] text-[#222222] font-satoshi-black py-3 rounded-xl text-xs uppercase tracking-wider transition shadow-sm flex items-center justify-center gap-2 font-bold"
            >
              <svg className="w-4 h-4 text-[#222222]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              <span>Imprimir resultado</span>
            </button>
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
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-satoshi-black transition ${
                    auditCanal === 'POS' ? 'bg-[#FFD800] text-[#222222] font-bold shadow-xs' : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  POS
                </button>
                <button
                  type="button"
                  onClick={() => setAuditCanal('MAYOR')}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-satoshi-black transition ${
                    auditCanal === 'MAYOR' ? 'bg-[#FFD800] text-[#222222] font-bold shadow-xs' : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  Por Mayor
                </button>
                <button
                  type="button"
                  onClick={() => setAuditCanal('ECOM')}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-satoshi-black transition ${
                    auditCanal === 'ECOM' ? 'bg-[#FFD800] text-[#222222] font-bold shadow-xs' : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  E-Com
                </button>
                <button
                  type="button"
                  onClick={() => setAuditCanal('DROKO')}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-satoshi-black transition ${
                    auditCanal === 'DROKO' ? 'bg-[#FFD800] text-[#222222] font-bold shadow-xs' : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  Droko
                </button>
              </div>
            </div>

            {/* WIDGETS SEMÁFORO FINANCIERO CON ÍCONOS VECTORIALES 2D */}
            <div className="grid grid-cols-3 gap-3">
              <button
                onClick={() => setAuditFiltroSalud('SALUDABLE')}
                className={`p-3 rounded-xl border text-left transition ${
                  auditFiltroSalud === 'SALUDABLE' ? 'bg-emerald-50 border-emerald-400' : 'bg-gray-50 border-gray-200 hover:border-gray-300'
                }`}
              >
                <span className="flex items-center gap-1.5 text-[10px] font-satoshi-black text-emerald-800 uppercase font-bold">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block shrink-0"></span>
                  <span>Blindados</span>
                </span>
                <span className="text-xl font-black text-emerald-900">{auditoriaCatalogo.saludables} SKUs</span>
              </button>

              <button
                onClick={() => setAuditFiltroSalud('ALERTA')}
                className={`p-3 rounded-xl border text-left transition ${
                  auditFiltroSalud === 'ALERTA' ? 'bg-amber-50 border-amber-400' : 'bg-gray-50 border-gray-200 hover:border-gray-300'
                }`}
              >
                <span className="flex items-center gap-1.5 text-[10px] font-satoshi-black text-amber-800 uppercase font-bold">
                  <span className="w-2 h-2 rounded-full bg-amber-500 inline-block shrink-0"></span>
                  <span>Bajo Margen</span>
                </span>
                <span className="text-xl font-black text-amber-900">{auditoriaCatalogo.alertas} SKUs</span>
              </button>

              <button
                onClick={() => setAuditFiltroSalud('PERDIDA')}
                className={`p-3 rounded-xl border text-left transition ${
                  auditFiltroSalud === 'PERDIDA' ? 'bg-red-50 border-red-400' : 'bg-gray-50 border-gray-200 hover:border-gray-300'
                }`}
              >
                <span className="flex items-center gap-1.5 text-[10px] font-satoshi-black text-red-800 uppercase font-bold">
                  <span className="w-2 h-2 rounded-full bg-red-500 inline-block shrink-0"></span>
                  <span>Fuga Capital</span>
                </span>
                <span className="text-xl font-black text-red-900">{auditoriaCatalogo.perdidas} SKUs</span>
              </button>
            </div>

            {/* BÚSQUEDA Y LIMPIEZA */}
            <div className="flex justify-between items-center gap-3">
              <input
                type="text"
                className="w-full bg-gray-50 border border-gray-300 focus:border-[#FFD800] rounded-xl px-3.5 py-2 text-xs focus:outline-none font-satoshi-regular"
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
                        {formatoMoneda(p.precioActual)}
                      </td>

                      <td className="p-3 text-right font-mono font-bold">
                        <span className={`px-2 py-0.5 rounded text-[10px] ${
                          p.estadoSalud === 'SALUDABLE' ? 'bg-emerald-100 text-emerald-800' : (p.estadoSalud === 'ALERTA' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800')
                        }`}>
                          {p.margenNetoReal >= 0 ? `${p.margenNetoReal.toFixed(1)}%` : 'Sin Precio'}
                        </span>
                      </td>

                      <td className="p-3 text-right font-mono font-bold text-gray-900">
                        {formatoMoneda(p.precioSugerido)}
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
