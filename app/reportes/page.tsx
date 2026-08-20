'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export default function ReportesPage() {
  const [userAuth, setUserAuth] = useState<any>(null);
  const [ventas, setVentas] = useState<any[]>([]);
  const [productos, setProductos] = useState<any[]>([]);
  const [sucursales, setSucursales] = useState<any[]>([]);

  // FILTRO DE PERIODO FISCAL (MES Y AÑO LOBO STOCK)
  const hoy = new Date();
  const [mesFiltro, setMesFiltro] = useState<number>(hoy.getMonth());
  const [anioFiltro, setAnioFiltro] = useState<number>(hoy.getFullYear());

  const [agruparPor, setAgruparPor] = useState<'SEDES' | 'VENDEDORES' | 'CANALES'>('SEDES');
  
  // ESTADO PARA FILTRAR TOP PRODUCTOS POR SELECCIÓN
  const [seleccionFiltroTop, setSeleccionFiltroTop] = useState<string | null>(null);

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

  // Resetear selección interactiva cuando cambia el tipo de agrupación o el periodo
  useEffect(() => {
    setSeleccionFiltroTop(null);
  }, [agruparPor, mesFiltro, anioFiltro]);

  // ==========================================================
  // ESCUCHAR FIRESTORE
  // ==========================================================
  useEffect(() => {
    if (!userAuth || !userAuth.id_cuenta) return;

    const qVent = query(collection(db, 'ventas'), where('id_cuenta', '==', userAuth.id_cuenta));
    const unsubVent = onSnapshot(qVent, 
      (snap) => setVentas(snap.docs.map(d => ({ ...d.data(), id_doc: d.id }))),
      (err) => console.error("Error al cargar ventas:", err)
    );

    const qProd = query(collection(db, 'productos'), where('id_cuenta', '==', userAuth.id_cuenta));
    const unsubProd = onSnapshot(qProd, 
      (snap) => setProductos(snap.docs.map(d => ({ ...d.data(), sku: d.id }))),
      (err) => console.error("Error al cargar productos:", err)
    );

    const qSuc = query(collection(db, 'sucursales'), where('id_cuenta', '==', userAuth.id_cuenta));
    const unsubSuc = onSnapshot(qSuc, 
      (snap) => setSucursales(snap.docs.map(d => d.data())),
      (err) => console.error("Error al cargar sucursales:", err)
    );

    return () => {
      unsubVent();
      unsubProd();
      unsubSuc();
    };
  }, [userAuth]);

  // ==========================================================
  // CÁLCULOS OPTIMIZADOS CON USEMEMO (P&L y Unit Economics)
  // ==========================================================
  const metricasGenerales = useMemo(() => {
    // 1. Filtrado de Ventas por Fecha
    const ventasFiltradas = ventas.filter(v => {
      const fechaStr = v.fecha_cobro || v.fecha;
      if (!fechaStr) return false;
      const fechaObj = new Date(fechaStr);
      return fechaObj.getMonth() === mesFiltro && fechaObj.getFullYear() === anioFiltro;
    });

    // 2. Entregadas
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

    ventasEntregadasFiltradas.forEach(v => {
      totalIvaMontoAcumulado += Number(v.iva_monto) || 0;

      const origenStr = String(v.origen || v.canal_origen || v.tipo_tienda || '').toUpperCase();
      const vendedorStr = String(v.vendedor_nombre || '').toUpperCase();
      const tipoVentaStr = String(v.tipo_venta || '').toUpperCase();
      const medioPagoStr = String(v.metodo_pago || v.medio_pago || '').toUpperCase();

      const esEcommerce = 
        v.es_ecommerce === true ||
        origenStr.includes('ECOMMERCE') || origenStr.includes('E-COMMERCE') || 
        origenStr.includes('MASIVA') || origenStr.includes('SHOPIFY') || 
        origenStr.includes('WOOCOMMERCE') || origenStr.includes('INTEGRACION') || 
        vendedorStr.includes('E-COMMERCE') || vendedorStr.includes('DROPI') || 
        vendedorStr.includes('VENDELO') || vendedorStr.includes('MASTER') ||
        tipoVentaStr.includes('ECOMMERCE') || medioPagoStr.includes('DROPI');

      let maxFulfilmentOrden = 0;

      if (Array.isArray(v.items)) {
        v.items.forEach((it: any) => {
          const cant = Number(it.cantidad) || 1;
          totalUnidadesVendidas += cant;
          const prod = productos.find(p => p.sku === it.sku || (p.nombre && p.nombre.toLowerCase() === (it.nombre || '').toLowerCase()));
          
          if (prod) {
            const cImp = Number(prod.costo_importacion) || 0;
            const cFul = Number(prod.costo_fulfilment) || 0;
            
            costoImportacionTotal += cImp * cant;
            if (cFul > maxFulfilmentOrden) {
              maxFulfilmentOrden = cFul;
            }
          }
        });
      }

      if (esEcommerce) {
        costoFulfilmentTotal += maxFulfilmentOrden > 0 ? maxFulfilmentOrden : 8000;
      }
    });

    const baseGravableTotal = totalVentasEntregadas - totalIvaMontoAcumulado;
    const costoDirectoProducto = costoImportacionTotal > 0 ? costoImportacionTotal : (totalVentasEntregadas * 0.3);
    const utilidadBruta = baseGravableTotal - costoDirectoProducto;
    
    const gananciaNetaReal = utilidadBruta - costoFulfilmentTotal;
    const porcentajeMargenNeto = totalVentasEntregadas > 0 ? Math.round((gananciaNetaReal / totalVentasEntregadas) * 100) : 0;
    
    const ticketPromedio = ventasEntregadasFiltradas.length > 0 
      ? Math.round(totalVentasEntregadas / ventasEntregadasFiltradas.length) 
      : 0;

    const ordenesDevolucion = ventasFiltradas.filter(v => {
      const est = String(v.estado || '').toUpperCase();
      return est.includes('DEVOLUCION') || est.includes('DEVOLUCIÓN') || est.includes('ANULADA');
    });

    return {
      ventasEntregadasFiltradas,
      totalVentasEntregadas,
      totalDescuentosOtorgados,
      totalVentasBrutas,
      totalIvaMontoAcumulado,
      baseGravableTotal,
      costoDirectoProducto,
      costoFulfilmentTotal,
      gananciaNetaReal,
      porcentajeMargenNeto,
      ticketPromedio,
      totalUnidadesVendidas,
      totalDevoluciones: ordenesDevolucion.length,
      valorPerdidoDevoluciones: ordenesDevolucion.reduce((acc, v) => acc + (Number(v.total) || 0), 0)
    };
  }, [ventas, productos, mesFiltro, anioFiltro]);

  // ==========================================================
  // BALANCE DE INVENTARIO
  // ==========================================================
  const capitalInmovilizadoStock = useMemo(() => {
    return productos.reduce((acc, p) => {
      const stMap = p.stock || {};
      const cantStock = Object.values(stMap).reduce((a: number, val: any) => a + (Number(val) || 0), 0);
      const costoUnit = (Number(p.costo_importacion) || 0) + (Number(p.costo_fulfilment) || 0);
      return acc + (cantStock * (costoUnit || (Number(p.precio) * 0.4)));
    }, 0);
  }, [productos]);

  // Helper para clasificar canal
  const obtenerCanalVenta = (v: any) => {
    const origenStr = String(v.origen || v.canal_origen || v.tipo_tienda || '').toUpperCase();
    const vendedorStr = String(v.vendedor_nombre || '').toUpperCase();
    const bodegaStr = String(v.nombre_bodega || '').toUpperCase();

    if (
      v.es_ecommerce === true ||
      origenStr.includes('ECOMMERCE') || origenStr.includes('E-COMMERCE') || 
      origenStr.includes('MASIVA') || origenStr.includes('SHOPIFY') || 
      vendedorStr.includes('E-COMMERCE') || vendedorStr.includes('DROPI') || 
      vendedorStr.includes('VENDELO') || vendedorStr.includes('MASTER')
    ) {
      return 'E-Commerce';
    } else if (origenStr.includes('BODEGA') || bodegaStr.includes('BODEGA') || bodegaStr.includes('ALMACEN') || bodegaStr.includes('DESPACHO')) {
      return 'Bodegas';
    } else {
      return 'Tienda Física';
    }
  };

  // ==========================================================
  // AGRUPACIONES Y TOP PRODUCTOS
  // ==========================================================
  const agrupacionData = useMemo(() => {
    const mapa: { [key: string]: { monto: number; unidades: number; ordenes: number } } = {};

    metricasGenerales.ventasEntregadasFiltradas.forEach(v => {
      let clave = 'Sede Principal';

      if (agruparPor === 'SEDES') {
        clave = v.nombre_bodega || v.id_bodega_despacho || 'Sede Principal';
      } else if (agruparPor === 'VENDEDORES') {
        clave = v.vendedor_nombre || 'Vendedor POS';
      } else if (agruparPor === 'CANALES') {
        clave = obtenerCanalVenta(v);
      }

      if (!mapa[clave]) {
        mapa[clave] = { monto: 0, unidades: 0, ordenes: 0 };
      }

      let undsVenta = 0;
      if (Array.isArray(v.items)) {
        undsVenta = v.items.reduce((acc: number, it: any) => acc + (Number(it.cantidad) || 1), 0);
      }

      mapa[clave].monto += Number(v.total) || 0;
      mapa[clave].unidades += undsVenta;
      mapa[clave].ordenes += 1;
    });

    return Object.entries(mapa).map(([nombre, data]) => ({
      nombre,
      monto: data.monto,
      unidades: data.unidades,
      ordenes: data.ordenes,
      porcentaje: metricasGenerales.totalVentasEntregadas > 0 ? Math.round((data.monto / metricasGenerales.totalVentasEntregadas) * 100) : 0
    })).sort((a, b) => b.monto - a.monto);
  }, [metricasGenerales.ventasEntregadasFiltradas, agruparPor]);

  const topProductos = useMemo(() => {
    const mapaProd: { [key: string]: { cantidad: number; totalMonto: number; nombre: string } } = {};

    const ventasParaTop = metricasGenerales.ventasEntregadasFiltradas.filter(v => {
      if (!seleccionFiltroTop) return true;

      if (agruparPor === 'SEDES') {
        const nomSede = v.nombre_bodega || v.id_bodega_despacho || 'Sede Principal';
        return nomSede.toLowerCase() === seleccionFiltroTop.toLowerCase();
      } else if (agruparPor === 'VENDEDORES') {
        const nomVend = v.vendedor_nombre || 'Vendedor POS';
        return nomVend.toLowerCase() === seleccionFiltroTop.toLowerCase();
      } else if (agruparPor === 'CANALES') {
        const canal = obtenerCanalVenta(v);
        return canal.toLowerCase() === seleccionFiltroTop.toLowerCase();
      }
      return true;
    });

    ventasParaTop.forEach(v => {
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
  }, [metricasGenerales.ventasEntregadasFiltradas, agrupacionData, seleccionFiltroTop]);

  return (
    <div className="min-h-screen bg-[#F4F5F7] text-gray-800 p-6 md:p-10 font-sans relative pb-20">
      
      {/* CABECERA PRINCIPAL */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4 border-b border-gray-200 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2.5 h-2.5 rounded-full bg-[#FFD800] border border-gray-800 animate-pulse"></span>
            <span className="text-[11px] font-satoshi-black text-gray-900 uppercase tracking-wider font-bold">
              Analítica Financiera
            </span>
          </div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight font-satoshi-black">
            REPORTES Y ANALÍTICA
          </h1>
          <p className="text-xs text-gray-500 mt-1 font-satoshi-regular max-w-xl">
            Monitoreo en tiempo real del flujo de caja, Estado de Resultados (P&L) y rentabilidad neta.
          </p>
        </div>
      </div>

      {/* BARRA SUPERIOR: SELECTOR DE MES Y AÑO */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-8 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#222222] text-[#FFD800] flex items-center justify-center shrink-0 shadow-sm">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <span className="text-xs font-satoshi-black text-gray-900 uppercase tracking-wider block font-bold">
              PERIODO FISCAL ACTIVO
            </span>
            <span className="text-[11px] text-gray-500 font-satoshi-regular">
              Filtra el mes y año que deseas revisar para actualizar métricas e historial.
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
          <select
            className="bg-gray-50 border border-gray-300 focus:border-[#FFD800] focus:ring-2 focus:ring-[#FFD800]/20 text-xs text-gray-900 font-satoshi-black rounded-xl px-3 py-2 focus:outline-none cursor-pointer flex-1 sm:flex-none transition-all"
            value={mesFiltro}
            onChange={(e) => setMesFiltro(Number(e.target.value))}
          >
            {mesesDelAnio.map(m => (
              <option key={m.id} value={m.id} className="bg-white text-gray-900">
                {m.nombre}
              </option>
            ))}
          </select>

          <select
            className="bg-gray-50 border border-gray-300 focus:border-[#FFD800] focus:ring-2 focus:ring-[#FFD800]/20 text-xs text-gray-900 font-satoshi-black rounded-xl px-3 py-2 focus:outline-none cursor-pointer transition-all"
            value={anioFiltro}
            onChange={(e) => setAnioFiltro(Number(e.target.value))}
          >
            {listaAnios.map(a => (
              <option key={a} value={a} className="bg-white text-gray-900">
                {a}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* METRICAS HERO CON ÍCONOS 2D VECTORIALES */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-8">
        
        {/* VENTAS ENTREGADAS (6 COLS) */}
        <div className="lg:col-span-6 bg-white border border-gray-200 rounded-2xl p-6 shadow-sm relative overflow-hidden flex flex-col justify-between h-44">
          <div className="flex justify-between items-start">
            <span className="text-[11px] font-satoshi-black text-gray-700 uppercase tracking-wider font-bold">
              VENTAS ENTREGADAS ({mesesDelAnio[mesFiltro].nombre.toUpperCase()})
            </span>
            <div className="w-9 h-9 rounded-xl bg-[#222222] text-[#FFD800] flex items-center justify-center shrink-0 shadow-sm">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>

          <div className="my-1">
            <div className="text-4xl md:text-5xl font-black text-gray-900 font-satoshi-black tracking-tight">
              {formatoCOP(metricasGenerales.totalVentasEntregadas)}
            </div>
          </div>

          <p className="text-xs text-gray-500 font-satoshi-regular">
            Procesadas exclusivamente en estado <strong className="text-gray-900">ENTREGADO</strong> en {mesesDelAnio[mesFiltro].nombre} del {anioFiltro}
          </p>
        </div>

        {/* GANANCIA NETA REAL (3 COLS) */}
        <div className="lg:col-span-3 bg-white border border-gray-200 rounded-2xl p-6 shadow-sm flex flex-col justify-between h-44">
          <div className="flex justify-between items-start">
            <span className="text-[11px] font-satoshi-black text-gray-700 uppercase tracking-wider font-bold">
              UTILIDAD NETA REAL
            </span>
            <span className="bg-[#222222] text-[#FFD800] text-[10px] font-satoshi-black px-2.5 py-0.5 rounded-full font-bold">
              {metricasGenerales.porcentajeMargenNeto}% Neto
            </span>
          </div>

          <div className="my-1">
            <div className="text-3xl font-black text-emerald-600 font-satoshi-black tracking-tight">
              {formatoCOP(metricasGenerales.gananciaNetaReal)}
            </div>
          </div>

          <p className="text-xs text-gray-500 font-satoshi-regular">
            Resultado descontando COGS, IVA y Fulfillment E-Commerce
          </p>
        </div>

        {/* UNIDADES Y TICKET PROMEDIO (3 COLS) */}
        <div className="lg:col-span-3 bg-white border border-gray-200 rounded-2xl p-5 shadow-sm flex flex-col justify-between h-44">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-satoshi-regular text-gray-500">Ticket Promedio (AOV):</span>
              <span className="text-xs font-black text-gray-900 font-satoshi-black">{formatoCOP(metricasGenerales.ticketPromedio)}</span>
            </div>

            <div className="flex items-center justify-between border-t border-gray-100 pt-1.5">
              <span className="text-xs font-satoshi-regular text-gray-500">Unidades Entregadas:</span>
              <span className="text-xs font-black text-gray-900 font-satoshi-black">{metricasGenerales.totalUnidadesVendidas} unds</span>
            </div>

            <div className="flex items-center justify-between border-t border-gray-100 pt-1.5">
              <span className="text-xs font-satoshi-regular text-gray-500">Órdenes Entregadas:</span>
              <span className="text-xs font-black text-gray-900 font-satoshi-black">{metricasGenerales.ventasEntregadasFiltradas.length} ops</span>
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-2 flex items-center justify-between text-[11px]">
            <div className="flex items-center gap-1.5 text-amber-800 font-satoshi-black font-bold">
              <svg className="w-3.5 h-3.5 shrink-0 text-amber-800" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>Devoluciones:</span>
            </div>
            <span className="font-satoshi-black text-amber-900">{metricasGenerales.totalDevoluciones} ops ({formatoCOP(metricasGenerales.valorPerdidoDevoluciones)})</span>
          </div>
        </div>

      </div>

      {/* ESTADO DE RESULTADOS (P&L CONTABLE) + BALANCE STOCK */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-8">
        
        {/* P&L CONTABLE (8 COLS) */}
        <div className="lg:col-span-8 bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="border-b border-gray-100 pb-3 flex justify-between items-center">
            <div>
              <h2 className="text-base font-satoshi-black text-gray-900 uppercase tracking-wider flex items-center gap-2">
                <svg className="w-4 h-4 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 012-2h2a2 2 0 012 2v6m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2M5 19V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2H7a2 2 0 01-2-2z" />
                </svg>
                <span>Estado de Resultados (P&L Express)</span>
              </h2>
              <p className="text-xs text-gray-500">
                Desglose contable de ingresos, tributación, costos directos y margen operativo.
              </p>
            </div>
            <span className="text-[10px] font-mono text-gray-800 bg-gray-100 px-2.5 py-1 rounded-lg border border-gray-200">
              Cierre: {mesesDelAnio[mesFiltro].nombre} {anioFiltro}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-satoshi-regular">
            <div className="bg-gray-50 p-3.5 rounded-xl border border-gray-200 space-y-2">
              <div className="flex justify-between items-center text-gray-600">
                <span>Ventas Brutas (+ Descuentos):</span>
                <span className="font-satoshi-black text-gray-900">{formatoCOP(metricasGenerales.totalVentasBrutas)}</span>
              </div>
              <div className="flex justify-between items-center text-amber-700">
                <span>(-) Descuentos Otorgados:</span>
                <span>-{formatoCOP(metricasGenerales.totalDescuentosOtorgados)}</span>
              </div>
              <div className="flex justify-between items-center text-red-600">
                <span>(-) Impuesto IVA Discriminado:</span>
                <span>-{formatoCOP(metricasGenerales.totalIvaMontoAcumulado)}</span>
              </div>
              <div className="flex justify-between items-center font-satoshi-black text-gray-900 pt-2 border-t border-gray-200">
                <span>(=) Ingreso Neto Real (Base Gravable):</span>
                <span>{formatoCOP(metricasGenerales.baseGravableTotal)}</span>
              </div>
            </div>

            <div className="bg-gray-50 p-3.5 rounded-xl border border-gray-200 space-y-2">
              <div className="flex justify-between items-center text-red-600">
                <span>(-) Costo de Producto (COGS):</span>
                <span>-{formatoCOP(metricasGenerales.costoDirectoProducto)}</span>
              </div>
              <div className="flex justify-between items-center text-red-600">
                <span>(-) Fulfillment (Solo E-Commerce):</span>
                <span>-{formatoCOP(metricasGenerales.costoFulfilmentTotal)}</span>
              </div>
              <div className="flex justify-between items-center font-satoshi-black text-emerald-700 pt-3.5 border-t border-gray-200">
                <span>(=) GANANCIA NETA OPERATIVA:</span>
                <span>{formatoCOP(metricasGenerales.gananciaNetaReal)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* BALANCE DE STOCK EN BODEGA (4 COLS) */}
        <div className="lg:col-span-4 bg-white border border-gray-200 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
          <div className="space-y-3">
            <div className="border-b border-gray-100 pb-2">
              <h2 className="text-base font-satoshi-black text-gray-900 uppercase tracking-wider flex items-center gap-2">
                <svg className="w-4 h-4 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
                <span>Valoración de Inventario</span>
              </h2>
              <p className="text-xs text-gray-500">Capital activo inmovilizado en bodegas.</p>
            </div>

            <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 space-y-2">
              <span className="text-[10px] font-satoshi-black text-gray-500 uppercase block">Capital Inmovilizado (Costo)</span>
              <div className="text-2xl font-black text-gray-900 font-satoshi-black">
                {formatoCOP(capitalInmovilizadoStock)}
              </div>
              <p className="text-[11px] text-gray-500">Calculado sobre costo de adquisición/importación.</p>
            </div>
          </div>

          <div className="text-[10px] text-gray-500 bg-gray-50 p-2.5 rounded-xl border border-gray-200">
            💡 Mantener la rotación continua evita la pérdida de margen por depreciación de mercancía.
          </div>
        </div>

      </div>

      {/* GRÁFICOS Y COMPARATIVAS VISUALES CON INTERACTIVIDAD REACCIONANTE */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-8">
        
        {/* DISTRIBUCIÓN POR AGRUPACIÓN (7 COLS) */}
        <div className="lg:col-span-7 bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-5">
          <div className="border-b border-gray-100 pb-3 flex justify-between items-center">
            <div>
              <h2 className="text-base font-satoshi-black text-gray-900 uppercase tracking-wider">
                Distribución por {agruparPor === 'SEDES' ? 'Sedes' : agruparPor === 'CANALES' ? 'Canales' : 'Vendedores'}
              </h2>
              <p className="text-xs text-gray-500 font-satoshi-regular">
                Haz clic en una opción para filtrar el Ranking de Top Productos en tiempo real.
              </p>
            </div>

            <div className="bg-gray-100 p-1 rounded-xl flex items-center gap-1 border border-gray-200 shrink-0">
              <button
                type="button"
                onClick={() => setAgruparPor('SEDES')}
                className={`px-3 py-1.5 rounded-lg text-xs font-satoshi-black transition ${
                  agruparPor === 'SEDES'
                    ? 'bg-[#FFD800] text-[#222222] font-bold shadow-sm'
                    : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                Sedes
              </button>

              <button
                type="button"
                onClick={() => setAgruparPor('CANALES')}
                className={`px-3 py-1.5 rounded-lg text-xs font-satoshi-black transition ${
                  agruparPor === 'CANALES'
                    ? 'bg-[#FFD800] text-[#222222] font-bold shadow-sm'
                    : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                Canales
              </button>

              <button
                type="button"
                onClick={() => setAgruparPor('VENDEDORES')}
                className={`px-3 py-1.5 rounded-lg text-xs font-satoshi-black transition ${
                  agruparPor === 'VENDEDORES'
                    ? 'bg-[#FFD800] text-[#222222] font-bold shadow-sm'
                    : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                Vendedores
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {agrupacionData.map((item, idx) => {
              const isSelected = seleccionFiltroTop?.toLowerCase() === item.nombre.toLowerCase();

              return (
                <div 
                  key={idx} 
                  onClick={() => setSeleccionFiltroTop(isSelected ? null : item.nombre)}
                  className={`p-3 rounded-xl border transition-all cursor-pointer select-none space-y-2 ${
                    isSelected 
                      ? 'bg-gray-100 border-[#FFD800] shadow-sm' 
                      : 'bg-gray-50 hover:bg-gray-100/80 border-gray-200'
                  }`}
                >
                  <div className="flex justify-between items-center text-xs">
                    <div className="flex items-center gap-2 truncate">
                      <span className={`w-2 h-2 rounded-full ${isSelected ? 'bg-[#FFD800] border border-gray-900 animate-pulse' : 'bg-gray-400'}`} />
                      <span className="font-satoshi-black text-gray-900 truncate">{item.nombre}</span>
                      <span className="text-[10px] text-gray-500 bg-white px-2 py-0.5 rounded-md border border-gray-200 font-mono">
                        {item.unidades} productos ({item.ordenes} ops)
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-satoshi-black text-gray-900">{formatoCOP(item.monto)}</span>
                      <span className="text-[11px] font-mono text-gray-800 bg-white px-1.5 py-0.5 rounded border border-gray-200">
                        {item.porcentaje}%
                      </span>
                    </div>
                  </div>

                  <div className="w-full h-2.5 bg-gray-200 rounded-full overflow-hidden p-0.5 border border-gray-200">
                    <div
                      className="h-full rounded-full bg-[#FFD800] transition-all duration-500"
                      style={{ width: `${Math.max(item.porcentaje, 4)}%` }}
                    ></div>
                  </div>
                </div>
              );
            })}

            {agrupacionData.length === 0 && (
              <div className="text-center py-12 text-gray-500 text-xs font-satoshi-regular">
                No se registraron ventas entregadas en {mesesDelAnio[mesFiltro].nombre} de {anioFiltro}.
              </div>
            )}
          </div>
        </div>

        {/* RANKING TOP PRODUCTOS (5 COLS) */}
        <div className="lg:col-span-5 bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-5">
          <div className="border-b border-gray-100 pb-3 flex justify-between items-center">
            <div>
              <h2 className="text-base font-satoshi-black text-gray-900 uppercase tracking-wider">
                Top Productos
              </h2>
              <p className="text-xs text-gray-500 font-satoshi-regular">
                {seleccionFiltroTop 
                  ? `Filtrado por: "${seleccionFiltroTop}"`
                  : 'Ranking general de unidades vendidas'}
              </p>
            </div>

            {seleccionFiltroTop && (
              <button
                type="button"
                onClick={() => setSeleccionFiltroTop(null)}
                className="text-[10px] font-satoshi-black text-gray-900 hover:underline bg-gray-100 px-2 py-1 rounded-lg border border-gray-300"
              >
                ✕ Ver Todos
              </button>
            )}
          </div>

          <div className="space-y-3">
            {topProductos.map((prod, idx) => (
              <div
                key={prod.sku || idx}
                className="bg-gray-50 border border-gray-200 rounded-xl p-3 flex items-center justify-between gap-3 shadow-xs"
              >
                <div className="flex items-center gap-3 truncate">
                  <span className="w-7 h-7 rounded-lg bg-[#222222] text-[#FFD800] font-satoshi-black text-xs flex items-center justify-center shrink-0">
                    #{idx + 1}
                  </span>
                  <div className="truncate">
                    <h3 className="font-satoshi-black text-xs text-gray-900 uppercase truncate">
                      {prod.nombre}
                    </h3>
                    <span className="font-mono text-[10px] text-gray-500">
                      SKU/Ref: {prod.sku}
                    </span>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <span className="block font-satoshi-black text-xs text-gray-900 font-bold">
                    {prod.cantidad} unds
                  </span>
                  <span className="block font-satoshi-regular text-[10px] text-gray-500">
                    {formatoCOP(prod.totalMonto)}
                  </span>
                </div>
              </div>
            ))}

            {topProductos.length === 0 && (
              <div className="text-center py-12 text-gray-500 text-xs font-satoshi-regular">
                {seleccionFiltroTop 
                  ? `Sin productos registrados para "${seleccionFiltroTop}".`
                  : 'Sin productos en el ranking de ventas entregadas.'}
              </div>
            )}
          </div>
        </div>

      </div>

    </div>
  );
}
