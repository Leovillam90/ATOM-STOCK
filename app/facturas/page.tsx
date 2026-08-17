'use client';

import React, { useState, useEffect, useRef } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export default function FacturasPage() {
  const [userAuth, setUserAuth] = useState<any>(null);
  const [facturas, setFacturas] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<'TODAS' | 'EMITIDA' | 'PENDIENTE' | 'ANULADA'>('TODAS');

  // FILTRO DINÁMICO DE FECHA (DETECCIÓN AUTOMÁTICA DEL MES Y AÑO ACTUAL)
  const fechaHoy = new Date();
  const [mesFiltro, setMesFiltro] = useState<number>(fechaHoy.getMonth());
  const [anioFiltro, setAnioFiltro] = useState<number>(fechaHoy.getFullYear());

  // Modal Ver Detalle / Reimprimir Factura Electrónica
  const [showModalDetail, setShowModalDetail] = useState(false);
  const [selectedFactura, setSelectedFactura] = useState<any>(null);

  // Menú Flotante de Opciones
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const formatoCOP = (v: number) => 
    new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(v || 0);

  const mesesDelAnio = [
    { id: 0, nombre: 'Enero' },
    { id: 1, nombre: 'Febrero' },
    { id: 2, nombre: 'Marzo' },
    { id: 3, nombre: 'Abril' },
    { id: 4, nombre: 'Mayo' },
    { id: 5, nombre: 'Junio' },
    { id: 6, nombre: 'Julio' },
    { id: 7, nombre: 'Agosto' },
    { id: 8, nombre: 'Septiembre' },
    { id: 9, nombre: 'Octubre' },
    { id: 10, nombre: 'Noviembre' },
    { id: 11, nombre: 'Diciembre' },
  ];

  const anioActualNum = new Date().getFullYear();
  const listaAnios = Array.from({ length: 5 }, (_, i) => anioActualNum - i);

  useEffect(() => {
    const savedUser = localStorage.getItem('atom_user_session');
    if (savedUser) {
      setUserAuth(JSON.parse(savedUser));
    }
  }, []);

  // ESCUCHAR FIRESTORE CON AISLAMIENTO DE PERFIL DE VENDEDOR
  useEffect(() => {
    if (!userAuth || !userAuth.id_cuenta) return;

    const esVendedorRol = userAuth.rol === 'VENDEDOR';
    let q;

    if (esVendedorRol) {
      // 🔒 FILTRO ESTRICTO VENDEDOR: Solo facturas emitidas por él mismo
      if (userAuth.id_usuario) {
        q = query(
          collection(db, 'ventas'),
          where('id_cuenta', '==', userAuth.id_cuenta),
          where('vendedor_id', '==', userAuth.id_usuario)
        );
      } else {
        q = query(
          collection(db, 'ventas'),
          where('id_cuenta', '==', userAuth.id_cuenta),
          where('vendedor_nombre', '==', userAuth.nombre)
        );
      }
    } else {
      // 👑 ADMIN / GERENTE: Ve todas las facturas de la empresa
      q = query(
        collection(db, 'ventas'),
        where('id_cuenta', '==', userAuth.id_cuenta)
      );
    }

    const unsub = onSnapshot(q, (snap) => {
      setFacturas(snap.docs.map(d => ({ ...d.data(), id_doc: d.id })));
    });

    return () => unsub();
  }, [userAuth]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const esVendedor = userAuth?.rol === 'VENDEDOR';

  // FILTRADO POR MES Y AÑO
  const facturasPorMesYAnio = facturas.filter(f => {
    // Si es vendedor, re-validar que la factura le pertenezca a él
    if (esVendedor) {
      const coincideId = userAuth?.id_usuario && f.vendedor_id === userAuth.id_usuario;
      const coincideNombre = f.vendedor_nombre === userAuth?.nombre;
      if (!coincideId && !coincideNombre) return false;
    }

    const fechaStr = f.fecha_cobro || f.fecha;
    if (!fechaStr) return false;
    const fechaObj = new Date(fechaStr);
    return fechaObj.getMonth() === mesFiltro && fechaObj.getFullYear() === anioFiltro;
  });

  // FILTRADO POR BÚSQUEDA Y ESTADO
  const facturasFiltradas = facturasPorMesYAnio.filter(f => {
    const q = searchQuery.toLowerCase().trim();
    const matchSearch = String(f.id_factura || '').toLowerCase().includes(q) ||
                        String(f.cliente_nombre || '').toLowerCase().includes(q) ||
                        String(f.cliente_nit || '').toLowerCase().includes(q) ||
                        String(f.nombre_bodega || '').toLowerCase().includes(q);
    
    if (!matchSearch) return false;

    if (filtroEstado === 'EMITIDA') return (f.estado || 'PAGADA') === 'PAGADA' || f.estado === 'EMITIDA';
    if (filtroEstado === 'PENDIENTE') return f.estado === 'PENDIENTE';
    if (filtroEstado === 'ANULADA') return f.estado === 'ANULADA';

    return true;
  });

  // METRICAS
  const totalFacturadoMes = facturasPorMesYAnio
    .filter(f => (f.estado || 'PAGADA') !== 'ANULADA')
    .reduce((acc, f) => acc + (Number(f.total) || 0), 0);

  const totalEmitidasMes = facturasPorMesYAnio.filter(f => (f.estado || 'PAGADA') !== 'ANULADA').length;
  const totalAnuladasMes = facturasPorMesYAnio.filter(f => f.estado === 'ANULADA').length;

  // FUNCIÓN DESCARGA REPORTE FISCAL (CSV DETALLADO)
  const handleExportarReporteFiscal = () => {
    if (facturasFiltradas.length === 0) {
      return alert('No hay comprobantes registrados en el filtro actual para exportar.');
    }

    const bom = '\uFEFF';
    let csvContent = 'SEP=;\n';
    csvContent += 'NUM_COMPROBANTE;FECHA_EMISION;CLIENTE;NIT_RUT;SEDE_ORIGEN;VENDEDOR;METODO_PAGO;SUBTOTAL;TOTAL;ESTADO_FISCAL\n';

    facturasFiltradas.forEach(f => {
      const fNum = f.id_factura || 'N/A';
      const fFecha = f.fecha_cobro || f.fecha ? new Date(f.fecha_cobro || f.fecha).toISOString() : 'N/A';
      const fCliente = (f.cliente_nombre || 'Consumidor Final').replace(/;/g, ' ');
      const fNit = f.cliente_nit || 'CF_GENERAL';
      const fSede = (f.nombre_bodega || f.id_bodega_despacho || 'Sede Principal').replace(/;/g, ' ');
      const fVend = (f.vendedor_nombre || 'Cajero POS').replace(/;/g, ' ');
      const fMetodo = f.metodo_pago || 'EFECTIVO';
      const fSub = f.subtotal || f.total || 0;
      const fTot = f.total || 0;
      const fEst = f.estado || 'EMITIDA';

      csvContent += `${fNum};${fFecha};${fCliente};${fNit};${fSede};${fVend};${fMetodo};${fSub};${fTot};${fEst}\n`;
    });

    const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const nombreMes = mesesDelAnio[mesFiltro].nombre;
    link.setAttribute('download', `Reporte_Facturacion_${userAuth?.nombre || 'Ventas'}_${nombreMes}_${anioFiltro}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-[#1D2935] text-slate-100 p-6 md:p-10 font-sans relative pb-20">
      
      {/* CABECERA PRINCIPAL */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4 border-b border-slate-700/60 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-[#0DE8C0] animate-pulse"></span>
            <span className="text-[11px] font-satoshi-black text-[#0DE8C0] uppercase tracking-wider">
              {esVendedor ? `Comprobantes Emitidos por ${userAuth?.nombre}` : 'Control Fiscal & Comprobantes E-Commerce'}
            </span>
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight font-satoshi-black">
            Facturación {esVendedor ? 'de Mi Caja' : 'E-Commerce'}
          </h1>
          <p className="text-xs text-[#A0AEC0] mt-1 font-satoshi-regular max-w-xl">
            {esVendedor 
              ? `Consulta de facturas y tickets emitidos personalmente por ${userAuth?.nombre}.`
              : 'Histórico de comprobantes electrónicos, notas de crédito y estados de emisión de tus canales digitales.'}
          </p>
        </div>

        {/* CTA PRINCIPAL EXPORTAR REPORTE */}
        <button
          type="button"
          onClick={handleExportarReporteFiscal}
          className="bg-[#0DE8C0] hover:bg-[#0bcfa8] text-[#1D2935] font-satoshi-black px-6 py-3.5 rounded-xl text-xs uppercase tracking-wider transition-all duration-300 shadow-lg shadow-emerald-950/40 flex items-center gap-2 shrink-0"
        >
          <svg className="w-4 h-4 text-[#1D2935]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span>Exportar Mis Facturas (CSV)</span>
        </button>
      </div>

      {/* BARRA SUPERIOR: SELECTOR DE MES Y AÑO */}
      <div className="bg-[#253443] border border-[#0DE8C0]/40 rounded-2xl p-4 mb-6 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-lg">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#0DE8C0]/10 flex items-center justify-center text-[#0DE8C0] shrink-0">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <span className="text-xs font-satoshi-black text-white uppercase tracking-wider block">
              PASO 1: SELECCIONA EL PERIODO FISCAL
            </span>
            <span className="text-[11px] text-[#A0AEC0] font-satoshi-regular">
              Filtra el mes y año que deseas revisar para actualizar métricas e historial.
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
          <select
            className="bg-[#1D2935] border border-slate-700 focus:border-[#0DE8C0] text-xs text-[#0DE8C0] font-satoshi-black rounded-xl px-3 py-2.5 focus:outline-none cursor-pointer flex-1 sm:flex-none shadow-inner"
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
            className="bg-[#1D2935] border border-slate-700 focus:border-[#0DE8C0] text-xs text-white font-satoshi-black rounded-xl px-3 py-2.5 focus:outline-none cursor-pointer shadow-inner"
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

      {/* METRICAS SUPERIORES */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        
        {/* RECAUDO FACTURADO */}
        <div className="bg-[#253443] border border-slate-700/50 rounded-2xl p-5 shadow-xl flex flex-col justify-between relative overflow-hidden h-36">
          <div className="flex justify-between items-start">
            <span className="text-[11px] font-satoshi-black text-[#0DE8C0] uppercase tracking-wider">
              TOTAL FACTURADO ({mesesDelAnio[mesFiltro].nombre.toUpperCase()})
            </span>
            <div className="w-10 h-10 rounded-full bg-[#0DE8C0]/10 flex items-center justify-center text-[#0DE8C0]">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <div className="my-1 flex items-baseline gap-3">
            <span className="text-3xl font-black text-white font-satoshi-black">
              {formatoCOP(totalFacturadoMes)}
            </span>
          </div>
          <p className="text-xs text-[#A0AEC0] font-satoshi-regular truncate">
            {esVendedor ? `Emitido por ${userAuth?.nombre}` : `Acumulado de ${mesesDelAnio[mesFiltro].nombre} del ${anioFiltro}`}
          </p>
        </div>

        {/* FACTURAS EMITIDAS */}
        <div className="bg-[#253443] border border-slate-700/50 rounded-2xl p-5 shadow-xl flex flex-col justify-between relative overflow-hidden h-36">
          <div className="flex justify-between items-start">
            <span className="text-[11px] font-satoshi-black text-[#6884C5] uppercase tracking-wider">
              COMPROBANTES EMITIDOS
            </span>
            <div className="w-10 h-10 rounded-full bg-[#6884C5]/10 flex items-center justify-center text-[#6884C5]">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 01-2-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
          </div>
          <div className="my-1 flex items-baseline gap-3">
            <span className="text-4xl font-black text-white font-satoshi-black">
              {totalEmitidasMes}
            </span>
            <span className="text-sm font-satoshi-regular text-slate-200">
              {totalEmitidasMes === 1 ? 'Factura Valida' : 'Facturas Validadas'}
            </span>
          </div>
          <p className="text-xs text-[#A0AEC0] font-satoshi-regular truncate">
            Emitidas en {mesesDelAnio[mesFiltro].nombre} {anioFiltro}
          </p>
        </div>

        {/* NOTAS DE CRÉDITO */}
        <div className={`bg-[#253443] border rounded-2xl p-5 shadow-xl flex flex-col justify-between relative overflow-hidden h-36 transition-colors ${
          totalAnuladasMes > 0 ? 'border-red-500/50' : 'border-slate-700/50'
        }`}>
          <div className="flex justify-between items-start">
            <span className={`text-[11px] font-satoshi-black uppercase tracking-wider ${
              totalAnuladasMes > 0 ? 'text-red-400' : 'text-[#A0AEC0]'
            }`}>
              NOTAS DE CRÉDITO / ANULADAS
            </span>
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
              totalAnuladasMes > 0 ? 'bg-red-500/10 text-red-400' : 'bg-[#1D2935] text-slate-500'
            }`}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
          </div>
          <div className="my-1 flex items-baseline gap-3">
            <span className={`text-4xl font-black font-satoshi-black ${
              totalAnuladasMes > 0 ? 'text-red-400' : 'text-slate-300'
            }`}>
              {totalAnuladasMes}
            </span>
            <span className="text-sm font-satoshi-regular text-[#A0AEC0]">
              {totalAnuladasMes === 1 ? 'Anulación' : 'Anulaciones'}
            </span>
          </div>
          <p className="text-xs text-[#A0AEC0] font-satoshi-regular truncate">
            Ajustes de {mesesDelAnio[mesFiltro].nombre} {anioFiltro}
          </p>
        </div>

      </div>

      {/* BARRA DE BÚSQUEDA Y FILTROS POR ESTADO */}
      <div className="bg-[#253443] border border-slate-700/50 rounded-2xl p-4 mb-8 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-80">
          <svg className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input 
            type="text" 
            className="w-full bg-[#1D2935] border border-slate-700 focus:border-[#0DE8C0] rounded-xl pl-10 pr-3 py-2.5 text-xs text-white placeholder-[#A0AEC0] focus:outline-none font-satoshi-regular transition"
            placeholder="Buscar por Factura, Cliente o NIT..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
          <button
            type="button"
            onClick={() => setFiltroEstado('TODAS')}
            className={`px-3.5 py-2 rounded-xl text-xs font-satoshi-black transition ${
              filtroEstado === 'TODAS'
                ? 'bg-[#0DE8C0] text-[#1D2935]'
                : 'bg-[#1D2935] text-[#A0AEC0] hover:text-white border border-slate-700/60'
            }`}
          >
            Todas ({facturasPorMesYAnio.length})
          </button>

          <button
            type="button"
            onClick={() => setFiltroEstado('EMITIDA')}
            className={`px-3.5 py-2 rounded-xl text-xs font-satoshi-black transition ${
              filtroEstado === 'EMITIDA'
                ? 'bg-[#6884C5] text-white'
                : 'bg-[#1D2935] text-[#A0AEC0] hover:text-white border border-slate-700/60'
            }`}
          >
            Emitidas ({totalEmitidasMes})
          </button>

          <button
            type="button"
            onClick={() => setFiltroEstado('ANULADA')}
            className={`px-3.5 py-2 rounded-xl text-xs font-satoshi-black transition ${
              filtroEstado === 'ANULADA'
                ? 'bg-red-500 text-white'
                : 'bg-[#1D2935] text-[#A0AEC0] hover:text-white border border-slate-700/60'
            }`}
          >
            Anuladas ({totalAnuladasMes})
          </button>
        </div>
      </div>

      {/* TABLA DE FACTURAS */}
      <div className="bg-[#253443] border border-slate-700/50 rounded-2xl shadow-xl overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[#1D2935] text-[11px] font-satoshi-black text-[#A0AEC0] uppercase tracking-wider border-b border-slate-700">
              <th className="p-4">N° Comprobante</th>
              <th className="p-4">Fecha Emisión</th>
              <th className="p-4">Cliente / Razón Social</th>
              <th className="p-4">NIT / RUT</th>
              <th className="p-4">Vendedor</th>
              <th className="p-4 text-right">Monto Total</th>
              <th className="p-4 text-center">Estado Fiscal</th>
              <th className="p-4 text-center">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/60 text-xs font-satoshi-regular">
            {facturasFiltradas.map((f, idx) => {
              const fechaFormatted = f.fecha_cobro || f.fecha 
                ? new Date(f.fecha_cobro || f.fecha).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })
                : 'N/A';

              const isAnulada = f.estado === 'ANULADA';

              return (
                <tr key={f.id_doc || idx} className="hover:bg-[#1D2935]/80 transition-colors">
                  <td className="p-4 font-mono font-bold text-white">
                    {f.id_factura || 'FACT_SIN_ID'}
                  </td>

                  <td className="p-4 text-slate-300">
                    {fechaFormatted}
                  </td>

                  <td className="p-4 text-slate-200 font-satoshi-black uppercase">
                    {f.cliente_nombre || 'Consumidor Final'}
                  </td>

                  <td className="p-4 font-mono text-[#A0AEC0]">
                    {f.cliente_nit || 'CF_GENERAL'}
                  </td>

                  <td className="p-4 text-[#0DE8C0] font-satoshi-black">
                    {f.vendedor_nombre || 'Cajero POS'}
                  </td>

                  <td className="p-4 text-right font-satoshi-black text-[#0DE8C0] text-sm">
                    {formatoCOP(f.total || f.subtotal || 0)}
                  </td>

                  <td className="p-4 text-center">
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-satoshi-black ${
                      isAnulada 
                        ? 'bg-red-950/80 text-red-400 border border-red-800/40' 
                        : 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/40'
                    }`}>
                      {isAnulada ? 'ANULADA' : 'EMITIDA DIAN'}
                    </span>
                  </td>

                  <td className="p-4 text-center">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedFactura(f);
                        setShowModalDetail(true);
                      }}
                      className="bg-[#1D2935] hover:bg-[#15202b] text-[#0DE8C0] border border-[#0DE8C0]/40 font-satoshi-black px-3 py-1.5 rounded-lg text-xs transition"
                    >
                      Ver Comprobante
                    </button>
                  </td>
                </tr>
              );
            })}

            {facturasFiltradas.length === 0 && (
              <tr>
                <td colSpan={8} className="p-12 text-center text-[#A0AEC0] text-xs font-satoshi-regular">
                  {esVendedor 
                    ? `No se encontraron comprobantes fiscales emitidos a nombre de ${userAuth?.nombre} en ${mesesDelAnio[mesFiltro].nombre} de ${anioFiltro}.`
                    : `No se encontraron comprobantes fiscales en ${mesesDelAnio[mesFiltro].nombre} de ${anioFiltro}.`}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* MODAL DETALLE / COMPROBANTE FISCAL */}
      {showModalDetail && selectedFactura && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white text-slate-900 rounded-2xl w-full max-w-sm p-6 shadow-2xl font-mono text-xs relative space-y-4">
            
            <button
              onClick={() => setShowModalDetail(false)}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-800 transition font-sans text-sm"
            >
              ✕
            </button>

            <div className="text-center border-b border-dashed border-slate-300 pb-3 space-y-1">
              <h2 className="font-bold text-base tracking-widest text-slate-900 uppercase">FACTURA ELECTRÓNICA</h2>
              <p className="text-[10px] text-slate-600">{selectedFactura.nombre_bodega || 'Sede Principal'}</p>
              <p className="text-[10px] text-slate-500">N° {selectedFactura.id_factura}</p>
              <p className="text-[10px] text-slate-500">
                {new Date(selectedFactura.fecha_cobro || selectedFactura.fecha).toLocaleString()}
              </p>
            </div>

            <div className="border-b border-dashed border-slate-300 pb-2 text-[10px] space-y-0.5">
              <p>CLIENTE: <span className="font-bold">{selectedFactura.cliente_nombre}</span></p>
              <p>NIT/RUT: {selectedFactura.cliente_nit || 'CF_GENERAL'}</p>
              <p>CAJERO: {selectedFactura.vendedor_nombre}</p>
              <p>MÉTODO: {selectedFactura.metodo_pago || 'EFECTIVO'}</p>
            </div>

            <div className="border-b border-dashed border-slate-300 pb-3 space-y-1.5">
              {Array.isArray(selectedFactura.items) && selectedFactura.items.map((it: any, i: number) => (
                <div key={i} className="flex justify-between items-start text-[11px]">
                  <div className="truncate pr-2">
                    <div className="font-bold truncate">{it.nombre}</div>
                    <div className="text-[9px] text-slate-500">{it.cantidad} x {formatoCOP(it.precio)}</div>
                  </div>
                  <span className="font-bold">{formatoCOP(it.cantidad * it.precio)}</span>
                </div>
              ))}
            </div>

            <div className="space-y-1 pt-1 text-right">
              <div className="flex justify-between text-sm font-black pt-1 border-t border-slate-900">
                <span>TOTAL FACTURADO:</span>
                <span>{formatoCOP(selectedFactura.total)}</span>
              </div>
            </div>

            <div className="text-center text-[9px] text-slate-400 pt-2 border-t border-dashed border-slate-300">
              Comprobante fiscal procesado por ATOM STOCK Omnicanal.
            </div>

            <div className="flex gap-2 pt-2 font-sans">
              <button
                type="button"
                onClick={() => window.print()}
                className="w-full bg-[#0DE8C0] hover:bg-[#0bcfa8] text-[#1D2935] font-satoshi-black py-3 rounded-xl text-xs uppercase tracking-wider shadow-md flex items-center justify-center gap-2 transition"
              >
                <svg className="w-4 h-4 text-[#1D2935]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                <span>Imprimir Comprobante PDF</span>
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}