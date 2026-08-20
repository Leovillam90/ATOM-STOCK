'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { formatearMonedaGlobal } from '@/lib/moneda';

export default function FacturasPage() {
  const [userAuth, setUserAuth] = useState<any>(null);
  const [facturas, setFacturas] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<'TODAS' | 'EMITIDA' | 'PENDIENTE' | 'ANULADA'>('TODAS');

  // CONTROL DE ORDENAMIENTO Y PAGINACIÓN
  const [ordenFecha, setOrdenFecha] = useState<'NUEVAS_PRIMERO' | 'ANTIGUAS_PRIMERO'>('NUEVAS_PRIMERO');
  const [paginaActual, setPaginaActual] = useState<number>(1);
  const ventasPorPagina = 50;

  // FILTRO DINÁMICO DE FECHA
  const fechaHoy = new Date();
  const [mesFiltro, setMesFiltro] = useState<number>(fechaHoy.getMonth());
  const [anioFiltro, setAnioFiltro] = useState<number>(fechaHoy.getFullYear());

  // Modales
  const [showModalDetail, setShowModalDetail] = useState(false);
  const [selectedFactura, setSelectedFactura] = useState<any>(null);

  // Moneda Oficial de la empresa configurada en Perfil
  const monedaLocal = userAuth?.moneda_oficial || 'COP';

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
      try {
        setUserAuth(JSON.parse(savedUser));
      } catch (e) {
        localStorage.removeItem('atom_user_session');
      }
    }
  }, []);

  // ESCUCHAR FIRESTORE EN TIEMPO REAL
  useEffect(() => {
    if (!userAuth || !userAuth.id_cuenta) return;

    const esVendedorRol = userAuth.rol === 'VENDEDOR';
    let q;

    if (esVendedorRol) {
      q = query(
        collection(db, 'ventas'),
        where('id_cuenta', '==', userAuth.id_cuenta),
        where('vendedor_nombre', '==', userAuth.nombre)
      );
    } else {
      q = query(collection(db, 'ventas'), where('id_cuenta', '==', userAuth.id_cuenta));
    }

    const unsub = onSnapshot(q, 
      (snap) => setFacturas(snap.docs.map(d => ({ ...d.data(), id_doc: d.id }))),
      (err) => console.error("Error cargando facturas:", err)
    );

    return () => unsub();
  }, [userAuth]);

  // RESETEAR A PÁGINA 1 CUANDO CAMBIAN LOS FILTROS
  useEffect(() => {
    setPaginaActual(1);
  }, [searchQuery, filtroEstado, mesFiltro, anioFiltro, ordenFecha]);

  // LÓGICA MEMOIZADA DE FILTROS Y MÉTRICAS
  const {
    facturasPaginadas,
    totalFacturasCount,
    totalPaginas,
    totalFacturadoMes,
    totalEmitidasMes,
    totalAnuladasMes,
    facturasParaExportar
  } = useMemo(() => {
    const porPeriodo = facturas.filter(f => {
      const fechaStr = f.fecha_cobro || f.fecha;
      if (!fechaStr) return false;
      const fechaObj = new Date(fechaStr);
      return fechaObj.getMonth() === mesFiltro && fechaObj.getFullYear() === anioFiltro;
    });

    const q = searchQuery.toLowerCase().trim();
    const porBusquedaYEstado = porPeriodo.filter(f => {
      const matchSearch = String(f.id_factura || '').toLowerCase().includes(q) ||
                          String(f.cliente_nombre || '').toLowerCase().includes(q) ||
                          String(f.cliente_nit || '').toLowerCase().includes(q) ||
                          String(f.nombre_bodega || '').toLowerCase().includes(q) ||
                          String(f.orden_referencia || '').toLowerCase().includes(q);
      
      if (!matchSearch) return false;

      const estadoFactura = String(f.estado || 'EMITIDA').toUpperCase();
      if (filtroEstado === 'EMITIDA') return estadoFactura === 'EMITIDA' || estadoFactura === 'PAGADA';
      if (filtroEstado === 'PENDIENTE') return estadoFactura === 'PENDIENTE';
      if (filtroEstado === 'ANULADA') return estadoFactura === 'ANULADA';

      return true;
    });

    const ordenadas = [...porBusquedaYEstado].sort((a, b) => {
      const fechaA = new Date(a.fecha_cobro || a.fecha || 0).getTime();
      const fechaB = new Date(b.fecha_cobro || b.fecha || 0).getTime();
      return ordenFecha === 'NUEVAS_PRIMERO' ? fechaB - fechaA : fechaA - fechaB;
    });

    const totalCount = ordenadas.length;
    const paginas = Math.ceil(totalCount / ventasPorPagina) || 1;
    const idxInicio = (paginaActual - 1) * ventasPorPagina;
    const paginadas = ordenadas.slice(idxInicio, idxInicio + ventasPorPagina);

    const validas = porPeriodo.filter(f => String(f.estado || '').toUpperCase() !== 'ANULADA');
    const anuladas = porPeriodo.filter(f => String(f.estado || '').toUpperCase() === 'ANULADA');
    const facturado = validas.reduce((acc, f) => acc + (Number(f.total) || 0), 0);

    return {
      facturasPaginadas: paginadas,
      totalFacturasCount: totalCount,
      totalPaginas: paginas,
      totalFacturadoMes: facturado,
      totalEmitidasMes: validas.length,
      totalAnuladasMes: anuladas.length,
      facturasParaExportar: porBusquedaYEstado
    };
  }, [facturas, mesFiltro, anioFiltro, searchQuery, filtroEstado, ordenFecha, paginaActual]);

  const indiceInicial = (paginaActual - 1) * ventasPorPagina;

  // EXPORTACIÓN CONTABLE CORREGIDA (DESGLOSA TODOS LOS ÍTEMS VENDIDOS)
  const handleExportarReporteFiscal = () => {
    if (!facturasParaExportar || facturasParaExportar.length === 0) {
      return alert('No hay comprobantes registrados en los filtros actuales para exportar.');
    }

    const bom = '\uFEFF';
    let csvContent = 'SEP=;\n';
    csvContent += 'NUM_COMPROBANTE;ORDEN_REF;FECHA_EMISION;TIPO_DOC;NIT_RUT;CLIENTE_NOMBRE;CORREO_CLIENTE;TELEFONO;DIRECCION;CIUDAD;RESPONSABILIDAD_FISCAL;SKU;PRODUCTO;CANTIDAD;PRECIO_UNITARIO;METODO_PAGO;CANAL_ORIGEN;SUBTOTAL_GRAVABLE;IVA_MONTO;TOTAL_CON_IMPUESTO;ESTADO_FISCAL\n';

    facturasParaExportar.forEach(f => {
      const fNum = f.id_factura || 'N/A';
      const fOrden = f.orden_referencia || 'N/A';
      const fFecha = f.fecha_cobro || f.fecha ? new Date(f.fecha_cobro || f.fecha).toISOString() : 'N/A';
      const fTipoDoc = f.cliente_tipo_doc || '13';
      const fNit = f.cliente_nit || 'CF_GENERAL';
      const fCliente = (f.cliente_nombre || 'Consumidor Final').replace(/;/g, ' ');
      const fMail = f.cliente_correo || 'N/A';
      const fTel = f.cliente_telefono || 'N/A';
      const fDir = (f.cliente_direccion || 'N/A').replace(/;/g, ' ');
      const fCiu = (f.cliente_ciudad || 'Cali').replace(/;/g, ' ');
      const fResp = f.cliente_responsabilidad_fiscal || 'R-99-PN';
      const fMetodo = f.metodo_pago || 'EFECTIVO';
      const fCanal = (f.vendedor_nombre || 'Vendedor Local').replace(/;/g, ' ');
      const fEst = f.estado || 'EMITIDA';

      const items = Array.isArray(f.items) && f.items.length > 0 
        ? f.items 
        : [{ sku: 'N/A', nombre: 'Producto Múltiple', cantidad: 1, precio: f.total || 0 }];

      items.forEach((it: any) => {
        const fSku = it.sku || 'N/A';
        const fProd = (it.nombre || 'Producto').replace(/;/g, ' ');
        const fCant = it.cantidad || 1;
        const fPrecioUnit = it.precio || 0;
        const fSub = (it.cantidad || 1) * (it.precio || 0);
        const fIva = it.iva_monto || f.iva_monto || 0;
        const fTot = fSub + fIva;

        csvContent += `${fNum};${fOrden};${fFecha};${fTipoDoc};${fNit};${fCliente};${fMail};${fTel};${fDir};${fCiu};${fResp};${fSku};${fProd};${fCant};${fPrecioUnit};${fMetodo};${fCanal};${fSub};${fIva};${fTot};${fEst}\n`;
      });
    });

    const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const nombreMes = mesesDelAnio[mesFiltro].nombre;
    link.setAttribute('download', `Consolidado_Documentos_Venta_${nombreMes}_${anioFiltro}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-[#F4F5F7] text-gray-800 p-6 md:p-10 font-sans relative pb-20">
      
      {/* CABECERA PRINCIPAL */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 border-b border-gray-200 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2.5 h-2.5 rounded-full bg-[#FFD800] border border-gray-800 animate-pulse"></span>
            <span className="text-[11px] font-satoshi-black text-gray-900 uppercase tracking-wider font-bold">
              Pre-Facturación & Archivos Contables
            </span>
          </div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight font-satoshi-black">
            PRE-FACTURACIÓN
          </h1>
          <p className="text-xs text-gray-500 mt-1 font-satoshi-regular max-w-xl">
            Historial de ventas en POS y Bodegas. Exporta el reporte contable listo para la DIAN.
          </p>
        </div>

        <div className="flex flex-wrap gap-3 shrink-0">
          <button
            type="button"
            onClick={handleExportarReporteFiscal}
            className="bg-[#FFD800] hover:bg-[#FDCB13] text-[#222222] font-satoshi-black px-5 py-3.5 rounded-xl text-xs uppercase tracking-wider transition-all duration-300 shadow-sm flex items-center gap-2 font-bold"
          >
            <svg className="w-4 h-4 text-[#222222] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span>Exportar Consolidado Contable (CSV)</span>
          </button>
        </div>
      </div>

      {/* SELECTOR DE PERIODO */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-6 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#222222] text-[#FFD800] flex items-center justify-center font-bold text-sm shrink-0 shadow-sm">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <span className="text-xs font-satoshi-black text-gray-900 uppercase tracking-wider block font-bold">
              PERIODO FISCAL ACTIVO
            </span>
            <span className="text-[11px] text-gray-500 font-satoshi-regular">
              Filtra las ventas por mes y año.
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
          <select
            className="bg-gray-50 border border-gray-300 focus:border-[#FFD800] focus:ring-2 focus:ring-[#FFD800]/20 text-xs text-gray-900 font-satoshi-black rounded-xl px-3 py-2.5 focus:outline-none transition-all cursor-pointer"
            value={mesFiltro}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setMesFiltro(Number(e.target.value))}
          >
            {mesesDelAnio.map(m => (
              <option key={m.id} value={m.id} className="bg-white text-gray-900">{m.nombre}</option>
            ))}
          </select>

          <select
            className="bg-gray-50 border border-gray-300 focus:border-[#FFD800] focus:ring-2 focus:ring-[#FFD800]/20 text-xs text-gray-900 font-satoshi-black rounded-xl px-3 py-2.5 focus:outline-none transition-all cursor-pointer"
            value={anioFiltro}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setAnioFiltro(Number(e.target.value))}
          >
            {listaAnios.map(a => (
              <option key={a} value={a} className="bg-white text-gray-900">{a}</option>
            ))}
          </select>
        </div>
      </div>

      {/* TARJETAS MÉTRICAS (MUESTRAN MONEDA GLOBAL CONFIGURADA) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm flex flex-col justify-between h-36">
          <span className="text-[11px] font-satoshi-black text-gray-700 uppercase font-bold">TOTAL FACTURADO ({mesesDelAnio[mesFiltro].nombre.toUpperCase()})</span>
          <span className="text-3xl font-black text-gray-900 font-satoshi-black">{formatearMonedaGlobal(totalFacturadoMes, monedaLocal)}</span>
          <p className="text-xs text-gray-500 font-satoshi-regular">Acumulado fiscal importado</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm flex flex-col justify-between h-36">
          <span className="text-[11px] font-satoshi-black text-gray-700 uppercase font-bold">COMPROBANTES EMITIDOS</span>
          <span className="text-4xl font-black text-gray-900 font-satoshi-black">{totalEmitidasMes}</span>
          <p className="text-xs text-gray-500 font-satoshi-regular">Órdenes validadas</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm flex flex-col justify-between h-36">
          <span className="text-[11px] font-satoshi-black text-gray-700 uppercase font-bold">NOTAS DE CRÉDITO / ANULADAS</span>
          <span className="text-4xl font-black text-gray-400 font-satoshi-black">{totalAnuladasMes}</span>
          <p className="text-xs text-gray-500 font-satoshi-regular">Cancelaciones de envío</p>
        </div>
      </div>

      {/* BÚSQUEDA Y FILTROS DE ESTADO / ORDEN DE FECHA */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-6 flex flex-col md:flex-row justify-between items-center gap-4 shadow-sm">
        <div className="relative w-full md:w-80">
          <svg className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input 
            type="text" 
            className="w-full bg-gray-50 border border-gray-300 focus:border-[#FFD800] focus:ring-2 focus:ring-[#FFD800]/20 rounded-xl pl-10 pr-4 py-2.5 text-xs text-gray-900 placeholder-gray-400 focus:outline-none transition-all font-satoshi-regular"
            placeholder="Buscar Orden, Cliente, NIT o Producto..."
            value={searchQuery}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-end">
          {/* SELECTOR DE ORDEN POR FECHA */}
          <div className="flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-xl border border-gray-200">
            <span className="text-[10px] font-satoshi-black text-gray-500 uppercase font-bold">Orden:</span>
            <select
              className="bg-transparent text-xs text-gray-900 font-satoshi-black focus:outline-none cursor-pointer"
              value={ordenFecha}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setOrdenFecha(e.target.value as any)}
            >
              <option value="NUEVAS_PRIMERO" className="bg-white text-gray-900">Más Nuevas Primero</option>
              <option value="ANTIGUAS_PRIMERO" className="bg-white text-gray-900">Más Antiguas Primero</option>
            </select>
          </div>

          {/* FILTROS DE ESTADO */}
          <div className="flex gap-1 bg-gray-100 p-1 rounded-xl border border-gray-200">
            <button 
              onClick={() => setFiltroEstado('TODAS')} 
              className={`px-3 py-1.5 rounded-lg text-xs font-satoshi-black transition ${filtroEstado === 'TODAS' ? 'bg-[#FFD800] text-[#222222] font-bold shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
            >
              Todas
            </button>
            <button 
              onClick={() => setFiltroEstado('EMITIDA')} 
              className={`px-3 py-1.5 rounded-lg text-xs font-satoshi-black transition ${filtroEstado === 'EMITIDA' ? 'bg-[#FFD800] text-[#222222] font-bold shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
            >
              Emitidas
            </button>
            <button 
              onClick={() => setFiltroEstado('PENDIENTE')} 
              className={`px-3 py-1.5 rounded-lg text-xs font-satoshi-black transition ${filtroEstado === 'PENDIENTE' ? 'bg-[#FFD800] text-[#222222] font-bold shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
            >
              Pendientes
            </button>
            <button 
              onClick={() => setFiltroEstado('ANULADA')} 
              className={`px-3 py-1.5 rounded-lg text-xs font-satoshi-black transition ${filtroEstado === 'ANULADA' ? 'bg-[#FFD800] text-[#222222] font-bold shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
            >
              Anuladas
            </button>
          </div>
        </div>
      </div>

      {/* TABLA PRINCIPAL DE FACTURAS */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-gray-50 text-[11px] font-satoshi-black text-gray-600 uppercase border-b border-gray-200">
              <th className="p-4 rounded-tl-2xl">N° Documento</th>
              <th className="p-4">Guía / Orden Ref.</th>
              <th className="p-4">Vendedor</th>
              <th className="p-4">Cliente / NIT / Correo</th>
              <th className="p-4">Dirección & Ciudad</th>
              <th className="p-4">Producto & Cant.</th>
              <th className="p-4 text-right">Monto Total</th>
              <th className="p-4 text-center">Estado</th>
              <th className="p-4 text-center rounded-tr-2xl">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 font-satoshi-regular text-gray-800">
            {facturasPaginadas.map((f, idx) => {
              const item = Array.isArray(f.items) && f.items.length > 0 ? f.items[0] : null;
              const isAnulada = String(f.estado || '').toUpperCase() === 'ANULADA';

              return (
                <tr key={f.id_doc || f.id_factura || idx} className={`hover:bg-gray-50/50 transition ${isAnulada ? 'bg-red-50/50' : ''}`}>
                  <td className="p-4 font-mono font-bold text-gray-900">{f.id_factura}</td>
                  <td className="p-4 font-mono text-gray-700 font-bold">{f.orden_referencia || 'N/A'}</td>
                  <td className="p-4 font-satoshi-black text-gray-900 font-bold">{f.vendedor_nombre}</td>
                  <td className="p-4">
                    <div className="font-satoshi-black text-gray-900 font-bold">{f.cliente_nombre || 'Consumidor Final'}</div>
                    <div className="text-[10px] text-gray-500">NIT: {f.cliente_nit || 'N/A'}</div>
                    <div className="text-[10px] text-gray-500">{f.cliente_correo || 'N/A'}</div>
                  </td>
                  <td className="p-4">
                    <div className="text-gray-700 truncate max-w-xs">{f.cliente_direccion || 'N/A'}</div>
                    <div className="text-[10px] text-gray-500">{f.cliente_ciudad || 'Cali'}</div>
                  </td>
                  <td className="p-4">
                    <div className="font-satoshi-black text-gray-900 font-bold truncate max-w-xs">{item?.nombre || 'Producto E-Commerce'}</div>
                    <div className="text-[10px] text-gray-600 font-mono">
                      Cant: {item?.cantidad || 1} u {Array.isArray(f.items) && f.items.length > 1 ? `(+${f.items.length - 1} más)` : ''}
                    </div>
                  </td>
                  <td className="p-4 text-right font-satoshi-black text-gray-900 font-bold">{formatearMonedaGlobal(f.total, monedaLocal)}</td>
                  
                  {/* ESTADO VISUAL DE LA FACTURA */}
                  <td className="p-4 text-center">
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-satoshi-black font-bold ${
                      isAnulada 
                        ? 'bg-red-100 text-red-800 border border-red-200' 
                        : (f.estado === 'PENDIENTE' ? 'bg-amber-100 text-amber-800 border border-amber-200' : 'bg-emerald-100 text-emerald-800 border border-emerald-200')
                    }`}>
                      {f.estado || 'EMITIDA'}
                    </span>
                  </td>

                  <td className="p-4 text-center">
                    <button
                      onClick={() => { setSelectedFactura(f); setShowModalDetail(true); }}
                      className="bg-gray-100 text-gray-900 border border-gray-300 font-satoshi-black px-3 py-1.5 rounded-lg hover:bg-gray-200 transition font-bold"
                    >
                      Ver Comprobante
                    </button>
                  </td>
                </tr>
              );
            })}
            {facturasPaginadas.length === 0 && (
              <tr>
                <td colSpan={9} className="p-8 text-center text-gray-500">No hay facturas registradas en este periodo.</td>
              </tr>
            )}
          </tbody>
        </table>

        {/* PIE DE TABLA: CONTROLES DE PAGINACIÓN */}
        {totalFacturasCount > 0 && (
          <div className="bg-gray-50 border-t border-gray-200 p-4 flex flex-col sm:flex-row justify-between items-center gap-3 text-xs">
            <div className="text-gray-500 font-satoshi-regular">
              Mostrando <span className="font-satoshi-black text-gray-900 font-bold">{indiceInicial + 1}</span> a <span className="font-satoshi-black text-gray-900 font-bold">{Math.min(indiceInicial + ventasPorPagina, totalFacturasCount)}</span> de <span className="font-satoshi-black text-gray-900 font-bold">{totalFacturasCount}</span> documentos
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setPaginaActual(p => Math.max(1, p - 1))}
                disabled={paginaActual === 1}
                className="px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-gray-700 font-satoshi-black disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-100 transition font-bold"
              >
                Anterior
              </button>

              <div className="flex items-center gap-1 px-2">
                {Array.from({ length: totalPaginas }, (_, i) => i + 1)
                  .filter(p => p === 1 || p === totalPaginas || Math.abs(p - paginaActual) <= 1)
                  .map((numPag, index, array) => {
                    const mostrarPuntos = index > 0 && numPag - array[index - 1] > 1;

                    return (
                      <React.Fragment key={numPag}>
                        {mostrarPuntos && <span className="text-gray-400 px-1">...</span>}
                        <button
                          type="button"
                          onClick={() => setPaginaActual(numPag)}
                          className={`w-7 h-7 rounded-lg text-xs font-satoshi-black transition font-bold ${
                            paginaActual === numPag
                              ? 'bg-[#FFD800] text-[#222222]'
                              : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-100'
                          }`}
                        >
                          {numPag}
                        </button>
                      </React.Fragment>
                    );
                  })}
              </div>

              <button
                type="button"
                onClick={() => setPaginaActual(p => Math.min(totalPaginas, p + 1))}
                disabled={paginaActual === totalPaginas}
                className="px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-gray-700 font-satoshi-black disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-100 transition font-bold"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>

      {/* MODAL DETALLE / DOCUMENTO DE VENTA */}
      {showModalDetail && selectedFactura && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white text-gray-900 rounded-3xl w-full max-w-sm p-6 shadow-2xl font-mono text-xs relative space-y-4 border border-gray-200">
            <button onClick={() => setShowModalDetail(false)} className="absolute right-4 top-4 text-gray-400 hover:text-gray-700 transition">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <div className="text-center border-b border-dashed border-gray-300 pb-3 space-y-1">
              <h2 className="font-bold text-base uppercase font-satoshi-black">DOCUMENTO DE VENTA</h2>
              <p className="text-[10px] text-gray-600 font-bold">{selectedFactura.vendedor_nombre}</p>
              <p className="text-[10px] text-gray-500">N° {selectedFactura.id_factura}</p>
              <p className="text-[10px] text-gray-500">Guía / Ref Orden: {selectedFactura.orden_referencia || 'N/A'}</p>
            </div>

            <div className="border-b border-dashed border-gray-300 pb-2 text-[10px] space-y-0.5 text-gray-700">
              <p><strong className="text-gray-900">CLIENTE:</strong> {selectedFactura.cliente_nombre || 'Consumidor Final'}</p>
              <p><strong className="text-gray-900">NIT/CC:</strong> {selectedFactura.cliente_nit || 'N/A'} (Tipo: {selectedFactura.cliente_tipo_doc || '13'})</p>
              <p><strong className="text-gray-900">CORREO:</strong> {selectedFactura.cliente_correo || 'N/A'}</p>
              <p><strong className="text-gray-900">TELÉFONO:</strong> {selectedFactura.cliente_telefono || 'N/A'}</p>
              <p><strong className="text-gray-900">DIRECCIÓN:</strong> {selectedFactura.cliente_direccion || 'N/A'}</p>
              <p><strong className="text-gray-900">CIUDAD:</strong> {selectedFactura.cliente_ciudad || 'Cali'}</p>
              <p><strong className="text-gray-900">RESP. FISCAL:</strong> {selectedFactura.cliente_responsabilidad_fiscal || 'R-99-PN'}</p>
              <p><strong className="text-gray-900">MÉTODO:</strong> {selectedFactura.metodo_pago || 'EFECTIVO'}</p>
            </div>

            {/* DETALLE DE AUDITORÍA SI LA FACTURA ESTÁ ANULADA */}
            {String(selectedFactura.estado || '').toUpperCase() === 'ANULADA' && (
              <div className="bg-red-50 border border-red-200 p-2.5 rounded-xl text-[10px] space-y-0.5 text-red-800">
                <p className="font-bold uppercase">VENTA ANULADA / REVERSADA</p>
                <p>Motivo: {selectedFactura.motivo_anulacion || 'Sin motivo especificado'}</p>
                <p>Anulado por: {selectedFactura.usuario_anulo_nombre || 'Sistema'}</p>
              </div>
            )}

            <div className="border-b border-dashed border-gray-300 pb-3">
              {Array.isArray(selectedFactura.items) && selectedFactura.items.map((it: any, i: number) => (
                <div key={i} className="flex justify-between items-start text-[11px] mb-1">
                  <div>
                    <div className="font-bold text-gray-900">{it.nombre}</div>
                    <div className="text-[9px] text-gray-500">Cant: {it.cantidad} x {formatearMonedaGlobal(it.precio, monedaLocal)} (IVA {it.tarifaIva || 19}%)</div>
                  </div>
                  <span className="font-bold text-gray-900">{formatearMonedaGlobal(it.cantidad * it.precio, monedaLocal)}</span>
                </div>
              ))}
            </div>

            <div className="space-y-1 pt-1 text-right">
              <div className="flex justify-between text-[11px] text-gray-600">
                <span>Subtotal Gravable:</span>
                <span className="font-bold text-gray-900">{formatearMonedaGlobal(selectedFactura.subtotal, monedaLocal)}</span>
              </div>
              <div className="flex justify-between text-[11px] text-gray-600">
                <span>IVA Discriminado:</span>
                <span className="font-bold text-gray-900">{formatearMonedaGlobal(selectedFactura.iva_monto, monedaLocal)}</span>
              </div>
              <div className="flex justify-between text-sm font-black pt-1 border-t border-gray-900 text-gray-900">
                <span>TOTAL:</span>
                <span>{formatearMonedaGlobal(selectedFactura.total, monedaLocal)}</span>
              </div>
            </div>

            <button
              onClick={() => window.print()}
              className="w-full bg-[#222222] hover:bg-[#333333] text-white font-satoshi-black py-3 rounded-xl uppercase shadow-sm flex items-center justify-center gap-2 font-bold"
            >
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              <span>Imprimir Comprobante PDF</span>
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
