'use client';

import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export default function ReportesPage() {
  const [userAuth, setUserAuth] = useState<any>(null);
  const [ventas, setVentas] = useState<any[]>([]);
  const [productos, setProductos] = useState<any[]>([]);
  const [sucursales, setSucursales] = useState<any[]>([]);

  // FILTRO DE PERIODO FISCAL (MES Y AÑO ATOM)
  const hoy = new Date();
  const [mesFiltro, setMesFiltro] = useState<number>(hoy.getMonth());
  const [anioFiltro, setAnioFiltro] = useState<number>(hoy.getFullYear());

  const [agruparPor, setAgruparPor] = useState<'SEDES' | 'VENDEDORES' | 'CANALES'>('SEDES');

  const formatoCOP = (v: number) => 
    new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(v || 0);

  const mesesDelAnio = [
    { id: 0, nombre: 'Enero' }, { id: 1, nombre: 'Febrero' }, { id: 2, nombre: 'Marzo' },
    { id: 3, nombre: 'Abril' }, { id: 4, nombre: 'Mayo' }, { id: 5, nombre: 'Junio' },
    { id: 6, nombre: 'Julio' }, { id: 7, nombre: 'Agosto' }, { id: 8, nombre: 'Septiembre' },
    { id: 9, nombre: 'Octubre' }, { id: 10, nombre: 'Noviembre' }, { id: 11, nombre: 'Diciembre' },
  ];

  const anioActualNum = new Date().getFullYear();
  const listaAnios = Array.from({ length: 5 }, (_, i) => anioActualNum - i);

  useEffect(() => {
    const savedUser = localStorage.getItem('atom_user_session');
    if (savedUser) {
      setUserAuth(JSON.parse(savedUser));
    }
  }, []);

  // Escuchar Firestore en Tiempo Real
  useEffect(() => {
    if (!userAuth || !userAuth.id_cuenta) return;

    const qVent = query(collection(db, 'ventas'), where('id_cuenta', '==', userAuth.id_cuenta));
    const unsubVent = onSnapshot(qVent, (snap) => {
      setVentas(snap.docs.map(d => ({ ...d.data(), id_doc: d.id })));
    });

    const qProd = query(collection(db, 'productos'), where('id_cuenta', '==', userAuth.id_cuenta));
    const unsubProd = onSnapshot(qProd, (snap) => {
      setProductos(snap.docs.map(d => ({ ...d.data(), sku: d.id })));
    });

    const qSuc = query(collection(db, 'sucursales'), where('id_cuenta', '==', userAuth.id_cuenta));
    const unsubSuc = onSnapshot(qSuc, (snap) => {
      setSucursales(snap.docs.map(d => d.data()));
    });

    return () => {
      unsubVent();
      unsubProd();
      unsubSuc();
    };
  }, [userAuth]);

  // 1. FILTRADO DE VENTAS POR EL PERIODO FISCAL SELECCIONADO (MES Y AÑO)
  const ventasFiltradas = ventas.filter(v => {
    const fechaStr = v.fecha_cobro || v.fecha;
    if (!fechaStr) return false;
    const fechaObj = new Date(fechaStr);
    return fechaObj.getMonth() === mesFiltro && fechaObj.getFullYear() === anioFiltro;
  });

  // 2. CÁLCULO DE VENTAS ENTREGADAS (SOLO ESTADO 'ENTREGADO', 'PAGADA' O 'EMITIDA')
  const ventasEntregadasFiltradas = ventasFiltradas.filter(v => {
    const est = String(v.estado || '').toUpperCase();
    return est === 'ENTREGADO' || est === 'PAGADA' || est === 'EMITIDA';
  });

  const totalVentasEntregadas = ventasEntregadasFiltradas.reduce((acc, v) => acc + (Number(v.total) || 0), 0);
  const totalDescuentosOtorgados = ventasEntregadasFiltradas.reduce((acc, v) => acc + (Number(v.descuento_monto) || 0), 0);
  const totalVentasBrutas = totalVentasEntregadas + totalDescuentosOtorgados;

  let costoImportacionTotal = 0;
  let costoFulfilmentTotal = 0;
  let totalUnidadesVendidas = 0;
  let totalIvaMontoAcumulado = 0;

  // Cálculo de Unit Economics, Impuestos y Desglose P&L
  ventasEntregadasFiltradas.forEach(v => {
    totalIvaMontoAcumulado += Number(v.iva_monto) || 0;

    // DETERMINAR SI LA VENTA ES DE CANAL E-COMMERCE
    const origenStr = String(v.origen || v.canal_origen || '').toUpperCase();
    const vendedorStr = String(v.vendedor_nombre || '').toUpperCase();
    const esEcommerce = origenStr.includes('ECOMMERCE') || 
                        origenStr.includes('MASIVA') || 
                        vendedorStr.includes('E-COMMERCE') || 
                        vendedorStr.includes('DROPI') || 
                        vendedorStr.includes('VENDELO') || 
                        vendedorStr.includes('MASTER');

    if (Array.isArray(v.items)) {
      v.items.forEach((it: any) => {
        const cant = Number(it.cantidad) || 1;
        totalUnidadesVendidas += cant;
        const prod = productos.find(p => p.sku === it.sku || (p.nombre && p.nombre.toLowerCase() === (it.nombre || '').toLowerCase()));
        
        if (prod) {
          const cImp = Number(prod.costo_importacion) || 0;
          const cFul = Number(prod.costo_fulfilment) || 0;
          
          // COSTO DE COMPRA/FABRICACIÓN: Se aplica a todas las ventas
          costoImportacionTotal += cImp * cant;
          
          // COSTO DE FULFILLMENT: SOLO se aplica si la venta es por E-Commerce
          if (esEcommerce) {
            costoFulfilmentTotal += cFul * cant;
          }
        }
      });
    }
  });

  // BASE GRAVABLE Y MÁRGENES
  const baseGravableTotal = totalVentasEntregadas - totalIvaMontoAcumulado;
  const costoDirectoProducto = costoImportacionTotal > 0 ? costoImportacionTotal : (totalVentasEntregadas * 0.3);
  const utilidadBruta = baseGravableTotal - costoDirectoProducto;
  
  // Ganancia Neta restando Fulfillment exclusivo de E-Commerce
  const gananciaNetaReal = utilidadBruta - costoFulfilmentTotal;
  const porcentajeMargenNeto = totalVentasEntregadas > 0 ? Math.round((gananciaNetaReal / totalVentasEntregadas) * 100) : 0;
  
  // Ticket Promedio (AOV)
  const ticketPromedio = ventasEntregadasFiltradas.length > 0 
    ? Math.round(totalVentasEntregadas / ventasEntregadasFiltradas.length) 
    : 0;

  // Contador de Devoluciones del Periodo y Pérdida Estimada
  const ordenesDevolucion = ventasFiltradas.filter(v => {
    const est = String(v.estado || '').toUpperCase();
    return est.includes('DEVOLUCION') || est.includes('DEVOLUCIÓN') || est.includes('ANULADA');
  });
  const totalDevoluciones = ordenesDevolucion.length;
  const valorPerdidoDevoluciones = ordenesDevolucion.reduce((acc, v) => acc + (Number(v.total) || 0), 0);

  // Valoración de Inventario en Bodegas (Balance)
  const capitalInmovilizadoStock = productos.reduce((acc, p) => {
    const stMap = p.stock || {};
    const cantStock = Object.values(stMap).reduce((a: number, val: any) => a + (Number(val) || 0), 0);
    const costoUnit = (Number(p.costo_importacion) || 0) + (Number(p.costo_fulfilment) || 0);
    return acc + (cantStock * (costoUnit || (Number(p.precio) * 0.4)));
  }, 0);

  // 3. AGRUPACIÓN DINÁMICA DE VENTAS (SEDES, VENDEDORES Y CANALES)
  const obtenerAgrupacion = () => {
    const mapa: { [key: string]: number } = {};

    ventasEntregadasFiltradas.forEach(v => {
      let clave = 'Sede Principal';

      if (agruparPor === 'SEDES') {
        clave = v.nombre_bodega || v.id_bodega_despacho || 'Sede Principal';
      } else if (agruparPor === 'VENDEDORES') {
        clave = v.vendedor_nombre || 'Vendedor POS';
      } else if (agruparPor === 'CANALES') {
        const origenStr = String(v.origen || v.canal_origen || '').toUpperCase();
        const vendedorStr = String(v.vendedor_nombre || '').toUpperCase();
        const bodegaStr = String(v.nombre_bodega || '').toUpperCase();

        if (origenStr.includes('ECOMMERCE') || origenStr.includes('MASIVA') || vendedorStr.includes('E-COMMERCE') || vendedorStr.includes('DROPI') || vendedorStr.includes('VENDELO') || vendedorStr.includes('MASTER')) {
          clave = 'E-Commerce';
        } else if (origenStr.includes('BODEGA') || bodegaStr.includes('BODEGA') || bodegaStr.includes('ALMACEN') || bodegaStr.includes('DESPACHO')) {
          clave = 'Bodegas';
        } else {
          clave = 'Tienda Física';
        }
      }

      mapa[clave] = (mapa[clave] || 0) + (Number(v.total) || 0);
    });

    return Object.entries(mapa).map(([nombre, monto]) => ({
      nombre,
      monto,
      porcentaje: totalVentasEntregadas > 0 ? Math.round((monto / totalVentasEntregadas) * 100) : 0
    })).sort((a, b) => b.monto - a.monto);
  };

  // 4. RANKING TOP PRODUCTOS MÁS VENDIDOS
  const obtenerTopProductos = () => {
    const mapaProd: { [key: string]: { cantidad: number; totalMonto: number; nombre: string } } = {};

    ventasEntregadasFiltradas.forEach(v => {
      if (Array.isArray(v.items)) {
        v.items.forEach((it: any) => {
          const skuKey = it.nombre ? it.nombre.toUpperCase() : (it.sku || 'PRODUCTO_SIN_NOMBRE');
          const cant = Number(it.cantidad) || 1;
          const monto = (Number(it.precio) || 0) * cant;

          if (!mapaProd[skuKey]) {
            mapaProd[skuKey] = {
              cantidad: 0,
              totalMonto: 0,
              nombre: it.nombre || 'Producto Ecommerce'
            };
          }

          mapaProd[skuKey].cantidad += cant;
          mapaProd[skuKey].totalMonto += monto;
        });
      }
    });

    return Object.entries(mapaProd)
      .map(([sku, data]) => ({ sku, ...data }))
      .sort((a, b) => b.cantidad - a.cantidad)
      .slice(0, 5);
  };

  const agrupacionData = obtenerAgrupacion();
  const topProductos = obtenerTopProductos();

  return (
    <div className="min-h-screen bg-[#1D2935] text-slate-100 p-6 md:p-10 font-sans relative pb-20">
      
      {/* CABECERA PRINCIPAL */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4 border-b border-slate-700/60 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-[#0DE8C0] animate-pulse"></span>
            <span className="text-[11px] font-satoshi-black text-[#0DE8C0] uppercase tracking-wider">
              Analítica Financiera, P&L e Inventario
            </span>
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight font-satoshi-black">
            Reportes y Analítica ATOM
          </h1>
          <p className="text-xs text-[#A0AEC0] mt-1 font-satoshi-regular max-w-xl">
            Monitoreo en tiempo real del flujo de caja, Estado de Resultados (P&L) y rentabilidad neta.
          </p>
        </div>
      </div>

      {/* BARRA SUPERIOR: SELECTOR DE MES Y AÑO */}
      <div className="bg-[#253443] border border-[#0DE8C0]/40 rounded-2xl p-4 mb-8 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#0DE8C0]/10 flex items-center justify-center text-[#0DE8C0] shrink-0">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <span className="text-xs font-satoshi-black text-white uppercase tracking-wider block">
              PERIODO FISCAL ACTIVO
            </span>
            <span className="text-[11px] text-[#A0AEC0] font-satoshi-regular">
              Filtra el mes y año que deseas revisar para actualizar métricas e historial.
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
          <select
            className="bg-[#1D2935] border border-slate-700 focus:border-[#0DE8C0] text-xs text-[#0DE8C0] font-satoshi-black rounded-xl px-3 py-2 focus:outline-none cursor-pointer flex-1 sm:flex-none"
            value={mesFiltro}
            onChange={(e) => setMesFiltro(Number(e.target.value))}
          >
            {mesesDelAnio.map(m => (
              <option key={m.id} value={m.id} className="bg-[#1D2935] text-white">
                {m.nombre}
              </option>
            ))}
          </select>

          <select
            className="bg-[#1D2935] border border-slate-700 focus:border-[#0DE8C0] text-xs text-white font-satoshi-black rounded-xl px-3 py-2 focus:outline-none cursor-pointer"
            value={anioFiltro}
            onChange={(e) => setAnioFiltro(Number(e.target.value))}
          >
            {listaAnios.map(a => (
              <option key={a} value={a} className="bg-[#1D2935] text-white">
                {a}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* METRICAS HERO */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-8">
        
        {/* VENTAS ENTREGADAS (6 COLS) */}
        <div className="lg:col-span-6 bg-[#253443] border border-[#0DE8C0]/40 rounded-2xl p-6 shadow-2xl relative overflow-hidden flex flex-col justify-between h-44 shadow-[#0DE8C0]/5">
          <div className="absolute top-0 right-0 w-40 h-40 bg-[#0DE8C0]/10 blur-3xl pointer-events-none rounded-full"></div>
          
          <div className="flex justify-between items-start">
            <span className="text-[11px] font-satoshi-black text-[#0DE8C0] uppercase tracking-wider">
              VENTAS ENTREGADAS ({mesesDelAnio[mesFiltro].nombre.toUpperCase()})
            </span>
            <div className="w-9 h-9 rounded-full bg-[#0DE8C0]/10 flex items-center justify-center text-[#0DE8C0]">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>

          <div className="my-1">
            <div className="text-4xl md:text-5xl font-black text-white font-satoshi-black tracking-tight">
              {formatoCOP(totalVentasEntregadas)}
            </div>
          </div>

          <p className="text-xs text-[#A0AEC0] font-satoshi-regular">
            Procesadas exclusivamente en estado <strong className="text-white">ENTREGADO</strong> en {mesesDelAnio[mesFiltro].nombre} del {anioFiltro}
          </p>
        </div>

        {/* GANANCIA NETA REAL (3 COLS) */}
        <div className="lg:col-span-3 bg-[#253443] border border-slate-700/50 rounded-2xl p-6 shadow-xl flex flex-col justify-between h-44">
          <div className="flex justify-between items-start">
            <span className="text-[11px] font-satoshi-black text-[#C81FDA] uppercase tracking-wider">
              UTILIDAD NETA REAL
            </span>
            <span className="bg-[#C81FDA] text-white text-[10px] font-satoshi-black px-2 py-0.5 rounded-full font-bold">
              {porcentajeMargenNeto}% Neto
            </span>
          </div>

          <div className="my-1">
            <div className="text-3xl font-black text-[#C81FDA] font-satoshi-black tracking-tight">
              {formatoCOP(gananciaNetaReal)}
            </div>
          </div>

          <p className="text-xs text-[#A0AEC0] font-satoshi-regular">
            Resultado descontando COGS, IVA y Fulfillment E-Commerce
          </p>
        </div>

        {/* UNIDADES Y TICKET PROMEDIO (3 COLS) */}
        <div className="lg:col-span-3 bg-[#253443] border border-slate-700/50 rounded-2xl p-5 shadow-xl flex flex-col justify-between h-44">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-satoshi-regular text-[#A0AEC0]">Ticket Promedio (AOV):</span>
              <span className="text-xs font-black text-[#0DE8C0] font-satoshi-black">{formatoCOP(ticketPromedio)}</span>
            </div>

            <div className="flex items-center justify-between border-t border-slate-700/60 pt-1.5">
              <span className="text-xs font-satoshi-regular text-[#A0AEC0]">Unidades Entregadas:</span>
              <span className="text-xs font-black text-white font-satoshi-black">{totalUnidadesVendidas} unds</span>
            </div>

            <div className="flex items-center justify-between border-t border-slate-700/60 pt-1.5">
              <span className="text-xs font-satoshi-regular text-[#A0AEC0]">Órdenes Entregadas:</span>
              <span className="text-xs font-black text-white font-satoshi-black">{ventasEntregadasFiltradas.length} ops</span>
            </div>
          </div>

          <div className="bg-amber-950/40 border border-amber-500/40 rounded-xl p-2 flex items-center justify-between text-[11px]">
            <div className="flex items-center gap-1.5 text-amber-400 font-satoshi-black">
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>Devoluciones:</span>
            </div>
            <span className="font-satoshi-black text-amber-300">{totalDevoluciones} ops ({formatoCOP(valorPerdidoDevoluciones)})</span>
          </div>
        </div>

      </div>

      {/* ESTADO DE RESULTADOS (P&L CONTABLE) + BALANCE STOCK */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-8">
        
        {/* P&L CONTABLE (8 COLS) */}
        <div className="lg:col-span-8 bg-[#253443] border border-slate-700/50 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="border-b border-slate-700/60 pb-3 flex justify-between items-center">
            <div>
              <h2 className="text-base font-satoshi-black text-white uppercase tracking-wider flex items-center gap-2">
                <svg className="w-4 h-4 text-[#0DE8C0]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 012-2h2a2 2 0 012 2v6m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2M5 19V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2H7a2 2 0 01-2-2z" />
                </svg>
                <span>Estado de Resultados (P&L Express)</span>
              </h2>
              <p className="text-xs text-[#A0AEC0]">
                Desglose contable de ingresos, tributación, costos directos y margen operativo.
              </p>
            </div>
            <span className="text-[10px] font-mono text-[#0DE8C0] bg-[#1D2935] px-2.5 py-1 rounded-lg border border-slate-700">
              Cierre: {mesesDelAnio[mesFiltro].nombre} {anioFiltro}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-satoshi-regular">
            <div className="bg-[#1D2935] p-3.5 rounded-xl border border-slate-700/80 space-y-2">
              <div className="flex justify-between items-center text-slate-300">
                <span>Ventas Brutas (+ Descuentos):</span>
                <span className="font-satoshi-black text-white">{formatoCOP(totalVentasBrutas)}</span>
              </div>
              <div className="flex justify-between items-center text-amber-400">
                <span>(-) Descuentos Otorgados:</span>
                <span>-{formatoCOP(totalDescuentosOtorgados)}</span>
              </div>
              <div className="flex justify-between items-center text-red-400">
                <span>(-) Impuesto IVA Discriminado:</span>
                <span>-{formatoCOP(totalIvaMontoAcumulado)}</span>
              </div>
              <div className="flex justify-between items-center font-satoshi-black text-[#0DE8C0] pt-2 border-t border-slate-700">
                <span>(=) Ingreso Neto Real (Base Gravable):</span>
                <span>{formatoCOP(baseGravableTotal)}</span>
              </div>
            </div>

            <div className="bg-[#1D2935] p-3.5 rounded-xl border border-slate-700/80 space-y-2">
              <div className="flex justify-between items-center text-red-300">
                <span>(-) Costo de Producto (COGS):</span>
                <span>-{formatoCOP(costoDirectoProducto)}</span>
              </div>
              <div className="flex justify-between items-center text-red-300">
                <span>(-) Fulfillment (Solo E-Commerce):</span>
                <span>-{formatoCOP(costoFulfilmentTotal)}</span>
              </div>
              <div className="flex justify-between items-center font-satoshi-black text-[#C81FDA] pt-3.5 border-t border-slate-700">
                <span>(=) GANANCIA NETA OPERATIVA:</span>
                <span>{formatoCOP(gananciaNetaReal)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* BALANCE DE STOCK EN BODEGA (4 COLS) */}
        <div className="lg:col-span-4 bg-[#253443] border border-slate-700/50 rounded-2xl p-6 shadow-xl flex flex-col justify-between">
          <div className="space-y-3">
            <div className="border-b border-slate-700/60 pb-2">
              <h2 className="text-base font-satoshi-black text-white uppercase tracking-wider flex items-center gap-2">
                <svg className="w-4 h-4 text-[#0DE8C0]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
                <span>Valoración de Inventario</span>
              </h2>
              <p className="text-xs text-[#A0AEC0]">Capital activo inmovilizado en bodegas.</p>
            </div>

            <div className="bg-[#1D2935] p-4 rounded-xl border border-slate-700/80 space-y-2">
              <span className="text-[10px] font-satoshi-black text-[#A0AEC0] uppercase block">Capital Inmovilizado (Costo)</span>
              <div className="text-2xl font-black text-white font-satoshi-black">
                {formatoCOP(capitalInmovilizadoStock)}
              </div>
              <p className="text-[11px] text-slate-400">Calculado sobre costo de adquisición/importación.</p>
            </div>
          </div>

          <div className="text-[10px] text-slate-400 bg-[#1D2935]/50 p-2.5 rounded-xl border border-slate-800">
            💡 Mantener la rotación continua evita la pérdida de margen por depreciación de mercancía.
          </div>
        </div>

      </div>

      {/* GRÁFICOS Y COMPARATIVAS VISUALES */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-8">
        
        {/* DISTRIBUCIÓN POR AGRUPACIÓN (7 COLS) */}
        <div className="lg:col-span-7 bg-[#253443] border border-slate-700/50 rounded-2xl p-6 shadow-xl space-y-5">
          <div className="border-b border-slate-700/60 pb-3 flex justify-between items-center">
            <div>
              <h2 className="text-base font-satoshi-black text-white uppercase tracking-wider">
                Distribución por {agruparPor === 'SEDES' ? 'Sedes' : agruparPor === 'CANALES' ? 'Canales' : 'Vendedores'}
              </h2>
              <p className="text-xs text-[#A0AEC0] font-satoshi-regular">
                Aportación porcentual a las ventas en estado ENTREGADO
              </p>
            </div>

            <div className="bg-[#1D2935] p-1 rounded-xl flex items-center gap-1 border border-slate-700/60 shrink-0">
              <button
                type="button"
                onClick={() => setAgruparPor('SEDES')}
                className={`px-3 py-1.5 rounded-lg text-xs font-satoshi-black transition ${
                  agruparPor === 'SEDES'
                    ? 'bg-[#0DE8C0] text-[#1D2935]'
                    : 'text-[#A0AEC0] hover:text-white'
                }`}
              >
                Sedes
              </button>

              <button
                type="button"
                onClick={() => setAgruparPor('CANALES')}
                className={`px-3 py-1.5 rounded-lg text-xs font-satoshi-black transition ${
                  agruparPor === 'CANALES'
                    ? 'bg-[#0DE8C0] text-[#1D2935]'
                    : 'text-[#A0AEC0] hover:text-white'
                }`}
              >
                Canales
              </button>

              <button
                type="button"
                onClick={() => setAgruparPor('VENDEDORES')}
                className={`px-3 py-1.5 rounded-lg text-xs font-satoshi-black transition ${
                  agruparPor === 'VENDEDORES'
                    ? 'bg-[#0DE8C0] text-[#1D2935]'
                    : 'text-[#A0AEC0] hover:text-white'
                }`}
              >
                Vendedores
              </button>
            </div>
          </div>

          <div className="space-y-4">
            {agrupacionData.map((item, idx) => (
              <div key={idx} className="space-y-1.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-satoshi-black text-white">{item.nombre}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-satoshi-black text-[#0DE8C0]">{formatoCOP(item.monto)}</span>
                    <span className="text-[11px] font-mono text-[#0DE8C0] bg-[#1D2935] px-1.5 py-0.5 rounded">
                      {item.porcentaje}%
                    </span>
                  </div>
                </div>

                <div className="w-full h-3 bg-[#1D2935] rounded-full overflow-hidden p-0.5 border border-slate-700/40">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#C81FDA] to-[#0DE8C0] transition-all duration-500"
                    style={{ width: `${Math.max(item.porcentaje, 4)}%` }}
                  ></div>
                </div>
              </div>
            ))}

            {agrupacionData.length === 0 && (
              <div className="text-center py-12 text-[#A0AEC0] text-xs font-satoshi-regular">
                No se registraron ventas entregadas en {mesesDelAnio[mesFiltro].nombre} de {anioFiltro}.
              </div>
            )}
          </div>
        </div>

        {/* RANKING TOP PRODUCTOS MÁS VENDIDOS (SÓLO ENTREGADOS - 5 COLS) */}
        <div className="lg:col-span-5 bg-[#253443] border border-slate-700/50 rounded-2xl p-6 shadow-xl space-y-5">
          <div className="border-b border-slate-700/60 pb-3">
            <h2 className="text-base font-satoshi-black text-white uppercase tracking-wider">
              Top Productos Más Vendidos
            </h2>
            <p className="text-xs text-[#A0AEC0] font-satoshi-regular">
              Ranking por cantidad de unidades vendidas (Solo ENTREGADO)
            </p>
          </div>

          <div className="space-y-3">
            {topProductos.map((prod, idx) => (
              <div
                key={prod.sku || idx}
                className="bg-[#1D2935] border border-slate-700/60 rounded-xl p-3 flex items-center justify-between gap-3 shadow-md"
              >
                <div className="flex items-center gap-3 truncate">
                  <span className="w-7 h-7 rounded-lg bg-[#253443] border border-slate-700 text-[#0DE8C0] font-satoshi-black text-xs flex items-center justify-center shrink-0">
                    #{idx + 1}
                  </span>
                  <div className="truncate">
                    <h3 className="font-satoshi-black text-xs text-white uppercase truncate">
                      {prod.nombre}
                    </h3>
                    <span className="font-mono text-[10px] text-slate-400">
                      SKU/Ref: {prod.sku}
                    </span>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <span className="block font-satoshi-black text-xs text-[#0DE8C0]">
                    {prod.cantidad} unds
                  </span>
                  <span className="block font-satoshi-regular text-[10px] text-slate-300">
                    {formatoCOP(prod.totalMonto)}
                  </span>
                </div>
              </div>
            ))}

            {topProductos.length === 0 && (
              <div className="text-center py-12 text-[#A0AEC0] text-xs font-satoshi-regular">
                Sin productos en el ranking de ventas entregadas.
              </div>
            )}
          </div>
        </div>

      </div>

    </div>
  );
}
