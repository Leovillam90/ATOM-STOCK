'use client';

import React, { useState, useEffect, useRef } from 'react';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, doc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export default function FacturasPage() {
  const [userAuth, setUserAuth] = useState<any>(null);
  const [facturas, setFacturas] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<'TODAS' | 'EMITIDA' | 'PENDIENTE' | 'ANULADA'>('TODAS');

  // CONTROL DE ORDENAMIENTO Y PAGINACIÓN (50 REGISTROS POR PÁGINA)
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

  // Modal Carga Masiva E-Commerce (Dropi, Véndelo, Master)
  const [showModalEcommerce, setShowModalEcommerce] = useState(false);
  const [archivoCSV, setArchivoCSV] = useState<File | null>(null);
  const [canalPlataforma, setCanalPlataforma] = useState('DROPI');
  const [loadingEcom, setLoadingEcom] = useState(false);
  const fileInputEcomRef = useRef<HTMLInputElement>(null);

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

  // RESETEAR A PÁGINA 1 CUANDO CAMBIAN LOS FILTROS
  useEffect(() => {
    setPaginaActual(1);
  }, [searchQuery, filtroEstado, mesFiltro, anioFiltro, ordenFecha]);

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

    const estadoFactura = String(f.estado || 'EMITIDA').toUpperCase();

    if (filtroEstado === 'EMITIDA') return estadoFactura === 'EMITIDA' || estadoFactura === 'PAGADA';
    if (filtroEstado === 'PENDIENTE') return estadoFactura === 'PENDIENTE';
    if (filtroEstado === 'ANULADA') return estadoFactura === 'ANULADA';

    return true;
  });

  // ORDENAMIENTO POR FECHA
  const facturasOrdenadas = [...facturasFiltradas].sort((a, b) => {
    const fechaA = new Date(a.fecha_cobro || a.fecha || 0).getTime();
    const fechaB = new Date(b.fecha_cobro || b.fecha || 0).getTime();

    if (ordenFecha === 'NUEVAS_PRIMERO') {
      return fechaB - fechaA;
    } else {
      return fechaA - fechaB;
    }
  });

  // LÓGICA DE PAGINACIÓN (50 POR PÁGINA)
  const totalFacturasCount = facturasOrdenadas.length;
  const totalPaginas = Math.ceil(totalFacturasCount / ventasPorPagina) || 1;
  const indiceInicial = (paginaActual - 1) * ventasPorPagina;
  const facturasPaginadas = facturasOrdenadas.slice(indiceInicial, indiceInicial + ventasPorPagina);

  // MÉTRICAS CALCULADAS EN TIEMPO REAL CON RECONOCIMIENTO DE ANULADAS
  const totalFacturadoMes = facturasPorMesYAnio
    .filter(f => String(f.estado || '').toUpperCase() !== 'ANULADA')
    .reduce((acc, f) => acc + (Number(f.total) || 0), 0);

  const totalEmitidasMes = facturasPorMesYAnio.filter(f => String(f.estado || '').toUpperCase() !== 'ANULADA').length;
  const totalAnuladasMes = facturasPorMesYAnio.filter(f => String(f.estado || '').toUpperCase() === 'ANULADA').length;

  // DESCARGAR PLANTILLA COMPLETA DE FACTURACIÓN ELECTRÓNICA DIAN
  const handleDescargarPlantilla = () => {
    const bom = '\uFEFF';
    let csv = 'ORDEN_ID;CANAL;TIPO_DOCUMENTO;CLIENTE_NIT;CLIENTE_NOMBRE;CLIENTE_CORREO;CLIENTE_TELEFONO;CLIENTE_DIRECCION;CLIENTE_CIUDAD;RESPONSABILIDAD_FISCAL;PRODUCTO;CANTIDAD;PRECIO_UNITARIO;IVA_PORCENTAJE;METODO_PAGO\n';
    csv += 'DROP-1001;DROPI;13;1098765432;Pedro Gomez;pedro@correo.com;3101234567;Calle 10 # 15-20;Cali - Valle;R-99-PN;Teclado Mecanico RGB;1;85000;19;CONTRAENTREGA\n';
    csv += 'VEN-5502;VENDELO;31;901234567;Tienda Ejemplo SAS;compras@ejemplo.com;3209876543;Av 6 Norte # 24-00;Medellin - Antioquia;O-48;Mouse Inalambrico;2;60000;19;PASARELA_PAYU\n';
    csv += 'MST-8821;MASTER;13;1018234567;Carlos Ruiz;carlos@correo.com;3005554433;Carrera 5 # 12-30;Bogota D.C.;R-99-PN;Audifonos Pro;1;45000;0;EFECTIVO\n';

    const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'Plantilla_Facturacion_Electronica_DIAN_Masiva.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // PROCESAR Y CARGAR ARCHIVO CSV MASIVO E INDEXAR CLIENTES AUTOMÁTICAMENTE
  const handleProcesarCargaMasiva = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!archivoCSV) return alert('Selecciona un archivo CSV para procesar.');

    setLoadingEcom(true);
    const reader = new FileReader();

    reader.onload = async (evt: ProgressEvent<FileReader>) => {
      try {
        const texto = (evt.target?.result || '') as string;
        const lineas = texto.split('\n')
          .map(l => l.trim())
          .filter(l => l !== '' && !l.toLowerCase().startsWith('sep='));

        if (lineas.length <= 1) {
          alert('El archivo CSV está vacío o no contiene filas de datos.');
          setLoadingEcom(false);
          return;
        }

        const separador = lineas[0].includes(';') ? ';' : ',';
        const headers = lineas[0].split(separador).map(h => h.trim().toLowerCase().replace(/^"|"$/g, ''));

        // VALIDACIÓN ESTRICTA DE COLUMNAS CLAVE DE LA PLANTILLA DE FACTURAS
        const columnasRequeridas = ['orden_id', 'cliente_nit', 'cliente_nombre', 'producto', 'precio_unitario'];
        const columnasFaltantes = columnasRequeridas.filter(col => !headers.includes(col));

        if (columnasFaltantes.length > 0) {
          alert(`⛔ Formato Inválido:\n\nEl archivo cargado no coincide con la plantilla oficial de Facturación / E-Commerce.\nFaltan los encabezados obligatorios: [ ${columnasFaltantes.join(', ')} ]\n\nPor favor descarga la plantilla CSV oficial e inténtalo de nuevo.`);
          setLoadingEcom(false);
          return;
        }

        const idxOrdenId = headers.indexOf('orden_id');
        const idxCanal = headers.indexOf('canal');
        const idxTipoDoc = headers.indexOf('tipo_documento');
        const idxNit = headers.indexOf('cliente_nit');
        const idxCliente = headers.indexOf('cliente_nombre');
        const idxCorreo = headers.indexOf('cliente_correo');
        const idxTel = headers.indexOf('cliente_telefono');
        const idxDir = headers.indexOf('cliente_direccion');
        const idxCiu = headers.indexOf('cliente_ciudad');
        const idxResp = headers.indexOf('responsabilidad_fiscal');
        const idxProd = headers.indexOf('producto');
        const idxCant = headers.indexOf('cantidad');
        const idxPrecio = headers.indexOf('precio_unitario');
        const idxIva = headers.indexOf('iva_porcentaje');
        const idxMetodo = headers.indexOf('metodo_pago');

        let importadosCount = 0;

        for (let i = 1; i < lineas.length; i++) {
          const columnas = lineas[i].split(separador).map(c => c.trim().replace(/^"|"$/g, ''));
          if (columnas.length >= 5 && columnas[idxCliente] && columnas[idxCliente] !== '') {
            const ordenId = (idxOrdenId !== -1 && columnas[idxOrdenId]) ? columnas[idxOrdenId] : `ORD-${Date.now().toString().slice(-4)}`;
            const canal = (idxCanal !== -1 && columnas[idxCanal]) ? columnas[idxCanal] : canalPlataforma;
            const tipoDoc = (idxTipoDoc !== -1 && columnas[idxTipoDoc]) ? columnas[idxTipoDoc] : '13';
            const nit = (idxNit !== -1 && columnas[idxNit]) ? columnas[idxNit].trim() : '222222222222';
            const cliente = columnas[idxCliente] || 'Consumidor Final';
            const correo = (idxCorreo !== -1 && columnas[idxCorreo]) ? columnas[idxCorreo].toLowerCase().trim() : 'facturacion@ecom.com';
            const telefono = (idxTel !== -1 && columnas[idxTel]) ? columnas[idxTel].trim() : 'N/A';
            const direccion = (idxDir !== -1 && columnas[idxDir]) ? columnas[idxDir].trim() : 'Ciudad Principal';
            const ciudad = (idxCiu !== -1 && columnas[idxCiu]) ? columnas[idxCiu].trim() : 'Cali';
            const respFiscal = (idxResp !== -1 && columnas[idxResp]) ? columnas[idxResp] : 'R-99-PN';

            const productoNombre = (idxProd !== -1 && columnas[idxProd]) ? columnas[idxProd] : 'Producto E-Commerce';
            const cantidadNum = (idxCant !== -1 && columnas[idxCant]) ? (Number(columnas[idxCant]) || 1) : 1;
            const precioUnitario = (idxPrecio !== -1 && columnas[idxPrecio]) ? (Number(columnas[idxPrecio]) || 0) : 0;
            const ivaPct = (idxIva !== -1 && columnas[idxIva]) ? (Number(columnas[idxIva]) || 19) : 19;
            const metodo = (idxMetodo !== -1 && columnas[idxMetodo]) ? columnas[idxMetodo] : 'CONTRAENTREGA';

            const subtotal = cantidadNum * precioUnitario;
            const ivaMonto = (subtotal * ivaPct) / 100;
            const total = subtotal + ivaMonto;

            const idFacturaGen = `FE-${canal.toUpperCase().slice(0,3)}-${Math.floor(100000 + Math.random() * 900000)}`;

            // 1. REGISTRAR LA FACTURA EN LA COLECCIÓN DE VENTAS
            const nuevaFactura = {
              id_cuenta: userAuth?.id_cuenta || 'DEMO_123',
              id_factura: idFacturaGen,
              cliente_nombre: cliente,
              cliente_nit: nit,
              cliente_tipo_doc: tipoDoc,
              cliente_correo: correo,
              cliente_telefono: telefono,
              cliente_direccion: direccion,
              cliente_ciudad: ciudad,
              cliente_responsabilidad_fiscal: respFiscal,
              vendedor_nombre: `E-Commerce (${canal})`,
              vendedor_id: 'BOT_INTEGRACION',
              nombre_bodega: `Despacho ${canal}`,
              subtotal,
              iva_monto: ivaMonto,
              iva_porcentaje: ivaPct,
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
                  precio: precioUnitario,
                  tarifaIva: ivaPct
                }
              ]
            };

            await addDoc(collection(db, 'ventas'), nuevaFactura);

            // 2. REGISTRAR E INDEXAR AUTOMÁTICAMENTE EL CLIENTE EN LA COLECCIÓN DE CLIENTES
            const idClienteRef = nit !== '222222222222' && nit !== 'CF_GENERAL'
              ? `CLI_${nit}`
              : `CLI_${Date.now().toString().slice(-6)}_${i}`;

            const tipoCliFinal = (tipoDoc === '31' || nit.length === 9) ? 'JURIDICO' : 'NATURAL';

            const cliObj = {
              id_cuenta: userAuth?.id_cuenta || 'DEMO_123',
              id_cliente: idClienteRef,
              nombre: cliente,
              nit: nit,
              tipo_cliente: tipoCliFinal,
              telefono: telefono,
              email: correo,
              direccion: direccion,
              ciudad: ciudad,
              estado: 'ACTIVO',
              fecha_actualizacion: new Date().toISOString()
            };

            await setDoc(doc(db, 'clientes', idClienteRef), cliObj, { merge: true });

            importadosCount++;
          }
        }

        alert(`¡Éxito! Se crearon e indexaron ${importadosCount} facturas e-commerce y sus clientes asociados en el Directorio.`);
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

  // EXPORTAR CONSOLIDADO MASIVO COMPATIBLE CON SOFTWARE CONTABLE Y DIAN
  const handleExportarReporteFiscal = () => {
    if (facturasFiltradas.length === 0) {
      return alert('No hay comprobantes registrados para exportar.');
    }

    const bom = '\uFEFF';
    let csvContent = 'SEP=;\n';
    csvContent += 'NUM_COMPROBANTE;ORDEN_REF;FECHA_EMISION;TIPO_DOC;NIT_RUT;CLIENTE_NOMBRE;CORREO_CLIENTE;TELEFONO;DIRECCION;CIUDAD;RESPONSABILIDAD_FISCAL;PRODUCTO;CANTIDAD;PRECIO_UNITARIO;METODO_PAGO;CANAL_ORIGEN;SUBTOTAL;IVA_MONTO;TOTAL_CON_IMPUESTO;ESTADO_FISCAL\n';

    facturasFiltradas.forEach(f => {
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

      const primerItem = Array.isArray(f.items) && f.items.length > 0 ? f.items[0] : null;
      const fProd = (primerItem?.nombre || 'Producto E-Commerce').replace(/;/g, ' ');
      const fCant = primerItem?.cantidad || 1;
      const fPrecio = primerItem?.precio || f.total || 0;

      const fMetodo = f.metodo_pago || 'CONTRAENTREGA';
      const fCanal = (f.vendedor_nombre || 'E-Commerce Bot').replace(/;/g, ' ');
      const fSub = f.subtotal || f.total || 0;
      const fIva = f.iva_monto || 0;
      const fTot = f.total || 0;
      const fEst = f.estado || 'EMITIDA';

      csvContent += `${fNum};${fOrden};${fFecha};${fTipoDoc};${fNit};${fCliente};${fMail};${fTel};${fDir};${fCiu};${fResp};${fProd};${fCant};${fPrecio};${fMetodo};${fCanal};${fSub};${fIva};${fTot};${fEst}\n`;
    });

    const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const nombreMes = mesesDelAnio[mesFiltro].nombre;
    link.setAttribute('download', `Consolidado_Facturacion_Electronica_DIAN_${nombreMes}_${anioFiltro}.csv`);
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
              {esVendedor ? `Comprobantes Emitidos por ${userAuth?.nombre}` : 'Control Fiscal & Integración E-Commerce DIAN'}
            </span>
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight font-satoshi-black">
            Facturación
          </h1>
          <p className="text-xs text-[#A0AEC0] mt-1 font-satoshi-regular max-w-xl">
            Carga masiva completa con datos fiscales del cliente, IVA discriminado y exportación contable.
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
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setMesFiltro(Number(e.target.value))}
          >
            {mesesDelAnio.map(m => (
              <option key={m.id} value={m.id} className="bg-[#1D2935] text-white">{m.nombre}</option>
            ))}
          </select>

          <select
            className="bg-[#1D2935] border border-slate-700 text-xs text-white font-satoshi-black rounded-xl px-3 py-2.5 focus:outline-none"
            value={anioFiltro}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setAnioFiltro(Number(e.target.value))}
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

      {/* BÚSQUEDA Y FILTROS DE ESTADO / ORDEN DE FECHA */}
      <div className="bg-[#253443] border border-slate-700/50 rounded-2xl p-4 mb-6 flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="relative w-full md:w-80">
          <svg className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input 
            type="text" 
            className="bg-[#1D2935] border border-slate-700 focus:border-[#0DE8C0] rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-[#A0AEC0] w-full"
            placeholder="Buscar Orden, Cliente, NIT o Producto..."
            value={searchQuery}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-end">
          {/* SELECTOR DE ORDEN POR FECHA */}
          <div className="flex items-center gap-2 bg-[#1D2935] px-3 py-1.5 rounded-xl border border-slate-700">
            <span className="text-[10px] font-satoshi-black text-[#A0AEC0] uppercase">Orden:</span>
            <select
              className="bg-transparent text-xs text-[#0DE8C0] font-satoshi-black focus:outline-none cursor-pointer"
              value={ordenFecha}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setOrdenFecha(e.target.value as any)}
            >
              <option value="NUEVAS_PRIMERO" className="bg-[#1D2935] text-white">Más Nuevas Primero</option>
              <option value="ANTIGUAS_PRIMERO" className="bg-[#1D2935] text-white">Más Antiguas Primero</option>
            </select>
          </div>

          {/* FILTROS DE ESTADO */}
          <div className="flex gap-1 bg-[#1D2935] p-1 rounded-xl border border-slate-700">
            <button 
              onClick={() => setFiltroEstado('TODAS')} 
              className={`px-3 py-1.5 rounded-lg text-xs font-satoshi-black transition ${filtroEstado === 'TODAS' ? 'bg-[#0DE8C0] text-[#1D2935]' : 'text-slate-400 hover:text-white'}`}
            >
              Todas
            </button>
            <button 
              onClick={() => setFiltroEstado('EMITIDA')} 
              className={`px-3 py-1.5 rounded-lg text-xs font-satoshi-black transition ${filtroEstado === 'EMITIDA' ? 'bg-[#6884C5] text-white' : 'text-slate-400 hover:text-white'}`}
            >
              Emitidas
            </button>
            <button 
              onClick={() => setFiltroEstado('ANULADA')} 
              className={`px-3 py-1.5 rounded-lg text-xs font-satoshi-black transition ${filtroEstado === 'ANULADA' ? 'bg-red-600 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              Anuladas
            </button>
          </div>
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
              <th className="p-4">Dirección & Ciudad</th>
              <th className="p-4">Producto & Cant.</th>
              <th className="p-4 text-right">Monto Total</th>
              <th className="p-4 text-center">Estado</th>
              <th className="p-4 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/60 font-satoshi-regular">
            {facturasPaginadas.map((f, idx) => {
              const item = Array.isArray(f.items) && f.items.length > 0 ? f.items[0] : null;
              const isAnulada = String(f.estado || '').toUpperCase() === 'ANULADA';

              return (
                <tr key={f.id_doc || idx} className={`hover:bg-[#1D2935]/80 transition ${isAnulada ? 'bg-red-950/20' : ''}`}>
                  <td className="p-4 font-mono font-bold text-white">{f.id_factura}</td>
                  <td className="p-4 font-mono text-[#0DE8C0]">{f.orden_referencia || 'N/A'}</td>
                  <td className="p-4 font-satoshi-black text-slate-200">{f.vendedor_nombre}</td>
                  <td className="p-4">
                    <div className="font-satoshi-black text-white">{f.cliente_nombre || 'Consumidor Final'}</div>
                    <div className="text-[10px] text-slate-400">NIT: {f.cliente_nit || 'N/A'}</div>
                    <div className="text-[10px] text-[#A0AEC0]">{f.cliente_correo || 'N/A'}</div>
                  </td>
                  <td className="p-4">
                    <div className="text-slate-300 truncate max-w-xs">{f.cliente_direccion || 'N/A'}</div>
                    <div className="text-[10px] text-slate-400">{f.cliente_ciudad || 'Cali'}</div>
                  </td>
                  <td className="p-4">
                    <div className="font-satoshi-black text-slate-200 truncate max-w-xs">{item?.nombre || 'Producto E-Commerce'}</div>
                    <div className="text-[10px] text-[#0DE8C0] font-mono">Cant: {item?.cantidad || 1} u</div>
                  </td>
                  <td className="p-4 text-right font-satoshi-black text-[#0DE8C0]">{formatoCOP(f.total)}</td>
                  
                  {/* ESTADO VISUAL DE LA FACTURA */}
                  <td className="p-4 text-center">
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-satoshi-black ${
                      isAnulada 
                        ? 'bg-red-950/80 text-red-400 border border-red-800/40' 
                        : 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/40'
                    }`}>
                      {f.estado || 'EMITIDA'}
                    </span>
                  </td>

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
            {facturasPaginadas.length === 0 && (
              <tr>
                <td colSpan={9} className="p-8 text-center text-slate-400">No hay facturas registradas en este periodo. Usa el botón "Subir Archivo Masivo" para cargar tus pedidos.</td>
              </tr>
            )}
          </tbody>
        </table>

        {/* PIE DE TABLA: CONTROLES DE PAGINACIÓN DE 50 VENTAS */}
        {totalFacturasCount > 0 && (
          <div className="bg-[#1D2935] border-t border-slate-700/80 p-4 flex flex-col sm:flex-row justify-between items-center gap-3 text-xs">
            <div className="text-slate-400 font-satoshi-regular">
              Mostrando <span className="font-satoshi-black text-white">{indiceInicial + 1}</span> a <span className="font-satoshi-black text-white">{Math.min(indiceInicial + ventasPorPagina, totalFacturasCount)}</span> de <span className="font-satoshi-black text-[#0DE8C0]">{totalFacturasCount}</span> facturas
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setPaginaActual(p => Math.max(1, p - 1))}
                disabled={paginaActual === 1}
                className="px-3 py-1.5 bg-[#253443] border border-slate-700 rounded-lg text-white font-satoshi-black disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-700 transition"
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
                        {mostrarPuntos && <span className="text-slate-500 px-1">...</span>}
                        <button
                          type="button"
                          onClick={() => setPaginaActual(numPag)}
                          className={`w-7 h-7 rounded-lg text-xs font-satoshi-black transition ${
                            paginaActual === numPag
                              ? 'bg-[#0DE8C0] text-[#1D2935]'
                              : 'bg-[#253443] text-slate-300 hover:bg-slate-700'
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
                className="px-3 py-1.5 bg-[#253443] border border-slate-700 rounded-lg text-white font-satoshi-black disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-700 transition"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>

      {/* MODAL CARGA MASIVA - DISEÑO ESTRUCTURADO EN PASOS IGUAL A PRODUCTOS */}
      {showModalEcommerce && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#253443] border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl font-sans">
            <div className="flex justify-between items-center mb-6 border-b border-slate-700/60 pb-3">
              <h3 className="text-lg font-satoshi-black text-white uppercase">CARGA MASIVA DE FACTURAS</h3>
              <button onClick={() => setShowModalEcommerce(false)} className="text-slate-400 hover:text-white transition">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleProcesarCargaMasiva} className="space-y-4">
              <div>
                <label className="block text-xs font-satoshi-black text-slate-300 mb-1.5 uppercase">
                  Plataforma / Canal Predefinido
                </label>
                <select
                  className="w-full bg-[#1D2935] border border-slate-700 rounded-xl p-3 text-xs text-white font-satoshi-black focus:outline-none focus:border-[#0DE8C0]"
                  value={canalPlataforma}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setCanalPlataforma(e.target.value)}
                >
                  <option value="DROPI">Dropi Colombia</option>
                  <option value="VENDELO">Véndelo App</option>
                  <option value="MASTER">Master E-Commerce</option>
                  <option value="SHOPIFY">Shopify Store</option>
                </select>
              </div>

              {/* PASO 1: DESCARGA DE PLANTILLA */}
              <div className="bg-[#1D2935] border border-slate-700/80 rounded-xl p-4 text-xs text-slate-300 space-y-2">
                <p className="font-satoshi-black text-white">PASO 1: Descarga la plantilla estructurada</p>
                <p className="text-[11px] text-[#A0AEC0]">
                  Soporta Tipo Doc, Dirección, Ciudad, Teléfono, Responsabilidad Fiscal e IVA. Indexa clientes automáticamente en el Directorio.
                </p>
                <button 
                  type="button"
                  onClick={handleDescargarPlantilla}
                  className="bg-[#6884C5] text-white font-satoshi-black px-4 py-2 rounded-xl text-xs uppercase shadow hover:bg-[#5772b0] transition flex items-center gap-1.5"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  <span>DESCARGAR PLANTILLA CSV</span>
                </button>
              </div>

              {/* PASO 2: ADJUNTAR ARCHIVO CON ÁREA PUNTEADA */}
              <div 
                onClick={() => fileInputEcomRef.current?.click()}
                className="border-2 border-dashed border-slate-700/80 rounded-xl p-6 text-center space-y-2 bg-[#1D2935] cursor-pointer hover:border-[#0DE8C0]/60 transition"
              >
                <p className="font-satoshi-black text-xs text-white">PASO 2: Adjunta tu archivo (.csv)</p>
                <p className="text-xs text-[#A0AEC0]">
                  {archivoCSV ? `📄 ${archivoCSV.name}` : 'Seleccionar archivo Ningún archivo seleccionado'}
                </p>
                <input 
                  type="file" 
                  ref={fileInputEcomRef}
                  accept=".csv"
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setArchivoCSV(e.target.files ? e.target.files[0] : null)}
                  className="hidden"
                  required
                />
              </div>

              {/* BOTONES INFERIORES */}
              <div className="flex gap-3 pt-4 border-t border-slate-700/60">
                <button 
                  type="button" 
                  onClick={() => setShowModalEcommerce(false)}
                  className="flex-1 bg-[#1D2935] text-slate-300 font-satoshi-black py-3 rounded-xl text-xs uppercase hover:bg-slate-800 transition"
                >
                  CANCELAR
                </button>
                <button 
                  type="submit" 
                  disabled={loadingEcom || !archivoCSV}
                  className="flex-1 bg-[#0DE8C0] hover:bg-[#0bcfa8] text-[#1D2935] font-satoshi-black py-3 rounded-xl text-xs uppercase tracking-wider shadow-lg disabled:opacity-50 flex items-center justify-center gap-1.5 transition"
                >
                  {loadingEcom ? 'Procesando Carga...' : 'PROCESAR E INDEXAR'}
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
              <h2 className="font-bold text-base uppercase">FACTURA / COMPROBANTE FISCAL</h2>
              <p className="text-[10px] text-slate-600">{selectedFactura.vendedor_nombre}</p>
              <p className="text-[10px] text-slate-500">N° {selectedFactura.id_factura}</p>
              <p className="text-[10px] text-slate-500">Ref Orden: {selectedFactura.orden_referencia || 'N/A'}</p>
            </div>

            <div className="border-b border-dashed border-slate-300 pb-2 text-[10px] space-y-0.5">
              <p>CLIENTE: <span className="font-bold">{selectedFactura.cliente_nombre || 'Consumidor Final'}</span></p>
              <p>NIT/CC: {selectedFactura.cliente_nit || 'N/A'} (Tipo: {selectedFactura.cliente_tipo_doc || '13'})</p>
              <p>CORREO: {selectedFactura.cliente_correo || 'N/A'}</p>
              <p>TELÉFONO: {selectedFactura.cliente_telefono || 'N/A'}</p>
              <p>DIRECCIÓN: {selectedFactura.cliente_direccion || 'N/A'}</p>
              <p>CIUDAD: {selectedFactura.cliente_ciudad || 'Cali'}</p>
              <p>RESP. FISCAL: {selectedFactura.cliente_responsabilidad_fiscal || 'R-99-PN'}</p>
              <p>MÉTODO: {selectedFactura.metodo_pago || 'CONTRAENTREGA'}</p>
            </div>

            {/* DETALLE DE AUDITORÍA SI LA FACTURA ESTÁ ANULADA */}
            {String(selectedFactura.estado || '').toUpperCase() === 'ANULADA' && (
              <div className="bg-red-50 border border-red-200 p-2.5 rounded-xl text-[10px] space-y-0.5 text-red-800">
                <p className="font-bold uppercase">⚠️ VENTA ANULADA / REVERSADA</p>
                <p>Motivo: {selectedFactura.motivo_anulacion || 'Sin motivo especificado'}</p>
                <p>Anulado por: {selectedFactura.usuario_anulo_nombre || 'Sistema'}</p>
              </div>
            )}

            <div className="border-b border-dashed border-slate-300 pb-3">
              {Array.isArray(selectedFactura.items) && selectedFactura.items.map((it: any, i: number) => (
                <div key={i} className="flex justify-between items-start text-[11px] mb-1">
                  <div>
                    <div className="font-bold">{it.nombre}</div>
                    <div className="text-[9px] text-slate-500">Cant: {it.cantidad} x {formatoCOP(it.precio)} (IVA {it.tarifaIva || 19}%)</div>
                  </div>
                  <span className="font-bold">{formatoCOP(it.cantidad * it.precio)}</span>
                </div>
              ))}
            </div>

            <div className="space-y-1 pt-1 text-right">
              <div className="flex justify-between text-[11px] text-slate-600">
                <span>Subtotal Gravable:</span>
                <span>{formatoCOP(selectedFactura.subtotal)}</span>
              </div>
              <div className="flex justify-between text-[11px] text-slate-600">
                <span>IVA Discriminado:</span>
                <span>{formatoCOP(selectedFactura.iva_monto)}</span>
              </div>
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
