'use client';

import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export default function FacturasPage() {
  const [userAuth, setUserAuth] = useState<any>(null);
  const [facturas, setFacturas] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<'TODAS' | 'EMITIDA' | 'PENDIENTE' | 'ANULADA'>('TODAS');

  // FILTRO DINÁMICO DE FECHA
  const fechaHoy = new Date();
  const [mesFiltro, setMesFiltro] = useState<number>(fechaHoy.getMonth());
  const [anioFiltro, setAnioFiltro] = useState<number>(fechaHoy.getFullYear());

  // Modales
  const [showModalDetail, setShowModalDetail] = useState(false);
  const [selectedFactura, setSelectedFactura] = useState<any>(null);

  // Modal Carga Masiva E-Commerce (Dropi, Véndelo, Master)
  const [showModalEcommerce, setShowModalEcommerce] = useState(false);
  const [archivoCSV, setArchivoCSV] = useState<File | null>(null);
  const [canalPlataforma, setCanalPlataforma] = useState('DROPI');
  const [loadingEcom, setLoadingEcom] = useState(false);

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

  // ESCUCHAR FIRESTORE
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

  const esVendedor = userAuth?.rol === 'VENDEDOR';

  // FILTRADO DE FACTURAS POR MES Y AÑO
  const facturasPorMesYAnio = facturas.filter(f => {
    const fechaStr = f.fecha_cobro || f.fecha;
    if (!fechaStr) return false;
    const fechaObj = new Date(fechaStr);
    return fechaObj.getMonth() === mesFiltro && fechaObj.getFullYear() === anioFiltro;
  });

  const facturasFiltradas = facturasPorMesYAnio.filter(f => {
    const q = searchQuery.toLowerCase().trim();
    const matchSearch = String(f.id_factura || '').toLowerCase().includes(q) ||
                        String(f.cliente_nombre || '').toLowerCase().includes(q) ||
                        String(f.cliente_nit || '').toLowerCase().includes(q) ||
                        String(f.nombre_bodega || '').toLowerCase().includes(q) ||
                        String(f.orden_referencia || '').toLowerCase().includes(q);
    
    if (!matchSearch) return false;
    if (filtroEstado === 'EMITIDA') return (f.estado || 'PAGADA') === 'PAGADA' || f.estado === 'EMITIDA';
    if (filtroEstado === 'PENDIENTE') return f.estado === 'PENDIENTE';
    if (filtroEstado === 'ANULADA') return f.estado === 'ANULADA';

    return true;
  });

  // MÉTRICAS
  const totalFacturadoMes = facturasPorMesYAnio
    .filter(f => (f.estado || 'PAGADA') !== 'ANULADA')
    .reduce((acc, f) => acc + (Number(f.total) || 0), 0);

  const totalEmitidasMes = facturasPorMesYAnio.filter(f => (f.estado || 'PAGADA') !== 'ANULADA').length;
  const totalAnuladasMes = facturasPorMesYAnio.filter(f => f.estado === 'ANULADA').length;

  // DESCARGAR PLANTILLA CSV DE EJEMPLO
  const handleDescargarPlantilla = () => {
    const bom = '\uFEFF';
    let csv = 'ORDEN_ID;CANAL;CLIENTE_NOMBRE;CLIENTE_NIT;CLIENTE_CORREO;PRODUCTO;CANTIDAD;SUBTOTAL;IVA_PORCENTAJE;METODO_PAGO\n';
    csv += 'DROP-1001;DROPI;Pedro;1098765432;pedro@correo.com;Teclado Mecanico RGB;1;85000;19;CONTRAENTREGA\n';
    csv += 'VEN-5502;VENDELO;Maria Gomez;52987654;maria@correo.com;Mouse Inalambrico;2;120000;19;PASARELA_PAYU\n';
    csv += 'MST-8821;MASTER;Carlos Ruiz;1018234567;carlos@correo.com;Audifonos Pro;1;45000;0;EFECTIVO\n';

    const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'Plantilla_Facturacion_Masiva_Ecommerce.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // PROCESAR Y CARGAR ARCHIVO CSV MASIVO
  const handleProcesarCargaMasiva = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!archivoCSV) return alert('Selecciona un archivo CSV para procesar.');

    setLoadingEcom(true);
    const reader = new FileReader();

    reader.onload = async (evt) => {
      try {
        const texto = evt.target?.result as string;
        const lineas = texto.split('\n').map(l => l.trim()).filter(l => l.length > 0);

        if (lineas.length <= 1) {
          alert('El archivo CSV está vacío o no contiene filas de datos.');
          setLoadingEcom(false);
          return;
        }

        let importadosCount = 0;

        for (let i = 1; i < lineas.length; i++) {
          const columnas = lineas[i].split(';');
          if (columnas.length >= 8) {
            const ordenId = columnas[0] || `ORD-${Date.now().toString().slice(-4)}`;
            const canal = columnas[1] || canalPlataforma;
            const cliente = columnas[2] || 'Pedro';
            const nit = columnas[3] || '222222222222';
            const correo = columnas[4] || 'factura@ecom.com';
            const productoNombre = columnas[5] || 'Producto E-Commerce';
            const cantidadNum = Number(columnas[6]) || 1;
            const subtotal = Number(columnas[7]) || 0;
            const ivaPct = Number(columnas[8]) || 19;
            const metodo = columnas[9] || 'CONTRAENTREGA';

            const ivaMonto = (subtotal * ivaPct) / 100;
            const total = subtotal + ivaMonto;
            
            const idFacturaGen = `FE-${canal.toUpperCase().slice(0,3)}-${Math.floor(100000 + Math.random() * 900000)}`;

            const nuevaFactura = {
              id_cuenta: userAuth?.id_cuenta || 'DEMO_123',
              id_factura: idFacturaGen,
              cliente_nombre: cliente,
              cliente_nit: nit,
              cliente_correo: correo,
              vendedor_nombre: `E-Commerce (${canal})`,
              vendedor_id: 'BOT_INTEGRACION',
              nombre_bodega: `Despacho ${canal}`,
              subtotal,
              iva_monto: ivaMonto,
              total,
              metodo_pago: metodo,
              orden_referencia: ordenId,
              estado: 'EMITIDA',
              origen: 'CARGA_MASIVA_ECOMMERCE',
              fecha_cobro: new Date().toISOString(),
              fecha: serverTimestamp(),
              items: [
                {
                  nombre: productoNombre,
                  cantidad: cantidadNum,
                  precio: cantidadNum > 0 ? subtotal / cantidadNum : subtotal
                }
              ]
            };

            await addDoc(collection(db, 'ventas'), nuevaFactura);
            importadosCount++;
          }
        }

        alert(`¡Éxito! Se crearon ${importadosCount} números de factura y se asociaron sus órdenes.`);
        setShowModalEcommerce(false);
        setArchivoCSV(null);
      } catch (err: any) {
        alert('Error al procesar el archivo CSV: ' + err.message);
      } finally {
        setLoadingEcom(false);
      }
    };

    reader.readAsText(archivoCSV);
  };

  // EXPORTAR CONSOLIDADO MASIVO COMPATIBLE CON SISTEMAS CONTABLES
  const handleExportarReporteFiscal = () => {
    if (facturasFiltradas.length === 0) {
      return alert('No hay comprobantes registrados para exportar.');
    }

    const bom = '\uFEFF';
    let csvContent = 'SEP=;\n';
    csvContent += 'NUM_COMPROBANTE;ORDEN_REF;FECHA_EMISION;CLIENTE_NOMBRE;NIT_RUT;CORREO_CLIENTE;PRODUCTO;CANTIDAD;METODO_PAGO;CANAL_ORIGEN;SUBTOTAL;IVA_MONTO;TOTAL_CON_IMPUESTO;ESTADO_FISCAL\n';

    facturasFiltradas.forEach(f => {
      const fNum = f.id_factura || 'N/A';
      const fOrden = f.orden_referencia || 'N/A';
      const fFecha = f.fecha_cobro || f.fecha ? new Date(f.fecha_cobro || f.fecha).toISOString() : 'N/A';
      const fCliente = (f.cliente_nombre || 'Pedro').replace(/;/g, ' ');
      const fNit = f.cliente_nit || 'CF_GENERAL';
      const fMail = f.cliente_correo || 'N/A';
      
      const primerItem = Array.isArray(f.items) && f.items.length > 0 ? f.items[0] : null;
      const fProd = (primerItem?.nombre || 'Producto E-Commerce').replace(/;/g, ' ');
      const fCant = primerItem?.cantidad || 1;

      const fMetodo = f.metodo_pago || 'CONTRAENTREGA';
      const fCanal = (f.vendedor_nombre || 'E-Commerce Bot').replace(/;/g, ' ');
      const fSub = f.subtotal || f.total || 0;
      const fIva = f.iva_monto || 0;
      const fTot = f.total || 0;
      const fEst = f.estado || 'EMITIDA';

      csvContent += `${fNum};${fOrden};${fFecha};${fCliente};${fNit};${fMail};${fProd};${fCant};${fMetodo};${fCanal};${fSub};${fIva};${fTot};${fEst}\n`;
    });

    const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const nombreMes = mesesDelAnio[mesFiltro].nombre;
    link.setAttribute('download', `Consolidado_Contable_Facturas_${nombreMes}_${anioFiltro}.csv`);
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
              {esVendedor ? `Comprobantes Emitidos por ${userAuth?.nombre}` : 'Control Fiscal & Integración E-Commerce'}
            </span>
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight font-satoshi-black">
            Facturación
          </h1>
          <p className="text-xs text-[#A0AEC0] mt-1 font-satoshi-regular max-w-xl">
            Carga masiva con generación automática de facturas y exportación contable completa.
          </p>
        </div>

        <div className="flex flex-wrap gap-3 shrink-0">
          {!esVendedor && (
            <button
              type="button"
              onClick={() => setShowModalEcommerce(true)}
              className="bg-[#1D2935] border border-[#0DE8C0] text-[#0DE8C0] hover:bg-[#0DE8C0]/10 font-satoshi-black px-5 py-3.5 rounded-xl text-xs uppercase tracking-wider transition-all shadow-lg flex items-center gap-2"
            >
              <svg className="w-4 h-4 text-[#0DE8C0]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              <span>Subir Archivo Masivo E-Commerce</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleExportarReporteFiscal}
            className="bg-[#0DE8C0] hover:bg-[#0bcfa8] text-[#1D2935] font-satoshi-black px-5 py-3.5 rounded-xl text-xs uppercase tracking-wider transition-all shadow-lg flex items-center gap-2"
          >
            <svg className="w-4 h-4 text-[#1D2935]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span>Exportar Consolidado Contable (CSV)</span>
          </button>
        </div>
      </div>

      {/* SELECTOR DE PERIODO */}
      <div className="bg-[#253443] border border-[#0DE8C0]/40 rounded-2xl p-4 mb-6 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-lg">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#0DE8C0]/10 flex items-center justify-center text-[#0DE8C0] shrink-0">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <span className="text-xs font-satoshi-black text-white uppercase tracking-wider block">
              PERIODO FISCAL ACTIVO
            </span>
            <span className="text-[11px] text-[#A0AEC0]">
              Filtra las facturas importadas por mes y año.
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
          <select
            className="bg-[#1D2935] border border-slate-700 text-xs text-[#0DE8C0] font-satoshi-black rounded-xl px-3 py-2.5 focus:outline-none"
            value={mesFiltro}
            onChange={(e) => setMesFiltro(Number(e.target.value))}
          >
            {mesesDelAnio.map(m => (
              <option key={m.id} value={m.id} className="bg-[#1D2935] text-white">{m.nombre}</option>
            ))}
          </select>

          <select
            className="bg-[#1D2935] border border-slate-700 text-xs text-white font-satoshi-black rounded-xl px-3 py-2.5 focus:outline-none"
            value={anioFiltro}
            onChange={(e) => setAnioFiltro(Number(e.target.value))}
          >
            {listaAnios.map(a => (
              <option key={a} value={a} className="bg-[#1D2935] text-white">{a}</option>
            ))}
          </select>
        </div>
      </div>

      {/* TARJETAS MÉTRICAS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-[#253443] border border-slate-700/50 rounded-2xl p-5 shadow-xl flex flex-col justify-between h-36">
          <span className="text-[11px] font-satoshi-black text-[#0DE8C0] uppercase">TOTAL FACTURADO ({mesesDelAnio[mesFiltro].nombre.toUpperCase()})</span>
          <span className="text-3xl font-black text-white font-satoshi-black">{formatoCOP(totalFacturadoMes)}</span>
          <p className="text-xs text-[#A0AEC0]">Acumulado fiscal importado</p>
        </div>

        <div className="bg-[#253443] border border-slate-700/50 rounded-2xl p-5 shadow-xl flex flex-col justify-between h-36">
          <span className="text-[11px] font-satoshi-black text-[#6884C5] uppercase">COMPROBANTES EMITIDOS</span>
          <span className="text-4xl font-black text-white font-satoshi-black">{totalEmitidasMes}</span>
          <p className="text-xs text-[#A0AEC0]">Órdenes validadas</p>
        </div>

        <div className="bg-[#253443] border border-slate-700/50 rounded-2xl p-5 shadow-xl flex flex-col justify-between h-36">
          <span className="text-[11px] font-satoshi-black text-slate-400 uppercase">NOTAS DE CRÉDITO / ANULADAS</span>
          <span className="text-4xl font-black text-slate-300 font-satoshi-black">{totalAnuladasMes}</span>
          <p className="text-xs text-[#A0AEC0]">Cancelaciones de envío</p>
        </div>
      </div>

      {/* BÚSQUEDA Y FILTROS */}
      <div className="bg-[#253443] border border-slate-700/50 rounded-2xl p-4 mb-6 flex justify-between items-center">
        <div className="relative w-full md:w-80">
          <svg className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input 
            type="text" 
            className="bg-[#1D2935] border border-slate-700 focus:border-[#0DE8C0] rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-[#A0AEC0] w-full"
            placeholder="Buscar Orden, Cliente, NIT o Producto..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        
        <div className="flex gap-2">
          <button onClick={() => setFiltroEstado('TODAS')} className={`px-3 py-1.5 rounded-xl text-xs font-satoshi-black ${filtroEstado === 'TODAS' ? 'bg-[#0DE8C0] text-[#1D2935]' : 'bg-[#1D2935] text-slate-400'}`}>Todas</button>
          <button onClick={() => setFiltroEstado('EMITIDA')} className={`px-3 py-1.5 rounded-xl text-xs font-satoshi-black ${filtroEstado === 'EMITIDA' ? 'bg-[#6884C5] text-white' : 'bg-[#1D2935] text-slate-400'}`}>Emitidas</button>
        </div>
      </div>

      {/* TABLA PRINCIPAL DE FACTURAS */}
      <div className="bg-[#253443] border border-slate-700/50 rounded-2xl shadow-xl overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-[#1D2935] text-[11px] font-satoshi-black text-[#A0AEC0] uppercase border-b border-slate-700">
              <th className="p-4">N° Factura</th>
              <th className="p-4">Orden Ref.</th>
              <th className="p-4">Plataforma</th>
              <th className="p-4">Cliente / NIT / Correo</th>
              <th className="p-4">Producto & Cant.</th>
              <th className="p-4 text-right">Monto Total</th>
              <th className="p-4 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/60 font-satoshi-regular">
            {facturasFiltradas.map((f, idx) => {
              const item = Array.isArray(f.items) && f.items.length > 0 ? f.items[0] : null;

              return (
                <tr key={f.id_doc || idx} className="hover:bg-[#1D2935]/80 transition">
                  <td className="p-4 font-mono font-bold text-white">{f.id_factura}</td>
                  <td className="p-4 font-mono text-[#0DE8C0]">{f.orden_referencia || 'N/A'}</td>
                  <td className="p-4 font-satoshi-black text-slate-200">{f.vendedor_nombre}</td>
                  <td className="p-4">
                    <div className="font-satoshi-black text-white">{f.cliente_nombre || 'Pedro'}</div>
                    <div className="text-[10px] text-slate-400">NIT: {f.cliente_nit || 'N/A'}</div>
                    <div className="text-[10px] text-[#A0AEC0]">{f.cliente_correo || 'N/A'}</div>
                  </td>
                  <td className="p-4">
                    <div className="font-satoshi-black text-slate-200 truncate max-w-xs">{item?.nombre || 'Producto E-Commerce'}</div>
                    <div className="text-[10px] text-[#0DE8C0] font-mono">Cant: {item?.cantidad || 1} u</div>
                  </td>
                  <td className="p-4 text-right font-satoshi-black text-[#0DE8C0]">{formatoCOP(f.total)}</td>
                  <td className="p-4 text-center">
                    <button
                      onClick={() => { setSelectedFactura(f); setShowModalDetail(true); }}
                      className="bg-[#1D2935] text-[#0DE8C0] border border-[#0DE8C0]/40 font-satoshi-black px-3 py-1.5 rounded-lg hover:bg-[#0DE8C0]/10 transition"
                    >
                      Ver Comprobante
                    </button>
                  </td>
                </tr>
              );
            })}
            {facturasFiltradas.length === 0 && (
              <tr>
                <td colSpan={7} className="p-8 text-center text-slate-400">No hay facturas registradas en este periodo. Usa el botón "Subir Archivo Masivo" para cargar tus pedidos.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* MODAL CARGA MASIVA (DROPI / VÉNDELO / MASTER) CON ÍCONO 2D EN LUGAR DE EMOJI */}
      {showModalEcommerce && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#253443] border border-slate-700 p-6 rounded-2xl max-w-md w-full space-y-4 shadow-2xl text-xs text-white">
            <div className="flex justify-between items-center border-b border-slate-700 pb-3">
              <h2 className="text-sm font-satoshi-black uppercase flex items-center gap-2">
                <svg className="w-4 h-4 text-[#0DE8C0]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
                <span>Importación Masiva (Dropi / Véndelo / Master)</span>
              </h2>
              <button onClick={() => setShowModalEcommerce(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleProcesarCargaMasiva} className="space-y-4">
              <div>
                <label className="block text-slate-300 font-satoshi-black mb-1">Plataforma / Canal Predefinido</label>
                <select
                  className="w-full bg-[#1D2935] border border-slate-700 rounded-xl p-2.5 text-white focus:outline-none"
                  value={canalPlataforma}
                  onChange={(e) => setCanalPlataforma(e.target.value)}
                >
                  <option value="DROPI">Dropi Colombia</option>
                  <option value="VENDELO">Véndelo App</option>
                  <option value="MASTER">Master E-Commerce</option>
                  <option value="SHOPIFY">Shopify Store</option>
                </select>
              </div>

              <div className="p-3 bg-[#1D2935] rounded-xl border border-slate-700/60 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-satoshi-black text-slate-300">¿No tienes la plantilla?</span>
                  <button
                    type="button"
                    onClick={handleDescargarPlantilla}
                    className="text-[#0DE8C0] font-satoshi-black hover:underline"
                  >
                    Descargar CSV de Ejemplo
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  Descarga nuestro formato base con columnas para Cliente, NIT/RUT, Correo, Producto, Cantidad y Método de Pago.
                </p>
              </div>

              <div>
                <label className="block text-slate-300 font-satoshi-black mb-1">Seleccionar Archivo CSV *</label>
                <input
                  type="file"
                  accept=".csv"
                  required
                  onChange={(e) => setArchivoCSV(e.target.files ? e.target.files[0] : null)}
                  className="w-full bg-[#1D2935] border border-slate-700 rounded-xl p-2 text-slate-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-[#0DE8C0] file:text-[#1D2935] file:font-satoshi-black file:text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-700">
                <button
                  type="button"
                  onClick={() => setShowModalEcommerce(false)}
                  className="px-4 py-2.5 bg-slate-700 hover:bg-slate-600 rounded-xl font-satoshi-black"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loadingEcom}
                  className="px-4 py-2.5 bg-[#0DE8C0] hover:bg-[#0bcfa8] text-[#1D2935] font-satoshi-black rounded-xl shadow-lg"
                >
                  {loadingEcom ? 'Procesando Carga...' : 'Procesar e Importar'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* MODAL DETALLE / COMPROBANTE FISCAL */}
      {showModalDetail && selectedFactura && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white text-slate-900 rounded-2xl w-full max-w-sm p-6 shadow-2xl font-mono text-xs relative space-y-4">
            <button onClick={() => setShowModalDetail(false)} className="absolute right-4 top-4 text-slate-400 hover:text-slate-800">✕</button>

            <div className="text-center border-b border-dashed border-slate-300 pb-3 space-y-1">
              <h2 className="font-bold text-base uppercase">FACTURA / COMPROBANTE</h2>
              <p className="text-[10px] text-slate-600">{selectedFactura.vendedor_nombre}</p>
              <p className="text-[10px] text-slate-500">N° {selectedFactura.id_factura}</p>
              <p className="text-[10px] text-slate-500">Ref Orden: {selectedFactura.orden_referencia || 'N/A'}</p>
            </div>

            <div className="border-b border-dashed border-slate-300 pb-2 text-[10px] space-y-0.5">
              <p>CLIENTE: <span className="font-bold">{selectedFactura.cliente_nombre || 'Pedro'}</span></p>
              <p>NIT/RUT: {selectedFactura.cliente_nit || 'N/A'}</p>
              <p>CORREO: {selectedFactura.cliente_correo || 'N/A'}</p>
              <p>MÉTODO: {selectedFactura.metodo_pago || 'CONTRAENTREGA'}</p>
            </div>

            <div className="border-b border-dashed border-slate-300 pb-3">
              {Array.isArray(selectedFactura.items) && selectedFactura.items.map((it: any, i: number) => (
                <div key={i} className="flex justify-between items-start text-[11px] mb-1">
                  <div>
                    <div className="font-bold">{it.nombre}</div>
                    <div className="text-[9px] text-slate-500">Cant: {it.cantidad} x {formatoCOP(it.precio)}</div>
                  </div>
                  <span className="font-bold">{formatoCOP(it.cantidad * it.precio)}</span>
                </div>
              ))}
            </div>

            <div className="space-y-1 pt-1 text-right">
              <div className="flex justify-between text-sm font-black pt-1 border-t border-slate-900">
                <span>TOTAL:</span>
                <span>{formatoCOP(selectedFactura.total)}</span>
              </div>
            </div>

            <button
              onClick={() => window.print()}
              className="w-full bg-[#0DE8C0] text-[#1D2935] font-satoshi-black py-3 rounded-xl uppercase shadow flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4 text-[#1D2935]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              <span>Imprimir Comprobante PDF</span>
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
